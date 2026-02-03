<?php

use App\Http\Controllers\ClaudeStreamController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\FileSystemController;
use App\Http\Controllers\McpServerController;
use App\Http\Controllers\MessageController;
use App\Http\Controllers\QueuedMessageController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\TerminalController;
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
Route::post('/todos/{todo}/duplicate', [TodoController::class, 'duplicate'])->name('todos.duplicate');
Route::post('/todos/reorder', [TodoController::class, 'reorder'])->name('todos.reorder');

// Messages
Route::get('/todos/{todo}/messages', [MessageController::class, 'index'])->name('messages.index');
Route::post('/todos/{todo}/messages', [MessageController::class, 'store'])->name('messages.store');
Route::post('/todos/{todo}/messages/assistant', [MessageController::class, 'storeAssistant'])->name('messages.storeAssistant');
Route::delete('/messages/{message}', [MessageController::class, 'destroy'])->name('messages.destroy');

// Claude Streaming - exclude from session middleware to enable parallel execution
// PHP's file-based sessions use locking which blocks concurrent requests from the same user
// We need to exclude StartSession, ShareErrorsFromSession (which depends on sessions),
// and VerifyCsrfToken (which tries to add CSRF cookie requiring session access)
$sessionMiddleware = [
    \Illuminate\Session\Middleware\StartSession::class,
    \Illuminate\View\Middleware\ShareErrorsFromSession::class,
    \Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class,
];
Route::post('/todos/{todo}/stream', [ClaudeStreamController::class, 'stream'])
    ->name('claude.stream')
    ->withoutMiddleware($sessionMiddleware);
Route::post('/todos/{todo}/stream/ws', [ClaudeStreamController::class, 'streamWebSocket'])
    ->name('claude.stream.ws')
    ->withoutMiddleware($sessionMiddleware);
Route::post('/sessions/{session}/cancel', [ClaudeStreamController::class, 'cancel'])
    ->name('claude.cancel')
    ->withoutMiddleware($sessionMiddleware);
Route::get('/sessions/{session}/status', [ClaudeStreamController::class, 'status'])
    ->name('claude.status')
    ->withoutMiddleware($sessionMiddleware);

// Settings
Route::get('/api/settings', [SettingsController::class, 'show'])->name('settings.show');
Route::patch('/api/settings', [SettingsController::class, 'update'])->name('settings.update');

// Terminal
Route::post('/api/terminal/execute', [TerminalController::class, 'execute'])->name('terminal.execute');

// MCP Servers
Route::prefix('api/mcp-servers')->group(function () {
    Route::get('/', [McpServerController::class, 'index'])->name('mcp-servers.index');
    Route::post('/', [McpServerController::class, 'store'])->name('mcp-servers.store');
    Route::patch('/{mcpServer}', [McpServerController::class, 'update'])->name('mcp-servers.update');
    Route::delete('/{mcpServer}', [McpServerController::class, 'destroy'])->name('mcp-servers.destroy');
    Route::post('/{mcpServer}/toggle', [McpServerController::class, 'toggle'])->name('mcp-servers.toggle');
    Route::get('/config', [McpServerController::class, 'getClaudeConfig'])->name('mcp-servers.config');
    Route::post('/sync', [McpServerController::class, 'sync'])->name('mcp-servers.sync');
});

// Queued Messages
Route::prefix('todos/{todo}/queue')->group(function () {
    Route::get('/', [QueuedMessageController::class, 'index'])->name('queue.index');
    Route::post('/', [QueuedMessageController::class, 'store'])->name('queue.store');
    Route::get('/status', [QueuedMessageController::class, 'status'])->name('queue.status');
});
Route::delete('/queued-messages/{queuedMessage}', [QueuedMessageController::class, 'destroy'])->name('queue.destroy');
