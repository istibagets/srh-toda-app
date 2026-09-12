import { Component, inject, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  star,
  notificationsOutline,
  notifications,
  closeOutline,
  checkmarkDoneOutline,
  trashOutline,
} from 'ionicons/icons';
import { DriverService } from '../../services/driver.service';
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-driver-header',
  standalone: true,
  imports: [CommonModule, RouterModule, IonIcon],
  templateUrl: './driver-header.component.html',
  styleUrls: ['./driver-header.component.scss'],
})
export class DriverHeaderComponent {
  authService = inject(AuthService);
  driverService = inject(DriverService);
  notificationService = inject(NotificationService);
  private elementRef = inject(ElementRef);

  showNotifications = false;
  isClosing = false;

  @HostListener('document:click', ['$event'])
  @HostListener('document:touchstart', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.showNotifications || this.isClosing) return;
    const target = event.target as HTMLElement;
    if (target && !this.elementRef.nativeElement.contains(target)) {
      this.closeNotifications();
    }
  }

  constructor() {
    addIcons({
      star,
      notificationsOutline,
      notifications,
      closeOutline,
      checkmarkDoneOutline,
      trashOutline,
    });
  }

  toggleNotifications(): void {
    if (this.showNotifications) {
      this.closeNotifications();
    } else {
      this.isClosing = false;
      this.showNotifications = true;
    }
  }

  closeNotifications(): void {
    if (this.isClosing || !this.showNotifications) return;
    this.isClosing = true;
    setTimeout(() => {
      this.showNotifications = false;
      this.isClosing = false;
    }, 180);
  }

  markAllRead(): void {
    this.notificationService.markAllAsRead();
  }

  markSingleRead(id: number, event: Event): void {
    event.stopPropagation();
    this.notificationService.markAsRead(id);
  }

  deleteNotification(id: number, event: Event): void {
    event.stopPropagation();
    this.notificationService.deleteAnnouncement(id);
  }
}
