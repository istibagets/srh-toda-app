<?php

namespace App\Services;

use App\Models\User;
use App\Notifications\SendOtpNotification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;

class OtpService
{
    /**
     * Generate a 6-digit Email Verification OTP and send it to the user.
     */
    public static function generateAndSend(User $user): string
    {
        // Generate 6-digit OTP
        $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $user->forceFill([
            'verification_channel' => 'email',
            'otp_code' => $otp,
            'otp_expires_at' => now()->addMinutes(10),
        ])->save();

        // Log Email OTP for local dev/debugging
        Log::info("=== EMAIL VERIFICATION OTP FOR {$user->email} ===: {$otp}");

        // Dispatch Email Notification
        try {
            $user->notify(new SendOtpNotification($otp));
        } catch (\Throwable $e) {
            Log::error('Email OTP notification dispatch error: ' . $e->getMessage());
        }

        return $otp;
    }
}
