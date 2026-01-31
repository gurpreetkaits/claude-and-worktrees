<?php

namespace App\Services;

use App\Models\Todo;
use App\Models\ClaudeSession;
use App\Models\Message;
use App\Services\Claude\ClaudeExecutor;
use App\Services\Claude\MessageTypes;
use Generator;
use Illuminate\Support\Str;

class ClaudeStreamService
{
    private ?ClaudeExecutor $executor = null;

    // Batching configuration
    private const DB_BATCH_INTERVAL_SECONDS = 2;
    private const DB_BATCH_SIZE_BYTES = 5000;

    // Batching state
    private float $lastDbUpdateTime = 0;
    private int $lastDbUpdateLength = 0;

    public function __construct(
        private ClaudeProcessService $processService,
        private HookExecutorService $hookExecutor
    ) {}

    /**
     * Start a streaming session for a todo.
     *
     * @param Todo $todo The todo to stream in
     * @param string $content The user's message content
     * @param array $images Array of images with 'data' (base64) and 'mediaType' keys
     * @return Generator Yields SSE events
     */
    public function stream(Todo $todo, string $content, array $images = []): Generator
    {
        \Log::info('[SSE] Starting stream', ['todo_id' => $todo->id, 'content_length' => strlen($content)]);

        // Apply message prefix/suffix if set
        $processedContent = $this->applyMessageTransforms($todo, $content);

        // Create user message
        $userMessage = $todo->messages()->create([
            'role' => 'user',
            'content' => $content, // Store original content
        ]);

        yield $this->sseEvent('user_message', [
            'message' => $userMessage->toArray(),
        ]);

        // Run pre-command if set
        if (!empty($todo->pre_command)) {
            yield $this->sseEvent('pre_command_start', [
                'command' => $todo->pre_command,
            ]);

            $preResult = $this->processService->runPreCommand(
                $todo->worktree->path,
                $todo->pre_command
            );

            yield $this->sseEvent('pre_command_result', $preResult ?? []);

            if ($preResult && !$preResult['success']) {
                yield $this->sseEvent('error', [
                    'message' => 'Pre-command failed: ' . ($preResult['error'] ?: $preResult['output']),
                ]);
                return;
            }
        }

        // Create session
        $sessionKey = Str::uuid()->toString();
        $session = ClaudeSession::create([
            'todo_id' => $todo->id,
            'session_key' => $sessionKey,
            'status' => 'starting',
        ]);

        yield $this->sseEvent('session_started', [
            'session_key' => $sessionKey,
        ]);

        // Mark todo as running
        $todo->markAsRunning();

        // Execute task_started hooks
        $startHookResults = $this->hookExecutor->executeHooks('task_started', $todo);
        foreach ($startHookResults as $result) {
            yield $this->sseEvent('hook_executed', $result);
        }

        // Create streaming assistant message
        $assistantMessage = $todo->messages()->create([
            'role' => 'assistant',
            'content' => '',
            'is_streaming' => true,
            'stream_session_key' => $sessionKey,
        ]);

        yield $this->sseEvent('assistant_message_created', [
            'message_id' => $assistantMessage->id,
        ]);

        // Get worktree path for working directory
        $workingDirectory = $todo->worktree->path;
        $fullContent = '';
        $success = true;

        // Reset batching state for this stream
        $this->lastDbUpdateTime = microtime(true);
        $this->lastDbUpdateLength = 0;

        // Create executor with auto-approve mode for better UX
        $this->executor = new ClaudeExecutor();
        $this->executor->setPermissionMode('bypass_permissions');
        $this->executor->setAutoApproveTools([
            'Read', 'Glob', 'Grep', 'LS', 'Bash', 'Write', 'Edit',
            'WebFetch', 'WebSearch', 'Task', 'TodoRead', 'TodoWrite',
        ]);

        // Build system prompt with project context
        $systemPrompt = $this->buildSystemPrompt($todo);
        if (!empty($systemPrompt)) {
            $this->executor->setSystemPrompt($systemPrompt);
        }

        try {
            foreach ($this->executor->execute($workingDirectory, $processedContent, $session, $todo->model ?? 'sonnet', $images) as $event) {
                $sseEvent = $this->processClaudeEvent($event, $assistantMessage, $fullContent);
                if ($sseEvent !== null) {
                    yield $sseEvent;
                }
            }

            // Finalize message
            $assistantMessage->update([
                'content' => $fullContent,
                'is_streaming' => false,
            ]);

            yield $this->sseEvent('complete', [
                'message' => $assistantMessage->fresh()->toArray(),
            ]);

            // Only mark as completed if not already marked
            if ($todo->fresh()->status === 'running') {
                $todo->markAsCompleted();

                // Execute task_completed hooks
                $completedHookResults = $this->hookExecutor->executeHooks('task_completed', $todo);
                foreach ($completedHookResults as $result) {
                    yield $this->sseEvent('hook_executed', $result);
                }
            }
        } catch (\Throwable $e) {
            $success = false;
            $session->markAsFailed($e->getMessage());

            $assistantMessage->update([
                'content' => $fullContent ?: 'An error occurred while processing your request.',
                'is_streaming' => false,
                'metadata' => ['error' => $e->getMessage()],
            ]);

            $todo->markAsFailed();

            // Execute task_failed hooks
            $failedHookResults = $this->hookExecutor->executeHooks('task_failed', $todo);
            foreach ($failedHookResults as $result) {
                yield $this->sseEvent('hook_executed', $result);
            }

            yield $this->sseEvent('error', [
                'message' => $e->getMessage(),
            ]);
        }

        // Run post-command if set and streaming succeeded
        if ($success && !empty($todo->post_command)) {
            yield $this->sseEvent('post_command_start', [
                'command' => $todo->post_command,
            ]);

            $postResult = $this->processService->runPostCommand(
                $workingDirectory,
                $todo->post_command
            );

            yield $this->sseEvent('post_command_result', $postResult ?? []);
        }

        $this->executor = null;
    }

    /**
     * Interrupt the current execution.
     */
    public function interrupt(): void
    {
        if ($this->executor) {
            $this->executor->interrupt();
        }
    }

    /**
     * Build a system prompt with project context for Claude.
     */
    private function buildSystemPrompt(Todo $todo): ?string
    {
        $parts = [];

        // Add task context
        $parts[] = "You are working on a task: \"{$todo->title}\"";

        // Add worktree/project context
        if ($todo->worktree) {
            $parts[] = "Working directory: {$todo->worktree->path}";

            if ($todo->worktree->branch) {
                $parts[] = "Git branch: {$todo->worktree->branch}";
            }
        }

        // Add task-specific context if provided
        if (!empty($todo->context)) {
            $parts[] = "\nTask context:\n{$todo->context}";
        }

        // Add instructions and safety rules
        $parts[] = "\nYou have full access to the project files in this directory. You can read, search, and modify files as needed to complete the task. When the user asks about files (like PRD, README, etc.), search for them in the working directory first.";

        // Critical safety rules
        $parts[] = "\nIMPORTANT SAFETY RULES:
- NEVER run destructive database commands like: migrate:fresh, migrate:reset, db:wipe, DROP TABLE, DROP DATABASE
- NEVER delete .env files or modify database credentials
- NEVER run 'rm -rf' on directories without explicit user confirmation
- When running tests, use --no-coverage unless specifically requested
- Ask for confirmation before any potentially destructive operation";

        return implode("\n", $parts);
    }

    /**
     * Apply message prefix and suffix transforms.
     */
    private function applyMessageTransforms(Todo $todo, string $content): string
    {
        $prefix = $todo->message_prefix ?? '';
        $suffix = $todo->message_suffix ?? '';

        if (!empty($prefix)) {
            $content = $prefix . "\n\n" . $content;
        }

        if (!empty($suffix)) {
            $content = $content . "\n\n" . $suffix;
        }

        return $content;
    }

    /**
     * Process a Claude event and return appropriate SSE event.
     */
    private function processClaudeEvent(array $event, Message $message, string &$fullContent): ?string
    {
        $type = $event['type'] ?? 'unknown';

        switch ($type) {
            case 'text_delta':
                // Direct text delta from executor
                $text = $event['text'] ?? '';
                $fullContent = $event['full_content'] ?? $fullContent . $text;

                \Log::debug('[SSE] text_delta', [
                    'text_len' => strlen($text),
                    'full_len' => strlen($fullContent),
                    'preview' => substr($text, 0, 50),
                ]);

                // Batch DB updates: write every N seconds OR every N bytes (whichever comes first)
                $now = microtime(true);
                $timeSinceLastUpdate = $now - $this->lastDbUpdateTime;
                $bytesSinceLastUpdate = strlen($fullContent) - $this->lastDbUpdateLength;

                if ($timeSinceLastUpdate >= self::DB_BATCH_INTERVAL_SECONDS ||
                    $bytesSinceLastUpdate >= self::DB_BATCH_SIZE_BYTES) {
                    $message->update(['content' => $fullContent]);
                    $this->lastDbUpdateTime = $now;
                    $this->lastDbUpdateLength = strlen($fullContent);
                }

                return $this->sseEvent('text_delta', [
                    'text' => $text,
                    'full_content' => $fullContent,
                ]);

            case MessageTypes::TYPE_ASSISTANT:
                // Full assistant message (for partial updates)
                $thinking = $event['thinking'] ?? '';

                // Handle thinking (if present)
                if (!empty($thinking)) {
                    return $this->sseEvent('thinking', [
                        'content' => $thinking,
                    ]);
                }

                // Tool uses are handled via TYPE_TOOL_USE events
                return null;

            case MessageTypes::TYPE_TOOL_USE:
                return $this->sseEvent('tool_use', [
                    'id' => $event['tool_use_id'] ?? null,
                    'tool' => $event['name'] ?? 'unknown',
                    'input' => $event['input'] ?? [],
                ]);

            case MessageTypes::TYPE_TOOL_RESULT:
                return $this->sseEvent('tool_result', [
                    'tool_use_id' => $event['tool_use_id'] ?? null,
                    'content' => $event['content'] ?? '',
                    'is_error' => $event['is_error'] ?? false,
                ]);

            case MessageTypes::TYPE_RESULT:
                // Final result
                $result = $event['result'] ?? null;
                if ($result && is_string($result) && !empty($result)) {
                    $fullContent = $result;
                    $message->update(['content' => $fullContent]);
                }

                return $this->sseEvent('result', [
                    'result' => $result,
                    'cost_usd' => $event['cost_usd'] ?? null,
                    'duration_ms' => $event['duration_ms'] ?? null,
                    'is_error' => $event['is_error'] ?? false,
                    'session_id' => $event['session_id'] ?? null,
                ]);

            case MessageTypes::TYPE_SYSTEM:
                return $this->sseEvent('system', [
                    'session_id' => $event['session_id'] ?? null,
                    'tools' => $event['tools'] ?? [],
                ]);

            case 'permission_request':
                return $this->sseEvent('permission_request', [
                    'request_id' => $event['request_id'],
                    'tool' => $event['tool'] ?? null,
                    'input' => $event['input'] ?? [],
                ]);

            case 'permission_auto_approved':
                return $this->sseEvent('permission_approved', [
                    'request_id' => $event['request_id'],
                    'tool' => $event['tool'] ?? null,
                    'auto' => true,
                ]);

            case 'permission_denied':
                return $this->sseEvent('permission_denied', [
                    'request_id' => $event['request_id'],
                    'tool' => $event['tool'] ?? null,
                    'reason' => $event['reason'] ?? 'Blocked for safety',
                ]);

            case 'debug':
                return $this->sseEvent('debug', [
                    'content' => $event['content'] ?? '',
                ]);

            case 'raw':
                $text = $event['content'] ?? '';
                if (!empty($text)) {
                    $fullContent .= $text;
                    return $this->sseEvent('text_delta', [
                        'text' => $text,
                        'full_content' => $fullContent,
                    ]);
                }
                break;

            case 'error':
                return $this->sseEvent('error', [
                    'message' => $event['message'] ?? 'Unknown error',
                ]);
        }

        return null;
    }

    /**
     * Format an SSE event.
     */
    private function sseEvent(string $event, array $data): string
    {
        $json = json_encode($data);
        return "event: {$event}\ndata: {$json}\n\n";
    }
}
