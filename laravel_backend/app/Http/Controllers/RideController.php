<?php

namespace App\Http\Controllers;

use App\Models\Ride;
use App\Models\Driver;
use App\Services\QueueService;
use App\Events\RideStatusUpdated;
use Illuminate\Http\Request;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;

class RideController extends Controller
{
    public function store(Request $request)
    {
        // Validate the incoming request
        $request->validate([
            'pickup_location' => 'required|string|max:255',
            'destination' => 'required|string|max:255',
            'pickup_lat' => 'nullable|numeric',
            'pickup_lng' => 'nullable|numeric',
            'destination_lat' => 'nullable|numeric',
            'destination_lng' => 'nullable|numeric',
        ]);

        $ride = Ride::create([
            'passenger_id' => auth()->id(),
            'status' => 'searching',
            'pickup_location' => $request->pickup_location,
            'pickup_lat' => $request->filled('pickup_lat') ? floatval($request->pickup_lat) : 15.4265,
            'pickup_lng' => $request->filled('pickup_lng') ? floatval($request->pickup_lng) : 120.9405,
            'destination' => $request->destination,
            'destination_lat' => $request->filled('destination_lat') ? floatval($request->destination_lat) : 15.4215,
            'destination_lng' => $request->filled('destination_lng') ? floatval($request->destination_lng) : 120.9350,
            'fare' => 30.00,
        ]);

        try { broadcast(new RideStatusUpdated($ride)); } catch (\Throwable $e) {}
        try { broadcast(new \App\Events\QueueUpdated()); } catch (\Throwable $e) {}

        // Web-push a new booking ONLY to the front-of-line driver (the one who
        // will actually see the dashboard overlay) — fires even with the app closed.
        try {
            app(\App\Services\PushService::class)->sendToFrontDriver(
                '🚖 New Passenger Request',
                $ride->pickup_location . ' → ' . $ride->destination,
                route('dashboard'),
                "ride-{$ride->id}-searching"
            );
        } catch (\Throwable $e) {}

        if (request()->wantsJson() || request()->ajax()) {
            return response()->json([
                'status' => 'searching',
                'message' => 'Ride request submitted! Waiting for driver to set fare.',
                'ride_id' => $ride->id,
                'ride' => $ride,
                'redirect' => route('dashboard')
            ]);
        }

        return back()->with('status', 'Ride request submitted! Waiting for driver to set fare.');
    }

    public function proposeFare(Request $request, Ride $ride, QueueService $queueService)
    {
        $request->validate([
            'fare' => 'required|numeric|min:1',
        ]);

        $fare = floatval($request->fare);

        $ride->update([
            'driver_id' => auth()->id(),
            'fare' => $fare,
            'status' => 'fare_proposed',
        ]);

        // Shift queue immediately so the driver is off the waiting line and the next driver advances to #1 in queue
        $driverRecord = Driver::where('user_id', auth()->id())->first();
        if ($driverRecord && $driverRecord->is_online && $driverRecord->queue_position !== null) {
            $queueService->removeAndShift($driverRecord);
        }

        try { broadcast(new RideStatusUpdated($ride)); } catch (\Throwable $e) {}

        if ($request->wantsJson()) {
            return response()->json(['status' => 'fare_proposed', 'fare' => $fare]);
        }

        return back()->with('status', 'Fare proposal of ₱' . number_format($fare, 2) . ' sent to passenger.');
    }

    public function confirmFare(Ride $ride, QueueService $queueService)
    {
        $ride->update([
            'status' => 'accepted',
        ]);

        if ($ride->driver_id) {
            $driverRecord = Driver::where('user_id', $ride->driver_id)->first();
            if ($driverRecord && $driverRecord->is_online && $driverRecord->queue_position !== null) {
                $queueService->removeAndShift($driverRecord);
            }
        }

        try { broadcast(new RideStatusUpdated($ride)); } catch (\Throwable $e) {}

        if (request()->wantsJson() || request()->ajax()) {
            $driverUser = $ride->driver;
            $driverProfile = optional($ride->driver)->driverProfile;
            $drvCache = \Illuminate\Support\Facades\Cache::get("ride_driver_location_{$ride->id}")
                ?: ($ride->driver_id ? \Illuminate\Support\Facades\Cache::get("driver_location_{$ride->driver_id}") : null);
            $driverLat = $drvCache ? (float)$drvCache['lat'] : ($driverProfile && $driverProfile->current_lat ? (float)$driverProfile->current_lat : ($driverUser && $driverUser->current_lat ? (float)$driverUser->current_lat : (float)$ride->pickup_lat));
            $driverLng = $drvCache ? (float)$drvCache['lng'] : ($driverProfile && $driverProfile->current_lng ? (float)$driverProfile->current_lng : ($driverUser && $driverUser->current_lng ? (float)$driverUser->current_lng : (float)$ride->pickup_lng));
            $driverHeading = $drvCache && isset($drvCache['heading']) ? (float)$drvCache['heading'] : null;

            return response()->json([
                'status' => 'accepted',
                'message' => 'Fare rate confirmed! Trip started.',
                'redirect' => route('dashboard'),
                'ride' => [
                    'id' => $ride->id,
                    'status' => 'accepted',
                    'fare' => $ride->fare,
                    'driver_id' => $ride->driver_id,
                    'driver_name' => $driverUser ? $driverUser->name : 'TODA Driver',
                    'driver_rating' => $driverUser ? ($driverUser->average_rating ?? 5.0) : 5.0,
                    'pickup_location' => $ride->pickup_location,
                    'destination' => $ride->destination,
                    'pickup_lat' => (float)$ride->pickup_lat,
                    'pickup_lng' => (float)$ride->pickup_lng,
                    'dest_lat' => (float)$ride->destination_lat,
                    'dest_lng' => (float)$ride->destination_lng,
                    'destination_lat' => (float)$ride->destination_lat,
                    'destination_lng' => (float)$ride->destination_lng,
                    'driver_lat' => $driverLat,
                    'driver_lng' => $driverLng,
                    'driver_heading' => $driverHeading,
                ]
            ]);
        }

        return redirect()->route('dashboard')->with('status', 'Fare rate confirmed! Trip started.');
    }

    public function cancel(Ride $ride, QueueService $queueService)
    {
        $user = auth()->user();

        // Only re-shuffle the queue when the ride is still pending. Repeated
        // cancels on an already-cancelled ride must not keep re-running,
        // because inserting the driver at Position #1 every time is what
        // re-offered the same ride to the same driver (the decline loop).
        $pendingStatuses = ['searching', 'fare_proposed'];
        $activeStatuses = ['accepted', 'arrived', 'in_transit', 'returning'];

        $driverToRestore = null;
        if ($ride->driver_id) {
            $driverToRestore = Driver::where('user_id', $ride->driver_id)->first();
        } elseif ($user && ($user->role === 'driver' || $user->role === 'admin')) {
            $driverToRestore = Driver::where('user_id', $user->id)->first();
        }

        if ($driverToRestore) {
            if (in_array($ride->status, $pendingStatuses)) {
                if ($ride->passenger_id === null) {
                    // Terminal Walk-in cancelled -> Driver remains #1 at Terminal!
                    $queueService->insertAtFront($driverToRestore);
                }
            } elseif (in_array($ride->status, $activeStatuses)) {
                // Active trip was cancelled -> restore driver online firmly at Position #1!
                $queueService->insertAtFront($driverToRestore);
            }
        }

        // Cancel the ride and clean up any lingering active trip records for this driver
        $ride->update(['status' => 'cancelled']);

        if ($user && ($user->role === 'driver' || $user->role === 'admin')) {
            Ride::where('driver_id', $user->id)
                ->whereIn('status', ['accepted', 'arrived', 'in_transit', 'returning'])
                ->update(['status' => 'cancelled']);
        }
        
        try { broadcast(new RideStatusUpdated($ride)); } catch (\Throwable $e) {}
        try { broadcast(new \App\Events\QueueUpdated()); } catch (\Throwable $e) {}

        if (request()->wantsJson() || request()->ajax()) {
            return response()->json([
                'status' => 'cancelled',
                'message' => 'Ride request cancelled.',
                'redirect' => route('dashboard')
            ]);
        }

        return redirect()->route('dashboard')->with('status', 'Ride request cancelled.');
    }

    public function accept(Ride $ride, QueueService $queueService)
    {
        // Find the driver profile directly
        $driverRecord = Driver::where('user_id', auth()->id())->first();

        // Safety check
        if (!$driverRecord) {
            abort(403, 'You must be a registered driver to accept rides.');
        }

        // Link driver to ride
        $ride->update([
            'driver_id' => auth()->id(),
            'status' => 'accepted'
        ]);

        // Immediately seed current driver location into ride cache if available
        $driverLoc = Cache::get("driver_location_" . auth()->id());
        if (!$driverLoc) {
            $driverLoc = [
                'lat' => 15.429550175641715,
                'lng' => 120.92240292427664,
                'heading' => 0,
            ];
            Cache::put("driver_location_" . auth()->id(), $driverLoc, 3600);
        }
        Cache::put("ride_driver_location_{$ride->id}", $driverLoc, 3600);

        try {
            \App\Events\TricycleLocationUpdated::dispatch(
                auth()->id(),
                (float)$driverLoc['lat'],
                (float)$driverLoc['lng'],
                isset($driverLoc['heading']) ? (float)$driverLoc['heading'] : null,
                null,
                $ride->id
            );
        } catch (\Throwable $e) {}

        // Shift the queue
        $queueService->removeAndShift($driverRecord);

        try { broadcast(new RideStatusUpdated($ride)); } catch (\Throwable $e) {}

        if (request()->wantsJson() || request()->ajax()) {
            return response()->json([
                'status' => 'accepted',
                'message' => 'Trip accepted!',
                'redirect' => route('dashboard')
            ]);
        }

        return redirect()->route('dashboard'); 
    }

    public function arrived(Ride $ride, Request $request)
    {
        if ($request->filled('lat') && $request->filled('lng')) {
            $lat = (float) $request->lat;
            $lng = (float) $request->lng;
            $heading = $request->filled('heading') ? (float) $request->heading : null;
            \Illuminate\Support\Facades\Cache::put("ride_driver_location_{$ride->id}", ['lat' => $lat, 'lng' => $lng, 'heading' => $heading], 3600);
            if ($ride->driver_id) {
                \Illuminate\Support\Facades\Cache::put("driver_location_{$ride->driver_id}", ['lat' => $lat, 'lng' => $lng, 'heading' => $heading], 3600);
            }
        }

        // Update the ride status so the passenger knows the driver is outside
        $ride->update(['status' => 'arrived']);
        
        try { broadcast(new RideStatusUpdated($ride)); } catch (\Throwable $e) {}

        if ($request->wantsJson() || $request->ajax()) {
            return response()->json([
                'status' => 'success',
                'message' => 'Notification sent: You have arrived at pickup location.',
                'redirect' => route('dashboard')
            ]);
        }

        return redirect()->route('dashboard');
    }

    public function startTransit(Ride $ride, Request $request)
    {
        if ($request->filled('lat') && $request->filled('lng')) {
            $lat = (float) $request->lat;
            $lng = (float) $request->lng;
            $heading = $request->filled('heading') ? (float) $request->heading : null;
            \Illuminate\Support\Facades\Cache::put("ride_driver_location_{$ride->id}", ['lat' => $lat, 'lng' => $lng, 'heading' => $heading], 3600);
            if ($ride->driver_id) {
                \Illuminate\Support\Facades\Cache::put("driver_location_{$ride->driver_id}", ['lat' => $lat, 'lng' => $lng, 'heading' => $heading], 3600);
            }
        }

        // Update the status so the passenger knows they are en route
        $ride->update(['status' => 'in_transit']);
        
        try { broadcast(new RideStatusUpdated($ride)); } catch (\Throwable $e) {}
        
        if ($request->wantsJson() || $request->ajax()) {
            return response()->json([
                'status' => 'success',
                'message' => 'Transit started! Drive safely to destination.',
                'redirect' => route('dashboard')
            ]);
        }

        return redirect()->route('dashboard');
    }

    public function updateFare(Request $request, Ride $ride)
    {
        $request->validate([
            'fare' => 'required|numeric|min:0',
        ]);

        $ride->update(['fare' => floatval($request->fare)]);

        if ($request->wantsJson() || $request->ajax()) {
            return response()->json([
                'status' => 'success',
                'message' => 'Ride fare rate updated!',
                'redirect' => route('dashboard')
            ]);
        }

        return redirect()->route('dashboard')->with('status', 'Ride fare updated!');
    }

    public function showActive(Ride $ride, Request $request)
    {
        // Ensure only the assigned driver can see this page
        if ($ride->driver_id !== auth()->id()) {
            abort(403, 'Unauthorized access to this ride.');
        }

        return redirect()->route('dashboard');
    }

    public function startWalkIn(Request $request, QueueService $queueService)
    {
        $driverRecord = Driver::where('user_id', auth()->id())->first();

        if (!$driverRecord) {
            if ($request->wantsJson() || $request->ajax()) {
                return response()->json(['error' => 'Unauthorized. Driver profile not found.'], 403);
            }
            return back()->with('error', 'Unauthorized. Driver profile not found.');
        }

        // 1. Check if driver already has an active trip in progress
        $existingActiveTrip = Ride::where('driver_id', auth()->id())
            ->whereIn('status', ['accepted', 'arrived', 'in_transit', 'returning'])
            ->first();

        $isAdditionalPassenger = false;

        if ($existingActiveTrip) {
            if ($existingActiveTrip->status === 'returning') {
                // Passenger was dropped off, driver is returning to terminal and picked up an additional passenger!
                // Mark previous returning trip as completed.
                $existingActiveTrip->update([
                    'status' => 'completed',
                    'completed_at' => now(),
                ]);
                try { broadcast(new RideStatusUpdated($existingActiveTrip)); } catch (\Throwable $e) {}
                $isAdditionalPassenger = true;
            } else {
                if ($request->wantsJson() || $request->ajax()) {
                    return response()->json([
                        'status' => 'success',
                        'message' => 'Active trip already in progress!',
                        'ride_id' => $existingActiveTrip->id,
                        'redirect' => route('dashboard')
                    ]);
                }
                return redirect()->route('dashboard');
            }
        } else {
            // Driver starting fresh walk-in from terminal must be online
            if (!$driverRecord->is_online) {
                if ($request->wantsJson() || $request->ajax()) {
                    return response()->json(['error' => 'You must be online to accept passengers.'], 422);
                }
                return back()->with('error', 'You must be online to accept passengers.');
            }

            // Terminal walk-in rides are for the front of the queue only
            if ($driverRecord->queue_position !== null && $driverRecord->queue_position > 1) {
                if ($request->wantsJson() || $request->ajax()) {
                    return response()->json(['error' => 'You must be #1 in queue to start a terminal walk-in ride.'], 422);
                }
                return back()->with('error', 'You must be #1 in queue to start a terminal walk-in ride.');
            }
        }

        $fare = floatval($request->input('fare', 30.00));
        if ($fare <= 0) {
            $fare = 30.00;
        }

        // Create the instant ride (Walk-In or Additional Passenger)
        $ride = Ride::create([
            'passenger_id' => null, 
            'driver_id' => auth()->id(),
            'status' => 'accepted',
            'pickup_location' => $isAdditionalPassenger ? 'Wayside Pickup (Additional Passenger)' : 'TODA Terminal (Walk-In)',
            'destination' => 'Passenger Specified (Walk-In)',
            'fare' => $fare,
        ]);

        // Shift queue if driver was currently queued
        if ($driverRecord->is_online && $driverRecord->queue_position !== null) {
            $queueService->removeAndShift($driverRecord);
        }

        try { broadcast(new RideStatusUpdated($ride)); } catch (\Throwable $e) {}
        
        if ($request->wantsJson() || $request->ajax()) {
            return response()->json([
                'status' => 'success',
                'message' => $isAdditionalPassenger ? 'Additional passenger trip started!' : 'Terminal walk-in trip started!',
                'ride_id' => $ride->id,
                'redirect' => route('dashboard')
            ]);
        }
        return redirect()->route('dashboard'); 
    }

    public function startReturning(Ride $ride, Request $request)
    {
        // Change status to returning (passenger dropped off, heading back to TODA terminal)
        $ride->update(['status' => 'returning']);

        if ($ride->passenger_id) {
            Ride::where('passenger_id', $ride->passenger_id)
                ->where('id', '!=', $ride->id)
                ->where('status', 'searching')
                ->delete();
        }

        try { broadcast(new RideStatusUpdated($ride)); } catch (\Throwable $e) {}

        $message = 'Passenger dropped off! On the way back to TODA Terminal.';

        if ($request->wantsJson() || $request->ajax()) {
            return response()->json([
                'status' => 'returning',
                'message' => $message,
                'redirect' => route('dashboard')
            ]);
        }

        return redirect()->route('dashboard')->with('status', $message);
    }

    public function completeReturn(Ride $ride, QueueService $queueService, Request $request)
    {
        // Mark ride as completed
        $ride->update(['status' => 'completed']);

        // Clear any other in-progress rides for this driver
        Ride::where('driver_id', auth()->id())
            ->whereIn('status', ['accepted', 'arrived', 'in_transit', 'returning'])
            ->update(['status' => 'completed']);

        try { broadcast(new RideStatusUpdated($ride)); } catch (\Throwable $e) {}

        // Return driver back to queue
        $driver = Driver::where('user_id', auth()->id())->first();

        if ($driver) {
            $lastPosition = Driver::where('is_online', true)->max('queue_position') ?? 0;
            
            $driver->update([
                'is_online' => true,
                'queue_position' => $lastPosition + 1
            ]);

            $queueService->normalizeQueue();
            try {
                broadcast(new \App\Events\QueueUpdated());
            } catch (\Throwable $e) {}
        }

        $message = 'Returned to TODA Terminal! You are back in queue.';

        session(['completed_trip_fare' => $ride->fare ?? 30.00, 'trip_completed_modal' => true]);

        if ($request->wantsJson() || $request->ajax()) {
            return response()->json([
                'status' => 'success',
                'message' => $message,
                'redirect' => route('dashboard')
            ]);
        }

        return redirect()->route('dashboard')->with('status', $message)->with('completed_trip_fare', $ride->fare ?? 30.00);
    }

    public function addPassengerWhileReturning(Ride $ride, Request $request)
    {
        $destination = $request->input('destination', 'Santa Rosa Homes');
        $fare = floatval($request->input('fare', 30.00));
        if ($fare <= 0) $fare = 30.00;

        // Mark previous returning ride as completed
        $ride->update(['status' => 'completed']);

        // Create new active ride for additional passenger
        $newRide = Ride::create([
            'passenger_id' => null,
            'driver_id' => auth()->id(),
            'status' => 'in_transit',
            'pickup_location' => 'Wayback En Route Pick-up',
            'destination' => $destination,
            'fare' => $fare,
        ]);

        if ($request->wantsJson() || $request->ajax()) {
            return response()->json([
                'status' => 'success',
                'message' => 'Additional passenger picked up! Trip restarted.',
                'redirect' => route('rides.active', $newRide)
            ]);
        }

        return redirect()->route('rides.active', $newRide)->with('status', 'Additional passenger picked up!');
    }

    public function complete(Ride $ride, QueueService $queueService, Request $request)
    {
        return $this->startReturning($ride, $request);
    }

    public function rateRide(Request $request, Ride $ride)
    {
        if (auth()->id() !== $ride->passenger_id && auth()->user()->role !== 'admin') {
            if ($request->wantsJson()) {
                return response()->json(['error' => 'Unauthorized rating attempt.'], 403);
            }
            return back()->with('error', 'Unauthorized.');
        }

        // Handle "Skip for Now" action
        if ($request->has('skip') || $request->input('rating') == '0') {
            $ride->update([
                'rating' => 0, // 0 indicates passenger explicitly skipped rating
            ]);
            session(['skipped_ride_' . $ride->id => true]);

            if ($request->wantsJson()) {
                return response()->json(['status' => 'skipped']);
            }
            return back();
        }

        $request->validate([
            'rating' => 'required|integer|min:1|max:5',
            'review_comment' => 'nullable|string|max:500',
            'feedback_tags' => 'nullable|string|max:255',
        ]);

        $ride->update([
            'rating' => (int) $request->rating,
            'review_comment' => $request->review_comment,
            'feedback_tags' => $request->feedback_tags,
        ]);

        session(['skipped_ride_' . $ride->id => true]);

        // Broadcast anonymous rating & comment to specific driver's notification dropdown
        try {
            $ratingVal = (int) $request->rating;
            $starsText = str_repeat('★', $ratingVal) . str_repeat('☆', 5 - $ratingVal);
            $fareFormatted = '₱' . number_format($ride->fare ?? 30.00, 2);

            $messageLines = [
                "A passenger rated your trip ({$fareFormatted}).",
                "Rating: {$ratingVal}/5 Stars ({$starsText})"
            ];

            if ($request->filled('feedback_tags')) {
                $messageLines[] = "Compliments: " . trim($request->feedback_tags);
            }

            if ($request->filled('review_comment')) {
                $messageLines[] = "Comment: \"" . trim($request->review_comment) . "\"";
            }

            // Target ONLY the specific driver assigned to this ride
            $driver = \App\Models\Driver::where('user_id', $ride->driver_id)->first();
            $driverUserId = $driver ? $driver->user_id : null;

            if ($driverUserId) {
                $existingNotification = \App\Models\Announcement::where('target_audience', 'user_' . $driverUserId)
                    ->where('title', 'like', 'New Rating Received%')
                    ->where('created_at', '>=', now()->subSeconds(15))
                    ->first();

                if (!$existingNotification) {
                    \App\Models\Announcement::create([
                        'created_by' => auth()->id(),
                        'title' => "New Rating Received: {$ratingVal}/5 Stars",
                        'message' => implode("\n", $messageLines),
                        'target_audience' => 'user_' . $driverUserId,
                    ]);

                    app(\App\Services\PushService::class)->sendToUser(
                        $driverUserId,
                        "⭐ New Rating: {$ratingVal}/5 Stars",
                        "A passenger gave your ride #{$ride->id} a {$ratingVal}-star rating!",
                        route('dashboard'),
                        "ride-{$ride->id}-rating"
                    );
                }
            }
        } catch (\Throwable $e) {
            // Silently swallow any notification creation errors to not block rating submission
        }

        if ($request->wantsJson()) {
            return response()->json(['status' => 'success', 'message' => 'Thank you for your rating!']);
        }

        return back()->with('status', 'Thank you for rating your TODA ride experience!');
    }

    public function earnings()
    {
        $user = auth()->user();

        if ($user->role !== 'driver' && $user->role !== 'admin') {
            return redirect()->route('dashboard')->with('error', 'Earnings feature is available for Drivers and Admins.');
        }

        $today = Carbon::today();
        $startOfWeek = Carbon::now()->startOfWeek();
        $startOfMonth = Carbon::now()->startOfMonth();

        // Personal earnings only — every role only ever sees summary
        // figures and ride breakdowns for their own completed rides.
        $todayEarnings = Ride::where('driver_id', $user->id)
            ->where('status', 'completed')
            ->where('updated_at', '>=', $today)
            ->sum('fare');

        $weeklyEarnings = Ride::where('driver_id', $user->id)
            ->where('status', 'completed')
            ->where('updated_at', '>=', $startOfWeek)
            ->sum('fare');

        $monthlyEarnings = Ride::where('driver_id', $user->id)
            ->where('status', 'completed')
            ->where('updated_at', '>=', $startOfMonth)
            ->sum('fare');

        $totalRides = Ride::where('driver_id', $user->id)
            ->where('status', 'completed')
            ->count();

        return view('drivers.earnings', compact(
            'todayEarnings',
            'weeklyEarnings',
            'monthlyEarnings',
            'totalRides'
        ));
    }

    public function history(Request $request)
    {
        $user = auth()->user();

        if ($user->role === 'driver' || $user->role === 'admin') {
            $baseQuery = Ride::where('driver_id', $user->id)
                        ->where('driver_hidden', false);

            $totalCompleted = (clone $baseQuery)->where('status', 'completed')->count();
            $totalRevenue = (clone $baseQuery)->where('status', 'completed')->sum('fare');
            $totalCancelled = (clone $baseQuery)->where('status', 'cancelled')->count();
            $totalAll = (clone $baseQuery)->count();

            $query = (clone $baseQuery)->orderBy('created_at', 'desc');

            if ($request->filled('search')) {
                $s = trim($request->search);
                $query->where(function($q) use ($s) {
                    $q->where('pickup_location', 'like', "%{$s}%")
                      ->orWhere('destination', 'like', "%{$s}%")
                      ->orWhereHas('passenger', function($pq) use ($s) {
                          $pq->where('name', 'like', "%{$s}%");
                      });
                });
            }

            if ($request->filled('status')) {
                $status = $request->status;
                if ($status === 'in_progress') {
                    $query->whereNotIn('status', ['completed', 'cancelled']);
                } else {
                    $query->where('status', $status);
                }
            }

            $rides = $query->paginate(25);

            if ($request->wantsJson() || ($request->ajax() && ($request->has('page') || $request->has('search') || $request->has('status')))) {
                $html = view('drivers.partials.history-groups', compact('rides'))->render();
                return response()->json([
                    'html' => $html,
                    'hasMore' => $rides->hasMorePages(),
                    'nextPage' => $rides->currentPage() + 1,
                    'total' => $rides->total(),
                    'count' => $rides->count(),
                ]);
            }

            return view('drivers.history', compact('rides', 'totalCompleted', 'totalRevenue', 'totalCancelled', 'totalAll'));
        }

        $baseQuery = Ride::where('passenger_id', $user->id)
                    ->where('passenger_hidden', false) 
                    ->with('driver.driverProfile');

        $totalCompleted = (clone $baseQuery)->where('status', 'completed')->count();
        $totalSpent = (clone $baseQuery)->where('status', 'completed')->sum('fare');
        $totalCancelled = (clone $baseQuery)->where('status', 'cancelled')->count();
        $totalAll = (clone $baseQuery)->count();

        $query = (clone $baseQuery)->orderBy('created_at', 'desc');

        if ($request->filled('search')) {
            $s = trim($request->search);
            $query->where(function($q) use ($s) {
                $q->where('pickup_location', 'like', "%{$s}%")
                  ->orWhere('destination', 'like', "%{$s}%")
                  ->orWhereHas('driver', function($dq) use ($s) {
                      $dq->where('name', 'like', "%{$s}%");
                  });
            });
        }

        if ($request->filled('status')) {
            $status = $request->status;
            if ($status === 'in_progress') {
                $query->whereNotIn('status', ['completed', 'cancelled']);
            } else {
                $query->where('status', $status);
            }
        }

        $rides = $query->paginate(25);

        if ($request->wantsJson() || ($request->ajax() && ($request->has('page') || $request->has('search') || $request->has('status')))) {
            $html = view('passenger.partials.history-groups', compact('rides'))->render();
            return response()->json([
                'html' => $html,
                'hasMore' => $rides->hasMorePages(),
                'nextPage' => $rides->currentPage() + 1,
                'total' => $rides->total(),
                'count' => $rides->count(),
            ]);
        }

        return view('passenger.history', compact('rides', 'totalCompleted', 'totalSpent', 'totalCancelled', 'totalAll'));
    }

    public function clearHistory()
    {
        Ride::where('passenger_id', auth()->id())
              ->update(['passenger_hidden' => true]);

        return back()->with('status', 'Your ride history has been cleared!');
    }

    public function clearDriverHistory()
    {
        Ride::where('driver_id', auth()->id())
              ->update(['driver_hidden' => true]);

        return back()->with('status', 'Your driving history has been cleared!');
    }

    public function updateLocation(Request $request, Ride $ride)
    {
        $request->validate([
            'lat' => 'required|numeric',
            'lng' => 'required|numeric',
        ]);

        $lat = (float) $request->lat;
        $lng = (float) $request->lng;
        $heading = $request->has('heading') ? (float) $request->heading : null;
        $speed = $request->has('speed') ? (float) $request->speed : null;

        Cache::put("ride_driver_location_{$ride->id}", [
            'lat' => $lat,
            'lng' => $lng,
            'heading' => $heading,
        ], 3600);

        if ($ride->driver_id) {
            Cache::put("driver_location_{$ride->driver_id}", [
                'lat' => $lat,
                'lng' => $lng,
                'heading' => $heading,
            ], 3600);
        }

        // Instant Real-time WebSocket Broadcast via Laravel Reverb
        \App\Events\TricycleLocationUpdated::dispatch(auth()->id(), $lat, $lng, $heading, $speed, $ride->id);

        return response()->json([
            'status' => 'success',
            'lat' => $lat,
            'lng' => $lng,
            'heading' => $heading,
        ]);
    }

    public function getLiveLocation(Ride $ride)
    {
        $defaultLat = 15.429550175641715;
        $defaultLng = 120.92240292427664;

        $location = Cache::get("ride_driver_location_{$ride->id}");
        if (!$location && $ride->driver_id) {
            $location = Cache::get("driver_location_{$ride->driver_id}");
        }
        if (!$location) {
            $location = ['lat' => $defaultLat, 'lng' => $defaultLng, 'heading' => null];
        }

        return response()->json([
            'status' => $ride->status,
            'lat' => (float) $location['lat'],
            'lng' => (float) $location['lng'],
            'heading' => isset($location['heading']) ? (float) $location['heading'] : null,
            'driver_name' => optional($ride->driver)->name ?? 'TODA Driver'
        ]);
    }

    /**
     * Lightweight JSON endpoint for the passenger status poller.
     * Returns the current ride state without rendering the full Blade view,
     * so the client can update UI elements in-place without flickering the map.
     */
    public function passengerStatus()
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['status' => 'unauthenticated'], 401);
        }

        $activeRide = Ride::with('driver')
            ->where('passenger_id', $user->id)
            ->whereIn('status', ['searching', 'fare_proposed', 'fare_accepted', 'accepted', 'arrived', 'in_transit'])
            ->first();

        if (!$activeRide) {
            // Check if there's a ride completed/cancelled within the last 10 seconds
            $latestEnded = Ride::where('passenger_id', $user->id)
                ->whereIn('status', ['completed', 'cancelled'])
                ->where('updated_at', '>=', now()->subSeconds(10))
                ->latest('updated_at')
                ->first();

            return response()->json([
                'status'      => 'none',
                'last_status' => $latestEnded ? $latestEnded->status : null,
                'ride'        => null,
            ]);
        }

        $defaultLat = 15.429550175641715;
        $defaultLng = 120.92240292427664;
        $driverLoc  = Cache::get("ride_driver_location_{$activeRide->id}");
        if (!$driverLoc && $activeRide->driver_id) {
            $driverLoc = Cache::get("driver_location_{$activeRide->driver_id}");
        }
        if (!$driverLoc) {
            $driverLoc = ['lat' => $defaultLat, 'lng' => $defaultLng, 'heading' => null];
        }

        return response()->json([
            'status'      => $activeRide->status,
            'last_status' => null,
            'ride'        => [
                'id'               => $activeRide->id,
                'driver_id'        => $activeRide->driver_id,
                'fare'             => $activeRide->fare,
                'pickup_location'  => $activeRide->pickup_location,
                'destination'      => $activeRide->destination,
                'pickup_lat'       => (float) $activeRide->pickup_lat,
                'pickup_lng'       => (float) $activeRide->pickup_lng,
                'destination_lat'  => (float) $activeRide->destination_lat,
                'destination_lng'  => (float) $activeRide->destination_lng,
                'driver_lat'       => (float) $driverLoc['lat'],
                'driver_lng'       => (float) $driverLoc['lng'],
                'driver_heading'   => isset($driverLoc['heading']) ? (float) $driverLoc['heading'] : null,
                'driver_name'      => optional($activeRide->driver)->name ?? 'TODA Driver',
                'driver_rating'    => optional($activeRide->driver)->average_rating ?? 5.0,
            ],
        ]);
    }
}