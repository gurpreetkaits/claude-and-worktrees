<?php

namespace App\Services;

use App\Models\ClaudeSession;
use App\Models\Todo;
use Generator;
use Symfony\Component\Process\Process;

class ClaudeProcessService
{
    private ?Process $process = null;

    /**
     * Run a pre-command before starting Claude.
     */
    public function runPreCommand(string $workingDirectory, ?string $command): ?array
    {
        if (empty($command)) {
            return null;
        }

        $process = Process::fromShellCommandline($command, $workingDirectory);
        $process->setTimeout(60);
        $process->run();

        return [
            'success' => $process->isSuccessful(),
            'output' => $process->getOutput(),
            'error' => $process->getErrorOutput(),
            'exit_code' => $process->getExitCode(),
        ];
    }

    /**
     * Run a post-command after Claude finishes.
     */
    public function runPostCommand(string $workingDirectory, ?string $command): ?array
    {
        return $this->runPreCommand($workingDirectory, $command);
    }

    /**
     * Start a Claude CLI process and stream its output.
     *
     * @param string $workingDirectory The directory to run Claude in
     * @param string $prompt The user's prompt to send to Claude
     * @param ClaudeSession $session The session to track this process
     * @param string $model The Claude model to use (sonnet, opus, haiku)
     * @return Generator Yields parsed JSON objects from Claude's output
     */
    public function stream(string $workingDirectory, string $prompt, ClaudeSession $session, string $model = 'sonnet'): Generator
    {
        $command = $this->buildCommand($model);

        $this->process = new Process($command, $workingDirectory);
        $this->process->setTimeout(config('claude.process_timeout'));

        // Start the process
        $this->process->start();

        // Update session with process ID
        $session->update(['process_id' => (string) $this->process->getPid()]);
        $session->markAsRunning();

        // Send the prompt as JSON input
        $input = json_encode([
            'type' => 'user_message',
            'message' => $prompt,
        ]) . "\n";

        $this->process->setInput($input);

        $buffer = '';

        // Stream stdout line by line
        foreach ($this->process as $type => $data) {
            if ($type === Process::OUT) {
                $buffer .= $data;

                // Process complete lines
                while (($pos = strpos($buffer, "\n")) !== false) {
                    $line = substr($buffer, 0, $pos);
                    $buffer = substr($buffer, $pos + 1);

                    if (empty(trim($line))) {
                        continue;
                    }

                    $parsed = $this->parseLine($line);
                    if ($parsed !== null) {
                        yield $parsed;
                    }
                }
            } elseif ($type === Process::ERR) {
                // Yield error output as debug info
                yield [
                    'type' => 'debug',
                    'content' => $data,
                ];
            }
        }

        // Process any remaining buffer
        if (!empty(trim($buffer))) {
            $parsed = $this->parseLine($buffer);
            if ($parsed !== null) {
                yield $parsed;
            }
        }

        // Check process exit status
        $exitCode = $this->process->getExitCode();

        if ($exitCode === 0) {
            $session->markAsCompleted();
        } elseif ($this->process->isTerminated() && $this->process->getTermSignal() === 15) {
            // SIGTERM - process was cancelled
            $session->markAsCancelled();
        } else {
            $session->markAsFailed("Process exited with code: {$exitCode}");
        }

        $this->process = null;
    }

    /**
     * Cancel the running process.
     */
    public function cancel(): bool
    {
        if ($this->process && $this->process->isRunning()) {
            $this->process->signal(15); // SIGTERM
            return true;
        }

        return false;
    }

    /**
     * Cancel a session by its process ID.
     */
    public static function cancelByProcessId(string $processId): bool
    {
        if (empty($processId)) {
            return false;
        }

        // Send SIGTERM to the process
        $result = posix_kill((int) $processId, 15);

        return $result;
    }

    /**
     * Check if a process is still running by PID.
     */
    public static function isProcessRunning(string $processId): bool
    {
        if (empty($processId)) {
            return false;
        }

        // posix_kill with signal 0 checks if process exists
        return posix_kill((int) $processId, 0);
    }

    /**
     * Build the Claude CLI command.
     */
    private function buildCommand(string $model = 'sonnet'): array
    {
        $command = [config('claude.command')];
        $command[] = config('claude.package');

        foreach (config('claude.flags') as $flag) {
            $command[] = $flag;
        }

        // Add model flag
        $models = config('claude.models');
        if (isset($models[$model])) {
            $command[] = $models[$model]['flag'];
        }

        return $command;
    }

    /**
     * Parse a line of output from Claude CLI.
     */
    private function parseLine(string $line): ?array
    {
        $line = trim($line);

        if (empty($line)) {
            return null;
        }

        $decoded = json_decode($line, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            // Not valid JSON, return as raw text
            return [
                'type' => 'raw',
                'content' => $line,
            ];
        }

        return $decoded;
    }
}
