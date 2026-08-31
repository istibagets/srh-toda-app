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

  setAnnouncements(items: Announcement[]): void {
    this.announcementsSignal.set(items);
  }

  addAnnouncement(item: Announcement): void {
    this.announcementsSignal.update((list) => [item, ...list.filter((a) => a.id !== item.id)]);
  }

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
