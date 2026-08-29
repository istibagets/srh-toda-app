<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

class HealthController extends Controller
{
    public function index()
    {
        return view('superadmin.dashboard', [
            'activeTab' => 'health',
            'pageTitle' => 'System Health',
            'health' => $this->runChecks(),
            'appMaintenanceDown' => file_exists(storage_path('framework/down')),
        ]);
    }

    public function toggleMaintenance(Request $request)
    {
        $downFile = storage_path('framework/down');
        $activating = ! file_exists($downFile);

        if ($activating) {
            try {
                broadcast(new \App\Events\MaintenanceModeToggled(true, 'The system is temporarily under maintenance. Please check back shortly.'));
            } catch (\Throwable $e) {}

            $activated = false;
            try {
                // The superadmin panel itself stays reachable during
                // maintenance (registered in bootstrap/app.php via
                // PreventRequestsDuringMaintenance::except('superadmin*')),
                // so the app can always be brought back online.
                Artisan::call('down', ['--secret' => 'srh-'.$this->shortToken()]);
                $activated = file_exists($downFile);
            } catch (\Throwable $e) {
                $activated = false;
            }
            if (! $activated) {
                try {
                    file_put_contents($downFile, json_encode([
                        'time' => time(),
                        'message' => 'Maintenance mode',
                        'retry' => 60,
                        'secret' => 'srh-'.$this->shortToken(),
                        'except' => ['superadmin*'],
                    ]));
                    $activated = file_exists($downFile);
                } catch (\Throwable $e) {
                    return redirect()->route('superadmin.health')->withErrors(['maintenance' => 'Could not activate maintenance mode (storage not writable).']);
                }
            }
            ActivityLogger::log('maintenance_enabled', null, ['superadmin' => true]);
            $message = 'Maintenance mode enabled — users are locked out, but the superadmin panel stays accessible.';
        } else {
            try {
                Artisan::call('up');
            } catch (\Throwable $e) {
                try {
                    @unlink($downFile);
                } catch (\Throwable $e2) {
                    // Both failed — report as-is below via live check
                }
            }
            ActivityLogger::log('maintenance_disabled', null, ['superadmin' => true]);
            try {
                broadcast(new \App\Events\MaintenanceModeToggled(false));
            } catch (\Throwable $e) {}
            $message = 'Maintenance mode disabled — the app is live again.';
        }

        return redirect()->route('superadmin.health')->with('status', $message);
    }

    private function runChecks(): array
    {
        $checks = [];

        // Database connectivity
        try {
            DB::select('SELECT 1');
            $tables = DB::select('SHOW TABLES');
            $checks['Database'] = ['ok', 'Connected · '.count($tables).' tables'];
        } catch (\Throwable $e) {
            $checks['Database'] = ['bad', 'FAILED: '.$this->shorten($e->getMessage())];
        }

        // Disk space
        try {
            $free = @disk_free_space(storage_path());
            $total = @disk_total_space(storage_path());
            if ($free === false || $total === false) {
                $checks['Disk space'] = ['warn', 'Unavailable on this host'];
            } else {
                $percent = $free / max(1, $total) * 100;
                $state = $percent < 10 ? 'bad' : ($percent < 20 ? 'warn' : 'ok');
                $checks['Disk space'] = [$state, $this->humanBytes($free).' free of '.$this->humanBytes($total)];
            }
        } catch (\Throwable $e) {
            $checks['Disk space'] = ['warn', 'Unavailable on this host'];
        }

        // Storage writability (public + logs)
        $probe = storage_path('logs').DIRECTORY_SEPARATOR.'.srh-write-probe';
        try {
            file_put_contents($probe, 'ok');
            $logsWritable = file_exists($probe);
            @unlink($probe);
        } catch (\Throwable $e) {
            $logsWritable = false;
        }
        $checks['Logs directory'] = $logsWritable ? ['ok', 'Writable'] : ['bad', 'NOT writable — logs will fail'];

        try {
            $disk = \Illuminate\Support\Facades\Storage::disk('public');
            $disk->put('.srh-write-probe', 'ok');
            $publicWritable = $disk->exists('.srh-write-probe');
            $disk->delete('.srh-write-probe');
        } catch (\Throwable $e) {
            $publicWritable = false;
        }
        $checks['Public storage'] = $publicWritable ? ['ok', 'Writable'] : ['warn', 'Not writable (uploads & logo may fail)'];

        // VAPID push keys
        $vapidReady = ! empty(config('services.vapid.public_key')) && ! empty(config('services.vapid.private_key'));
        $checks['Web Push (VAPID)'] = $vapidReady ? ['ok', 'Configured'] : ['warn', 'Keys missing — push notifications will fail'];

        // MapTiler (map styles)
        $mapReady = ! empty(config('services.maptiler.key'));
        $checks['MapTiler API'] = $mapReady ? ['ok', 'Configured'] : ['warn', 'Key missing — maps may not load'];

        // PHP limits
        $checks['PHP upload limit'] = ['ok', ini_get('upload_max_filesize').' / post '.ini_get('post_max_size')];
        $checks['PHP memory limit'] = ['ok', ini_get('memory_limit')];
        $checks['PHP timezone'] = ['ok', date_default_timezone_get()];

        // Sessions
        try {
            $sessionCount = DB::table('sessions')
                ->where('last_activity', '>=', time() - ((int) config('session.lifetime', 120) * 60))
                ->count();
            $checks['Sessions table'] = ['ok', $sessionCount.' active sessions ('.config('session.lifetime').' min window)'];
        } catch (\Throwable $e) {
            $checks['Sessions table'] = ['warn', 'Unreadable'];
        }

        // Maintenance
        $checks['Maintenance mode'] = file_exists(storage_path('framework/down'))
            ? ['warn', 'ACTIVE — app is down for users']
            : ['ok', 'Inactive — app is live'];

        return $checks;
    }

    private function shorten(string $message): string
    {
        return mb_substr(trim($message), 0, 140);
    }

    private function humanBytes(float $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $i = 0;
        while ($bytes >= 1024 && $i < count($units) - 1) {
            $bytes /= 1024;
            $i++;
        }

        return round($bytes, 1).' '.$units[$i];
    }

    private function shortToken(): string
    {
        return substr(bin2hex(random_bytes(6)), 0, 8);
    }
}