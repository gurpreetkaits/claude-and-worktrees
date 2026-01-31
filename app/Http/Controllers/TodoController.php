<?php

namespace App\Http\Controllers;

use App\Models\Todo;
use App\Models\UserSetting;
use App\Models\Worktree;
use App\Services\GitService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class TodoController extends Controller
{
    public function __construct(
        private GitService $gitService
    ) {}

    public function store(Request $request, Worktree $worktree)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'context' => 'nullable|string',
            'model' => 'nullable|string|in:sonnet,opus,haiku',
            'pre_command' => 'nullable|string',
            'post_command' => 'nullable|string',
            'message_prefix' => 'nullable|string|max:500',
            'message_suffix' => 'nullable|string|max:500',
        ]);

        // Apply user settings defaults if not provided
        $settings = UserSetting::getSettings();
        $validated['model'] = $validated['model'] ?? $settings->default_model ?? config('claude.default_model', 'sonnet');
        $validated['context'] = $validated['context'] ?? $settings->default_context;
        $validated['status'] = 'pending';

        $todo = $worktree->todos()->create($validated);

        // Return JSON if requested, otherwise redirect
        if ($request->wantsJson() || $request->header('Accept') === 'application/json') {
            return response()->json([
                'id' => $todo->id,
                'todo' => $todo,
            ]);
        }

        return redirect()->route('dashboard.todo', $todo);
    }

    public function show(Request $request, Todo $todo)
    {
        $worktree = $todo->worktree;

        $todo->load('messages', 'changes');

        // Return JSON for AJAX requests (task switcher)
        if ($request->wantsJson() || $request->header('X-Requested-With') === 'XMLHttpRequest') {
            return response()->json([
                'todo' => $todo,
                'messages' => $todo->messages,
            ]);
        }

        $todos = $worktree->todos()->orderBy('updated_at', 'desc')->get();
        $status = [];
        $diff = '';

        try {
            $status = $this->gitService->getStatus($worktree->path);
            $diff = $this->gitService->getDiff($worktree->path);
        } catch (\Exception $e) {
            // Path might not exist
        }

        return Inertia::render('Todos/Show', [
            'worktree' => $worktree,
            'todo' => $todo,
            'todos' => $todos,
            'status' => $status,
            'diff' => $diff,
            'models' => config('claude.models'),
        ]);
    }

    public function update(Request $request, Todo $todo)
    {
        $validated = $request->validate([
            'title' => 'string|max:255',
            'description' => 'nullable|string',
            'context' => 'nullable|string',
            'model' => 'nullable|string|in:sonnet,opus,haiku',
            'pre_command' => 'nullable|string',
            'post_command' => 'nullable|string',
            'message_prefix' => 'nullable|string|max:500',
            'message_suffix' => 'nullable|string|max:500',
        ]);

        $todo->update($validated);

        return back();
    }

    public function destroy(Todo $todo)
    {
        $worktree = $todo->worktree;

        $todo->delete();

        return redirect()->route('worktrees.show', $worktree);
    }

    public function archive(Request $request, Todo $todo)
    {
        $todo->update(['is_archived' => !$todo->is_archived]);

        if ($request->wantsJson()) {
            return response()->json(['is_archived' => $todo->is_archived]);
        }

        return back();
    }

    public function duplicate(Request $request, Todo $todo)
    {
        // Create a copy of the todo with "(Copy)" appended to the title
        $newTodo = $todo->replicate();
        $newTodo->title = $todo->title . ' (Copy)';
        $newTodo->status = 'pending';
        $newTodo->is_archived = false;
        $newTodo->created_at = now();
        $newTodo->updated_at = now();
        $newTodo->save();

        if ($request->wantsJson()) {
            return response()->json([
                'id' => $newTodo->id,
                'todo' => $newTodo,
            ]);
        }

        return back();
    }

    public function reorder(Request $request)
    {
        $validated = $request->validate([
            'orderedIds' => 'required|array',
            'orderedIds.*' => 'integer|exists:todos,id',
        ]);

        foreach ($validated['orderedIds'] as $position => $id) {
            Todo::where('id', $id)->update(['position' => $position]);
        }

        return response()->json(['success' => true]);
    }
}
