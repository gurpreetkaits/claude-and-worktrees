<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QueuedMessage extends Model
{
    protected $fillable = [
        'todo_id',
        'content',
        'images',
        'status',
        'queued_at',
        'processed_at',
    ];

    protected $casts = [
        'images' => 'array',
        'queued_at' => 'datetime',
        'processed_at' => 'datetime',
    ];

    public function todo(): BelongsTo
    {
        return $this->belongsTo(Todo::class);
    }

    /**
     * Queue a new message for a todo.
     */
    public static function queueForTodo(Todo $todo, string $content, array $images = []): self
    {
        // Cancel any existing pending messages for this todo
        self::where('todo_id', $todo->id)
            ->where('status', 'pending')
            ->update(['status' => 'cancelled']);

        return self::create([
            'todo_id' => $todo->id,
            'content' => $content,
            'images' => $images,
            'status' => 'pending',
            'queued_at' => now(),
        ]);
    }

    /**
     * Get and claim the next pending message for a todo.
     */
    public static function claimNextForTodo(Todo $todo): ?self
    {
        $message = self::where('todo_id', $todo->id)
            ->where('status', 'pending')
            ->orderBy('queued_at')
            ->first();

        if ($message) {
            $message->update(['status' => 'processing']);
        }

        return $message;
    }

    /**
     * Check if there are pending messages for a todo.
     */
    public static function hasPendingForTodo(Todo $todo): bool
    {
        return self::where('todo_id', $todo->id)
            ->where('status', 'pending')
            ->exists();
    }

    /**
     * Mark as completed.
     */
    public function markAsCompleted(): void
    {
        $this->update([
            'status' => 'completed',
            'processed_at' => now(),
        ]);
    }

    /**
     * Mark as failed.
     */
    public function markAsFailed(): void
    {
        $this->update([
            'status' => 'failed',
            'processed_at' => now(),
        ]);
    }
}
