<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\OtpService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;

class OtpVerificationController extends Controller
{
    /**
     * Display the Email OTP verification view.
     */
    public function show(Request $request): View|RedirectResponse
    {
        $user = Auth::user();

        if ($user->isVerified()) {
            return redirect()->route('dashboard');
        }

        // If user doesn't have an active OTP, generate one
        if (!$user->otp_code || !$user->otp_expires_at || $user->otp_expires_at->isPast()) {
            OtpService::generateAndSend($user);
        }

        return view('auth.verify-otp', compact('user'));
    }

    /**
     * Process Email OTP verification submission.
     */
    public function verify(Request $request): RedirectResponse
    {
        $user = Auth::user();

        if ($user->isVerified()) {
            return redirect()->route('dashboard');
        }

        // Support array of digits or single string
        $enteredOtp = $request->input('otp');
        if (is_array($enteredOtp)) {
            $enteredOtp = implode('', $enteredOtp);
        }
        $enteredOtp = trim((string) $enteredOtp);

        $request->validate([
            'otp' => 'required',
        ]);

        if (!$user->otp_code || !$user->otp_expires_at) {
            return back()->with('error', 'No active verification code found. Please tap Resend Verification Email.');
        }

        if ($user->otp_expires_at->isPast()) {
            return back()->with('error', 'The 6-digit verification code has expired. Please tap Resend Verification Email.');
        }

        if ($enteredOtp !== $user->otp_code) {
            return back()->with('error', 'Invalid 6-digit verification code. Please check your email and try again.');
        }

        // Mark email verified
        $user->email_verified_at = now();
        $user->otp_code = null;
        $user->otp_expires_at = null;
        $user->save();

        return redirect()->route('dashboard')->with('status', 'Email address verified successfully! Welcome to SRH LINK-TODA.');
    }

    /**
     * Resend a fresh 6-digit Email OTP code.
     */
    public function resend(Request $request): RedirectResponse
    {
        $user = Auth::user();

        if ($user->isVerified()) {
            return redirect()->route('dashboard');
        }

        OtpService::generateAndSend($user);

        return back()->with('status', "A new 6-digit verification code has been sent to your email address ({$user->email}).");
    }
}
