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

Route::get('/maintenance-status', function () {
    $isDown = app()->isDownForMaintenance() || file_exists(storage_path('framework/down'));
    return response()->json([
        'status'         => 'success',
        'is_maintenance' => (bool) $isDown,
        'active'         => (bool) $isDown,
        'message'        => $isDown ? 'System is currently under maintenance.' : 'System is operational.',
    ]);
});

Route::get('/landmarks', function () {
    return response()->json([
        'status'    => 'success',
        'landmarks' => \App\Support\SystemSettings::getLandmarks(),
    ]);
});

Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/check-field', [AuthController::class, 'checkField']);
    Route::get('/user', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::put('/profile', [AuthController::class, 'updateProfile']);
    Route::put('/password', [AuthController::class, 'updatePassword']);
    Route::post('/avatar', [AuthController::class, 'uploadAvatar']);
    Route::delete('/account', [AuthController::class, 'deleteAccount']);
});

Route::prefix('home')->group(function () {
    Route::get('/dashboard', [DashboardController::class, 'getDashboard']);
});

Route::prefix('rides')->group(function () {
    Route::get('/history', [DashboardController::class, 'getRideHistory']);
    Route::post('/request', [DashboardController::class, 'requestPassengerRide']);
    Route::get('/active', [DashboardController::class, 'getActiveRide']);
    Route::post('/{ride}/propose-fare', [DashboardController::class, 'proposeFare']);
    Route::post('/{ride}/accept-fare', [DashboardController::class, 'acceptFare']);
    Route::post('/{ride}/driver-arrived', [DashboardController::class, 'driverArrived']);
    Route::post('/{ride}/start-trip', [DashboardController::class, 'startTrip']);
    Route::get('/{ride}/messages', [DashboardController::class, 'getChatMessages']);
    Route::post('/{ride}/messages', [DashboardController::class, 'sendChatMessage']);
    Route::post('/{ride}/cancel', [DashboardController::class, 'cancelRide']);
    Route::post('/{ride}/rate', [DashboardController::class, 'rateRide']);
    Route::post('/{ride}/report', [DashboardController::class, 'reportDriver']);
});

Route::prefix('saved-locations')->group(function () {
    Route::get('/', [\App\Http\Controllers\SavedLocationController::class, 'apiList']);
    Route::post('/', [\App\Http\Controllers\SavedLocationController::class, 'store']);
    Route::put('/{savedLocation}', [\App\Http\Controllers\SavedLocationController::class, 'update']);
    Route::delete('/{savedLocation}', [\App\Http\Controllers\SavedLocationController::class, 'destroy']);
    Route::post('/quick-save', [\App\Http\Controllers\SavedLocationController::class, 'quickSave']);
});

Route::prefix('driver')->group(function () {
    Route::get('/earnings', [DashboardController::class, 'getEarningsSummary']);
    Route::post('/toggle-duty', [DashboardController::class, 'toggleDriverDuty']);
    Route::post('/start-walkin', [DashboardController::class, 'startWalkIn']);
    Route::post('/complete-dropoff', [DashboardController::class, 'completeDropOff']);
    Route::post('/start-wayside', [DashboardController::class, 'startWayside']);
    Route::post('/return-terminal', [DashboardController::class, 'returnToTerminal']);
    Route::post('/update-location', [DashboardController::class, 'updateLocation']);
    Route::post('/appeal', [\App\Http\Controllers\DriverController::class, 'submitAppeal']);
});

Route::post('/drivers/appeal', [\App\Http\Controllers\DriverController::class, 'submitAppeal']);

Route::prefix('admin')->group(function () {
    Route::get('/overview', [DashboardController::class, 'getAdminOverview']);
    Route::post('/driver-compliance', [DashboardController::class, 'updateDriverCompliance']);
    Route::post('/resolve-report', [DashboardController::class, 'resolveReport']);
    Route::post('/announcement', [DashboardController::class, 'createAnnouncement']);
    Route::post('/reorder-queue', [DashboardController::class, 'reorderQueue']);
    Route::post('/remove-from-queue', [DashboardController::class, 'removeFromQueue']);
    Route::post('/reset-driver-trip', [DashboardController::class, 'resetDriverTrip']);
});

Route::prefix('superadmin')->group(function () {
    Route::post('/login', [\App\Http\Controllers\Api\SuperAdminApiController::class, 'login']);
    Route::get('/overview', [\App\Http\Controllers\Api\SuperAdminApiController::class, 'getOverview']);
    Route::get('/users', [\App\Http\Controllers\Api\SuperAdminApiController::class, 'getUsers']);
    Route::post('/users', [\App\Http\Controllers\Api\SuperAdminApiController::class, 'createUser']);
    Route::put('/users/{id}', [\App\Http\Controllers\Api\SuperAdminApiController::class, 'updateUser']);
    Route::post('/users/{id}', [\App\Http\Controllers\Api\SuperAdminApiController::class, 'updateUser']);
    Route::post('/users/{id}/role', [\App\Http\Controllers\Api\SuperAdminApiController::class, 'updateUserRole']);
    Route::post('/users/{id}/toggle-status', [\App\Http\Controllers\Api\SuperAdminApiController::class, 'toggleUserStatus']);
    Route::delete('/users/{id}', [\App\Http\Controllers\Api\SuperAdminApiController::class, 'deleteUser']);
    Route::get('/cms', [\App\Http\Controllers\Api\SuperAdminApiController::class, 'getCmsData']);
    Route::post('/cms/update', [\App\Http\Controllers\Api\SuperAdminApiController::class, 'updateCmsData']);
    Route::get('/logs', [\App\Http\Controllers\Api\SuperAdminApiController::class, 'getActivityLogs']);
    Route::post('/system/clear-cache', [\App\Http\Controllers\Api\SuperAdminApiController::class, 'clearCache']);
    Route::post('/system/toggle-maintenance', [\App\Http\Controllers\Api\SuperAdminApiController::class, 'toggleMaintenance']);
});

Route::prefix('push')->group(function () {
    Route::post('/subscribe', [\App\Http\Controllers\PushController::class, 'subscribe']);
    Route::post('/unsubscribe', [\App\Http\Controllers\PushController::class, 'unsubscribe']);
    Route::post('/test', [\App\Http\Controllers\PushController::class, 'test']);
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
