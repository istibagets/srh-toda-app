<?php

namespace App\Http\Controllers;

use App\Models\Driver;
use App\Models\User;
use Illuminate\Http\Request;
use App\Events\QueueUpdated;

class DriverController extends Controller
{
    /**
     * View driver compliance document (MTOP or License) safely.
     */
    public function viewDocument(Driver $driver, $type)
    {
        $path = ($type === 'mtop') ? $driver->mtop_certificate_url : $driver->drivers_license_url;

        if (!$path) {
            abort(404, 'Document path not specified.');
        }

        // Search primary storage paths
        $fullPath = storage_path('app/public/' . $path);

        if (!file_exists($fullPath)) {
            $fullPath = storage_path('app/' . $path);
        }

        if (!file_exists($fullPath)) {
            $fullPath = public_path('storage/' . $path);
        }

        if (!file_exists($fullPath)) {
            abort(404, 'Document file does not exist on server.');
        }

        $mimeType = mime_content_type($fullPath) ?: 'application/octet-stream';

        return response()->file($fullPath, [
            'Content-Type' => $mimeType,
            'Content-Disposition' => 'inline; filename="' . basename($fullPath) . '"',
        ]);
    }

    /**
     * Admin View: Display a listing of driver applications.
     */
    public function index()
    {
        $drivers = Driver::with('user')->get();

        $reports = \App\Models\Report::with(['reporter', 'driver.driverProfile', 'ride'])->latest()->get();
        $reportStats = [
            'total' => \App\Models\Report::count(),
            'pending' => \App\Models\Report::where('status', 'pending')->count(),
            'resolved' => \App\Models\Report::where('status', 'resolved')->count(),
            'dismissed' => \App\Models\Report::where('status', 'dismissed')->count(),
        ];

        return view('drivers.index', compact('drivers', 'reports', 'reportStats'));
    }

    /**
     * Driver Action: Store a newly created application in storage.
     */
    public function store(Request $request)
    {
        $request->validate([
            'full_name' => 'required|string|max:255',
            'mtop_number' => 'required|string|max:6',
            'mtop_certificate' => 'required|file|mimes:jpg,jpeg,png,webp,heic,heif,pdf,doc,docx|max:20480', 
            'drivers_license' => 'required|file|mimes:jpg,jpeg,png,webp,heic,heif,pdf,doc,docx|max:20480',  
        ], [
            'mtop_certificate.max' => 'The MTOP certificate file size must not exceed 20MB.',
            'mtop_certificate.mimes' => 'The MTOP certificate must be a JPG, JPEG, PNG, WEBP, HEIC, PDF, DOC, or DOCX file.',
            'drivers_license.max' => 'The Driver\'s License file size must not exceed 20MB.',
            'drivers_license.mimes' => 'The Driver\'s License must be a JPG, JPEG, PNG, WEBP, HEIC, PDF, DOC, or DOCX file.',
        ]);

        // Handle File Uploads
        $mtopPath = $request->file('mtop_certificate')->store('documents', 'public');
        $licensePath = $request->file('drivers_license')->store('drivers_license', 'public');

        // Create the record
        Driver::create([
            'user_id' => auth()->id(),
            'full_name' => $request->full_name,
            'mtop_number' => $request->mtop_number,
            'mtop_certificate_url' => $mtopPath,
            'drivers_license_url' => $licensePath,
            'compliance_status' => 'Pending',
        ]);

        return redirect()->route('dashboard')->with('status', 'Application submitted successfully!');
    }

    /**
     * Admin Action: Approve or Reject a driver.
     */
    public function update(Request $request, Driver $driver)
    {
        if ($request->status === 'Rejected') {
            $driver->update([
                'compliance_status' => 'Rejected',
                'suspension_reason' => $request->input('reason', 'Application rejected during document verification by TODA Admin.'),
            ]);

            return back()->with('status', 'Driver application rejected.');
        }

        // Otherwise, just update to 'Approved' or 'Pending'
        $driver->update([
            'compliance_status' => $request->status
        ]);

        return back()->with('status', 'Driver status updated!');
    }

    /**
     * Admin Action: Remove / Delete a driver permanently.
     */
    public function destroy(Driver $driver, \App\Services\QueueService $queueService)
    {
        if ($driver->is_online) {
            $queueService->removeAndShift($driver);
        }

        if ($driver->user) {
            $driver->user->update(['role' => 'user']);
        }

        $driver->delete();

        if (request()->wantsJson() || request()->header('X-SPA-Request')) {
            return response()->json(['status' => 'success', 'message' => "Driver {$driver->full_name} has been removed from the fleet."]);
        }

        return back()->with('status', "Driver {$driver->full_name} has been removed from the fleet.");
    }

    public function toggleStatus(\Illuminate\Http\Request $request)
    {
        $driver = \App\Models\Driver::where('user_id', auth()->id())->first();

        // Check if driver is suspended
        if ($driver && $driver->compliance_status === 'Suspended') {
            $msg = 'ACCOUNT SUSPENDED: ' . ($driver->suspension_reason ?? 'Please contact TODA Admin for details.');
            if ($request->wantsJson() || $request->header('X-SPA-Request')) {
                return response()->json(['is_online' => false, 'error' => $msg, 'message' => $msg], 403);
            }
            return back()->with('error', $msg);
        }

        // Admin Bypass: Auto-create Driver record if admin user doesn't have one
        if (auth()->user() && auth()->user()->role === 'admin') {
            if (!$driver) {
                $driver = \App\Models\Driver::create([
                    'user_id' => auth()->id(),
                    'full_name' => auth()->user()->name,
                    'mtop_number' => '128491',
                    'compliance_status' => 'Approved',
                    'is_online' => false,
                ]);
            }
        } else {
            if (!$driver || $driver->compliance_status !== 'Approved') {
                $msg = 'You must be an approved driver to enter the queue.';
                if ($request->wantsJson() || $request->header('X-SPA-Request')) {
                    return response()->json(['is_online' => false, 'error' => $msg, 'message' => $msg], 403);
                }
                return back()->with('error', $msg);
            }
        }

        // Toggle the true/false value
        $isOnline = !$driver->is_online;

        if ($isOnline) {
            // Geofence check: Must be within configured TODA Terminal geofence
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
                    $msg = "Outside {$terminalRadius}m TODA Terminal geofence! You are " . round($distanceMeters) . "m away.";
                    if ($request->wantsJson() || $request->header('X-SPA-Request')) {
                        return response()->json(['is_online' => false, 'error' => $msg, 'message' => $msg], 422);
                    }
                    return back()->with('error', $msg);
                }
            }

            // Find the last person in line and put this driver behind them
            $lastPos = \App\Models\Driver::where('is_online', true)->max('queue_position') ?? 0;
            $driver->update([
                'is_online' => true,
                'queue_position' => $lastPos + 1,
                'queue_joined_at' => now(),
            ]);
            $message = "On Duty! Position: " . ($lastPos + 1);
        } else {
            $oldPos = $driver->queue_position;
            $driver->update(['is_online' => false, 'queue_position' => null, 'queue_joined_at' => null]);
            
            // Shift everyone else up so there are no gaps in the queue
            if ($oldPos) {
                \App\Models\Driver::where('is_online', true)
                    ->where('queue_position', '>', $oldPos)
                    ->decrement('queue_position');
            }
                
            $message = "Off Duty.";
        }

        try {
            broadcast(new QueueUpdated());
        } catch (\Throwable $e) {}

        if ($request->wantsJson() || $request->header('X-SPA-Request') || $request->ajax()) {
            return response()->json([
                'is_online' => $isOnline, 
                'queue_position' => $driver->queue_position,
                'total_queue_count' => \App\Models\Driver::where('is_online', true)->count(),
                'message' => $message
            ]);
        }

        return back()->with('status', $message);
    }

    /**
     * Auto Off Duty Action: Automatically take driver off duty if they move outside the 35m TODA Terminal radius without an active ride.
     */
    public function autoOffDuty(Request $request, \App\Services\QueueService $queueService)
    {
        $driver = Driver::where('user_id', auth()->id())->first();

        if (!$driver || !$driver->is_online) {
            return response()->json(['status' => 'already_offline']);
        }

        // Verify driver has NO active ride in progress
        $hasActiveRide = \App\Models\Ride::where('driver_id', auth()->id())
            ->whereIn('status', ['accepted', 'arrived', 'in_transit', 'returning'])
            ->exists();

        if ($hasActiveRide) {
            return response()->json(['status' => 'on_trip_exempt']);
        }

        // Force driver OFF DUTY & remove from queue
        $oldPos = $driver->queue_position;
        $driver->update([
            'is_online' => false,
            'queue_position' => null,
            'queue_joined_at' => null,
        ]);

        if ($oldPos) {
            Driver::where('is_online', true)
                ->where('queue_position', '>', $oldPos)
                ->decrement('queue_position');
        }

        $queueService->normalizeQueue();

        try {
            broadcast(new QueueUpdated());
        } catch (\Throwable $e) {}

        return response()->json([
            'status' => 'auto_off_duty',
            'is_online' => false,
            'message' => '📍 Auto Off Duty: You left the 35m TODA Terminal radius.'
        ]);
    }

    /**
     * Admin Action: Suspend a driver with a specified reason.
     */
    public function suspend(Request $request, Driver $driver, \App\Services\QueueService $queueService)
    {
        $request->validate([
            'suspension_reason' => 'required|string|max:1000',
        ]);

        if ($driver->is_online) {
            $queueService->removeAndShift($driver);
        }

        $driver->update([
            'compliance_status' => 'Suspended',
            'suspension_reason' => $request->suspension_reason,
            'is_online' => false,
            'queue_position' => null,
            'queue_joined_at' => null,
        ]);

        if ($request->wantsJson() || $request->header('X-SPA-Request')) {
            return response()->json(['status' => 'success', 'message' => "Driver {$driver->full_name} has been suspended."]);
        }

        return back()->with('status', "Driver {$driver->full_name} has been suspended.");
    }

    /**
     * Admin Action: Unsuspend / Reactivate a driver.
     */
    public function unsuspend(Driver $driver)
    {
        $driver->update([
            'compliance_status' => 'Approved',
            'suspension_reason' => null,
            'appeal_message' => null,
            'appeal_status' => null,
        ]);

        // Send targeted notification to Driver
        try {
            \App\Models\Announcement::create([
                'title' => "Account Reinstated / Unsuspended",
                'message' => "Your TODA Driver account has been unsuspended and reinstated by Admin. You may now go back on duty.",
                'target_audience' => 'user_' . $driver->user_id,
            ]);
        } catch (\Throwable $e) {}

        if (request()->wantsJson() || request()->header('X-SPA-Request')) {
            return response()->json(['status' => 'success', 'message' => "Driver {$driver->full_name} has been unsuspended and reactivated."]);
        }

        return back()->with('status', "Driver {$driver->full_name} has been unsuspended and reactivated.");
    }

    /**
     * Driver Action: Submit an appeal for account suspension.
     */
    public function submitAppeal(Request $request)
    {
        $request->validate([
            'appeal_message' => 'required|string|min:2|max:2000',
            'appeal_attachments.*' => 'nullable|file|mimes:jpeg,jpg,png,gif,webp,pdf,doc,docx|max:10240',
        ]);

        $user = auth()->user();
        if (!$user) {
            $token = $request->bearerToken();
            if ($token) {
                $userId = \Illuminate\Support\Facades\Cache::get('api_token_' . $token);
                if ($userId) {
                    $user = \App\Models\User::find($userId);
                }
                if (!$user) {
                    $user = \App\Models\User::where('remember_token', $token)->first();
                }
            }
        }

        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $driver = Driver::where('user_id', $user->id)->first() ?? Driver::where('id', $user->id)->first();
        if (!$driver) {
            return response()->json(['status' => 'error', 'message' => 'Driver profile not found.'], 404);
        }

        if ($driver->compliance_status !== 'Suspended' && $driver->compliance_status !== 'Rejected') {
            return response()->json([
                'status' => 'error',
                'message' => 'Your account is not currently suspended or rejected.',
            ], 400);
        }

        $attachments = [];
        if ($request->hasFile('appeal_attachments')) {
            foreach ($request->file('appeal_attachments') as $file) {
                if ($file && $file->isValid()) {
                    $path = $file->store('appeals', 'public');
                    $filename = basename($path);
                    $attachments[] = [
                        'name' => $file->getClientOriginalName(),
                        'url' => asset('storage/appeals/' . $filename),
                        'extension' => strtolower($file->getClientOriginalExtension()),
                    ];
                }
            }
        }

        $driver->update([
            'appeal_message' => $request->appeal_message,
            'appeal_status' => 'Pending',
            'appealed_at' => now(),
            'appeal_attachments' => count($attachments) > 0 ? $attachments : $driver->appeal_attachments,
        ]);

        // Notify Admin of new appeal with realtime broadcast
        try {
            broadcast(new \App\Events\DriverApplicantUpdated($driver->id, 'Pending'));
            broadcast(new \App\Events\QueueUpdated());
            $announcement = \App\Models\Announcement::create([
                'title' => "🚨 New Driver Appeal: {$driver->full_name}",
                'message' => "Driver {$driver->full_name} (MTOP #{$driver->mtop_number}) submitted an appeal: \"{$request->appeal_message}\"",
                'target_audience' => 'ADMIN',
            ]);
            broadcast(new \App\Events\AnnouncementCreated($announcement));
        } catch (\Throwable $e) {}

        return response()->json([
            'status' => 'success',
            'message' => 'Your appeal has been submitted to TODA Admin for review.',
            'appeal_message' => $driver->appeal_message,
            'appeal_status' => 'Pending',
            'appeal_attachments' => $driver->appeal_attachments,
        ]);

        return back()->with('status', 'Your appeal has been submitted to TODA Admin for review.');
    }

    /**


    /**
     * Display the real-time active queue for drivers.
     */
    public function liveQueue()
    {
        // Get all online drivers, sorted by their queue position
        $activeQueue = Driver::where('is_online', true)
                             ->whereNotNull('queue_position')
                             ->orderBy('queue_position', 'asc')
                             ->get();

        // Get all active rides currently in transit / on trip
        $driversInTransit = \App\Models\Ride::with(['driver', 'passenger', 'driverProfile'])
            ->whereIn('status', ['accepted', 'arrived', 'in_transit'])
            ->latest('updated_at')
            ->get();

        return view('drivers.live-queue', compact('activeQueue', 'driversInTransit'));
    }

    /**
     * Polling Endpoint: Returns only the HTML for the queue list.
     */
    public function fetchQueueList()
    {
        $activeQueue = Driver::where('is_online', true)
                             ->whereNotNull('queue_position')
                             ->orderBy('queue_position', 'asc')
                             ->get();

        $driversInTransit = \App\Models\Ride::with(['driver', 'passenger', 'driverProfile'])
            ->whereIn('status', ['accepted', 'arrived', 'in_transit'])
            ->latest('updated_at')
            ->get();

        return view('drivers.partials.queue-list', compact('activeQueue', 'driversInTransit'));
    }

    /**
     * Polling Endpoint: Returns only the HTML for the Admin Driver Table.
     */
    public function fetchAdminDriverList()
    {
        $drivers = Driver::with('user')->get();
        return view('drivers.partials.driver-table', compact('drivers'));
    }

    /**
     * Polling Endpoint: Returns fresh HTML for the reports table + suspended
     * drivers panel + tab stats, allowing the admin Reports tab to update
     * seamlessly in place without a full page reload.
     */
    public function fetchReportsHtml()
    {
        $drivers = Driver::with('user')->get();
        $reports = \App\Models\Report::with(['reporter', 'driver.driverProfile', 'ride'])->latest()->get();

        $reportStats = [
            'total' => \App\Models\Report::count(),
            'pending' => \App\Models\Report::where('status', 'pending')->count(),
            'resolved' => \App\Models\Report::where('status', 'resolved')->count(),
            'dismissed' => \App\Models\Report::where('status', 'dismissed')->count(),
        ];

        if (request()->headers->get('Accept') === 'application/json' || request()->query('json') === '1') {
            return response()->json([
                'reports' => (string) view('admin.partials.reports-table', compact('drivers', 'reports')),
                'suspended' => (string) view('admin.partials.suspended-drivers', compact('drivers')),
                'stats' => $reportStats,
            ]);
        }

        return view('admin.partials.reports-table', compact('drivers', 'reports'));
    }

    /**
     * Polling Endpoint: Checks the current compliance status of the logged-in driver.
     */
    public function checkStatus(Request $request, \App\Services\QueueService $queueService)
    {
        try {
            $userId = auth()->id();
            if (!$userId) {
                return response()->json([
                    'status' => null,
                    'reason' => null
                ]);
            }

            $driver = Driver::where('user_id', $userId)->first();
            
            $autoOffDuty = false;
            $msg = null;

            if ($driver && $driver->is_online) {
                $lat = $request->query('lat');
                $lng = $request->query('lng');
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
                        $hasActiveRide = \App\Models\Ride::where('driver_id', $userId)
                            ->whereIn('status', ['bargaining', 'fare_proposed', 'fare_accepted', 'accepted', 'en_route', 'arrived', 'in_transit', 'returning'])
                            ->exists();

                        if (!$hasActiveRide) {
                            $outsideSince = $driver->outside_geofence_at ?? \Illuminate\Support\Facades\Cache::get("driver_outside_since_{$driver->id}");
                            if (!$outsideSince) {
                                $outsideSince = now();
                                try {
                                    if (\Illuminate\Support\Facades\Schema::hasColumn('drivers', 'outside_geofence_at')) {
                                        $driver->update(['outside_geofence_at' => $outsideSince]);
                                    }
                                } catch (\Throwable $e) {}
                                \Illuminate\Support\Facades\Cache::put("driver_outside_since_{$driver->id}", $outsideSince, 7200);
                            } else {
                                if (is_string($outsideSince)) {
                                    $outsideSince = \Carbon\Carbon::parse($outsideSince);
                                }
                            }

                            $outsideMinutes = (int) now()->diffInMinutes($outsideSince);

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
                                \Illuminate\Support\Facades\Cache::forget("driver_outside_since_{$driver->id}");

                                $driver->update($updateData);

                                if ($oldPos) {
                                    \App\Models\Driver::where('is_online', true)
                                        ->where('queue_position', '>', $oldPos)
                                        ->decrement('queue_position');
                                }
                                $queueService->normalizeQueue();
                                try { broadcast(new \App\Events\QueueUpdated()); } catch (\Throwable $e) {}

                                $autoOffDuty = true;
                                $msg = "📍 Auto Off Duty: You have been outside the {$terminalRadius}m TODA Terminal radius for 30 minutes.";
                            }
                        }
                    } else {
                        if ($driver->outside_geofence_at || \Illuminate\Support\Facades\Cache::has("driver_outside_since_{$driver->id}")) {
                            try {
                                if (\Illuminate\Support\Facades\Schema::hasColumn('drivers', 'outside_geofence_at')) {
                                    $driver->update(['outside_geofence_at' => null]);
                                }
                            } catch (\Throwable $e) {}
                            \Illuminate\Support\Facades\Cache::forget("driver_outside_since_{$driver->id}");
                        }
                    }
                }
            }

            return response()->json([
                'status' => $driver ? $driver->compliance_status : null,
                'reason' => $driver ? $driver->suspension_reason : null,
                'is_online' => $driver ? $driver->is_online : false,
                'auto_off_duty' => $autoOffDuty,
                'message' => $msg
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'status' => null,
                'reason' => null
            ]);
        }
    }

    /**
     * Polling Endpoint: Returns the current incoming ride + queue state for the
     * logged-in driver so the hub can react in real time without a page refresh.
     */
    public function incomingRide()
    {
        $user = auth()->user();
        $driver = $user ? \App\Models\Driver::where('user_id', $user->id)->first() : null;

        if (!$driver) {
            return response()->json([
                'has_incoming' => false,
                'ride' => null,
                'is_first_in_line' => false,
                'queue_position' => null,
                'total_queue_count' => 0,
            ]);
        }

        $activeTrip = \App\Models\Ride::where('driver_id', $user->id)
            ->whereIn('status', ['accepted', 'arrived', 'in_transit', 'returning'])
            ->first();

        $hasActiveTrip = (bool) $activeTrip;

        $incomingRide = null;
        if ($driver->is_online && $driver->queue_position === 1 && !$hasActiveTrip) {
            $incomingRide = \App\Models\Ride::where(function ($query) use ($user) {
                $query->where('status', 'searching')
                      ->orWhere(function ($q) use ($user) {
                          $q->where('status', 'fare_proposed')->where('driver_id', $user->id);
                      });
            })->orderBy('created_at', 'asc')->first();
        }

        // Report what happened to the ride this driver was previously shown, so
        // the hub can tell apart cancelled / accepted-by-this-driver / taken
        // instead of always assuming the passenger cancelled.
        $lastRideStatus = null;
        $lastRideDriverId = null;
        $lastRideId = (int) request()->query('last_ride_id', 0);
        if ($lastRideId) {
            $lastRide = \App\Models\Ride::find($lastRideId);
            if ($lastRide) {
                $lastRideStatus = $lastRide->status;
                $lastRideDriverId = $lastRide->driver_id;
            }
        }

        return response()->json([
            'has_incoming' => $incomingRide ? true : false,
            'ride' => $incomingRide ? [
                'id' => $incomingRide->id,
                'status' => $incomingRide->status,
                'fare' => $incomingRide->fare,
                'pickup_location' => $incomingRide->pickup_location,
                'destination' => $incomingRide->destination,
                'pickup_lat' => (float) ($incomingRide->pickup_lat ?? 15.4265),
                'pickup_lng' => (float) ($incomingRide->pickup_lng ?? 120.9405),
                'destination_lat' => $incomingRide->destination_lat !== null ? (float) $incomingRide->destination_lat : null,
                'destination_lng' => $incomingRide->destination_lng !== null ? (float) $incomingRide->destination_lng : null,
                'driver_id' => $incomingRide->driver_id,
                'passenger_id' => $incomingRide->passenger_id,
            ] : null,
            'active_trip' => $activeTrip ? [
                'id' => $activeTrip->id,
                'status' => $activeTrip->status,
                'fare' => $activeTrip->fare,
            ] : null,
            'last_ride_status' => $lastRideStatus,
            'last_ride_driver_id' => $lastRideDriverId,
            'is_first_in_line' => $driver->queue_position === 1,
            'queue_position' => $driver->queue_position,
            'total_queue_count' => \App\Models\Driver::where('is_online', true)->count(),
        ]);
    }

    /**
     * Admin Action: Drag-and-Drop Override for Queue Order.
     */
    public function reorderQueue(Request $request, \App\Services\QueueService $queueService)
    {
        if (auth()->user()->role !== 'admin') {
            return response()->json(['error' => 'Unauthorized action.'], 403);
        }

        $driverIds = $request->input('driver_ids', []);

        if (is_array($driverIds) && !empty($driverIds)) {
            foreach ($driverIds as $index => $driverId) {
                Driver::where('id', $driverId)->update([
                    'queue_position' => $index + 1
                ]);
            }

            $queueService->normalizeQueue();
            try {
                broadcast(new QueueUpdated());
            } catch (\Throwable $e) {}
        }

        return response()->json(['status' => 'success', 'message' => 'Terminal queue reordered!']);
    }
}