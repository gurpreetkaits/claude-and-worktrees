<?php

namespace Database\Factories;

use App\Models\Worktree;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Worktree>
 */
class WorktreeFactory extends Factory
{
    protected $model = Worktree::class;

    /**
     * Define the model's default state.
     */
    public function definition(): array
    {
        return [
            'name' => fake()->words(2, true),
            'path' => '/tmp/test-worktree-' . fake()->uuid(),
            'branch' => 'feature/' . fake()->slug(2),
            'base_branch' => 'main',
            'is_main' => false,
        ];
    }

    /**
     * Indicate that the worktree is the main branch.
     */
    public function main(): static
    {
        return $this->state(fn (array $attributes) => [
            'branch' => 'main',
            'is_main' => true,
        ]);
    }
}
