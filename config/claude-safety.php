<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Dangerous Command Patterns
    |--------------------------------------------------------------------------
    |
    | Regular expression patterns for commands that should NEVER be auto-approved.
    | These commands will be blocked even in bypass mode.
    |
    */
    'dangerous_patterns' => [
        // Database destruction
        '/\bartisan\s+(migrate:fresh|migrate:reset|migrate:rollback|db:wipe)/i',
        '/\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)/i',
        '/\bmysql.*-e\s*["\']?(DROP|TRUNCATE)/i',
        '/\bpsql.*-c\s*["\']?(DROP|TRUNCATE)/i',

        // File system destruction
        '/\brm\s+(-rf?|--recursive)\s+(\.|\/|~)/i',
        '/\brm\s+-[a-z]*f[a-z]*\s+(\.|\/|~)/i',
        '/>\s*\/dev\/sd[a-z]/i',
        '/\bmkfs\./i',
        '/\bdd\s+if=.*of=\/dev/i',

        // Sensitive file modification
        '/\b(rm|cat\s*>|truncate|>)\s*.*\.env/i',
        '/\bchmod\s+777\s+\//i',
        '/\bchown\s+-R\s+.*\s+\//i',

        // System destruction
        '/:(){ :|:& };:/i',  // Fork bomb
        '/\bsudo\s+rm\s+-rf\s+\//i',
        '/\bkill\s+-9\s+-1/i',
        '/\bshutdown/i',
        '/\breboot/i',

        // Git force operations
        '/\bgit\s+push\s+(-f|--force)/i',
        '/\bgit\s+reset\s+--hard\s+(HEAD~|origin)/i',
        '/\bgit\s+clean\s+-fd/i',
    ],

    /*
    |--------------------------------------------------------------------------
    | Protected Paths
    |--------------------------------------------------------------------------
    |
    | Paths that Claude should never modify or delete.
    | These are checked against Write/Edit/Bash operations.
    |
    */
    'protected_paths' => [
        '.env',
        '.env.local',
        '.env.production',
        'composer.lock',
        'package-lock.json',
        'yarn.lock',
        'pnpm-lock.yaml',
    ],

    /*
    |--------------------------------------------------------------------------
    | Protected Directories
    |--------------------------------------------------------------------------
    |
    | Directories Claude should not recursively delete.
    |
    */
    'protected_directories' => [
        '/',
        '/home',
        '/root',
        '/etc',
        '/var',
        '/usr',
        'node_modules',
        'vendor',
        '.git',
    ],

    /*
    |--------------------------------------------------------------------------
    | Allowed Write Extensions
    |--------------------------------------------------------------------------
    |
    | File extensions that Claude is allowed to create/modify.
    | Set to empty array to allow all extensions.
    |
    */
    'allowed_write_extensions' => [
        // Leave empty to allow all, or specify allowed extensions
        // 'php', 'js', 'ts', 'tsx', 'jsx', 'vue', 'css', 'scss', 'json', 'md', 'txt', 'yaml', 'yml',
    ],

    /*
    |--------------------------------------------------------------------------
    | Max File Size for Write
    |--------------------------------------------------------------------------
    |
    | Maximum file size in bytes that Claude can write.
    | This prevents accidental large file creation.
    |
    */
    'max_write_size' => 1024 * 1024, // 1MB

    /*
    |--------------------------------------------------------------------------
    | Require Confirmation Commands
    |--------------------------------------------------------------------------
    |
    | Commands that should require explicit user confirmation.
    | These won't be auto-approved but won't be blocked either.
    |
    */
    'require_confirmation' => [
        '/\bgit\s+(push|pull|merge|rebase)/i',
        '/\bcomposer\s+(install|update|require|remove)/i',
        '/\b(npm|yarn|pnpm)\s+(install|update|add|remove)/i',
        '/\bartisan\s+(migrate|seed)/i',
    ],
];
