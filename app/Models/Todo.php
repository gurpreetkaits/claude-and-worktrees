<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Todo extends Model
{
    use HasFactory;
    protected $fillable = [
        'worktree_id',
        'title',
        'description',
        'model',
        'context',
        'pre_command',
        'post_command',
        'message_prefix',
        'message_suffix',
        'status',
        'is_archived',
        'position',
    ];

    public function worktree(): BelongsTo
    {
        return $this->belongsTo(Worktree::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    public function changes(): HasMany
    {
        return $this->hasMany(TodoChange::class);
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(ClaudeSession::class);
    }

    public function markAsRunning(): void
    {
        $this->update(['status' => 'running']);
    }

    public function markAsCompleted(): void
    {
        $this->update(['status' => 'completed']);
    }

    public function markAsFailed(): void
    {
        $this->update(['status' => 'failed']);
    }

    public function markAsCancelled(): void
    {
        $this->update(['status' => 'cancelled']);
    }

    public function markAsQa(): void
    {
        $this->update(['status' => 'qa']);
    }

    public function isQa(): bool
    {
        return $this->status === 'qa';
    }

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    public function isRunning(): bool
    {
        return $this->status === 'running';
    }

    public function archive(): void
    {
        $this->update(['is_archived' => true]);
    }

    public function unarchive(): void
    {
        $this->update(['is_archived' => false]);
    }

    public function isArchived(): bool
    {
        return $this->is_archived;
    }
}
