<?php

namespace App\Support;

use App\Models\SrhSetting;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class SystemSettings
{
    private static array $cache = [];

    private static bool $loaded = false;

    public static function rememberDefaults(): void
    {
        foreach ([
            'security.username' => 'admin',
            'security.password_hash' => null,
            'branding.logo_path' => null,
            'ui.brand_name' => 'SRH LINK-TODA',
            'ui.nav_brand' => 'SRH LINK TODA',
            'ui.brand_tagline' => 'Connecting Santa Rosa Homes residents with verified TODA drivers — fast, safe, and fair.',
            'ui.welcome_sub' => 'Connect with verified TODA drivers<br>in Santa Rosa Homes, Nueva Ecija',
        ] as $key => $value) {
            if (self::get($key) === null && $value !== null) {
                self::set($key, $value);
            }
        }
    }

    private static function load(): void
    {
        if (self::$loaded) {
            return;
        }

        self::$loaded = true;

        try {
            SrhSetting::all(['key', 'value'])->each(function ($row) {
                self::$cache[$row->key] = $row->value;
            });
        } catch (\Throwable $e) {
            // Table missing (project DBs are dumps without full migration history).
            // Self-heal: create the tiny settings table once, then retry the load.
            try {
                if (! Schema::hasTable('srh_settings')) {
                    Schema::create('srh_settings', function ($table) {
                        $table->string('key')->primary();
                        $table->text('value')->nullable();
                        $table->timestamps();
                    });
                }

                self::$cache = [];
                SrhSetting::all(['key', 'value'])->each(function ($row) {
                    self::$cache[$row->key] = $row->value;
                });
            } catch (\Throwable $e2) {
                // Unwritable DB — keep empty cache, everything falls back to defaults.
                self::$cache = [];
            }
        }
    }

    public static function get(string $key, $default = null)
    {
        self::load();

        return self::$cache[$key] ?? $default;
    }

    public static function set(string $key, ?string $value): void
    {
        self::$cache[$key] = $value;

        try {
            SrhSetting::updateOrCreate(['key' => $key], ['value' => $value]);
        } catch (\Throwable $e) {
            Log::warning('SystemSettings save failed for key ['.$key.']: '.$e->getMessage());
        }
    }

    public static function logoUrl(): string
    {
        $path = self::get('branding.logo_path');

        if ($path) {
            $pubFile = public_path('storage/'.ltrim($path, '/'));
            if (file_exists($pubFile)) {
                return asset('storage/'.ltrim($path, '/')).'?v='.filemtime($pubFile);
            }
            if (Storage::disk('public')->exists($path)) {
                return route('branding.logo.stream', ['filename' => basename($path)]).'?v='.Storage::disk('public')->lastModified($path);
            }
        }

        return asset('images/srh-logo.png').'?v=20';
    }

    public static function brandName(): string
    {
        return (string) self::get('ui.brand_name', 'SRH LINK-TODA');
    }

    public static function brandTagline(): string
    {
        return (string) self::get('ui.brand_tagline', 'Connecting Santa Rosa Homes residents with verified TODA drivers — fast, safe, and fair.');
    }

    public static function defaultFaqs(): array
    {
        return [
            [
                'question' => 'How are tricycle fares determined in Santa Rosa Homes?',
                'answer' => 'Fares are calculated based on standardized TODA matrix guidelines agreed upon with the local Barangay and HOA, taking into account trip distance, passenger count, and standard day vs. late-night schedules.'
            ],
            [
                'question' => 'What are the operating hours of the TODA terminal?',
                'answer' => 'The main gate dispatch terminal operates daily from 5:00 AM until 11:00 PM. Verified drivers may also be available on-call through the passenger web app for early or late trips.'
            ],
            [
                'question' => 'How do I report a lost item or file a driver complaint?',
                'answer' => 'Passengers can file an instant report directly through the app from their Ride History, or visit the Santa Rosa Homes TODA Dispatch Station with the driver\'s TODA body number or trip timestamp.'
            ],
            [
                'question' => 'Are student and senior citizen discounts honored?',
                'answer' => 'Yes. In full compliance with national transport regulations, valid student, senior citizen, and PWD identification cards are honored with a 20% discount on regular fares.'
            ],
            [
                'question' => 'How can a new driver join the Santa Rosa Homes TODA?',
                'answer' => 'Prospective drivers must present a valid driver\'s license, barangay clearance, MTOP permit, pass a vehicle safety check, and register via the driver portal before joining the terminal queue.'
            ]
        ];
    }

    public static function landingData(): array
    {
        $rawFaqs = self::get('landing.faqs_json');
        $faqs = $rawFaqs ? json_decode($rawFaqs, true) : null;
        if (!is_array($faqs) || empty($faqs)) {
            $faqs = self::defaultFaqs();
        }

        return [
            'hero_badge' => (string) self::get('landing.hero_badge', 'Official Community Transport Portal'),
            'hero_title' => (string) self::get('landing.hero_title', 'Safe, Verified, and Reliable Tricycle Transport for Santa Rosa Homes'),
            'hero_subtitle' => (string) self::get('landing.hero_subtitle', 'Connecting homeowners, commuters, and verified TODA drivers in Santa Rosa Homes, Nueva Ecija. Transparent fares, digital dispatch, and trusted community service.'),
            'hero_cta_primary' => (string) self::get('landing.hero_cta_primary', 'Book a Ride'),
            'hero_cta_secondary' => (string) self::get('landing.hero_cta_secondary', 'Apply as Driver'),
            'about_title' => (string) self::get('landing.about_title', 'Serving Santa Rosa Homes with Pride & Integrity'),
            'about_text' => (string) self::get('landing.about_text', 'SRH LINK-TODA is the community-driven transport network dedicated to providing orderly, secure, and courteous tricycle transportation. Operating in close coordination with homeowners and local barangay officials, we ensure every driver is vetted, fares are regulated, and passenger safety comes first.'),
            'membership_intro' => (string) self::get('landing.membership_intro', 'Join an organized association committed to driver livelihood, safety standards, and orderly terminal queuing.'),
            'membership_step1_title' => (string) self::get('landing.membership_step1_title', '1. Valid Driver\'s License'),
            'membership_step1_desc' => (string) self::get('landing.membership_step1_desc', 'Submit a valid Professional or Non-Professional Driver\'s License issued by the LTO.'),
            'membership_step2_title' => (string) self::get('landing.membership_step2_title', '2. Barangay & Police Clearance'),
            'membership_step2_desc' => (string) self::get('landing.membership_step2_desc', 'Provide an updated Barangay Clearance and Police Clearance proving good community standing.'),
            'membership_step3_title' => (string) self::get('landing.membership_step3_title', '3. MTOP & TODA Franchise'),
            'membership_step3_desc' => (string) self::get('landing.membership_step3_desc', 'Verify your Motorized Tricycle Operator\'s Permit (MTOP) and official TODA franchise unit plate.'),
            'membership_step4_title' => (string) self::get('landing.membership_step4_title', '4. Vehicle Inspection & Queue Access'),
            'membership_step4_desc' => (string) self::get('landing.membership_step4_desc', 'Pass tricycle roadworthiness safety checks (brakes, lights, sidecar stability) and gain terminal dispatch queue access.'),
            'activities_text' => (string) self::get('landing.activities_text', 'SRH LINK-TODA conducts regular defensive driving workshops, traffic safety assistance along subdivision gates, community clean-up drives, and manages an active mutual aid welfare fund for member families.'),
            'faqs' => $faqs,
            'terminal_location' => (string) self::get('landing.terminal_location', 'Santa Rosa Homes Main Gate Terminal, Santa Rosa, Nueva Ecija'),
            'terminal_hours' => (string) self::get('landing.terminal_hours', 'Daily Operations: 5:00 AM – 11:00 PM'),
            'dispatch_hotline' => (string) self::get('landing.dispatch_hotline', '+63 912 847 4813'),
            'dispatch_email' => (string) self::get('landing.dispatch_email', 'dispatch@srh-link-toda.org'),
        ];
    }
}
