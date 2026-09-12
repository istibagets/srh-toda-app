import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationStart, NavigationEnd } from '@angular/router';
import { IonApp, IonRouterOutlet, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, chevronBackOutline } from 'ionicons/icons';
import { filter } from 'rxjs/operators';
import { RealtimeService } from './services/realtime.service';
import { SwipeBackService } from './services/swipe-back.service';
import { MaintenanceService } from './services/maintenance.service';
import { AttachmentViewerModalComponent } from './components/attachment-viewer-modal/attachment-viewer-modal.component';
import { MaintenanceOverlayComponent } from './components/maintenance-overlay/maintenance-overlay.component';
import { PermissionService } from './services/permission.service';
import { ToastGestureService } from './services/toast-gesture.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonApp,
    IonRouterOutlet,
    IonIcon,
    AttachmentViewerModalComponent,
    MaintenanceOverlayComponent,
  ],
})
export class AppComponent {
  private router = inject(Router);
  private realtimeService = inject(RealtimeService);
  swipeBackService = inject(SwipeBackService);
  maintenanceService = inject(MaintenanceService);
  private permissionService = inject(PermissionService);
  private toastGestureService = inject(ToastGestureService);

  readonly currentPath = signal<string>(
    typeof window !== 'undefined' ? window.location.pathname : ''
  );

  readonly isSuperAdminRoute = computed(() => {
    return this.currentPath().includes('/superadmin');
  });

  constructor() {
    addIcons({
      arrowBackOutline,
      chevronBackOutline,
    });

    // Initialize universal swipe-to-dismiss for all toasts
    this.toastGestureService.init();

    // -- REQUEST ALL PERMISSIONS IMMEDIATELY ON APP OPEN ---------------------
    // Fires before any routing, on every platform (web PWA, iOS Safari, Android).
    // Handles: geolocation + push notifications, platform detection,
    // staggered dialogs, runtime change watchers, and graceful fallbacks.
    this.permissionService.initOnAppOpen();

    // Track route path reactively so maintenance overlay can be bypassed on /superadmin
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.currentPath.set(event.urlAfterRedirects || event.url);
      });

    // Blur focused elements before page transitions to prevent aria-hidden warnings
    this.router.events
      .pipe(filter((event) => event instanceof NavigationStart))
      .subscribe(() => {
        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });
  }
}
