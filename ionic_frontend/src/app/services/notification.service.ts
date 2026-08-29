import { Injectable, signal, computed } from '@angular/core';
import { Announcement } from '../models/driver.model';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private announcementsSignal = signal<Announcement[]>([]);

  readonly announcements = computed(() => this.announcementsSignal());
  readonly unreadCount = computed(
    () => this.announcementsSignal().filter((a) => !a.isRead).length
  );

  markAsRead(id: number): void {
    this.announcementsSignal.update((list) =>
      list.map((a) => (a.id === id ? { ...a, isRead: true } : a))
    );
  }

  markAllAsRead(): void {
    this.announcementsSignal.update((list) =>
      list.map((a) => ({ ...a, isRead: true }))
    );
  }

  deleteAnnouncement(id: number): void {
    this.announcementsSignal.update((list) => list.filter((a) => a.id !== id));
  }
}
