<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Worktree extends Model
{
    protected $fillable = [
        'name',
        'path',
        'branch',
        'base_branch',
        'is_main',
    ];

    protected $casts = [
        'is_main' => 'boolean',
    ];

    public function todos(): HasMany
    {
        return $this->hasMany(Todo::class);
    }
}
