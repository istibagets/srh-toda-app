import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError, map, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { User, AuthResponse, CheckFieldResponse } from '../models/user.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private readonly TOKEN_KEY = 'srh_auth_token';
  private readonly USER_KEY = 'srh_user';

  // Reactive signals
  private currentUserSignal = signal<User | null>(null);
  private tokenSignal = signal<string | null>(null);
  private isLoadedSignal = signal<boolean>(false);

  // Readonly computed states
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly token = this.tokenSignal.asReadonly();
  readonly isLoaded = this.isLoadedSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.currentUserSignal() && !!this.tokenSignal());
  readonly userRole = computed(() => this.currentUserSignal()?.role ?? null);
  readonly isPassenger = computed(() => this.currentUserSignal()?.role === 'passenger');
  readonly isDriver = computed(() => this.currentUserSignal()?.role === 'driver');
  readonly isAdmin = computed(() => this.currentUserSignal()?.role === 'admin' || this.currentUserSignal()?.role === 'superadmin');

  constructor() {
    this.loadPersistedAuth();
  }

  /**
   * Load stored authentication credentials on startup.
   */
  private loadPersistedAuth(): void {
    try {
      const savedToken = localStorage.getItem(this.TOKEN_KEY);
      const savedUserStr = localStorage.getItem(this.USER_KEY);

      if (savedToken && savedUserStr) {
        const user: User = JSON.parse(savedUserStr);
        this.tokenSignal.set(savedToken);
        this.currentUserSignal.set(user);

        // Refresh profile in background but don't aggressively logout on transient server restarts
        this.fetchProfile().subscribe({
          error: (err) => {
            console.warn('Background profile refresh notice:', err?.status);
          },
        });
      }
    } catch (e) {
    } finally {
      this.isLoadedSignal.set(true);
    }
  }

  /**
   * Login user with email & password.
   */
  login(credentials: { email: string; password: string }): Observable<AuthResponse> {
    const url = `${environment.apiUrl}/auth/login`;
    return this.http.post<AuthResponse>(url, credentials).pipe(
      tap((res) => {
        if (res.status === 'success' && res.token && res.user) {
          this.setSession(res.token, res.user);
        }
      }),
      catchError((err) => {
        let message = err.error?.message;
        if (err.error?.errors) {
          const firstKey = Object.keys(err.error.errors)[0];
          if (firstKey && Array.isArray(err.error.errors[firstKey]) && err.error.errors[firstKey].length) {
            message = err.error.errors[firstKey][0];
          }
        }
        message = message || 'Login failed. Please check your credentials.';
        return throwError(() => new Error(message));
      })
    );
  }

  /**
   * Register a new passenger or driver account.
   */
  register(data: FormData | Record<string, any>): Observable<AuthResponse> {
    const url = `${environment.apiUrl}/auth/register`;
    return this.http.post<AuthResponse>(url, data).pipe(
      tap((res) => {
        if (res.status === 'success' && res.token && res.user) {
          this.setSession(res.token, res.user);
        }
      }),
      catchError((err) => {
        let message = err.error?.message;
        if (err.error?.errors) {
          const firstKey = Object.keys(err.error.errors)[0];
          if (firstKey && Array.isArray(err.error.errors[firstKey]) && err.error.errors[firstKey].length) {
            message = err.error.errors[firstKey][0];
          }
        }
        message = message || 'Registration failed. Please check your details.';
        return throwError(() => new Error(message));
      })
    );
  }

  /**
   * Check field uniqueness (email / phone_number) against the database.
   */
  checkField(field: 'email' | 'phone_number', value: string): Observable<boolean> {
    if (!value || !value.trim()) {
      return of(true);
    }
    const url = `${environment.apiUrl}/auth/check-field`;
    return this.http.post<CheckFieldResponse>(url, { field, value: value.trim() }).pipe(
      map((res) => res.available),
      catchError(() => of(true))
    );
  }

  /**
   * Fetch current authenticated user info.
   */
  fetchProfile(): Observable<User | null> {
    const token = this.tokenSignal();
    if (!token) return of(null);

    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const url = `${environment.apiUrl}/auth/user`;

    return this.http.get<{ status: string; user: User }>(url, { headers }).pipe(
      map((res) => res.user),
      tap((user) => {
        if (user) {
          this.currentUserSignal.set(user);
          localStorage.setItem(this.USER_KEY, JSON.stringify(user));
        }
      })
    );
  }

  /**
   * Update profile details (name, phone_number).
   */
  updateProfile(data: { name: string; phone_number: string }): Observable<any> {
    const token = this.tokenSignal();
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const url = `${environment.apiUrl}/auth/profile`;

    return this.http.put<any>(url, data, { headers }).pipe(
      tap((res) => {
        if (res.status === 'success' && res.user) {
          const current = this.currentUserSignal();
          if (current) {
            const updated = { ...current, ...res.user };
            this.currentUserSignal.set(updated);
            localStorage.setItem(this.USER_KEY, JSON.stringify(updated));
          }
        }
      }),
      catchError((err) => {
        let message = err.error?.message;
        if (err.error?.errors) {
          const firstKey = Object.keys(err.error.errors)[0];
          if (firstKey && err.error.errors[firstKey]?.length) {
            message = err.error.errors[firstKey][0];
          }
        }
        return throwError(() => new Error(message || 'Failed to update profile.'));
      })
    );
  }

  /**
   * Change user password.
   */
  updatePassword(data: { current_password: string; password: string; password_confirmation: string }): Observable<any> {
    const token = this.tokenSignal();
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const url = `${environment.apiUrl}/auth/password`;

    return this.http.put<any>(url, data, { headers }).pipe(
      catchError((err) => {
        let message = err.error?.message;
        if (err.error?.errors) {
          const firstKey = Object.keys(err.error.errors)[0];
          if (firstKey && err.error.errors[firstKey]?.length) {
            message = err.error.errors[firstKey][0];
          }
        }
        return throwError(() => new Error(message || 'Failed to update password.'));
      })
    );
  }

  /**
   * Upload profile avatar photo.
   */
  uploadAvatar(file: File): Observable<any> {
    const token = this.tokenSignal();
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const url = `${environment.apiUrl}/auth/avatar`;

    const formData = new FormData();
    formData.append('photo', file);

    return this.http.post<any>(url, formData, { headers }).pipe(
      tap((res) => {
        if (res.status === 'success' && res.avatar_url) {
          const current = this.currentUserSignal();
          if (current) {
            const updated = { ...current, avatar_url: res.avatar_url };
            this.currentUserSignal.set(updated);
            localStorage.setItem(this.USER_KEY, JSON.stringify(updated));
          }
        }
      }),
      catchError((err) => {
        return throwError(() => new Error(err.error?.message || 'Failed to upload photo.'));
      })
    );
  }

  /**
   * Logout user and invalidate token.
   */
  logout(): void {
    const token = this.tokenSignal();
    if (token) {
      const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
      this.http.post(`${environment.apiUrl}/auth/logout`, {}, { headers }).subscribe({
        next: () => {},
        error: () => {},
      });
    }

    this.clearSession();
    this.router.navigate(['/login'], { replaceUrl: true });
  }

  /**
   * Set authentication session.
   */
  private setSession(token: string, user: User): void {
    this.tokenSignal.set(token);
    this.currentUserSignal.set(user);
    try {
      localStorage.setItem(this.TOKEN_KEY, token);
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    } catch (e) {}
  }

  /**
   * Clear session from memory and storage.
   */
  private clearSession(): void {
    this.tokenSignal.set(null);
    this.currentUserSignal.set(null);
    try {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
    } catch (e) {}
  }
}
