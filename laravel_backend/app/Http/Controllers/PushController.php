<?php

namespace App\Http\Controllers;

use App\Models\PushSubscription;
use App\Services\PushService;
use Illuminate\Http\Request;

class PushController extends Controller
{
    /**
     * Store (or refresh) the browser's web-push subscription for the current user.
     */
    public function subscribe(Request $request)
    {
        $request->validate([
            'endpoint' => 'required|string|max:500',
            'public_key' => 'nullable|string|max:255',
            'auth_token' => 'nullable|string|max:255',
        ]);

        $subscription = PushSubscription::firstOrNew(['endpoint' => $request->endpoint]);

        $subscription->user_id = auth()->id();
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
        $request->validate([
            'endpoint' => 'required|string|max:500',
        ]);

        PushSubscription::where('user_id', auth()->id())
            ->where('endpoint', $request->endpoint)
            ->delete();

        return response()->json(['status' => 'success']);
    }

    /**
     * Send a test push to the current user's devices (verification endpoint).
     */
    public function test(Request $request)
    {
        $userId = auth()->id();
        $subsCount = PushSubscription::where('user_id', $userId)->count();

        app(PushService::class)->sendToUser(
            $userId,
            'SRH LINK-TODA 🔔',
            'Push notifications work! You will be notified even with the app closed.',
            route('dashboard'),
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