<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AnnouncementRead extends Model
{
    public $timestamps = false;
    protected $fillable = ['user_id', 'announcement_id', 'read_at'];
}
