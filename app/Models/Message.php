<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Message extends Model
{
    protected $fillable = [
        'chat_id',
        'role',
        'content',
        'is_streaming',
        'stream_session_key',
        'metadata',
    ];

    protected $casts = [
        'is_streaming' => 'boolean',
        'metadata' => 'array',
    ];

    public function chat(): BelongsTo
    {
        return $this->belongsTo(Chat::class);
    }

    public function changes(): HasMany
    {
        return $this->hasMany(ChatChange::class);
    }
}
