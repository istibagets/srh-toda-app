<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SessionsController extends Controller
{
    public function index(Request $request)
    {
        $lifetime = (int) config('session.lifetime', 120);
        $cutoff = time() - ($lifetime * 60);
        $onlineCutoff = time() - (10 * 60);

        $query = DB::table('sessions')
            ->leftJoin('users', 'users.id', '=', 'sessions.user_id')
            ->select(
                'sessions.id',
                'sessions.user_id',
                'sessions.ip_address',
                'sessions.user_agent',
                'sessions.last_activity',
                'users.name',
                'users.email',
                'users.role',
            )
            ->orderByDesc('sessions.last_activity');

        $q = trim((string) $request->query('q'));
        if ($q !== '') {
            $query->where(function ($w) use ($q) {
                $w->where('users.name', 'like', "%{$q}%")
                    ->orWhere('users.email', 'like', "%{$q}%")
                    ->orWhere('sessions.ip_address', 'like', "%{$q}%");
            });
        }

        $sessions = $query->paginate(25)->withQueryString();

        $sessions->getCollection()->transform(function ($s) {
            [$browser, $os, $device] = $this->parseUserAgent((string) $s->user_agent);

            $s->browser = $browser;
            $s->os = $os;
            $s->device = $device;

            return $s;
        });

        return view('superadmin.dashboard', [
            'activeTab' => 'sessions',
            'pageTitle' => 'Sessions',
            'sessions' => $sessions,
            'q' => $q,
            'currentSessionId' => session()->getId(),
            'sessionLifetime' => $lifetime,
            'sessionTotals' => [
                'total' => DB::table('sessions')->count(),
                'online' => DB::table('sessions')->where('last_activity', '>=', $onlineCutoff)->count(),
                'signedIn' => DB::table('sessions')->whereNotNull('user_id')->where('last_activity', '>=', $cutoff)->count(),
                'guests' => DB::table('sessions')->whereNull('user_id')->count(),
                'expired' => DB::table('sessions')->where('last_activity', '<', $cutoff)->count(),
            ],
        ]);
    }

    public function revoke(Request $request, string $sessionId)
    {
        $row = DB::table('sessions')->where('id', $sessionId)->first();

        if (! $row) {
            return back()->withErrors(['sessions' => 'Session not found — it may have expired already.']);
        }

        if ($sessionId === session()->getId()) {
            return back()->withErrors(['sessions' => 'You cannot revoke the session you are currently using.']);
        }

        DB::table('sessions')->where('id', $sessionId)->delete();

        ActivityLogger::log('session_revoked', null, [
            'session_id' => substr($sessionId, 0, 12),
            'user_id' => $row->user_id,
            'ip' => $row->ip_address,
        ]);

        return back()->with('status', 'Session revoked — that device is signed out immediately.');
    }

    public function clearExpired(Request $request)
    {
        $cutoff = time() - ((int) config('session.lifetime', 120) * 60);
        $deleted = DB::table('sessions')->where('last_activity', '<', $cutoff)->delete();

        ActivityLogger::log('sessions_cleared_expired', null, ['removed' => $deleted]);

        return back()->with('status', $deleted > 0
            ? "{$deleted} expired session(s) removed."
            : 'No expired sessions to clean up.');
    }

    private function parseUserAgent(string $ua): array
    {
        $browser = 'Unknown';
        $os = 'Unknown';
        $device = 'Desktop';

        if (stripos($ua, 'Edg/') !== false) {
            $browser = 'Edge';
        } elseif (stripos($ua, 'CriOS/') !== false) {
            $browser = 'Chrome (iOS)';
        } elseif (preg_match('/Firefox\//', $ua)) {
            $browser = 'Firefox';
        } elseif (preg_match('/Chrome\//', $ua)) {
            $browser = 'Chrome';
        } elseif (preg_match('/Version\/[\d.]+.*Safari/', $ua)) {
            $browser = 'Safari';
        } elseif (preg_match('/MSIE|Trident/', $ua)) {
            $browser = 'Internet Explorer';
        } elseif (preg_match('/PostmanRuntime|curl/', $ua)) {
            $browser = 'API Client';
        }

        if (preg_match('/Windows NT 10/', $ua)) {
            $os = 'Windows';
        } elseif (preg_match('/Windows NT 6\.1/', $ua)) {
            $os = 'Windows 7';
        } elseif (preg_match('/Android/', $ua)) {
            $os = 'Android';
        } elseif (preg_match('/iPhone|iPad|iPod/', $ua)) {
            $os = 'iOS';
        } elseif (preg_match('/Mac OS X/', $ua)) {
            $os = 'macOS';
        } elseif (preg_match('/Linux/', $ua)) {
            $os = 'Linux';
        }

        if (preg_match('/Android.*Mobile|iPhone|iPod|Mobile/', $ua)) {
            $device = 'Mobile';
        } elseif (preg_match('/iPad|Tablet/', $ua)) {
            $device = 'Tablet';
        }

        return [$browser, $os, $device];
    }
}