<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_activity_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable()->index();
            $table->string('user_name', 191)->nullable();
            $table->string('user_role', 40)->nullable();
            $table->string('action', 60)->index();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 400)->nullable();
            $table->text('metadata')->nullable();
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_activity_logs');
    }
};