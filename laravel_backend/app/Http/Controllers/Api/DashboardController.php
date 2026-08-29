<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Driver;
use App\Models\Ride;
use App\Models\User;
use App\Models\Report;
use App\Models\Announcement;
use App\Events\QueueUpdated;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Carbon\Carbon;

class DashboardController extends Controller
{
    /**
     * Resolve authenticated user from Bearer token with permanent fallback.
     */
    private function resolveUser(Request $request): ?User
    {
        $token = $request->bearerToken();
        if (!$token) return null;

        $userId = Cache::get('api_token_' . $token);
        if ($userId) {
            $user = User::find($userId);
            if ($user) return $user;
        }

        $user = User::where('remember_token', $token)->first();
        if ($user) {
            Cache::put('api_token_' . $token, $user->id, now()->addDays(60));
            return $user;
        }

        return null;
    }

    /**
     * Get real-time Dashboard data based on the authenticated user's role.
     */
    public function getDashboard(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $role = $user->role;
        $data = [
            'status' => 'success',
            'user'   => [
                'id'           => $user->id,
                'name'         => $user->name,
                'email'        => $user->email,
                'role'         => $user->role,
                'avatar_url'   => $user->avatar_url,
                'phone_number' => $user->phone_number,
            ],
            'role'   => $role,
        ];

        // ── PASSENGER HOME DATA ────────────────────────────
        if ($role === 'passenger') {
            $activeRide = Ride::with('driver.driverProfile')
                ->where('passenger_id', $user->id)
                ->whereIn('status', ['searching', 'fare_proposed', 'fare_accepted', 'accepted', 'arrived', 'in_transit'])
                ->latest()
                ->first();

            $recentRides = Ride::with('driver.driverProfile')
                ->where('passenger_id', $user->id)
                ->latest()
                ->take(5)
                ->get()
                ->map(function ($r) {
                    return [
                        'id'          => $r->id,
                        'pickup'      => $r->pickup_address ?? $r->pickup_location ?? 'Santa Rosa Homes',
                        'destination' => $r->destination_address ?? $r->destination ?? 'Destination',
                        'fare'        => $r->fare_amount ?? $r->fare ?? 0,
                        'status'      => $r->status,
                        'created_at'  => $r->created_at ? $r->created_at->format('M d, g:i A') : '',
                    ];
                });

            $landmarks = [
                ['name' => 'Main Gate Guard House', 'desc' => 'Main Entrance & TODA Bay', 'fare' => 20],
                ['name' => 'Phase 1 Clubhouse', 'desc' => 'Central Recreation Area', 'fare' => 25],
                ['name' => 'Phase 2 Community Park', 'desc' => 'Playground & Basketball Court', 'fare' => 30],
                ['name' => 'Commercial Strip / Plaza', 'desc' => 'Groceries & Stores', 'fare' => 20],
                ['name' => 'Santa Rosa Public Market', 'desc' => 'Town Center Terminal', 'fare' => 35],
                ['name' => 'TODA Central Terminal', 'desc' => 'Queue Dispatch Point', 'fare' => 20],
            ];

            $data['passenger'] = [
                'active_ride'          => $activeRide,
                'recent_rides'         => $recentRides,
                'landmarks'            => $landmarks,
                'active_drivers_count' => Driver::where('is_online', true)->count(),
                'terminal_queue_count' => Driver::where('is_online', true)->whereNotNull('queue_position')->count(),
            ];
        }

        // ── DRIVER / ADMIN HOME DATA ───────────────────────────────
        elseif ($role === 'driver' || $role === 'admin' || $role === 'superadmin') {
            $driver = Driver::where('user_id', $user->id)->first();
            if (!$driver && ($role === 'admin' || $role === 'superadmin')) {
                $driver = Driver::create([
                    'user_id'           => $user->id,
                    'full_name'         => $user->name,
                    'mtop_number'       => 'ADMIN',
                    'compliance_status' => 'Approved',
                    'is_online'         => false,
                ]);
            }

            $todayRides = $driver
                ? Ride::where('driver_id', $user->id)
                    ->whereDate('created_at', today())
                    ->where('status', 'completed')
                    ->count()
                : 0;

            $todayEarnings = (float) ($driver ? Ride::where('driver_id', $user->id)->whereDate('created_at', today())->where('status', 'completed')->sum('fare') : 0.00);

            $activeRide = $driver
                ? Ride::with('passenger')
                    ->where('driver_id', $user->id)
                    ->whereIn('status', ['accepted', 'arrived', 'in_transit'])
                    ->first()
                : null;

            $activeQueue = Driver::where('is_online', true)
                ->whereNotNull('queue_position')
                ->orderBy('queue_position', 'asc')
                ->get()
                ->map(function($d) {
                    return [
                        'id'             => $d->id,
                        'user_id'        => $d->user_id,
                        'full_name'      => $d->full_name,
                        'mtop_number'    => $d->mtop_number,
                        'queue_position' => $d->queue_position,
                    ];
                });

            $activeRidesInTransit = Ride::with(['driver.driverProfile', 'passenger'])
                ->whereIn('status', ['fare_proposed', 'fare_accepted', 'accepted', 'arrived', 'in_transit', 'returning'])
                ->latest('updated_at')
                ->get()
                ->map(function($r) {
                    return [
                        'id'          => $r->id,
                        'driver_name' => $r->driver->driverProfile->full_name ?? ($r->driver->name ?? 'TODA Driver'),
                        'mtop_number' => $r->driver->driverProfile->mtop_number ?? 'N/A',
                        'passenger'   => $r->passenger->name ?? 'Passenger',
                        'pickup'      => $r->pickup_address ?? $r->pickup_location ?? 'Santa Rosa Homes',
                        'destination' => $r->destination_address ?? $r->destination ?? 'Destination',
                        'fare'        => (float) ($r->fare ?? 0),
                        'status'      => $r->status,
                    ];
                });

            $activeDriverUserIds = Ride::whereIn('status', ['fare_proposed', 'fare_accepted', 'accepted', 'arrived', 'in_transit', 'returning'])
                ->pluck('driver_id')
                ->filter()
                ->toArray();

            $returningDrivers = Driver::where('is_online', true)
                ->whereNull('queue_position')
                ->whereNotIn('user_id', $activeDriverUserIds)
                ->get()
                ->map(function($d) {
                    return [
                        'id'          => 'RETURNING-' . $d->id,
                        'driver_name' => $d->full_name,
                        'mtop_number' => $d->mtop_number,
                        'passenger'   => 'None (Returning)',
                        'pickup'      => 'Drop-off Point',
                        'destination' => 'TODA Terminal',
                        'fare'        => 0.00,
                        'status'      => 'Returning',
                    ];
                });

            $driversInTransit = $activeRidesInTransit->concat($returningDrivers)->values();

            $data['driver'] = [
                'profile'             => $driver ? [
                    'id'                => $driver->id,
                    'full_name'         => $driver->full_name,
                    'mtop_number'       => $driver->mtop_number,
                    'compliance_status' => $driver->compliance_status,
                    'is_online'         => (bool) $driver->is_online,
                    'queue_position'    => $driver->queue_position,
                    'suspension_reason' => $driver->suspension_reason,
                ] : null,
                'today_rides_count'   => $todayRides,
                'today_earnings'      => $todayEarnings,
                'total_queue_count'   => Driver::where('is_online', true)->count(),
                'active_ride'         => $activeRide,
                'active_queue'        => $activeQueue,
                'drivers_in_transit'  => $driversInTransit,
            ];

            if ($role === 'admin' || $role === 'superadmin') {
                $data['admin'] = [
                    'total_passengers'   => User::where('role', 'passenger')->count(),
                    'total_drivers'      => Driver::where('compliance_status', 'Approved')->count(),
                    'pending_applicants' => Driver::where('compliance_status', 'Pending')->count(),
                    'online_drivers'     => Driver::where('is_online', true)->count(),
                    'today_rides'        => Ride::whereDate('created_at', today())->where('status', 'completed')->count(),
                    'today_total_fare'   => (float) Ride::whereDate('created_at', today())->where('status', 'completed')->sum('fare'),
                    'active_rides_count' => Ride::whereIn('status', ['searching', 'accepted', 'arrived', 'in_transit'])->count(),
                    'active_queue'       => $activeQueue,
                ];
            }
        }

        return response()->json($data);
    }

    /**
     * Toggle Driver On/Off Duty status.
     */
    public function toggleDriverDuty(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $driver = Driver::where('user_id', $user->id)->first();
        if (!$driver) {
            return response()->json(['status' => 'error', 'message' => 'Driver profile not found.'], 404);
        }

        if ($driver->compliance_status !== 'Approved') {
            return response()->json([
                'status'  => 'error',
                'message' => 'Your application must be Approved by Admin before going on duty.',
            ], 403);
        }

        $isOnline = $request->has('is_online') 
            ? filter_var($request->input('is_online'), FILTER_VALIDATE_BOOLEAN)
            : ($request->has('target_state') 
                ? filter_var($request->input('target_state'), FILTER_VALIDATE_BOOLEAN) 
                : !$driver->is_online);

        if ($isOnline) {
            if (!$driver->is_online || !$driver->queue_position) {
                $lastPos = Driver::where('is_online', true)->where('id', '!=', $driver->id)->max('queue_position') ?? 0;
                $driver->update([
                    'is_online'      => true,
                    'queue_position' => $lastPos + 1,
                ]);
            }
            $msg = "You are now ON DUTY at Position #{$driver->queue_position}";
        } else {
            $oldPos = $driver->queue_position;
            $driver->update([
                'is_online'      => false,
                'queue_position' => null,
            ]);

            if ($oldPos) {
                Driver::where('is_online', true)
                    ->where('queue_position', '>', $oldPos)
                    ->decrement('queue_position');
            }
            $msg = "You are now OFF DUTY.";
        }

        try {
            app(\App\Services\QueueService::class)->normalizeQueue();
        } catch (\Throwable $e) {}

        $driver->refresh();

        try {
            broadcast(new QueueUpdated());
        } catch (\Throwable $e) {}

        $activeQueue = Driver::where('is_online', true)
            ->whereNotNull('queue_position')
            ->orderBy('queue_position', 'asc')
            ->get()
            ->map(function($d) {
                return [
                    'id'             => $d->id,
                    'user_id'        => $d->user_id,
                    'full_name'      => $d->full_name,
                    'mtop_number'    => $d->mtop_number,
                    'queue_position' => (int) $d->queue_position,
                ];
            });

        return response()->json([
            'status'            => 'success',
            'message'           => $msg,
            'is_online'         => (bool) $driver->is_online,
            'queue_position'    => $driver->queue_position ? (int) $driver->queue_position : null,
            'total_queue_count' => $activeQueue->count(),
            'active_queue'      => $activeQueue,
        ]);
    }

    /**
     * Reorder Queue (Admin Override)
     */
    public function reorderQueue(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user || !in_array($user->role, ['admin', 'superadmin'])) {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized action.'], 403);
        }

        $driverIds = $request->input('driver_ids', []);
        if (is_array($driverIds) && !empty($driverIds)) {
            foreach ($driverIds as $index => $driverId) {
                Driver::where('id', $driverId)->orWhere('user_id', $driverId)->update([
                    'queue_position' => $index + 1
                ]);
            }

            try {
                app(\App\Services\QueueService::class)->normalizeQueue();
            } catch (\Throwable $e) {}
            
            try {
                broadcast(new QueueUpdated());
            } catch (\Throwable $e) {}
        }

        $activeQueue = Driver::where('is_online', true)
            ->whereNotNull('queue_position')
            ->orderBy('queue_position', 'asc')
            ->get()
            ->map(function($d) {
                return [
                    'id'             => $d->id,
                    'user_id'        => $d->user_id,
                    'full_name'      => $d->full_name,
                    'mtop_number'    => $d->mtop_number,
                    'queue_position' => (int)$d->queue_position,
                ];
            });

        return response()->json([
            'status' => 'success',
            'message' => 'Terminal queue reordered and broadcasted to all drivers successfully.',
            'active_queue' => $activeQueue,
            'total_queue_count' => $activeQueue->count(),
        ]);
    }

    /**
     * Start Terminal Walk-In Ride (Depart Terminal and leave queue)
     */
    public function startWalkIn(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $driver = Driver::where('user_id', $user->id)->first();
        if (!$driver) {
            return response()->json(['status' => 'error', 'message' => 'Driver profile not found.'], 404);
        }

        $destination = $request->input('destination', 'Passenger Specified (Walk-In)');
        $passengerCount = (int) $request->input('passenger_count', 1);
        $fare = (float) $request->input('fare', 30.00);

        // Create ride in database
        $ride = Ride::create([
            'passenger_id'    => null,
            'driver_id'       => $user->id,
            'status'          => 'in_transit',
            'pickup_location' => 'TODA Central Station Terminal',
            'destination'     => $destination,
            'fare'            => $fare,
        ]);

        // Remove driver from queue in database
        $driver->update([
            'is_online'      => true,
            'queue_position' => null,
        ]);

        try {
            app(\App\Services\QueueService::class)->normalizeQueue();
        } catch (\Throwable $e) {}

        try {
            broadcast(new QueueUpdated());
        } catch (\Throwable $e) {}

        return response()->json([
            'status'  => 'success',
            'message' => 'Terminal walk-in trip started!',
            'ride'    => [
                'id'              => $ride->id,
                'passenger_name'  => 'Walk-In Passenger',
                'pickup_location' => $ride->pickup_location,
                'destination'     => $ride->destination,
                'fare'            => $ride->fare,
                'status'          => $ride->status,
            ],
        ]);
    }

    /**
     * Complete Drop-Off Action
     */
    public function completeDropOff(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $driver = Driver::where('user_id', $user->id)->first();
        if (!$driver) {
            return response()->json(['status' => 'error', 'message' => 'Driver profile not found.'], 404);
        }

        // Mark active ride as completed
        $activeRide = Ride::where('driver_id', $user->id)
            ->whereIn('status', ['accepted', 'arrived', 'in_transit'])
            ->latest()
            ->first();

        $fare = (float) $request->input('fare', $activeRide ? $activeRide->fare : 0);

        if ($activeRide) {
            $activeRide->update([
                'status'       => 'completed',
                'completed_at' => now(),
            ]);
            try {
                broadcast(new \App\Events\RideStatusUpdated($activeRide));
            } catch (\Throwable $e) {}
        }

        // Ensure driver is online with queue_position = null (returning state)
        $driver->update([
            'is_online'      => true,
            'queue_position' => null,
        ]);

        try {
            app(\App\Services\QueueService::class)->normalizeQueue();
        } catch (\Throwable $e) {}

        try {
            broadcast(new QueueUpdated());
        } catch (\Throwable $e) {}

        $todayRides = Ride::where('driver_id', $user->id)
            ->whereDate('created_at', today())
            ->where('status', 'completed')
            ->count();

        $todayEarnings = (float) Ride::where('driver_id', $user->id)
            ->whereDate('created_at', today())
            ->where('status', 'completed')
            ->sum('fare');

        return response()->json([
            'status'            => 'success',
            'message'           => 'Drop-off completed!',
            'today_rides_count' => $todayRides,
            'today_earnings'    => $todayEarnings,
        ]);
    }

    /**
     * Start Wayside Ride
     */
    public function startWayside(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $driver = Driver::where('user_id', $user->id)->first();
        if (!$driver) {
            return response()->json(['status' => 'error', 'message' => 'Driver profile not found.'], 404);
        }

        $destination = $request->input('destination', 'Wayside Passenger');
        $fare = (float) $request->input('fare', 25.00);

        $ride = Ride::create([
            'passenger_id'    => null,
            'driver_id'       => $user->id,
            'status'          => 'in_transit',
            'pickup_location' => 'Current Wayside Location',
            'destination'     => $destination,
            'fare'            => $fare,
        ]);

        $driver->update([
            'is_online'      => true,
            'queue_position' => null,
        ]);

        try {
            app(\App\Services\QueueService::class)->normalizeQueue();
        } catch (\Throwable $e) {}

        try {
            broadcast(new QueueUpdated());
        } catch (\Throwable $e) {}

        return response()->json([
            'status'  => 'success',
            'message' => 'Wayside ride started!',
            'ride'    => [
                'id'          => $ride->id,
                'destination' => $ride->destination,
                'fare'        => $ride->fare,
                'status'      => $ride->status,
            ],
        ]);
    }

    /**
     * Re-join queue on terminal arrival
     */
    public function returnToTerminal(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $driver = Driver::where('user_id', $user->id)->first();
        if (!$driver) {
            return response()->json(['status' => 'error', 'message' => 'Driver profile not found.'], 404);
        }

        // 1. Normalize active queue to ensure clean 1,2,3 sequence
        try {
            app(\App\Services\QueueService::class)->normalizeQueue();
        } catch (\Throwable $e) {}

        // 2. Place returning driver at the exact end of active queue
        $currentQueueCount = Driver::where('is_online', true)
            ->whereNotNull('queue_position')
            ->where('id', '!=', $driver->id)
            ->count();

        $targetPosition = $currentQueueCount + 1;

        $driver->update([
            'is_online'      => true,
            'queue_position' => $targetPosition,
        ]);

        try {
            app(\App\Services\QueueService::class)->normalizeQueue();
        } catch (\Throwable $e) {}

        $driver->refresh();

        try {
            broadcast(new QueueUpdated());
        } catch (\Throwable $e) {}

        return response()->json([
            'status'         => 'success',
            'message'        => "Arrived at TODA Terminal! Re-joined queue at Position #{$driver->queue_position}",
            'queue_position' => (int) $driver->queue_position,
        ]);
    }

    /**
     * Update Driver Location and dispatch real-time WebSocket broadcast via Reverb.
     */
    public function updateLocation(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $request->validate([
            'lat' => 'required|numeric',
            'lng' => 'required|numeric',
        ]);

        $lat = (float) $request->lat;
        $lng = (float) $request->lng;
        $heading = $request->has('heading') ? (float) $request->heading : null;
        $speed = $request->has('speed') ? (float) $request->speed : null;
        $rideId = $request->has('ride_id') ? (int) $request->ride_id : null;

        Cache::put("driver_location_{$user->id}", [
            'lat' => $lat,
            'lng' => $lng,
            'heading' => $heading,
            'speed' => $speed,
        ], 3600);

        if ($rideId) {
            Cache::put("ride_driver_location_{$rideId}", [
                'lat' => $lat,
                'lng' => $lng,
                'heading' => $heading,
            ], 3600);
        }

        try {
            \App\Events\TricycleLocationUpdated::dispatch($user->id, $lat, $lng, $heading, $speed, $rideId);
        } catch (\Throwable $e) {}

        return response()->json([
            'status'  => 'success',
            'lat'     => $lat,
            'lng'     => $lng,
            'heading' => $heading,
        ]);
    }

    /**
     * Get Ride / Trip History for the authenticated Driver or Passenger.
     */
    public function getRideHistory(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $query = Ride::with(['passenger', 'driver.driverProfile']);

        if ($user->role === 'driver') {
            $query->where('driver_id', $user->id);
        } elseif ($user->role === 'passenger') {
            $query->where('passenger_id', $user->id);
        }

        // Filter by status if provided
        $status = $request->input('status');
        if ($status && $status !== 'all') {
            if ($status === 'completed') {
                $query->where('status', 'completed');
            } elseif ($status === 'cancelled') {
                $query->where('status', 'cancelled');
            } elseif ($status === 'walkin') {
                $query->where(function($q) {
                    $q->whereNull('passenger_id')->orWhere('passenger_id', 0);
                });
            }
        }

        // Filter by date range
        $range = $request->input('range');
        if ($range === 'today') {
            $query->whereDate('created_at', today());
        } elseif ($range === 'week') {
            $query->whereBetween('created_at', [now()->startOfWeek(), now()->endOfWeek()]);
        } elseif ($range === 'month') {
            $query->whereMonth('created_at', now()->month)->whereYear('created_at', now()->year);
        }

        // Search filter
        $search = $request->input('search');
        if ($search) {
            $query->where(function($q) use ($search) {
                $q->where('pickup_location', 'like', "%{$search}%")
                  ->orWhere('destination', 'like', "%{$search}%")
                  ->orWhereHas('passenger', function($pq) use ($search) {
                      $pq->where('name', 'like', "%{$search}%");
                  });
            });
        }

        $allRides = (clone $query)->orderBy('created_at', 'desc')->get();

        // Calculate summary metrics
        $totalTrips = $allRides->where('status', 'completed')->count();
        $totalEarnings = (float) $allRides->where('status', 'completed')->sum('fare');
        $ratedRides = $allRides->whereNotNull('rating')->where('rating', '>', 0);
        $avgRating = $ratedRides->count() > 0 ? round($ratedRides->avg('rating'), 1) : 5.0;
        $fiveStarCount = $ratedRides->where('rating', '>=', 4.8)->count();

        $formattedRides = $allRides->map(function ($r) {
            $feedbackTags = [];
            if (!empty($r->feedback_tags)) {
                if (is_array($r->feedback_tags)) {
                    $feedbackTags = $r->feedback_tags;
                } else {
                    $decoded = json_decode($r->feedback_tags, true);
                    $feedbackTags = is_array($decoded) ? $decoded : array_map('trim', explode(',', $r->feedback_tags));
                }
            }

            $isWalkIn = empty($r->passenger_id) || $r->passenger_id == 0;
            $tripType = $isWalkIn ? 'terminal_walk_in' : 'online_dispatch';

            return [
                'id'              => $r->id,
                'trip_id'         => 'SRH-' . str_pad($r->id, 5, '0', STR_PAD_LEFT),
                'passenger_id'    => $r->passenger_id,
                'passenger_name'  => $r->passenger ? $r->passenger->name : 'Walk-In Passenger',
                'passenger_phone' => $r->passenger ? ($r->passenger->phone_number ?? '') : '',
                'driver_name'     => $r->driver ? ($r->driver->name ?? 'TODA Driver') : 'TODA Driver',
                'mtop_number'     => $r->driver && $r->driver->driverProfile ? $r->driver->driverProfile->mtop_number : 'N/A',
                'pickup_location' => $r->pickup_location ?? 'Santa Rosa Homes Terminal',
                'pickup_lat'      => $r->pickup_lat ? (float) $r->pickup_lat : 15.42955,
                'pickup_lng'      => $r->pickup_lng ? (float) $r->pickup_lng : 120.92240,
                'destination'     => $r->destination ?? 'Destination Point',
                'destination_lat' => $r->destination_lat ? (float) $r->destination_lat : null,
                'destination_lng' => $r->destination_lng ? (float) $r->destination_lng : null,
                'fare'            => (float) ($r->fare ?? 0),
                'status'          => $r->status ?? 'completed',
                'trip_type'       => $tripType,
                'rating'          => $r->rating ? (float) $r->rating : null,
                'review_comment'  => $r->review_comment,
                'feedback_tags'   => $feedbackTags,
                'created_at'      => $r->created_at ? $r->created_at->format('M d, Y • g:i A') : '',
                'created_time'    => $r->created_at ? $r->created_at->format('g:i A') : '',
                'created_date'    => $r->created_at ? $r->created_at->format('M d, Y') : '',
                'completed_at'    => $r->updated_at ? $r->updated_at->format('g:i A') : '',
            ];
        });

        return response()->json([
            'status'  => 'success',
            'summary' => [
                'total_trips'     => $totalTrips,
                'total_earnings'  => $totalEarnings,
                'avg_rating'      => $avgRating,
                'total_reviews'   => $ratedRides->count(),
                'five_star_count' => $fiveStarCount,
            ],
            'rides'   => $formattedRides,
        ]);
    }

    /**
     * Get Detailed Earnings and Financial Analytics for Driver / Passenger.
     */
    public function getEarningsSummary(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $period = $request->input('period', 'week'); // 'today', 'week', 'month', 'all'
        
        $baseQuery = Ride::query();
        if ($user->role === 'driver') {
            $baseQuery->where('driver_id', $user->id);
        } elseif ($user->role === 'passenger') {
            $baseQuery->where('passenger_id', $user->id);
        }
        $completedQuery = (clone $baseQuery)->where('status', 'completed');

        // Total Period Metrics
        $now = Carbon::now();
        $startDate = match($period) {
            'today' => $now->copy()->startOfDay(),
            'week'  => $now->copy()->startOfWeek(),
            'month' => $now->copy()->startOfMonth(),
            'all'   => Carbon::createFromTimestamp(0),
            default => $now->copy()->startOfWeek(),
        };

        $periodRides = (clone $completedQuery)->where('created_at', '>=', $startDate)->get();
        $totalEarnings = (float) $periodRides->sum('fare');
        $totalTrips = $periodRides->count();
        $avgFare = $totalTrips > 0 ? round($totalEarnings / $totalTrips, 2) : 0.00;

        // Today's snapshot
        $todayRides = (clone $completedQuery)->whereDate('created_at', today())->get();
        $todayEarnings = (float) $todayRides->sum('fare');
        $todayTripsCount = $todayRides->count();

        // 7-day Weekly Breakdown Chart Data (Mon - Sun)
        $startOfWeek = $now->copy()->startOfWeek();
        $weeklyChart = [];
        $maxDayVal = 1;

        for ($i = 0; $i < 7; $i++) {
            $dayDate = $startOfWeek->copy()->addDays($i);
            $dayRides = (clone $completedQuery)->whereDate('created_at', $dayDate)->get();
            $daySum = (float) $dayRides->sum('fare');
            $dayTrips = $dayRides->count();
            if ($daySum > $maxDayVal) {
                $maxDayVal = $daySum;
            }

            $weeklyChart[] = [
                'day_name'    => $dayDate->format('D'),
                'full_day'    => $dayDate->format('l'),
                'date'        => $dayDate->format('M d'),
                'is_today'    => $dayDate->isToday(),
                'earnings'    => $daySum,
                'trips_count' => $dayTrips,
                'height_pct'  => 0,
            ];
        }

        // Compute relative chart height percentage
        foreach ($weeklyChart as &$bar) {
            $bar['height_pct'] = $maxDayVal > 0 ? round(($bar['earnings'] / $maxDayVal) * 100, 1) : 0;
            if ($bar['earnings'] > 0 && $bar['height_pct'] < 12) {
                $bar['height_pct'] = 12;
            }
        }
        unset($bar);

        // Highest Earning Day
        $peakDay = collect($weeklyChart)->sortByDesc('earnings')->first();

        // Trip Source Breakdown
        $walkInRides = $periodRides->filter(fn($r) => empty($r->passenger_id) || $r->passenger_id == 0);
        $walkInEarnings = (float) $walkInRides->sum('fare');
        $walkInCount = $walkInRides->count();

        $onlineRides = $periodRides->filter(fn($r) => !empty($r->passenger_id) && $r->passenger_id > 0);
        $onlineEarnings = (float) $onlineRides->sum('fare');
        $onlineCount = $onlineRides->count();

        $sourceBreakdown = [
            [
                'type'        => 'terminal_walk_in',
                'label'       => 'Terminal Dispatch',
                'earnings'    => $walkInEarnings,
                'trips_count' => $walkInCount,
                'pct'         => $totalEarnings > 0 ? round(($walkInEarnings / $totalEarnings) * 100, 1) : 0,
                'color'       => '#2563eb',
            ],
            [
                'type'        => 'online_dispatch',
                'label'       => 'Online Passenger Booking',
                'earnings'    => $onlineEarnings,
                'trips_count' => $onlineCount,
                'pct'         => $totalEarnings > 0 ? round(($onlineEarnings / $totalEarnings) * 100, 1) : 0,
                'color'       => '#059669',
            ],
        ];

        // Recent Earnings Ledger Transactions
        $recentTransactions = (clone $completedQuery)
            ->with('passenger')
            ->latest('created_at')
            ->take(10)
            ->get()
            ->map(function($r) {
                $isWalkIn = empty($r->passenger_id) || $r->passenger_id == 0;
                return [
                    'id'             => $r->id,
                    'trip_id'        => 'SRH-' . str_pad($r->id, 5, '0', STR_PAD_LEFT),
                    'passenger_name' => $r->passenger ? $r->passenger->name : 'Walk-In Passenger',
                    'pickup'         => $r->pickup_location ?? 'Santa Rosa Homes Terminal',
                    'destination'    => $r->destination ?? 'Destination',
                    'fare'           => (float) ($r->fare ?? 0),
                    'trip_type'      => $isWalkIn ? 'Terminal Walk-In' : 'Online Booking',
                    'created_at'     => $r->created_at ? $r->created_at->format('M d • g:i A') : '',
                    'time_only'      => $r->created_at ? $r->created_at->format('g:i A') : '',
                    'payment_method' => 'Cash',
                ];
            });

        return response()->json([
            'status'     => 'success',
            'period'     => $period,
            'summary'    => [
                'total_earnings'    => $totalEarnings,
                'total_trips'       => $totalTrips,
                'avg_fare'          => $avgFare,
                'today_earnings'    => $todayEarnings,
                'today_trips_count' => $todayTripsCount,
                'peak_day_name'     => $peakDay ? $peakDay['day_name'] : 'N/A',
                'peak_day_earnings' => $peakDay ? $peakDay['earnings'] : 0,
            ],
            'chart'      => $weeklyChart,
            'sources'    => $sourceBreakdown,
            'ledger'     => $recentTransactions,
        ]);
    }

    /**
     * Get TODA Admin Command Center Overview & Datasets.
     */
    public function getAdminOverview(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user || ($user->role !== 'admin' && $user->role !== 'superadmin')) {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized. Admin privileges required.'], 403);
        }

        // Summary Aggregates
        $totalDrivers = Driver::count();
        $onlineDrivers = Driver::where('is_online', true)->count();
        $pendingApplicants = Driver::where('compliance_status', 'Pending')->count();
        $suspendedDrivers = Driver::where('compliance_status', 'Suspended')->count();
        $openReports = Report::whereIn('status', ['pending', 'investigating'])->count();
        $totalCompletedRides = Ride::where('status', 'completed')->count();
        $totalTodaRevenue = (float) Ride::where('status', 'completed')->sum('fare');

        // All Drivers List
        $drivers = Driver::with('user')
            ->orderByRaw("FIELD(compliance_status, 'Pending', 'Suspended', 'Approved', 'Rejected')")
            ->latest('updated_at')
            ->get()
            ->map(function ($d) {
                return [
                    'id'                   => $d->id,
                    'user_id'              => $d->user_id,
                    'full_name'            => $d->full_name ?? ($d->user ? $d->user->name : 'TODA Driver'),
                    'email'                => $d->user ? $d->user->email : 'N/A',
                    'phone_number'         => $d->user ? ($d->user->phone_number ?? 'N/A') : 'N/A',
                    'avatar_url'           => $d->user ? $d->user->avatar_url : null,
                    'mtop_number'          => $d->mtop_number ?? 'N/A',
                    'compliance_status'    => $d->compliance_status ?? 'Approved',
                    'suspension_reason'    => $d->suspension_reason,
                    'appeal_status'        => $d->appeal_status,
                    'appeal_message'       => $d->appeal_message,
                    'appeal_attachments'   => $d->appeal_attachments,
                    'appealed_at'          => $d->appealed_at ? $d->appealed_at->format('M d, Y • g:i A') : null,
                    'is_online'            => (bool) $d->is_online,
                    'queue_position'       => $d->queue_position,
                    'average_rating'       => $d->average_rating ?? 5.0,
                    'rating_count'         => $d->rating_count ?? 0,
                    'mtop_certificate_url' => $d->mtop_certificate_url,
                    'drivers_license_url'  => $d->drivers_license_url,
                    'created_at'           => $d->created_at ? $d->created_at->format('M d, Y') : '',
                ];
            });

        // Live Queue List
        $queue = Driver::with('user')
            ->where('is_online', true)
            ->whereNotNull('queue_position')
            ->orderBy('queue_position', 'asc')
            ->get()
            ->map(function ($d) {
                return [
                    'id'             => $d->id,
                    'driver_id'      => $d->user_id,
                    'driver_name'    => $d->full_name ?? ($d->user ? $d->user->name : 'Driver'),
                    'mtop_number'    => $d->mtop_number ?? 'N/A',
                    'position'       => $d->queue_position,
                    'status'         => 'Ready',
                    'avatar_url'     => $d->user ? $d->user->avatar_url : null,
                    'time_joined'    => $d->updated_at ? $d->updated_at->format('g:i A') : '',
                ];
            });

        // Incident Reports List
        $reports = Report::with(['reporter', 'driver.driverProfile', 'ride'])
            ->latest('created_at')
            ->get()
            ->map(function ($r) {
                return [
                    'id'            => $r->id,
                    'report_id'     => 'RPT-' . str_pad($r->id, 4, '0', STR_PAD_LEFT),
                    'reporter_name' => $r->reporter ? $r->reporter->name : 'Passenger',
                    'driver_name'   => $r->driver ? ($r->driver->driverProfile->full_name ?? $r->driver->name) : 'TODA Driver',
                    'driver_mtop'   => $r->driver && $r->driver->driverProfile ? $r->driver->driverProfile->mtop_number : 'N/A',
                    'driver_id'     => $r->driver_id,
                    'category'      => $r->category,
                    'subject'       => $r->subject,
                    'description'   => $r->description,
                    'status'        => $r->status ?? 'pending',
                    'admin_notes'   => $r->admin_notes,
                    'created_at'    => $r->created_at ? $r->created_at->format('M d, Y • g:i A') : '',
                    'resolved_at'   => $r->resolved_at ? $r->resolved_at->format('M d, Y • g:i A') : null,
                ];
            });

        // Announcements
        $announcements = Announcement::latest('created_at')
            ->take(15)
            ->get()
            ->map(function ($a) {
                return [
                    'id'              => $a->id,
                    'title'           => $a->title,
                    'message'         => $a->message,
                    'target_audience' => $a->target_audience ?? 'ALL',
                    'created_at'      => $a->created_at ? $a->created_at->format('M d, Y • g:i A') : '',
                ];
            });

        return response()->json([
            'status'        => 'success',
            'summary'       => [
                'total_drivers'         => $totalDrivers,
                'active_online_drivers' => $onlineDrivers,
                'pending_applicants'    => $pendingApplicants,
                'suspended_drivers'     => $suspendedDrivers,
                'open_reports'          => $openReports,
                'total_completed_rides' => $totalCompletedRides,
                'total_toda_revenue'    => $totalTodaRevenue,
            ],
            'drivers'       => $drivers,
            'queue'         => $queue,
            'reports'       => $reports,
            'announcements' => $announcements,
        ]);
    }

    /**
     * Update Driver Compliance Status (Approve, Suspend, Reinstate).
     */
    public function updateDriverCompliance(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user || ($user->role !== 'admin' && $user->role !== 'superadmin')) {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'driver_id'         => 'required|integer',
            'compliance_status' => 'required|string|in:Approved,Pending,Suspended,Rejected',
            'suspension_reason' => 'nullable|string',
        ]);

        $driver = Driver::find($request->driver_id);
        if (!$driver) {
            return response()->json(['status' => 'error', 'message' => 'Driver not found.'], 404);
        }

        $status = $request->compliance_status;
        $driver->compliance_status = $status;
        $driver->suspension_reason = $status === 'Suspended' ? $request->suspension_reason : null;
        
        if ($status === 'Suspended' || $status === 'Rejected') {
            $driver->is_online = false;
            $driver->queue_position = null;
        }
        
        $driver->save();

        return response()->json([
            'status'            => 'success',
            'message'           => "Driver compliance updated to {$status}.",
            'driver_id'         => $driver->id,
            'compliance_status' => $driver->compliance_status,
        ]);
    }

    /**
     * Resolve / Update Incident Report Status.
     */
    public function resolveReport(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user || ($user->role !== 'admin' && $user->role !== 'superadmin')) {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'report_id'   => 'required|integer',
            'status'      => 'required|string|in:pending,investigating,resolved,dismissed',
            'admin_notes' => 'nullable|string',
        ]);

        $report = Report::find($request->report_id);
        if (!$report) {
            return response()->json(['status' => 'error', 'message' => 'Report not found.'], 404);
        }

        $report->status = $request->status;
        $report->admin_notes = $request->admin_notes;
        if ($request->status === 'resolved' || $request->status === 'dismissed') {
            $report->resolved_at = now();
        }
        $report->save();

        return response()->json([
            'status'      => 'success',
            'message'     => "Report {$report->id} updated to {$report->status}.",
            'report_id'   => $report->id,
            'status_val'  => $report->status,
            'admin_notes' => $report->admin_notes,
        ]);
    }

    /**
     * Create Broadcast Announcement.
     */
    public function createAnnouncement(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user || ($user->role !== 'admin' && $user->role !== 'superadmin')) {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'title'           => 'required|string|max:255',
            'message'         => 'required|string',
            'target_audience' => 'nullable|string|in:ALL,DRIVERS,PASSENGERS',
        ]);

        $announcement = Announcement::create([
            'title'           => $request->title,
            'message'         => $request->message,
            'target_audience' => $request->input('target_audience', 'ALL'),
        ]);

        return response()->json([
            'status'       => 'success',
            'message'      => 'Announcement broadcasted successfully.',
            'announcement' => $announcement,
        ]);
    }

    /**
     * Admin remove driver from queue and set them offline.
     */
    public function removeFromQueue(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user || ($user->role !== 'admin' && $user->role !== 'superadmin')) {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'driver_id' => 'required|integer',
        ]);

        $driver = Driver::find($request->driver_id);
        if (!$driver) {
            return response()->json(['status' => 'error', 'message' => 'Driver not found.'], 404);
        }

        $oldPos = $driver->queue_position;
        $driver->update([
            'is_online'      => false,
            'queue_position' => null,
        ]);

        if ($oldPos) {
            Driver::where('is_online', true)
                ->where('queue_position', '>', $oldPos)
                ->decrement('queue_position');
        }

        try {
            app(\App\Services\QueueService::class)->normalizeQueue();
        } catch (\Throwable $e) {}

        try {
            broadcast(new \App\Events\QueueUpdated());
        } catch (\Throwable $e) {}

        return response()->json([
            'status'  => 'success',
            'message' => "Driver {$driver->full_name} removed from queue and set offline.",
        ]);
    }
}
