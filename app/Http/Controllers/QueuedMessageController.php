<?php

namespace App\Http\Controllers;

use App\Models\QueuedMessage;
use App\Models\Todo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class QueuedMessageController extends Controller
{
    /**
     * Queue a message for a todo.
     */
    public function store(Request $request, Todo $todo): JsonResponse
    {
        $validated = $request->validate([
            'content' => 'required|string|max:100000',
            'images' => 'nullable|array|max:10',
            'images.*.data' => 'required_with:images|string',
            'images.*.mediaType' => 'required_with:images|string|in:image/png,image/jpeg,image/gif,image/webp',
        ]);

        // Only allow queuing if there's an active session running
        if (!$todo->isRunning()) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot queue message - no active session running',
            ], 400);
        }

        $queuedMessage = QueuedMessage::queueForTodo(
            $todo,
            $validated['content'],
            $validated['images'] ?? []
        );

        return response()->json([
            'success' => true,
            'queued_message' => $queuedMessage,
            'message' => 'Message queued successfully',
        ], 201);
    }

    /**
     * Get queued messages for a todo.
     */
    public function index(Todo $todo): JsonResponse
    {
        $messages = QueuedMessage::where('todo_id', $todo->id)
            ->orderBy('queued_at', 'desc')
            ->get();

        return response()->json([
            'messages' => $messages,
            'has_pending' => QueuedMessage::hasPendingForTodo($todo),
        ]);
    }

    /**
     * Cancel a queued message.
     */
    public function destroy(QueuedMessage $queuedMessage): JsonResponse
    {
        if ($queuedMessage->status !== 'pending') {
            return response()->json([
                'success' => false,
                'message' => 'Can only cancel pending messages',
            ], 400);
        }

        $queuedMessage->update(['status' => 'cancelled']);

        return response()->json([
            'success' => true,
            'message' => 'Queued message cancelled',
        ]);
    }

    /**
     * Get the status of the queue for a todo.
     */
    public function status(Todo $todo): JsonResponse
    {
        $pending = QueuedMessage::where('todo_id', $todo->id)
            ->where('status', 'pending')
            ->first();

        return response()->json([
            'has_pending' => $pending !== null,
            'pending_message' => $pending,
            'todo_status' => $todo->status,
        ]);
    }
}
