<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes for Mobile / Ionic Frontend
|--------------------------------------------------------------------------
*/

Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/check-field', [AuthController::class, 'checkField']);
    Route::get('/user', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::put('/profile', [AuthController::class, 'updateProfile']);
    Route::put('/password', [AuthController::class, 'updatePassword']);
    Route::post('/avatar', [AuthController::class, 'uploadAvatar']);
});

Route::prefix('home')->group(function () {
    Route::get('/dashboard', [DashboardController::class, 'getDashboard']);
});

Route::prefix('rides')->group(function () {
    Route::get('/history', [DashboardController::class, 'getRideHistory']);
});

Route::prefix('driver')->group(function () {
    Route::get('/earnings', [DashboardController::class, 'getEarningsSummary']);
    Route::post('/toggle-duty', [DashboardController::class, 'toggleDriverDuty']);
    Route::post('/start-walkin', [DashboardController::class, 'startWalkIn']);
    Route::post('/complete-dropoff', [DashboardController::class, 'completeDropOff']);
    Route::post('/start-wayside', [DashboardController::class, 'startWayside']);
    Route::post('/return-terminal', [DashboardController::class, 'returnToTerminal']);
    Route::post('/update-location', [DashboardController::class, 'updateLocation']);
});

Route::prefix('admin')->group(function () {
    Route::get('/overview', [DashboardController::class, 'getAdminOverview']);
    Route::post('/driver-compliance', [DashboardController::class, 'updateDriverCompliance']);
    Route::post('/resolve-report', [DashboardController::class, 'resolveReport']);
    Route::post('/announcement', [DashboardController::class, 'createAnnouncement']);
    Route::post('/reorder-queue', [DashboardController::class, 'reorderQueue']);
    Route::post('/remove-from-queue', [DashboardController::class, 'removeFromQueue']);
});

Route::get('/map-style', function () {
    $style = Cache::remember('srh_maptiler_style_v8', now()->addHours(24), function () {
        $key = config('services.maptiler.key');
        $url = 'https://api.maptiler.com/maps/' . config('services.maptiler.style')
            . '/style.json?key=' . $key;
        $response = Http::timeout(15)->get($url);
        abort_unless($response->successful(), 502, 'Map style unavailable.');
        $style = $response->json();

        $style['sprite'] = url('/map-assets/sprites/sprite');
        $style['glyphs'] = 'https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=' . $key;

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
    ]);
});
