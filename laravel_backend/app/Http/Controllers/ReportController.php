<?php

namespace App\Http\Controllers;

use App\Models\Report;
use App\Models\User;
use App\Models\Driver;
use App\Models\Announcement;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    /**
     * Admin view to display and manage passenger reports.
     */
    public function index(Request $request)
    {
        if (auth()->user()->role !== 'admin') {
            return redirect()->route('dashboard')->with('error', 'Unauthorized access.');
        }

        $query = Report::with(['reporter', 'driver.driverProfile', 'ride'])->latest();

        // Search filter
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('category', 'like', "%{$search}%")
                  ->orWhere('subject', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%")
                  ->orWhereHas('reporter', function ($userQuery) use ($search) {
                      $userQuery->where('name', 'like', "%{$search}%")
                                ->orWhere('email', 'like', "%{$search}%");
                  })
                  ->orWhereHas('driver', function ($driverQuery) use ($search) {
                      $driverQuery->where('name', 'like', "%{$search}%");
                  });
            });
        }

        // Status filter
        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        $reports = $query->paginate(15)->withQueryString();

        // Stats counters
        $stats = [
            'total' => Report::count(),
            'pending' => Report::where('status', 'pending')->count(),
            'investigating' => Report::where('status', 'investigating')->count(),
            'resolved' => Report::where('status', 'resolved')->count(),
            'dismissed' => Report::where('status', 'dismissed')->count(),
        ];

        // Fetch drivers list for reporting dropdowns
        $drivers = User::where('role', 'driver')->orderBy('name')->get();

        if ($request->ajax() || $request->header('X-SPA-Request')) {
            return view('admin.partials.reports-table', compact('reports', 'stats', 'drivers'));
        }

        return view('admin.reports', compact('reports', 'stats', 'drivers'));
    }

    /**
     * Store a passenger report.
     */
    public function store(Request $request)
    {
        $request->validate([
            'category' => 'required|string|max:100',
            'driver_id' => 'nullable|exists:users,id',
            'ride_id' => 'nullable|exists:rides,id',
            'subject' => 'nullable|string|max:255',
            'description' => 'required|string|min:5|max:1500',
        ]);

        $report = Report::create([
            'reporter_id' => auth()->id(),
            'driver_id' => $request->driver_id,
            'ride_id' => $request->ride_id,
            'category' => $request->category,
            'subject' => $request->subject ?? ($request->category . ' Incident'),
            'description' => $request->description,
            'status' => 'pending',
        ]);

        // Notify ONLY Admin of new passenger report
        try {
            $reporterName = auth()->user()->name ?? 'Passenger';
            Announcement::create([
                'created_by' => auth()->id(),
                'title' => "New Passenger Report #{$report->id}: {$request->category}",
                'message' => "Passenger {$reporterName} submitted Report #{$report->id}.\nCategory: {$request->category}\nDescription: \"" . \Str::limit($request->description, 120) . "\"",
                'target_audience' => 'admin',
            ]);

            app(\App\Services\PushService::class)->sendToRole(
                'admin',
                "⚠️ New Incident Report #{$report->id}",
                "{$request->category} reported by {$reporterName}: " . \Str::limit($request->description, 80),
                route('admin.reports'),
                "report-{$report->id}"
            );
        } catch (\Throwable $e) {
            // Silently swallow notification error
        }

        try {
            broadcast(new \App\Events\ReportUpdated($report->id, 'created'));
        } catch (\Throwable $e) {}

        if ($request->wantsJson() || $request->header('X-SPA-Request')) {
            return response()->json([
                'status' => 'success',
                'message' => 'Your report has been submitted to TODA Admin for review.',
                'report' => $report,
            ]);
        }

        return back()->with('status', 'Your report has been submitted to TODA Admin for review.');
    }

    /**
     * Admin action to update report status or add admin notes.
     */
    public function updateStatus(Request $request, Report $report)
    {
        if (auth()->user()->role !== 'admin') {
            return response()->json(['error' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'status' => 'required|in:pending,investigating,resolved,dismissed',
            'admin_notes' => 'nullable|string|max:1000',
            'suspend_driver' => 'nullable|boolean',
            'suspension_reason' => 'nullable|string|max:255',
        ]);

        $data = [
            'status' => $request->status,
            'admin_notes' => $request->admin_notes,
        ];

        if ($request->status === 'resolved' && !$report->resolved_at) {
            $data['resolved_at'] = now();
        }

        $report->update($data);

        // Optional driver suspension directly from report review
        if ($request->boolean('suspend_driver') && $report->driver_id) {
            $driverProfile = Driver::where('user_id', $report->driver_id)->first();
            if ($driverProfile) {
                $driverProfile->update([
                    'compliance_status' => 'suspended',
                    'suspension_reason' => $request->suspension_reason ?? ("Suspended due to report #" . $report->id . ": " . $report->category),
                ]);
                try {
                    broadcast(new \App\Events\DriverApplicantUpdated($driverProfile->id, 'suspended'));
                } catch (\Throwable $e) {}
            }
        }

        // Send notification ONLY to the passenger who submitted the report
        if ($report->reporter_id) {
            try {
                $statusFormatted = ucfirst($request->status);
                $notesText = $request->admin_notes ? ("\nAdmin Response: " . $request->admin_notes) : "";
                
                Announcement::create([
                    'created_by' => auth()->id(),
                    'title' => "Report Status Update: #" . $report->id . " (" . $report->category . ")",
                    'message' => "Your incident report status has been updated to: {$statusFormatted}.{$notesText}",
                    'target_audience' => 'user_' . $report->reporter_id,
                ]);
            } catch (\Throwable $e) {
                // Silently swallow notification error
            }
        }

        try {
            broadcast(new \App\Events\ReportUpdated($report->id, 'status_updated'));
        } catch (\Throwable $e) {}

        if ($request->wantsJson() || $request->header('X-SPA-Request')) {
            return response()->json([
                'status' => 'success',
                'message' => 'Report status updated successfully.',
                'report' => $report->fresh(['reporter', 'driver', 'ride']),
            ]);
        }

        return back()->with('status', 'Report updated successfully.');
    }

    /**
     * Delete a report (Admin only).
     */
    public function destroy(Report $report)
    {
        if (auth()->user()->role !== 'admin') {
            return response()->json(['error' => 'Unauthorized.'], 403);
        }

        $reportId = $report->id;
        $report->delete();

        if (Report::count() === 0) {
            try {
                \DB::statement("ALTER TABLE reports AUTO_INCREMENT = 1;");
            } catch (\Throwable $e) {}
        }

        try {
            broadcast(new \App\Events\ReportUpdated($reportId, 'deleted'));
        } catch (\Throwable $e) {}

        if (request()->wantsJson() || request()->header('X-SPA-Request')) {
            return response()->json(['status' => 'success']);
        }

        return back()->with('status', 'Report deleted successfully.');
    }
}
