<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class QueueUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public bool $hasSearchingRide = false;
    public array $activeQueue = [];
    public int $totalQueueCount = 0;

    public function __construct(?bool $hasSearchingRide = null, ?array $activeQueue = null)
    {
        if ($hasSearchingRide !== null) {
            $this->hasSearchingRide = $hasSearchingRide;
        } else {
            try {
                $this->hasSearchingRide = \App\Models\Ride::whereIn('status', ['searching'])
                    ->whereNull('driver_id')
                    ->exists();
            } catch (\Throwable $e) {
                $this->hasSearchingRide = false;
            }
        }

        if ($activeQueue !== null) {
            $this->activeQueue = $activeQueue;
            $this->totalQueueCount = count($activeQueue);
        } else {
            try {
                $this->activeQueue = \App\Models\Driver::where('is_online', true)
                    ->whereNotNull('queue_position')
                    ->orderBy('queue_position', 'asc')
                    ->get()
                    ->map(function ($d) {
                        return [
                            'id'             => $d->id,
                            'user_id'        => $d->user_id,
                            'full_name'      => $d->full_name,
                            'mtop_number'    => $d->mtop_number,
                            'queue_position' => (int) $d->queue_position,
                        ];
                    })->values()->toArray();
                $this->totalQueueCount = count($this->activeQueue);
            } catch (\Throwable $e) {
                $this->activeQueue = [];
                $this->totalQueueCount = 0;
            }
        }
    }

    public function broadcastWith(): array
    {
        return [
            'hasSearchingRide'  => $this->hasSearchingRide,
            'active_queue'      => $this->activeQueue,
            'total_queue_count' => $this->totalQueueCount,
            'timestamp'         => microtime(true),
        ];
    }

    public function broadcastOn(): array
    {
        // Everyone (Drivers/Admins) listens to this same public channel
        return [new Channel('srh-toda-queue')];
    }

    public function broadcastAs(): string
    {
        return 'queue.changed';
    }
}