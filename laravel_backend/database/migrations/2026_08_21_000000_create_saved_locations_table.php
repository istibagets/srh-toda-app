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
        Schema::create('saved_locations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->string('name', 100); // e.g. "Home", "Work", "School", "SM Cabanatuan", "Gate"
            $table->string('address', 255); // Full address or landmark text
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->string('type', 30)->default('custom'); // 'home', 'work', 'school', 'shopping', 'favorite', 'custom'
            $table->boolean('is_default_pickup')->default(false);
            $table->boolean('is_default_dropoff')->default(false);
            $table->timestamps();

            $table->index(['user_id', 'type']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('saved_locations');
    }
};
