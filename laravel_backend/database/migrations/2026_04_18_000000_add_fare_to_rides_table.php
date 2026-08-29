<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rides', function (Blueprint $table) {
            if (!Schema::hasColumn('rides', 'fare')) {
                $table->decimal('fare', 8, 2)->default(30.00)->after('destination');
            }
        });
    }

    public function down(): void
    {
        Schema::table('rides', function (Blueprint $table) {
            if (Schema::hasColumn('rides', 'fare')) {
                $table->dropColumn('fare');
            }
        });
    }
};
