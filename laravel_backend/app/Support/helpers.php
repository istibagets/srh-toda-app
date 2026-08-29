<?php

use App\Support\SystemSettings;

if (! function_exists('srh_setting')) {
    function srh_setting($key, $default = null)
    {
        return SystemSettings::get($key, $default);
    }
}

if (! function_exists('srh_logo_url')) {
    function srh_logo_url()
    {
        return SystemSettings::logoUrl();
    }
}
