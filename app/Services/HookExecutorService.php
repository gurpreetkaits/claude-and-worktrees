<?php

namespace App\Services;

use App\Models\Todo;
use App\Models\UserSetting;
use Symfony\Component\Process\Process;

class HookExecutorService
{
    public function executeHooks(string $event, Todo $todo, ?string $filePath = null): array
    {
        $results = [];
        $settings = UserSetting::first();

        if (!$settings || empty($settings->hooks)) {
            return $results;
        }

        $workingDirectory = $todo->worktree->path ?? getcwd();

        foreach ($settings->hooks as $hook) {
            if (!($hook['enabled'] ?? true)) {
                continue;
            }

            if (($hook['event'] ?? '') !== $event) {
                continue;
            }

            if (!$this->matchesPattern($hook['directory_pattern'] ?? '*', $workingDirectory, $filePath)) {
                continue;
            }

            $command = $hook['command'] ?? '';
            if (empty($command)) {
                continue;
            }

            $result = $this->executeCommand($command, $workingDirectory, $todo, $filePath);
            $results[] = [
                'hook_id' => $hook['id'] ?? null,
                'event' => $event,
                'command' => $command,
                ...$result,
            ];
        }

        return $results;
    }

    private function matchesPattern(string $pattern, string $directory, ?string $filePath): bool
    {
        if ($pattern === '*') {
            return true;
        }

        $pathToMatch = $filePath ?? $directory;

        if (fnmatch($pattern, $pathToMatch)) {
            return true;
        }

        if (fnmatch($pattern, basename($pathToMatch))) {
            return true;
        }

        return false;
    }

    private function executeCommand(string $command, string $workingDirectory, Todo $todo, ?string $filePath): array
    {
        $env = [
            'WORKTREE_PATH' => $workingDirectory,
            'WORKTREE_NAME' => $todo->worktree->name ?? '',
            'WORKTREE_BRANCH' => $todo->worktree->branch ?? '',
            'TODO_ID' => (string) $todo->id,
            'TODO_TITLE' => $todo->title,
            'TODO_STATUS' => $todo->status,
        ];

        if ($filePath) {
            $env['FILE_PATH'] = $filePath;
            $env['FILE_NAME'] = basename($filePath);
        }

        try {
            $process = Process::fromShellCommandline($command, $workingDirectory, array_merge(getenv(), $env));
            $process->setTimeout(60);
            $process->run();

            return [
                'success' => $process->isSuccessful(),
                'output' => $process->getOutput(),
                'error' => $process->getErrorOutput(),
                'exit_code' => $process->getExitCode(),
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'output' => '',
                'error' => $e->getMessage(),
                'exit_code' => -1,
            ];
        }
    }
}
