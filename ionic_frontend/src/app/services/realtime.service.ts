import { Injectable, inject, signal, computed } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { DriverService } from './driver.service';

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

  private echoInstance: Echo<any> | null = null;
  private isConnectedSignal = signal<boolean>(false);
  readonly isConnected = computed(() => this.isConnectedSignal());

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

      this.echoInstance
        .channel('srh-toda-queue')
        .listen('.queue.changed', handleQueueEvent)
        .listen('queue.changed', handleQueueEvent)
        .listen('QueueUpdated', handleQueueEvent);

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
        .listen('RideStatusUpdated', handleRideEvent);

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

      // Listen on admin channel
      this.echoInstance
        .channel('srh-toda-admin')
        .listen('.driver.applicant.updated', () => this.driverService.triggerLiveSync())
        .listen('driver.applicant.updated', () => this.driverService.triggerLiveSync())
        .listen('.report.updated', () => this.driverService.triggerLiveSync())
        .listen('report.updated', () => this.driverService.triggerLiveSync());

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
