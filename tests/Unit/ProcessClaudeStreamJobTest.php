<?php

namespace Tests\Unit;

use App\Jobs\ProcessClaudeStream;
use App\Models\Todo;
use App\Models\Worktree;
use App\Services\Claude\WebSocketStreamService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class ProcessClaudeStreamJobTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Test job constructor stores all parameters.
     */
    public function test_job_stores_all_parameters(): void
    {
        $worktree = Worktree::factory()->create();
        $todo = Todo::factory()->create(['worktree_id' => $worktree->id]);
        $message = 'Test message';
        $images = [
            ['data' => 'base64data', 'mediaType' => 'image/png'],
        ];

        $job = new ProcessClaudeStream($todo, $message, $images);

        $this->assertEquals($todo->id, $job->todo->id);
        $this->assertEquals($message, $job->message);
        $this->assertEquals($images, $job->images);
    }

    /**
     * Test job defaults to empty images array.
     */
    public function test_job_defaults_to_empty_images(): void
    {
        $worktree = Worktree::factory()->create();
        $todo = Todo::factory()->create(['worktree_id' => $worktree->id]);

        $job = new ProcessClaudeStream($todo, 'Test message');

        $this->assertEquals([], $job->images);
    }

    /**
     * Test job passes all parameters to stream service.
     */
    public function test_job_passes_parameters_to_service(): void
    {
        $worktree = Worktree::factory()->create();
        $todo = Todo::factory()->create(['worktree_id' => $worktree->id]);
        $message = 'Test message';
        $images = [
            ['data' => 'base64data', 'mediaType' => 'image/png'],
        ];

        // Mock the WebSocketStreamService
        $mockService = Mockery::mock(WebSocketStreamService::class);
        $mockService->shouldReceive('stream')
            ->once()
            ->withArgs(function ($passedTodo, $passedMessage, $passedImages) use ($todo, $message, $images) {
                return $passedTodo->id === $todo->id
                    && $passedMessage === $message
                    && $passedImages === $images;
            });

        $job = new ProcessClaudeStream($todo, $message, $images);
        $job->handle($mockService);

        // Mockery assertions are verified automatically
        $this->assertTrue(true);
    }

    /**
     * Test job has correct configuration.
     */
    public function test_job_has_correct_configuration(): void
    {
        $worktree = Worktree::factory()->create();
        $todo = Todo::factory()->create(['worktree_id' => $worktree->id]);

        $job = new ProcessClaudeStream($todo, 'Test');

        $this->assertEquals(1, $job->tries);
        $this->assertEquals(0, $job->timeout); // No timeout for long-running Claude tasks
    }
}
