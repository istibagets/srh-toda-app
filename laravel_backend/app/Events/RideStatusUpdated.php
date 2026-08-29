<?php

namespace App\Events;

use App\Models\Ride;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class RideStatusUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public int $rideId;
    public string $status;
    public ?int $driverId;
    public ?int $passengerId;
    public ?float $fare;
    public ?array $ride;
    public string $redirectUrl;

    public function __construct(Ride $ride)
    {
        $this->rideId = $ride->id;
        $this->status = $ride->status;
        $this->driverId = $ride->driver_id ? (int)$ride->driver_id : null;
        $this->passengerId = $ride->passenger_id ? (int)$ride->passenger_id : null;
        $this->fare = $ride->fare ? (float)$ride->fare : null;

        $driverUser = $ride->driver;
        $driverAvatar = ($driverUser && $driverUser->profile_photo_url)
            ? route('user.avatar', [$driverUser->id, 'v' => optional($driverUser->updated_at)->timestamp])
            : null;

        $driverLoc = \Illuminate\Support\Facades\Cache::get("ride_driver_location_{$ride->id}");
        if (!$driverLoc && $ride->driver_id) {
            $driverLoc = \Illuminate\Support\Facades\Cache::get("driver_location_{$ride->driver_id}");
        }
        $drvLat = $driverLoc ? (float)$driverLoc['lat'] : null;
        $drvLng = $driverLoc ? (float)$driverLoc['lng'] : null;
        $drvHeading = $driverLoc && isset($driverLoc['heading']) ? (float)$driverLoc['heading'] : null;

        $this->ride = [
            'id' => $ride->id,
            'status' => $ride->status,
            'fare' => $ride->fare,
            'driver_id' => $ride->driver_id,
            'driver_name' => $driverUser ? $driverUser->name : 'TODA Driver',
            'driver_avatar' => $driverAvatar,
            'passenger_id' => $ride->passenger_id,
            'pickup_location' => $ride->pickup_location,
            'destination' => $ride->destination,
            'pickup_lat' => (float)$ride->pickup_lat,
            'pickup_lng' => (float)$ride->pickup_lng,
            'dest_lat' => (float)$ride->destination_lat,
            'dest_lng' => (float)$ride->destination_lng,
            'destination_lat' => (float)$ride->destination_lat,
            'destination_lng' => (float)$ride->destination_lng,
            'driver_lat' => $drvLat,
            'driver_lng' => $drvLng,
            'driver_heading' => $drvHeading,
        ];
        $this->redirectUrl = route('dashboard');
    }

    public function broadcastOn(): array
    {
        return [new Channel('srh-toda-rides')];
    }

    public function broadcastAs(): string
    {
        return 'ride.status.updated';
    }
}
