<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SendOtpNotification extends Notification
{
    use Queueable;

    protected string $otpCode;

    /**
     * Create a new notification instance.
     */
    public function __construct(string $otpCode)
    {
        $this->otpCode = $otpCode;
    }

    /**
     * Get the notification's delivery channels.
     *
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    /**
     * Get the mail representation of the notification.
     */
    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Your SRH LINK-TODA Verification Code: ' . $this->otpCode)
            ->greeting('Hello ' . $notifiable->name . '!')
            ->line('Thank you for registering with SRH LINK-TODA.')
            ->line('Your 6-digit account verification OTP code is:')
            ->line('**' . $this->otpCode . '**')
            ->line('This verification code is valid for 10 minutes. Do not share this code with anyone.')
            ->line('If you did not request this verification, please ignore this email.');
    }
}
