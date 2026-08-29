<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Ride extends Model
{
    use HasFactory;

    // These are the columns we created in the migration earlier
    protected $fillable = [
        'passenger_id',
        'driver_id',
        'status',
        'pickup_location',
        'pickup_lat',
        'pickup_lng',
        'destination',
        'destination_lat',
        'destination_lng',
        'fare',
        'rating',
        'review_comment',
        'feedback_tags',
    ];

    /**
     * Relationship: A ride belongs to a passenger (User)
     */
    public function passenger()
    {
        return $this->belongsTo(User::class, 'passenger_id');
    }

    /**
     * Relationship: A ride belongs to a driver (User)
     */
    public function driver()
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    /**
     * Relationship: A ride belongs to a driver profile
     */
    public function driverProfile()
    {
        return $this->belongsTo(Driver::class, 'driver_id', 'user_id');
    }
}