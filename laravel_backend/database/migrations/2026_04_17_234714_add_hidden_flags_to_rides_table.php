<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('rides', function (Blueprint $table) {
            $table->boolean('passenger_hidden')->default(false);
            $table->boolean('driver_hidden')->default(false);
        });
    }

    public function down()
    {
        Schema::table('rides', function (Blueprint $table) {
            $table->dropColumn(['passenger_hidden', 'driver_hidden']);
        });
    }
};