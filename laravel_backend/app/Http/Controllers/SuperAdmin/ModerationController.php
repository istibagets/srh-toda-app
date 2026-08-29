<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\Driver;
use App\Models\Report;
use App\Models\Ride;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;

class ModerationController extends Controller
{
    public function reports(Request $request)
    {
        $query = Report::with(['reporter', 'driver.driverProfile', 'ride'])->latest();

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('category', 'like', "%{$search}%")
                    ->orWhere('subject', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhereHas('reporter', function ($u) use ($search) {
                        $u->where('name', 'like', "%{$search}%");
                    })
                    ->orWhereHas('driver', function ($u) use ($search) {
                        $u->where('name', 'like', "%{$search}%");
                    });
            });
        }

        $reports = $query->paginate(15)->withQueryString();

        $stats = [
            'total' => Report::count(),
            'pending' => Report::where('status', 'pending')->count(),
            'investigating' => Report::where('status', 'investigating')->count(),
            'resolved' => Report::where('status', 'resolved')->count(),
            'dismissed' => Report::where('status', 'dismissed')->count(),
        ];

        return view('superadmin.dashboard', [
            'activeTab' => 'reports',
            'pageTitle' => 'Reports',
            'reports' => $reports,
            'reportStats' => $stats,
            'statusFilter' => $request->input('status', 'all'),
            'search' => $request->input('search', ''),
        ]);
    }

    public function updateReportStatus(Request $request, int $reportId)
    {
        $request->validate([
            'status' => ['required', 'in:pending,investigating,resolved,dismissed'],
            'admin_notes' => ['nullable', 'string', 'max:1000'],
            'suspend_driver' => ['nullable', 'boolean'],
            'suspension_reason' => ['nullable', 'string', 'max:255'],
        ]);

        $report = Report::findOrFail($reportId);

        $report->update([
            'status' => $request->status,
            'admin_notes' => $request->admin_notes,
            'resolved_at' => $request->status === 'resolved' && ! $report->resolved_at ? now() : $report->resolved_at,
        ]);

        if ($request->boolean('suspend_driver') && $report->driver_id) {
            $driverProfile = Driver::where('user_id', $report->driver_id)->first();
            if ($driverProfile) {
                $driverProfile->update([
                    'compliance_status' => 'suspended',
                    'suspension_reason' => $request->suspension_reason ?? 'Suspended due to report #'.$report->id.': '.$report->category,
                ]);
            }
        }

        ActivityLogger::log('report_status_changed', null, [
            'report_id' => $report->id,
            'status' => $request->status,
            'superadmin' => true,
        ]);

        return redirect()->route('superadmin.reports')->with('status', "Report #{$report->id} marked as {$request->status}.");
    }

    public function rides(Request $request)
    {
        $query = Ride::with(['passenger', 'driver.driverProfile'])->latest();

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('pickup_location', 'like', "%{$search}%")
                    ->orWhere('destination', 'like', "%{$search}%")
                    ->orWhereHas('passenger', function ($u) use ($search) {
                        $u->where('name', 'like', "%{$search}%");
                    })
                    ->orWhereHas('driver', function ($u) use ($search) {
                        $u->where('name', 'like', "%{$search}%");
                    });
            });
        }

        $rides = $query->paginate(15)->withQueryString();

        $statusCounts = Ride::query()
            ->select('status')
            ->selectRaw('COUNT(*) as total')
            ->groupBy('status')
            ->orderByDesc('total')
            ->get()
            ->pluck('total', 'status');

        return view('superadmin.dashboard', [
            'activeTab' => 'rides',
            'pageTitle' => 'Rides',
            'rides' => $rides,
            'rideStatusCounts' => $statusCounts,
            'statusFilter' => $request->input('status', 'all'),
            'search' => $request->input('search', ''),
        ]);
    }
}