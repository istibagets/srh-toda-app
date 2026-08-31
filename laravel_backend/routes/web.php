<?php

use App\Http\Controllers\DriverController;
use App\Http\Controllers\ProfileController;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\RideController;

// MapTiler base style served locally with complete sprite sheet bundle and inlined tile schemas for instant 0ms map rendering.
Route::get('/srh-map-style.json', function () {
    $style = Cache::remember('srh_maptiler_style_v8', now()->addHours(24), function () {
        $key = config('services.maptiler.key');
        $url = 'https://api.maptiler.com/maps/' . config('services.maptiler.style')
            . '/style.json?key=' . $key;
        $response = Http::timeout(15)->get($url);
        abort_unless($response->successful(), 502, 'Map style unavailable.');
        $style = $response->json();

        // 100% Static Sprite Assets (Served locally) & High-Speed Edge CDN for Glyphs
        $style['sprite'] = url('/map-assets/sprites/sprite');
        $style['glyphs'] = 'https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=' . $key;

        // ⚡ Performance Optimization: Inline vector tile URLs directly into sources
        // This eliminates the extra tiles.json HTTP network round-trip completely!
        if (isset($style['sources']) && is_array($style['sources'])) {
            foreach ($style['sources'] as $sourceKey => &$src) {
                if (isset($src['type']) && $src['type'] === 'vector' && !empty($src['url'])) {
                    $tileUrl = preg_replace('/\/tiles\.json.*$/', '/{z}/{x}/{y}.pbf?key=' . $key, $src['url']);
                    $src['tiles'] = [$tileUrl];
                    $src['minzoom'] = $src['minzoom'] ?? 0;
                    $src['maxzoom'] = $src['maxzoom'] ?? 14;
                    unset($src['url']);
                }
            }
            unset($src);
        }

        $style['layers'] = array_values(array_filter(array_map(function ($layer) {
            if (!isset($layer['id']) || !is_array($layer)) return $layer;
            if (preg_match('/^Highway (shield|junction)/i', (string) $layer['id'])) {
                return null;
            }

            // Clean & unify fontstacks to 100% locally cached Noto Sans
            if (isset($layer['layout']['text-font'])) {
                $raw = is_array($layer['layout']['text-font']) ? implode(' ', $layer['layout']['text-font']) : (string)$layer['layout']['text-font'];
                if (stripos($raw, 'Bold') !== false) {
                    $layer['layout']['text-font'] = ['Noto Sans Bold'];
                } elseif (stripos($raw, 'Italic') !== false) {
                    $layer['layout']['text-font'] = ['Noto Sans Italic'];
                } else {
                    $layer['layout']['text-font'] = ['Noto Sans Regular'];
                }
            }

            return $layer;
        }, $style['layers'] ?? []), function ($layer) {
            return $layer !== null;
        }));

        return $style;
    });

    return response()->json($style, 200, [
        'Content-Type' => 'application/json',
        'Cache-Control' => 'public, max-age=86400, stale-while-revalidate=604800',
        'Access-Control-Allow-Origin' => '*',
        'Access-Control-Allow-Methods' => 'GET, OPTIONS',
        'Access-Control-Allow-Headers' => '*',
    ]);
})->name('srh.map-style');

Route::get('/map-assets/sprites/{file}', function ($file) {
    $path = public_path('map-assets/sprites/' . $file);
    if (!file_exists($path)) {
        abort(404);
    }
    $mime = str_ends_with($file, '.json') ? 'application/json' : 'image/png';
    return response()->file($path, [
        'Content-Type' => $mime,
        'Access-Control-Allow-Origin' => '*',
        'Access-Control-Allow-Methods' => 'GET, OPTIONS',
        'Cache-Control' => 'public, max-age=86400',
    ]);
});

Route::get('/maintenance-status', function () {
    return response()->json([
        'active' => file_exists(storage_path('framework/down')),
        'message' => 'The system is temporarily under maintenance. Please check back shortly.',
        'brand' => \App\Support\SystemSettings::brandName(),
    ], 200, [], JSON_UNESCAPED_SLASHES);
})->name('maintenance.status');

Route::get('/api/reverse-geocode', function (\Illuminate\Http\Request $request) {
    $lat = $request->query('lat');
    $lng = $request->query('lng');
    if (!$lat || !$lng) return response()->json(['display_name' => 'Pinned Location']);

    $cacheKey = 'rev_geo_' . round((float)$lat, 4) . '_' . round((float)$lng, 4);
    $result = Cache::remember($cacheKey, now()->addHours(48), function () use ($lat, $lng) {
        try {
            $resp = Http::timeout(4)
                ->withHeaders(['User-Agent' => 'SRH-LINK-TODA/1.0 (admin@srh-link-toda.duckdns.org)'])
                ->get('https://nominatim.openstreetmap.org/reverse', [
                    'format' => 'json',
                    'lat' => $lat,
                    'lon' => $lng,
                    'addressdetails' => 1,
                ]);
            if ($resp->successful()) {
                return $resp->json();
            }
        } catch (\Throwable $e) {}
        return null;
    });

    return response()->json($result ?: ['display_name' => "Pinned Location ({$lat}, {$lng})"]);
})->name('api.reverse-geocode');

Route::get('/api/geocode/search', function (\Illuminate\Http\Request $request) {
    $q = trim((string)$request->query('q', ''));
    if (mb_strlen($q) < 2) {
        return response()->json([]);
    }

    $cacheKey = 'geo_search_ne_' . md5(mb_strtolower($q));
    $results = Cache::remember($cacheKey, now()->addHours(48), function () use ($q) {
        $found = [];

        // 1. Nominatim with strict Nueva Ecija viewbox bounding
        try {
            $searchQuery = $q;
            if (!stripos($searchQuery, 'nueva ecija') && !stripos($searchQuery, 'santa rosa') && !stripos($searchQuery, 'cabanatuan')) {
                $searchQuery .= ', Nueva Ecija';
            }
            $resp = Http::timeout(4)
                ->withHeaders(['User-Agent' => 'SRH-LINK-TODA/1.0 (admin@srh-link-toda.duckdns.org)'])
                ->get('https://nominatim.openstreetmap.org/search', [
                    'format' => 'json',
                    'q' => $searchQuery,
                    'addressdetails' => 1,
                    'countrycodes' => 'ph',
                    'viewbox' => '120.70,16.15,121.45,15.05',
                    'bounded' => 1,
                    'limit' => 10,
                ]);

            if ($resp->successful()) {
                $data = $resp->json();
                if (is_array($data)) {
                    foreach ($data as $item) {
                        $lat = (float)($item['lat'] ?? 0);
                        $lon = (float)($item['lon'] ?? 0);
                        if ($lat >= 15.05 && $lat <= 16.15 && $lon >= 120.70 && $lon <= 121.45) {
                            $addr = $item['address'] ?? [];
                            $name = $addr['amenity'] ?? $addr['shop'] ?? $addr['building'] ?? $addr['road'] ?? $addr['village'] ?? $addr['suburb'] ?? $item['name'] ?? explode(',', $item['display_name'])[0];
                            $city = $addr['city'] ?? $addr['town'] ?? $addr['municipality'] ?? $addr['county'] ?? 'Santa Rosa';
                            $state = $addr['state'] ?? 'Nueva Ecija';
                            $sub = trim(($addr['road'] ?? $addr['village'] ?? '') . ', ' . $city . ', ' . $state, ', ');

                            $found[] = [
                                'name' => trim($name),
                                'subtitle' => $sub,
                                'display_name' => $item['display_name'] ?? '',
                                'lat' => $lat,
                                'lng' => $lon,
                                'type' => $item['type'] ?? 'place',
                                'class' => $item['class'] ?? 'place',
                            ];
                        }
                    }
                }
            }
        } catch (\Throwable $e) {}

        // 2. Photon Komoot Fallback if Nominatim has few results
        if (count($found) < 3) {
            try {
                $photonResp = Http::timeout(4)
                    ->get('https://photon.komoot.io/api/', [
                        'q' => $q . ' Nueva Ecija',
                        'lat' => 15.42955,
                        'lon' => 120.9224,
                        'zoom' => 11,
                        'limit' => 10,
                    ]);

                if ($photonResp->successful()) {
                    $pData = $photonResp->json();
                    if (isset($pData['features']) && is_array($pData['features'])) {
                        foreach ($pData['features'] as $f) {
                            $coords = $f['geometry']['coordinates'] ?? [0, 0];
                            $lon = (float)($coords[0] ?? 0);
                            $lat = (float)($coords[1] ?? 0);
                            if ($lat >= 15.05 && $lat <= 16.15 && $lon >= 120.70 && $lon <= 121.45) {
                                $props = $f['properties'] ?? [];
                                $name = $props['name'] ?? $props['street'] ?? $props['city'] ?? $q;
                                $city = $props['city'] ?? $props['town'] ?? $props['district'] ?? 'Santa Rosa';
                                $sub = trim(($props['street'] ?? '') . ', ' . $city . ', Nueva Ecija', ', ');

                                $found[] = [
                                    'name' => trim($name),
                                    'subtitle' => $sub,
                                    'lat' => $lat,
                                    'lng' => $lon,
                                    'type' => $props['type'] ?? 'place',
                                    'class' => $props['osm_key'] ?? 'place',
                                ];
                            }
                        }
                    }
                }
            } catch (\Throwable $e) {}
        }

        // Deduplicate results by rounded lat/lng
        $unique = [];
        $seen = [];
        foreach ($found as $item) {
            $key = round($item['lat'], 4) . '_' . round($item['lng'], 4);
            if (!isset($seen[$key])) {
                $seen[$key] = true;
                $unique[] = $item;
            }
        }

        return array_slice($unique, 0, 8);
    });

    return response()->json($results);
})->name('api.geocode.search');

Route::post('/rides', [RideController::class, 'store'])->name('rides.store');
Route::patch('/rides/{ride}/cancel', [RideController::class, 'cancel'])->name('rides.cancel');
Route::patch('/rides/{ride}/accept', [RideController::class, 'accept'])->name('rides.accept');

Route::patch('/rides/{ride}/propose-fare', [App\Http\Controllers\RideController::class, 'proposeFare'])->name('rides.propose-fare');
Route::patch('/rides/{ride}/confirm-fare', [App\Http\Controllers\RideController::class, 'confirmFare'])->name('rides.confirm-fare');

Route::patch('/rides/{ride}/arrived', [App\Http\Controllers\RideController::class, 'arrived'])->name('rides.arrived');
Route::patch('/rides/{ride}/start-transit', [App\Http\Controllers\RideController::class, 'startTransit'])->name('rides.start-transit');
Route::post('/rides/{ride}/rate', [App\Http\Controllers\RideController::class, 'rateRide'])->name('rides.rate');

Route::get('/driver/fetch-queue', [App\Http\Controllers\DriverController::class, 'fetchQueueList'])->name('driver.fetch-queue');

Route::get('/attachments/appeals/{filename}', [\App\Http\Controllers\AttachmentController::class, 'appeal'])
    ->where('filename', '[A-Za-z0-9._-]+')
    ->middleware('auth')
    ->name('attachment.appeal');

Route::get('/branding-logo/{filename}', [\App\Http\Controllers\SuperAdminController::class, 'streamLogo'])
    ->where('filename', '[A-Za-z0-9._-]+')
    ->name('branding.logo.stream');

Route::get('/storage/superadmin/{filename}', [\App\Http\Controllers\SuperAdminController::class, 'streamLogo'])
    ->where('filename', '[A-Za-z0-9._-]+');

Route::delete('/history/clear', [App\Http\Controllers\RideController::class, 'clearHistory'])->name('history.clear');

Route::post('/driver/toggle-status', [App\Http\Controllers\DriverController::class, 'toggleStatus'])->name('driver.toggle-status');
Route::post('/drivers/toggle-status', [App\Http\Controllers\DriverController::class, 'toggleStatus'])->name('drivers.toggle-status');

Route::delete('/history/driver-clear', [App\Http\Controllers\RideController::class, 'clearDriverHistory'])->name('history.driver.clear');

Route::get('/history', [App\Http\Controllers\RideController::class, 'history'])->name('history');

// Passenger Saved Places / Locations (Web Routes)
Route::middleware('auth')->group(function () {
    Route::get('/saved-locations', [App\Http\Controllers\SavedLocationController::class, 'index'])->name('saved-locations.index');
    Route::post('/saved-locations', [App\Http\Controllers\SavedLocationController::class, 'store'])->name('saved-locations.store');
    Route::put('/saved-locations/{savedLocation}', [App\Http\Controllers\SavedLocationController::class, 'update'])->name('saved-locations.update');
    Route::delete('/saved-locations/{savedLocation}', [App\Http\Controllers\SavedLocationController::class, 'destroy'])->name('saved-locations.destroy');
});

Route::get('/rides/{ride}/active', [App\Http\Controllers\RideController::class, 'showActive'])->name('rides.active');

Route::post('/rides/walk-in', [App\Http\Controllers\RideController::class, 'startWalkIn'])->name('rides.walk-in');

Route::get('/driver/check-status', [App\Http\Controllers\DriverController::class, 'checkStatus'])->name('driver.check-status');

Route::get('/driver/incoming-ride', [App\Http\Controllers\DriverController::class, 'incomingRide'])->name('driver.incoming-ride')->middleware('auth');
Route::post('/driver/update-location', [App\Http\Controllers\DriverController::class, 'updateLocation'])->name('driver.update-location')->middleware('auth');

Route::get('/earnings', [App\Http\Controllers\RideController::class, 'earnings'])->name('earnings');
Route::patch('/rides/{ride}/update-fare', [App\Http\Controllers\RideController::class, 'updateFare'])->name('rides.update-fare');
Route::patch('/rides/{ride}/complete', [App\Http\Controllers\RideController::class, 'complete'])->name('rides.complete');
Route::patch('/rides/{ride}/start-returning', [App\Http\Controllers\RideController::class, 'startReturning'])->name('rides.start-returning');
Route::patch('/rides/{ride}/complete-return', [App\Http\Controllers\RideController::class, 'completeReturn'])->name('rides.complete-return');
Route::post('/rides/{ride}/add-passenger', [App\Http\Controllers\RideController::class, 'addPassengerWhileReturning'])->name('rides.add-passenger');
Route::post('/rides/{ride}/update-location', [App\Http\Controllers\RideController::class, 'updateLocation'])->name('rides.update-location');
Route::get('/rides/{ride}/live-location', [App\Http\Controllers\RideController::class, 'getLiveLocation'])->name('rides.live-location');
Route::get('/passenger/ride-status', [App\Http\Controllers\RideController::class, 'passengerStatus'])->name('passenger.ride-status')->middleware('auth');

// Real-time In-App Chat for Active Rides
Route::get('/rides/{ride}/messages', [App\Http\Controllers\ChatController::class, 'getMessages'])->middleware('auth')->name('rides.messages.index');
Route::post('/rides/{ride}/messages', [App\Http\Controllers\ChatController::class, 'sendMessage'])->middleware('auth')->name('rides.messages.store');

Route::get('/admin/fetch-drivers-list', [App\Http\Controllers\DriverController::class, 'fetchAdminDriverList'])->name('admin.fetch-drivers-list');
Route::get('/admin/fetch-reports-html', [App\Http\Controllers\DriverController::class, 'fetchReportsHtml'])->name('admin.fetch-reports-html');

Route::get('/', function () {
    if (auth()->check()) {
        return redirect()->route('dashboard');
    }

    $announcements = \App\Models\Announcement::whereIn('target_audience', ['all', 'passengers', 'drivers'])
        ->where('target_audience', 'not like', 'user_%')
        ->where('title', 'not like', '%Rating%')
        ->where('title', 'not like', '%Rated%')
        ->where('title', 'not like', '%Trip%')
        ->where('title', 'not like', '%Ride%')
        ->latest()
        ->take(3)
        ->get();
    $landing = \App\Support\SystemSettings::landingData();
    return view('welcome', compact('announcements', 'landing'));
})->name('landing');

Route::post('/identity/cancel', function () {
    $user = auth()->user();
    
    $user->role = 'user';
    $user->save();

    \App\Models\Driver::where('user_id', $user->id)->delete();

    return redirect()->route('dashboard');
})->name('identity.cancel');

Route::get('/dashboard', [DashboardController::class, 'index'])
    ->middleware(['auth', 'verified.otp'])
    ->name('dashboard');

Route::post('/identity-selector', function (Illuminate\Http\Request $request) {
    $user = auth()->user();
    if ($user && in_array($user->role, ['user', 'passenger', 'driver'])) {
        $user->update(['role' => $request->role]);
    }
    return redirect()->route('dashboard');
})->name('identity.store');

Route::resource('drivers', DriverController::class)->middleware(['auth', 'verified']);
Route::get('/drivers/{driver}/documents/{type}', [DriverController::class, 'viewDocument'])->middleware(['auth', 'verified'])->name('drivers.documents.show');
Route::patch('/drivers/{driver}/suspend', [DriverController::class, 'suspend'])->name('drivers.suspend');
Route::patch('/drivers/{driver}/unsuspend', [DriverController::class, 'unsuspend'])->name('drivers.unsuspend');
Route::post('/drivers/{driver}/remove-application', [DriverController::class, 'removeApplication'])->middleware(['auth', 'verified'])->name('drivers.remove-application');

Route::get('/live-queue', [\App\Http\Controllers\DriverController::class, 'liveQueue'])->name('drivers.live-queue');
Route::post('/admin/reorder-queue', [DriverController::class, 'reorderQueue'])->middleware(['auth', 'verified'])->name('admin.reorder-queue');
Route::get('/admin/reports/generator', [DriverController::class, 'reportsHub'])->middleware(['auth', 'verified'])->name('admin.reports.generator');
Route::get('/admin/reports/official', [DriverController::class, 'officialReport'])->middleware(['auth', 'verified'])->name('admin.reports.official');
Route::get('/admin/reports/export-csv', [DriverController::class, 'exportReportCsv'])->middleware(['auth', 'verified'])->name('admin.reports.export-csv');

// Standardized duty toggle route for the queue system (includes 35m TODA terminal geofence check)
Route::post('/drivers/toggle-online', [DriverController::class, 'toggleStatus'])
    ->middleware(['auth', 'verified'])
    ->name('drivers.toggle-online');

Route::post('/drivers/appeal', [DriverController::class, 'submitAppeal'])
    ->middleware(['auth', 'verified'])
    ->name('drivers.appeal');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
    Route::get('/user/{user}/avatar', [ProfileController::class, 'avatar'])->name('user.avatar');
    
    // ANNOUNCEMENTS & NOTIFICATIONS
    Route::post('/admin/announcements', [\App\Http\Controllers\AnnouncementController::class, 'store'])->name('admin.announcements.store');
    Route::get('/notifications/fetch', [\App\Http\Controllers\AnnouncementController::class, 'fetchNotifications'])->name('notifications.fetch');
    Route::post('/notifications/mark-read', [\App\Http\Controllers\AnnouncementController::class, 'markAsRead'])->name('notifications.mark-read');
    Route::delete('/announcements/{announcement}', [\App\Http\Controllers\AnnouncementController::class, 'destroy'])->name('announcements.destroy');
    Route::patch('/announcements/{announcement}', [\App\Http\Controllers\AnnouncementController::class, 'update'])->name('announcements.update');
    Route::post('/notifications/clear-all', [\App\Http\Controllers\AnnouncementController::class, 'clearAll'])->name('notifications.clear-all');

    // PASSENGER REPORTS & ADMIN REPORT MANAGEMENT
    Route::post('/reports', [\App\Http\Controllers\ReportController::class, 'store'])->name('reports.store');
    Route::get('/admin/reports', [\App\Http\Controllers\ReportController::class, 'index'])->name('admin.reports.index');
    Route::patch('/admin/reports/{report}/status', [\App\Http\Controllers\ReportController::class, 'updateStatus'])->name('admin.reports.update-status');
    Route::delete('/admin/reports/{report}', [\App\Http\Controllers\ReportController::class, 'destroy'])->name('admin.reports.destroy');

    // WEB PUSH NOTIFICATIONS (work even with the app closed)
    Route::post('/push/subscribe', [\App\Http\Controllers\PushController::class, 'subscribe'])->name('push.subscribe');
    Route::post('/push/unsubscribe', [\App\Http\Controllers\PushController::class, 'unsubscribe'])->name('push.unsubscribe');
    Route::post('/push/test', [\App\Http\Controllers\PushController::class, 'test'])->name('push.test');
});

// Fallback route to serve uploaded storage files when public symlink is missing or blocked
Route::get('/storage/{path}', function ($path) {
    $filePath = storage_path('app/public/' . $path);
    if (!file_exists($filePath)) {
        abort(404);
    }
    $mimeType = @mime_content_type($filePath) ?: 'application/octet-stream';
    return response()->file($filePath, [
        'Content-Type' => $mimeType,
        'Cache-Control' => 'public, max-age=86400',
    ]);
})->where('path', '.*');

// STANDALONE SUPERADMIN PANEL (srh-link-toda.duckdns.org/superadmin)
// Fully isolated from the main app: own session flag, own views, own auth.
Route::prefix('superadmin')->name('superadmin.')->group(function () {
    Route::get('/', [App\Http\Controllers\SuperAdminController::class, 'showLogin'])->name('login');
    Route::post('/', [App\Http\Controllers\SuperAdminController::class, 'login'])->name('authenticate');
    Route::post('/logout', [App\Http\Controllers\SuperAdminController::class, 'logout'])->name('logout');

    Route::middleware('superadmin')->group(function () {
        Route::get('/dashboard', [App\Http\Controllers\SuperAdminController::class, 'dashboard'])->name('dashboard');
        Route::post('/logs/clear', [App\Http\Controllers\SuperAdminController::class, 'clearLog'])->name('logs.clear');
        Route::get('/logs/{file}/download', [App\Http\Controllers\SuperAdminController::class, 'downloadLog'])->name('logs.download')
            ->where('file', 'laravel|superadmin');
        Route::post('/branding', [App\Http\Controllers\SuperAdminController::class, 'updateBranding'])->name('branding.update');
        Route::post('/branding/remove-logo', [App\Http\Controllers\SuperAdminController::class, 'removeLogo'])->name('branding.remove-logo');
        Route::post('/landing-cms', [App\Http\Controllers\SuperAdminController::class, 'updateLandingCms'])->name('landing-cms.update');
        Route::post('/security', [App\Http\Controllers\SuperAdminController::class, 'updateSecurity'])->name('security.update');

        // USER MANAGEMENT
        Route::get('/users', [App\Http\Controllers\SuperAdmin\UsersController::class, 'index'])->name('users');
        Route::post('/users/{userId}/role', [App\Http\Controllers\SuperAdmin\UsersController::class, 'updateRole'])->name('users.update-role');
        Route::post('/users/{userId}/toggle-active', [App\Http\Controllers\SuperAdmin\UsersController::class, 'toggleActive'])->name('users.toggle-active');
        Route::post('/users/{userId}/delete', [App\Http\Controllers\SuperAdmin\UsersController::class, 'destroy'])->name('users.delete');

        // SESSION MANAGEMENT
        Route::get('/sessions', [App\Http\Controllers\SuperAdmin\SessionsController::class, 'index'])->name('sessions');
        Route::post('/sessions/{sessionId}/revoke', [App\Http\Controllers\SuperAdmin\SessionsController::class, 'revoke'])->name('sessions.revoke');
        Route::post('/sessions/clear-expired', [App\Http\Controllers\SuperAdmin\SessionsController::class, 'clearExpired'])->name('sessions.clear-expired');

        // ACTIVITY AUDIT TRAIL
        Route::get('/activity', [App\Http\Controllers\SuperAdmin\ActivityController::class, 'index'])->name('activity');
        Route::post('/activity/clear', [App\Http\Controllers\SuperAdmin\ActivityController::class, 'clear'])->name('activity.clear');

        // MODERATION (reports & rides)
        Route::get('/reports', [App\Http\Controllers\SuperAdmin\ModerationController::class, 'reports'])->name('reports');
        Route::post('/reports/{reportId}/status', [App\Http\Controllers\SuperAdmin\ModerationController::class, 'updateReportStatus'])->name('reports.update-status');
        Route::get('/rides', [App\Http\Controllers\SuperAdmin\ModerationController::class, 'rides'])->name('rides');

        // ANNOUNCEMENTS & PUSH NOTIFICATIONS
        Route::get('/announcements', [App\Http\Controllers\SuperAdmin\ContentController::class, 'announcements'])->name('announcements');
        Route::post('/announcements', [App\Http\Controllers\SuperAdmin\ContentController::class, 'createAnnouncement'])->name('announcements.store');
        Route::post('/announcements/clear-all', [App\Http\Controllers\SuperAdmin\ContentController::class, 'clearAllAnnouncements'])->name('announcements.clear-all');
        Route::post('/announcements/{announcementId}/delete', [App\Http\Controllers\SuperAdmin\ContentController::class, 'deleteAnnouncement'])->name('announcements.delete');
        Route::get('/notifications', [App\Http\Controllers\SuperAdmin\ContentController::class, 'notifications'])->name('notifications');
        Route::post('/notifications/send', [App\Http\Controllers\SuperAdmin\ContentController::class, 'sendNotification'])->name('notifications.send');

        // SYSTEM HEALTH
        Route::get('/health', [App\Http\Controllers\SuperAdmin\HealthController::class, 'index'])->name('health');
        Route::post('/health/maintenance', [App\Http\Controllers\SuperAdmin\HealthController::class, 'toggleMaintenance'])->name('health.maintenance');
    });
});

require __DIR__.'/auth.php';
