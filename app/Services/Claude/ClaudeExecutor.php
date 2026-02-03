<?php

namespace App\Services\Claude;

use App\Models\ClaudeSession;
use App\Models\McpServer;
use App\Models\Todo;
use Generator;
use Symfony\Component\Process\Process;

/**
 * Claude Code executor with bidirectional protocol support.
 * Manages the full lifecycle of a Claude Code process.
 *
 * Based on the protocol from @anthropic-ai/claude-code:
 * - Uses --input-format=stream-json for bidirectional communication
 * - Uses --output-format=stream-json for streaming responses
 * - Uses --permission-prompt-tool=stdio for permission control
 */
class ClaudeExecutor
{
    private ?Process $process = null;
    private ?Protocol $protocol = null;
    private ?string $sessionId = null;
    private bool $interrupted = false;

    // Tools to auto-approve (safe read-only tools)
    private array $autoApproveTools = [
        'Read',
        'Glob',
        'Grep',
        'LS',
    ];

    // Permission modes: default, plan, acceptEdits, bypassPermissions
    private string $permissionMode = 'bypassPermissions';
    private ?string $systemPrompt = null;

    // Resume session support
    private ?string $resumeSessionId = null;
    private ?string $resumeMessageUuid = null;

    /**
     * Set permission mode for this execution.
     * Valid modes: default, plan, acceptEdits, bypassPermissions
     */
    public function setPermissionMode(string $mode): self
    {
        $this->permissionMode = match ($mode) {
            'bypass', 'bypass_permissions' => 'bypassPermissions',
            'accept_edits' => 'acceptEdits',
            default => $mode,
        };
        return $this;
    }

    /**
     * Set system prompt to append to Claude's default system prompt.
     */
    public function setSystemPrompt(?string $prompt): self
    {
        $this->systemPrompt = $prompt;
        return $this;
    }

    /**
     * Set tools to auto-approve.
     */
    public function setAutoApproveTools(array $tools): self
    {
        $this->autoApproveTools = $tools;
        return $this;
    }

    /**
     * Set session to resume from (for follow-up conversations).
     */
    public function setResumeSession(?string $sessionId, ?string $messageUuid = null): self
    {
        $this->resumeSessionId = $sessionId;
        $this->resumeMessageUuid = $messageUuid;
        return $this;
    }

    /**
     * Execute Claude Code and stream results.
     *
     * @param string $workingDirectory Working directory for Claude
     * @param string $prompt User prompt to send
     * @param ClaudeSession $session Session to track
     * @param string $model Claude model to use
     * @param array $images Array of images with 'data' (base64) and 'mediaType' keys
     * @return Generator Yields normalized messages
     */
    public function execute(
        string $workingDirectory,
        string $prompt,
        ClaudeSession $session,
        string $model = 'sonnet',
        array $images = []
    ): Generator {
        yield from $this->runWithBidirectionalIO($workingDirectory, $prompt, $session, $model, $images);
    }

    /**
     * Run with bidirectional I/O using proc_open.
     */
    private function runWithBidirectionalIO(
        string $workingDirectory,
        string $prompt,
        ClaudeSession $session,
        string $model,
        array $images = []
    ): Generator {
        $command = implode(' ', $this->buildCommand($model));

        $descriptors = [
            0 => ['pipe', 'r'],  // stdin
            1 => ['pipe', 'w'],  // stdout
            2 => ['pipe', 'w'],  // stderr
        ];

        $env = $this->getEnvironment();

        \Log::info('[Claude] Starting process', [
            'command' => $command,
            'working_dir' => $workingDirectory,
            'resume_session' => $this->resumeSessionId,
        ]);

        $process = proc_open($command, $descriptors, $pipes, $workingDirectory, $env);

        if (!is_resource($process)) {
            throw new \RuntimeException('Failed to start Claude process');
        }

        [$stdin, $stdout, $stderr] = $pipes;
        stream_set_blocking($stdout, false);
        stream_set_blocking($stderr, false);

        $status = proc_get_status($process);
        $session->update(['process_id' => (string) $status['pid']]);

        // Wait briefly for process to initialize and check if it crashed
        usleep(100000); // 100ms
        $status = proc_get_status($process);
        if (!$status['running']) {
            // Process crashed immediately - read stderr for error message
            $errorOutput = stream_get_contents($stderr);
            $stdOutput = stream_get_contents($stdout);
            fclose($stdin);
            fclose($stdout);
            fclose($stderr);
            proc_close($process);

            \Log::error('[Claude] Process crashed immediately', [
                'exit_code' => $status['exitcode'],
                'stderr' => $errorOutput,
                'stdout' => $stdOutput,
            ]);

            throw new \RuntimeException(
                'Claude process crashed: ' . ($errorOutput ?: $stdOutput ?: 'Unknown error (exit code: ' . $status['exitcode'] . ')')
            );
        }

        // Step 1: Send initialize request with hooks
        $initializeRequest = $this->buildInitializeRequest();
        fwrite($stdin, $initializeRequest);
        fflush($stdin);

        // Step 2: Set permission mode
        $permissionModeRequest = $this->buildSetPermissionModeRequest();
        fwrite($stdin, $permissionModeRequest);
        fflush($stdin);

        // Step 3: Send user message
        $messageContent = $this->buildMessageContent($prompt, $images);
        $userMessage = json_encode([
            'type' => 'user',
            'message' => [
                'role' => 'user',
                'content' => $messageContent,
            ],
        ]) . "\n";
        fwrite($stdin, $userMessage);
        fflush($stdin);

        $buffer = '';
        $errorBuffer = '';
        $fullContent = '';
        $lastPartialContent = '';

        try {
            while (true) {
                $status = proc_get_status($process);

                if (!$status['running'] && empty($buffer)) {
                    break;
                }

                $output = fread($stdout, 8192);
                if ($output !== false && $output !== '') {
                    $buffer .= $output;
                }

                $error = fread($stderr, 8192);
                if ($error !== false && $error !== '') {
                    $errorBuffer .= $error;

                    while (($pos = strpos($errorBuffer, "\n")) !== false) {
                        $line = substr($errorBuffer, 0, $pos);
                        $errorBuffer = substr($errorBuffer, $pos + 1);

                        if (!empty(trim($line))) {
                            yield [
                                'type' => 'debug',
                                'content' => $line,
                            ];
                        }
                    }
                }

                while (($pos = strpos($buffer, "\n")) !== false) {
                    $line = substr($buffer, 0, $pos);
                    $buffer = substr($buffer, $pos + 1);

                    if (empty(trim($line))) {
                        continue;
                    }

                    $parsed = MessageTypes::parse($line);

                    if ($parsed === null) {
                        continue;
                    }

                    // Handle system message - extract session ID
                    if ($parsed['type'] === MessageTypes::TYPE_SYSTEM) {
                        $claudeSessionId = $parsed['session_id'] ?? null;
                        if ($claudeSessionId) {
                            $session->setClaudeSessionId($claudeSessionId);
                            $this->sessionId = $claudeSessionId;
                        }
                        yield $parsed;
                        continue;
                    }

                    // Handle control requests (permissions, hooks)
                    if ($parsed['type'] === MessageTypes::CONTROL_REQUEST) {
                        $response = $this->handleControlRequest($parsed, $stdin);
                        if ($response !== null) {
                            yield $response;
                        }
                        continue;
                    }

                    // Handle stream events (text deltas)
                    if ($parsed['type'] === MessageTypes::TYPE_STREAM_EVENT) {
                        $textDelta = $parsed['text_delta'] ?? '';
                        if (!empty($textDelta)) {
                            $fullContent .= $textDelta;

                            yield [
                                'type' => 'text_delta',
                                'text' => $textDelta,
                                'full_content' => $fullContent,
                            ];
                        }
                        continue;
                    }

                    // Handle assistant messages (partial updates)
                    if ($parsed['type'] === MessageTypes::TYPE_ASSISTANT) {
                        // Track message UUID for resume
                        $uuid = $parsed['uuid'] ?? null;
                        if ($uuid) {
                            $session->setLastMessageUuid($uuid);
                        }

                        $content = $parsed['content'] ?? '';
                        $delta = '';
                        if (strlen($content) > strlen($lastPartialContent)) {
                            $delta = substr($content, strlen($lastPartialContent));
                        } elseif ($content !== $lastPartialContent) {
                            $delta = $content;
                        }

                        $lastPartialContent = $content;
                        $fullContent = $content;

                        if (!empty($delta)) {
                            yield [
                                'type' => 'text_delta',
                                'text' => $delta,
                                'full_content' => $fullContent,
                            ];
                        }

                        foreach ($parsed['tool_uses'] ?? [] as $toolUse) {
                            yield [
                                'type' => MessageTypes::TYPE_TOOL_USE,
                                'tool_use_id' => $toolUse['id'],
                                'name' => $toolUse['name'],
                                'input' => $toolUse['input'],
                            ];
                        }

                        continue;
                    }

                    // Handle user messages (track UUID)
                    if ($parsed['type'] === MessageTypes::TYPE_USER) {
                        $uuid = $parsed['uuid'] ?? null;
                        if ($uuid) {
                            $session->setLastMessageUuid($uuid);
                        }
                        yield $parsed;
                        continue;
                    }

                    // Handle final result
                    if ($parsed['type'] === MessageTypes::TYPE_RESULT) {
                        // Store cost and duration
                        $session->setResultMetrics(
                            $parsed['cost_usd'] ?? null,
                            $parsed['duration_ms'] ?? null
                        );

                        yield $parsed;

                        if (!($parsed['is_error'] ?? false)) {
                            $session->markAsCompleted();
                        } else {
                            $session->markAsFailed($parsed['result'] ?? 'Unknown error');
                        }
                        break 2;
                    }

                    yield $parsed;
                }

                // Handle interrupt
                if ($this->interrupted) {
                    $interruptMsg = json_encode([
                        'type' => 'control_request',
                        'request_id' => uniqid('int_'),
                        'request' => [
                            'subtype' => 'interrupt',
                        ],
                    ]) . "\n";
                    fwrite($stdin, $interruptMsg);
                    fflush($stdin);
                    $this->interrupted = false;
                }

                usleep(10000);
            }
        } finally {
            fclose($stdin);
            fclose($stdout);
            fclose($stderr);

            $exitCode = proc_close($process);

            if ($session->status === 'running') {
                if ($exitCode === 0) {
                    $session->markAsCompleted();
                } elseif ($exitCode === 143 || $exitCode === -15) {
                    $session->markAsCancelled();
                } else {
                    $session->markAsFailed("Process exited with code: {$exitCode}");
                }
            }
        }
    }

    /**
     * Build initialize request with hooks configuration.
     */
    private function buildInitializeRequest(): string
    {
        $hooks = new \stdClass();

        // Add PreToolUse hooks for permission control if not bypassing
        if ($this->permissionMode !== 'bypassPermissions') {
            $hooks->PreToolUse = [
                [
                    'matcher' => '^(?!(Glob|Grep|Read|Task)$).*',
                    'hookCallbackIds' => ['tool_approval'],
                ],
            ];
        }

        return json_encode([
            'type' => 'control_request',
            'request_id' => uniqid('init_'),
            'request' => [
                'subtype' => 'initialize',
                'hooks' => $hooks,
            ],
        ]) . "\n";
    }

    /**
     * Build set permission mode request.
     */
    private function buildSetPermissionModeRequest(): string
    {
        return json_encode([
            'type' => 'control_request',
            'request_id' => uniqid('perm_'),
            'request' => [
                'subtype' => 'set_permission_mode',
                'mode' => $this->permissionMode,
            ],
        ]) . "\n";
    }

    /**
     * Check if a Bash command contains dangerous patterns.
     */
    private function isDangerousCommand(string $command): ?string
    {
        $patterns = config('claude-safety.dangerous_patterns', []);

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $command)) {
                return $pattern;
            }
        }

        $protectedDirs = config('claude-safety.protected_directories', []);
        foreach ($protectedDirs as $dir) {
            if (preg_match('/\brm\s+.*' . preg_quote($dir, '/') . '/i', $command)) {
                return "Protected directory: {$dir}";
            }
        }

        return null;
    }

    /**
     * Check if a file path is protected from modification.
     */
    private function isProtectedPath(string $path): bool
    {
        $protectedPaths = config('claude-safety.protected_paths', []);
        $filename = basename($path);

        foreach ($protectedPaths as $protected) {
            if ($filename === $protected || str_ends_with($path, '/' . $protected)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Handle a control request from Claude (permission request).
     */
    private function handleControlRequest(array $request, $stdin): ?array
    {
        $requestId = $request['request_id'];
        $requestType = $request['request_type'] ?? 'unknown';
        $tool = $request['tool'] ?? null;
        $input = $request['input'] ?? [];

        // Handle hook callbacks
        if ($requestType === 'hook_callback') {
            return $this->handleHookCallback($request, $stdin);
        }

        // Safety checks for Bash commands
        if ($tool === 'Bash' && isset($input['command'])) {
            $command = $input['command'];
            $dangerousPattern = $this->isDangerousCommand($command);

            if ($dangerousPattern !== null) {
                \Log::warning('Blocked dangerous command', [
                    'command' => substr($command, 0, 200),
                    'pattern' => $dangerousPattern,
                ]);

                $this->sendDenyResponse($stdin, $requestId, 'This command has been blocked for safety reasons.');

                return [
                    'type' => 'permission_denied',
                    'request_id' => $requestId,
                    'tool' => $tool,
                    'reason' => 'Dangerous command blocked',
                ];
            }
        }

        // Safety checks for file writes
        if (in_array($tool, ['Write', 'Edit']) && isset($input['file_path'])) {
            $filePath = $input['file_path'];

            if ($this->isProtectedPath($filePath)) {
                \Log::warning('Blocked write to protected file', [
                    'file_path' => $filePath,
                    'tool' => $tool,
                ]);

                $this->sendDenyResponse($stdin, $requestId, "Cannot modify protected file: {$filePath}");

                return [
                    'type' => 'permission_denied',
                    'request_id' => $requestId,
                    'tool' => $tool,
                    'reason' => 'Protected file',
                ];
            }
        }

        // Auto-approve logic
        $readOnlyTools = ['Read', 'Glob', 'Grep', 'LS', 'NotebookRead', 'Task', 'WebFetch', 'WebSearch'];
        $shouldAutoApprove = $tool !== null && (
            in_array($tool, $this->autoApproveTools) ||
            in_array($tool, $readOnlyTools) ||
            $this->permissionMode === 'bypassPermissions'
        );

        if ($shouldAutoApprove) {
            $this->sendAllowResponse($stdin, $requestId, $input);

            return [
                'type' => 'permission_auto_approved',
                'request_id' => $requestId,
                'tool' => $tool,
            ];
        }

        return [
            'type' => 'permission_request',
            'request_id' => $requestId,
            'request_type' => $requestType,
            'tool' => $tool,
            'input' => $input,
        ];
    }

    /**
     * Handle hook callback requests (PreToolUse, Stop, etc.)
     */
    private function handleHookCallback(array $request, $stdin): ?array
    {
        $requestId = $request['request_id'];
        $callbackId = $request['raw_request']['callback_id'] ?? 'unknown';

        // Auto-approve hooks in bypass mode
        $response = json_encode([
            'type' => 'control_response',
            'response' => [
                'subtype' => 'success',
                'request_id' => $requestId,
                'response' => [
                    'hookSpecificOutput' => [
                        'hookEventName' => 'PreToolUse',
                        'permissionDecision' => 'allow',
                        'permissionDecisionReason' => 'Auto-approved by SDK',
                    ],
                ],
            ],
        ]) . "\n";
        fwrite($stdin, $response);
        fflush($stdin);

        return [
            'type' => 'hook_auto_approved',
            'request_id' => $requestId,
            'callback_id' => $callbackId,
        ];
    }

    /**
     * Send allow response for permission request.
     */
    private function sendAllowResponse($stdin, string $requestId, array $input): void
    {
        $response = json_encode([
            'type' => 'control_response',
            'response' => [
                'subtype' => 'success',
                'request_id' => $requestId,
                'response' => [
                    'behavior' => 'allow',
                    'updatedInput' => $input,
                ],
            ],
        ]) . "\n";
        fwrite($stdin, $response);
        fflush($stdin);
    }

    /**
     * Send deny response for permission request.
     */
    private function sendDenyResponse($stdin, string $requestId, string $message): void
    {
        $response = json_encode([
            'type' => 'control_response',
            'response' => [
                'subtype' => 'success',
                'request_id' => $requestId,
                'response' => [
                    'behavior' => 'deny',
                    'message' => $message,
                ],
            ],
        ]) . "\n";
        fwrite($stdin, $response);
        fflush($stdin);
    }

    /**
     * Build the Claude CLI command.
     */
    private function buildCommand(string $model = 'sonnet'): array
    {
        $command = [config('claude.command')];
        $packageParts = explode(' ', config('claude.package'));
        foreach ($packageParts as $part) {
            if (!empty(trim($part))) {
                $command[] = trim($part);
            }
        }

        foreach (config('claude.flags') as $flag) {
            $command[] = $flag;
        }

        // Add permission prompt tool for bidirectional protocol
        $command[] = '--permission-prompt-tool=stdio';
        $command[] = '--permission-mode=' . $this->permissionMode;

        // Add resume flag if we have a session to resume
        if (!empty($this->resumeSessionId)) {
            $command[] = '--resume';
            $command[] = $this->resumeSessionId;

            // If we want to reset to a specific message
            if (!empty($this->resumeMessageUuid)) {
                $command[] = '--resume-session-at';
                $command[] = $this->resumeMessageUuid;
            }
        }

        $disallowed = config('claude.disallowed_tools');
        if (!empty($disallowed)) {
            $command[] = "--disallowedTools={$disallowed}";
        }

        $models = config('claude.models');
        if (isset($models[$model])) {
            $command[] = $models[$model]['flag'];
        }

        if (!empty($this->systemPrompt)) {
            $command[] = '--append-system-prompt';
            $command[] = escapeshellarg($this->systemPrompt);
        }

        return $command;
    }

    /**
     * Get environment variables for the process.
     */
    private function getEnvironment(): array
    {
        $env = getenv();
        $env['NPM_CONFIG_LOGLEVEL'] = 'error';

        // Ensure HOME is set correctly for Claude's OAuth authentication
        if (empty($env['HOME'])) {
            $env['HOME'] = posix_getpwuid(posix_getuid())['dir'] ?? '/tmp';
        }

        // Ensure common binary paths are in PATH for PHP's process
        $home = $env['HOME'];
        $additionalPaths = [
            '/opt/homebrew/bin',
            '/usr/local/bin',
            '/usr/bin',
            $home . '/.nvm/versions/node/v20.19.4/bin',
            $home . '/.local/bin',
        ];

        $currentPath = $env['PATH'] ?? '/usr/bin:/bin';
        $env['PATH'] = implode(':', array_filter($additionalPaths)) . ':' . $currentPath;

        \Log::debug('[Claude] Environment', [
            'HOME' => $env['HOME'],
            'PATH' => substr($env['PATH'], 0, 200) . '...',
        ]);

        return $env;
    }

    /**
     * Build message content, including images if present.
     */
    private function buildMessageContent(string $prompt, array $images): string|array
    {
        if (empty($images)) {
            return $prompt;
        }

        $content = [];

        foreach ($images as $image) {
            $content[] = [
                'type' => 'image',
                'source' => [
                    'type' => 'base64',
                    'media_type' => $image['mediaType'],
                    'data' => $image['data'],
                ],
            ];
        }

        if (!empty($prompt)) {
            $content[] = [
                'type' => 'text',
                'text' => $prompt,
            ];
        }

        return $content;
    }

    /**
     * Interrupt the running process.
     */
    public function interrupt(): void
    {
        $this->interrupted = true;
    }

    /**
     * Cancel the process with SIGTERM.
     */
    public function cancel(): bool
    {
        if ($this->process && $this->process->isRunning()) {
            $this->process->signal(15);
            return true;
        }

        return false;
    }

    /**
     * Get the session ID if available.
     */
    public function getSessionId(): ?string
    {
        return $this->sessionId;
    }
}
