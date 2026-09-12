<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MaintenanceModeToggled implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public bool $active;
    public string $message;

    public function __construct(bool $active, string $message = 'The system is temporarily under maintenance. Please check back shortly.')
    {
        $this->active = $active;
        $this->message = $message;
    }

    public function broadcastWith(): array
    {
        return [
            'active' => $this->active,
            'is_maintenance' => $this->active,
            'message' => $this->message,
            'timestamp' => now()->toIso8601String(),
        ];
    }

    public function broadcastOn(): array
    {
        // Broadcast across all public client channels so all active users receive the event immediately
        return [
            new Channel('srh-system-status'),
            new Channel('srh-toda-queue'),
            new Channel('srh-toda-rides'),
            new Channel('srh-toda-announcements'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'maintenance.status';
    }
}
