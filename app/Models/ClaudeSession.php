<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClaudeSession extends Model
{
    protected $fillable = [
        'todo_id',
        'process_id',
        'session_key',
        'claude_session_id',
        'last_message_uuid',
        'cost_usd',
        'duration_ms',
        'status',
        'last_error',
        'started_at',
        'completed_at',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'cost_usd' => 'decimal:6',
        'duration_ms' => 'integer',
    ];

    public function todo(): BelongsTo
    {
        return $this->belongsTo(Todo::class);
    }

    public function isRunning(): bool
    {
        return in_array($this->status, ['starting', 'running']);
    }

    public function markAsRunning(): void
    {
        $this->update([
            'status' => 'running',
            'started_at' => now(),
        ]);
    }

    public function markAsCompleted(): void
    {
        $this->update([
            'status' => 'completed',
            'completed_at' => now(),
        ]);
    }

    public function markAsFailed(string $error): void
    {
        $this->update([
            'status' => 'failed',
            'last_error' => $error,
            'completed_at' => now(),
        ]);
    }

    public function markAsCancelled(): void
    {
        $this->update([
            'status' => 'cancelled',
            'completed_at' => now(),
        ]);
    }

    /**
     * Update Claude session ID (from Claude's init response).
     */
    public function setClaudeSessionId(string $sessionId): void
    {
        $this->update(['claude_session_id' => $sessionId]);
    }

    /**
     * Update last message UUID (for resume functionality).
     */
    public function setLastMessageUuid(string $uuid): void
    {
        $this->update(['last_message_uuid' => $uuid]);
    }

    /**
     * Update cost and duration from result.
     */
    public function setResultMetrics(?float $costUsd, ?int $durationMs): void
    {
        $this->update([
            'cost_usd' => $costUsd,
            'duration_ms' => $durationMs,
        ]);
    }

    /**
     * Get the latest completed session for a todo that can be resumed.
     */
    public static function getLatestResumableForTodo(int $todoId): ?self
    {
        return self::where('todo_id', $todoId)
            ->whereNotNull('claude_session_id')
            ->whereIn('status', ['completed', 'cancelled'])
            ->orderBy('completed_at', 'desc')
            ->first();
    }

    /**
     * Check if this session can be resumed.
     */
    public function canResume(): bool
    {
        return !empty($this->claude_session_id) &&
               in_array($this->status, ['completed', 'cancelled']);
    }
}
