<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('drivers', function (Blueprint $table) {
            if (!Schema::hasColumn('drivers', 'queue_joined_at')) {
                $table->timestamp('queue_joined_at')->nullable()->after('queue_position');
            }
        });

        // Initialize queue_joined_at for currently online drivers from their updated_at or now()
        try {
            DB::table('drivers')
                ->where('is_online', true)
                ->whereNull('queue_joined_at')
                ->update([
                    'queue_joined_at' => DB::raw('COALESCE(updated_at, NOW())'),
                ]);
        } catch (\Throwable $e) {}
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('drivers', function (Blueprint $table) {
            if (Schema::hasColumn('drivers', 'queue_joined_at')) {
                $table->dropColumn('queue_joined_at');
            }
        });
    }
};
