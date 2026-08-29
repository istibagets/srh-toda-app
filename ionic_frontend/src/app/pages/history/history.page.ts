import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonIcon,
  IonSpinner,
  IonModal,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  searchOutline,
  calendarOutline,
  filterOutline,
  timeOutline,
  locationOutline,
  navigateOutline,
  star,
  starOutline,
  cashOutline,
  personOutline,
  closeOutline,
  receiptOutline,
  shieldCheckmarkOutline,
  chatbubbleEllipsesOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  arrowForwardOutline,
  refreshOutline,
  carOutline,
  chevronDownCircleOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { DashboardService, HistoryRideItem, RideHistoryResponse } from '../../services/dashboard.service';
import { DriverService } from '../../services/driver.service';

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonIcon,
    IonSpinner,
    IonModal,
  ],
})
export class HistoryPage implements OnInit {
  authService = inject(AuthService);
  private dashboardService = inject(DashboardService);
  private driverService = inject(DriverService);

  // Reactive State Signals
  isLoading = signal<boolean>(true);
  isRefreshing = signal<boolean>(false);
  rawRides = signal<HistoryRideItem[]>([]);
  selectedTrip = signal<HistoryRideItem | null>(null);
  isReceiptModalOpen = signal<boolean>(false);

  // Filter & Search Signals
  activeStatusFilter = signal<'all' | 'completed' | 'walkin' | 'cancelled'>('all');
  activeRangeFilter = signal<'all' | 'today' | 'week' | 'month'>('all');
  searchQuery = signal<string>('');

  // Summary Metrics from Server / Computed
  serverSummary = signal<{
    total_trips: number;
    total_earnings: number;
    avg_rating: number;
    total_reviews: number;
    five_star_count: number;
  }>({
    total_trips: 0,
    total_earnings: 0,
    avg_rating: 5.0,
    total_reviews: 0,
    five_star_count: 0,
  });

  // Filtered Rides Signal
  filteredRides = computed(() => {
    const status = this.activeStatusFilter();
    const query = this.searchQuery().trim().toLowerCase();
    let list = this.rawRides();

    if (status === 'completed') {
      list = list.filter((r) => r.status === 'completed');
    } else if (status === 'cancelled') {
      list = list.filter((r) => r.status === 'cancelled');
    } else if (status === 'walkin') {
      list = list.filter((r) => r.trip_type === 'terminal_walk_in');
    }

    if (query) {
      list = list.filter(
        (r) =>
          r.destination.toLowerCase().includes(query) ||
          r.pickup_location.toLowerCase().includes(query) ||
          r.passenger_name.toLowerCase().includes(query) ||
          r.trip_id.toLowerCase().includes(query)
      );
    }

    return list;
  });

  // Computed summary metrics
  totalCompletedCount = computed(() => {
    return this.rawRides().filter((r) => r.status === 'completed').length;
  });

  totalRevenue = computed(() => {
    return this.rawRides()
      .filter((r) => r.status === 'completed')
      .reduce((sum, r) => sum + (r.fare || 0), 0);
  });

  averageRating = computed(() => {
    const rated = this.rawRides().filter((r) => r.rating && r.rating > 0);
    if (rated.length === 0) return this.serverSummary().avg_rating || 5.0;
    const avg = rated.reduce((sum, r) => sum + (r.rating || 0), 0) / rated.length;
    return Math.round(avg * 10) / 10;
  });

  constructor() {
    addIcons({
      searchOutline,
      calendarOutline,
      filterOutline,
      timeOutline,
      locationOutline,
      navigateOutline,
      star,
      starOutline,
      cashOutline,
      personOutline,
      closeOutline,
      receiptOutline,
      shieldCheckmarkOutline,
      chatbubbleEllipsesOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      arrowForwardOutline,
      refreshOutline,
      carOutline,
      chevronDownCircleOutline,
    });
  }

  ngOnInit(): void {
    this.loadHistory();
  }

  loadHistory(event?: any): void {
    if (!event) {
      this.isLoading.set(true);
    }

    const filters = {
      status: this.activeStatusFilter(),
      range: this.activeRangeFilter(),
      search: this.searchQuery(),
    };

    this.dashboardService.getRideHistory(filters).subscribe({
      next: (res: RideHistoryResponse) => {
        if (res?.rides) {
          this.rawRides.set(res.rides);
          if (res.summary) {
            this.serverSummary.set(res.summary);
          }
        }
        this.isLoading.set(false);
        if (event) {
          event.target.complete();
        }
      },
      error: (err) => {
        console.warn('Ride history load notice:', err?.status);
        this.isLoading.set(false);
        if (event) {
          event.target.complete();
        }
      },
    });
  }

  setStatusFilter(status: 'all' | 'completed' | 'walkin' | 'cancelled'): void {
    if (this.activeStatusFilter() === status) return;
    this.activeStatusFilter.set(status);
  }

  setRangeFilter(range: 'all' | 'today' | 'week' | 'month'): void {
    if (this.activeRangeFilter() === range) return;
    this.activeRangeFilter.set(range);
    this.loadHistory();
  }

  onSearchChange(event: any): void {
    const val = event?.target?.value || '';
    this.searchQuery.set(val);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  resetAllFilters(): void {
    this.activeStatusFilter.set('all');
    this.activeRangeFilter.set('all');
    this.searchQuery.set('');
    this.loadHistory();
  }

  openTripReceipt(trip: HistoryRideItem): void {
    this.selectedTrip.set(trip);
    this.isReceiptModalOpen.set(true);
  }

  closeTripReceipt(): void {
    this.isReceiptModalOpen.set(false);
    this.selectedTrip.set(null);
  }

  getTripTypeBadge(trip: HistoryRideItem): string {
    if (trip.trip_type === 'terminal_walk_in') return 'Terminal Dispatch';
    if (trip.trip_type === 'wayside_pickup') return 'Wayside Pickup';
    return 'Online Booking';
  }

  getRatingStars(rating?: number | null): number[] {
    const r = Math.round(rating || 5);
    return Array.from({ length: 5 }, (_, i) => (i < r ? 1 : 0));
  }
}
