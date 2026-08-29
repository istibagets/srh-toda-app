<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PushSubscription extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'endpoint',
        'public_key',
        'auth_token',
        'user_agent',
    ];

    /**
     * Relationship: A push subscription belongs to a user.
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}