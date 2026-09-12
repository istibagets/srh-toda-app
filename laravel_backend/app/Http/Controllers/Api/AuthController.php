<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Driver;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Authenticate user and return an API bearer token.
     */
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email'    => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        $credentials = $request->only('email', 'password');

        try {
            if (!Auth::validate($credentials)) {
                ActivityLogger::log('login_failed', null, ['email' => (string) $request->input('email')]);
                return response()->json([
                    'status'  => 'error',
                    'message' => 'The provided credentials do not match our records.',
                ], 422);
            }

            $user = User::where('email', $request->email)->first();
        } catch (\Illuminate\Database\QueryException $e) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Database connection failed. Please make sure MySQL is started in Laragon.',
            ], 503);
        }

        if (!$user) {
            return response()->json([
                'status'  => 'error',
                'message' => 'User not found.',
            ], 404);
        }

        if ($user->is_active === false) {
            ActivityLogger::log('login_blocked', $user->id, ['reason' => 'account_deactivated']);
            return response()->json([
                'status'  => 'error',
                'message' => 'Your account has been deactivated. Contact the administrator.',
            ], 403);
        }

        // Generate a 64-character bearer token valid for 60 days
        $token = 'srh_' . Str::random(60);
        $user->update(['remember_token' => $token]);
        Cache::put('api_token_' . $token, $user->id, now()->addDays(60));

        ActivityLogger::log('login', $user->id);

        $driver = null;
        if ($user->role === 'driver') {
            $driver = Driver::where('user_id', $user->id)->first();
        }

        return response()->json([
            'status'  => 'success',
            'message' => 'Login successful.',
            'token'   => $token,
            'user'    => [
                'id'                   => $user->id,
                'name'                 => $user->name,
                'email'                => $user->email,
                'phone_number'         => $user->phone_number,
                'role'                 => $user->role,
                'is_active'            => (bool) $user->is_active,
                'avatar_url'           => $user->avatar_url,
                'verification_channel' => $user->verification_channel,
                'is_verified'          => $user->isVerified(),
                'driver_profile'       => $driver ? [
                    'id'                   => $driver->id,
                    'full_name'            => $driver->full_name,
                    'mtop_number'          => $driver->mtop_number,
                    'compliance_status'    => $driver->compliance_status,
                    'is_online'            => (bool) $driver->is_online,
                    'queue_position'       => $driver->queue_position,
                    'mtop_certificate_url' => $driver->mtop_certificate_url ? asset('storage/' . $driver->mtop_certificate_url) : null,
                    'drivers_license_url'  => $driver->drivers_license_url ? asset('storage/' . $driver->drivers_license_url) : null,
                ] : null,
            ],
        ]);
    }

    /**
     * Register a new passenger or driver account.
     */
    public function register(Request $request): JsonResponse
    {
        $role = $request->input('role', 'passenger');

        $rules = [
            'name'         => ['required', 'string', 'max:255'],
            'email'        => ['required', 'string', 'lowercase', 'email', 'max:255', 'unique:' . User::class],
            'phone_number' => ['required', 'digits:11', 'unique:' . User::class],
            'password'     => ['required', 'confirmed', Password::defaults()],
            'role'         => ['required', 'in:passenger,driver'],
        ];

        if ($role === 'driver') {
            $rules['full_name']        = ['required', 'string', 'max:255'];
            $rules['mtop_number']      = ['required', 'string', 'max:6'];
            $rules['mtop_certificate'] = ['required', 'file', 'mimes:jpg,jpeg,png,webp,heic,heif,pdf,doc,docx', 'max:20480'];
            $rules['drivers_license']  = ['required', 'file', 'mimes:jpg,jpeg,png,webp,heic,heif,pdf,doc,docx', 'max:20480'];
        }

        $validated = $request->validate($rules);

        try {
            // Create the User record
            $user = User::create([
                'name'                 => $validated['name'],
                'email'                => $validated['email'],
                'phone_number'         => $validated['phone_number'],
                'verification_channel' => 'email',
                'password'             => Hash::make($validated['password']),
                'role'                 => $role === 'driver' ? 'driver' : 'passenger',
                'is_active'            => true,
            ]);

            $driver = null;
            if ($role === 'driver') {
                $mtopPath    = $request->file('mtop_certificate')->store('driver-docs', 'public');
                $licensePath = $request->file('drivers_license')->store('driver-docs', 'public');

                $driver = Driver::create([
                    'user_id'              => $user->id,
                    'full_name'            => $validated['full_name'],
                    'mtop_number'          => $validated['mtop_number'],
                    'mtop_certificate_url' => $mtopPath,
                    'drivers_license_url'  => $licensePath,
                    'compliance_status'    => 'Pending',
                    'is_online'            => false,
                ]);

                try {
                    broadcast(new \App\Events\DriverApplicantUpdated($driver->id, 'registered'));
                } catch (\Throwable $e) {}
            }
        } catch (\Illuminate\Database\QueryException $e) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Database error during registration. Please ensure MySQL is started in Laragon.',
            ], 503);
        }

        ActivityLogger::log('register', $user->id);

        // Generate token
        $token = 'srh_' . Str::random(60);
        $user->update(['remember_token' => $token]);
        Cache::put('api_token_' . $token, $user->id, now()->addDays(60));

        return response()->json([
            'status'  => 'success',
            'message' => 'Account registered successfully.',
            'token'   => $token,
            'user'    => [
                'id'                   => $user->id,
                'name'                 => $user->name,
                'email'                => $user->email,
                'phone_number'         => $user->phone_number,
                'role'                 => $user->role,
                'is_active'            => (bool) $user->is_active,
                'avatar_url'           => $user->avatar_url,
                'is_verified'          => $user->isVerified(),
                'driver_profile'       => $driver ? [
                    'id'                => $driver->id,
                    'full_name'         => $driver->full_name,
                    'mtop_number'       => $driver->mtop_number,
                    'compliance_status' => $driver->compliance_status,
                    'is_online'         => (bool) $driver->is_online,
                ] : null,
            ],
        ], 201);
    }

    /**
     * Check if email or phone number is available.
     */
    public function checkField(Request $request): JsonResponse
    {
        $field = $request->input('field');
        $value = trim((string) $request->input('value', ''));

        if (!in_array($field, ['email', 'phone_number']) || empty($value)) {
            return response()->json(['available' => true]);
        }

        $taken = User::where($field, $value)->exists();
        return response()->json([
            'field'     => $field,
            'value'     => $value,
            'available' => !$taken,
        ]);
    }

    /**
     * Get the authenticated user's profile.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);

        if (!$user) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Unauthenticated.',
            ], 401);
        }

        $driver = null;
        if ($user->role === 'driver') {
            $driver = Driver::where('user_id', $user->id)->first();
        }

        return response()->json([
            'status' => 'success',
            'user'   => [
                'id'             => $user->id,
                'name'           => $user->name,
                'email'          => $user->email,
                'phone_number'   => $user->phone_number,
                'role'           => $user->role,
                'is_active'      => (bool) $user->is_active,
                'avatar_url'     => $user->avatar_url,
                'is_verified'    => $user->isVerified(),
                'driver_profile' => $driver ? [
                    'id'                   => $driver->id,
                    'full_name'            => $driver->full_name,
                    'mtop_number'          => $driver->mtop_number,
                    'compliance_status'    => $driver->compliance_status,
                    'is_online'            => (bool) $driver->is_online,
                    'queue_position'       => $driver->queue_position,
                    'mtop_certificate_url' => $driver->mtop_certificate_url ? asset('storage/' . $driver->mtop_certificate_url) : null,
                    'drivers_license_url'  => $driver->drivers_license_url ? asset('storage/' . $driver->drivers_license_url) : null,
                ] : null,
            ],
        ]);
    }

    /**
     * Invalidate session / log out.
     */
    public function logout(Request $request): JsonResponse
    {
        $token = $request->bearerToken();
        if ($token) {
            $user = $this->resolveUser($request);
            if ($user) {
                $user->update(['remember_token' => null]);

                $driver = Driver::where('user_id', $user->id)->first();
                if ($driver) {
                    $oldPosition = $driver->queue_position;
                    $driver->update([
                        'is_online'        => false,
                        'queue_position'   => null,
                        'queue_joined_at'  => null,
                    ]);

                    if ($oldPosition !== null) {
                        Driver::where('is_online', true)
                            ->where('queue_position', '>', $oldPosition)
                            ->decrement('queue_position');
                    }
                }
            }
            Cache::forget('api_token_' . $token);
        }

        return response()->json([
            'status'  => 'success',
            'message' => 'Logged out successfully.',
        ]);
    }

    /**
     * Update basic profile information.
     */
    public function updateProfile(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $validated = $request->validate([
            'name'         => ['required', 'string', 'max:255'],
            'phone_number' => ['required', 'digits:11', 'unique:users,phone_number,' . $user->id],
        ]);

        $user->update($validated);

        return response()->json([
            'status'  => 'success',
            'message' => 'Profile updated successfully.',
            'user'    => [
                'id'           => $user->id,
                'name'         => $user->name,
                'email'        => $user->email,
                'phone_number' => $user->phone_number,
                'role'         => $user->role,
                'avatar_url'   => $user->avatar_url,
            ],
        ]);
    }

    /**
     * Change user password.
     */
    public function updatePassword(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $request->validate([
            'current_password' => ['required', 'string'],
            'password'         => ['required', 'confirmed', Password::defaults()],
        ]);

        if (!Hash::check($request->current_password, $user->password)) {
            return response()->json([
                'status'  => 'error',
                'message' => 'The current password you entered is incorrect.',
            ], 422);
        }

        $user->update([
            'password' => Hash::make($request->password),
        ]);

        return response()->json([
            'status'  => 'success',
            'message' => 'Password updated successfully.',
        ]);
    }

    /**
     * Upload and update user avatar photo.
     */
    public function uploadAvatar(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        $request->validate([
            'photo' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        $path = $request->file('photo')->store('profile-photos', 'public');
        $user->update(['profile_photo_url' => $path]);

        return response()->json([
            'status'     => 'success',
            'message'    => 'Profile photo uploaded successfully.',
            'avatar_url' => asset('storage/' . $path),
        ]);
    }

    /**
     * Permanently delete user account and associated credentials.
     */
    public function deleteAccount(Request $request): JsonResponse
    {
        $user = $this->resolveUser($request);
        if (!$user) {
            return response()->json(['status' => 'error', 'message' => 'Unauthenticated.'], 401);
        }

        if ($user->role === 'superadmin') {
            return response()->json(['status' => 'error', 'message' => 'Superadmin account cannot be deleted.'], 403);
        }

        $token = $request->bearerToken();
        if ($token) {
            Cache::forget('api_token_' . $token);
        }

        // If driver profile exists, remove queue / driver profile
        if ($user->driverProfile) {
            $user->driverProfile->delete();
        }

        ActivityLogger::log('account_deleted', $user->id, ['email' => $user->email]);

        $user->delete();

        return response()->json([
            'status'  => 'success',
            'message' => 'Your account has been deleted permanently.',
        ]);
    }

    /**
     * Helper to resolve user from Bearer token with permanent fallback.
     */
    private function resolveUser(Request $request): ?User
    {
        $token = $request->bearerToken();
        if (!$token) {
            return null;
        }

        // 1. Try cache first for fast in-memory resolution
        $userId = Cache::get('api_token_' . $token);
        if ($userId) {
            $user = User::find($userId);
            if ($user) {
                return $user;
            }
        }

        // 2. Persistent fallback to remember_token in database
        $user = User::where('remember_token', $token)->first();
        if ($user) {
            Cache::put('api_token_' . $token, $user->id, now()->addDays(60));
            return $user;
        }

        return null;
    }
}
