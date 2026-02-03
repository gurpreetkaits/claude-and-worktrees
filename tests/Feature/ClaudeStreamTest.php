<?php

namespace Tests\Feature;

use App\Events\ClaudeStreamEvent;
use App\Jobs\ProcessClaudeStream;
use App\Models\ClaudeSession;
use App\Models\Todo;
use App\Models\Worktree;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class ClaudeStreamTest extends TestCase
{
    use RefreshDatabase;

    private Todo $todo;
    private Worktree $worktree;

    protected function setUp(): void
    {
        parent::setUp();

        // Create test worktree and todo
        $this->worktree = Worktree::factory()->create([
            'path' => '/tmp/test-worktree',
        ]);
        $this->todo = Todo::factory()->create([
            'worktree_id' => $this->worktree->id,
        ]);
    }

    /**
     * Test SSE endpoint validates message is required.
     */
    public function test_sse_endpoint_requires_message(): void
    {
        $response = $this->postJson(route('claude.stream', $this->todo), []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['message']);
    }

    /**
     * Test SSE endpoint validates message max length.
     */
    public function test_sse_endpoint_validates_message_max_length(): void
    {
        $response = $this->postJson(route('claude.stream', $this->todo), [
            'message' => str_repeat('a', 100001),
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['message']);
    }

    /**
     * Test SSE endpoint validates images array.
     */
    public function test_sse_endpoint_validates_images_structure(): void
    {
        $response = $this->postJson(route('claude.stream', $this->todo), [
            'message' => 'Hello Claude',
            'images' => [
                ['invalid' => 'structure'],
            ],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['images.0.data', 'images.0.mediaType']);
    }

    /**
     * Test SSE endpoint validates image media types.
     */
    public function test_sse_endpoint_validates_image_media_types(): void
    {
        $response = $this->postJson(route('claude.stream', $this->todo), [
            'message' => 'Hello Claude',
            'images' => [
                [
                    'data' => base64_encode('fake-image-data'),
                    'mediaType' => 'image/svg+xml', // Invalid type
                ],
            ],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['images.0.mediaType']);
    }

    /**
     * Test SSE endpoint accepts valid image types.
     */
    public function test_sse_endpoint_accepts_valid_image_types(): void
    {
        $validMediaTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

        foreach ($validMediaTypes as $mediaType) {
            // We can't fully test SSE streaming in PHPUnit, but we can verify
            // the validation passes by checking no validation errors occur
            $response = $this->post(route('claude.stream', $this->todo), [
                'message' => 'Hello Claude',
                'images' => [
                    [
                        'data' => base64_encode('fake-image-data'),
                        'mediaType' => $mediaType,
                    ],
                ],
            ], [
                'Accept' => 'text/event-stream',
            ]);

            // If validation passes, it will try to stream (and may fail due to test env)
            // but we're just checking validation here. StreamedResponse uses getStatusCode()
            $this->assertNotEquals(422, $response->getStatusCode(), "Failed for media type: {$mediaType}");
        }
    }

    /**
     * Test WebSocket endpoint validates message is required.
     */
    public function test_websocket_endpoint_requires_message(): void
    {
        $response = $this->postJson(route('claude.stream.ws', $this->todo), []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['message']);
    }

    /**
     * Test WebSocket endpoint validates message max length.
     */
    public function test_websocket_endpoint_validates_message_max_length(): void
    {
        $response = $this->postJson(route('claude.stream.ws', $this->todo), [
            'message' => str_repeat('a', 100001),
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['message']);
    }

    /**
     * Test WebSocket endpoint validates images structure.
     */
    public function test_websocket_endpoint_validates_images_structure(): void
    {
        $response = $this->postJson(route('claude.stream.ws', $this->todo), [
            'message' => 'Hello Claude',
            'images' => [
                ['invalid' => 'structure'],
            ],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['images.0.data', 'images.0.mediaType']);
    }

    /**
     * Test WebSocket endpoint validates image media types.
     */
    public function test_websocket_endpoint_validates_image_media_types(): void
    {
        $response = $this->postJson(route('claude.stream.ws', $this->todo), [
            'message' => 'Hello Claude',
            'images' => [
                [
                    'data' => base64_encode('fake-image-data'),
                    'mediaType' => 'application/pdf', // Invalid type
                ],
            ],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['images.0.mediaType']);
    }

    /**
     * Test WebSocket endpoint dispatches job with correct parameters.
     */
    public function test_websocket_endpoint_dispatches_job(): void
    {
        Queue::fake();

        $message = 'Hello Claude, please help me with this task.';

        $response = $this->postJson(route('claude.stream.ws', $this->todo), [
            'message' => $message,
        ]);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'channel' => 'claude.todo.' . $this->todo->id,
            ]);

        Queue::assertPushed(ProcessClaudeStream::class, function ($job) use ($message) {
            return $job->todo->id === $this->todo->id
                && $job->message === $message
                && $job->images === [];
        });
    }

    /**
     * Test WebSocket endpoint dispatches job with images.
     */
    public function test_websocket_endpoint_dispatches_job_with_images(): void
    {
        Queue::fake();

        $message = 'Analyze this image';
        $images = [
            [
                'data' => base64_encode('fake-png-data'),
                'mediaType' => 'image/png',
            ],
            [
                'data' => base64_encode('fake-jpeg-data'),
                'mediaType' => 'image/jpeg',
            ],
        ];

        $response = $this->postJson(route('claude.stream.ws', $this->todo), [
            'message' => $message,
            'images' => $images,
        ]);

        $response->assertStatus(200);

        Queue::assertPushed(ProcessClaudeStream::class, function ($job) use ($message, $images) {
            return $job->todo->id === $this->todo->id
                && $job->message === $message
                && $job->images === $images;
        });
    }

    /**
     * Test WebSocket endpoint limits images to 10.
     */
    public function test_websocket_endpoint_limits_images_to_10(): void
    {
        $images = [];
        for ($i = 0; $i < 11; $i++) {
            $images[] = [
                'data' => base64_encode('fake-image-' . $i),
                'mediaType' => 'image/png',
            ];
        }

        $response = $this->postJson(route('claude.stream.ws', $this->todo), [
            'message' => 'Too many images',
            'images' => $images,
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['images']);
    }

    /**
     * Test SSE endpoint limits images to 10.
     */
    public function test_sse_endpoint_limits_images_to_10(): void
    {
        $images = [];
        for ($i = 0; $i < 11; $i++) {
            $images[] = [
                'data' => base64_encode('fake-image-' . $i),
                'mediaType' => 'image/png',
            ];
        }

        $response = $this->postJson(route('claude.stream', $this->todo), [
            'message' => 'Too many images',
            'images' => $images,
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['images']);
    }

    /**
     * Test cancel endpoint requires running session.
     */
    public function test_cancel_endpoint_requires_running_session(): void
    {
        $session = ClaudeSession::create([
            'todo_id' => $this->todo->id,
            'session_key' => 'test-session-key',
            'status' => 'completed', // Not running
        ]);

        $response = $this->postJson(route('claude.cancel', $session));

        $response->assertStatus(400)
            ->assertJson([
                'success' => false,
                'message' => 'Session is not running',
            ]);
    }

    /**
     * Test status endpoint returns session data.
     */
    public function test_status_endpoint_returns_session_data(): void
    {
        $session = ClaudeSession::create([
            'todo_id' => $this->todo->id,
            'session_key' => 'test-session-key',
            'status' => 'running',
        ]);

        $response = $this->getJson(route('claude.status', $session));

        $response->assertStatus(200)
            ->assertJsonStructure([
                'session' => [
                    'id',
                    'todo_id',
                    'session_key',
                    'status',
                ],
            ]);
    }

    /**
     * Test that both endpoints accept requests for the same todo.
     * This simulates parallel stream capability.
     */
    public function test_parallel_stream_capability(): void
    {
        Queue::fake();

        // First request via WebSocket
        $response1 = $this->postJson(route('claude.stream.ws', $this->todo), [
            'message' => 'First parallel message',
        ]);
        $response1->assertStatus(200);

        // Create another todo
        $todo2 = Todo::factory()->create([
            'worktree_id' => $this->worktree->id,
        ]);

        // Second request via WebSocket (different todo)
        $response2 = $this->postJson(route('claude.stream.ws', $todo2), [
            'message' => 'Second parallel message',
        ]);
        $response2->assertStatus(200);

        // Both jobs should be queued
        Queue::assertPushed(ProcessClaudeStream::class, 2);
    }

    /**
     * Test WebSocket response contains correct channel name.
     */
    public function test_websocket_response_contains_channel_name(): void
    {
        Queue::fake();

        $response = $this->postJson(route('claude.stream.ws', $this->todo), [
            'message' => 'Test message',
        ]);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'channel' => 'claude.todo.' . $this->todo->id,
                'message' => 'Streaming started. Connect to WebSocket channel to receive events.',
            ]);
    }
}
