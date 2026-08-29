<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\Driver;

class DashboardController extends Controller
{
    public function index()
{
    $user = Auth::user();
    $role = $user->role;

    // 1. Legacy 'user' role — treat as passenger, update role silently
    if ($role === 'user') {
        $user->update(['role' => 'passenger']);
        $savedLocations = \App\Models\SavedLocation::where('user_id', $user->id)
            ->orderByRaw("CASE WHEN type = 'school' THEN 1 WHEN type = 'work' THEN 2 WHEN type = 'shopping' THEN 3 WHEN type = 'favorite' THEN 4 ELSE 5 END")
            ->latest()
            ->get();
        return view('passenger.dashboard', compact('savedLocations'));
    }

    // 2. Passengers — direct to passenger dashboard
    if ($role === 'passenger') {
        $savedLocations = \App\Models\SavedLocation::where('user_id', $user->id)
            ->orderByRaw("CASE WHEN type = 'school' THEN 1 WHEN type = 'work' THEN 2 WHEN type = 'shopping' THEN 3 WHEN type = 'favorite' THEN 4 ELSE 5 END")
            ->latest()
            ->get();
        return view('passenger.dashboard', compact('savedLocations'));
    }

    // 3. ADMIN: Instant Access (Skips paperwork)
    if ($role === 'admin') {
        $driver = Driver::where('user_id', $user->id)->first();
        if (!$driver) {
            Driver::create([
                'user_id' => $user->id,
                'full_name' => $user->name,
                'mtop_number' => 'ADMIN',
                'compliance_status' => 'Approved',
                'is_online' => false,
            ]);
        }
        return view('drivers.main');
    }

    // 4. DRIVER: Must be verified or Suspended
    if ($role === 'driver') {
        $driver = \App\Models\Driver::where('user_id', $user->id)->first();

        // IF APPROVED: Show the main Hub or active ride
        if ($driver && $driver->compliance_status === 'Approved') {
            $activeAcceptedTrip = \App\Models\Ride::where('driver_id', $user->id)
                ->whereIn('status', ['accepted', 'arrived', 'in_transit', 'returning'])
                ->latest()
                ->first();

            return view('drivers.main', compact('activeAcceptedTrip'));
        }

        // IF PENDING, REJECTED, OR SUSPENDED: Show status & appeal screen
        return view('drivers.dashboard', compact('driver'));
    }

    // Fallback
    return view('dashboard');
}
} // <-- This is the bracket PHP was looking for!