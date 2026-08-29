<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Driver;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

class RegisteredUserController extends Controller
{
    /**
     * Display the registration view.
     */
    public function create(): View
    {
        return view('auth.register');
    }

    /**
     * Handle an incoming registration request.
     *
     * @throws ValidationException
     */
    public function store(Request $request): RedirectResponse
    {
        $role = $request->input('role', 'passenger');

        // Base validation rules
        $rules = [
            'name'         => ['required', 'string', 'max:255'],
            'email'        => ['required', 'string', 'lowercase', 'email', 'max:255', 'unique:' . User::class],
            'phone_number' => ['required', 'digits:11', 'unique:' . User::class],
            'password'     => ['required', 'confirmed', Rules\Password::defaults()],
            'role'         => ['required', 'in:passenger,driver'],
        ];

        // Extra validation for driver applicants
        if ($role === 'driver') {
            $rules['full_name']        = ['required', 'string', 'max:255'];
            $rules['mtop_number']      = ['required', 'string', 'max:6'];
            $rules['mtop_certificate'] = ['required', 'file', 'mimes:jpg,jpeg,png,webp,heic,heif,pdf,doc,docx', 'max:20480'];
            $rules['drivers_license']  = ['required', 'file', 'mimes:jpg,jpeg,png,webp,heic,heif,pdf,doc,docx', 'max:20480'];
        }

        $request->validate($rules);

        // Create the user
        $user = User::create([
            'name'                 => $request->name,
            'email'                => $request->email,
            'phone_number'         => $request->phone_number,
            'verification_channel' => 'email',
            'password'             => Hash::make($request->password),
            'role'                 => $role === 'driver' ? 'driver' : 'passenger',
        ]);

        // If registering as a driver, create the Driver record with uploaded documents
        if ($role === 'driver') {
            $mtopPath    = $request->file('mtop_certificate')->store('driver-docs', 'public');
            $licensePath = $request->file('drivers_license')->store('driver-docs', 'public');

            $driver = Driver::create([
                'user_id'              => $user->id,
                'full_name'            => $request->full_name,
                'mtop_number'          => $request->mtop_number,
                'mtop_certificate_url' => $mtopPath,
                'drivers_license_url'  => $licensePath,
                'compliance_status'    => 'Pending',
                'is_online'            => false,
            ]);

            try {
                broadcast(new \App\Events\DriverApplicantUpdated($driver->id, 'registered'));
            } catch (\Throwable $e) {}
        }

        event(new Registered($user));

        Auth::login($user, true);

        ActivityLogger::log('register', $user->id);

        // Send OTP verification
        \App\Services\OtpService::generateAndSend($user);

        return redirect()->route('verification.otp');
    }
}
