<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\UserActivityLog;
use Illuminate\Http\Request;

class ActivityController extends Controller
{
    public function index(Request $request)
    {
        $query = UserActivityLog::query();

        if ($request->filled('action') && $request->action !== 'all') {
            $query->where('action', $request->action);
        }

        if ($request->filled('role') && $request->role !== 'all') {
            $query->where('user_role', $request->role);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('user_name', 'like', "%{$search}%")
                    ->orWhere('ip_address', 'like', "%{$search}%")
                    ->orWhere('metadata', 'like', "%{$search}%")
                    ->orWhere('action', 'like', "%{$search}%");
            });
        }

        $logs = $query->latest('id')->paginate(25)->withQueryString();

        $actionCounts = UserActivityLog::query()
            ->select('action')
            ->selectRaw('COUNT(*) as total')
            ->groupBy('action')
            ->orderByDesc('total')
            ->get()
            ->pluck('total', 'action');

        return view('superadmin.dashboard', [
            'activeTab' => 'activity',
            'pageTitle' => 'Activity Log',
            'logs' => $logs,
            'actionFilter' => $request->input('action', 'all'),
            'roleFilter' => $request->input('role', 'all'),
            'search' => $request->input('search', ''),
            'actionCounts' => $actionCounts,
        ]);
    }

    public function clear(Request $request)
    {
        $request->validate(['confirm' => ['required', 'in:DELETE']]);

        UserActivityLog::query()->delete();

        return redirect()->route('superadmin.activity')->with('status', 'Activity log cleared.');
    }
}