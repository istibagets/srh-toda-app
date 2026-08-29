<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\AnnouncementRead;
use App\Models\Driver;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\PushService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ContentController extends Controller
{
    private static bool $schemaChecked = false;

    public function announcements(Request $request)
    {
        $this->ensureAnnouncementsSchema();

        $announcements = Announcement::with('creator')
            ->withCount('reads')
            ->latest()
            ->paginate(15)
            ->withQueryString();

        return view('superadmin.dashboard', [
            'activeTab' => 'announcements',
            'pageTitle' => 'Announcements',
            'announcements' => $announcements,
        ]);
    }

    public function createAnnouncement(Request $request)
    {
        $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'message' => ['required', 'string'],
            'target_audience' => ['required', 'in:all,drivers,passengers'],
        ]);

        $announcement = Announcement::create([
            'created_by' => null,
            'title' => $request->title,
            'message' => $request->message,
            'target_audience' => $request->target_audience,
        ]);

        if ($request->boolean('send_push')) {
            try {
                $push = app(PushService::class);
                $tag = 'announcement-'.$announcement->id;

                if ($request->target_audience === 'drivers') {
                    $driverUserIds = Driver::whereNotNull('user_id')->pluck('user_id')->all();
                    $push->sendToUsers($driverUserIds, $request->title, $request->message, route('drivers.live-queue'), $tag);
                } elseif ($request->target_audience === 'passengers') {
                    $passengerUserIds = User::whereIn('role', ['user', 'passenger'])->pluck('id')->all();
                    $push->sendToUsers($passengerUserIds, $request->title, $request->message, route('dashboard'), $tag);
                } else {
                    $push->sendToAll($request->title, $request->message, route('dashboard'), $tag);
                }
            } catch (\Throwable $e) {
                // Push failures never break the announcement itself
            }
        }

        ActivityLogger::log('announcement_created', null, [
            'title' => $request->title,
            'target' => $request->target_audience,
            'push' => $request->boolean('send_push'),
            'superadmin' => true,
        ]);

        return redirect()->route('superadmin.announcements')->with('status', 'Announcement published.');
    }

    /**
     * Superadmin broadcasts have no owner user row — ensure the column accepts
     * NULL, self-healing on shared-hosting dumps (mirrors SystemSettings).
     */
    private function ensureAnnouncementsSchema(): void
    {
        if (self::$schemaChecked) {
            return;
        }

        self::$schemaChecked = true;

        try {
            $columns = DB::select('SHOW COLUMNS FROM announcements WHERE Field = ?', ['created_by']);
            if (! empty($columns) && ! str_contains((string) ($columns[0]->Null ?? ''), 'YES')) {
                DB::statement('ALTER TABLE announcements MODIFY created_by BIGINT UNSIGNED NULL');
            }
        } catch (\Throwable $e) {
            // Fall back gracefully — a DB error only blocks manual broadcasts.
        }
    }

    public function deleteAnnouncement(int $announcementId)
    {
        $announcement = Announcement::findOrFail($announcementId);

        ActivityLogger::log('announcement_deleted', null, [
            'title' => $announcement->title,
            'superadmin' => true,
        ]);

        AnnouncementRead::where('announcement_id', $announcement->id)->delete();
        $announcement->delete();

        return redirect()->route('superadmin.announcements')->with('status', 'Announcement deleted.');
    }

    public function clearAllAnnouncements(Request $request)
    {
        $count = Announcement::count();

        AnnouncementRead::query()->delete();
        Announcement::query()->delete();

        ActivityLogger::log('announcements_cleared_all', null, [
            'count' => $count,
            'superadmin' => true,
        ]);

        return redirect()->route('superadmin.announcements')->with('status', "All {$count} announcement(s) and notification records have been cleared.");
    }

    public function notifications()
    {
        return view('superadmin.dashboard', [
            'activeTab' => 'notifications',
            'pageTitle' => 'Push Notifications',
        ]);
    }

    public function sendNotification(Request $request)
    {
        $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'message' => ['required', 'string'],
            'audience' => ['required', 'in:all,passengers,drivers,online-drivers'],
            'url' => ['nullable', 'string', 'max:500'],
            'also_announce' => ['nullable', 'boolean'],
        ]);

        $url = $request->filled('url') ? $request->url : route('dashboard');
        $announcementAudience = in_array($request->audience, ['drivers', 'online-drivers'], true) ? 'drivers' : ($request->audience === 'passengers' ? 'passengers' : 'all');
        $pushCount = 0;

        try {
            $push = app(PushService::class);
            $tag = 'superadmin-push-'.time();

            if ($request->audience === 'passengers') {
                $ids = User::whereIn('role', ['user', 'passenger'])->pluck('id')->all();
                $push->sendToUsers($ids, $request->title, $request->message, $url, $tag);
            } elseif ($request->audience === 'drivers') {
                $ids = Driver::whereNotNull('user_id')->pluck('user_id')->all();
                $push->sendToUsers($ids, $request->title, $request->message, $url, $tag);
            } elseif ($request->audience === 'online-drivers') {
                $push->sendToOnlineDrivers($request->title, $request->message, $url, $tag);
            } else {
                $push->sendToAll($request->title, $request->message, $url, $tag);
            }

            $pushCount = \App\Models\PushSubscription::count();
        } catch (\Throwable $e) {
            // Fall through — announcement may still be created
        }

        if ($request->boolean('also_announce')) {
            Announcement::create([
                'created_by' => null,
                'title' => $request->title,
                'message' => $request->message,
                'target_audience' => $announcementAudience,
            ]);
        }

        ActivityLogger::log('push_sent', null, [
            'title' => $request->title,
            'audience' => $request->audience,
            'announce' => $request->boolean('also_announce'),
            'superadmin' => true,
        ]);

        return redirect()->route('superadmin.notifications')->with('status', "Push notification sent to {$request->audience} ({$pushCount} active subscriptions).");
    }
}