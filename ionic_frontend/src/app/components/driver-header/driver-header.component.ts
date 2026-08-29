import { Component, inject } from '@angular/core';
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

  showNotifications = false;

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
    this.showNotifications = !this.showNotifications;
  }

  closeNotifications(): void {
    this.showNotifications = false;
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
