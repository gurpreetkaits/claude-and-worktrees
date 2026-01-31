<?php

namespace App\Http\Controllers;

use App\Models\UserSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    public function show(): JsonResponse
    {
        $settings = UserSetting::getSettings();

        return response()->json($settings);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'default_projects_directory' => 'nullable|string|max:500',
            'default_context' => 'nullable|string',
            'default_model' => 'nullable|string|in:sonnet,opus,haiku',
            'skip_permissions' => 'nullable|boolean',
            'auto_commit' => 'nullable|boolean',
            'show_hidden_files' => 'nullable|boolean',
            'hooks' => 'nullable|array',
            'hooks.*.id' => 'required|string',
            'hooks.*.directory_pattern' => 'required|string',
            'hooks.*.command' => 'required|string',
            'hooks.*.event' => 'required|string|in:before_change,after_change',
            'hooks.*.enabled' => 'required|boolean',
        ]);

        $settings = UserSetting::getSettings();
        $settings->update($validated);

        return response()->json($settings);
    }
}
