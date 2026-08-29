<?php

namespace App\Events;

use App\Models\ChatMessage;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ChatMessageSent implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public int $id;
    public int $rideId;
    public int $senderId;
    public ?string $senderName;
    public ?string $senderAvatar;
    public string $senderRole;
    public string $message;
    public string $time;
    public string $createdAt;
    public ?int $passengerId;
    public ?int $driverId;

    public function __construct(ChatMessage $chatMessage)
    {
        $chatMessage->loadMissing(['sender', 'ride:id,passenger_id,driver_id']);
        $sender = $chatMessage->sender;
        $ride = $chatMessage->ride;

        $this->id = (int) $chatMessage->id;
        $this->rideId = (int) $chatMessage->ride_id;
        $this->senderId = (int) $chatMessage->sender_id;
        $this->senderName = $sender ? $sender->name : 'User';
        $this->senderAvatar = $sender ? ($sender->profile_photo_url ? route('user.avatar', [$sender, 'v' => optional($sender->updated_at)->timestamp]) : null) : null;
        $this->senderRole = $sender ? ($sender->role ?? 'passenger') : 'passenger';
        $this->message = $chatMessage->message;
        $this->time = $chatMessage->created_at ? $chatMessage->created_at->format('g:i A') : now()->format('g:i A');
        $this->createdAt = $chatMessage->created_at ? $chatMessage->created_at->toIso8601String() : now()->toIso8601String();
        $this->passengerId = $ride ? (int) $ride->passenger_id : null;
        $this->driverId = $ride ? (int) $ride->driver_id : null;
    }

    public function broadcastOn(): array
    {
        // PER-RIDE channel ONLY (never the global srh-toda-rides bus): the client
        // only ever subscribes to the ride it is actually part of, so chat events
        // never reach other drivers' or passengers' dashboards. routes/channels.php
        // additionally authorizes 'srh-ride-chat.{rideId}' for the participants.
        return [
            new Channel('srh-ride-chat.' . $this->rideId),
        ];
    }

    public function broadcastAs(): string
    {
        return 'chat.message.sent';
    }
}
