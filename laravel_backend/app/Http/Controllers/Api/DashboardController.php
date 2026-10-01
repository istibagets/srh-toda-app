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
            $activeRideModel = Ride::with('driver.driverProfile')
                ->where('passenger_id', $user->id)
                ->whereIn('status', ['searching', 'bargaining', 'fare_proposed', 'fare_accepted', 'accepted', 'en_route', 'arrived', 'in_transit'])
                ->latest('updated_at')
                ->first();

            $activeRide = null;
            if ($activeRideModel) {
                $isAccepted = in_array($activeRideModel->status, ['fare_accepted', 'accepted', 'en_route', 'arrived', 'in_transit']);
                $driverUser = $activeRideModel->driver;
                $driverProfile = $driverUser ? ($driverUser->driverProfile ?? Driver::where('user_id', $driverUser->id)->first()) : null;

                $driverInfo = null;
                if ($isAccepted && $driverUser) {
                    $mtop = $driverProfile ? $driverProfile->mtop_number : '101';
                    if ($mtop === 'ADMIN' || $mtop === 'PENDING') $mtop = '101';
                    $driverInfo = [
                        'id'          => $driverUser->id,
                        'name'        => $driverProfile ? $driverProfile->full_name : $driverUser->name,
                        'phone'       => $driverUser->phone_number ?? '',
                        'mtop_number' => $mtop,
                        'avatar_url'  => $driverUser->avatar_url,
                        'rating'      => 5.0,
                    ];
                }

                // Driver Live Location lookup from Cache
                $driverLoc = null;
                if ($driverUser) {
                    $driverLoc = Cache::get("driver_location_{$driverUser->id}");
                }
                if (!$driverLoc) {
                    $driverLoc = Cache::get("ride_driver_location_{$activeRideModel->id}");
                }
                if (!$driverLoc && $activeRideModel->driver_id) {
                    $driverLoc = Cache::get("driver_location_{$activeRideModel->driver_id}");
                }

                $driverLat = $driverLoc ? (float) $driverLoc['lat'] : null;
                $driverLng = $driverLoc ? (float) $driverLoc['lng'] : null;
                $driverHeading = $driverLoc && isset($driverLoc['heading']) ? (float) $driverLoc['heading'] : 0.0;

                $activeRide = [
                    'id'              => $activeRideModel->id,
                    'passenger_id'    => $activeRideModel->passenger_id,
                    'status'          => $activeRideModel->status,
                    'pickup_location' => $activeRideModel->pickup_location ?? $activeRideModel->pickup_address ?? 'Pickup Point',
                    'pickup_lat'      => (float) ($activeRideModel->pickup_lat ?? 15.42955),
                    'pickup_lng'      => (float) ($activeRideModel->pickup_lng ?? 120.92240),
                    'destination'     => $activeRideModel->destination ?? $activeRideModel->destination_address ?? 'Destination',
                    'destination_lat' => $activeRideModel->destination_lat ? (float) $activeRideModel->destination_lat : null,
                    'destination_lng' => $activeRideModel->destination_lng ? (float) $activeRideModel->destination_lng : null,
                    'fare'            => (float) $activeRideModel->fare,
                    'driver'          => $driverInfo,
                    'driver_id'       => $driverUser ? $driverUser->id : $activeRideModel->driver_id,
                    'driver_lat'      => $driverLat,
                    'driver_lng'      => $driverLng,
                    'driver_heading'  => $driverHeading,
                    'created_at'      => $activeRideModel->created_at ? $activeRideModel->created_at->format('M d, g:i A') : '',
                ];
            }

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

            $landmarks = \App\Support\SystemSettings::getLandmarks();

            $activeQueue = Driver::where('is_online', true)
                ->whereNotNull('queue_position')
                ->orderBy('queue_position', 'asc')
                ->get()
                ->map(function ($d) {
                    return [
                        'id'             => $d->id,
                        'user_id'        => $d->user_id,
                        'full_name'      => $d->full_name,
                        'mtop_number'    => $d->mtop_number,
                        'queue_position' => $d->queue_position,
                    ];
                });

            $data['passenger'] = [
                'active_ride'          => $activeRide,
                'recent_rides'         => $recentRides,
                'landmarks'            => $landmarks,
                'active_drivers_count' => Driver::where('is_online', true)->count(),
                'terminal_queue_count' => Driver::where('is_online', true)->whereNotNull('queue_position')->count(),
                'active_queue'         => $activeQueue,
            ];
        }

        // ── DRIVER / ADMIN HOME DATA ───────────────────────────────
        elseif ($role === 'driver' || $role === 'admin' || $role === 'superadmin') {
            $driver = Driver::where('user_id', $user->id)->first();
            if (!$driver && ($role === 'admin' || $role === 'superadmin')) {
                $driver = Driver::create([
                    'user_id'           => $user->id,
                    'full_name'         => $user->name,
                    'mtop_number'       => '128491',
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

            $activeRideModel = $driver
                ? Ride::with('passenger')
                    ->where('driver_id', $user->id)
                    ->whereIn('status', ['bargaining', 'fare_proposed', 'fare_accepted', 'accepted', 'en_route', 'arrived', 'in_transit'])
                    ->latest('updated_at')
                    ->first()
                : null;

            $activeRide = $activeRideModel ? [
                'id'                  => $activeRideModel->id,
                'passenger_id'        => $activeRideModel->passenger_id,
                'passenger'           => $activeRideModel->passenger ? [
                    'id'           => $activeRideModel->passenger->id,
                    'name'         => $activeRideModel->passenger->name,
                    'phone_number' => $activeRideModel->passenger->phone_number ?? '',
                ] : null,
                'status'              => $activeRideModel->status,
                'pickup_location'     => $activeRideModel->pickup_location ?? $activeRideModel->pickup_address ?? 'Pickup Point',
                'pickup_lat'          => (float) ($activeRideModel->pickup_lat ?? 15.42955),
                'pickup_lng'          => (float) ($activeRideModel->pickup_lng ?? 120.92240),
                'destination'         => $activeRideModel->destination ?? $activeRideModel->destination_address ?? 'Destination',
                'destination_lat'     => $activeRideModel->destination_lat ? (float) $activeRideModel->destination_lat : null,
                'destination_lng'     => $activeRideModel->destination_lng ? (float) $activeRideModel->destination_lng : null,
                'fare'                => (float) $activeRideModel->fare,
                'original_fare'       => (float) ($activeRideModel->fare ?? 20),
                'passenger_count'     => (int) ($activeRideModel->passenger_count ?? 1),
                'created_at'          => $activeRideModel->created_at ? $activeRideModel->created_at->toIso8601String() : null,
            ] : null;

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
                ->whereIn('status', ['bargaining', 'fare_proposed', 'fare_accepted', 'accepted', 'en_route', 'arrived', 'in_transit', 'returning'])
                ->latest('updated_at')
                ->get()
                ->map(function($r) {
                    $drvProfile = $r->driver ? $r->driver->driverProfile : null;
                    return [
                        'id'          => $r->id,
                        'driver_name' => $drvProfile ? $drvProfile->full_name : ($r->driver ? $r->driver->name : 'TODA Driver'),
                        'mtop_number' => $drvProfile ? $drvProfile->mtop_number : 'N/A',
                        'passenger'   => $r->passenger ? $r->passenger->name : 'Passenger',
                        'pickup'      => $r->pickup_address ?? $r->pickup_location ?? 'Santa Rosa Homes',
                        'destination' => $r->destination_address ?? $r->destination ?? 'Destination',
                        'fare'        => (float) ($r->fare ?? 0),
                        'status'      => $r->status,
                    ];
                });

            $activeDriverUserIds = Ride::whereIn('status', ['bargaining', 'fare_proposed', 'fare_accepted', 'accepted', 'en_route', 'arrived', 'in_transit', 'returning'])
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
                    'appeal_status'     => $driver->appeal_status,
                    'appeal_message'    => $driver->appeal_message,
                    'appeal_attachments'=> $driver->appeal_attachments,
                    'appealed_at'       => $driver->appealed_at ? $driver->appealed_at->format('M d, Y • g:i A') : null,
                    'rating'            => (float) round(Ride::where('driver_id', $user->id)->whereNotNull('rating')->avg('rating') ?: 5.0, 1),
                    'rating_count'      => (int) Ride::where('driver_id', $user->id)->whereNotNull('rating')->count(),
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

        // Fetch User Relevant Announcements & Notifications
        $userAudiences = ['all', 'ALL'];
        if ($role === 'driver') {
            $userAudiences[] = 'drivers';
            $userAudiences[] = 'DRIVERS';
            $userAudiences[] = 'user_' . $user->id;
        } elseif ($role === 'admin' || $role === 'superadmin') {
            $userAudiences[] = 'admin';
            $userAudiences[] = 'ADMIN';
            $userAudiences[] = 'drivers';
            $userAudiences[] = 'passengers';
            $userAudiences[] = 'user_' . $user->id;
        } else {
            $userAudiences[] = 'passengers';
            $userAudiences[] = 'PASSENGERS';
            $userAudiences[] = 'user_' . $user->id;
        }

        $announcements = Announcement::whereIn('target_audience', $userAudiences)
            ->latest('created_at')
            ->take(20)
            ->get()
            ->map(function ($a) {
                $target = strtoupper($a->target_audience ?? 'ALL');
                if (str_contains(strtolower($a->title), 'rating') || str_contains(strtolower($a->message), 'rated your trip')) {
                    $target = 'RATING';
                }
                return [
                    'id'              => $a->id,
                    'title'           => $a->title,
                    'message'         => $a->message,
                    'target_audience' => $target,
                    'created_at'      => $a->created_at ? $a->created_at->format('M d, Y • g:i A') : '',
                ];
            });

        $data['geofencing'] = [
            'terminal_lat'    => (float) \App\Support\SystemSettings::get('geofencing.terminal_lat', 15.429550175641715),
            'terminal_lng'    => (float) \App\Support\SystemSettings::get('geofencing.terminal_lng', 120.92240292427664),
            'terminal_radius' => (int) \App\Support\SystemSettings::get('geofencing.terminal_radius', 35),
            'boundary_name'   => (string) \App\Support\SystemSettings::get('geofencing.boundary_name', 'Santa Rosa Homes TODA Zone'),
        ];

        $data['fare_matrix'] = [
            'base_fare'           => (float) \App\Support\SystemSettings::get('fare_matrix.base_fare', 50.00),
            'per_km_rate'         => (float) \App\Support\SystemSettings::get('fare_matrix.per_km_rate', 3.50),
            'night_differential'  => (float) \App\Support\SystemSettings::get('fare_matrix.night_differential', 5.00),
            'surge_multiplier'    => (float) \App\Support\SystemSettings::get('fare_matrix.surge_multiplier', 1.00),
            'terminal_fee'        => (float) \App\Support\SystemSettings::get('fare_matrix.terminal_fee', 2.00),
            'student_discount'    => (float) \App\Support\SystemSettings::get('fare_matrix.student_discount', 20),
            'pwd_senior_discount' => (float) \App\Support\SystemSettings::get('fare_matrix.pwd_senior_discount', 20),
        ];

        $data['announcements'] = $announcements;

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
            // Geofence check against dynamic settings
            $lat = $request->input('lat');
            $lng = $request->input('lng');
            if ($lat !== null && $lng !== null) {
                $terminalLat = (float) \App\Support\SystemSettings::get('geofencing.terminal_lat', 15.429550175641715);
                $terminalLng = (float) \App\Support\SystemSettings::get('geofencing.terminal_lng', 120.92240292427664);
                $terminalRadius = (float) \App\Support\SystemSettings::get('geofencing.terminal_radius', 35);
                
                $earthRadius = 6371000;
                $dLat = deg2rad($terminalLat - floatval($lat));
                $dLng = deg2rad($terminalLng - floatval($lng));
                $a = sin($dLat / 2) * sin($dLat / 2) +
                     cos(deg2rad(floatval($lat))) * cos(deg2rad($terminalLat)) *
                     sin($dLng / 2) * sin($dLng / 2);
                $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
                $distanceMeters = $earthRadius * $c;

                if ($distanceMeters > $terminalRadius) {
                    return response()->json([
                        'status'   => 'error',
                        'message'  => "Outside {$terminalRadius}m TODA Terminal geofence! You are " . round($distanceMeters) . "m away.",
                        'distance' => round($distanceMeters),
                    ], 422);
                }
            }

            if (!$driver->is_online || !$driver->queue_position) {
                $lastPos = Driver::where('is_online', true)->where('id', '!=', $driver->id)->max('queue_position') ?? 0;
                $driver->update([
                    'is_online'        => true,
                    'queue_position'   => $lastPos + 1,
                    'queue_joined_at'  => $driver->queue_joined_at ?? now(),
                ]);
            }
            $msg = "You are now ON DUTY at Position #{$driver->queue_position}";
        } else {
            $oldPos = $driver->queue_position;
            $driver->update([
                'is_online'        => false,
                'queue_position'   => null,
                'queue_joined_at'  => null,
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
            $matchingDrivers = Driver::whereIn('id', $driverIds)->pluck('id')->toArray();
            $useDriverId = count($matchingDrivers) === count($driverIds);

            foreach ($driverIds as $index => $driverId) {
                if ($useDriverId) {
                    Driver::where('id', $driverId)->update([
                        'queue_position' => $index + 1
                    ]);
                } else {
                    Driver::where('user_id', $driverId)->update([
                        'queue_position' => $index + 1
                    ]);
                }
            }

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
            if ($activeRide->passenger_id) {
                try {
                    app(\App\Services\PushService::class)->sendToUser(
                        $activeRide->passenger_id,
                        '🏁 Arrived at Destination!',
                        "You have reached your destination ({$activeRide->destination}). Thank you for riding with TODA!",
                        url('/'),
                        'ride-completed-' . $activeRide->id,
                        ['type' => 'trip_completed', 'ride_id' => $activeRide->id]
                    );
                } catch (\Throwable $e) {}
            }

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

        // --- 30-MINUTE GEOFENCE EXIT TIMEOUT LOGIC ---
        $autoOffDuty = false;
        $outsideMinutes = 0;
        $driver = Driver::where('user_id', $user->id)->first();
        if ($driver && $driver->is_online) {
            $hasActiveRide = Ride::where('driver_id', $user->id)
                ->whereIn('status', ['bargaining', 'fare_proposed', 'fare_accepted', 'accepted', 'en_route', 'arrived', 'in_transit', 'returning'])
                ->exists();

            if (!$hasActiveRide) {
                $terminalLat = (float) \App\Support\SystemSettings::get('geofencing.terminal_lat', 15.429550175641715);
                $terminalLng = (float) \App\Support\SystemSettings::get('geofencing.terminal_lng', 120.92240292427664);
                $terminalRadius = (float) \App\Support\SystemSettings::get('geofencing.terminal_radius', 35);
                $earthRadius = 6371000;
                $dLat = deg2rad($terminalLat - $lat);
                $dLng = deg2rad($terminalLng - $lng);
                $a = sin($dLat / 2) * sin($dLat / 2) +
                     cos(deg2rad($lat)) * cos(deg2rad($terminalLat)) *
                     sin($dLng / 2) * sin($dLng / 2);
                $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
                $distanceMeters = $earthRadius * $c;

                if ($distanceMeters > $terminalRadius) {
                    $outsideSince = $driver->outside_geofence_at ?? Cache::get("driver_outside_since_{$driver->id}");
                    if (!$outsideSince) {
                        $outsideSince = now();
                        try {
                            if (\Illuminate\Support\Facades\Schema::hasColumn('drivers', 'outside_geofence_at')) {
                                $driver->update(['outside_geofence_at' => $outsideSince]);
                            }
                        } catch (\Throwable $e) {}
                        Cache::put("driver_outside_since_{$driver->id}", $outsideSince, 7200);
                    } else {
                        if (is_string($outsideSince)) {
                            $outsideSince = \Carbon\Carbon::parse($outsideSince);
                        }
                    }

                    $outsideMinutes = (int) now()->diffInMinutes($outsideSince);

                    // If outside continuously for 30 minutes or more, auto off-duty
                    if ($outsideMinutes >= 30) {
                        $oldPos = $driver->queue_position;
                        $updateData = [
                            'is_online' => false,
                            'queue_position' => null,
                        ];
                        try {
                            if (\Illuminate\Support\Facades\Schema::hasColumn('drivers', 'outside_geofence_at')) {
                                $updateData['outside_geofence_at'] = null;
                            }
                        } catch (\Throwable $e) {}
                        Cache::forget("driver_outside_since_{$driver->id}");

                        $driver->update($updateData);

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

                        $autoOffDuty = true;
                    }
                } else {
                    // Inside terminal radius - reset outside tracker
                    if ($driver->outside_geofence_at || Cache::has("driver_outside_since_{$driver->id}")) {
                        try {
                            if (\Illuminate\Support\Facades\Schema::hasColumn('drivers', 'outside_geofence_at')) {
                                $driver->update(['outside_geofence_at' => null]);
                            }
                        } catch (\Throwable $e) {}
                        Cache::forget("driver_outside_since_{$driver->id}");
                    }
                }
            } else {
                // Active ride in progress - exempt from timeout
                Cache::forget("driver_outside_since_{$driver->id}");
            }
        }

        return response()->json([
            'status'          => 'success',
            'lat'             => $lat,
            'lng'             => $lng,
            'heading'         => $heading,
            'auto_off_duty'   => $autoOffDuty,
            'outside_minutes' => $outsideMinutes,
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

        if ($user->role === 'passenger') {
            $query->where('passenger_id', $user->id);
        } else {
            $query->where('driver_id', $user->id);
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
                    $q->whereNull('passenger_id')
                      ->orWhere('passenger_id', 0);
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
        $search = trim($request->input('search', ''));
        if ($search) {
            $searchId = preg_replace('/[^0-9]/', '', $search);
            $query->where(function($q) use ($search, $searchId) {
                $q->where('pickup_location', 'like', "%{$search}%")
                  ->orWhere('destination', 'like', "%{$search}%");

                if (!empty($searchId) && strlen($searchId) <= 10) {
                    $q->orWhere('id', (int) $searchId);
                }

                $q->orWhereHas('passenger', function($pq) use ($search) {
                    $pq->where('name', 'like', "%{$search}%");
                })
                ->orWhereHas('driver', function($dq) use ($search) {
                    $dq->where('name', 'like', "%{$search}%");
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
        if ($user->role === 'passenger') {
            $baseQuery->where('passenger_id', $user->id);
        } else {
            $baseQuery->where('driver_id', $user->id);
        }
        $completedQuery = (clone $baseQuery)->where('status', 'completed');

        // Lifetime Driver Rating & Metrics for authenticated user
        $lifetimeRated = (clone $baseQuery)->where('status', 'completed')->whereNotNull('rating')->where('rating', '>', 0);
        $avgLifetimeRating = $lifetimeRated->count() > 0 ? (float) round($lifetimeRated->avg('rating'), 1) : 5.0;
        $lifetimeRatingCount = (int) $lifetimeRated->count();

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

        // Recent Passenger Ratings & Reviews
        $recentRatings = (clone $completedQuery)
            ->whereNotNull('rating')
            ->latest('updated_at')
            ->take(15)
            ->get()
            ->map(function($r) {
                $feedbackTags = [];
                if ($r->feedback_tags) {
                    if (is_array($r->feedback_tags)) {
                        $feedbackTags = $r->feedback_tags;
                    } else {
                        $decoded = json_decode($r->feedback_tags, true);
                        $feedbackTags = is_array($decoded) ? $decoded : [$r->feedback_tags];
                    }
                }
                return [
                    'id'             => $r->id,
                    'trip_id'        => 'SRH-' . str_pad($r->id, 5, '0', STR_PAD_LEFT),
                    'passenger_name' => 'Passenger',
                    'rating'         => (float) $r->rating,
                    'review_comment' => $r->review_comment,
                    'feedback_tags'  => $feedbackTags,
                    'destination'    => $r->destination ?? 'Drop-off Point',
                    'fare'           => (float) ($r->fare ?? 0),
                    'created_at'     => $r->updated_at ? $r->updated_at->format('M d, Y • g:i A') : ($r->created_at ? $r->created_at->format('M d, Y • g:i A') : ''),
                    'time_only'      => $r->updated_at ? $r->updated_at->format('g:i A') : ($r->created_at ? $r->created_at->format('g:i A') : ''),
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
                'avg_rating'        => $avgLifetimeRating,
                'rating_count'      => $lifetimeRatingCount,
            ],
            'chart'      => $weeklyChart,
            'sources'    => $sourceBreakdown,
            'ledger'     => $recentTransactions,
            'ratings'    => $recentRatings,
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
                    'appeal_attachments'   => collect($d->appeal_attachments ?? [])->map(function ($att) {
                        if (!is_array($att) || empty($att['url'])) return $att;
                        $rawUrl = $att['url'];
                        // Already a full absolute URL — normalize to use static /storage/ if it's an /attachments/ path
                        if (str_starts_with($rawUrl, 'http://') || str_starts_with($rawUrl, 'https://')) {
                            // Rewrite old /attachments/appeals/ URLs to /storage/appeals/ static
                            if (preg_match('#/attachments/appeals/([A-Za-z0-9._-]+)$#', $rawUrl, $m)) {
                                $att['url'] = asset('storage/appeals/' . $m[1]);
                            }
                            return $att;
                        }
                        // /storage/appeals/filename → make full URL
                        if (str_starts_with($rawUrl, '/storage/appeals/')) {
                            $att['url'] = url($rawUrl);
                            return $att;
                        }
                        // appeals/filename or /attachments/appeals/filename
                        if (preg_match('#appeals/([A-Za-z0-9._-]+)$#', $rawUrl, $m)) {
                            $att['url'] = asset('storage/appeals/' . $m[1]);
                        } elseif (!str_starts_with($rawUrl, '/')) {
                            $att['url'] = asset('storage/appeals/' . basename($rawUrl));
                        } else {
                            $att['url'] = url($rawUrl);
                        }
                        return $att;
                    })->values()->all(),
                    'appealed_at'          => $d->appealed_at ? $d->appealed_at->format('M d, Y • g:i A') : null,
                    'is_online'            => (bool) $d->is_online,
                    'queue_position'       => $d->queue_position,
                    'average_rating'       => $d->average_rating ?? 5.0,
                    'mtop_certificate_url' => $d->mtop_certificate_url 
                        ? (str_starts_with($d->mtop_certificate_url, 'http') ? $d->mtop_certificate_url : '/storage/' . ltrim($d->mtop_certificate_url, '/')) 
                        : '/assets/icon/srh-logo.png',
                    'drivers_license_url'  => $d->drivers_license_url 
                        ? (str_starts_with($d->drivers_license_url, 'http') ? $d->drivers_license_url : '/storage/' . ltrim($d->drivers_license_url, '/')) 
                        : '/assets/icon/srh-logo.png',
                    'created_at'           => $d->created_at ? $d->created_at->format('M d, Y') : '',
                ];
            });

        // Live Queue List (Includes both waiting drivers & active-trip drivers for oversight)
        $onlineDrivers = Driver::with(['user'])
            ->where('is_online', true)
            ->get();

        $activeRidesByDriver = Ride::with('passenger')
            ->whereIn('driver_id', $onlineDrivers->pluck('user_id')->filter())
            ->whereIn('status', ['bargaining', 'fare_proposed', 'fare_accepted', 'accepted', 'en_route', 'arrived', 'in_transit', 'returning'])
            ->latest('updated_at')
            ->get()
            ->keyBy('driver_id');

        $queue = $onlineDrivers->map(function ($d) use ($activeRidesByDriver) {
            $activeRide = $activeRidesByDriver->get($d->user_id);
            $isOnTrip = $activeRide !== null;
            $rideStatus = $activeRide ? $activeRide->status : null;

            $statusText = 'Ready';
            if ($isOnTrip) {
                $statusText = $rideStatus === 'returning' ? 'Returning' : 'On Trip';
            } elseif ($d->queue_position && $d->queue_position > 1) {
                $statusText = 'In Line';
            }

            return [
                'id'             => $d->id,
                'driver_id'      => $d->id,
                'user_id'        => $d->user_id,
                'driver_name'    => $d->full_name ?? ($d->user ? $d->user->name : 'Driver'),
                'mtop_number'    => $d->mtop_number ?? 'N/A',
                'position'       => $d->queue_position,
                'status'         => $statusText,
                'is_on_trip'     => $isOnTrip,
                'ride_status'    => $rideStatus,
                'active_ride'    => $activeRide ? [
                    'id'             => $activeRide->id,
                    'passenger_name' => $activeRide->passenger ? $activeRide->passenger->name : ($activeRide->passenger_id ? 'Passenger' : 'Walk-In Passenger'),
                    'pickup'         => $activeRide->pickup_location ?? $activeRide->pickup_address ?? 'Pickup Point',
                    'destination'    => $activeRide->destination ?? $activeRide->destination_address ?? 'Destination',
                    'fare'           => (float) $activeRide->fare,
                    'status'         => $activeRide->status,
                    'time_started'   => $activeRide->updated_at ? $activeRide->updated_at->format('g:i A') : '',
                ] : null,
                'avatar_url'     => $d->user ? $d->user->avatar_url : null,
                'time_joined'    => $d->queue_joined_at 
                    ? $d->queue_joined_at->format('g:i A') 
                    : ($d->updated_at ? $d->updated_at->format('g:i A') : ''),
            ];
        })->sort(function ($a, $b) {
            // Put in-queue units first by position, then on-trip units
            if (!$a['is_on_trip'] && $b['is_on_trip']) return -1;
            if ($a['is_on_trip'] && !$b['is_on_trip']) return 1;
            return ($a['position'] ?? 999) <=> ($b['position'] ?? 999);
        })->values()->all();

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

        // Official Broadcast Announcements (Excludes private driver rating alerts)
        $announcements = Announcement::whereNotIn('target_audience', ['RATING'])
            ->where('target_audience', 'not like', 'user_%')
            ->where('title', 'not like', '%Rating%')
            ->latest('created_at')
            ->take(25)
            ->get()
            ->map(function ($a) {
                return [
                    'id'              => $a->id,
                    'title'           => $a->title,
                    'message'         => $a->message,
                    'target_audience' => strtoupper($a->target_audience ?? 'ALL'),
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
            'compliance_status' => 'required|string|in:Approved,Pending,Suspended,Rejected,Removed',
            'suspension_reason' => 'nullable|string',
        ]);

        $driver = Driver::find($request->driver_id);
        if (!$driver) {
            return response()->json(['status' => 'error', 'message' => 'Driver not found.'], 404);
        }

        $status = $request->compliance_status;
        $driver->compliance_status = $status;

        if ($status === 'Approved') {
            $driver->suspension_reason = null;
            $driver->appeal_status = null;
            $driver->appeal_message = null;
            $driver->appeal_attachments = null;
        } elseif ($status === 'Removed') {
            $driver->suspension_reason = $request->suspension_reason ?: 'Permanently removed by TODA Administration';
            $driver->appeal_status = 'Rejected';
            $driver->appeal_message = null;
            $driver->appeal_attachments = null;
            $driver->is_online = false;
            $driver->queue_position = null;
        } else {
            $driver->suspension_reason = $status === 'Suspended' ? $request->suspension_reason : null;
            if ($status === 'Suspended' || $status === 'Rejected') {
                $driver->is_online = false;
                $driver->queue_position = null;
            }
        }

        $driver->save();

        // Broadcast realtime compliance update & announcements to all connected clients
        try {
            broadcast(new \App\Events\DriverApplicantUpdated($driver->id, $status));
            broadcast(new \App\Events\QueueUpdated());

            $announcement = \App\Models\Announcement::create([
                'title' => $status === 'Approved'
                    ? "✅ Driver Account Reinstated"
                    : ($status === 'Suspended' ? "⚠️ Driver Account Suspended" : "Notice: Driver Status Updated"),
                'message' => "Driver {$driver->full_name} (MTOP #{$driver->mtop_number}) compliance status updated to {$status}.",
                'target_audience' => 'ADMIN',
            ]);
            broadcast(new \App\Events\AnnouncementCreated($announcement));
        } catch (\Throwable $e) {}

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

        // Broadcast real-time event to connected WebSockets / Reverb clients
        try {
            broadcast(new \App\Events\AnnouncementCreated($announcement));
        } catch (\Throwable $e) {
            \Log::warning('Announcement real-time broadcast error: ' . $e->getMessage());
        }

        // Web-push the announcement to the selected audience
        try {
            $push = app(\App\Services\PushService::class);
            $tag = 'announcement-' . $announcement->id;
            $targetAudience = strtoupper($request->input('target_audience', 'ALL'));

            if ($targetAudience === 'DRIVERS') {
                $driverUserIds = \App\Models\Driver::whereNotNull('user_id')->pluck('user_id')->all();
                $push->sendToUsers($driverUserIds, '📢 ' . $announcement->title, $announcement->message, '/tabs/home', $tag, [
                    'type' => 'announcement',
                    'requireInteraction' => true,
                ]);
            } elseif ($targetAudience === 'PASSENGERS') {
                $passengerUserIds = \App\Models\User::whereIn('role', ['user', 'passenger'])->pluck('id')->all();
                $push->sendToUsers($passengerUserIds, '📢 ' . $announcement->title, $announcement->message, '/tabs/home', $tag, [
                    'type' => 'announcement',
                    'requireInteraction' => true,
                ]);
            } else {
                $push->sendToAll('📢 ' . $announcement->title, $announcement->message, '/tabs/home', $tag, [
                    'type' => 'announcement',
                    'requireInteraction' => true,
                ]);
            }
        } catch (\Throwable $e) {
            \Log::warning('Announcement Web Push error: ' . $e->getMessage());
        }

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
            $driver = Driver::where('user_id', $request->driver_id)->first();
        }
        if (!$driver) {
            return response()->json(['status' => 'error', 'message' => 'Driver not found.'], 404);
        }

        $oldPos = $driver->queue_position;
        $driverUpdateData = [
            'is_online'        => false,
            'queue_position'   => null,
            'queue_joined_at'  => null,
        ];
        try {
            if (\Illuminate\Support\Facades\Schema::hasColumn('drivers', 'outside_geofence_at')) {
                $driverUpdateData['outside_geofence_at'] = null;
            }
        } catch (\Throwable $e) {}
        Cache::forget("driver_outside_since_{$driver->id}");

        $driver->update($driverUpdateData);

        // Cancel and clear any active rides tied to this driver (Emergency Admin Reset)
        $activeRides = Ride::where('driver_id', $driver->user_id)
            ->whereIn('status', ['bargaining', 'fare_proposed', 'fare_accepted', 'accepted', 'en_route', 'arrived', 'in_transit', 'returning'])
            ->get();

        $clearedRidesCount = 0;
        foreach ($activeRides as $ride) {
            $ride->update([
                'status' => 'cancelled',
                'cancellation_reason' => 'Admin emergency override / queue reset',
            ]);
            $clearedRidesCount++;
            try {
                broadcast(new \App\Events\RideStatusUpdated($ride));
            } catch (\Throwable $e) {}
        }

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

        $rideMsg = $clearedRidesCount > 0 ? " and cleared {$clearedRidesCount} active ride(s)" : "";

        return response()->json([
            'status'  => 'success',
            'message' => "Driver {$driver->full_name} set offline{$rideMsg}.",
        ]);
    }

    /**
     * Admin emergency reset driver trip: safely cancels active ride,
     * clears stuck trip state, and returns driver to the back of the queue (online).
     */
    public function resetDriverTrip(Request $request): JsonResponse
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
            $driver = Driver::where('user_id', $request->driver_id)->first();
        }
        if (!$driver) {
            return response()->json(['status' => 'error', 'message' => 'Driver not found.'], 404);
        }

        // Cancel and clear ANY lingering active or pending rides tied to this driver
        $activeRides = Ride::where(function ($q) use ($driver) {
                $q->where('driver_id', $driver->user_id);
                if ($driver->id) {
                    $q->orWhere('driver_id', $driver->id);
                }
            })
            ->whereNotIn('status', ['completed', 'cancelled'])
            ->get();

        $bargainingRides = $activeRides->filter(fn($r) => $r->status === 'bargaining');
        $otherActiveRides = $activeRides->filter(fn($r) => $r->status !== 'bargaining');

        $reassignedCount = 0;
        $clearedRidesCount = 0;

        // If ride was just bargaining (driver hasn't proposed a fare yet), do not cancel for passenger!
        // Seamlessly link the passenger to the new #1 driver in the queue and send the request to them.
        foreach ($bargainingRides as $ride) {
            $nextDriver = Driver::where('is_online', true)
                ->whereNotNull('queue_position')
                ->where('id', '!=', $driver->id)
                ->where('user_id', '!=', $driver->user_id)
                ->whereNotIn('compliance_status', ['Suspended', 'suspended', 'Rejected', 'rejected'])
                ->orderBy('queue_position', 'asc')
                ->first();

            if ($nextDriver) {
                $ride->update([
                    'driver_id' => $nextDriver->user_id,
                    'status'    => 'bargaining',
                ]);
                $nextDriver->update([
                    'queue_position' => null,
                ]);

                try {
                    app(\App\Services\PushService::class)->sendToUser(
                        $nextDriver->user_id,
                        '🚖 New Ride Request!',
                        "Passenger requesting trip to {$ride->destination} (₱" . number_format($ride->fare, 2) . ")",
                        url('/'),
                        'ride-booking-' . $ride->id,
                        ['type' => 'incoming_booking', 'ride_id' => $ride->id]
                    );
                } catch (\Throwable $e) {}

                try {
                    broadcast(new \App\Events\RideStatusUpdated($ride->fresh()));
                } catch (\Throwable $e) {}

                $reassignedCount++;
            } else {
                // No other online waiting driver available: keep ride alive in searching state
                $ride->update([
                    'driver_id' => null,
                    'status'    => 'searching',
                ]);
                try {
                    broadcast(new \App\Events\RideStatusUpdated($ride->fresh()));
                } catch (\Throwable $e) {}
            }
        }

        // For any ride past the bargaining stage (fare proposed, accepted, en route, arrived, in transit, returning):
        // safely cancel it with admin reset notice.
        foreach ($otherActiveRides as $ride) {
            $ride->update([
                'status' => 'cancelled',
                'cancellation_reason' => 'Admin emergency reset: returned to end of queue',
            ]);
            $clearedRidesCount++;
            try {
                broadcast(new \App\Events\RideStatusUpdated($ride->fresh()));
            } catch (\Throwable $e) {}
        }

        // Ensure driver is online, clear returning flag and geofence timestamps
        $driverUpdateData = [
            'is_online'        => true,
            'is_returning'     => false,
            'queue_joined_at'  => now(),
        ];
        try {
            if (\Illuminate\Support\Facades\Schema::hasColumn('drivers', 'outside_geofence_at')) {
                $driverUpdateData['outside_geofence_at'] = null;
            }
        } catch (\Throwable $e) {}
        Cache::forget("driver_outside_since_{$driver->id}");

        $driver->update($driverUpdateData);

        // Put driver at the very back of the online waiting queue
        try {
            app(\App\Services\QueueService::class)->pushToBack($driver);
        } catch (\Throwable $e) {
            try {
                app(\App\Services\QueueService::class)->normalizeQueue();
            } catch (\Throwable $e2) {}
        }

        try {
            broadcast(new \App\Events\QueueUpdated());
        } catch (\Throwable $e) {}

        $msgParts = [];
        if ($reassignedCount > 0) {
            $msgParts[] = "transferred {$reassignedCount} ride request to new #1 driver";
        }
        if ($clearedRidesCount > 0) {
            $msgParts[] = "cleared {$clearedRidesCount} active ride";
        }
        $rideMsg = !empty($msgParts) ? " (" . implode(', ', $msgParts) . ")" : "";

        return response()->json([
            'status'  => 'success',
            'message' => "Driver {$driver->full_name} moved to the end of the queue{$rideMsg}.",
            'driver'  => [
                'id'             => $driver->id,
                'queue_position' => $driver->fresh()->queue_position,
            ],
        ]);
    }

    /**
     * Passenger Book / Request a Tricycle Ride.
     */
    public function requestPassengerRide(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $request->validate([
            'destination'     => 'required|string|max:255',
            'pickup_location' => 'nullable|string|max:255',
            'fare'            => 'nullable|numeric|min:1',
            'passenger_count' => 'nullable|integer|min:1|max:4',
            'pickup_lat'      => 'nullable|numeric',
            'pickup_lng'      => 'nullable|numeric',
            'destination_lat' => 'nullable|numeric',
            'destination_lng' => 'nullable|numeric',
        ]);

        $destination = $request->input('destination');
        $pickup = $request->input('pickup_location', 'Santa Rosa Homes');
        $fare = (float) $request->input('fare', 25.00);
        $paxCount = (int) $request->input('passenger_count', 1);
        $pickupLat = (float) $request->input('pickup_lat', 15.42955);
        $pickupLng = (float) $request->input('pickup_lng', 120.92240);
        $destLat = ($request->filled('destination_lat') && is_numeric($request->destination_lat)) ? (float) $request->input('destination_lat') : null;
        $destLng = ($request->filled('destination_lng') && is_numeric($request->destination_lng)) ? (float) $request->input('destination_lng') : null;

        // Check if passenger already has an active ride
        $existing = Ride::where('passenger_id', $user->id)
            ->whereIn('status', ['searching', 'fare_proposed', 'fare_accepted', 'accepted', 'arrived', 'in_transit'])
            ->first();

        if ($existing) {
            return response()->json([
                'status'  => 'error',
                'message' => 'You already have an active ride request in progress.',
                'ride'    => $existing,
            ], 400);
        }

        // Find front-of-line online driver at Terminal
        $frontDriver = Driver::where('is_online', true)
            ->whereNotNull('queue_position')
            ->orderBy('queue_position', 'asc')
            ->first();

        $assignedDriverId = null;
        $status = 'searching';

        if ($frontDriver) {
            $assignedDriverId = $frontDriver->user_id;
            $status = 'bargaining';

            // Remove driver from active queue line
            $frontDriver->update([
                'queue_position' => null,
            ]);

            try {
                app(\App\Services\QueueService::class)->normalizeQueue();
            } catch (\Throwable $e) {}
        }

        $ride = Ride::create([
            'passenger_id'    => $user->id,
            'driver_id'       => $assignedDriverId,
            'status'          => $status,
            'pickup_location' => $pickup,
            'destination'     => $destination,
            'pickup_lat'      => $pickupLat,
            'pickup_lng'      => $pickupLng,
            'destination_lat' => $destLat,
            'destination_lng' => $destLng,
            'fare'            => $fare,
        ]);

        if ($assignedDriverId) {
            try {
                app(\App\Services\PushService::class)->sendToUser(
                    $assignedDriverId,
                    '🚖 New Ride Request!',
                    "Passenger requesting trip to {$destination} (₱" . number_format($fare, 2) . ")",
                    url('/'),
                    'ride-booking-' . $ride->id,
                    ['type' => 'incoming_booking', 'ride_id' => $ride->id]
                );
            } catch (\Throwable $e) {}
        }

        try {
            broadcast(new \App\Events\RideStatusUpdated($ride));
        } catch (\Throwable $e) {}

        try {
            broadcast(new \App\Events\QueueUpdated());
        } catch (\Throwable $e) {}

        $driverInfo = null;
        if ($assignedDriverId) {
            $driverUser = User::find($assignedDriverId);
            $driverProfile = Driver::where('user_id', $assignedDriverId)->first();
            $driverInfo = [
                'id'          => $assignedDriverId,
                'name'        => $driverProfile->full_name ?? ($driverUser->name ?? 'TODA Driver'),
                'phone'       => $driverUser->phone_number ?? '',
                'mtop_number' => $driverProfile->mtop_number ?? '101',
                'avatar_url'  => $driverUser->avatar_url ?? null,
                'rating'      => 5.0,
            ];
        }

        return response()->json([
            'status'  => 'success',
            'message' => $assignedDriverId ? 'TODA Tricycle matched! Driver is evaluating your route.' : 'Looking for available TODA tricycle...',
            'ride'    => [
                'id'              => $ride->id,
                'status'          => $ride->status,
                'pickup_location' => $ride->pickup_location,
                'destination'     => $ride->destination,
                'fare'            => (float) $ride->fare,
                'passenger_count' => $paxCount,
                'driver'          => null, // Driver identity anonymized until passenger accepts fare
                'created_at'      => $ride->created_at ? $ride->created_at->format('M d, g:i A') : '',
            ],
        ]);
    }

    /**
     * Get Active Ride for Passenger or Driver.
     */
    public function getActiveRide(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $query = Ride::with(['driver.driverProfile', 'passenger']);

        if ($user->role === 'passenger') {
            $query->where('passenger_id', $user->id);
        } else {
            $query->where('driver_id', $user->id);
        }

        $activeRide = $query->whereIn('status', ['searching', 'bargaining', 'fare_proposed', 'fare_accepted', 'accepted', 'en_route', 'arrived', 'in_transit', 'returning'])
            ->latest('updated_at')
            ->first();

        if (!$activeRide) {
            return response()->json([
                'status'      => 'success',
                'active_ride' => null,
                'ride'        => null,
            ]);
        }

        $isAccepted = in_array($activeRide->status, ['fare_accepted', 'accepted', 'en_route', 'arrived', 'in_transit']);
        $shouldShowDriver = $user->role !== 'passenger' || $isAccepted;

        $driverUser = $activeRide->driver;
        $driverProfile = $driverUser && $driverUser->driverProfile ? $driverUser->driverProfile : null;
        if ($driverUser && !$driverProfile) {
            $driverProfile = Driver::where('user_id', $driverUser->id)->first();
        }

        $cachedLoc = $driverUser ? Cache::get("driver_location_{$driverUser->id}") : null;
        if (!$cachedLoc) {
            $cachedLoc = Cache::get("ride_driver_location_{$activeRide->id}");
        }
        $terminalLat = (float) \App\Support\SystemSettings::get('geofencing.terminal_lat', 15.429550175641715);
        $terminalLng = (float) \App\Support\SystemSettings::get('geofencing.terminal_lng', 120.92240292427664);
        $driverLat = $cachedLoc ? (float) $cachedLoc['lat'] : ($driverProfile && $driverProfile->current_lat ? (float)$driverProfile->current_lat : ($driverUser && $driverUser->current_lat ? (float)$driverUser->current_lat : $terminalLat));
        $driverLng = $cachedLoc ? (float) $cachedLoc['lng'] : ($driverProfile && $driverProfile->current_lng ? (float)$driverProfile->current_lng : ($driverUser && $driverUser->current_lng ? (float)$driverUser->current_lng : $terminalLng));
        $driverHeading = $cachedLoc && isset($cachedLoc['heading']) ? (float) $cachedLoc['heading'] : 0.0;

        $mtop = $driverProfile ? $driverProfile->mtop_number : '101';
        if ($mtop === 'ADMIN' || $mtop === 'PENDING') $mtop = '101';

        $driverInfo = ($shouldShowDriver && $driverUser) ? [
            'id'          => $driverUser->id,
            'name'        => $driverProfile ? $driverProfile->full_name : $driverUser->name,
            'phone'       => $driverUser->phone_number ?? '',
            'mtop_number' => $mtop,
            'avatar_url'  => $driverUser->avatar_url,
            'rating'      => 5.0,
            'lat'         => $driverLat,
            'lng'         => $driverLng,
            'heading'     => $driverHeading,
        ] : null;

        $rideData = [
            'id'              => $activeRide->id,
            'status'          => $activeRide->status,
            'pickup_location' => $activeRide->pickup_location,
            'pickup_lat'      => (float) ($activeRide->pickup_lat ?? 15.42955),
            'pickup_lng'      => (float) ($activeRide->pickup_lng ?? 120.92240),
            'destination'     => $activeRide->destination,
            'destination_lat' => $activeRide->destination_lat ? (float) $activeRide->destination_lat : null,
            'destination_lng' => $activeRide->destination_lng ? (float) $activeRide->destination_lng : null,
            'fare'            => (float) $activeRide->fare,
            'passenger_name'  => $activeRide->passenger ? $activeRide->passenger->name : 'Passenger',
            'passenger_phone' => $activeRide->passenger ? ($activeRide->passenger->phone_number ?? '') : '',
            'driver'          => $driverInfo,
            'driver_lat'      => $driverLat,
            'driver_lng'      => $driverLng,
            'driver_heading'  => $driverHeading,
            'created_at'      => $activeRide->created_at ? $activeRide->created_at->format('M d, g:i A') : '',
        ];

        return response()->json([
            'status'      => 'success',
            'active_ride' => $rideData,
            'ride'        => $rideData,
        ]);
    }

    /**
     * Cancel active ride.
     */
    public function cancelRide(Request $request, $rideId): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $ride = Ride::find($rideId);
        if (!$ride) {
            return response()->json(['status' => 'error', 'message' => 'Ride not found.'], 404);
        }

        // Authorize passenger or driver
        if ($ride->passenger_id !== $user->id && $ride->driver_id !== $user->id && $user->role !== 'admin' && $user->role !== 'superadmin') {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized.'], 403);
        }

        $oldStatus = $ride->status;
        $ride->update(['status' => 'cancelled']);

        // Restore driver to queue
        if ($ride->driver_id) {
            $driver = Driver::where('user_id', $ride->driver_id)->first();
            if ($driver && $driver->is_online) {
                try {
                    if ($user->id === $ride->driver_id && in_array($oldStatus, ['accepted', 'en_route', 'arrived', 'in_transit'])) {
                        app(\App\Services\QueueService::class)->pushToBack($driver);
                    } else {
                        app(\App\Services\QueueService::class)->insertAtFront($driver);
                    }
                } catch (\Throwable $e) {}
            }
        }

        try {
            broadcast(new \App\Events\RideStatusUpdated($ride));
        } catch (\Throwable $e) {}

        try {
            broadcast(new \App\Events\QueueUpdated());
        } catch (\Throwable $e) {}

        return response()->json([
            'status'  => 'success',
            'message' => 'Ride cancelled successfully.',
        ]);
    }

    /**
     * Rate completed ride.
     */
    public function rateRide(Request $request, $rideId): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $ride = Ride::find($rideId);
        if (!$ride) {
            return response()->json(['status' => 'error', 'message' => 'Ride not found.'], 404);
        }

        $request->validate([
            'rating'         => 'required|numeric|min:1|max:5',
            'review_comment' => 'nullable|string|max:500',
            'feedback_tags'  => 'nullable|array',
        ]);

        $ride->update([
            'rating'         => (float) $request->rating,
            'review_comment' => $request->review_comment,
            'feedback_tags'  => $request->feedback_tags ? json_encode($request->feedback_tags) : null,
        ]);

        // Create notification for the specific assigned driver
        $ratingVal = (int) $request->rating;
        $starsText = str_repeat('★', $ratingVal) . str_repeat('☆', 5 - $ratingVal);
        $fareFormatted = '₱' . number_format($ride->fare ?? 25.00, 2);

        $messageLines = [
            "A passenger rated your trip ({$fareFormatted}).",
            "Rating: {$ratingVal}/5 Stars ({$starsText})"
        ];

        if ($request->filled('feedback_tags')) {
            $tags = is_array($request->feedback_tags) ? implode(', ', $request->feedback_tags) : trim($request->feedback_tags);
            if (!empty($tags)) {
                $messageLines[] = "Compliments: " . $tags;
            }
        }

        if ($request->filled('review_comment') && !empty(trim($request->review_comment))) {
            $messageLines[] = "Comment: \"" . trim($request->review_comment) . "\"";
        }

        $driverUserId = $ride->driver_id;
        if ($driverUserId) {
            try {
                \App\Models\Announcement::create([
                    'created_by'      => $user->id,
                    'title'           => "New Rating Received: {$ratingVal}/5 Stars",
                    'message'         => implode("\n", $messageLines),
                    'target_audience' => 'user_' . $driverUserId,
                ]);

                app(\App\Services\PushService::class)->sendToUser(
                    $driverUserId,
                    "⭐ New Rating: {$ratingVal}/5 Stars",
                    "A passenger gave your ride #{$ride->id} a {$ratingVal}-star rating!",
                    route('dashboard'),
                    "ride-{$ride->id}-rating"
                );
            } catch (\Throwable $e) {}

            try {
                broadcast(new \App\Events\RideStatusUpdated($ride));
            } catch (\Throwable $e) {}
            try {
                broadcast(new \App\Events\QueueUpdated());
            } catch (\Throwable $e) {}
        }

        return response()->json([
            'status'  => 'success',
            'message' => 'Thank you for rating your ride!',
        ]);
    }

    /**
     * Driver submits proposed fare.
     */
    public function proposeFare(Request $request, $rideId): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $ride = Ride::find($rideId);
        if (!$ride) {
            return response()->json(['status' => 'error', 'message' => 'Ride not found.'], 404);
        }

        if ($ride->driver_id !== $user->id && $user->role !== 'admin' && $user->role !== 'superadmin') {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'fare' => 'required|numeric|min:1',
        ]);

        $proposedFare = (float) $request->fare;
        $ride->update([
            'fare'   => $proposedFare,
            'status' => 'fare_proposed',
        ]);

        if ($ride->passenger_id) {
            try {
                app(\App\Services\PushService::class)->sendToUser(
                    $ride->passenger_id,
                    '💰 Fare Proposed',
                    "Driver proposed ₱" . number_format($proposedFare, 2) . " for your trip to {$ride->destination}",
                    url('/'),
                    'ride-fare-' . $ride->id,
                    ['type' => 'fare_proposed', 'ride_id' => $ride->id]
                );
            } catch (\Throwable $e) {}
        }

        try {
            broadcast(new \App\Events\RideStatusUpdated($ride));
        } catch (\Throwable $e) {}

        return response()->json([
            'status'  => 'success',
            'message' => "Fare proposal of ₱{$proposedFare} sent to passenger.",
            'ride'    => [
                'id'     => $ride->id,
                'fare'   => (float) $ride->fare,
                'status' => $ride->status,
            ],
        ]);
    }

    /**
     * Passenger accepts driver's proposed fare.
     */
    public function acceptFare(Request $request, $rideId): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $ride = Ride::find($rideId);
        if (!$ride) {
            return response()->json(['status' => 'error', 'message' => 'Ride not found.'], 404);
        }

        if ($ride->passenger_id !== $user->id && $user->role !== 'admin' && $user->role !== 'superadmin') {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized.'], 403);
        }

        $ride->update([
            'status' => 'en_route',
        ]);

        if ($ride->driver_id) {
            try {
                app(\App\Services\PushService::class)->sendToUser(
                    $ride->driver_id,
                    '✅ Fare Accepted!',
                    "Passenger accepted ₱" . number_format($ride->fare, 2) . ". Please proceed to pickup point.",
                    url('/'),
                    'ride-accepted-' . $ride->id,
                    ['type' => 'fare_accepted', 'ride_id' => $ride->id]
                );
            } catch (\Throwable $e) {}
        }

        try {
            broadcast(new \App\Events\RideStatusUpdated($ride));
        } catch (\Throwable $e) {}

        $driverUser = $ride->driver_id ? \App\Models\User::find($ride->driver_id) : null;
        $driverProfile = $driverUser ? \App\Models\Driver::where('user_id', $driverUser->id)->first() : null;
        $driverLoc = \Illuminate\Support\Facades\Cache::get("ride_driver_location_{$ride->id}");
        if (!$driverLoc && $ride->driver_id) {
            $driverLoc = \Illuminate\Support\Facades\Cache::get("driver_location_{$ride->driver_id}");
        }
        $driverLat = $driverLoc ? (float)$driverLoc['lat'] : 15.42955;
        $driverLng = $driverLoc ? (float)$driverLoc['lng'] : 120.92240;
        $driverHeading = $driverLoc && isset($driverLoc['heading']) ? (float)$driverLoc['heading'] : 0.0;

        return response()->json([
            'status'  => 'success',
            'message' => 'Fare accepted! Driver is en route to your pickup location.',
            'ride'    => [
                'id'              => $ride->id,
                'status'          => $ride->status,
                'fare'            => (float) $ride->fare,
                'pickup_location' => $ride->pickup_location,
                'pickup_lat'      => (float) ($ride->pickup_lat ?? 15.42955),
                'pickup_lng'      => (float) ($ride->pickup_lng ?? 120.92240),
                'destination'     => $ride->destination,
                'destination_lat' => $ride->destination_lat ? (float) $ride->destination_lat : null,
                'destination_lng' => $ride->destination_lng ? (float) $ride->destination_lng : null,
                'driver_id'       => $ride->driver_id,
                'driver'          => $driverUser ? [
                    'id'          => $driverUser->id,
                    'name'        => $driverProfile ? $driverProfile->full_name : $driverUser->name,
                    'phone'       => $driverUser->phone_number ?? '',
                    'mtop_number' => $driverProfile ? $driverProfile->mtop_number : null,
                    'avatar_url'  => $driverUser->avatar_url,
                    'lat'         => $driverLat,
                    'lng'         => $driverLng,
                    'heading'     => $driverHeading,
                ] : null,
                'driver_lat'      => $driverLat,
                'driver_lng'      => $driverLng,
                'driver_heading'  => $driverHeading,
            ],
        ]);
    }

    /**
     * Driver confirms arrival at pickup point.
     */
    public function driverArrived(Request $request, $rideId): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $ride = Ride::find($rideId);
        if (!$ride) {
            return response()->json(['status' => 'error', 'message' => 'Ride not found.'], 404);
        }

        if ($ride->driver_id !== $user->id && $user->role !== 'admin' && $user->role !== 'superadmin') {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized.'], 403);
        }

        $ride->update([
            'status' => 'arrived',
        ]);

        if ($ride->passenger_id) {
            try {
                app(\App\Services\PushService::class)->sendToUser(
                    $ride->passenger_id,
                    '📍 Driver is Waiting Outside!',
                    "Your TODA driver has arrived and is waiting outside at your pickup location.",
                    url('/'),
                    'ride-arrived-' . $ride->id,
                    ['type' => 'driver_arrived', 'ride_id' => $ride->id]
                );
            } catch (\Throwable $e) {}
        }

        try {
            broadcast(new \App\Events\RideStatusUpdated($ride));
        } catch (\Throwable $e) {}

        return response()->json([
            'status'  => 'success',
            'message' => 'Arrival confirmed! Passenger has been notified.',
            'ride'    => [
                'id'     => $ride->id,
                'status' => $ride->status,
            ],
        ]);
    }

    /**
     * Driver starts trip / departs with passenger.
     */
    public function startTrip(Request $request, $rideId): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $ride = Ride::find($rideId);
        if (!$ride) {
            return response()->json(['status' => 'error', 'message' => 'Ride not found.'], 404);
        }

        if ($ride->driver_id !== $user->id && $user->role !== 'admin' && $user->role !== 'superadmin') {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized.'], 403);
        }

        $ride->update([
            'status' => 'in_transit',
        ]);

        if ($ride->passenger_id) {
            try {
                app(\App\Services\PushService::class)->sendToUser(
                    $ride->passenger_id,
                    '🚀 Trip Started!',
                    "Heading towards {$ride->destination}.",
                    url('/'),
                    'ride-started-' . $ride->id,
                    ['type' => 'trip_started', 'ride_id' => $ride->id]
                );
            } catch (\Throwable $e) {}
        }

        try {
            broadcast(new \App\Events\RideStatusUpdated($ride));
        } catch (\Throwable $e) {}

        return response()->json([
            'status'  => 'success',
            'message' => 'Trip started! In transit to destination.',
            'ride'    => [
                'id'     => $ride->id,
                'status' => $ride->status,
            ],
        ]);
    }

    /**
     * Fetch temporary in-app chat messages for active ride.
     */
    public function getChatMessages(Request $request, $rideId): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $ride = Ride::find($rideId);
        if (!$ride) {
            return response()->json(['status' => 'error', 'message' => 'Ride not found.'], 404);
        }

        if ($ride->passenger_id !== $user->id && $ride->driver_id !== $user->id && $user->role !== 'admin' && $user->role !== 'superadmin') {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized.'], 403);
        }

        \App\Models\ChatMessage::where('ride_id', $ride->id)
            ->where('sender_id', '!=', $user->id)
            ->where('is_read', false)
            ->update(['is_read' => true]);

        $messages = \App\Models\ChatMessage::with('sender')
            ->where('ride_id', $ride->id)
            ->orderBy('created_at', 'asc')
            ->get()
            ->map(function ($msg) use ($user) {
                $sender = $msg->sender;
                return [
                    'id'            => (int) $msg->id,
                    'ride_id'       => (int) $msg->ride_id,
                    'sender_id'     => (int) $msg->sender_id,
                    'sender_name'   => $sender ? $sender->name : 'User',
                    'sender_avatar' => $sender ? ($sender->avatar_url ?? null) : null,
                    'sender_role'   => $sender ? ($sender->role ?? 'passenger') : 'passenger',
                    'message'       => $msg->message,
                    'time'          => $msg->created_at ? $msg->created_at->format('g:i A') : now()->format('g:i A'),
                    'created_at'    => $msg->created_at ? $msg->created_at->toIso8601String() : now()->toIso8601String(),
                    'is_me'         => ((int) $msg->sender_id === (int) $user->id),
                ];
            });

        return response()->json([
            'status'   => 'success',
            'ride_id'  => $ride->id,
            'messages' => $messages,
        ]);
    }

    /**
     * Send temporary in-app chat message.
     */
    public function sendChatMessage(Request $request, $rideId): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $ride = Ride::find($rideId);
        if (!$ride) {
            return response()->json(['status' => 'error', 'message' => 'Ride not found.'], 404);
        }

        if ($ride->passenger_id !== $user->id && $ride->driver_id !== $user->id && $user->role !== 'admin' && $user->role !== 'superadmin') {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'message' => 'required|string|max:1000',
        ]);

        $chatMessage = \App\Models\ChatMessage::create([
            'ride_id'   => $ride->id,
            'sender_id' => $user->id,
            'message'   => trim($request->input('message')),
            'is_read'   => false,
        ]);

        $chatMessage->load('sender');

        try {
            broadcast(new \App\Events\ChatMessageSent($chatMessage));
        } catch (\Throwable $e) {}

        // Send background Web Push to recipient (Passenger or Driver)
        $recipientId = ($user->id === (int) $ride->passenger_id) ? (int) $ride->driver_id : (int) $ride->passenger_id;
        if ($recipientId) {
            try {
                app(\App\Services\PushService::class)->sendToUser(
                    $recipientId,
                    "💬 " . $user->name,
                    $chatMessage->message,
                    "/tabs/home",
                    "srh-toda-chat-{$ride->id}"
                );
            } catch (\Throwable $e) {}
        }

        return response()->json([
            'status'  => 'success',
            'message' => [
                'id'            => (int) $chatMessage->id,
                'ride_id'       => (int) $chatMessage->ride_id,
                'sender_id'     => (int) $chatMessage->sender_id,
                'sender_name'   => $user->name,
                'sender_avatar' => $user->avatar_url ?? null,
                'sender_role'   => $user->role ?? 'passenger',
                'message'       => $chatMessage->message,
                'time'          => $chatMessage->created_at->format('g:i A'),
                'created_at'    => $chatMessage->created_at->toIso8601String(),
                'is_me'         => true,
            ],
        ]);
    }

    /**
     * Submit Incident Report for a Ride.
     */
    public function reportDriver(Request $request, $rideId): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $ride = Ride::find($rideId);
        if (!$ride) {
            return response()->json(['status' => 'error', 'message' => 'Ride not found.'], 404);
        }

        $request->validate([
            'category'    => 'required|string|max:100',
            'subject'     => 'required|string|max:255',
            'description' => 'required|string|max:1000',
        ]);

        $report = Report::create([
            'reporter_id' => $user->id,
            'driver_id'   => $ride->driver_id,
            'ride_id'     => $ride->id,
            'category'    => $request->category,
            'subject'     => $request->subject,
            'description' => $request->description,
            'status'      => 'pending',
        ]);

        try {
            \App\Models\Announcement::create([
                'created_by'      => $user->id,
                'title'           => "🚨 New Passenger Report #{$report->id}: {$request->category}",
                'message'         => "Passenger {$user->name} submitted an incident report: \"{$request->subject}\". Description: \"" . \Illuminate\Support\Str::limit($request->description, 120) . "\"",
                'target_audience' => 'ADMIN',
            ]);
            broadcast(new \App\Events\ReportUpdated($report));
        } catch (\Throwable $e) {}

        return response()->json([
            'status'  => 'success',
            'message' => 'Incident report submitted to TODA administration.',
            'report'  => $report,
        ]);
    }
}
