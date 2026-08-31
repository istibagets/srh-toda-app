import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface Landmark {
  name: string;
  desc: string;
  fare: number;
}

export interface QueueDriver {
  id: number;
  user_id: number;
  full_name: string;
  mtop_number: string;
  queue_position: number;
}

export interface TransitRide {
  id: number;
  driver_name: string;
  mtop_number: string;
  passenger: string;
  pickup: string;
  destination: string;
  fare: number;
  status: string;
}

export interface DashboardData {
  status: string;
  role: 'passenger' | 'driver' | 'admin' | 'superadmin';
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    avatar_url?: string;
    phone_number?: string;
  };
  passenger?: {
    active_ride: any;
    recent_rides: Array<{
      id: number;
      pickup: string;
      destination: string;
      fare: number;
      status: string;
      created_at: string;
    }>;
    landmarks: Landmark[];
    active_drivers_count: number;
    terminal_queue_count: number;
  };
  driver?: {
    profile: {
      id: number;
      full_name: string;
      mtop_number: string;
      compliance_status: string;
      is_online: boolean;
      queue_position: number | null;
      rating?: number;
      suspension_reason?: string;
    } | null;
    today_rides_count: number;
    today_earnings: number;
    total_queue_count: number;
    active_ride: any;
    active_queue?: QueueDriver[];
    drivers_in_transit?: TransitRide[];
  };
  admin?: {
    total_passengers: number;
    total_drivers: number;
    pending_applicants: number;
    online_drivers: number;
    today_rides: number;
    today_total_fare: number;
    active_rides_count: number;
    active_queue?: QueueDriver[];
  };
}

@Injectable({
  providedIn: 'root',
  })
export class DashboardService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.token();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  getDashboardData(): Observable<DashboardData> {
    const headers = this.getAuthHeaders();
    return this.http.get<DashboardData>(`${environment.apiUrl}/home/dashboard`, { headers });
  }

  toggleDriverDuty(targetState?: boolean): Observable<any> {
    const headers = this.getAuthHeaders();
    const payload = targetState !== undefined ? { is_online: targetState, target_state: targetState } : {};
    return this.http.post<any>(`${environment.apiUrl}/driver/toggle-duty`, payload, { headers });
  }

  startWalkIn(details: { destination: string; passenger_count: number; fare: number }): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/driver/start-walkin`, details, { headers });
  }

  completeDropOff(details: { fare: number }): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/driver/complete-dropoff`, details, { headers });
  }

  startWayside(details: { destination: string; passenger_count: number; fare: number }): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/driver/start-wayside`, details, { headers });
  }

  returnToTerminal(): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/driver/return-terminal`, {}, { headers });
  }

  reorderQueue(driverIds: number[]): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(
      `${environment.apiUrl}/admin/reorder-queue`,
      { driver_ids: driverIds },
      { headers }
    );
  }

  updateDriverLocation(coords: { lat: number; lng: number; heading?: number; speed?: number; ride_id?: number }): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/driver/update-location`, coords, { headers });
  }

  requestPassengerRide(details: {
    destination: string;
    pickup_location?: string;
    fare?: number;
    passenger_count?: number;
    notes?: string;
    pickup_lat?: number;
    pickup_lng?: number;
    destination_lat?: number;
    destination_lng?: number;
  }): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/rides/request`, details, { headers });
  }

  getActiveRide(): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.get<any>(`${environment.apiUrl}/rides/active`, { headers });
  }

  cancelActiveRide(rideId: number): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/rides/${rideId}/cancel`, {}, { headers });
  }

  proposeFare(rideId: number, fare: number): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/rides/${rideId}/propose-fare`, { fare }, { headers });
  }

  acceptFare(rideId: number): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/rides/${rideId}/accept-fare`, {}, { headers });
  }

  driverArrived(rideId: number): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/rides/${rideId}/driver-arrived`, {}, { headers });
  }

  startTrip(rideId: number): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/rides/${rideId}/start-trip`, {}, { headers });
  }

  getChatMessages(rideId: number): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.get<any>(`${environment.apiUrl}/rides/${rideId}/messages`, { headers });
  }

  sendChatMessage(rideId: number, message: string): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/rides/${rideId}/messages`, { message }, { headers });
  }

  rateRide(rideId: number, ratingData: { rating: number; review_comment?: string; feedback_tags?: string[] }): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/rides/${rideId}/rate`, ratingData, { headers });
  }

  reportDriver(rideId: number, data: { category: string; subject: string; description: string }): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/rides/${rideId}/report`, data, { headers });
  }

  getRideHistory(filters?: { status?: string; range?: string; search?: string }): Observable<RideHistoryResponse> {
    const headers = this.getAuthHeaders();
    let params: any = {};
    if (filters?.status && filters.status !== 'all') params.status = filters.status;
    if (filters?.range && filters.range !== 'all') params.range = filters.range;
    if (filters?.search) params.search = filters.search;
    return this.http.get<RideHistoryResponse>(`${environment.apiUrl}/rides/history`, { headers, params });
  }

  getEarningsSummary(period: string = 'week'): Observable<EarningsSummaryResponse> {
    const headers = this.getAuthHeaders();
    return this.http.get<EarningsSummaryResponse>(`${environment.apiUrl}/driver/earnings`, {
      headers,
      params: { period },
    });
  }

  getAdminOverview(): Observable<AdminOverviewResponse> {
    const headers = this.getAuthHeaders();
    return this.http.get<AdminOverviewResponse>(`${environment.apiUrl}/admin/overview`, { headers });
  }

  updateDriverCompliance(data: { driver_id: number; compliance_status: string; suspension_reason?: string }): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/admin/driver-compliance`, data, { headers });
  }

  resolveReport(data: { report_id: number; status: string; admin_notes?: string }): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/admin/resolve-report`, data, { headers });
  }

  createAnnouncement(data: { title: string; message: string; target_audience?: string }): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/admin/announcement`, data, { headers });
  }

  removeFromQueue(driverId: number): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.post<any>(`${environment.apiUrl}/admin/remove-from-queue`, { driver_id: driverId }, { headers });
  }
}

export interface HistoryRideItem {
  id: number;
  trip_id: string;
  passenger_id?: number | null;
  passenger_name: string;
  passenger_phone?: string;
  driver_name: string;
  mtop_number: string;
  pickup_location: string;
  pickup_lat?: number;
  pickup_lng?: number;
  destination: string;
  destination_lat?: number;
  destination_lng?: number;
  fare: number;
  status: string;
  trip_type: 'terminal_walk_in' | 'online_dispatch' | 'wayside_pickup';
  rating?: number | null;
  review_comment?: string | null;
  feedback_tags?: string[];
  created_at: string;
  created_time: string;
  created_date: string;
  completed_at?: string;
}

export interface RideHistoryResponse {
  status: string;
  summary: {
    total_trips: number;
    total_earnings: number;
    avg_rating: number;
    total_reviews: number;
    five_star_count: number;
  };
  rides: HistoryRideItem[];
}

export interface DailyEarningsBar {
  day_name: string;
  full_day: string;
  date: string;
  is_today: boolean;
  earnings: number;
  trips_count: number;
  height_pct: number;
}

export interface TripSourceItem {
  type: string;
  label: string;
  earnings: number;
  trips_count: number;
  pct: number;
  color: string;
}

export interface EarningsLedgerItem {
  id: number;
  trip_id: string;
  passenger_name: string;
  pickup: string;
  destination: string;
  fare: number;
  trip_type: string;
  created_at: string;
  time_only: string;
  payment_method: string;
}

export interface DriverReviewItem {
  id: number;
  trip_id: string;
  passenger_name: string;
  rating: number;
  review_comment?: string;
  feedback_tags?: string[];
  destination: string;
  fare: number;
  created_at: string;
  time_only?: string;
}

export interface EarningsSummaryResponse {
  status: string;
  period: string;
  summary: {
    total_earnings: number;
    total_trips: number;
    avg_fare: number;
    today_earnings: number;
    today_trips_count: number;
    peak_day_name: string;
    peak_day_earnings: number;
  };
  chart: DailyEarningsBar[];
  sources: TripSourceItem[];
  ledger: EarningsLedgerItem[];
  ratings?: DriverReviewItem[];
}

export interface AdminDriverItem {
  id: number;
  user_id: number;
  full_name: string;
  email: string;
  phone_number: string;
  avatar_url?: string | null;
  mtop_number: string;
  compliance_status: 'Approved' | 'Pending' | 'Suspended' | 'Rejected';
  suspension_reason?: string | null;
  appeal_status?: string | null;
  appeal_message?: string | null;
  appeal_attachments?: Array<{ name: string; url?: string; extension?: string }>;
  appealed_at?: string | null;
  is_online: boolean;
  queue_position?: number | null;
  average_rating: number;
  rating_count: number;
  mtop_certificate_url?: string | null;
  drivers_license_url?: string | null;
  created_at: string;
}

export interface AdminQueueItem {
  id: number;
  driver_id: number;
  driver_name: string;
  mtop_number: string;
  position: number;
  status: string;
  avatar_url?: string | null;
  time_joined: string;
}

export interface AdminReportItem {
  id: number;
  report_id: string;
  reporter_name: string;
  driver_name: string;
  driver_mtop: string;
  driver_id: number;
  category: string;
  subject: string;
  description: string;
  status: 'pending' | 'investigating' | 'resolved' | 'dismissed';
  admin_notes?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

export interface AdminAnnouncementItem {
  id: number;
  title: string;
  message: string;
  target_audience: string;
  created_at: string;
}

export interface AdminOverviewResponse {
  status: string;
  summary: {
    total_drivers: number;
    active_online_drivers: number;
    pending_applicants: number;
    suspended_drivers: number;
    open_reports: number;
    total_completed_rides: number;
    total_toda_revenue: number;
  };
  drivers: AdminDriverItem[];
  queue: AdminQueueItem[];
  reports: AdminReportItem[];
  announcements: AdminAnnouncementItem[];
}
