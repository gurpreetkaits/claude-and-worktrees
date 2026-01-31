<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserSetting extends Model
{
    protected $fillable = [
        'user_id',
        'default_projects_directory',
        'default_context',
        'default_model',
        'skip_permissions',
        'auto_commit',
        'show_hidden_files',
        'hooks',
    ];

    protected $casts = [
        'skip_permissions' => 'boolean',
        'auto_commit' => 'boolean',
        'show_hidden_files' => 'boolean',
        'hooks' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the settings instance, creating one if it doesn't exist.
     * Since this app doesn't use authentication, we use a null user_id.
     */
    public static function getSettings(): self
    {
        return self::firstOrCreate(
            ['user_id' => null],
            [
                'default_projects_directory' => null,
                'default_context' => null,
                'default_model' => 'sonnet',
                'skip_permissions' => false,
                'auto_commit' => false,
                'show_hidden_files' => false,
                'hooks' => [],
            ]
        );
    }
}
