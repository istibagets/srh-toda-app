<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Foundation\Http\Middleware\PreventRequestsDuringMaintenance;

// Keep the superadmin panel reachable while maintenance mode is active,
// so the app can always be brought back online. The maintenance-status
// probe also stays live so open app pages detect the change instantly.
PreventRequestsDuringMaintenance::except([
    'superadmin*',
    'api/superadmin*',
    'maintenance-status',
    'api/maintenance-status',
    'broadcasting/*',
    'api/broadcasting/*',
    'up',
    'api/up',
]);

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->preventRequestsDuringMaintenance(except: [
            'superadmin*',
            'api/superadmin*',
            'maintenance-status',
            'api/maintenance-status',
            'broadcasting/*',
            'api/broadcasting/*',
            'up',
            'api/up',
        ]);
        $middleware->web(append: [
            \App\Http\Middleware\PreventBackHistory::class,
        ]);
        $middleware->alias([
            'verified.otp' => \App\Http\Middleware\EnsureAccountVerified::class,
            'prevent.back.history' => \App\Http\Middleware\PreventBackHistory::class,
            'superadmin' => \App\Http\Middleware\EnsureSuperAdmin::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
