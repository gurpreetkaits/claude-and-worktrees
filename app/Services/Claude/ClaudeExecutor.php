<?php

namespace App\Services\Claude;

use App\Models\ClaudeSession;
use App\Models\Todo;
use Generator;
use Symfony\Component\Process\Process;

/**
 * Claude Code executor with bidirectional protocol support.
 * Manages the full lifecycle of a Claude Code process.
 */
class ClaudeExecutor
{
    private ?Process $process = null;
    private ?Protocol $protocol = null;
    private ?string $sessionId = null;
    private bool $interrupted = false;

    private array $autoApproveTools = [
        'Read',
        'Glob',
        'Grep',
        'LS',
    ];

    private string $permissionMode = 'default';
    private ?string $systemPrompt = null;

    /**
     * Set permission mode for this execution.
     */
    public function setPermissionMode(string $mode): self
    {
        $this->permissionMode = $mode;
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
        $command = $this->buildCommand($model);
        $this->process = new Process($command, $workingDirectory);
        $this->process->setTimeout(config('claude.process_timeout'));
        $this->process->start(function ($type, $buffer) {});

        $pid = $this->process->getPid();
        $session->update(['process_id' => (string) $pid]);
        $session->markAsRunning();
        $this->protocol = new Protocol($this->process);
        $pipes = $this->process->getInput();

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

        $process = proc_open($command, $descriptors, $pipes, $workingDirectory, $env);

        if (!is_resource($process)) {
            throw new \RuntimeException('Failed to start Claude process');
        }

        [$stdin, $stdout, $stderr] = $pipes;
        stream_set_blocking($stdout, false);
        stream_set_blocking($stderr, false);

        $status = proc_get_status($process);
        $session->update(['process_id' => (string) $status['pid']]);

        $initializeRequest = json_encode([
            'type' => 'control_request',
            'request_id' => uniqid('init_'),
            'request' => [
                'subtype' => 'initialize',
                'hooks' => new \stdClass(),
            ],
        ]) . "\n";
        fwrite($stdin, $initializeRequest);
        fflush($stdin);

        $permissionModeRequest = json_encode([
            'type' => 'control_request',
            'request_id' => uniqid('perm_'),
            'request' => [
                'subtype' => 'set_permission_mode',
                'mode' => 'bypassPermissions',
            ],
        ]) . "\n";
        fwrite($stdin, $permissionModeRequest);
        fflush($stdin);

        // Build message content - use array format if images are present
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

                    if ($parsed['type'] === MessageTypes::CONTROL_REQUEST) {
                        $response = $this->handleControlRequest($parsed, $stdin);
                        if ($response !== null) {
                            yield $response;
                        }
                        continue;
                    }

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

                    if ($parsed['type'] === MessageTypes::TYPE_ASSISTANT) {
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

                    if ($parsed['type'] === MessageTypes::TYPE_RESULT) {
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

                if ($this->interrupted) {
                    $interruptMsg = json_encode(['type' => 'interrupt']) . "\n";
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
     * Check if a Bash command contains dangerous patterns.
     * Returns the matched pattern if dangerous, null otherwise.
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

        if ($requestType === 'hook_callback') {
            return $this->handleHookCallback($request, $stdin);
        }

        if ($tool === 'Bash' && isset($input['command'])) {
            $command = $input['command'];
            $dangerousPattern = $this->isDangerousCommand($command);

            if ($dangerousPattern !== null) {
                \Log::warning('Blocked dangerous command', [
                    'command' => substr($command, 0, 200),
                    'pattern' => $dangerousPattern,
                ]);

                $response = json_encode([
                    'type' => 'control_response',
                    'subtype' => 'error',
                    'request_id' => $requestId,
                    'response' => [
                        'behavior' => 'deny',
                        'message' => 'This command has been blocked for safety reasons. Destructive commands like database wipes, recursive deletions, and system modifications are not allowed.',
                    ],
                ]) . "\n";
                fwrite($stdin, $response);
                fflush($stdin);

                return [
                    'type' => 'permission_denied',
                    'request_id' => $requestId,
                    'tool' => $tool,
                    'reason' => 'Dangerous command blocked',
                ];
            }
        }

        if (in_array($tool, ['Write', 'Edit']) && isset($input['file_path'])) {
            $filePath = $input['file_path'];

            if ($this->isProtectedPath($filePath)) {
                \Log::warning('Blocked write to protected file', [
                    'file_path' => $filePath,
                    'tool' => $tool,
                ]);

                $response = json_encode([
                    'type' => 'control_response',
                    'subtype' => 'error',
                    'request_id' => $requestId,
                    'response' => [
                        'behavior' => 'deny',
                        'message' => "Cannot modify protected file: {$filePath}. This file is protected for safety reasons.",
                    ],
                ]) . "\n";
                fwrite($stdin, $response);
                fflush($stdin);

                return [
                    'type' => 'permission_denied',
                    'request_id' => $requestId,
                    'tool' => $tool,
                    'reason' => 'Protected file',
                ];
            }
        }

        $readOnlyTools = ['Read', 'Glob', 'Grep', 'LS', 'NotebookRead', 'Task', 'WebFetch', 'WebSearch'];
        $shouldAutoApprove = $tool !== null && (
            in_array($tool, $this->autoApproveTools) ||
            in_array($tool, $readOnlyTools) ||
            $this->permissionMode === 'bypass' ||
            $this->permissionMode === 'bypass_permissions'
        );

        if ($shouldAutoApprove) {
            $response = json_encode([
                'type' => 'control_response',
                'subtype' => 'success',
                'request_id' => $requestId,
                'response' => [
                    'behavior' => 'allow',
                    'updatedInput' => $input,
                ],
            ]) . "\n";
            fwrite($stdin, $response);
            fflush($stdin);

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

        $response = json_encode([
            'type' => 'control_response',
            'subtype' => 'success',
            'request_id' => $requestId,
            'response' => [
                'hookSpecificOutput' => [
                    'hookEventName' => 'PreToolUse',
                    'permissionDecision' => 'allow',
                    'permissionDecisionReason' => 'Auto-approved by SDK',
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

        $command[] = '--permission-prompt-tool=stdio';
        $command[] = '--permission-mode=bypassPermissions';

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

        return $env;
    }

    /**
     * Build message content, including images if present.
     *
     * @param string $prompt The text prompt
     * @param array $images Array of images with 'data' (base64) and 'mediaType' keys
     * @return string|array String if no images, array of content blocks if images present
     */
    private function buildMessageContent(string $prompt, array $images): string|array
    {
        if (empty($images)) {
            return $prompt;
        }

        // Build content array with images first, then text
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

        // Add text content
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
            $this->process->signal(15); // SIGTERM
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
