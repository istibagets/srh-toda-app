import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class PushService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  private readonly VAPID_PUBLIC_KEY =
    'BEge1Ivr3jywcIC_flLTpft54Ri0L-wEo6Fwdtn1pAFUQzHBZXl5Qo_NeQusfB1PUEHsRywQ4NRemlYUJvens_I';

  permissionStatus = signal<NotificationPermission>('default');
  isSubscribed = signal<boolean>(false);
  swRegistration: ServiceWorkerRegistration | null = null;
  private lastSyncedEndpoint: string | null = null;
  private isSyncing = false;

  isSubscribedToBackend(): boolean {
    return this.isSubscribed() && !!this.lastSyncedEndpoint;
  }

  constructor() {
    this.initServiceWorker();
  }

  /**
   * Register sw.js Service Worker on startup
   */
  async initServiceWorker(): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[PushService] Web Push or Service Worker not supported in this browser.');
      return;
    }

    try {
      this.swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[PushService] Service Worker registered successfully:', this.swRegistration.scope);

      if ('Notification' in window) {
        this.permissionStatus.set(Notification.permission);
        if (Notification.permission === 'granted') {
          await this.syncExistingSubscription();
        }
      }
    } catch (err) {
      console.warn('[PushService] Service Worker registration note:', err);
    }
  }

  /**
   * Sync existing PushSubscription with backend on login
   */
  async syncExistingSubscription(): Promise<void> {
    if (!this.swRegistration) {
      await this.initServiceWorker();
    }
    if (!this.swRegistration) return;

    try {
      let subscription = await this.swRegistration.pushManager.getSubscription();

      if (!subscription && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        const convertedVapidKey = this.urlBase64ToUint8Array(this.VAPID_PUBLIC_KEY);
        subscription = await this.swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey as any,
        });
      }

      if (subscription) {
        this.isSubscribed.set(true);
        await this.sendSubscriptionToBackend(subscription);
      }
    } catch (e) {
      console.warn('[PushService] Sync subscription note:', e);
    }
  }

  /**
   * Prompt user for notification permissions and register VAPID subscription
   */
  async requestPermissionAndSubscribe(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window) || !this.swRegistration) {
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permissionStatus.set(permission);

      if (permission !== 'granted') {
        console.warn('[PushService] Notification permission was:', permission);
        return false;
      }

      const convertedVapidKey = this.urlBase64ToUint8Array(this.VAPID_PUBLIC_KEY);
      let subscription = await this.swRegistration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await this.swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey as any,
        });
      }

      this.isSubscribed.set(true);
      await this.sendSubscriptionToBackend(subscription);
      return true;
    } catch (err) {
      console.error('[PushService] Failed to subscribe to web push:', err);
      return false;
    }
  }

  /**
   * Send the PushSubscription JSON to Laravel Backend
   */
  private async sendSubscriptionToBackend(subscription: PushSubscription): Promise<void> {
    if (this.lastSyncedEndpoint === subscription.endpoint || this.isSyncing) {
      return;
    }
    const token = this.authService.token() || localStorage.getItem('srh_auth_token') || localStorage.getItem('srh_toda_token');
    if (!token) return;

    this.isSyncing = true;
    const subJson = subscription.toJSON();
    const keys = subJson.keys as Record<string, string> | undefined;
    const payload = {
      endpoint: subscription.endpoint,
      public_key: keys?.['p256dh'] || null,
      auth_token: keys?.['auth'] || null,
    };

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });

    const url = `${environment.apiUrl}/push/subscribe`;

    this.http.post(url, payload, { headers }).subscribe({
      next: () => {
        this.isSyncing = false;
        this.lastSyncedEndpoint = subscription.endpoint;
        this.isSubscribed.set(true);
        console.log('[PushService] Subscription registered with Laravel backend.');
      },
      error: (err) => {
        this.isSyncing = false;
        console.warn('[PushService] Backend push subscription error:', err);
      },
    });
  }

  /**
   * Unsubscribe from Web Push
   */
  async unsubscribe(): Promise<void> {
    if (!this.swRegistration) return;

    try {
      const subscription = await this.swRegistration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        this.isSubscribed.set(false);
        this.lastSyncedEndpoint = null;

        const token = this.authService.token() || localStorage.getItem('srh_toda_token');
        if (token) {
          const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
          this.http.post(`${environment.apiUrl}/push/unsubscribe`, { endpoint }, { headers }).subscribe({
            next: () => console.log('[PushService] Unsubscribed on backend.'),
            error: () => {},
          });
        }
      }
    } catch (err) {
      console.warn('[PushService] Unsubscribe error:', err);
    }
  }

  /**
   * Display a local system notification banner directly (works in browser & PWA)
   */
  async showLocalBanner(title: string, body: string, url: string = '/'): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      if (this.swRegistration) {
        await this.swRegistration.showNotification(title, {
          body,
          icon: '/assets/icon/icon-192.png',
          badge: '/assets/icon/badge-192.png',
          data: { url },
          tag: 'srh-toda-banner-' + Date.now(),
          renotify: true,
          requireInteraction: true,
        } as any);
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: '/assets/icon/icon-192.png',
        });
      }
    } catch (e) {
      console.warn('[PushService] Local banner display note:', e);
    }
  }

  /**
   * Trigger a test notification (via backend web-push and local banner)
   */
  triggerTestPush(): void {
    const token = this.authService.token() || localStorage.getItem('srh_auth_token') || localStorage.getItem('srh_toda_token');

    if (token) {
      const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
      this.http.post(`${environment.apiUrl}/push/test`, {}, { headers }).subscribe({
        next: (res: any) => console.log('[PushService] Backend test push response:', res),
        error: (err) => {
          console.warn('[PushService] Backend test push fallback:', err);
          this.showLocalBanner(
            'SRH LINK-TODA 🔔',
            'Push notifications active! You will receive updates.'
          );
        },
      });
    } else {
      this.showLocalBanner(
        'SRH LINK-TODA 🔔',
        'Push notifications active! You will receive updates.'
      );
    }
  }

  /**
   * Automatically prompt user for notification and location permissions
   * if they are logged in and permissions are in default / ungranted state.
   */
  async promptAppPermissionsIfNecessary(): Promise<void> {
    if (typeof window === 'undefined') return;

    // 1. Notification Permission
    try {
      if ('Notification' in window) {
        if (Notification.permission === 'default') {
          console.log('[PushService] Prompting for notification permission...');
          await this.requestPermissionAndSubscribe();
        } else if (Notification.permission === 'granted') {
          await this.syncExistingSubscription();
        }
      }
    } catch (err) {
      console.warn('[PushService] Notification permission prompt note:', err);
    }

    // 2. Geolocation Permission (staggered slightly to avoid native browser dialog collision)
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      setTimeout(() => {
        try {
          if ('permissions' in navigator && (navigator.permissions as any).query) {
            (navigator.permissions as any).query({ name: 'geolocation' })
              .then((res: any) => {
                if (res.state === 'prompt') {
                  console.log('[PushService] Prompting for location permission...');
                  navigator.geolocation.getCurrentPosition(
                    (pos) => console.log('[PushService] Geolocation granted:', pos.coords.latitude, pos.coords.longitude),
                    (err) => console.warn('[PushService] Geolocation dismissed/denied:', err),
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
                  );
                }
              })
              .catch(() => {
                navigator.geolocation.getCurrentPosition(
                  () => {},
                  () => {},
                  { enableHighAccuracy: false, timeout: 5000, maximumAge: 120000 }
                );
              });
          } else {
            navigator.geolocation.getCurrentPosition(
              () => {},
              () => {},
              { enableHighAccuracy: false, timeout: 5000, maximumAge: 120000 }
            );
          }
        } catch (err) {
          console.warn('[PushService] Geolocation prompt note:', err);
        }
      }, 600);
    }
  }

  /**
   * Helper: Convert urlBase64 string to Uint8Array for applicationServerKey
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

