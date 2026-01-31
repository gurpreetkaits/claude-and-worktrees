<?php

namespace App\Jobs;

use App\Models\Todo;
use App\Services\Claude\WebSocketStreamService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ProcessClaudeStream implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * The number of times the job may be attempted.
     */
    public int $tries = 1;

    /**
     * The maximum number of seconds the job can run.
     */
    public int $timeout = 0; // No timeout for long-running Claude tasks

    /**
     * Create a new job instance.
     */
    public function __construct(
        public Todo $todo,
        public string $message
    ) {}

    /**
     * Execute the job.
     */
    public function handle(WebSocketStreamService $streamService): void
    {
        $streamService->stream($this->todo, $this->message);
    }

    /**
     * Handle a job failure.
     */
    public function failed(?\Throwable $exception): void
    {
        $this->todo->markAsFailed();

        // Broadcast the error
        broadcast(new \App\Events\ClaudeStreamEvent(
            $this->todo->id,
            'error',
            ['message' => $exception?->getMessage() ?? 'Job failed']
        ));
    }
}
