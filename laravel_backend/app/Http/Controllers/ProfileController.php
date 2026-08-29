<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProfileUpdateRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Redirect;
use Illuminate\View\View;

class ProfileController extends Controller
{
    /**
     * Display the user's profile form.
     */
    public function edit(Request $request): View
    {
        return view('profile.edit', [
            'user' => $request->user(),
        ]);
    }

    /**
     * Update the user's profile information.
     */
    public function update(ProfileUpdateRequest $request): RedirectResponse
    {
        $user = $request->user();

        $user->fill($request->safe()->only(['name', 'email']));

        if ($user->isDirty('email')) {
            $user->email_verified_at = null;
        }

        // Handle Profile Photo Removal or Upload (Gallery or Camera)
        if ($request->boolean('remove_photo')) {
            if ($user->profile_photo_url) {
                \Illuminate\Support\Facades\Storage::disk('public')->delete($user->profile_photo_url);
            }
            $user->forceFill(['profile_photo_url' => null]);
        } elseif ($request->hasFile('profile_photo') || $request->hasFile('camera_photo')) {
            if ($user->profile_photo_url) {
                \Illuminate\Support\Facades\Storage::disk('public')->delete($user->profile_photo_url);
            }
            $file = $request->file('profile_photo') ?? $request->file('camera_photo');
            $path = $file->store('profile-photos', 'public');
            $user->forceFill(['profile_photo_url' => $path]);
        }

        $user->save();

        return Redirect::route('profile.edit')->with('status', 'profile-updated');
    }

    /**
     * Stream compressed user profile photo avatar image directly (max 200x200 WebP/JPEG < 50KB).
     */
    public function avatar(\App\Models\User $user)
    {
        if ($user->profile_photo_url) {
            $possiblePaths = [
                storage_path('app/public/' . $user->profile_photo_url),
                storage_path('app/' . $user->profile_photo_url),
                public_path('storage/' . $user->profile_photo_url),
            ];

            foreach ($possiblePaths as $fullPath) {
                if (file_exists($fullPath)) {
                    $ts = optional($user->updated_at)->timestamp ?: filemtime($fullPath);
                    $cacheDir = storage_path('app/cache/avatars');
                    if (!is_dir($cacheDir)) {
                        @mkdir($cacheDir, 0755, true);
                    }

                    $supportsWebp = function_exists('imagewebp');
                    $ext = $supportsWebp ? 'webp' : 'jpg';
                    $mimeType = $supportsWebp ? 'image/webp' : 'image/jpeg';
                    $thumbPath = $cacheDir . '/' . $user->id . '_' . $ts . '.' . $ext;

                    if (file_exists($thumbPath) && filesize($thumbPath) > 0) {
                        return response()->file($thumbPath, [
                            'Content-Type' => $mimeType,
                            'Cache-Control' => 'public, max-age=86400, stale-while-revalidate=604800',
                            'Content-Disposition' => 'inline',
                        ]);
                    }

                    // Generate compressed max 200x200 thumbnail using GD
                    if (extension_loaded('gd')) {
                        try {
                            $raw = file_get_contents($fullPath);
                            $srcImg = @imagecreatefromstring($raw);
                            if ($srcImg) {
                                $origW = imagesx($srcImg);
                                $origH = imagesy($srcImg);

                                // Center square crop to 200x200 for crisp round avatar display
                                $minDim = min($origW, $origH);
                                $cropX = ($origW - $minDim) / 2;
                                $cropY = ($origH - $minDim) / 2;
                                $targetDim = min(200, $minDim);

                                $destImg = imagecreatetruecolor($targetDim, $targetDim);
                                imagealphablending($destImg, false);
                                imagesavealpha($destImg, true);

                                imagecopyresampled(
                                    $destImg, $srcImg,
                                    0, 0, (int)$cropX, (int)$cropY,
                                    $targetDim, $targetDim, $minDim, $minDim
                                );

                                if ($supportsWebp) {
                                    imagewebp($destImg, $thumbPath, 82);
                                } else {
                                    imagejpeg($destImg, $thumbPath, 82);
                                }

                                imagedestroy($srcImg);
                                imagedestroy($destImg);

                                if (file_exists($thumbPath)) {
                                    return response()->file($thumbPath, [
                                        'Content-Type' => $mimeType,
                                        'Cache-Control' => 'public, max-age=86400, stale-while-revalidate=604800',
                                        'Content-Disposition' => 'inline',
                                    ]);
                                }
                            }
                        } catch (\Throwable $e) {
                            // Fall through to streaming original if thumbnail generation failed
                        }
                    }

                    $rawMime = mime_content_type($fullPath) ?: 'image/jpeg';
                    return response()->file($fullPath, [
                        'Content-Type' => $rawMime,
                        'Cache-Control' => 'public, max-age=86400',
                        'Content-Disposition' => 'inline',
                    ]);
                }
            }
        }

        // Return clean fallback SVG avatar (Prevents 404 errors)
        $initial = strtoupper(substr($user->name ?? 'U', 0, 1));
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
            <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#1d4ed8;stop-opacity:1" />
                </linearGradient>
            </defs>
            <rect width="100" height="100" rx="50" fill="url(#grad)"/>
            <text x="50%" y="54%" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-size="44" font-weight="900" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">' . htmlspecialchars($initial) . '</text>
        </svg>';

        return response($svg, 200, [
            'Content-Type' => 'image/svg+xml',
            'Cache-Control' => 'public, max-age=86400',
        ]);
    }

    /**
     * Delete the user's account.
     */
    public function destroy(Request $request): RedirectResponse
    {
        $request->validateWithBag('userDeletion', [
            'password' => ['required', 'current_password'],
        ]);

        $user = $request->user();

        Auth::logout();

        $user->delete();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return Redirect::to('/');
    }
}
