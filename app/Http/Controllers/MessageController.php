<?php

namespace App\Http\Controllers;

use App\Models\Todo;
use App\Models\Message;
use Illuminate\Http\Request;

class MessageController extends Controller
{
    public function store(Request $request, Todo $todo)
    {
        $validated = $request->validate([
            'content' => 'required|string',
        ]);

        $message = $todo->messages()->create([
            'role' => 'user',
            'content' => $validated['content'],
        ]);

        $todo->touch();

        return response()->json(['message' => $message]);
    }

    public function storeAssistant(Request $request, Todo $todo)
    {
        $validated = $request->validate([
            'content' => 'required|string',
        ]);

        $message = $todo->messages()->create([
            'role' => 'assistant',
            'content' => $validated['content'],
        ]);

        $todo->touch();

        return response()->json(['message' => $message]);
    }

    public function destroy(Message $message)
    {
        $message->delete();

        return response()->json(['success' => true]);
    }
}
