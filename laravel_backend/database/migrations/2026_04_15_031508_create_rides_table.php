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
    Schema::create('rides', function (Blueprint $table) {
        $table->id();
        $table->foreignId('passenger_id')->nullable()->constrained('users')->onDelete('cascade');
        $table->foreignId('driver_id')->nullable()->constrained('users')->onDelete('cascade');
        $table->string('status')->default('searching'); // searching, accepted, completed, cancelled
        $table->string('pickup_location')->default('Santa Rosa Homes');
        $table->timestamps();
    });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('rides');
    }
};
