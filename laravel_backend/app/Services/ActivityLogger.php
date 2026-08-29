<?php

namespace App\Services;

use App\Models\User;
use App\Models\UserActivityLog;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class ActivityLogger
{
    private static bool $checked = false;

    /**
     * Record an entry in the user activity audit trail.
     *
     * Never throws: logging must not break the flow it is attached to.
     */
    public static function log(string $action, ?int $userId = null, array $meta = []): void
    {
        try {
            self::ensureTable();

            $user = $userId ? User::find($userId) : null;

            UserActivityLog::create([
                'user_id' => $userId,
                'user_name' => $user?->name ?? ($meta['name'] ?? null),
                'user_role' => $user?->role ?? ($meta['role'] ?? null),
                'action' => $action,
                'ip_address' => self::shortIp(request()->ip()),
                'user_agent' => self::short((string) request()->userAgent(), 400),
                'metadata' => empty($meta) ? null : json_encode($meta),
                'created_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('Activity log write failed for ['.$action.']: '.$e->getMessage());
        }
    }

    private static function ensureTable(): void
    {
        if (self::$checked) {
            return;
        }

        self::$checked = true;

        try {
            if (! Schema::hasTable('user_activity_logs')) {
                Schema::create('user_activity_logs', function ($table) {
                    $table->id();
                    $table->unsignedBigInteger('user_id')->nullable()->index();
                    $table->string('user_name', 191)->nullable();
                    $table->string('user_role', 40)->nullable();
                    $table->string('action', 60)->index();
                    $table->string('ip_address', 45)->nullable();
                    $table->string('user_agent', 400)->nullable();
                    $table->text('metadata')->nullable();
                    $table->timestamp('created_at')->nullable();
                });
            }
        } catch (\Throwable $e) {
            // Shared-hosting DB dumps sometimes lack migration history — self-heal only once.
        }
    }

    private static function short(?string $value, int $length): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return mb_substr($value, 0, $length);
    }

    private static function shortIp(?string $ip): ?string
    {
        return $ip === null ? null : mb_substr($ip, 0, 45);
    }
}