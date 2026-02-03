<?php

namespace Database\Factories;

use App\Models\Todo;
use App\Models\Worktree;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Todo>
 */
class TodoFactory extends Factory
{
    protected $model = Todo::class;

    /**
     * Define the model's default state.
     */
    public function definition(): array
    {
        return [
            'worktree_id' => Worktree::factory(),
            'title' => fake()->sentence(4),
            'description' => fake()->paragraph(),
            'model' => 'sonnet',
            'status' => 'pending',
            'is_archived' => false,
            'position' => fake()->numberBetween(0, 100),
        ];
    }

    /**
     * Indicate that the todo is running.
     */
    public function running(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'running',
        ]);
    }

    /**
     * Indicate that the todo is completed.
     */
    public function completed(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'completed',
        ]);
    }

    /**
     * Indicate that the todo has failed.
     */
    public function failed(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'failed',
        ]);
    }

    /**
     * Indicate that the todo is archived.
     */
    public function archived(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_archived' => true,
        ]);
    }

    /**
     * Set pre and post commands.
     */
    public function withCommands(string $preCommand = 'echo "pre"', string $postCommand = 'echo "post"'): static
    {
        return $this->state(fn (array $attributes) => [
            'pre_command' => $preCommand,
            'post_command' => $postCommand,
        ]);
    }
}
