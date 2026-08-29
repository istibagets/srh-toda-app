<?php

namespace App\Http\Controllers;

use App\Models\SavedLocation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;

class SavedLocationController extends Controller
{
    /**
     * Display the passenger's saved locations management page.
     */
    public function index(): View
    {
        $user = Auth::user();
        $savedLocations = SavedLocation::where('user_id', $user->id)
            ->orderByRaw("CASE 
                WHEN type = 'school' THEN 1 
                WHEN type = 'work' THEN 2 
                WHEN type = 'shopping' THEN 3 
                WHEN type = 'favorite' THEN 4 
                ELSE 5 END")
            ->latest()
            ->get();

        return view('passenger.saved-locations', compact('savedLocations'));
    }

    /**
     * Store a newly created saved location.
     */
    public function store(Request $request): JsonResponse|RedirectResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'address' => 'required|string|max:255',
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
            'type' => 'nullable|string|in:school,work,shopping,favorite,custom,home',
            'is_default_pickup' => 'nullable|boolean',
            'is_default_dropoff' => 'nullable|boolean',
        ]);

        $userId = Auth::id();
        $type = $validated['type'] ?? 'custom';

        // If setting as school/work, replace existing ones with the same type if user already has one
        if (in_array($type, ['school', 'work'])) {
            $existing = SavedLocation::where('user_id', $userId)->where('type', $type)->first();
            if ($existing) {
                $existing->update([
                    'name' => $validated['name'],
                    'address' => $validated['address'],
                    'latitude' => $validated['latitude'],
                    'longitude' => $validated['longitude'],
                ]);

                if ($request->wantsJson() || $request->ajax()) {
                    return response()->json([
                        'success' => true,
                        'message' => ucfirst($type) . ' location updated successfully!',
                        'location' => $existing,
                    ]);
                }

                return redirect()->route('saved-locations.index')->with('success', ucfirst($type) . ' location updated successfully!');
            }
        }

        $location = SavedLocation::create([
            'user_id' => $userId,
            'name' => $validated['name'],
            'address' => $validated['address'],
            'latitude' => $validated['latitude'],
            'longitude' => $validated['longitude'],
            'type' => $type,
            'is_default_pickup' => $request->boolean('is_default_pickup'),
            'is_default_dropoff' => $request->boolean('is_default_dropoff'),
        ]);

        if ($request->wantsJson() || $request->ajax()) {
            return response()->json([
                'success' => true,
                'message' => 'Location saved to your places!',
                'location' => $location,
            ]);
        }

        return redirect()->route('saved-locations.index')->with('success', 'Location saved successfully!');
    }

    /**
     * Update an existing saved location.
     */
    public function update(Request $request, SavedLocation $savedLocation): JsonResponse|RedirectResponse
    {
        abort_unless($savedLocation->user_id === Auth::id(), 403, 'Unauthorized.');

        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'address' => 'required|string|max:255',
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
            'type' => 'nullable|string|in:home,work,school,shopping,favorite,custom',
            'is_default_pickup' => 'nullable|boolean',
            'is_default_dropoff' => 'nullable|boolean',
        ]);

        $savedLocation->update([
            'name' => $validated['name'],
            'address' => $validated['address'],
            'latitude' => $validated['latitude'],
            'longitude' => $validated['longitude'],
            'type' => $validated['type'] ?? $savedLocation->type,
            'is_default_pickup' => $request->boolean('is_default_pickup'),
            'is_default_dropoff' => $request->boolean('is_default_dropoff'),
        ]);

        if ($request->wantsJson() || $request->ajax()) {
            return response()->json([
                'success' => true,
                'message' => 'Saved place updated successfully!',
                'location' => $savedLocation,
            ]);
        }

        return redirect()->route('saved-locations.index')->with('success', 'Saved place updated!');
    }

    /**
     * Delete a saved location.
     */
    public function destroy(Request $request, SavedLocation $savedLocation): JsonResponse|RedirectResponse
    {
        abort_unless($savedLocation->user_id === Auth::id(), 403, 'Unauthorized.');

        $savedLocation->delete();

        if ($request->wantsJson() || $request->ajax()) {
            return response()->json([
                'success' => true,
                'message' => 'Saved location removed.',
            ]);
        }

        return redirect()->route('saved-locations.index')->with('success', 'Location deleted.');
    }

    /**
     * Return JSON list of user's saved locations.
     */
    public function apiList(): JsonResponse
    {
        $locations = SavedLocation::where('user_id', Auth::id())
            ->orderByRaw("CASE 
                WHEN type = 'home' THEN 1 
                WHEN type = 'work' THEN 2 
                WHEN type = 'school' THEN 3 
                WHEN type = 'favorite' THEN 4 
                ELSE 5 END")
            ->latest()
            ->get();

        return response()->json([
            'locations' => $locations,
        ]);
    }

    /**
     * Quick save a location directly from the map or destination bar with 1 tap.
     */
    public function quickSave(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'address' => 'required|string|max:255',
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
            'type' => 'nullable|string|in:home,work,school,shopping,favorite,custom',
        ]);

        $location = SavedLocation::create([
            'user_id' => Auth::id(),
            'name' => $validated['name'],
            'address' => $validated['address'],
            'latitude' => $validated['latitude'],
            'longitude' => $validated['longitude'],
            'type' => $validated['type'] ?? 'favorite',
        ]);

        return response()->json([
            'success' => true,
            'message' => '⭐ ' . $location->name . ' added to your Saved Places!',
            'location' => $location,
        ]);
    }
}
