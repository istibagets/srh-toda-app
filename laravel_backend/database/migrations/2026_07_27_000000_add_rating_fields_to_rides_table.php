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
        Schema::table('rides', function (Blueprint $table) {
            $table->unsignedTinyInteger('rating')->nullable()->after('fare');
            $table->text('review_comment')->nullable()->after('rating');
            $table->text('feedback_tags')->nullable()->after('review_comment');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('rides', function (Blueprint $table) {
            $table->dropColumn(['rating', 'review_comment', 'feedback_tags']);
        });
    }
};
