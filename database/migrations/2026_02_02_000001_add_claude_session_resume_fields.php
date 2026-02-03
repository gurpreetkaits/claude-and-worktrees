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
        Schema::table('claude_sessions', function (Blueprint $table) {
            // Claude's own session ID (returned in system init message)
            $table->string('claude_session_id')->nullable()->after('session_key');
            // Last message UUID for --resume-session-at functionality
            $table->string('last_message_uuid')->nullable()->after('claude_session_id');
            // Cost tracking
            $table->decimal('cost_usd', 10, 6)->nullable()->after('last_message_uuid');
            // Duration tracking
            $table->integer('duration_ms')->nullable()->after('cost_usd');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('claude_sessions', function (Blueprint $table) {
            $table->dropColumn(['claude_session_id', 'last_message_uuid', 'cost_usd', 'duration_ms']);
        });
    }
};
