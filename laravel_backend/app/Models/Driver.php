<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Attributes\Fillable;

#[Fillable([
    'user_id', 
    'full_name', 
    'mtop_number',
    'mtop_certificate_url', 
    'drivers_license_url', 
    'compliance_status',
    'suspension_reason',
    'appeal_message',
    'appeal_status',
    'appealed_at',
    'appeal_attachments',
    'is_online',       // Added for Queue System
    'queue_position',  // Added for Queue System
    'last_activity_at' // Added for 2-hour idle off-duty tracking
])]
class Driver extends Model
{
    // This explicitly tells Laravel to treat is_online as true/false, not 1/0
    protected $casts = [
        'is_online' => 'boolean',
        'appealed_at' => 'datetime',
        'last_activity_at' => 'datetime',
        'appeal_attachments' => 'array',
    ];

    /**
     * Resolve appeal attachment URLs through the streaming endpoint so they
     * render inline even when the public/storage symlink is missing (shared
     * hosting). Older records may still store /storage/appeals/... paths.
     */
    public function getAppealAttachmentsAttribute($value)
    {
        $attachments = is_array($value) ? $value : (is_string($value) && $value !== '' ? json_decode($value, true) : []);

        foreach ((array) $attachments as $i => $att) {
            if (is_array($att) && isset($att['url'])) {
                if (preg_match('#^/storage/appeals/([A-Za-z0-9._-]+)$#', $att['url'], $m)) {
                    $attachments[$i]['url'] = '/attachments/appeals/' . $m[1];
                }
            }
        }

        return $attachments;
    }

    /**
     * Get the user that owns the driver profile.
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get average rating score for driver.
     */
    public function getAverageRatingAttribute()
    {
        $avg = Ride::where('driver_id', $this->user_id)
            ->where('rating', '>', 0)
            ->avg('rating');

        return $avg ? round($avg, 1) : 5.0;
    }

    /**
     * Get rating count for driver.
     */
    public function getRatingCountAttribute()
    {
        return Ride::where('driver_id', $this->user_id)
            ->where('rating', '>', 0)
            ->count();
    }
}