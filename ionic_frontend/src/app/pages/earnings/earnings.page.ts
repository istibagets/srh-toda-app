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
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  walletOutline,
  trendingUpOutline,
  cashOutline,
  pieChartOutline,
  calendarOutline,
  timeOutline,
  checkmarkCircleOutline,
  chevronForwardOutline,
  arrowUpOutline,
  arrowDownOutline,
  locationOutline,
  carOutline,
  personOutline,
  sparklesOutline,
  chevronDownCircleOutline,
  star,
  starOutline,
  chatbubbleEllipsesOutline,
  thumbsUpOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import {
  DashboardService,
  DailyEarningsBar,
  TripSourceItem,
  EarningsLedgerItem,
  DriverReviewItem,
  EarningsSummaryResponse,
} from '../../services/dashboard.service';

@Component({
  selector: 'app-earnings',
  templateUrl: './earnings.page.html',
  styleUrls: ['./earnings.page.scss'],
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
  ],
})
export class EarningsPage implements OnInit {
  authService = inject(AuthService);
  private dashboardService = inject(DashboardService);

  // Reactive State Signals
  isLoading = signal<boolean>(true);
  isAnimating = signal<boolean>(true);
  activePeriod = signal<'today' | 'week' | 'month' | 'all'>('week');
  selectedBar = signal<DailyEarningsBar | null>(null);

  // Lifetime Rating & Radial Animation State
  lifetimeOverallRating = signal<number>(5.0);
  displayRatingNumber = signal<number>(5.0);
  animatedDashoffset = signal<number>(0);
  private ratingAnimFrameId: number | null = null;
  private hasAnimatedOnce = false;

  // User Profile & Rating Computed Signals
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

  overallRating = computed(() => {
    return this.lifetimeOverallRating() || 5.0;
  });

  // Financial Analytics State
  summary = signal<{
    total_earnings: number;
    total_trips: number;
    avg_fare: number;
    today_earnings: number;
    today_trips_count: number;
    peak_day_name: string;
    peak_day_earnings: number;
    avg_rating?: number;
    rating_count?: number;
  }>({
    total_earnings: 0,
    total_trips: 0,
    avg_fare: 0,
    today_earnings: 0,
    today_trips_count: 0,
    peak_day_name: 'N/A',
    peak_day_earnings: 0,
    avg_rating: 5.0,
    rating_count: 0,
  });

  chartBars = signal<DailyEarningsBar[]>([]);
  sources = signal<TripSourceItem[]>([]);
  recentLedger = signal<EarningsLedgerItem[]>([]);
  ratings = signal<DriverReviewItem[]>([]);

  // Computed properties
  maxDayEarnings = computed(() => {
    const bars = this.chartBars();
    if (bars.length === 0) return 1;
    return Math.max(...bars.map((b) => b.earnings), 1);
  });

  constructor() {
    addIcons({
      walletOutline,
      trendingUpOutline,
      cashOutline,
      pieChartOutline,
      calendarOutline,
      timeOutline,
      checkmarkCircleOutline,
      chevronForwardOutline,
      arrowUpOutline,
      arrowDownOutline,
      locationOutline,
      carOutline,
      personOutline,
      sparklesOutline,
      chevronDownCircleOutline,
      star,
      starOutline,
      chatbubbleEllipsesOutline,
      thumbsUpOutline,
    });
  }

  ngOnInit(): void {
    this.loadEarningsData();
  }

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

  loadEarningsData(event?: any): void {
    if (!event) {
      this.isLoading.set(true);
    }
    this.triggerAnimation();

    this.dashboardService.getEarningsSummary(this.activePeriod()).subscribe({
      next: (res: EarningsSummaryResponse) => {
        if (res?.summary) {
          this.summary.set(res.summary);
          if (res.summary.avg_rating !== undefined && res.summary.avg_rating !== null) {
            this.lifetimeOverallRating.set(res.summary.avg_rating);
          }
          this.chartBars.set(res.chart || []);
          this.sources.set(res.sources || []);
          this.recentLedger.set(res.ledger || []);
          this.ratings.set(res.ratings || []);

          // Auto-select today's bar or highest bar for interactive tooltip
          const todayBar = (res.chart || []).find((b) => b.is_today);
          if (todayBar) {
            this.selectedBar.set(todayBar);
          } else if (res.chart && res.chart.length > 0) {
            this.selectedBar.set(res.chart[res.chart.length - 1]);
          }
        }
        this.isLoading.set(false);

        // Animate radial rating ring on initial load or pull-to-refresh
        if (!this.hasAnimatedOnce || event) {
          this.triggerRatingAnimation();
          this.hasAnimatedOnce = true;
        }

        if (event) {
          event.target.complete();
        }
      },
      error: (err) => {
        console.warn('Earnings load notice:', err?.status);
        this.isLoading.set(false);
        this.triggerRatingAnimation();
        if (event) {
          event.target.complete();
        }
      },
    });
  }

  setPeriod(period: 'today' | 'week' | 'month' | 'all'): void {
    if (this.activePeriod() === period) return;
    this.activePeriod.set(period);
    this.loadEarningsData();
  }

  selectBar(bar: DailyEarningsBar): void {
    this.selectedBar.set(bar);
  }

  private triggerAnimation(): void {
    this.isAnimating.set(false);
    setTimeout(() => {
      this.isAnimating.set(true);
    }, 50);
  }
}
