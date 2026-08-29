<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ReportUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public ?int $reportId;
    public string $action;

    public function __construct(?int $reportId = null, string $action = 'updated')
    {
        $this->reportId = $reportId;
        $this->action = $action;
    }

    public function broadcastWith(): array
    {
        return [
            'reportId' => $this->reportId,
            'action' => $this->action,
            'timestamp' => now()->toIso8601String(),
        ];
    }

    public function broadcastOn(): array
    {
        return [new Channel('srh-toda-admin')];
    }

    public function broadcastAs(): string
    {
        return 'report.updated';
    }
}
