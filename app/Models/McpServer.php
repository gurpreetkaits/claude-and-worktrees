<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class McpServer extends Model
{
    protected $fillable = [
        'name',
        'type',
        'command',
        'args',
        'env',
        'url',
        'headers',
        'enabled',
    ];

    protected $casts = [
        'args' => 'array',
        'env' => 'array',
        'headers' => 'array',
        'enabled' => 'boolean',
    ];

    /**
     * Get all enabled MCP servers formatted for Claude config.
     */
    public static function getEnabledServersConfig(): array
    {
        $servers = [];

        foreach (self::where('enabled', true)->get() as $server) {
            // Handle HTTP-type servers
            if ($server->type === 'http') {
                $config = [
                    'type' => 'http',
                    'url' => $server->url,
                ];

                if (!empty($server->headers)) {
                    $config['headers'] = $server->headers;
                }
            } else {
                // Default stdio-type servers
                $config = [
                    'command' => $server->command,
                ];

                if (!empty($server->args)) {
                    $config['args'] = $server->args;
                }

                if (!empty($server->env)) {
                    $config['env'] = $server->env;
                }
            }

            $servers[$server->name] = $config;
        }

        return $servers;
    }

    /**
     * Get the path to the Claude MCP config file.
     */
    public static function getConfigPath(): string
    {
        return getenv('HOME') . '/.claude.json';
    }

    /**
     * Read current Claude config.
     */
    public static function readClaudeConfig(): array
    {
        $path = self::getConfigPath();

        if (!file_exists($path)) {
            return [];
        }

        $content = file_get_contents($path);
        return json_decode($content, true) ?? [];
    }

    /**
     * Write MCP servers to Claude config file.
     */
    public static function syncToClaudeConfig(): bool
    {
        $path = self::getConfigPath();
        $config = self::readClaudeConfig();

        $config['mcpServers'] = self::getEnabledServersConfig();

        $json = json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

        return file_put_contents($path, $json) !== false;
    }
}
