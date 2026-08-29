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
        Schema::table('drivers', function (Blueprint $table) {
            if (!Schema::hasColumn('drivers', 'appeal_message')) {
                $table->text('appeal_message')->nullable()->after('suspension_reason');
            }
            if (!Schema::hasColumn('drivers', 'appeal_status')) {
                $table->string('appeal_status', 30)->nullable()->after('appeal_message');
            }
            if (!Schema::hasColumn('drivers', 'appealed_at')) {
                $table->timestamp('appealed_at')->nullable()->after('appeal_status');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('drivers', function (Blueprint $table) {
            $table->dropColumn(['appeal_message', 'appeal_status', 'appealed_at']);
        });
    }
};
