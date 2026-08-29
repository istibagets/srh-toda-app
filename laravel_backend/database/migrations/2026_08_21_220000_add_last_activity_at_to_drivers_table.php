<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('drivers', 'last_activity_at')) {
            Schema::table('drivers', function (Blueprint $table) {
                $table->timestamp('last_activity_at')->nullable()->after('queue_position');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('drivers', 'last_activity_at')) {
            Schema::table('drivers', function (Blueprint $table) {
                $table->dropColumn('last_activity_at');
            });
        }
    }
};
