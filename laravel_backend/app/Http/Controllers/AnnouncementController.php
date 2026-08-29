<?php

namespace App\Http\Controllers;

use App\Models\Announcement;
use App\Models\AnnouncementRead;
use Illuminate\Http\Request;

class AnnouncementController extends Controller
{
    /**
     * Admin action: Create & Broadcast Announcement.
     */
    public function store(Request $request)
    {
        if (auth()->user()->role !== 'admin') {
            if ($request->wantsJson() || $request->ajax()) {
                return response()->json(['error' => 'Unauthorized action.'], 403);
            }
            return back()->withErrors(['error' => 'Unauthorized action.']);
        }

        $request->validate([
            'title' => 'required|string|max:255',
            'message' => 'required|string',
            'target_audience' => 'required|in:all,drivers,passengers',
        ]);

        $announcement = Announcement::create([
            'created_by' => auth()->id(),
            'title' => $request->title,
            'message' => $request->message,
            'target_audience' => $request->target_audience,
        ]);

        // Web-push the announcement to the chosen audience (fires even with the app closed)
        try {
            $push = app(\App\Services\PushService::class);
            $tag = 'announcement-' . $announcement->id;

            // NOTE: title/body must match what the in-app poller shows
            // (see navigation.blade.php) so the service-worker dedup can
            // suppress the duplicate banner while the app is open.
            if ($request->target_audience === 'drivers') {
                $driverUserIds = \App\Models\Driver::whereNotNull('user_id')->pluck('user_id')->all();
                $push->sendToUsers($driverUserIds, $request->title, $request->message, route('drivers.live-queue'), $tag);
            } elseif ($request->target_audience === 'passengers') {
                $passengerUserIds = \App\Models\User::whereIn('role', ['user', 'passenger'])->pluck('id')->all();
                $push->sendToUsers($passengerUserIds, $request->title, $request->message, route('dashboard'), $tag);
            } else {
                $push->sendToAll($request->title, $request->message, route('dashboard'), $tag);
            }
        } catch (\Throwable $e) {}

        if ($request->wantsJson() || $request->ajax()) {
            return response()->json([
                'status' => 'success',
                'message' => 'Announcement broadcasted successfully!',
                'redirect' => route('drivers.index')
            ]);
        }

        return back()->with('status', 'Announcement sent successfully!');
    }

    /**
     * Fetch notifications relevant to the logged-in user.
     */
    public function fetchNotifications(Request $request)
    {
        if (!$request->ajax() && !$request->wantsJson()) {
            return redirect()->route('dashboard');
        }

        try {
            $user = auth()->user();
            if (!$user) {
                return response()->json(['unread_count' => 0, 'announcements' => []]);
            }

            // Determine user audience filter
            $audiences = ['all', 'user_' . $user->id];
            if ($user->role === 'driver') {
                $audiences[] = 'drivers';
            } elseif ($user->role === 'admin') {
                $audiences = ['all', 'drivers', 'passengers', 'admin', 'user_' . $user->id];
            } else {
                $audiences[] = 'passengers';
            }

            // Only surface announcements broadcast AFTER this user signed up —
            // newly registered drivers/passengers must never see the past.
            $announcements = Announcement::whereIn('target_audience', $audiences)
                ->where('created_at', '>=', $user->created_at)
                ->latest()
                ->take(30)
                ->get();

            // STRICT DRIVER PRIVACY FILTER FOR RATINGS:
            // Remove any rating notification that does NOT belong strictly to this user
            $announcements = $announcements->reject(function ($item) use ($user) {
                $isRating = str_contains(strtolower($item->title), 'rating') || str_contains(strtolower($item->message), 'rated your trip');
                if ($isRating) {
                    if ($item->target_audience !== 'user_' . $user->id) {
                        return true; // Reject/Remove rating notification if it belongs to another driver
                    }
                }
                return false;
            });

            $readIds = AnnouncementRead::where('user_id', $user->id)
                ->pluck('announcement_id')
                ->toArray();

            $formatted = $announcements->map(function ($item) use ($readIds) {
                $audienceTag = strtoupper($item->target_audience);
                $actionUrl = null;
                $title = $item->title;
                $message = $item->message;

                if (str_contains(strtolower($title), 'rating') || str_contains(strtolower($message), 'rated your trip')) {
                    $audienceTag = 'RATING';
                    // Sanitize passenger name from rating notification messages to keep ratings anonymous
                    $message = preg_replace('/Passenger\s+.+?\s+rated/i', 'A passenger rated', $message);
                } elseif (str_contains(strtolower($title), 'appeal')) {
                    $audienceTag = 'APPEAL';
                    if (auth()->user()->role === 'admin') {
                        $actionUrl = route('drivers.index');
                    }
                } elseif (str_starts_with($item->target_audience, 'user_') || str_contains(strtolower($title), 'report') || $item->target_audience === 'admin') {
                    $audienceTag = 'REPORT';
                }

                // Check for report ID in title or message
                if (preg_match('/Report #(\d+)/i', $title . ' ' . $message, $matches)) {
                    $actionUrl = route('drivers.index') . '?tab=reports&report_id=' . $matches[1];
                } elseif ($audienceTag === 'REPORT' && auth()->user()->role === 'admin' && empty($actionUrl)) {
                    $actionUrl = route('drivers.index') . '?tab=reports';
                }

                return [
                    'id' => $item->id,
                    'title' => $title,
                    'message' => $message,
                    'target_audience' => $audienceTag,
                    'action_url' => $actionUrl,
                    'created_at' => $item->created_at ? $item->created_at->diffForHumans() : '',
                    'is_read' => in_array($item->id, $readIds),
                ];
            });

            $unreadCount = $formatted->where('is_read', false)->count();

            $hasPhoto = !empty($user->profile_photo_url);
            $avatarUrl = $hasPhoto ? route('user.avatar', [$user->id, 'v' => optional($user->updated_at)->timestamp]) : null;

            return response()->json([
                'unread_count' => $unreadCount,
                'announcements' => $formatted->values(),
                'user_profile' => [
                    'has_photo' => $hasPhoto,
                    'avatar_url' => $avatarUrl,
                    'updated_at' => optional($user->updated_at)->timestamp,
                ]
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'unread_count' => 0,
                'announcements' => [],
                'user_profile' => null
            ]);
        }
    }

    /**
     * Mark notifications as read for current user (single or all).
     */
    public function markAsRead(Request $request)
    {
        $user = auth()->user();
        if (!$user) return response()->json(['status' => 'error']);

        if ($request->filled('id')) {
            AnnouncementRead::firstOrCreate([
                'user_id' => $user->id,
                'announcement_id' => $request->id,
            ]);
            return response()->json(['status' => 'success']);
        }

        $audiences = ['all', 'user_' . $user->id];
        if ($user->role === 'driver') {
            $audiences[] = 'drivers';
        } elseif ($user->role === 'admin') {
            $audiences = ['all', 'drivers', 'passengers', 'admin', 'user_' . $user->id];
        } else {
            $audiences[] = 'passengers';
        }

        $announcements = Announcement::whereIn('target_audience', $audiences)
                ->where('created_at', '>=', $user->created_at)
                ->pluck('id');

        foreach ($announcements as $id) {
            AnnouncementRead::firstOrCreate([
                'user_id' => $user->id,
                'announcement_id' => $id,
            ]);
        }

        return response()->json(['status' => 'success']);
    }

    /**
     * Delete a single announcement (Admin only).
     */
    public function destroy(Announcement $announcement)
    {
        if (auth()->user()->role !== 'admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $announcement->delete();

        return response()->json(['status' => 'success']);
    }

    /**
     * Update a single announcement (Admin only).
     */
    public function update(Request $request, Announcement $announcement)
    {
        if (auth()->user()->role !== 'admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $request->validate([
            'title' => 'required|string|max:255',
            'message' => 'required|string',
        ]);

        $announcement->update([
            'title' => $request->title,
            'message' => $request->message,
        ]);

        return response()->json(['status' => 'success', 'message' => 'Announcement updated successfully!']);
    }

    /**
     * Clear all announcements (Admin deletes all, Users mark all read).
     */
    public function clearAll()
    {
        $user = auth()->user();
        if (!$user) return response()->json(['status' => 'error']);

        if ($user->role === 'admin') {
            Announcement::query()->delete();
        } else {
            $audiences = ['all', 'user_' . $user->id];
            if ($user->role === 'driver') {
                $audiences[] = 'drivers';
            } else {
                $audiences[] = 'passengers';
            }
$announcements = Announcement::whereIn('target_audience', $audiences)
            ->where('created_at', '>=', $user->created_at)
            ->pluck('id');
            foreach ($announcements as $id) {
                AnnouncementRead::firstOrCreate([
                    'user_id' => $user->id,
                    'announcement_id' => $id,
                ]);
            }
        }

        return response()->json(['status' => 'success']);
    }
}
