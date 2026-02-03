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
        Schema::table('mcp_servers', function (Blueprint $table) {
            $table->string('type')->default('stdio')->after('name'); // 'stdio' or 'http'
            $table->string('url')->nullable()->after('env'); // For HTTP-type servers
            $table->json('headers')->nullable()->after('url'); // For HTTP-type servers
            $table->string('command')->nullable()->change(); // Make command nullable for HTTP servers
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('mcp_servers', function (Blueprint $table) {
            $table->dropColumn(['type', 'url', 'headers']);
            $table->string('command')->change();
        });
    }
};
