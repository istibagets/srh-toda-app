<?php

namespace App\Services;

use App\Models\Driver;
use App\Models\Ride;
use Illuminate\Support\Facades\DB;

class QueueService
{
    private function notifyQueueChanged()
    {
        try { broadcast(new \App\Events\QueueUpdated()); } catch (\Throwable $e) {}
    }

    /**
     * Removes a driver from the active waiting queue and shifts everyone up.
     */
    public function removeAndShift(Driver $driver)
    {
        DB::transaction(function () use ($driver) {
            $currentPosition = $driver->queue_position;

            $driver->update([
                'is_online' => false,
                'queue_position' => null,
                'queue_joined_at' => null,
            ]);

            if ($currentPosition !== null) {
                Driver::where('is_online', true)
                    ->where('queue_position', '>', $currentPosition)
                    ->decrement('queue_position');
            }

            $this->normalizeQueue();
        });

        $this->notifyQueueChanged();
    }

    /**
     * Inserts the given driver firmly at Position #1 and shifts other online drivers down.
     */
    public function insertAtFront(Driver $driver)
    {
        DB::transaction(function () use ($driver) {
            // 1. Shift all OTHER online drivers down by 1 (excluding this driver)
            Driver::where('is_online', true)
                ->where('id', '!=', $driver->id)
                ->increment('queue_position');

            // 2. Put our driver firmly at Position #1
            $driver->update([
                'is_online' => true,
                'queue_position' => 1,
                'queue_joined_at' => $driver->queue_joined_at ?? now(),
            ]);

            $this->normalizeQueue();
        });

        $this->notifyQueueChanged();
    }

    /**
     * Moves a driver to the very back of the online waiting queue.
     */
    public function pushToBack(Driver $driver)
    {
        DB::transaction(function () use ($driver) {
            $onTripDriverUserIds = Ride::whereIn('status', ['bargaining', 'fare_proposed', 'fare_accepted', 'accepted', 'en_route', 'arrived', 'in_transit', 'returning'])
                ->pluck('driver_id')
                ->filter()
                ->toArray();

            // Find current maximum queue position among other online waiting drivers
            $maxPosition = Driver::where('is_online', true)
                ->where('id', '!=', $driver->id)
                ->whereNotIn('compliance_status', ['Suspended', 'suspended', 'Rejected', 'rejected'])
                ->whereNotNull('queue_position')
                ->whereNotIn('user_id', $onTripDriverUserIds)
                ->max('queue_position') ?? 0;

            // Place firmly behind all other online waiting drivers with fresh queue_joined_at
            $driver->update([
                'is_online'       => true,
                'queue_position'  => $maxPosition + 10,
                'queue_joined_at' => now(),
            ]);

            $this->normalizeQueue();
        });

        $this->notifyQueueChanged();
    }

    /**
     * Re-indexes all online drivers sequentially from 1 to N without gaps or duplicates.
     * EXCLUDES drivers currently on an active trip!
     */
    public function normalizeQueue()
    {
        // 1. Find all drivers who are currently on an active trip
        $onTripDriverUserIds = Ride::whereIn('status', ['bargaining', 'fare_proposed', 'fare_accepted', 'accepted', 'en_route', 'arrived', 'in_transit', 'returning'])
            ->pluck('driver_id')
            ->filter()
            ->toArray();

        // 2. If any driver on a trip has a queue_position, remove them from waiting line
        if (!empty($onTripDriverUserIds)) {
            Driver::whereIn('user_id', $onTripDriverUserIds)
                ->whereNotNull('queue_position')
                ->update(['queue_position' => null]);
        }

        // 3. Sequential re-indexing for ALL waiting online drivers with an existing queue position
        $drivers = Driver::where('is_online', true)
            ->whereNotIn('compliance_status', ['Suspended', 'suspended', 'Rejected', 'rejected'])
            ->whereNotNull('queue_position')
            ->whereNotIn('user_id', $onTripDriverUserIds)
            ->orderBy('queue_position', 'asc')
            ->orderBy('queue_joined_at', 'asc')
            ->orderBy('updated_at', 'asc')
            ->get();

        $position = 1;
        foreach ($drivers as $d) {
            if ($d->queue_position !== $position) {
                $d->update(['queue_position' => $position]);
            }
            $position++;
        }
    }

    /**
     * Sweeps drivers who have been idle for more than X hours (default: 2 hours),
     * placing them Off Duty and shifting the remaining queue up.
     * Guaranteed to protect and skip all drivers on active rides!
     */
    public function sweepInactiveDrivers(int $inactiveHours = 2): int
    {
        $cutoff = now()->subHours($inactiveHours);

        // 1. Identify all drivers on active rides — they are 100% protected
        $onTripDriverUserIds = Ride::whereIn('status', ['bargaining', 'fare_proposed', 'fare_accepted', 'accepted', 'en_route', 'arrived', 'in_transit', 'returning'])
            ->pluck('driver_id')
            ->filter()
            ->toArray();

        // 2. Query idle online drivers with no activity > 2 hours
        $inactiveDrivers = Driver::where('is_online', true)
            ->whereNotIn('user_id', $onTripDriverUserIds)
            ->where(function ($q) use ($cutoff) {
                if (\Illuminate\Support\Facades\Schema::hasColumn('drivers', 'last_activity_at')) {
                    $q->where(function ($sub) use ($cutoff) {
                        $sub->whereNotNull('last_activity_at')
                            ->where('last_activity_at', '<', $cutoff);
                    })->orWhere(function ($sub) use ($cutoff) {
                        $sub->whereNull('last_activity_at')
                            ->where('updated_at', '<', $cutoff);
                    });
                } else {
                    $q->where('updated_at', '<', $cutoff);
                }
            })
            ->get();

        if ($inactiveDrivers->isEmpty()) {
            return 0;
        }

        $count = 0;
        foreach ($inactiveDrivers as $driver) {
            $driver->update([
                'is_online' => false,
                'queue_position' => null,
                'queue_joined_at' => null,
            ]);
            $count++;
        }

        $this->normalizeQueue();
        $this->notifyQueueChanged();

        return $count;
    }
}