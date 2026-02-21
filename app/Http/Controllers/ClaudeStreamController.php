<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessClaudeStream;
use App\Models\Todo;
use App\Models\ClaudeSession;
use App\Services\ClaudeProcessService;
use App\Services\ClaudeStreamService;
use App\Services\TaskManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ClaudeStreamController extends Controller
{
    public function __construct(
        private ClaudeProcessService $processService
    ) {}

    /**
     * Stream a message to Claude via WebSocket (dispatches job).
     * This is the preferred method - events are broadcast via Reverb.
     */
    public function streamWebSocket(Request $request, Todo $todo): JsonResponse
    {
        $request->validate([
            'message' => 'required|string|max:100000',
            'images' => 'array|max:10',
            'images.*.data' => 'required_with:images|string',
            'images.*.mediaType' => 'required_with:images|string|in:image/png,image/jpeg,image/gif,image/webp',
        ]);

        $message = $request->input('message');
        $images = $request->input('images', []);

        // Initialize autonomous phase on first message
        if ($todo->isAutonomous() && $todo->autonomous_phase === null) {
            $todo->setAutonomousPhase('working');
        }

        // Dispatch the streaming job to run in the background
        ProcessClaudeStream::dispatch($todo, $message, $images);

        return response()->json([
            'success' => true,
            'channel' => 'claude.todo.' . $todo->id,
            'message' => 'Streaming started. Connect to WebSocket channel to receive events.',
        ]);
    }

    /**
     * Stream a message to Claude via SSE.
     * Real-time streaming with aggressive flushing.
     */
    public function stream(Request $request, Todo $todo): StreamedResponse
    {
        $request->validate([
            'message' => 'required|string|max:100000',
            'images' => 'array|max:10',
            'images.*.data' => 'required_with:images|string',
            'images.*.mediaType' => 'required_with:images|string|in:image/png,image/jpeg,image/gif,image/webp',
        ]);

        $message = $request->input('message');
        $images = $request->input('images', []);

        // CRITICAL: Release session lock BEFORE creating the response
        // This allows other requests to proceed in parallel
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        // Create a NEW stream service instance for each request to ensure isolation
        // This allows multiple streams to run in parallel without shared state
        $streamService = app()->make(ClaudeStreamService::class);

        $response = new StreamedResponse(function () use ($todo, $message, $images, $streamService) {

            // Remove PHP execution time limit
            set_time_limit(0);
            ini_set('max_execution_time', '0');

            // Disable ALL output buffering - be aggressive
            @ini_set('output_buffering', 'off');
            @ini_set('zlib.output_compression', false);

            while (ob_get_level() > 0) {
                ob_end_flush();
            }

            // Enable implicit flushing
            ob_implicit_flush(true);

            // Send padding to push past any proxy buffers
            echo ":" . str_repeat(" ", 2048) . "\n";
            echo "event: connected\ndata: {}\n\n";
            flush();

            foreach ($streamService->stream($todo, $message, $images) as $event) {
                echo $event;
                flush();

                // Check if client disconnected
                if (connection_aborted()) {
                    break;
                }
            }
        });

        $response->headers->set('Content-Type', 'text/event-stream');
        $response->headers->set('Cache-Control', 'no-cache, private');
        $response->headers->set('Connection', 'keep-alive');
        $response->headers->set('X-Accel-Buffering', 'no');

        return $response;
    }

    /**
     * Cancel a running Claude session.
     * Supports both queue-based (TaskManager) and direct process cancellation.
     */
    public function cancel(ClaudeSession $session): JsonResponse
    {
        if (!$session->isRunning()) {
            return response()->json([
                'success' => false,
                'message' => 'Session is not running',
            ], 400);
        }

        $todoId = $session->todo_id;

        // Request cancellation via TaskManager (for queue-based execution)
        TaskManager::requestCancellation($todoId);

        // Also try direct process kill if we have a PID (for legacy/fallback)
        $processKilled = false;
        if ($session->process_id) {
            $processKilled = ClaudeProcessService::cancelByProcessId($session->process_id);
        }

        // Attempt graceful shutdown
        $graceful = TaskManager::gracefulShutdown($todoId, $session);

        return response()->json([
            'success' => true,
            'graceful' => $graceful,
            'process_killed' => $processKilled,
            'session' => $session->fresh()->toArray(),
        ]);
    }

    /**
     * Get the status of a Claude session.
     */
    public function status(ClaudeSession $session): JsonResponse
    {
        // If session shows running, verify the process is still alive
        if ($session->isRunning() && $session->process_id) {
            $isAlive = ClaudeProcessService::isProcessRunning($session->process_id);

            if (!$isAlive) {
                $session->markAsFailed('Process terminated unexpectedly');
            }
        }

        return response()->json([
            'session' => $session->fresh()->toArray(),
        ]);
    }

    /**
     * Cancel a running task by todo ID.
     * Convenient endpoint that finds and cancels any active session.
     */
    public function cancelTodo(Todo $todo): JsonResponse
    {
        // Find the active session
        $session = $todo->sessions()
            ->whereIn('status', ['starting', 'running'])
            ->latest()
            ->first();

        if (!$session) {
            // No running session, but still request cancellation in case
            // a job is about to start
            TaskManager::requestCancellation($todo->id);

            return response()->json([
                'success' => true,
                'message' => 'Cancellation requested (no active session found)',
            ]);
        }

        // Request cancellation via TaskManager
        TaskManager::requestCancellation($todo->id);

        // Try direct process kill if available
        $processKilled = false;
        if ($session->process_id) {
            $processKilled = ClaudeProcessService::cancelByProcessId($session->process_id);
        }

        // Attempt graceful shutdown
        $graceful = TaskManager::gracefulShutdown($todo->id, $session);

        return response()->json([
            'success' => true,
            'graceful' => $graceful,
            'process_killed' => $processKilled,
            'session' => $session->fresh()->toArray(),
        ]);
    }

    /**
     * Get all currently running tasks.
     */
    public function runningTasks(): JsonResponse
    {
        $tasks = TaskManager::getRunningTasks();

        return response()->json([
            'tasks' => $tasks,
            'count' => count($tasks),
        ]);
    }
}
