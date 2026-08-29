<?php

namespace App\Services;

use App\Models\PushSubscription;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

class PushService
{
    /**
     * Build a WebPush client using the VAPID credentials from config.
     */
    protected function client(): WebPush
    {
        return new WebPush([
            'VAPID' => [
                'subject' => config('services.vapid.subject', 'mailto:admin@srh-link-toda.com'),
                'publicKey' => config('services.vapid.public_key'),
                'privateKey' => config('services.vapid.private_key'),
            ],
        ]);
    }

    /**
     * Send a push notification to every device subscribed by the given user.
     */
    public function sendToUser(int $userId, string $title, string $body, string $url = '/', ?string $tag = null, array $extra = []): void
    {
        $subscriptions = PushSubscription::where('user_id', $userId)->get();

        $this->send($subscriptions, $title, $body, $url, $tag, $extra);
    }

    /**
     * Send a push notification to every device subscribed by the given users.
     */
    public function sendToUsers(array $userIds, string $title, string $body, string $url = '/', ?string $tag = null, array $extra = []): void
    {
        $userIds = array_values(array_unique(array_filter($userIds)));

        if (empty($userIds)) {
            return;
        }

        $subscriptions = PushSubscription::whereIn('user_id', $userIds)->get();

        $this->send($subscriptions, $title, $body, $url, $tag, $extra);
    }

    /**
     * Send a push notification to all users matching a specific role (e.g. 'admin').
     */
    public function sendToRole(string $role, string $title, string $body, string $url = '/', ?string $tag = null, array $extra = []): void
    {
        $userIds = \App\Models\User::where('role', $role)->pluck('id')->all();
        $this->sendToUsers($userIds, $title, $body, $url, $tag, $extra);
    }

    /**
     * Send a push notification to the single online driver at the front of the
     * line (queue_position 1) — the only driver eligible for a new searching
     * booking.
     */
    public function sendToFrontDriver(string $title, string $body, string $url = '/', ?string $tag = null, array $extra = []): void
    {
        // 1. Direct match for queue position 1
        $front = \App\Models\Driver::where('is_online', true)
            ->where('queue_position', 1)
            ->whereNotNull('user_id')
            ->first();

        // 2. Fallback to lowest positive queue position
        if (!$front) {
            $front = \App\Models\Driver::where('is_online', true)
                ->whereNotNull('user_id')
                ->where('queue_position', '>', 0)
                ->orderBy('queue_position', 'asc')
                ->first();
        }

        // 3. Fallback to any online driver
        if (!$front) {
            $front = \App\Models\Driver::where('is_online', true)
                ->whereNotNull('user_id')
                ->first();
        }

        if ($front && $front->user_id) {
            $this->sendToUser((int) $front->user_id, $title, $body, $url, $tag, array_merge([
                'type' => 'incoming_ride',
                'requireInteraction' => true,
                'renotify' => true,
                'priority' => 'high',
            ], $extra));
        }
    }

    /**
     * Send a push notification to all currently online drivers.
     */
    public function sendToOnlineDrivers(string $title, string $body, string $url = '/', ?string $tag = null, array $extra = []): void
    {
        $driverUserIds = \App\Models\Driver::where('is_online', true)
            ->whereNotNull('user_id')
            ->pluck('user_id')
            ->all();

        $this->sendToUsers($driverUserIds, $title, $body, $url, $tag, $extra);
    }

    /**
     * Send a push notification to all subscribed users.
     */
    public function sendToAll(string $title, string $body, string $url = '/', ?string $tag = null, array $extra = []): void
    {
        $this->send(PushSubscription::all(), $title, $body, $url, $tag, $extra);
    }

    /**
     * Queue and flush the actual push deliveries, pruning dead subscriptions.
     */
    protected function send($subscriptions, string $title, string $body, string $url, ?string $tag = null, array $extra = []): void
    {
        if ($subscriptions->isEmpty()) {
            return;
        }

        $payload = json_encode(array_merge([
            'title' => $title,
            'body' => $body,
            'url' => $url,
            'tag' => $tag,
            'silent' => false,
            'icon' => '/favicon.png',
            'badge' => '/badge.png',
        ], $extra));

        $webPush = $this->client();

        foreach ($subscriptions as $subscription) {
            if (empty($subscription->endpoint)) {
                continue;
            }

            $options = [
                'urgency' => 'high',
                'TTL' => 300,
            ];
            if (!empty($tag)) {
                $options['topic'] = substr($tag, 0, 32);
            }

            $webPush->queueNotification(
                Subscription::create([
                    'endpoint' => $subscription->endpoint,
                    'publicKey' => $subscription->public_key,
                    'authToken' => $subscription->auth_token,
                    'contentEncoding' => 'aes128gcm',
                ]),
                $payload,
                $options
            );
        }

        $expiredEndpoints = [];

        foreach ($webPush->flush() as $report) {
            if (!$report->isSuccess()) {
                $status = $report->getResponse()?->getStatusCode();
                // 404/410 means the subscription no longer exists (device revoked it).
                // 401 means the VAPID key was rotated after the device subscribed —
                // the client re-subscribes automatically with the new key, so the
                // stale row can never succeed again and must be pruned too.
                // 403 means the endpoint is bound to a different VAPID key (the
                // device subscribed with a pre-rotation key) — also permanent.
                if ($report->isSubscriptionExpired() || in_array($status, [404, 410, 401, 403], true)) {
                    $expiredEndpoints[] = $report->getEndpoint();
                }
            }
        }

        if (!empty($expiredEndpoints)) {
            try {
                PushSubscription::whereIn('endpoint', $expiredEndpoints)->delete();
            } catch (\Throwable $e) {
                // Never let cleanup failures bubble up to the ride flow
            }
        }
    }
}