import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushService } from './push.service';

export type PermState = 'granted' | 'denied' | 'prompt' | 'unsupported' | 'unavailable';

export interface AppPermissions {
  geolocation: PermState;
  notifications: PermState;
}

/**
 * PermissionService
 * -----------------------------------------------------------------------------
 * Requests all required PWA permissions immediately on app open, on every
 * platform (Web / PWA / iOS Safari PWA / Capacitor WebView).
 *
 * Since this project deploys as a web PWA (no native Capacitor plugins
 * installed), we use standard Web APIs exclusively:
 *
 *  +-------------------------------------------------------------------------+
 *  � Platform               � Strategy                                       �
 *  +------------------------+------------------------------------------------�
 *  � Chrome / Edge / PWA    � Notification API + navigator.permissions       �
 *  � Firefox                � Notification API + geolocation (no Perms API)  �
 *  � iOS Safari =16.4 PWA   � Notification.requestPermission + Geolocation   �
 *  � iOS Safari <16.4       � Geolocation only (no Notification support)     �
 *  � Android Chrome / PWA   � Same as Chrome/Edge                            �
 *  � Capacitor WebView      � Same web APIs (no native plugins loaded)       �
 *  +-------------------------------------------------------------------------+
 *
 * Runtime watchers (via PermissionStatus.onchange) re-prompt automatically
 * if the user revokes permissions in browser / device settings.
 *
 * Call `initOnAppOpen()` once from AppComponent constructor.
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private pushService = inject(PushService);

  /** Reactive permission state � use in templates */
  readonly permissions = signal<AppPermissions>({
    geolocation: 'prompt',
    notifications: 'prompt',
  });

  private _geoWatcher: PermissionStatus | null = null;
  private _notifWatcher: PermissionStatus | null = null;

  // --------------------------------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------------------------------

  /**
   * Call once from AppComponent constructor.
   * Fires the full permission flow immediately, then watches for changes.
   */
  async initOnAppOpen(): Promise<void> {
    if (typeof window === 'undefined') return; // SSR guard

    const platform = this._detectPlatform();
    console.log(`[PermissionService] Platform: ${platform} | isNative: ${Capacitor.isNativePlatform()}`);

    await this._runFlow();

    // Re-check permission states professionally without spamming network subscribe requests
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this._checkOnResume();
      }
    });
  }

  /** Manually trigger the full permission flow (e.g., from a settings button). */
  async requestAll(): Promise<void> {
    await this._runFlow();
  }

  get isGeolocationGranted(): boolean   { return this.permissions().geolocation === 'granted'; }
  get isNotificationsGranted(): boolean { return this.permissions().notifications === 'granted'; }
  get allGranted(): boolean             { return this.isGeolocationGranted && this.isNotificationsGranted; }
  get anyDenied(): boolean {
    const p = this.permissions();
    return p.geolocation === 'denied' || p.notifications === 'denied';
  }

  // --------------------------------------------------------------------------
  // CORE FLOW
  // --------------------------------------------------------------------------

  private async _runFlow(): Promise<void> {
    // Step 1: Notifications (needs user gesture tolerance � ask first)
    await this._requestNotifications();

    // Step 2: Geolocation (500ms delay so two OS dialogs don't collide)
    await this._delay(500);
    await this._requestGeolocation();

    // Step 3: Attach runtime change watchers (no-op if already attached)
    this._attachWatchers();
  }

  // --------------------------------------------------------------------------
  // NOTIFICATIONS
  // --------------------------------------------------------------------------

  private async _requestNotifications(): Promise<void> {
    // iOS Safari < 16.4 and some browsers don't support Notification API
    if (typeof window === 'undefined' || !('Notification' in window)) {
      this._set('notifications', 'unsupported');
      return;
    }

    const current = Notification.permission;
    this._set('notifications', this._mapNotif(current));

    switch (current) {
      case 'granted':
        // Already granted � ensure VAPID subscription is synced to backend
        await this.pushService.syncExistingSubscription().catch(() => {});
        break;

      case 'denied':
        // Browser blocks re-prompting. State stays 'denied'.
        // The UI should guide the user to browser settings.
        console.warn('[PermissionService] Notifications denied � user must enable in browser settings.');
        break;

      case 'default':
        // Show the permission dialog
        try {
          const ok = await this.pushService.requestPermissionAndSubscribe();
          this._set('notifications', ok ? 'granted' : 'denied');
        } catch (e) {
          console.warn('[PermissionService] Notification request failed:', e);
          this._set('notifications', 'unavailable');
        }
        break;
    }
  }

  // --------------------------------------------------------------------------
  // GEOLOCATION
  // --------------------------------------------------------------------------

  private async _requestGeolocation(): Promise<void> {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this._set('geolocation', 'unsupported');
      return;
    }

    // Check current state via Permissions API (Chrome, Edge, Android Chrome)
    // Not available in Firefox private mode or Safari < 16
    if ('permissions' in navigator) {
      try {
        const status = await (navigator.permissions as any).query({ name: 'geolocation' });
        this._set('geolocation', this._mapGeo(status.state));

        if (status.state === 'granted') return; // All good, no dialog needed
        if (status.state === 'denied')  return; // Blocked, cannot re-prompt
        // 'prompt' ? fall through to trigger the dialog
      } catch (_) {
        // Permissions API unsupported � fall through to trigger dialog anyway
      }
    }

    // Trigger the browser's native location permission dialog
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          console.log('[PermissionService] Geolocation granted', pos.coords.latitude, pos.coords.longitude);
          this._set('geolocation', 'granted');
          resolve();
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            console.warn('[PermissionService] Geolocation denied � user must enable in browser/device settings.');
            this._set('geolocation', 'denied');
          } else {
            // POSITION_UNAVAILABLE or TIMEOUT � permission is likely granted but GPS failed
            this._set('geolocation', 'unavailable');
          }
          resolve();
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      );
    });
  }

  // --------------------------------------------------------------------------
  // RUNTIME WATCHERS
  // --------------------------------------------------------------------------

  /**
   * Attach PermissionStatus change listeners so we react in real-time
   * when the user toggles permissions in browser or device settings.
   *
   * Supported: Chrome, Edge, Android Chrome, Opera
   * Not supported: Firefox (Notification query), Safari (neither)
   * ? Handled gracefully via try/catch; visibilitychange covers Safari/Firefox.
   */
  private async _attachWatchers(): Promise<void> {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) return;

    // -- Geolocation watcher ------------------------------------------------
    if (!this._geoWatcher) {
      try {
        this._geoWatcher = await (navigator.permissions as any).query({ name: 'geolocation' });
        this._geoWatcher!.addEventListener('change', () => {
          const state = this._mapGeo(this._geoWatcher!.state as PermissionState);
          this._set('geolocation', state);
          if (state === 'prompt') {
            // Permission was reset (e.g., user cleared site data) � re-prompt
            this._requestGeolocation();
          }
        });
        console.log('[PermissionService] Geolocation watcher attached.');
      } catch (_) {}
    }

    // -- Notification watcher -----------------------------------------------
    if (!this._notifWatcher) {
      try {
        this._notifWatcher = await (navigator.permissions as any).query({ name: 'notifications' });
        this._notifWatcher!.addEventListener('change', () => {
          const state = this._mapNotif(Notification.permission);
          this._set('notifications', state);
          if (state === 'prompt') {
            this._requestNotifications();
          } else if (state === 'granted') {
            this.pushService.syncExistingSubscription().catch(() => {});
          }
        });
        console.log('[PermissionService] Notification watcher attached.');
      } catch (_) {}
    }
  }

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  private _detectPlatform(): string {
    if (Capacitor.isNativePlatform()) return `capacitor-${Capacitor.getPlatform()}`;
    const ua = navigator?.userAgent ?? '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios-web';
    if (/Android/i.test(ua)) return 'android-web';
    return 'web';
  }

  private _set(key: keyof AppPermissions, state: PermState): void {
    const prev = this.permissions()[key];
    if (prev !== state) {
      this.permissions.update((p) => ({ ...p, [key]: state }));
      console.log(`[PermissionService] ${key} -> ${state}`);
    }
  }

  private _mapGeo(state: PermissionState): PermState {
    if (state === 'granted') return 'granted';
    if (state === 'denied')  return 'denied';
    return 'prompt';
  }

  private _mapNotif(perm: NotificationPermission): PermState {
    if (perm === 'granted') return 'granted';
    if (perm === 'denied')  return 'denied';
    return 'prompt';
  }

  private async _checkOnResume(): Promise<void> {
    if (typeof window === 'undefined') return;

    // 1. Notifications permission check
    if ('Notification' in window) {
      const current = Notification.permission;
      this._set('notifications', this._mapNotif(current));
      if (current === 'granted') {
        if (!this.pushService.isSubscribedToBackend()) {
          await this.pushService.syncExistingSubscription().catch(() => {});
        }
      } else if (current === 'denied') {
        this.pushService.isSubscribed.set(false);
      }
    }

    // 2. Geolocation permission check via Permissions API
    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      try {
        const status = await (navigator.permissions as any).query({ name: 'geolocation' });
        this._set('geolocation', this._mapGeo(status.state));
      } catch (_) {}
    }
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
