<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Auth\Passwords\CanResetPassword;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, CanResetPassword;

    protected $fillable = [
        'name',
        'email',
        'phone_number',
        'password',
        'role',
        'is_active',
        'profile_photo_url',
        'phone_verified_at',
        'verification_channel',
        'otp_code',
        'otp_expires_at',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'otp_expires_at' => 'datetime',
            'is_active' => 'boolean',
            'password' => 'hashed',
        ];
    }

    /**
     * Determine if the user has verified their email address.
     */
    public function isVerified(): bool
    {
        return !is_null($this->email_verified_at);
    }

    /**
     * Get user avatar URL.
     */
    public function getAvatarUrlAttribute()
    {
        if ($this->profile_photo_url) {
            return asset('storage/' . $this->profile_photo_url);
        }
        return null;
    }

    /**
     * Get average rating for driver user.
     */
    public function getAverageRatingAttribute()
    {
        $avg = Ride::where('driver_id', $this->id)
            ->where('rating', '>', 0)
            ->avg('rating');

        return $avg ? round($avg, 1) : 5.0;
    }

    /**
     * Get total rating reviews count.
     */
    public function getRatingCountAttribute()
    {
        return Ride::where('driver_id', $this->id)
            ->where('rating', '>', 0)
            ->count();
    }

    /**
     * Get the associated driver profile record.
     */
    public function driverProfile()
    {
        return $this->hasOne(Driver::class, 'user_id');
    }

    /**
     * Get the user's saved locations.
     */
    public function savedLocations()
    {
        return $this->hasMany(SavedLocation::class, 'user_id')->latest();
    }
}
