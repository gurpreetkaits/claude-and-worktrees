<?php

namespace App\Services;

use App\Events\ClaudeStreamEvent;
use App\Models\ClaudeSession;
use App\Models\Todo;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Task Manager for parallel Claude execution.
 * Implements patterns from VK architecture:
 * - Cancellation tokens
 * - Timeout management
 * - State tracking across workers
 */
class TaskManager
{
    // Timeout constants (in seconds)
    public const SPAWN_TIMEOUT = 30;           // Max time to spawn process
    public const EXECUTION_TIMEOUT = 600;      // 10 minutes max execution
    public const GRACEFUL_SHUTDOWN_TIMEOUT = 5; // Time to wait for graceful shutdown
    public const APPROVAL_TIMEOUT = 3600;       // 1 hour for approvals

    // Cache key prefixes
    private const CANCELLATION_PREFIX = 'claude:cancel:';
    private const EXECUTION_PREFIX = 'claude:execution:';
    private const METRICS_PREFIX = 'claude:metrics:';

    /**
     * Request cancellation of a running task.
     * Sets a cancellation token that the worker checks.
     */
    public static function requestCancellation(int $todoId): void
    {
        $key = self::CANCELLATION_PREFIX . $todoId;
        Cache::put($key, [
            'requested_at' => now()->toIso8601String(),
            'status' => 'requested',
        ], now()->addMinutes(30));

        Log::info("[TaskManager] Cancellation requested for todo {$todoId}");

        // Broadcast cancellation event
        broadcast(new ClaudeStreamEvent($todoId, 'cancellation_requested', [
            'todo_id' => $todoId,
        ]));
    }

    /**
     * Check if cancellation was requested.
     */
    public static function isCancellationRequested(int $todoId): bool
    {
        $key = self::CANCELLATION_PREFIX . $todoId;
        return Cache::has($key);
    }

    /**
     * Clear cancellation token after task ends.
     */
    public static function clearCancellation(int $todoId): void
    {
        $key = self::CANCELLATION_PREFIX . $todoId;
        Cache::forget($key);
    }

    /**
     * Register an execution start.
     * Tracks which worker is handling which task.
     */
    public static function registerExecution(int $todoId, string $sessionKey, ?int $processId = null): void
    {
        $key = self::EXECUTION_PREFIX . $todoId;
        Cache::put($key, [
            'session_key' => $sessionKey,
            'process_id' => $processId,
            'worker_id' => gethostname() . ':' . getmypid(),
            'started_at' => now()->toIso8601String(),
            'timeout_at' => now()->addSeconds(self::EXECUTION_TIMEOUT)->toIso8601String(),
        ], now()->addSeconds(self::EXECUTION_TIMEOUT + 60));

        Log::info("[TaskManager] Execution registered for todo {$todoId}", [
            'session_key' => $sessionKey,
            'process_id' => $processId,
        ]);
    }

    /**
     * Get execution info for a task.
     */
    public static function getExecution(int $todoId): ?array
    {
        $key = self::EXECUTION_PREFIX . $todoId;
        return Cache::get($key);
    }

    /**
     * Clear execution registration.
     */
    public static function clearExecution(int $todoId): void
    {
        $key = self::EXECUTION_PREFIX . $todoId;
        Cache::forget($key);
    }

    /**
     * Check if execution has timed out.
     */
    public static function hasTimedOut(int $todoId): bool
    {
        $execution = self::getExecution($todoId);
        if (!$execution) {
            return false;
        }

        $timeoutAt = \Carbon\Carbon::parse($execution['timeout_at']);
        return now()->isAfter($timeoutAt);
    }

    /**
     * Get all currently running tasks.
     */
    public static function getRunningTasks(): array
    {
        $sessions = ClaudeSession::where('status', 'running')
            ->with('todo')
            ->get();

        return $sessions->map(function ($session) {
            $execution = self::getExecution($session->todo_id);
            return [
                'todo_id' => $session->todo_id,
                'todo_title' => $session->todo?->title,
                'session_key' => $session->session_key,
                'started_at' => $session->started_at?->toIso8601String(),
                'worker_id' => $execution['worker_id'] ?? 'unknown',
                'timed_out' => self::hasTimedOut($session->todo_id),
            ];
        })->toArray();
    }

    /**
     * Record execution metrics.
     */
    public static function recordMetrics(int $todoId, array $metrics): void
    {
        $key = self::METRICS_PREFIX . $todoId;
        $existing = Cache::get($key, []);
        $merged = array_merge($existing, $metrics, [
            'updated_at' => now()->toIso8601String(),
        ]);
        Cache::put($key, $merged, now()->addHours(24));
    }

    /**
     * Get execution metrics.
     */
    public static function getMetrics(int $todoId): array
    {
        $key = self::METRICS_PREFIX . $todoId;
        return Cache::get($key, []);
    }

    /**
     * Handle graceful shutdown for a task.
     * Implements signal escalation pattern.
     */
    public static function gracefulShutdown(int $todoId, ClaudeSession $session): bool
    {
        Log::info("[TaskManager] Initiating graceful shutdown for todo {$todoId}");

        // Mark session as cancelling
        $session->update(['status' => 'cancelling']);

        // Broadcast shutdown initiated
        broadcast(new ClaudeStreamEvent($todoId, 'shutdown_initiated', [
            'todo_id' => $todoId,
        ]));

        // Wait for graceful completion (up to GRACEFUL_SHUTDOWN_TIMEOUT seconds)
        $deadline = now()->addSeconds(self::GRACEFUL_SHUTDOWN_TIMEOUT);

        while (now()->isBefore($deadline)) {
            $session->refresh();
            if (!$session->isRunning()) {
                Log::info("[TaskManager] Graceful shutdown completed for todo {$todoId}");
                return true;
            }
            usleep(250000); // 250ms
        }

        // Force mark as cancelled if still running
        Log::warning("[TaskManager] Graceful shutdown timed out for todo {$todoId}, forcing cancellation");
        $session->markAsCancelled();

        return false;
    }

    /**
     * Cleanup stale executions (tasks that never completed).
     */
    public static function cleanupStaleExecutions(): int
    {
        $staleSessions = ClaudeSession::where('status', 'running')
            ->where('started_at', '<', now()->subSeconds(self::EXECUTION_TIMEOUT))
            ->get();

        $count = 0;
        foreach ($staleSessions as $session) {
            Log::warning("[TaskManager] Cleaning up stale session {$session->id} for todo {$session->todo_id}");
            $session->markAsFailed('Execution timed out');
            self::clearExecution($session->todo_id);
            self::clearCancellation($session->todo_id);

            if ($session->todo) {
                $session->todo->markAsFailed();
            }

            broadcast(new ClaudeStreamEvent($session->todo_id, 'error', [
                'message' => 'Execution timed out after ' . self::EXECUTION_TIMEOUT . ' seconds',
            ]));

            $count++;
        }

        return $count;
    }
}
