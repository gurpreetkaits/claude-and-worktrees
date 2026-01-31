<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\Process\Process;

class TerminalController extends Controller
{
    /**
     * Execute a command in the terminal.
     */
    public function execute(Request $request): JsonResponse
    {
        $request->validate([
            'command' => 'required|string|max:10000',
            'working_directory' => 'required|string',
        ]);

        $command = $request->input('command');
        $workingDirectory = $request->input('working_directory');

        // Validate working directory exists
        if (!is_dir($workingDirectory)) {
            return response()->json([
                'error' => 'Working directory does not exist',
                'output' => '',
                'exit_code' => 1,
            ], 400);
        }

        // Block dangerous commands
        $blockedPatterns = [
            '/\brm\s+(-[rf]+\s+)*[\/~]/', // rm -rf / or ~
            '/\bmkfs\b/',
            '/\bdd\s+.*of=\/dev/',
            '/>\s*\/dev\/[sh]d[a-z]/',
            '/\bshutdown\b/',
            '/\breboot\b/',
            '/\binit\s+0/',
            '/\bsudo\s+rm\s+-rf\s+\//',
        ];

        foreach ($blockedPatterns as $pattern) {
            if (preg_match($pattern, $command)) {
                return response()->json([
                    'error' => 'This command has been blocked for safety reasons.',
                    'output' => '',
                    'exit_code' => 1,
                ], 403);
            }
        }

        // Handle cd command specially - we can't actually change directory
        // but we can acknowledge it
        if (preg_match('/^\s*cd\s+/', $command)) {
            return response()->json([
                'output' => 'Note: Directory changes only affect the current command. Use the worktree path to work in a specific directory.',
                'exit_code' => 0,
            ]);
        }

        try {
            // Create process
            $process = Process::fromShellCommandline($command, $workingDirectory);
            $process->setTimeout(60); // 60 second timeout
            $process->run();

            $output = $process->getOutput();
            $errorOutput = $process->getErrorOutput();
            $exitCode = $process->getExitCode();

            // Combine stdout and stderr
            $combinedOutput = $output;
            if ($errorOutput) {
                if ($combinedOutput) {
                    $combinedOutput .= "\n";
                }
                $combinedOutput .= $errorOutput;
            }

            // Trim trailing newlines for cleaner display
            $combinedOutput = rtrim($combinedOutput, "\n");

            return response()->json([
                'output' => $combinedOutput,
                'exit_code' => $exitCode,
            ]);

        } catch (\Symfony\Component\Process\Exception\ProcessTimedOutException $e) {
            return response()->json([
                'error' => 'Command timed out after 60 seconds',
                'output' => '',
                'exit_code' => 124,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to execute command: ' . $e->getMessage(),
                'output' => '',
                'exit_code' => 1,
            ], 500);
        }
    }
}
