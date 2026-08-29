<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SavedLocation extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'name',
        'address',
        'latitude',
        'longitude',
        'type',
        'is_default_pickup',
        'is_default_dropoff',
    ];

    protected $casts = [
        'latitude' => 'float',
        'longitude' => 'float',
        'is_default_pickup' => 'boolean',
        'is_default_dropoff' => 'boolean',
    ];

    /**
     * User who owns this saved location.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the icon name / badge configuration for the category.
     */
    public function getCategoryMetaAttribute(): array
    {
        return match ($this->type) {
            'home' => [
                'icon' => 'home',
                'bg_class' => 'bg-blue-50 text-blue-700 border-blue-200',
                'icon_bg' => 'bg-blue-50 text-blue-600 border-blue-100',
                'label' => 'Home',
            ],
            'work' => [
                'icon' => 'work',
                'bg_class' => 'bg-indigo-50 text-indigo-700 border-indigo-200',
                'icon_bg' => 'bg-indigo-50 text-indigo-600 border-indigo-100',
                'label' => 'Work',
            ],
            'school' => [
                'icon' => 'school',
                'bg_class' => 'bg-amber-50 text-amber-700 border-amber-200',
                'icon_bg' => 'bg-amber-50 text-amber-600 border-amber-100',
                'label' => 'School',
            ],
            'shopping' => [
                'icon' => 'shopping',
                'bg_class' => 'bg-rose-50 text-rose-700 border-rose-200',
                'icon_bg' => 'bg-rose-50 text-rose-600 border-rose-100',
                'label' => 'Market',
            ],
            'favorite' => [
                'icon' => 'favorite',
                'bg_class' => 'bg-emerald-50 text-emerald-700 border-emerald-200',
                'icon_bg' => 'bg-emerald-50 text-emerald-600 border-emerald-100',
                'label' => 'Favorite',
            ],
            default => [
                'icon' => 'custom',
                'bg_class' => 'bg-slate-100 text-slate-700 border-slate-200',
                'icon_bg' => 'bg-slate-50 text-slate-600 border-slate-200',
                'label' => 'Place',
            ],
        };
    }
}
