<?php

namespace App\Console\Commands;

use App\Models\ClaudeSession;
use App\Services\ClaudeProcessService;
use Illuminate\Console\Command;

class CleanupClaudeSessions extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'claude:cleanup
                            {--timeout= : Override the default timeout in minutes}
                            {--dry-run : Show what would be cleaned up without making changes}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Kill orphaned Claude CLI processes and clean up stale sessions';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $timeout = $this->option('timeout') ?? config('claude.session_timeout', 30);
        $dryRun = $this->option('dry-run');

        $this->info("Looking for sessions running longer than {$timeout} minutes...");

        $cutoff = now()->subMinutes($timeout);

        // Find orphaned sessions (running status but started too long ago)
        $orphanedSessions = ClaudeSession::query()
            ->whereIn('status', ['starting', 'running'])
            ->where(function ($query) use ($cutoff) {
                $query->where('started_at', '<', $cutoff)
                    ->orWhere(function ($q) use ($cutoff) {
                        $q->whereNull('started_at')
                            ->where('created_at', '<', $cutoff);
                    });
            })
            ->get();

        if ($orphanedSessions->isEmpty()) {
            $this->info('No orphaned sessions found.');
            return Command::SUCCESS;
        }

        $this->info("Found {$orphanedSessions->count()} orphaned session(s).");

        $killed = 0;
        $failed = 0;

        foreach ($orphanedSessions as $session) {
            $this->line("Processing session {$session->session_key}...");

            if ($dryRun) {
                $this->warn("  [DRY RUN] Would kill process {$session->process_id} and mark session as failed");
                continue;
            }

            // Try to kill the process if it has a PID
            if ($session->process_id) {
                $isRunning = ClaudeProcessService::isProcessRunning($session->process_id);

                if ($isRunning) {
                    $result = ClaudeProcessService::cancelByProcessId($session->process_id);

                    if ($result) {
                        $this->info("  Killed process {$session->process_id}");
                        $killed++;
                    } else {
                        $this->error("  Failed to kill process {$session->process_id}");
                        $failed++;
                    }
                } else {
                    $this->line("  Process {$session->process_id} is not running");
                }
            }

            // Mark session as failed
            $session->markAsFailed('Session timed out and was cleaned up');
            $this->info("  Marked session as failed");
        }

        $this->newLine();
        $this->info("Cleanup complete: {$killed} process(es) killed, {$failed} failed to kill");

        return $failed > 0 ? Command::FAILURE : Command::SUCCESS;
    }
}
