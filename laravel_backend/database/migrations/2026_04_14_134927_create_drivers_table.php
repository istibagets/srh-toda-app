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
        Schema::create('drivers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->string('full_name');
            $table->string('mtop_certificate_url')->nullable();
            $table->string('drivers_license_url')->nullable();
            $table->enum('compliance_status', ['Pending', 'Approved', 'Rejected'])->default('Pending');
            
            // --- NEW QUEUE SYSTEM COLUMNS ---
            $table->boolean('is_online')->default(false);
            $table->integer('queue_position')->nullable(); // Null means they are not currently in the queue
            
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('drivers');
    }
};