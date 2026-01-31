<?php

namespace App\Http\Controllers;

use App\Models\UserSetting;
use App\Models\Worktree;
use App\Services\GitService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class WorktreeController extends Controller
{
    public function __construct(
        private GitService $gitService
    ) {}

    public function index()
    {
        $worktrees = Worktree::withCount('todos')
            ->orderBy('created_at', 'desc')
            ->get();

        return Inertia::render('Worktrees/Index', [
            'worktrees' => $worktrees,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'path' => 'required|string',
        ]);

        if (!$this->gitService->isGitRepository($validated['path'])) {
            if ($request->wantsJson()) {
                return response()->json(['error' => 'The specified path is not a git repository.'], 422);
            }
            return back()->withErrors(['path' => 'The specified path is not a git repository.']);
        }

        $branch = $this->gitService->getCurrentBranch($validated['path']);

        // Use firstOrCreate to return existing worktree if path already exists
        $worktree = Worktree::firstOrCreate(
            ['path' => $validated['path']],
            [
                'name' => $validated['name'],
                'branch' => $branch,
                'base_branch' => 'main',
                'is_main' => false,
            ]
        );

        // Update branch in case it changed
        if ($worktree->branch !== $branch) {
            $worktree->update(['branch' => $branch]);
        }

        // Return JSON for AJAX requests
        if ($request->wantsJson()) {
            return response()->json($worktree);
        }

        return redirect()->route('worktrees.show', $worktree);
    }

    public function show(Worktree $worktree)
    {
        $todos = $worktree->todos()->orderBy('updated_at', 'desc')->get();
        $status = [];

        try {
            $status = $this->gitService->getStatus($worktree->path);
            $worktree->branch = $this->gitService->getCurrentBranch($worktree->path);
        } catch (\Exception $e) {
            // Path might not exist
        }

        $settings = UserSetting::getSettings();

        return Inertia::render('Worktrees/Show', [
            'worktree' => $worktree,
            'todos' => $todos,
            'status' => $status,
            'models' => config('claude.models'),
            'settings' => $settings,
        ]);
    }

    public function update(Request $request, Worktree $worktree)
    {
        $validated = $request->validate([
            'name' => 'string|max:255',
        ]);

        $worktree->update($validated);

        return back();
    }

    public function destroy(Worktree $worktree)
    {
        $worktree->delete();

        return redirect()->route('worktrees.index');
    }

    public function status(Worktree $worktree)
    {
        try {
            $status = $this->gitService->getStatus($worktree->path);
            return response()->json(['status' => $status]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function diff(Request $request, Worktree $worktree)
    {
        $file = $request->query('file');

        try {
            $diff = $this->gitService->getDiff($worktree->path, $file);
            $stagedDiff = $this->gitService->getStagedDiff($worktree->path, $file);

            return response()->json([
                'diff' => $diff,
                'stagedDiff' => $stagedDiff,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function stageFile(Request $request, Worktree $worktree)
    {
        $validated = $request->validate([
            'file' => 'required|string',
        ]);

        $success = $this->gitService->stageFile($worktree->path, $validated['file']);

        return response()->json(['success' => $success]);
    }

    public function unstageFile(Request $request, Worktree $worktree)
    {
        $validated = $request->validate([
            'file' => 'required|string',
        ]);

        $success = $this->gitService->unstageFile($worktree->path, $validated['file']);

        return response()->json(['success' => $success]);
    }

    public function commit(Request $request, Worktree $worktree)
    {
        $validated = $request->validate([
            'message' => 'required|string',
        ]);

        $success = $this->gitService->commit($worktree->path, $validated['message']);

        return response()->json(['success' => $success]);
    }

    public function discardChanges(Request $request, Worktree $worktree)
    {
        $validated = $request->validate([
            'file' => 'required|string',
        ]);

        $success = $this->gitService->discardChanges($worktree->path, $validated['file']);

        return response()->json(['success' => $success]);
    }
}
