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
        'is_autonomous',
        'autonomous_max_iterations',
        'autonomous_current_iteration',
        'autonomous_phase',
    ];

    protected $casts = [
        'is_autonomous' => 'boolean',
        'is_archived' => 'boolean',
        'autonomous_max_iterations' => 'integer',
        'autonomous_current_iteration' => 'integer',
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

    public function isAutonomous(): bool
    {
        return $this->is_autonomous;
    }

    public function incrementAutonomousIteration(): int
    {
        $this->increment('autonomous_current_iteration');
        return $this->fresh()->autonomous_current_iteration;
    }

    public function hasReachedMaxIterations(): bool
    {
        return $this->autonomous_current_iteration >= $this->autonomous_max_iterations;
    }

    public function setAutonomousPhase(string $phase): void
    {
        $this->update(['autonomous_phase' => $phase]);
    }

    public function markAsAutonomousCompleted(): void
    {
        $this->update([
            'status' => 'completed',
            'autonomous_phase' => 'completed',
        ]);
    }

    public function markAsAutonomousFailed(): void
    {
        $this->update([
            'status' => 'failed',
            'autonomous_phase' => 'failed',
        ]);
    }
}
