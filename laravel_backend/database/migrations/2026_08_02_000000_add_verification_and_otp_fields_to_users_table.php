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
        Schema::table('users', function (Blueprint $table) {
            $table->string('phone_number')->nullable()->unique()->after('email');
            $table->timestamp('phone_verified_at')->nullable()->after('email_verified_at');
            $table->string('verification_channel')->default('email')->after('phone_verified_at');
            $table->string('otp_code', 6)->nullable()->after('verification_channel');
            $table->timestamp('otp_expires_at')->nullable()->after('otp_code');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'phone_number',
                'phone_verified_at',
                'verification_channel',
                'otp_code',
                'otp_expires_at',
            ]);
        });
    }
};
