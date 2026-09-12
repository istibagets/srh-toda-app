<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class DriverApplicantUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public ?int $driverId;
    public string $status;

    public function __construct(?int $driverId = null, string $status = 'updated')
    {
        $this->driverId = $driverId;
        $this->status = $status;
    }

    public function broadcastWith(): array
    {
        return [
            'driverId' => $this->driverId,
            'status' => $this->status,
            'timestamp' => now()->toIso8601String(),
        ];
    }

    public function broadcastOn(): array
    {
        return [
            new Channel('srh-toda-admin'),
            new Channel('srh-toda-public'),
            new Channel('srh-toda-queue'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'driver.applicant.updated';
    }
}
