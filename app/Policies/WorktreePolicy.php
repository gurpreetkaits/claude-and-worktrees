<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Worktree;

class WorktreePolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Worktree $worktree): bool
    {
        return $user->id === $worktree->user_id;
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, Worktree $worktree): bool
    {
        return $user->id === $worktree->user_id;
    }

    public function delete(User $user, Worktree $worktree): bool
    {
        return $user->id === $worktree->user_id;
    }
}
