<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Services\ActivityLogger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

class AuthenticatedSessionController extends Controller
{
    /**
     * Display the login view.
     */
    public function create(): View
    {
        return view('auth.login');
    }

    /**
     * Handle an incoming authentication request.
     */
    public function store(LoginRequest $request): RedirectResponse
    {
        // iniintercept at vinavalidate ung data by loginrequest
        try {
            $request->authenticate();
        } catch (ValidationException $e) {
            ActivityLogger::log('login_failed', null, ['email' => (string) $request->input('email')]);
            throw $e;
        }

        // pag valid, secure ung session
        $request->session()->regenerate();

        $user = Auth::user();

        if ($user && $user->is_active === false) {
            ActivityLogger::log('login_blocked', $user->id, ['reason' => 'account_deactivated']);
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            throw ValidationException::withMessages([
                'email' => 'Your account has been deactivated. Contact the administrator.',
            ]);
        }

        ActivityLogger::log('login', $user?->id);

        return redirect()->intended(route('dashboard', absolute: false));
    }

    /**
     * Destroy an authenticated session.
     */
    public function destroy(Request $request): RedirectResponse
{
    // Record the logout before the session is wiped
    ActivityLogger::log('logout', auth()->id());

    $driver = \App\Models\Driver::where('user_id', auth()->id())->first();

    if ($driver) {
        // Store the position before we wipe it
        $oldPosition = $driver->queue_position;

        // Set driver offline
        $driver->update([
            'is_online' => false,
            'queue_position' => null
        ]);

        // Only shift the queue if the driver actually had a position
        if ($oldPosition !== null) {
            \App\Models\Driver::where('is_online', true)
                ->where('queue_position', '>', $oldPosition)
                ->decrement('queue_position');
        }
    }

    // Remove web-push subscriptions on logout
    \App\Models\PushSubscription::where('user_id', auth()->id())->delete();

    // Standard logout process
    auth()->guard('web')->logout();
    $request->session()->invalidate();
    $request->session()->regenerateToken();

    return redirect('/')
        ->header('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate')
        ->header('Pragma', 'no-cache')
        ->header('Expires', 'Sun, 02 Jan 1990 00:00:00 GMT');
}
}
