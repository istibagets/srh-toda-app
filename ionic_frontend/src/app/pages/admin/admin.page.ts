import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonIcon,
  IonModal,
  AlertController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  shieldCheckmarkOutline,
  personOutline,
  peopleOutline,
  searchOutline,
  closeOutline,
  alertCircleOutline,
  warningOutline,
  documentAttachOutline,
  openOutline,
  checkmarkOutline,
  banOutline,
  swapVerticalOutline,
  megaphoneOutline,
  chatbubbleEllipsesOutline,
  chevronDownCircleOutline,
  chevronForwardOutline,
  timeOutline,
  cashOutline,
  carOutline,
  star,
  refreshOutline,
  printOutline,
  downloadOutline,
  logOutOutline,
  trashOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import {
  DashboardService,
  AdminDriverItem,
  AdminQueueItem,
  AdminReportItem,
  AdminAnnouncementItem,
  AdminOverviewResponse,
} from '../../services/dashboard.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss'],
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
    IonModal,
  ],
})
export class AdminPage implements OnInit {
  authService = inject(AuthService);
  private dashboardService = inject(DashboardService);
  private router = inject(Router);
  private alertController = inject(AlertController);

  // Reactive Navigation & Filter Signals
  isLoading = signal<boolean>(true);
  isProcessing = signal<boolean>(false);
  activeTab = signal<'drivers' | 'queue' | 'reports' | 'broadcast'>('drivers');
  statusFilter = signal<'all' | 'Pending' | 'Approved' | 'Suspended'>('all');
  searchQuery = signal<string>('');

  // Overview Datasets Signals
  summary = signal({
    total_drivers: 0,
    active_online_drivers: 0,
    pending_applicants: 0,
    suspended_drivers: 0,
    open_reports: 0,
    total_completed_rides: 0,
    total_toda_revenue: 0,
  });

  drivers = signal<AdminDriverItem[]>([]);
  queue = signal<AdminQueueItem[]>([]);
  reports = signal<AdminReportItem[]>([]);
  announcements = signal<AdminAnnouncementItem[]>([]);

  // Modals & Interactive State Signals
  selectedDriver = signal<AdminDriverItem | null>(null);
  isDriverModalOpen = signal<boolean>(false);
  suspensionReasonInput = signal<string>('');

  selectedReport = signal<AdminReportItem | null>(null);
  isReportModalOpen = signal<boolean>(false);
  reportStatusInput = signal<'pending' | 'investigating' | 'resolved' | 'dismissed'>('investigating');
  reportNotesInput = signal<string>('');

  isBroadcastModalOpen = signal<boolean>(false);
  broadcastTitle = signal<string>('');
  broadcastMessage = signal<string>('');
  broadcastAudience = signal<'ALL' | 'DRIVERS' | 'PASSENGERS'>('ALL');

  // Print Modal State
  isPrintModalOpen = signal<boolean>(false);
  printReportType = signal<'drivers' | 'queue' | 'reports'>('drivers');
  currentDateFormatted = computed(() => {
    return new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  });

  // Filtered Drivers Computed
  filteredDrivers = computed(() => {
    const status = this.statusFilter();
    const query = this.searchQuery().trim().toLowerCase();
    let list = this.drivers();

    if (status !== 'all') {
      list = list.filter((d) => d.compliance_status === status);
    }

    if (query) {
      list = list.filter(
        (d) =>
          d.full_name.toLowerCase().includes(query) ||
          d.mtop_number.toLowerCase().includes(query) ||
          d.email.toLowerCase().includes(query) ||
          d.phone_number.toLowerCase().includes(query)
      );
    }

    return list;
  });

  // Action Needed Count (Pending Applicants + Open Disputes)
  actionNeededCount = computed(() => {
    return (this.summary().pending_applicants || 0) + (this.summary().open_reports || 0);
  });

  constructor() {
    addIcons({
      shieldCheckmarkOutline,
      personOutline,
      peopleOutline,
      searchOutline,
      closeOutline,
      alertCircleOutline,
      warningOutline,
      documentAttachOutline,
      openOutline,
      checkmarkOutline,
      banOutline,
      swapVerticalOutline,
      megaphoneOutline,
      chatbubbleEllipsesOutline,
      chevronDownCircleOutline,
      chevronForwardOutline,
      timeOutline,
      cashOutline,
      carOutline,
      star,
      refreshOutline,
      printOutline,
      downloadOutline,
      logOutOutline,
      trashOutline,
    });
  }

  ngOnInit(): void {
    this.loadAdminData();
  }

  loadAdminData(event?: any): void {
    if (!event) {
      this.isLoading.set(true);
    }

    this.dashboardService.getAdminOverview().subscribe({
      next: (res: AdminOverviewResponse) => {
        if (res?.summary) {
          this.summary.set(res.summary);
          this.drivers.set(res.drivers || []);
          this.queue.set(res.queue || []);
          this.reports.set(res.reports || []);
          this.announcements.set(res.announcements || []);
        }
        this.isLoading.set(false);
        if (event) {
          event.target.complete();
        }
      },
      error: (err) => {
        console.warn('Admin overview notice:', err?.status);
        this.isLoading.set(false);
        if (event) {
          event.target.complete();
        }
      },
    });
  }

  setTab(tab: 'drivers' | 'queue' | 'reports' | 'broadcast'): void {
    this.activeTab.set(tab);
  }

  setStatusFilter(status: 'all' | 'Pending' | 'Approved' | 'Suspended'): void {
    this.statusFilter.set(status);
  }

  onSearchChange(event: any): void {
    this.searchQuery.set(event?.target?.value || '');
  }

  onActionNeededClick(): void {
    if (this.summary().pending_applicants > 0) {
      this.setTab('drivers');
      this.setStatusFilter('Pending');
    } else if (this.summary().open_reports > 0) {
      this.setTab('reports');
    } else {
      this.setTab('drivers');
    }
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  // ── DRIVER COMPLIANCE ACTIONS ──────────────────────────
  openDriverModal(driver: AdminDriverItem): void {
    this.selectedDriver.set(driver);
    this.suspensionReasonInput.set(driver.suspension_reason || '');
    this.isDriverModalOpen.set(true);
  }

  closeDriverModal(): void {
    this.isDriverModalOpen.set(false);
    this.selectedDriver.set(null);
  }

  updateCompliance(status: 'Approved' | 'Pending' | 'Suspended' | 'Rejected', reason?: string): void {
    const driver = this.selectedDriver();
    if (!driver) return;

    this.isProcessing.set(true);
    this.dashboardService
      .updateDriverCompliance({
        driver_id: driver.id,
        compliance_status: status,
        suspension_reason: reason || this.suspensionReasonInput(),
      })
      .subscribe({
        next: () => {
          this.isProcessing.set(false);
          this.closeDriverModal();
          this.loadAdminData();
        },
        error: (err) => {
          console.error('Compliance update error:', err);
          this.isProcessing.set(false);
        },
      });
  }

  // ── REPORT RESOLUTION ACTIONS ──────────────────────────
  openReportModal(report: AdminReportItem): void {
    this.selectedReport.set(report);
    this.reportStatusInput.set(report.status);
    this.reportNotesInput.set(report.admin_notes || '');
    this.isReportModalOpen.set(true);
  }

  closeReportModal(): void {
    this.isReportModalOpen.set(false);
    this.selectedReport.set(null);
  }

  submitReportResolution(): void {
    const report = this.selectedReport();
    if (!report) return;

    this.isProcessing.set(true);
    this.dashboardService
      .resolveReport({
        report_id: report.id,
        status: this.reportStatusInput(),
        admin_notes: this.reportNotesInput(),
      })
      .subscribe({
        next: () => {
          this.isProcessing.set(false);
          this.closeReportModal();
          this.loadAdminData();
        },
        error: (err) => {
          console.error('Report resolution error:', err);
          this.isProcessing.set(false);
        },
      });
  }

  // ── BROADCAST ANNOUNCEMENT ACTIONS ────────────────────
  openBroadcastModal(): void {
    this.broadcastTitle.set('');
    this.broadcastMessage.set('');
    this.broadcastAudience.set('ALL');
    this.isBroadcastModalOpen.set(true);
  }

  closeBroadcastModal(): void {
    this.isBroadcastModalOpen.set(false);
  }

  submitBroadcast(): void {
    const title = this.broadcastTitle().trim();
    const msg = this.broadcastMessage().trim();
    if (!title || !msg) return;

    this.isProcessing.set(true);
    this.dashboardService
      .createAnnouncement({
        title,
        message: msg,
        target_audience: this.broadcastAudience(),
      })
      .subscribe({
        next: () => {
          this.isProcessing.set(false);
          this.closeBroadcastModal();
          this.loadAdminData();
        },
        error: (err) => {
          console.error('Broadcast error:', err);
          this.isProcessing.set(false);
        },
      });
  }

  // ── QUEUE MANAGEMENT ACTIONS ──────────────────────────
  async confirmRemoveFromQueue(item: AdminQueueItem): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Remove from Queue?',
      subHeader: `${item.driver_name} (MTOP #${item.mtop_number})`,
      message: 'Are you sure you want to remove this driver from the active terminal dispatch line and set them offline?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Remove & Offline',
          role: 'destructive',
          handler: () => {
            this.removeDriverFromQueue(item.driver_id);
          },
        },
      ],
    });

    await alert.present();
  }

  removeDriverFromQueue(driverId: number): void {
    this.isProcessing.set(true);
    this.dashboardService.removeFromQueue(driverId).subscribe({
      next: () => {
        this.isProcessing.set(false);
        this.loadAdminData();
      },
      error: (err) => {
        console.error('Failed to remove driver from queue:', err);
        this.isProcessing.set(false);
      },
    });
  }

  // ── PRINT & EXPORT FEATURES ────────────────────────────
  goToReportGenerator(): void {
    this.router.navigate(['/admin-reports']);
  }
}
