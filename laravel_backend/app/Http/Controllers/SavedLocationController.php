<?php

namespace App\Http\Controllers;

use App\Models\SavedLocation;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\View\View;

class SavedLocationController extends Controller
{
    /**
     * Resolve authenticated user from Bearer token or web session.
     */
    private function resolveUser(Request $request): ?User
    {
        if (Auth::check()) {
            return Auth::user();
        }

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
     * Display the passenger's saved locations management page.
     */
    public function index(Request $request): View|JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $savedLocations = SavedLocation::where('user_id', $user->id)
            ->orderByRaw("CASE 
                WHEN type = 'home' THEN 1 
                WHEN type = 'school' THEN 2 
                WHEN type = 'work' THEN 3 
                WHEN type = 'shopping' THEN 4 
                WHEN type = 'favorite' THEN 5 
                ELSE 6 END")
            ->latest()
            ->get();

        if ($request->wantsJson()) {
            return response()->json(['status' => 'success', 'locations' => $savedLocations]);
        }

        return view('passenger.saved-locations', compact('savedLocations'));
    }

    /**
     * Store a newly created saved location.
     */
    public function store(Request $request): JsonResponse|RedirectResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'address' => 'required|string|max:255',
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
            'type' => 'nullable|string|in:school,work,shopping,favorite,custom,home',
            'is_default_pickup' => 'nullable|boolean',
            'is_default_dropoff' => 'nullable|boolean',
        ]);

        $userId = $user->id;
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
        $user = $this->resolveUser($request);
        if (!$user || $savedLocation->user_id !== $user->id) {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized.'], 403);
        }

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
        $user = $this->resolveUser($request);
        if (!$user || $savedLocation->user_id !== $user->id) {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized.'], 403);
        }

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
    public function apiList(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $locations = SavedLocation::where('user_id', $user->id)
            ->orderByRaw("CASE 
                WHEN type = 'home' THEN 1 
                WHEN type = 'work' THEN 2 
                WHEN type = 'school' THEN 3 
                WHEN type = 'shopping' THEN 4
                WHEN type = 'favorite' THEN 5 
                ELSE 6 END")
            ->latest()
            ->get();

        return response()->json([
            'status' => 'success',
            'locations' => $locations,
        ]);
    }

    /**
     * Quick save a location directly from the map or destination bar with 1 tap.
     */
    public function quickSave(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'address' => 'required|string|max:255',
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
            'type' => 'nullable|string|in:home,work,school,shopping,favorite,custom',
        ]);

        $location = SavedLocation::create([
            'user_id' => $user->id,
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
