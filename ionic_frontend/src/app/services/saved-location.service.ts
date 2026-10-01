import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap, catchError, map, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface SavedLocation {
  id: number;
  user_id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  type: 'home' | 'work' | 'school' | 'shopping' | 'favorite' | 'custom' | 'market';
  is_default_pickup?: boolean;
  is_default_dropoff?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface NeighborhoodLandmark {
  name: string;
  desc: string;
  fare: number;
  type: 'gate' | 'clubhouse' | 'market' | 'commercial' | 'park' | 'terminal';
  icon: string;
  lat: number;
  lng: number;
}

@Injectable({
  providedIn: 'root',
})
export class SavedLocationService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  private locationsSignal = signal<SavedLocation[]>([]);
  readonly locations = this.locationsSignal.asReadonly();
  readonly isLoading = signal<boolean>(false);

  // Standard Santa Rosa Homes TODA Regulated Landmarks
  private landmarksSignal = signal<NeighborhoodLandmark[]>([
    {
      name: 'Main Gate Guard House',
      desc: 'Main Entrance & Central TODA Bay',
      fare: 50,
      type: 'gate',
      icon: 'shield-outline',
      lat: 15.42955,
      lng: 120.92240,
    },
    {
      name: 'Phase 1 Clubhouse',
      desc: 'Recreation Center & Swimming Pool',
      fare: 50,
      type: 'clubhouse',
      icon: 'business-outline',
      lat: 15.42780,
      lng: 120.92410,
    },
    {
      name: 'Santa Rosa Public Market',
      desc: 'Town Center & Public Market Terminal',
      fare: 60,
      type: 'market',
      icon: 'storefront-outline',
      lat: 15.42469999648076,
      lng: 120.93842748892547,
    },
    {
      name: 'SM Cabanatuan',
      desc: 'SM City Cabanatuan Terminal & Mall Complex',
      fare: 120,
      type: 'commercial',
      icon: 'cart-outline',
      lat: 15.467008627792355,
      lng: 120.95436226867764,
    },
  ]);
  readonly neighborhoodLandmarks = this.landmarksSignal.asReadonly();

  constructor() {
    this.loadLandmarks().subscribe();
  }

  loadLandmarks(): Observable<NeighborhoodLandmark[]> {
    return this.http.get<{ status: string; landmarks: any[] }>(`${environment.apiUrl}/landmarks`).pipe(
      map((res) => {
        if (res && Array.isArray(res.landmarks) && res.landmarks.length > 0) {
          const list: NeighborhoodLandmark[] = res.landmarks.map((lm) => ({
            name: lm.name || 'Landmark',
            desc: lm.desc || '',
            fare: Number(lm.fare || 50),
            type: lm.type || 'custom',
            icon: lm.icon || 'location-outline',
            lat: Number(lm.lat || 15.42470),
            lng: Number(lm.lng || 120.93843),
          }));
          this.landmarksSignal.set(list);
          return list;
        }
        return this.landmarksSignal();
      }),
      catchError(() => of(this.landmarksSignal()))
    );
  }

  setLandmarks(landmarks: NeighborhoodLandmark[]): void {
    if (Array.isArray(landmarks) && landmarks.length > 0) {
      this.landmarksSignal.set(landmarks);
    }
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.token();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  loadSavedLocations(): Observable<SavedLocation[]> {
    this.isLoading.set(true);
    this.loadLandmarks().subscribe();
    const headers = this.getAuthHeaders();
    return this.http.get<{ status: string; locations: SavedLocation[] }>(`${environment.apiUrl}/saved-locations`, { headers }).pipe(
      map((res) => res.locations || []),
      tap((locations) => {
        this.isLoading.set(false);
        this.locationsSignal.set(locations);
      }),
      catchError(() => {
        this.isLoading.set(false);
        return of([]);
      })
    );
  }

  saveLocation(data: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    type?: string;
    is_default_pickup?: boolean;
    is_default_dropoff?: boolean;
  }): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/saved-locations`, data, { headers }).pipe(
      tap(() => {
        this.loadSavedLocations().subscribe();
      })
    );
  }

  updateLocation(id: number, data: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    type?: string;
    is_default_pickup?: boolean;
    is_default_dropoff?: boolean;
  }): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.put<any>(`${environment.apiUrl}/saved-locations/${id}`, data, { headers }).pipe(
      tap(() => {
        this.loadSavedLocations().subscribe();
      })
    );
  }

  deleteLocation(id: number): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.delete<any>(`${environment.apiUrl}/saved-locations/${id}`, { headers }).pipe(
      tap(() => {
        this.locationsSignal.update((list) => list.filter((item) => item.id !== id));
      })
    );
  }

  quickSave(data: { name: string; address: string; latitude: number; longitude: number; type?: string }): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/saved-locations/quick-save`, data, { headers }).pipe(
      tap(() => {
        this.loadSavedLocations().subscribe();
      })
    );
  }
}
