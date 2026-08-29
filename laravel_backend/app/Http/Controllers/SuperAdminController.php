<?php

namespace App\Http\Controllers;

use App\Support\SystemSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class SuperAdminController extends Controller
{
    private const MAX_FAILS = 5;

    private const LOCK_MINUTES = 10;

    private const LOG_DIR = '/logs/';

    public function showLogin()
    {
        SystemSettings::rememberDefaults();

        if ($this->isLocked()) {
            $minutes = (int) ceil((session()->get('srh_sa_locked_until') - time()) / 60);

            return back()->withErrors(['locked' => 'Too many failed attempts. Try again in '.max(1, $minutes).' minute(s).']);
        }

        return view('superadmin.login');
    }

    public function login(Request $request)
    {
        SystemSettings::rememberDefaults();

        $request->validate([
            'username' => ['required', 'string', 'max:60'],
            'password' => ['required', 'string'],
        ]);

        if ($this->isLocked()) {
            $minutes = (int) ceil((session()->get('srh_sa_locked_until') - time()) / 60);

            return back()->withErrors(['locked' => 'Too many failed attempts. Try again in '.max(1, $minutes).' minute(s).']);
        }

        $expected = (string) SystemSettings::get('security.username', 'admin');
        $storedHash = SystemSettings::get('security.password_hash');

        if ($storedHash === null) {
            SystemSettings::set('security.password_hash', Hash::make('admin123'));
            $storedHash = SystemSettings::get('security.password_hash');
        }

        if (hash_equals($expected, $request->username) && Hash::check($request->password, (string) $storedHash)) {
            session()->forget(['srh_sa_fails', 'srh_sa_locked_until']);
            session()->regenerate();
            session()->put('srh_superadmin_authed', true);

            $this->logAction('Superadmin logged in');

            \App\Services\ActivityLogger::log('login', null, ['role' => 'superadmin']);

            return redirect()->route('superadmin.dashboard');
        }

        $fails = (int) session()->get('srh_sa_fails', 0) + 1;
        session()->put('srh_sa_fails', $fails);

        if ($fails >= self::MAX_FAILS) {
            session()->put('srh_sa_locked_until', time() + (self::LOCK_MINUTES * 60));
            $this->logAction('Superadmin locked out after '.$fails.' failed login attempts');
            \App\Services\ActivityLogger::log('login_failed', null, ['role' => 'superadmin', 'reason' => 'locked_out']);
        } else {
            \App\Services\ActivityLogger::log('login_failed', null, ['role' => 'superadmin']);
        }

        return back()->withErrors(['credentials' => 'Invalid superadmin credentials.']);
    }

    public function logout(Request $request)
    {
        $this->logAction('Superadmin logged out');

        \App\Services\ActivityLogger::log('logout', null, ['role' => 'superadmin']);

        session()->forget('srh_superadmin_authed');
        session()->regenerate();

        return redirect()->route('superadmin.login');
    }

    public function dashboard(Request $request)
    {
        if (! session()->get('srh_superadmin_authed', false)) {
            return redirect()->route('superadmin.login');
        }

        SystemSettings::rememberDefaults();

        $tab = in_array($request->query('tab', 'overview'), ['overview', 'logs', 'branding', 'security', 'landing_cms'], true)
            ? $request->query('tab', 'overview')
            : 'overview';

        if ($tab === 'logs') {
            $logs = $this->logFiles();
            $selected = $request->query('file', 'laravel') === 'laravel' ? 'laravel' : 'superadmin';
            $selectedPath = $this->resolveLogPath($selected);

            return view('superadmin.dashboard', [
                'activeTab' => 'logs',
                'pageTitle' => 'System Logs',
                'logs' => $logs,
                'selectedLog' => $selected,
                'logLines' => $selectedPath
                    ? $this->tailFile($selectedPath, max(100, min(3000, (int) $request->query('lines', 500))))
                    : [],
                'logSize' => $selectedPath ? $this->humanBytes((float) filesize($selectedPath)) : '0 B',
                'logUpdated' => $selectedPath ? filemtime($selectedPath) : null,
                'lineCount' => (int) $request->query('lines', 500),
            ]);
        }

        if ($tab === 'landing_cms') {
            return view('superadmin.dashboard', [
                'activeTab' => 'landing_cms',
                'pageTitle' => 'Landing Page CMS',
                'landing' => SystemSettings::landingData(),
            ]);
        }

        if ($tab === 'branding') {
            return view('superadmin.dashboard', [
                'activeTab' => 'branding',
                'pageTitle' => 'Branding & Texts',
                'brandName' => SystemSettings::brandName(),
                'navBrand' => (string) SystemSettings::get('ui.nav_brand', 'SRH LINK TODA'),
                'brandTagline' => SystemSettings::brandTagline(),
                'welcomeSub' => (string) SystemSettings::get('ui.welcome_sub', 'Connect with verified TODA drivers<br>in Santa Rosa Homes, Nueva Ecija'),
                'logoUrl' => SystemSettings::logoUrl(),
                'hasCustomLogo' => (bool) SystemSettings::get('branding.logo_path'),
            ]);
        }

        if ($tab === 'security') {
            return view('superadmin.dashboard', [
                'activeTab' => 'security',
                'pageTitle' => 'Security',
                'username' => (string) SystemSettings::get('security.username', 'admin'),
            ]);
        }

        return view('superadmin.dashboard', [
            'activeTab' => 'overview',
            'pageTitle' => 'Overview',
            'stats' => $this->overviewStats(),
            'logs' => $this->logFiles(),
            'phpVersion' => PHP_VERSION,
            'laravelVersion' => app()->version(),
            'appEnv' => config('app.env'),
            'appUrl' => config('app.url'),
            'dbDriver' => config('database.default'),
            'sessionDriver' => config('session.driver'),
            'cacheStore' => config('cache.default'),
            'appMaintenanceDown' => file_exists(storage_path('framework/down')),
        ]);
    }

    public function clearLog(Request $request)
    {
        $request->validate(['file' => ['required', 'in:laravel,superadmin']]);

        $path = $this->resolveLogPath($request->file);
        if ($path) {
            @file_put_contents($path, '');
            $this->logAction('Cleared '.$request->file.'.log');
        }

        return redirect()->route('superadmin.dashboard', ['tab' => 'logs', 'file' => $request->file])
            ->with('status', 'Log file cleared.');
    }

    public function downloadLog(Request $request, string $file)
    {
        if (! in_array($file, ['laravel', 'superadmin'], true)) {
            abort(404);
        }

        $path = $this->resolveLogPath($file);
        if (! $path || ! file_exists($path)) {
            abort(404);
        }

        $this->logAction('Downloaded '.$file.'.log');

        return response()->download($path, $file.'-log-'.date('Ymd-His').'.log');
    }

    public function updateBranding(Request $request)
    {
        $request->validate([
            'brand_name' => ['nullable', 'string', 'max:60'],
            'nav_brand' => ['nullable', 'string', 'max:60'],
            'brand_tagline' => ['nullable', 'string', 'max:300'],
            'welcome_sub' => ['nullable', 'string', 'max:200'],
            'logo' => ['nullable', 'image', 'mimes:png,jpg,jpeg,webp', 'max:5120'],
        ]);

        $changes = [];

        if ($request->hasFile('logo')) {
            $file = $request->file('logo');
            $ext = $file->getClientOriginalExtension() ?: 'png';
            $filename = 'logo-'.date('Ymd-His').'.'.$ext;
            $relPath = 'superadmin/'.$filename;

            // 1. Storage directory
            $storageDir = storage_path('app/public/superadmin');
            if (!file_exists($storageDir)) {
                @mkdir($storageDir, 0755, true);
            }
            foreach (glob($storageDir.'/*') as $old) {
                @unlink($old);
            }

            // 2. Public storage directory
            $pubDir = public_path('storage/superadmin');
            if (!file_exists($pubDir)) {
                @mkdir($pubDir, 0755, true);
            }
            foreach (glob($pubDir.'/*') as $old) {
                @unlink($old);
            }

            // Move uploaded file to public storage and copy to app storage
            $file->move($pubDir, $filename);
            @copy($pubDir.'/'.$filename, $storageDir.'/'.$filename);

            SystemSettings::set('branding.logo_path', $relPath);
            $changes[] = 'logo';
        }

        // Only update UI text keys if submitted from the UI Texts form
        $hasTextFields = $request->has('brand_name') || $request->has('nav_brand') || $request->has('brand_tagline') || $request->has('welcome_sub');

        if ($hasTextFields) {
            foreach ([
                'ui.brand_name' => 'brand_name',
                'ui.nav_brand' => 'nav_brand',
                'ui.brand_tagline' => 'brand_tagline',
                'ui.welcome_sub' => 'welcome_sub',
            ] as $key => $field) {
                if ($request->has($field)) {
                    $value = trim((string) $request->input($field, ''));
                    SystemSettings::set($key, $value === '' ? null : $value);
                    $changes[] = $key;
                }
            }
        }

        $this->logAction('Updated branding settings ('.implode(', ', $changes ?: ['none']).')');

        $statusMsg = $request->hasFile('logo') ? 'Logo saved and applied across the entire app!' : 'Branding settings saved.';

        return redirect()->route('superadmin.dashboard', ['tab' => 'branding'])->with('status', $statusMsg);
    }

    public function removeLogo(Request $request)
    {
        $storageDir = storage_path('app/public/superadmin');
        foreach (glob($storageDir.'/*') as $old) {
            @unlink($old);
        }

        $pubDir = public_path('storage/superadmin');
        foreach (glob($pubDir.'/*') as $old) {
            @unlink($old);
        }

        SystemSettings::set('branding.logo_path', null);
        $this->logAction('Removed custom logo (reverted to default)');

        return redirect()->route('superadmin.dashboard', ['tab' => 'branding'])->with('status', 'Custom logo removed. The default logo is used again.');
    }

    /**
     * Stream custom logo with resilient fallbacks and caching headers.
     */
    public function streamLogo(string $filename)
    {
        $file1 = public_path('storage/superadmin/'.$filename);
        $file2 = storage_path('app/public/superadmin/'.$filename);
        $path = file_exists($file1) ? $file1 : (file_exists($file2) ? $file2 : null);

        if (!$path || !file_exists($path)) {
            $default = public_path('favicon.png');
            if (file_exists($default)) {
                return response()->file($default, ['Content-Type' => 'image/png', 'Cache-Control' => 'public, max-age=86400']);
            }
            abort(404);
        }

        $mime = mime_content_type($path) ?: 'image/png';
        return response()->file($path, ['Content-Type' => $mime, 'Cache-Control' => 'public, max-age=86400']);
    }

    public function updateLandingCms(Request $request)
    {
        $request->validate([
            'hero_badge' => ['nullable', 'string', 'max:100'],
            'hero_title' => ['required', 'string', 'max:255'],
            'hero_subtitle' => ['required', 'string', 'max:500'],
            'hero_cta_primary' => ['nullable', 'string', 'max:50'],
            'hero_cta_secondary' => ['nullable', 'string', 'max:50'],
            'about_title' => ['nullable', 'string', 'max:255'],
            'about_text' => ['nullable', 'string', 'max:1000'],
            'membership_intro' => ['nullable', 'string', 'max:500'],
            'membership_step1_title' => ['nullable', 'string', 'max:150'],
            'membership_step1_desc' => ['nullable', 'string', 'max:300'],
            'membership_step2_title' => ['nullable', 'string', 'max:150'],
            'membership_step2_desc' => ['nullable', 'string', 'max:300'],
            'membership_step3_title' => ['nullable', 'string', 'max:150'],
            'membership_step3_desc' => ['nullable', 'string', 'max:300'],
            'membership_step4_title' => ['nullable', 'string', 'max:150'],
            'membership_step4_desc' => ['nullable', 'string', 'max:300'],
            'activities_text' => ['nullable', 'string', 'max:1000'],
            'terminal_location' => ['nullable', 'string', 'max:255'],
            'terminal_hours' => ['nullable', 'string', 'max:150'],
            'dispatch_hotline' => ['nullable', 'string', 'max:100'],
            'dispatch_email' => ['nullable', 'string', 'max:150'],
            'faqs' => ['nullable', 'array'],
            'faqs.*.question' => ['nullable', 'string', 'max:255'],
            'faqs.*.answer' => ['nullable', 'string', 'max:1000'],
        ]);

        $fields = [
            'hero_badge', 'hero_title', 'hero_subtitle', 'hero_cta_primary', 'hero_cta_secondary',
            'about_title', 'about_text', 'membership_intro',
            'membership_step1_title', 'membership_step1_desc',
            'membership_step2_title', 'membership_step2_desc',
            'membership_step3_title', 'membership_step3_desc',
            'membership_step4_title', 'membership_step4_desc',
            'activities_text', 'terminal_location', 'terminal_hours', 'dispatch_hotline', 'dispatch_email'
        ];

        foreach ($fields as $field) {
            if ($request->has($field)) {
                SystemSettings::set('landing.' . $field, $request->input($field));
            }
        }

        if ($request->has('faqs')) {
            $cleanFaqs = [];
            foreach ($request->input('faqs', []) as $faq) {
                if (!empty($faq['question']) && !empty($faq['answer'])) {
                    $cleanFaqs[] = [
                        'question' => trim($faq['question']),
                        'answer' => trim($faq['answer']),
                    ];
                }
            }
            if (!empty($cleanFaqs)) {
                SystemSettings::set('landing.faqs_json', json_encode($cleanFaqs, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            }
        }

        $this->logAction('Updated Landing Page CMS content');
        \App\Services\ActivityLogger::log('landing_cms_updated', null, ['role' => 'superadmin']);

        return redirect()->route('superadmin.dashboard', ['tab' => 'landing_cms'])
            ->with('status', 'Landing Page CMS content saved successfully.');
    }

    public function updateSecurity(Request $request)
    {
        $request->validate([
            'current_password' => ['required', 'string'],
            'username' => ['required', 'string', 'alpha_dash', 'min:3', 'max:30'],
            'new_password' => ['nullable', 'string', 'min:8', 'confirmed'],
        ]);

        $storedHash = SystemSettings::get('security.password_hash');
        if ($storedHash === null) {
            SystemSettings::set('security.password_hash', Hash::make('admin123'));
            $storedHash = SystemSettings::get('security.password_hash');
        }

        if (! Hash::check($request->current_password, (string) $storedHash)) {
            return back()->withErrors(['current_password' => 'Current password is incorrect.']);
        }

        SystemSettings::set('security.username', trim($request->username));

        if (! empty($request->new_password)) {
            SystemSettings::set('security.password_hash', Hash::make($request->new_password));
            $this->logAction('Superadmin password changed');
        }

        $this->logAction('Superadmin username changed to "'.$request->username.'"');

        return redirect()->route('superadmin.dashboard', ['tab' => 'security'])->with('status', 'Security settings saved.');
    }

    private function logAction(string $message): void
    {
        try {
            $logger = Log::build([
                'driver' => 'single',
                'path' => storage_path('logs/superadmin.log'),
                'level' => 'info',
            ]);
            $logger->info($message.' ['.request()->ip().']');
        } catch (\Throwable $e) {
            // Logging must never break the panel.
        }
    }

    private function isLocked(): bool
    {
        $until = (int) session()->get('srh_sa_locked_until', 0);

        if ($until > 0 && time() < $until) {
            return true;
        }

        if ($until > 0 && time() >= $until) {
            session()->forget(['srh_sa_fails', 'srh_sa_locked_until']);
        }

        return false;
    }

    private function logFiles(): array
    {
        $dir = storage_path('logs');
        $files = [];

        foreach (scandir($dir) ?: [] as $entry) {
            if (! str_ends_with($entry, '.log') || (! str_starts_with($entry, 'laravel') && ! str_starts_with($entry, 'superadmin'))) {
                continue;
            }

            $path = $dir.DIRECTORY_SEPARATOR.$entry;
            $size = @filesize($path) ?: 0;

            $files[] = [
                'name' => $entry,
                'key' => str_starts_with($entry, 'superadmin') ? 'superadmin' : 'laravel',
                'size' => $this->humanBytes((float) $size),
                'bytes' => $size,
                'updated' => @filemtime($path) ?: time(),
            ];
        }

        usort($files, fn ($a, $b) => $b['updated'] <=> $a['updated']);

        return $files;
    }

    private function resolveLogPath(string $key): ?string
    {
        $file = $key === 'laravel' ? 'laravel.log' : 'superadmin.log';
        $path = storage_path('logs'.DIRECTORY_SEPARATOR.$file);

        return file_exists($path) ? $path : null;
    }

    private function tailFile(string $path, int $lines): string
    {
        $handle = @fopen($path, 'rb');
        if (! $handle) {
            return '(unable to read log file)';
        }

        $buffer = '';
        $chunkSize = 8192;
        $position = max(0, filesize($path) - $chunkSize);

        try {
            while ($position > 0) {
                fseek($handle, $position);
                $buffer = fread($handle, $chunkSize).$buffer;
                $position -= $chunkSize;

                if (substr_count($buffer, "\n") >= $lines) {
                    break;
                }
            }

            if ($position <= 0) {
                rewind($handle);
                $buffer = fread($handle, $chunkSize).$buffer;
            }
        } finally {
            fclose($handle);
        }

        $linesArr = explode("\n", $buffer);

        return implode("\n", array_slice($linesArr, -$lines));
    }

    private function overviewStats(): array
    {
        $stats = [
            'Users' => 0,
            'Drivers' => 0,
            'Rides' => 0,
            'Reports' => 0,
            'Announcements' => 0,
            'Push Subscriptions' => 0,
            'Active Sessions' => 0,
        ];

        $queries = [
            'Users' => fn () => DB::table('users')->count(),
            'Drivers' => fn () => DB::table('drivers')->count(),
            'Rides' => fn () => DB::table('rides')->count(),
            'Reports' => fn () => DB::table('reports')->count(),
            'Announcements' => fn () => DB::table('announcements')->count(),
            'Push Subscriptions' => fn () => DB::table('push_subscriptions')->count(),
            'Active Sessions' => fn () => DB::table('sessions')
                ->where('last_activity', '>=', time() - ((int) config('session.lifetime', 120) * 60))
                ->count(),
        ];

        foreach ($queries as $label => $query) {
            try {
                $stats[$label] = (int) $query();
            } catch (\Throwable $e) {
                $stats[$label] = -1;
            }
        }

        return $stats;
    }

    private function humanBytes(float $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB'];

        $i = 0;
        while ($bytes >= 1024 && $i < count($units) - 1) {
            $bytes /= 1024;
            $i++;
        }

        return round($bytes, 1).' '.$units[$i];
    }
}
