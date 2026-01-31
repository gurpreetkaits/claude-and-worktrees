<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('todos', function (Blueprint $table) {
            $table->string('model')->default('sonnet');
            $table->text('context')->nullable();
            $table->text('pre_command')->nullable();
            $table->text('post_command')->nullable();
            $table->string('message_prefix')->nullable();
            $table->string('message_suffix')->nullable();
            $table->enum('status', ['pending', 'running', 'completed', 'failed'])->default('pending');
        });
    }

    public function down(): void
    {
        Schema::table('todos', function (Blueprint $table) {
            $table->dropColumn([
                'model',
                'context',
                'pre_command',
                'post_command',
                'message_prefix',
                'message_suffix',
                'status',
            ]);
        });
    }
};
