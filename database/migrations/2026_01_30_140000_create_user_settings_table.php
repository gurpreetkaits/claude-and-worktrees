<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('default_projects_directory')->nullable();
            $table->text('default_context')->nullable();
            $table->string('default_model')->default('sonnet');
            $table->boolean('skip_permissions')->default(false);
            $table->boolean('auto_commit')->default(false);
            $table->boolean('show_hidden_files')->default(false);
            $table->json('hooks')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_settings');
    }
};
