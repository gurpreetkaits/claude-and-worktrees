<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('todos', function (Blueprint $table) {
            $table->boolean('is_autonomous')->default(false)->after('is_archived');
            $table->unsignedInteger('autonomous_max_iterations')->default(25)->after('is_autonomous');
            $table->unsignedInteger('autonomous_current_iteration')->default(0)->after('autonomous_max_iterations');
            $table->string('autonomous_phase')->nullable()->after('autonomous_current_iteration');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('todos', function (Blueprint $table) {
            $table->dropColumn([
                'is_autonomous',
                'autonomous_max_iterations',
                'autonomous_current_iteration',
                'autonomous_phase',
            ]);
        });
    }
};
