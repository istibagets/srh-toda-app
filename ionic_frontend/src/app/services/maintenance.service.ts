import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface MaintenanceStatusResponse {
  status: string;
  is_maintenance: boolean;
  active: boolean;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class MaintenanceService {
  private http = inject(HttpClient);

  readonly isMaintenanceActive = signal<boolean>(false);
  readonly isChecking = signal<boolean>(false);
  readonly maintenanceMessage = signal<string>(
    'The SRH-Link TODA platform is currently undergoing scheduled system maintenance and optimization. Trip booking, terminal queue, and dispatch operations are temporarily paused.'
  );

  private wasInMaintenance = false;

  constructor() {
    this.checkStatus();
  }

  checkStatus(): Promise<boolean> {
    this.isChecking.set(true);
    return new Promise((resolve) => {
      this.http
        .get<MaintenanceStatusResponse>(`${environment.apiUrl}/maintenance-status`, {
          headers: { Accept: 'application/json' },
        })
        .subscribe({
          next: (res) => {
            this.isChecking.set(false);
            const isDown = !!(res?.is_maintenance || res?.active);
            this.handleStateChange(isDown, res?.message);
            resolve(isDown);
          },
          error: (err) => {
            this.isChecking.set(false);
            if (err?.status === 503) {
              this.handleStateChange(true);
              resolve(true);
            } else {
              resolve(this.isMaintenanceActive());
            }
          },
        });
    });
  }

  report503(): void {
    if (!this.isMaintenanceActive()) {
      this.handleStateChange(true);
    }
  }

  setMaintenanceState(isActive: boolean, message?: string): void {
    this.handleStateChange(isActive, message);
  }

  private handleStateChange(isDown: boolean, message?: string): void {
    if (message) {
      this.maintenanceMessage.set(message);
    }

    if (isDown) {
      this.wasInMaintenance = true;
      this.isMaintenanceActive.set(true);
    } else {
      const previouslyDown = this.wasInMaintenance || this.isMaintenanceActive();
      this.isMaintenanceActive.set(false);

      // If transitioning back online, smoothly reload regular user screens to re-initialize dispatch listeners
      if (previouslyDown) {
        this.wasInMaintenance = false;
        if (typeof window !== 'undefined') {
          if (!window.location.pathname.includes('/superadmin')) {
            setTimeout(() => {
              window.location.reload();
            }, 300);
          }
        }
      }
    }
  }
}

