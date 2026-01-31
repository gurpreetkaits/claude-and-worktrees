<?php

use App\Http\Controllers\ClaudeStreamController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\FileSystemController;
use App\Http\Controllers\MessageController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\TodoController;
use App\Http\Controllers\WorktreeController;
use Illuminate\Support\Facades\Route;

// Dashboard (root)
Route::get('/', [DashboardController::class, 'index'])->name('dashboard');
Route::get('/tasks/{todo}', [DashboardController::class, 'showTodo'])->name('dashboard.todo');

// File system browsing
Route::get('/api/browse', [FileSystemController::class, 'browse'])->name('fs.browse');

// Worktrees
Route::get('/worktrees', [WorktreeController::class, 'index'])->name('worktrees.index');
Route::post('/worktrees', [WorktreeController::class, 'store'])->name('worktrees.store');
Route::get('/worktrees/{worktree}', fn ($worktree) => redirect()->route('dashboard'))->name('worktrees.show');
Route::patch('/worktrees/{worktree}', [WorktreeController::class, 'update'])->name('worktrees.update');
Route::delete('/worktrees/{worktree}', [WorktreeController::class, 'destroy'])->name('worktrees.destroy');

// Worktree Git operations
Route::get('/worktrees/{worktree}/status', [WorktreeController::class, 'status'])->name('worktrees.status');
Route::get('/worktrees/{worktree}/diff', [WorktreeController::class, 'diff'])->name('worktrees.diff');
Route::post('/worktrees/{worktree}/stage', [WorktreeController::class, 'stageFile'])->name('worktrees.stage');
Route::post('/worktrees/{worktree}/unstage', [WorktreeController::class, 'unstageFile'])->name('worktrees.unstage');
Route::post('/worktrees/{worktree}/commit', [WorktreeController::class, 'commit'])->name('worktrees.commit');
Route::post('/worktrees/{worktree}/discard', [WorktreeController::class, 'discardChanges'])->name('worktrees.discard');

// Todos
Route::post('/worktrees/{worktree}/todos', [TodoController::class, 'store'])->name('todos.store');
Route::get('/todos/{todo}', fn ($todo) => redirect()->route('dashboard.todo', $todo))->name('todos.show');
Route::patch('/todos/{todo}', [TodoController::class, 'update'])->name('todos.update');
Route::delete('/todos/{todo}', [TodoController::class, 'destroy'])->name('todos.destroy');
Route::post('/todos/{todo}/archive', [TodoController::class, 'archive'])->name('todos.archive');

// Messages
Route::post('/todos/{todo}/messages', [MessageController::class, 'store'])->name('messages.store');
Route::post('/todos/{todo}/messages/assistant', [MessageController::class, 'storeAssistant'])->name('messages.storeAssistant');
Route::delete('/messages/{message}', [MessageController::class, 'destroy'])->name('messages.destroy');

// Claude Streaming
Route::post('/todos/{todo}/stream', [ClaudeStreamController::class, 'stream'])->name('claude.stream');
Route::post('/todos/{todo}/stream/ws', [ClaudeStreamController::class, 'streamWebSocket'])->name('claude.stream.ws');
Route::post('/sessions/{session}/cancel', [ClaudeStreamController::class, 'cancel'])->name('claude.cancel');
Route::get('/sessions/{session}/status', [ClaudeStreamController::class, 'status'])->name('claude.status');

// Settings
Route::get('/api/settings', [SettingsController::class, 'show'])->name('settings.show');
Route::patch('/api/settings', [SettingsController::class, 'update'])->name('settings.update');
