<?php

namespace Tests\Feature;

use App\Events\ClaudeStreamEvent;
use App\Models\Todo;
use App\Models\Worktree;
use Illuminate\Broadcasting\Channel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class ClaudeStreamEventTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Test ClaudeStreamEvent broadcasts on correct channel.
     */
    public function test_event_broadcasts_on_correct_channel(): void
    {
        $todoId = 123;
        $event = new ClaudeStreamEvent($todoId, 'text_delta', ['text' => 'Hello']);

        $channels = $event->broadcastOn();

        $this->assertCount(1, $channels);
        $this->assertInstanceOf(Channel::class, $channels[0]);
        $this->assertEquals('claude.todo.123', $channels[0]->name);
    }

    /**
     * Test ClaudeStreamEvent uses dynamic event name.
     */
    public function test_event_uses_dynamic_event_name(): void
    {
        $event = new ClaudeStreamEvent(1, 'text_delta', []);
        $this->assertEquals('text_delta', $event->broadcastAs());

        $event2 = new ClaudeStreamEvent(1, 'complete', []);
        $this->assertEquals('complete', $event2->broadcastAs());

        $event3 = new ClaudeStreamEvent(1, 'error', []);
        $this->assertEquals('error', $event3->broadcastAs());
    }

    /**
     * Test ClaudeStreamEvent broadcasts with correct data.
     */
    public function test_event_broadcasts_with_correct_data(): void
    {
        $data = [
            'text' => 'Hello world',
            'full_content' => 'Hello world',
        ];

        $event = new ClaudeStreamEvent(1, 'text_delta', $data);

        $this->assertEquals($data, $event->broadcastWith());
    }

    /**
     * Test all event types broadcast correctly.
     */
    public function test_all_event_types_broadcast_correctly(): void
    {
        $eventTypes = [
            'user_message' => ['message' => ['id' => 1, 'content' => 'Test']],
            'session_started' => ['session_key' => 'abc-123'],
            'text_delta' => ['text' => 'Hello', 'full_content' => 'Hello'],
            'thinking' => ['content' => 'Thinking...'],
            'tool_use' => ['id' => 'tool-1', 'tool' => 'Read', 'input' => ['file' => 'test.txt']],
            'tool_result' => ['tool_use_id' => 'tool-1', 'content' => 'File content', 'is_error' => false],
            'result' => ['cost_usd' => 0.001, 'duration_ms' => 1500],
            'complete' => ['message' => ['id' => 2, 'content' => 'Done']],
            'error' => ['message' => 'Something went wrong'],
            'permission_denied' => ['tool' => 'Bash', 'reason' => 'Unsafe command'],
            'pre_command_start' => ['command' => 'npm test'],
            'pre_command_result' => ['success' => true, 'output' => 'Tests passed'],
            'post_command_start' => ['command' => 'npm run build'],
            'post_command_result' => ['success' => true, 'output' => 'Build complete'],
            'hook_executed' => ['hook_id' => 'h1', 'event' => 'task_completed', 'success' => true],
        ];

        foreach ($eventTypes as $eventType => $data) {
            $event = new ClaudeStreamEvent(42, $eventType, $data);

            $this->assertEquals('claude.todo.42', $event->broadcastOn()[0]->name);
            $this->assertEquals($eventType, $event->broadcastAs());
            $this->assertEquals($data, $event->broadcastWith());
        }
    }

    /**
     * Test event can be broadcast using the broadcast helper.
     */
    public function test_event_can_be_broadcast(): void
    {
        Event::fake([ClaudeStreamEvent::class]);

        $worktree = Worktree::factory()->create();
        $todo = Todo::factory()->create(['worktree_id' => $worktree->id]);

        broadcast(new ClaudeStreamEvent($todo->id, 'text_delta', ['text' => 'Test']));

        Event::assertDispatched(ClaudeStreamEvent::class, function ($event) use ($todo) {
            return $event->todoId === $todo->id
                && $event->event === 'text_delta'
                && $event->data['text'] === 'Test';
        });
    }

    /**
     * Test multiple events for same todo use same channel.
     */
    public function test_multiple_events_same_todo_same_channel(): void
    {
        $todoId = 99;

        $events = [
            new ClaudeStreamEvent($todoId, 'session_started', ['session_key' => 'key1']),
            new ClaudeStreamEvent($todoId, 'text_delta', ['text' => 'Hello']),
            new ClaudeStreamEvent($todoId, 'text_delta', ['text' => ' World']),
            new ClaudeStreamEvent($todoId, 'complete', ['message' => []]),
        ];

        foreach ($events as $event) {
            $this->assertEquals('claude.todo.99', $event->broadcastOn()[0]->name);
        }
    }

    /**
     * Test different todos use different channels.
     */
    public function test_different_todos_use_different_channels(): void
    {
        $event1 = new ClaudeStreamEvent(1, 'text_delta', ['text' => 'Hello']);
        $event2 = new ClaudeStreamEvent(2, 'text_delta', ['text' => 'World']);

        $this->assertEquals('claude.todo.1', $event1->broadcastOn()[0]->name);
        $this->assertEquals('claude.todo.2', $event2->broadcastOn()[0]->name);
        $this->assertNotEquals(
            $event1->broadcastOn()[0]->name,
            $event2->broadcastOn()[0]->name
        );
    }
}
