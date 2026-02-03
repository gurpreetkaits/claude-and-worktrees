<?php

namespace App\Http\Controllers;

use App\Models\McpServer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class McpServerController extends Controller
{
    /**
     * List all MCP servers.
     */
    public function index(): JsonResponse
    {
        $servers = McpServer::orderBy('name')->get();

        return response()->json([
            'servers' => $servers,
        ]);
    }

    /**
     * Create a new MCP server.
     */
    public function store(Request $request): JsonResponse
    {
        $type = $request->input('type', 'stdio');

        $rules = [
            'name' => 'required|string|max:255|unique:mcp_servers,name',
            'type' => 'sometimes|in:stdio,http',
            'enabled' => 'boolean',
        ];

        // Different validation based on type
        if ($type === 'http') {
            $rules['url'] = 'required|string|url|max:2000';
            $rules['headers'] = 'nullable|array';
            $rules['command'] = 'nullable|string|max:1000';
            $rules['args'] = 'nullable|array';
            $rules['env'] = 'nullable|array';
        } else {
            $rules['command'] = 'required|string|max:1000';
            $rules['args'] = 'nullable|array';
            $rules['env'] = 'nullable|array';
            $rules['url'] = 'nullable|string|max:2000';
            $rules['headers'] = 'nullable|array';
        }

        $validated = $request->validate($rules);
        $validated['type'] = $type;

        $server = McpServer::create($validated);

        // Sync to Claude config file
        McpServer::syncToClaudeConfig();

        return response()->json([
            'server' => $server,
            'message' => 'MCP server created successfully',
        ], 201);
    }

    /**
     * Update an MCP server.
     */
    public function update(Request $request, McpServer $mcpServer): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255|unique:mcp_servers,name,' . $mcpServer->id,
            'type' => 'sometimes|in:stdio,http',
            'command' => 'nullable|string|max:1000',
            'args' => 'nullable|array',
            'env' => 'nullable|array',
            'url' => 'nullable|string|max:2000',
            'headers' => 'nullable|array',
            'enabled' => 'boolean',
        ]);

        $mcpServer->update($validated);

        // Sync to Claude config file
        McpServer::syncToClaudeConfig();

        return response()->json([
            'server' => $mcpServer->fresh(),
            'message' => 'MCP server updated successfully',
        ]);
    }

    /**
     * Delete an MCP server.
     */
    public function destroy(McpServer $mcpServer): JsonResponse
    {
        $mcpServer->delete();

        // Sync to Claude config file
        McpServer::syncToClaudeConfig();

        return response()->json([
            'message' => 'MCP server deleted successfully',
        ]);
    }

    /**
     * Toggle enabled status of an MCP server.
     */
    public function toggle(McpServer $mcpServer): JsonResponse
    {
        $mcpServer->update(['enabled' => !$mcpServer->enabled]);

        // Sync to Claude config file
        McpServer::syncToClaudeConfig();

        return response()->json([
            'server' => $mcpServer->fresh(),
            'enabled' => $mcpServer->enabled,
        ]);
    }

    /**
     * Get the current Claude config (for debugging).
     */
    public function getClaudeConfig(): JsonResponse
    {
        $config = McpServer::readClaudeConfig();

        return response()->json([
            'config' => $config,
            'config_path' => McpServer::getConfigPath(),
        ]);
    }

    /**
     * Sync MCP servers to Claude config file.
     */
    public function sync(): JsonResponse
    {
        $success = McpServer::syncToClaudeConfig();

        return response()->json([
            'success' => $success,
            'message' => $success ? 'Config synced successfully' : 'Failed to sync config',
        ]);
    }
}
