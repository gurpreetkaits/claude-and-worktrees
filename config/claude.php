<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Claude CLI Command
    |--------------------------------------------------------------------------
    |
    | The command to invoke the Claude CLI. Typically 'npx' to run the
    | package directly without global installation.
    |
    */
    'command' => env('CLAUDE_COMMAND', 'npx'),

    /*
    |--------------------------------------------------------------------------
    | Claude CLI Package
    |--------------------------------------------------------------------------
    |
    | The npm package name and version for Claude Code CLI.
    |
    */
    'package' => env('CLAUDE_PACKAGE', '-y @anthropic-ai/claude-code'),

    /*
    |--------------------------------------------------------------------------
    | Claude CLI Flags
    |--------------------------------------------------------------------------
    |
    | Command line flags passed to the Claude CLI.
    | --output-format=stream-json: Stream JSON output for real-time parsing
    | --input-format=stream-json: Accept JSON input for bidirectional protocol
    | --verbose: Enable verbose output for debugging
    | --include-partial-messages: Show incomplete messages as they stream
    | --replay-user-messages: Replay conversation context
    | --permission-prompt-tool=stdio: Enable bidirectional permission protocol
    | --dangerously-skip-permissions: Skip all permission checks (for auto-approve mode)
    |
    */
    'flags' => [
        '--verbose',
        '--output-format=stream-json',
        '--input-format=stream-json',
        '--include-partial-messages',
        '--replay-user-messages',
    ],

    /*
    |--------------------------------------------------------------------------
    | Permission Mode
    |--------------------------------------------------------------------------
    |
    | Controls how Claude handles tool permissions:
    | - 'bypass': Skip all permissions (--dangerously-skip-permissions)
    | - 'default': Use stdio protocol for permission requests
    | - 'plan': Plan mode - review before execution
    |
    */
    'permission_mode' => env('CLAUDE_PERMISSION_MODE', 'bypass'),

    /*
    |--------------------------------------------------------------------------
    | Disallowed Tools
    |--------------------------------------------------------------------------
    |
    | Tools that Claude should not be allowed to use. AskUserQuestion is
    | disabled by default since we handle user interaction ourselves.
    |
    */
    'disallowed_tools' => env('CLAUDE_DISALLOWED_TOOLS', 'AskUserQuestion'),

    /*
    |--------------------------------------------------------------------------
    | Available Models
    |--------------------------------------------------------------------------
    |
    | The available Claude models for selection.
    |
    */
    'models' => [
        'sonnet' => [
            'name' => 'Claude Sonnet',
            'description' => 'Fast and efficient for most tasks',
            'flag' => '--model=sonnet',
        ],
        'opus' => [
            'name' => 'Claude Opus',
            'description' => 'Most capable for complex tasks',
            'flag' => '--model=opus',
        ],
        'haiku' => [
            'name' => 'Claude Haiku',
            'description' => 'Fastest for simple tasks',
            'flag' => '--model=haiku',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Default Model
    |--------------------------------------------------------------------------
    |
    | The default model to use when none is specified.
    |
    */
    'default_model' => env('CLAUDE_DEFAULT_MODEL', 'sonnet'),

    /*
    |--------------------------------------------------------------------------
    | Session Timeout
    |--------------------------------------------------------------------------
    |
    | Maximum time in minutes before a session is considered orphaned.
    |
    */
    'session_timeout' => env('CLAUDE_SESSION_TIMEOUT', 30),

    /*
    |--------------------------------------------------------------------------
    | Process Timeout
    |--------------------------------------------------------------------------
    |
    | Maximum time in seconds for the Claude CLI process to run.
    | Set to null for no timeout.
    |
    */
    'process_timeout' => env('CLAUDE_PROCESS_TIMEOUT', null),
];
