<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TricycleLocationUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public int $driverId;
    public float $lat;
    public float $lng;
    public ?float $heading;
    public ?float $speed;
    public ?int $rideId;

    public function __construct(int $driverId, float $lat, float $lng, ?float $heading = null, ?float $speed = null, ?int $rideId = null)
    {
        $this->driverId = $driverId;
        $this->lat = $lat;
        $this->lng = $lng;
        $this->heading = $heading;
        $this->speed = $speed;
        $this->rideId = $rideId;
    }

    public function broadcastOn(): array
    {
        return [new Channel('srh-toda-gps')];
    }

    public function broadcastAs(): string
    {
        return 'tricycle.location';
    }
}
