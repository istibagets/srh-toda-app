<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SrhSetting extends Model
{
    protected $table = 'srh_settings';

    public $incrementing = false;

    protected $primaryKey = 'key';

    protected $keyType = 'string';

    protected $fillable = ['key', 'value'];

    protected $casts = [
        'value' => 'string',
    ];
}
