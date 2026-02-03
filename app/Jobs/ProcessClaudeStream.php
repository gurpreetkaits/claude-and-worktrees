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
    public int $tries = 3;

    /**
     * The maximum number of seconds the job can run.
     */
    public int $timeout = 0; // No timeout for long-running Claude tasks

    /**
     * Create a new job instance.
     *
     * @param Todo $todo The todo to stream in
     * @param string $message The user's message content
     * @param array $images Array of images with 'data' (base64) and 'mediaType' keys
     */
    public function __construct(
        public Todo $todo,
        public string $message,
        public array $images = []
    ) {}

    /**
     * Execute the job.
     */
    public function handle(WebSocketStreamService $streamService): void
    {
        \Log::info("[ProcessClaudeStream] Starting job for todo {$this->todo->id}");

        try {
            $streamService->stream($this->todo, $this->message, $this->images);
            \Log::info("[ProcessClaudeStream] Completed job for todo {$this->todo->id}");
        } catch (\Throwable $e) {
            \Log::error("[ProcessClaudeStream] Job failed for todo {$this->todo->id}: " . $e->getMessage(), [
                'exception' => $e,
                'trace' => $e->getTraceAsString(),
            ]);
            throw $e;
        }
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
