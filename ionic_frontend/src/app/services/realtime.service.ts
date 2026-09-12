import { Injectable, inject, signal, computed } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { DriverService } from './driver.service';
import { NotificationService } from './notification.service';
import { SoundService } from './sound.service';
import { PushService } from './push.service';
import { MaintenanceService } from './maintenance.service';

declare global {
  interface Window {
    Pusher: typeof Pusher;
    Echo: Echo<any>;
  }
}

@Injectable({
  providedIn: 'root',
})
export class RealtimeService {
  private authService = inject(AuthService);
  private driverService = inject(DriverService);
  private notificationService = inject(NotificationService);
  private soundService = inject(SoundService);
  private pushService = inject(PushService);
  private maintenanceService = inject(MaintenanceService);

  private echoInstance: Echo<any> | null = null;
  private isConnectedSignal = signal<boolean>(false);
  readonly isConnected = computed(() => this.isConnectedSignal());

  get echo(): Echo<any> | null {
    return this.echoInstance;
  }

  constructor() {
    this.initEcho();
  }

  private initEcho(): void {
    if (typeof window === 'undefined') return;

    window.Pusher = Pusher;

    try {
      const token = this.authService.token();
      const host = environment.reverb?.host || window.location.hostname;
      const port = environment.reverb?.port || 8080;
      const scheme = environment.reverb?.scheme || 'http';

      this.echoInstance = new Echo({
        broadcaster: 'reverb',
        key: environment.reverb?.appKey || 'srhlinktodakey',
        wsHost: host,
        wsPort: port,
        wssPort: port,
        forceTLS: scheme === 'https',
        enabledTransports: ['ws', 'wss'],
        disableStats: true,
        authEndpoint: `${environment.apiUrl}/broadcasting/auth`,
        auth: {
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
            Accept: 'application/json',
          },
        },
      });

      window.Echo = this.echoInstance;

      // Listen on public queue channel
      const handleQueueEvent = (e: any) => {
        if (e && Array.isArray(e.active_queue)) {
          this.driverService.syncFromDashboard({
            driver: {
              active_queue: e.active_queue,
              total_queue_count: e.total_queue_count ?? e.active_queue.length,
            },
            admin: {
              active_queue: e.active_queue,
              total_queue_count: e.total_queue_count ?? e.active_queue.length,
            },
          });
        }
        this.driverService.triggerLiveSync();
      };

      // Listen on public system status and maintenance events
      const handleMaintenanceEvent = (e: any) => {
        if (e) {
          const isDown =
            typeof e.active === 'boolean'
              ? e.active
              : typeof e.is_maintenance === 'boolean'
              ? e.is_maintenance
              : false;
          this.maintenanceService.setMaintenanceState(isDown, e.message);
        }
      };

      this.echoInstance
        .channel('srh-system-status')
        .listen('.maintenance.status', handleMaintenanceEvent)
        .listen('maintenance.status', handleMaintenanceEvent)
        .listen('.MaintenanceModeToggled', handleMaintenanceEvent)
        .listen('MaintenanceModeToggled', handleMaintenanceEvent);

      this.echoInstance
        .channel('srh-toda-queue')
        .listen('.queue.changed', handleQueueEvent)
        .listen('queue.changed', handleQueueEvent)
        .listen('QueueUpdated', handleQueueEvent)
        .listen('.maintenance.status', handleMaintenanceEvent)
        .listen('maintenance.status', handleMaintenanceEvent)
        .listen('.MaintenanceModeToggled', handleMaintenanceEvent)
        .listen('MaintenanceModeToggled', handleMaintenanceEvent);

      // Listen on public rides channel
      const handleRideEvent = (e: any) => {
        if (e && e.ride) {
          this.driverService.handleRideStatusBroadcast(e);
        }
        this.driverService.triggerLiveSync();
      };

      this.echoInstance
        .channel('srh-toda-rides')
        .listen('.ride.status.updated', handleRideEvent)
        .listen('ride.status.updated', handleRideEvent)
        .listen('RideStatusUpdated', handleRideEvent)
        .listen('.queue.changed', handleQueueEvent)
        .listen('queue.changed', handleQueueEvent)
        .listen('QueueUpdated', handleQueueEvent)
        .listen('.maintenance.status', handleMaintenanceEvent)
        .listen('maintenance.status', handleMaintenanceEvent)
        .listen('.MaintenanceModeToggled', handleMaintenanceEvent)
        .listen('MaintenanceModeToggled', handleMaintenanceEvent);

      // Listen on public GPS location channel
      const handleGpsEvent = (e: any) => {
        if (e && (e.driverId || e.driver_id)) {
          this.driverService.handleLocationBroadcast(e);
        }
      };

      this.echoInstance
        .channel('srh-toda-gps')
        .listen('.tricycle.location', handleGpsEvent)
        .listen('tricycle.location', handleGpsEvent)
        .listen('TricycleLocationUpdated', handleGpsEvent);

      // Listen on public announcements channel
      const handleAnnouncementEvent = (e: any) => {
        if (e && e.announcement) {
          const ann = e.announcement;
          const role = this.authService.userRole() || 'passenger';
          const target = (ann.target_audience || 'ALL').toUpperCase();
          const matches =
            target === 'ALL' ||
            (target === 'DRIVERS' && (role === 'driver' || role === 'admin' || role === 'superadmin')) ||
            (target === 'PASSENGERS' && (role === 'passenger' || role === 'admin' || role === 'superadmin')) ||
            (target === 'ADMIN' && (role === 'admin' || role === 'superadmin'));

          if (matches) {
            this.notificationService.addAnnouncement({
              id: ann.id,
              title: ann.title,
              message: ann.message,
              targetAudience: ann.target_audience || 'ALL',
              createdAt: 'Just now',
              isRead: false,
              actionUrl: ann.action_url,
            });

            try {
              this.soundService.playBookingAlert();
            } catch {}
          }
        }
      };

      this.echoInstance
        .channel('srh-toda-announcements')
        .listen('.AnnouncementCreated', handleAnnouncementEvent)
        .listen('AnnouncementCreated', handleAnnouncementEvent)
        .listen('.maintenance.status', handleMaintenanceEvent)
        .listen('maintenance.status', handleMaintenanceEvent);

      // Listen on admin channel
      this.echoInstance
        .channel('srh-toda-admin')
        .listen('.driver.applicant.updated', () => this.driverService.triggerLiveSync())
        .listen('driver.applicant.updated', () => this.driverService.triggerLiveSync())
        .listen('.report.updated', () => this.driverService.triggerLiveSync())
        .listen('report.updated', () => this.driverService.triggerLiveSync())
        .listen('.AnnouncementCreated', handleAnnouncementEvent)
        .listen('AnnouncementCreated', handleAnnouncementEvent);

      this.isConnectedSignal.set(true);
    } catch (err) {
      console.warn('[Realtime] Echo initialization notice:', err);
    }
  }

  updateAuthToken(token: string): void {
    if (this.echoInstance) {
      this.echoInstance.options.auth = {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      };
    }
  }
}
