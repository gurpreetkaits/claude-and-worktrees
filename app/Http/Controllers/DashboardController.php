<?php

namespace App\Http\Controllers;

use App\Models\Todo;
use App\Models\UserSetting;
use App\Models\Worktree;
use App\Services\GitService;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function __construct(
        private GitService $gitService
    ) {}

    public function index()
    {
        $worktrees = Worktree::orderBy('created_at', 'desc')->get();
        $todos = Todo::with('worktree')
            ->orderBy('position', 'asc')
            ->get();
        $settings = UserSetting::getSettings();

        return Inertia::render('Dashboard', [
            'worktrees' => $worktrees,
            'todos' => $todos,
            'models' => config('claude.models'),
            'settings' => $settings,
        ]);
    }

    public function showTodo(Todo $todo)
    {
        $worktrees = Worktree::orderBy('created_at', 'desc')->get();
        $todos = Todo::with('worktree')
            ->orderBy('position', 'asc')
            ->get();

        $worktree = $todo->worktree;
        $status = [];
        $diff = '';

        try {
            $status = $this->gitService->getStatus($worktree->path);
            $diff = $this->gitService->getDiff($worktree->path);
            $worktree->branch = $this->gitService->getCurrentBranch($worktree->path);
        } catch (\Exception $e) {
            // Path might not exist
        }

        // Load messages and worktree for the active todo
        $todo->load(['messages', 'worktree']);

        $settings = UserSetting::getSettings();

        return Inertia::render('Dashboard', [
            'worktrees' => $worktrees,
            'todos' => $todos,
            'activeTodo' => $todo,
            'activeWorktree' => $worktree,
            'status' => $status,
            'diff' => $diff,
            'models' => config('claude.models'),
            'settings' => $settings,
        ]);
    }
}
