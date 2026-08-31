import { Component, input, output, signal, computed, effect, untracked, inject, OnInit, OnDestroy, ElementRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, sendOutline, chatbubbleEllipsesOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { DashboardService } from '../../services/dashboard.service';
import { AuthService } from '../../services/auth.service';
import { RealtimeService } from '../../services/realtime.service';
import { SoundService } from '../../services/sound.service';

export interface ChatMsg {
  id: number;
  ride_id: number;
  sender_id: number;
  sender_name: string;
  sender_avatar?: string | null;
  sender_role: 'driver' | 'passenger' | 'admin';
  message: string;
  time: string;
  created_at: string;
  is_me: boolean;
}

@Component({
  selector: 'app-trip-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: './trip-chat.component.html',
  styleUrls: ['./trip-chat.component.scss'],
})
export class TripChatComponent implements OnInit, OnDestroy {
  private dashboardService = inject(DashboardService);
  private authService = inject(AuthService);
  private realtimeService = inject(RealtimeService);
  private soundService = inject(SoundService);

  rideId = input.required<number>();
  targetName = input<string>('Driver');
  targetSub = input<string>('TODA Tricycle');
  targetAvatar = input<string | null>(null);
  isOpen = input<boolean>(false);
  closeChat = output<void>();
  newMessageReceived = output<ChatMsg>();

  messages = signal<ChatMsg[]>([]);
  newMessage = signal<string>('');
  isSending = signal<boolean>(false);
  isLoading = signal<boolean>(true);

  messagesContainer = viewChild<ElementRef<HTMLDivElement>>('messagesContainer');

  private highestSeenMessageId = 0;
  private isFirstLoad = true;
  private liveChannel: BroadcastChannel | null = null;

  quickPresets = computed(() => {
    if (this.authService.isPassenger()) {
      return [
        "I'm waiting outside",
        "Near the main gate",
        "Near the clubhouse",
        "Please wait a moment",
        "Thank you!",
      ];
    } else {
      return [
        "On my way, 2 mins!",
        "I have arrived at pickup",
        "Where are you waiting?",
        "Traffic is heavy, almost there",
        "Got it, see you!",
      ];
    }
  });

  constructor() {
    addIcons({
      closeOutline,
      sendOutline,
      chatbubbleEllipsesOutline,
      shieldCheckmarkOutline,
    });

    // Real-time inter-tab local event listener
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.liveChannel = new BroadcastChannel('srh_live_toda_channel');
        this.liveChannel.onmessage = (evt) => {
          if (evt.data?.type === 'CHAT_MESSAGE_SENT' && Number(evt.data?.rideId) === Number(this.rideId())) {
            this.loadMessages(false);
          }
        };
      } catch {}
    }

    // Real-time Echo WebSockets event listener for instant zero-polling chat
    effect(() => {
      const id = this.rideId();
      if (id && this.realtimeService.echo) {
        try {
          const channelName = `srh-ride-chat.${id}`;
          const handleIncoming = (e: any) => {
            if (e && e.id) {
              const currentUserId = this.authService.currentUser()?.id;
              const isMe = Number(e.senderId ?? e.sender_id) === Number(currentUserId);
              const formattedMsg: ChatMsg = {
                id: Number(e.id),
                ride_id: Number(e.rideId ?? e.ride_id),
                sender_id: Number(e.senderId ?? e.sender_id),
                sender_name: e.senderName ?? e.sender_name ?? 'User',
                sender_avatar: e.senderAvatar ?? e.sender_avatar ?? null,
                sender_role: e.senderRole ?? e.sender_role ?? 'passenger',
                message: e.message,
                time: e.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                created_at: e.createdAt ?? e.created_at ?? new Date().toISOString(),
                is_me: isMe,
              };

              this.messages.update((msgs) => {
                // If message is already present by exact DB ID, do nothing
                if (msgs.some((m) => Number(m.id) === Number(formattedMsg.id))) {
                  return msgs;
                }
                // If this is my own message, replace optimistic item (where id > 1000000000)
                if (isMe) {
                  const optIdx = msgs.findIndex((m) => m.is_me && m.id > 1000000000 && m.message === formattedMsg.message);
                  if (optIdx !== -1) {
                    const copy = [...msgs];
                    copy[optIdx] = formattedMsg;
                    return copy;
                  }
                }
                return [...msgs, formattedMsg];
              });

              if (!isMe) {
                this.soundService.playChatPop();
                this.newMessageReceived.emit(formattedMsg);
              }
              this.scrollToBottom();
            }
          };

          this.realtimeService.echo
            .channel(channelName)
            .listen('.chat.message.sent', handleIncoming);
        } catch (err) {
          console.warn('[TripChat] Realtime channel setup note:', err);
        }
      }
    });

    // Auto load when chat drawer is opened
    effect(() => {
      const opened = this.isOpen();
      const id = this.rideId();
      if (opened && id) {
        untracked(() => {
          this.loadMessages(true);
        });
      }
    });
  }

  ngOnInit(): void {
    this.loadMessages();
  }

  ngOnDestroy(): void {
    if (this.liveChannel) {
      try {
        this.liveChannel.close();
      } catch {}
      this.liveChannel = null;
    }
  }

  loadMessages(showSpinner = true): void {
    const id = this.rideId();
    if (!id) return;

    if (showSpinner && this.isFirstLoad) this.isLoading.set(true);

    this.dashboardService.getChatMessages(id).subscribe({
      next: (res) => {
        if (Array.isArray(res?.messages)) {
          const currentCount = this.messages().length;
          const map = new Map<number, ChatMsg>();
          for (const m of res.messages) {
            map.set(Number(m.id), m);
          }
          const deduplicatedMessages = Array.from(map.values());

          if (this.isFirstLoad) {
            this.isFirstLoad = false;
            if (deduplicatedMessages.length > 0) {
              this.highestSeenMessageId = Math.max(...deduplicatedMessages.map((m: any) => m.id));
            }
          } else {
            // Check for new incoming messages from the other party
            for (const m of deduplicatedMessages) {
              if (!m.is_me && m.id > this.highestSeenMessageId) {
                this.highestSeenMessageId = Math.max(this.highestSeenMessageId, m.id);
                this.newMessageReceived.emit(m);
              }
            }
          }

          this.messages.set(deduplicatedMessages);
          if (deduplicatedMessages.length > currentCount) {
            setTimeout(() => this.scrollToBottom(), 60);
          }
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  sendMessage(textToSend?: string): void {
    const text = (textToSend || this.newMessage()).trim();
    const id = this.rideId();
    if (!text || !id || this.isSending()) return;

    const user = this.authService.currentUser();
    const optimisticMsg: ChatMsg = {
      id: Date.now(),
      ride_id: id,
      sender_id: user?.id || 0,
      sender_name: user?.name || 'Me',
      sender_role: this.authService.isPassenger() ? 'passenger' : 'driver',
      message: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      created_at: new Date().toISOString(),
      is_me: true,
    };

    this.messages.update((list) => [...list, optimisticMsg]);
    this.soundService.playChatPop();
    this.newMessage.set('');
    setTimeout(() => this.scrollToBottom(), 40);

    this.isSending.set(true);
    this.dashboardService.sendChatMessage(id, text).subscribe({
      next: (res) => {
        this.isSending.set(false);
        if (res?.message) {
          this.messages.update((list) =>
            list.map((m) => (m.id === optimisticMsg.id ? res.message : m))
          );
        }
        if (this.liveChannel) {
          try {
            this.liveChannel.postMessage({ type: 'CHAT_MESSAGE_SENT', rideId: id });
          } catch {}
        }
        setTimeout(() => this.scrollToBottom(), 40);
      },
      error: () => {
        this.isSending.set(false);
      },
    });
  }

  sendPreset(preset: string): void {
    this.sendMessage(preset);
  }

  private scrollToBottom(): void {
    const el = this.messagesContainer()?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }

  handleClose(): void {
    this.closeChat.emit();
  }
}
