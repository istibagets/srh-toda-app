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

  lifetimeOverallRating = signal<number>(5.0);
  displayRatingNumber = signal<number>(0.0);
  animatedDashoffset = signal<number>(263.89);
  private ratingAnimFrameId: number | null = null;

  // User Avatar & Performance Computed Signals
  userName = computed(() => {
    const u = this.authService.currentUser();
    return u?.name || 'SRH TODA Member';
  });

  userAvatarUrl = computed(() => {
    const u = this.authService.currentUser();
    return (u as any)?.profile_picture_url || u?.avatar_url || null;
  });

  userInitials = computed(() => {
    const name = this.userName();
    if (!name) return 'SR';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  });

  // Fixed Overall Lifetime Driver Rating (Does NOT change on date filter)
  overallRating = computed(() => {
    return this.lifetimeOverallRating() || 5.0;
  });

  triggerRatingAnimation(): void {
    if (this.ratingAnimFrameId) {
      cancelAnimationFrame(this.ratingAnimFrameId);
    }

    const targetRating = this.overallRating();
    const circumference = 263.89; // 2 * PI * 42
    const pct = Math.min(Math.max(targetRating / 5.0, 0), 1);
    const targetOffset = circumference * (1 - pct);

    const duration = 1200; // 1.2s duration
    const startTime = performance.now();

    this.displayRatingNumber.set(0.0);
    this.animatedDashoffset.set(circumference);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // Cubic ease-out

      const currentNum = ease * targetRating;
      const currentOffset = circumference - (circumference - targetOffset) * ease;

      this.displayRatingNumber.set(Math.round(currentNum * 10) / 10);
      this.animatedDashoffset.set(currentOffset);

      if (progress < 1) {
        this.ratingAnimFrameId = requestAnimationFrame(animate);
      } else {
        this.displayRatingNumber.set(targetRating);
        this.animatedDashoffset.set(targetOffset);
      }
    };

    this.ratingAnimFrameId = requestAnimationFrame(animate);
  }

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

  private hasCapturedLifetimeRating = false;
  private hasAnimatedOnce = false;

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
            // Lock lifetime rating on first load or when viewing all time range
            if (res.summary.avg_rating && (!this.hasCapturedLifetimeRating || filters.range === 'all')) {
              this.lifetimeOverallRating.set(res.summary.avg_rating);
              this.hasCapturedLifetimeRating = true;
            }
          }
        }
        this.isLoading.set(false);

        // Animate rating count-up & arc sweep on initial load or pull-to-refresh
        if (!this.hasAnimatedOnce || event) {
          this.triggerRatingAnimation();
          this.hasAnimatedOnce = true;
        }

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
