<?php

namespace App\Http\Controllers;

use App\Events\ChatMessageSent;
use App\Models\ChatMessage;
use App\Models\Ride;
use App\Services\PushService;
use Illuminate\Http\Request;

class ChatController extends Controller
{
    /**
     * Fetch all messages for a given active ride.
     */
    public function getMessages(Request $request, Ride $ride)
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        // Must be passenger, driver, or admin on this ride
        if ($ride->passenger_id !== $user->id && $ride->driver_id !== $user->id && $user->role !== 'admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        // Mark incoming messages as read
        ChatMessage::where('ride_id', $ride->id)
            ->where('sender_id', '!=', $user->id)
            ->where('is_read', false)
            ->update(['is_read' => true]);

        $messages = ChatMessage::with('sender')
            ->where('ride_id', $ride->id)
            ->orderBy('created_at', 'asc')
            ->get()
            ->map(function ($msg) use ($user) {
                $sender = $msg->sender;
                return [
                    'id' => (int) $msg->id,
                    'ride_id' => (int) $msg->ride_id,
                    'sender_id' => (int) $msg->sender_id,
                    'sender_name' => $sender ? $sender->name : 'User',
                    'sender_avatar' => $sender ? ($sender->profile_photo_url ? route('user.avatar', [$sender, 'v' => optional($sender->updated_at)->timestamp]) : null) : null,
                    'sender_role' => $sender ? ($sender->role ?? 'passenger') : 'passenger',
                    'message' => $msg->message,
                    'time' => $msg->created_at ? $msg->created_at->format('g:i A') : now()->format('g:i A'),
                    'created_at' => $msg->created_at ? $msg->created_at->toIso8601String() : now()->toIso8601String(),
                    'is_me' => ((int) $msg->sender_id === (int) $user->id),
                ];
            });

        return response()->json([
            'status' => 'success',
            'ride_id' => $ride->id,
            'messages' => $messages,
        ]);
    }

    /**
     * Store and broadcast a new chat message for a ride.
     */
    public function sendMessage(Request $request, Ride $ride)
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        // Must be passenger, driver, or admin on this ride
        if ($ride->passenger_id !== $user->id && $ride->driver_id !== $user->id && $user->role !== 'admin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'message' => 'required|string|max:1000',
        ]);

        $chatMessage = ChatMessage::create([
            'ride_id' => $ride->id,
            'sender_id' => $user->id,
            'message' => trim($validated['message']),
            'is_read' => false,
        ]);

        $chatMessage->load('sender');

        // Broadcast real-time WebSocket event
        try {
            broadcast(new ChatMessageSent($chatMessage));
        } catch (\Throwable $e) {}

        // Send Web Push Notification to the other participant
        try {
            $recipientId = ($user->id === $ride->passenger_id) ? $ride->driver_id : $ride->passenger_id;
            if ($recipientId) {
                $senderName = $user->name ?: 'Ride participant';
                $preview = mb_substr($chatMessage->message, 0, 80);
                app(PushService::class)->sendToUser(
                    $recipientId,
                    "💬 New message from {$senderName}",
                    $preview,
                    route('dashboard'),
                    "chat-ride-{$ride->id}"
                );
            }
        } catch (\Throwable $e) {}

        return response()->json([
            'status' => 'success',
            'message' => [
                'id' => (int) $chatMessage->id,
                'ride_id' => (int) $chatMessage->ride_id,
                'sender_id' => (int) $chatMessage->sender_id,
                'sender_name' => $user->name,
                'sender_avatar' => $user->profile_photo_url ? route('user.avatar', [$user, 'v' => optional($user->updated_at)->timestamp]) : null,
                'sender_role' => $user->role ?? 'passenger',
                'message' => $chatMessage->message,
                'time' => $chatMessage->created_at->format('g:i A'),
                'created_at' => $chatMessage->created_at->toIso8601String(),
                'is_me' => true,
            ],
        ]);
    }
}
