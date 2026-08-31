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
  type: 'home' | 'work' | 'school' | 'shopping' | 'favorite' | 'custom';
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
  readonly neighborhoodLandmarks: NeighborhoodLandmark[] = [
    {
      name: 'Main Gate Guard House',
      desc: 'Main Entrance & Central TODA Bay',
      fare: 20,
      type: 'gate',
      icon: 'shield-outline',
      lat: 15.42955,
      lng: 120.92240,
    },
    {
      name: 'Phase 1 Clubhouse',
      desc: 'Recreation Center & Swimming Pool',
      fare: 25,
      type: 'clubhouse',
      icon: 'business-outline',
      lat: 15.42780,
      lng: 120.92410,
    },
    {
      name: 'Phase 2 Community Park',
      desc: 'Playground & Basketball Court',
      fare: 30,
      type: 'park',
      icon: 'football-outline',
      lat: 15.43120,
      lng: 120.92050,
    },
    {
      name: 'Commercial Strip / Plaza',
      desc: 'Groceries, Bakeries & Eateries',
      fare: 20,
      type: 'commercial',
      icon: 'cart-outline',
      lat: 15.42990,
      lng: 120.92380,
    },
    {
      name: 'Santa Rosa Public Market',
      desc: 'Town Center & Public Market Terminal',
      fare: 35,
      type: 'market',
      icon: 'storefront-outline',
      lat: 15.43550,
      lng: 120.92640,
    },
    {
      name: 'TODA Central Station',
      desc: 'Primary Dispatch & Driver Terminal',
      fare: 20,
      type: 'terminal',
      icon: 'navigate-outline',
      lat: 15.42955,
      lng: 120.92240,
    },
  ];

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.token();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  loadSavedLocations(): Observable<SavedLocation[]> {
    this.isLoading.set(true);
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
