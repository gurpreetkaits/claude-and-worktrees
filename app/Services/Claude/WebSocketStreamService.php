<?php

namespace App\Services\Claude;

use App\Events\ClaudeStreamEvent;
use App\Models\ClaudeSession;
use App\Models\Message;
use App\Models\QueuedMessage;
use App\Models\Todo;
use App\Services\Claude\MessageTypes;
use App\Services\ClaudeProcessService;
use App\Services\TaskManager;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * WebSocket-based streaming service for Claude Code.
 * Uses Laravel Broadcasting to send events via Reverb WebSocket.
 */
class WebSocketStreamService
{
    public function __construct(
        private ClaudeProcessService $processService
    ) {}

    /**
     * Start a WebSocket streaming session for a todo.
     * Events are broadcast via Laravel Broadcasting instead of SSE.
     *
     * @param Todo $todo The todo to stream in
     * @param string $content The user's message content
     * @param array $images Array of images with 'data' (base64) and 'mediaType' keys
     */
    public function stream(Todo $todo, string $content, array $images = []): void
    {
        // Apply message prefix/suffix if set
        $processedContent = $this->applyMessageTransforms($todo, $content);

        // Create user message
        $userMessage = $todo->messages()->create([
            'role' => 'user',
            'content' => $content,
        ]);

        $this->broadcast($todo->id, 'user_message', [
            'message' => $userMessage->toArray(),
        ]);

        // Run pre-command if set
        if (!empty($todo->pre_command)) {
            $this->broadcast($todo->id, 'pre_command_start', [
                'command' => $todo->pre_command,
            ]);

            $preResult = $this->processService->runPreCommand(
                $todo->worktree->path,
                $todo->pre_command
            );

            $this->broadcast($todo->id, 'pre_command_result', $preResult ?? []);

            if ($preResult && !$preResult['success']) {
                $this->broadcast($todo->id, 'error', [
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

        $this->broadcast($todo->id, 'session_started', [
            'session_key' => $sessionKey,
        ]);

        // Mark todo as running
        $todo->markAsRunning();

        // Create streaming assistant message
        $assistantMessage = $todo->messages()->create([
            'role' => 'assistant',
            'content' => '',
            'is_streaming' => true,
            'stream_session_key' => $sessionKey,
        ]);

        $this->broadcast($todo->id, 'assistant_message_created', [
            'message_id' => $assistantMessage->id,
        ]);

        // Get worktree path for working directory
        $workingDirectory = $todo->worktree->path;
        $fullContent = '';
        $success = true;

        // Create executor with auto-approve mode
        $executor = new ClaudeExecutor();
        $executor->setPermissionMode('bypass_permissions');
        $executor->setAutoApproveTools([
            'Read', 'Glob', 'Grep', 'LS', 'Bash', 'Write', 'Edit',
            'WebFetch', 'WebSearch', 'Task', 'TodoRead', 'TodoWrite',
        ]);

        try {
            foreach ($executor->execute($workingDirectory, $processedContent, $session, $todo->model ?? 'sonnet', $images) as $event) {
                $this->processAndBroadcast($todo->id, $event, $assistantMessage, $fullContent);
            }

            // Finalize message
            $assistantMessage->update([
                'content' => $fullContent,
                'is_streaming' => false,
            ]);

            $this->broadcast($todo->id, 'complete', [
                'message' => $assistantMessage->fresh()->toArray(),
            ]);

            if ($todo->fresh()->status === 'running') {
                $todo->markAsCompleted();
            }
        } catch (\Throwable $e) {
            $success = false;
            $session->markAsFailed($e->getMessage());

            $assistantMessage->update([
                'content' => $fullContent ?: 'An error occurred.',
                'is_streaming' => false,
                'metadata' => ['error' => $e->getMessage()],
            ]);

            $todo->markAsFailed();

            $this->broadcast($todo->id, 'error', [
                'message' => $e->getMessage(),
            ]);
        }

        // Run post-command if set and streaming succeeded
        if ($success && !empty($todo->post_command)) {
            $this->broadcast($todo->id, 'post_command_start', [
                'command' => $todo->post_command,
            ]);

            $postResult = $this->processService->runPostCommand(
                $workingDirectory,
                $todo->post_command
            );

            $this->broadcast($todo->id, 'post_command_result', $postResult ?? []);
        }
    }

    /**
     * Stream with cancellation support for parallel execution.
     * Implements VK-style cancellation token pattern.
     *
     * @param Todo $todo The todo to stream in
     * @param string $content The user's message content
     * @param array $images Array of images with 'data' (base64) and 'mediaType' keys
     * @param callable $isCancelled Callback that returns true if cancellation was requested
     * @param bool $isAutonomousMessage Whether this is an auto-generated autonomous message
     * @return string The final content from the assistant response
     */
    public function streamWithCancellation(Todo $todo, string $content, array $images = [], callable $isCancelled = null, bool $isAutonomousMessage = false): string
    {
        // Apply message prefix/suffix if set (skip for autonomous auto-generated messages)
        $processedContent = $isAutonomousMessage ? $content : $this->applyMessageTransforms($todo, $content);

        // Create user message
        $messageData = [
            'role' => 'user',
            'content' => $content,
        ];
        if ($isAutonomousMessage) {
            $messageData['metadata'] = json_encode(['autonomous' => true]);
        }
        $userMessage = $todo->messages()->create($messageData);

        $this->broadcast($todo->id, 'user_message', [
            'message' => $userMessage->toArray(),
        ]);

        // Check cancellation before pre-command
        if ($isCancelled && $isCancelled()) {
            Log::info("[WebSocketStreamService] Cancelled before pre-command for todo {$todo->id}");
            $this->broadcast($todo->id, 'cancelled', ['message' => 'Task was cancelled']);
            return '';
        }

        // Run pre-command if set (skip for autonomous auto-generated messages)
        if (!$isAutonomousMessage && !empty($todo->pre_command)) {
            $this->broadcast($todo->id, 'pre_command_start', [
                'command' => $todo->pre_command,
            ]);

            $preResult = $this->processService->runPreCommand(
                $todo->worktree->path,
                $todo->pre_command
            );

            $this->broadcast($todo->id, 'pre_command_result', $preResult ?? []);

            if ($preResult && !$preResult['success']) {
                $this->broadcast($todo->id, 'error', [
                    'message' => 'Pre-command failed: ' . ($preResult['error'] ?: $preResult['output']),
                ]);
                return '';
            }
        }

        // Create session
        $sessionKey = Str::uuid()->toString();
        $session = ClaudeSession::create([
            'todo_id' => $todo->id,
            'session_key' => $sessionKey,
            'status' => 'starting',
        ]);

        // Register execution with TaskManager
        TaskManager::registerExecution($todo->id, $sessionKey);

        $this->broadcast($todo->id, 'session_started', [
            'session_key' => $sessionKey,
        ]);

        // Mark todo as running
        $todo->markAsRunning();

        // Create streaming assistant message
        $assistantMessage = $todo->messages()->create([
            'role' => 'assistant',
            'content' => '',
            'is_streaming' => true,
            'stream_session_key' => $sessionKey,
        ]);

        $this->broadcast($todo->id, 'assistant_message_created', [
            'message_id' => $assistantMessage->id,
        ]);

        // Get worktree path for working directory
        $workingDirectory = $todo->worktree->path;
        $fullContent = '';
        $success = true;
        $cancelled = false;

        // Create executor with auto-approve mode
        $executor = new ClaudeExecutor();
        $executor->setPermissionMode('bypass_permissions');
        $executor->setAutoApproveTools([
            'Read', 'Glob', 'Grep', 'LS', 'Bash', 'Write', 'Edit',
            'WebFetch', 'WebSearch', 'Task', 'TodoRead', 'TodoWrite',
        ]);

        // Set system prompt
        $systemPrompt = $this->buildSystemPrompt($todo);
        if (!empty($systemPrompt)) {
            $executor->setSystemPrompt($systemPrompt);
        }

        // Resume from previous session if available
        $previousSession = ClaudeSession::getLatestResumableForTodo($todo->id);
        if ($previousSession && $previousSession->claude_session_id) {
            Log::info('[WebSocket] Resuming from previous session', [
                'todo_id' => $todo->id,
                'claude_session_id' => $previousSession->claude_session_id,
            ]);
            $executor->setResumeSession($previousSession->claude_session_id);
        }

        try {
            $eventCount = 0;
            foreach ($executor->execute($workingDirectory, $processedContent, $session, $todo->model ?? 'sonnet', $images) as $event) {
                // Check cancellation periodically (every 10 events)
                $eventCount++;
                if ($eventCount % 10 === 0 && $isCancelled && $isCancelled()) {
                    Log::info("[WebSocketStreamService] Cancellation detected during streaming for todo {$todo->id}");
                    $cancelled = true;

                    // Graceful shutdown - let current event complete but stop after
                    $this->broadcast($todo->id, 'cancellation_acknowledged', [
                        'message' => 'Cancellation acknowledged, finishing current operation...',
                    ]);

                    // Process this last event then break
                    $this->processAndBroadcast($todo->id, $event, $assistantMessage, $fullContent);
                    break;
                }

                $this->processAndBroadcast($todo->id, $event, $assistantMessage, $fullContent);
            }

            // Finalize message
            $assistantMessage->update([
                'content' => $fullContent,
                'is_streaming' => false,
            ]);

            if ($cancelled) {
                $session->markAsCancelled();
                $todo->markAsCancelled();
                $this->broadcast($todo->id, 'cancelled', [
                    'message' => $assistantMessage->fresh()->toArray(),
                ]);
            } else {
                $this->broadcast($todo->id, 'complete', [
                    'message' => $assistantMessage->fresh()->toArray(),
                ]);

                // Skip auto-completing for autonomous tasks — the job loop manages status
                if (!$todo->isAutonomous() && $todo->fresh()->status === 'running') {
                    $todo->markAsCompleted();
                }
            }
        } catch (\Throwable $e) {
            $success = false;
            $session->markAsFailed($e->getMessage());

            $assistantMessage->update([
                'content' => $fullContent ?: 'An error occurred.',
                'is_streaming' => false,
                'metadata' => ['error' => $e->getMessage()],
            ]);

            $todo->markAsFailed();

            $this->broadcast($todo->id, 'error', [
                'message' => $e->getMessage(),
            ]);
        }

        // Run post-command if set and streaming succeeded (not cancelled, not autonomous auto-message)
        if ($success && !$cancelled && !$isAutonomousMessage && !empty($todo->post_command)) {
            $this->broadcast($todo->id, 'post_command_start', [
                'command' => $todo->post_command,
            ]);

            $postResult = $this->processService->runPostCommand(
                $workingDirectory,
                $todo->post_command
            );

            $this->broadcast($todo->id, 'post_command_result', $postResult ?? []);
        }

        return $fullContent;
    }

    /**
     * Broadcast an event via WebSocket.
     */
    private function broadcast(int $todoId, string $event, array $data): void
    {
        broadcast(new ClaudeStreamEvent($todoId, $event, $data));
    }

    /**
     * Process and broadcast a Claude event.
     */
    private function processAndBroadcast(int $todoId, array $event, Message $message, string &$fullContent): void
    {
        $type = $event['type'] ?? 'unknown';

        switch ($type) {
            case 'text_delta':
                $text = $event['text'] ?? '';
                $fullContent = $event['full_content'] ?? $fullContent . $text;

                // Update DB periodically (every ~500 chars)
                if (strlen($fullContent) % 500 < strlen($text)) {
                    $message->update(['content' => $fullContent]);
                }

                // Only send delta text to avoid "Payload too large" error
                // Frontend accumulates the full content
                $this->broadcast($todoId, 'text_delta', [
                    'text' => $text,
                ]);
                break;

            case MessageTypes::TYPE_ASSISTANT:
                $thinking = $event['thinking'] ?? '';
                $toolUses = $event['tool_uses'] ?? [];

                foreach ($toolUses as $toolUse) {
                    $this->broadcast($todoId, 'tool_use', [
                        'id' => $toolUse['id'],
                        'tool' => $toolUse['name'],
                        'input' => $toolUse['input'],
                    ]);
                }

                if (!empty($thinking)) {
                    $this->broadcast($todoId, 'thinking', [
                        'content' => $thinking,
                    ]);
                }
                break;

            case MessageTypes::TYPE_TOOL_USE:
                $this->broadcast($todoId, 'tool_use', [
                    'id' => $event['tool_use_id'] ?? null,
                    'tool' => $event['name'] ?? 'unknown',
                    'input' => $event['input'] ?? [],
                ]);
                break;

            case MessageTypes::TYPE_TOOL_RESULT:
                $this->broadcast($todoId, 'tool_result', [
                    'tool_use_id' => $event['tool_use_id'] ?? null,
                    'content' => $event['content'] ?? '',
                    'is_error' => $event['is_error'] ?? false,
                ]);
                break;

            case MessageTypes::TYPE_RESULT:
                $result = $event['result'] ?? null;
                if ($result && is_string($result) && !empty($result)) {
                    $fullContent = $result;
                    $message->update(['content' => $fullContent]);
                }

                $this->broadcast($todoId, 'result', [
                    'result' => $result,
                    'cost_usd' => $event['cost_usd'] ?? null,
                    'duration_ms' => $event['duration_ms'] ?? null,
                    'is_error' => $event['is_error'] ?? false,
                    'session_id' => $event['session_id'] ?? null,
                ]);
                break;

            case MessageTypes::TYPE_SYSTEM:
                $this->broadcast($todoId, 'system', [
                    'session_id' => $event['session_id'] ?? null,
                    'tools' => $event['tools'] ?? [],
                ]);
                break;

            case 'permission_request':
                $this->broadcast($todoId, 'permission_request', [
                    'request_id' => $event['request_id'],
                    'tool' => $event['tool'] ?? null,
                    'input' => $event['input'] ?? [],
                ]);
                break;

            case 'permission_auto_approved':
                $this->broadcast($todoId, 'permission_approved', [
                    'request_id' => $event['request_id'],
                    'tool' => $event['tool'] ?? null,
                    'auto' => true,
                ]);
                break;

            case 'debug':
                $this->broadcast($todoId, 'debug', [
                    'content' => $event['content'] ?? '',
                ]);
                break;

            case 'raw':
                $text = $event['content'] ?? '';
                if (!empty($text)) {
                    $fullContent .= $text;
                    $this->broadcast($todoId, 'text_delta', [
                        'text' => $text,
                    ]);
                }
                break;
        }
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
     * Build a system prompt with project context for Claude.
     */
    private function buildSystemPrompt(Todo $todo): ?string
    {
        $parts = [];

        $parts[] = "You are working on a task: \"{$todo->title}\"";

        if ($todo->worktree) {
            $parts[] = "Working directory: {$todo->worktree->path}";
            if ($todo->worktree->branch) {
                $parts[] = "Git branch: {$todo->worktree->branch}";
            }
        }

        if (!empty($todo->context)) {
            $parts[] = "\nTask context:\n{$todo->context}";
        }

        $parts[] = "\nYou have full access to the project files in this directory. You can read, search, and modify files as needed to complete the task.";

        $parts[] = "\nIMPORTANT SAFETY RULES:
- NEVER run destructive database commands like: migrate:fresh, migrate:reset, db:wipe, DROP TABLE, DROP DATABASE
- NEVER delete .env files or modify database credentials
- NEVER run 'rm -rf' on directories without explicit user confirmation
- When running tests, use --no-coverage unless specifically requested
- Ask for confirmation before any potentially destructive operation";

        // Autonomous mode instructions
        if ($todo->isAutonomous()) {
            $phase = $todo->autonomous_phase ?? 'working';
            if ($phase === 'qa') {
                $parts[] = "\nQA REVIEW MODE: Review all changes you made. Check requirements, code quality, edge cases, tests.
If everything passes, include [QA_PASSED] on its own line.
If issues found, describe them (do NOT include [QA_PASSED]).";
            } else {
                $parts[] = "\nAUTONOMOUS MODE: Work on the task until fully complete. Do NOT stop to ask for confirmation.
When FULLY COMPLETE, end your response with [TASK_COMPLETE] on its own line.
Do NOT use [TASK_COMPLETE] unless everything is done.";
            }
        }

        return implode("\n", $parts);
    }
}
