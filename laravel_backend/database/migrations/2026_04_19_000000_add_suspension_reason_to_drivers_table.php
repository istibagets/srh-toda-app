<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('drivers', function (Blueprint $table) {
            if (!Schema::hasColumn('drivers', 'suspension_reason')) {
                $table->text('suspension_reason')->nullable()->after('compliance_status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('drivers', function (Blueprint $table) {
            if (Schema::hasColumn('drivers', 'suspension_reason')) {
                $table->dropColumn('suspension_reason');
            }
        });
    }
};
