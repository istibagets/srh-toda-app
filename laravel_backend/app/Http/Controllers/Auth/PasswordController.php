<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class PasswordController extends Controller
{
    /**
     * Update the user's password.
     */
    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validateWithBag('updatePassword', [
            'current_password' => ['required', 'current_password'],
            'password' => [
                 'required', 
                 \Illuminate\Validation\Rules\Password::min(8) // Minimum 8 characters
                     ->symbols()                               // Must have at least one special character (!@#$%^&*)
                       ->mixedCase()                             // (Bonus) Must have uppercase and lowercase
                      ->numbers(),                              // (Bonus) Must have at least one number
                  'confirmed'
            ],
        ]);

        $request->user()->update([
            'password' => Hash::make($validated['password']),
        ]);

        return back()->with('status', 'password-updated');
    }
}
