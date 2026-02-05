<?php

namespace App\Jobs;

use App\Events\ClaudeStreamEvent;
use App\Models\Todo;
use App\Services\Claude\WebSocketStreamService;
use App\Services\TaskManager;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Background job for processing Claude streams.
 * Supports parallel execution across multiple queue workers.
 *
 * Architecture patterns (from VK):
 * - Cancellation token checking
 * - Timeout management
 * - Graceful shutdown
 * - State tracking
 */
class ProcessClaudeStream implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * The number of times the job may be attempted.
     */
    public int $tries = 1;

    /**
     * The maximum number of seconds the job can run.
     * Set high to allow long Claude operations.
     */
    public int $timeout = 600; // 10 minutes

    /**
     * The number of seconds to wait before retrying the job.
     */
    public int $backoff = 5;

    /**
     * Delete the job if its models no longer exist.
     */
    public bool $deleteWhenMissingModels = true;

    /**
     * Create a new job instance.
     *
     * @param Todo $todo The todo to stream in
     * @param string $message The user's message content
     * @param array $images Array of images with 'data' (base64) and 'mediaType' keys
     */
    public function __construct(
        public Todo $todo,
        public string $message,
        public array $images = []
    ) {}

    /**
     * Get the unique ID for the job.
     */
    public function uniqueId(): string
    {
        return 'claude-stream-' . $this->todo->id;
    }

    /**
     * Determine the time at which the job should timeout.
     */
    public function retryUntil(): \DateTime
    {
        return now()->addSeconds(TaskManager::EXECUTION_TIMEOUT);
    }

    /**
     * Execute the job.
     */
    public function handle(WebSocketStreamService $streamService): void
    {
        $todoId = $this->todo->id;

        Log::info("[ProcessClaudeStream] Starting job for todo {$todoId}", [
            'worker' => gethostname() . ':' . getmypid(),
            'message_length' => strlen($this->message),
            'images_count' => count($this->images),
        ]);

        // Check for pre-existing cancellation request
        if (TaskManager::isCancellationRequested($todoId)) {
            Log::info("[ProcessClaudeStream] Job cancelled before start for todo {$todoId}");
            TaskManager::clearCancellation($todoId);
            broadcast(new ClaudeStreamEvent($todoId, 'cancelled', [
                'message' => 'Task was cancelled before execution started',
            ]));
            return;
        }

        try {
            // Stream with cancellation checking
            $streamService->streamWithCancellation(
                $this->todo,
                $this->message,
                $this->images,
                function () use ($todoId) {
                    // This callback is called periodically to check cancellation
                    return TaskManager::isCancellationRequested($todoId);
                }
            );

            Log::info("[ProcessClaudeStream] Completed job for todo {$todoId}");

        } catch (\Throwable $e) {
            Log::error("[ProcessClaudeStream] Job failed for todo {$todoId}: " . $e->getMessage(), [
                'exception' => get_class($e),
                'trace' => $e->getTraceAsString(),
            ]);
            throw $e;

        } finally {
            // Always cleanup
            TaskManager::clearCancellation($todoId);
            TaskManager::clearExecution($todoId);
        }
    }

    /**
     * Handle a job failure.
     */
    public function failed(?\Throwable $exception): void
    {
        $todoId = $this->todo->id;

        Log::error("[ProcessClaudeStream] Job permanently failed for todo {$todoId}", [
            'error' => $exception?->getMessage(),
        ]);

        $this->todo->markAsFailed();

        // Cleanup
        TaskManager::clearCancellation($todoId);
        TaskManager::clearExecution($todoId);

        // Broadcast the error
        broadcast(new ClaudeStreamEvent(
            $todoId,
            'error',
            ['message' => $exception?->getMessage() ?? 'Job failed']
        ));
    }

    /**
     * Get the tags that should be assigned to the job.
     */
    public function tags(): array
    {
        return [
            'claude-stream',
            'todo:' . $this->todo->id,
            'worktree:' . $this->todo->worktree_id,
        ];
    }
}
