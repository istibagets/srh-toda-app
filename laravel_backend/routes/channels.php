<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

// Our public queue channel
Broadcast::channel('srh-toda-queue', function () {
    return true; // Publicly accessible
});

// Admin events channel for reports and driver applications
Broadcast::channel('srh-toda-admin', function () {
    return true; // Accessible for real-time admin notifications and tables
});

// System status channel for maintenance mode and global announcements
Broadcast::channel('srh-system-status', function () {
    return true; // Publicly accessible
});

// Private ride chat channel: only the ride's passenger, assigned driver,
// or an admin may subscribe. Messages never reach any other user's UI.
Broadcast::channel('srh-ride-chat.{rideId}', function ($user, $rideId) {
    if ($user->role === 'admin') {
        return true;
    }

    return \App\Models\Ride::where('id', (int) $rideId)
        ->where(function ($query) use ($user) {
            $query->where('passenger_id', $user->id)
                  ->orWhere('driver_id', $user->id);
        })
        ->exists();
});