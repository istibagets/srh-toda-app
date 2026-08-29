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
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import {
  DashboardService,
  DailyEarningsBar,
  TripSourceItem,
  EarningsLedgerItem,
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

  // Financial Analytics State
  summary = signal({
    total_earnings: 0,
    total_trips: 0,
    avg_fare: 0,
    today_earnings: 0,
    today_trips_count: 0,
    peak_day_name: 'N/A',
    peak_day_earnings: 0,
  });

  chartBars = signal<DailyEarningsBar[]>([]);
  sources = signal<TripSourceItem[]>([]);
  recentLedger = signal<EarningsLedgerItem[]>([]);

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
    });
  }

  ngOnInit(): void {
    this.loadEarningsData();
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
          this.chartBars.set(res.chart || []);
          this.sources.set(res.sources || []);
          this.recentLedger.set(res.ledger || []);

          // Auto-select today's bar or highest bar for interactive tooltip
          const todayBar = (res.chart || []).find((b) => b.is_today);
          if (todayBar) {
            this.selectedBar.set(todayBar);
          } else if (res.chart && res.chart.length > 0) {
            this.selectedBar.set(res.chart[res.chart.length - 1]);
          }
        }
        this.isLoading.set(false);
        if (event) {
          event.target.complete();
        }
      },
      error: (err) => {
        console.warn('Earnings load notice:', err?.status);
        this.isLoading.set(false);
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
