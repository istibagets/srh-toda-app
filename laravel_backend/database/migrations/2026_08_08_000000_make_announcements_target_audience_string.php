<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Rating / report / suspension notifications are addressed per-user
        // (e.g. "user_42") and to "admin", which the original enum column could
        // not store — inserts silently failed. Store the audience as free text.
        Schema::table('announcements', function (Blueprint $table) {
            $table->string('target_audience', 255)->default('all')->change();
        });
    }

    public function down(): void
    {
        Schema::table('announcements', function (Blueprint $table) {
            $table->enum('target_audience', ['all', 'drivers', 'passengers'])->default('all')->change();
        });
    }
};
