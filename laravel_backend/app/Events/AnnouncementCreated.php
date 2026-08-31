<?php

namespace App\Events;

use App\Models\Announcement;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class AnnouncementCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $announcement;

    public function __construct(Announcement $announcement)
    {
        $this->announcement = [
            'id'              => $announcement->id,
            'title'           => $announcement->title,
            'message'         => $announcement->message,
            'target_audience' => strtoupper($announcement->target_audience ?? 'ALL'),
            'action_url'      => null,
            'created_at'      => 'Just now',
            'is_read'         => false,
        ];
    }

    public function broadcastWith(): array
    {
        return [
            'announcement' => $this->announcement,
            'timestamp'    => microtime(true),
        ];
    }

    public function broadcastOn(): array
    {
        return [
            new Channel('srh-toda-announcements'),
            new Channel('srh-toda-admin'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'AnnouncementCreated';
    }
}
