<?php

namespace App\Http\Controllers;

use App\Models\PushSubscription;
use App\Models\User;
use App\Services\PushService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class PushController extends Controller
{
    private function resolveUser(Request $request): ?User
    {
        if (auth()->check()) {
            return auth()->user();
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
     * Store (or refresh) the browser's web-push subscription for the current user.
     */
    public function subscribe(Request $request)
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $request->validate([
            'endpoint'   => 'required|string|max:500',
            'public_key' => 'nullable|string|max:255',
            'auth_token' => 'nullable|string|max:255',
        ]);

        $subscription = PushSubscription::firstOrNew(['endpoint' => $request->endpoint]);
        $subscription->user_id = $user->id;
        $subscription->endpoint = $request->endpoint;
        $subscription->public_key = $request->public_key;
        $subscription->auth_token = $request->auth_token;
        $subscription->user_agent = $request->header('User-Agent');
        $subscription->save();

        return response()->json(['status' => 'success']);
    }

    /**
     * Remove a web-push subscription (used on logout / opt-out).
     */
    public function unsubscribe(Request $request)
    {
        $user = $this->resolveUser($request);
        $userId = $user ? $user->id : auth()->id();

        $request->validate([
            'endpoint' => 'required|string|max:500',
        ]);

        if ($userId) {
            PushSubscription::where('user_id', $userId)
                ->where('endpoint', $request->endpoint)
                ->delete();
        }

        return response()->json(['status' => 'success']);
    }

    /**
     * Send a test push to the current user's devices (verification endpoint).
     */
    public function test(Request $request)
    {
        $user = $this->resolveUser($request);
        $userId = $user ? $user->id : auth()->id();
        if (!$userId) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $subsCount = PushSubscription::where('user_id', $userId)->count();

        app(PushService::class)->sendToUser(
            $userId,
            'SRH LINK-TODA 🔔',
            'Push notifications work! You will be notified even with the app closed.',
            url('/'),
            'test-push-' . time(),
            [
                'type' => 'incoming_ride',
                'requireInteraction' => true,
                'renotify' => true,
            ]
        );

        $msg = $subsCount > 0 
            ? 'Test push sent! (' . $subsCount . ' registered device' . ($subsCount > 1 ? 's' : '') . ')'
            : 'Test push triggered!';

        return response()->json(['status' => 'success', 'message' => $msg]);
    }
}