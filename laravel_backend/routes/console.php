<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('sessions:prune', function () {
    $cutoff = time() - ((int) config('session.lifetime', 120) * 60);
    $deleted = DB::table('sessions')->where('last_activity', '<', $cutoff)->delete();

    $this->info("Removed {$deleted} expired session(s).");
})->purpose('Remove expired sessions from the sessions table');

Artisan::command('map:cache-assets', function () {
    $key = config('services.maptiler.key');
    $styleName = config('services.maptiler.style');
    $styleUrl = 'https://api.maptiler.com/maps/' . $styleName . '/style.json?key=' . $key;
    $response = \Illuminate\Support\Facades\Http::timeout(20)->get($styleUrl);
    if (!$response->successful()) {
        $this->error('Failed to download style');
        return 1;
    }
    $style = $response->json();

    // 1. Download Sprites
    $spriteDir = public_path('map-assets/sprites');
    if (!is_dir($spriteDir)) @mkdir($spriteDir, 0755, true);
    foreach (['', '@2x'] as $scale) {
        foreach (['.json', '.png'] as $ext) {
            $url = 'https://api.maptiler.com/maps/' . $styleName . '/sprite' . $scale . $ext . '?key=' . $key;
            $res = \Illuminate\Support\Facades\Http::timeout(20)->get($url);
            if ($res->successful()) {
                file_put_contents($spriteDir . '/sprite' . $scale . $ext, $res->body());
                $this->info("Downloaded sprite: sprite{$scale}{$ext}");
            }
        }
    }

    // 2. Extract and download all font glyph ranges
    $this->info("Map sprite assets successfully baked into /public/map-assets/sprites/");
    return 0;
})->purpose('Download and bake MapTiler sprites into public/map-assets');

Schedule::command('sessions:prune')->dailyAt('03:00');