<?php

namespace App\Jobs;

use App\Events\ClaudeStreamEvent;
use App\Models\QueuedMessage;
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
     * @param bool $isAutonomousMessage Whether this is an auto-generated autonomous continuation
     */
    public function __construct(
        public Todo $todo,
        public string $message,
        public array $images = [],
        public bool $isAutonomousMessage = false,
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
            'is_autonomous_message' => $this->isAutonomousMessage,
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
            $finalContent = $streamService->streamWithCancellation(
                $this->todo,
                $this->message,
                $this->images,
                function () use ($todoId) {
                    return TaskManager::isCancellationRequested($todoId);
                },
                $this->isAutonomousMessage,
            );

            Log::info("[ProcessClaudeStream] Completed job for todo {$todoId}");

            // Handle autonomous loop after stream completes
            $todo = $this->todo->fresh();
            if ($todo && $todo->isAutonomous() && $todo->status === 'running') {
                $this->handleAutonomousLoop($todo, $finalContent);
            }

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
     * Handle the autonomous loop after a stream completes.
     * Checks markers and dispatches follow-up jobs.
     */
    private function handleAutonomousLoop(Todo $todo, string $finalContent): void
    {
        $todoId = $todo->id;

        // Check cancellation
        if (TaskManager::isCancellationRequested($todoId)) {
            Log::info("[ProcessClaudeStream] Autonomous loop cancelled for todo {$todoId}");
            return;
        }

        // If user queued a message, pause the autonomous loop — user takes over
        if (QueuedMessage::hasPendingForTodo($todo)) {
            Log::info("[ProcessClaudeStream] Autonomous loop paused — user queued a message for todo {$todoId}");
            broadcast(new ClaudeStreamEvent($todoId, 'autonomous_paused', [
                'reason' => 'User sent a message',
            ]));
            return;
        }

        $phase = $todo->autonomous_phase ?? 'working';

        if ($phase === 'working') {
            // Check for [TASK_COMPLETE] marker
            if (str_contains($finalContent, '[TASK_COMPLETE]')) {
                Log::info("[ProcessClaudeStream] Task complete marker found for todo {$todoId}, transitioning to QA");

                $todo->setAutonomousPhase('qa');
                broadcast(new ClaudeStreamEvent($todoId, 'autonomous_phase_change', [
                    'phase' => 'qa',
                    'iteration' => $todo->autonomous_current_iteration,
                ]));

                // Dispatch QA review job
                $qaPrompt = "QA REVIEW: Review all changes you made for task \"{$todo->title}\".\n\n"
                    . "Check the following:\n"
                    . "- All requirements from the original task context are met\n"
                    . "- Code quality and correctness\n"
                    . "- Edge cases are handled\n"
                    . "- No regressions introduced\n"
                    . "- Build passes (run `npm run build` or equivalent if applicable)\n\n"
                    . "If everything passes, include [QA_PASSED] on its own line.\n"
                    . "If issues are found, describe them in detail (do NOT include [QA_PASSED]).";

                static::dispatch($todo, $qaPrompt, [], true);
                return;
            }

            // No marker — continue working
            $iteration = $todo->incrementAutonomousIteration();

            if ($todo->hasReachedMaxIterations()) {
                Log::warning("[ProcessClaudeStream] Max iterations reached for todo {$todoId}");
                $todo->markAsAutonomousFailed();
                broadcast(new ClaudeStreamEvent($todoId, 'autonomous_max_iterations', [
                    'iteration' => $iteration,
                    'max' => $todo->autonomous_max_iterations,
                ]));
                return;
            }

            broadcast(new ClaudeStreamEvent($todoId, 'autonomous_continue', [
                'phase' => 'working',
                'iteration' => $iteration,
                'max' => $todo->autonomous_max_iterations,
            ]));

            static::dispatch($todo, 'Continue working on the task. Pick up where you left off.', [], true);

        } elseif ($phase === 'qa') {
            // Check for [QA_PASSED] marker
            if (str_contains($finalContent, '[QA_PASSED]')) {
                Log::info("[ProcessClaudeStream] QA passed for todo {$todoId}");
                $todo->markAsAutonomousCompleted();
                broadcast(new ClaudeStreamEvent($todoId, 'autonomous_phase_change', [
                    'phase' => 'completed',
                    'iteration' => $todo->autonomous_current_iteration,
                ]));
                return;
            }

            // QA found issues — go back to working
            Log::info("[ProcessClaudeStream] QA found issues for todo {$todoId}, returning to working phase");
            $todo->setAutonomousPhase('working');

            $iteration = $todo->incrementAutonomousIteration();
            if ($todo->hasReachedMaxIterations()) {
                Log::warning("[ProcessClaudeStream] Max iterations reached during QA fix for todo {$todoId}");
                $todo->markAsAutonomousFailed();
                broadcast(new ClaudeStreamEvent($todoId, 'autonomous_max_iterations', [
                    'iteration' => $iteration,
                    'max' => $todo->autonomous_max_iterations,
                ]));
                return;
            }

            broadcast(new ClaudeStreamEvent($todoId, 'autonomous_phase_change', [
                'phase' => 'working',
                'iteration' => $iteration,
            ]));

            static::dispatch(
                $todo,
                'The QA review found issues. Fix them based on the feedback above, then include [TASK_COMPLETE] when done.',
                [],
                true,
            );
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
