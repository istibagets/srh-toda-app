import { Component, inject, signal, computed, OnInit, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonContent,
  IonIcon,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  printOutline,
  checkmarkCircle,
  checkmarkCircleOutline,
  removeOutline,
  addOutline,
  scanOutline,
  documentTextOutline,
  calendarOutline,
  peopleOutline,
  statsChartOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import {
  DashboardService,
  AdminDriverItem,
  AdminQueueItem,
  AdminReportItem,
  AdminOverviewResponse,
} from '../../services/dashboard.service';

export type ReportFormat = 1 | 2 | 3 | 4;
export type TimeframePeriod =
  | 'all'
  | 'today'
  | 'week'
  | 'month'
  | 'last_month'
  | 'quarter'
  | 'year'
  | 'custom';

@Component({
  selector: 'app-admin-reports',
  templateUrl: './admin-reports.page.html',
  styleUrls: ['./admin-reports.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonContent,
    IonIcon,
  ],
})
export class AdminReportsPage implements OnInit, AfterViewInit {
  @ViewChild('viewportContainer') viewportContainerRef?: ElementRef<HTMLDivElement>;
  authService = inject(AuthService);
  private dashboardService = inject(DashboardService);
  private router = inject(Router);

  // Flow State
  viewMode = signal<'config' | 'preview'>('config');
  isLoading = signal<boolean>(true);

  // Config State
  selectedFormat = signal<ReportFormat>(1);
  selectedTimeframe = signal<TimeframePeriod>('month');
  signatoryName = signal<string>('Steve Gates Roquero');
  signatoryTitle = signal<string>('TODA Operations & Safety Administrator');

  // Preview Controls & Scaling
  readonly BASE_A4_WIDTH = 794;
  readonly BASE_A4_HEIGHT = 1123;
  zoomLevel = signal<number>(53);
  isFitToPage = signal<boolean>(true);
  panX = signal<number>(0);
  panY = signal<number>(0);
  isDragging = signal<boolean>(false);

  scaledWidth = computed(() => Math.round(this.BASE_A4_WIDTH * (this.zoomLevel() / 100)));
  scaledHeight = computed(() => Math.round(this.BASE_A4_HEIGHT * (this.zoomLevel() / 100)));

  // Gesture state
  private mouseStartX = 0;
  private mouseStartY = 0;
  private startPinchDist = 0;
  private startPinchZoom = 53;
  private startPinchPanX = 0;
  private startPinchPanY = 0;
  private startPinchMidX = 0;
  private startPinchMidY = 0;
  private touchStartX = 0;
  private touchStartY = 0;

  // Server Datasets
  drivers = signal<AdminDriverItem[]>([]);
  queue = signal<AdminQueueItem[]>([]);
  reports = signal<AdminReportItem[]>([]);
  summary = signal({
    total_drivers: 0,
    active_online_drivers: 0,
    pending_applicants: 0,
    suspended_drivers: 0,
    open_reports: 0,
    total_completed_rides: 0,
    total_toda_revenue: 0,
  });

  // Computed Date Strings
  currentDateFormatted = computed(() => {
    return new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  });

  currentDateTimeFormatted = computed(() => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${dateStr} at ${timeStr}`;
  });

  coveragePeriodLabel = computed(() => {
    const now = new Date();
    const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    switch (this.selectedTimeframe()) {
      case 'today':
        return `Today (${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`;
      case 'week':
        return `This Week (${monthName})`;
      case 'month':
        return `This Month (${monthName})`;
      case 'last_month':
        return 'Last Month';
      case 'quarter':
        return 'This Quarter';
      case 'custom':
        return 'Custom Date Range';
      case 'all':
      default:
        return 'All Recorded History';
    }
  });

  // Computed Subgroups for Format 3 (Grouped Roster)
  approvedDrivers = computed(() => {
    return this.drivers().filter((d) => d.compliance_status === 'Approved');
  });

  pendingDrivers = computed(() => {
    return this.drivers().filter((d) => d.compliance_status === 'Pending');
  });

  removedDrivers = computed(() => {
    return this.drivers().filter(
      (d) => d.compliance_status === 'Suspended' || d.compliance_status === 'Rejected'
    );
  });

  // Computed Stats for Format 4 (Dashboard)
  resolvedReportsCount = computed(() => {
    return this.reports().filter((r) => r.status === 'resolved').length;
  });

  resolutionRatePercent = computed(() => {
    const total = this.reports().length;
    if (total === 0) return '100.0%';
    const resolved = this.resolvedReportsCount();
    return ((resolved / total) * 100).toFixed(1) + '%';
  });

  categoryStats = computed(() => {
    const counts: { [cat: string]: number } = {};
    for (const r of this.reports()) {
      const cat = r.category || 'Other';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    const total = this.reports().length || 1;
    return Object.keys(counts).map((cat, idx) => ({
      index: idx + 1,
      name: cat,
      count: counts[cat],
      sharePct: Math.round((counts[cat] / total) * 100),
    }));
  });

  approvedPercentage = computed(() => {
    const total = this.drivers().length || 1;
    return Math.round((this.approvedDrivers().length / total) * 100);
  });

  pendingPercentage = computed(() => {
    const total = this.drivers().length || 1;
    return Math.round((this.pendingDrivers().length / total) * 100);
  });

  suspendedPercentage = computed(() => {
    const total = this.drivers().length || 1;
    return Math.round((this.removedDrivers().length / total) * 100);
  });

  constructor() {
    addIcons({
      arrowBackOutline,
      printOutline,
      checkmarkCircle,
      checkmarkCircleOutline,
      removeOutline,
      addOutline,
      scanOutline,
      documentTextOutline,
      calendarOutline,
      peopleOutline,
      statsChartOutline,
      alertCircleOutline,
    });
  }

  ngOnInit(): void {
    const user = this.authService.currentUser();
    if (user?.name) {
      this.signatoryName.set(user.name);
    }
    this.calculateDefaultFit();
    this.loadData();
  }

  private calculateDefaultFit(): void {
    const availWidth = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth - 32 : 380;
    const availHeight = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight - 150 : 600;
    const scaleX = availWidth / this.BASE_A4_WIDTH;
    const scaleY = availHeight / this.BASE_A4_HEIGHT;
    const scale = Math.max(0.3, Math.min(1.0, Math.min(scaleX, scaleY)));
    this.zoomLevel.set(Math.round(scale * 100));
    this.isFitToPage.set(true);
    this.panX.set(0);
    this.panY.set(0);
  }

  loadData(): void {
    this.isLoading.set(true);
    this.dashboardService.getAdminOverview().subscribe({
      next: (res: AdminOverviewResponse) => {
        if (res?.summary) {
          this.summary.set(res.summary);
          this.drivers.set(res.drivers || []);
          this.queue.set(res.queue || []);
          this.reports.set(res.reports || []);
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  setFormat(format: ReportFormat): void {
    this.selectedFormat.set(format);
  }

  setTimeframe(period: TimeframePeriod): void {
    this.selectedTimeframe.set(period);
  }

  ngAfterViewInit(): void {
    this.setupWheelListener();
  }

  setupWheelListener(): void {
    setTimeout(() => {
      const el = document.querySelector('.a4-document-viewport') as HTMLElement;
      if (el && !(el as any).__wheelBound) {
        (el as any).__wheelBound = true;
        el.addEventListener(
          'wheel',
          (e: WheelEvent) => this.onWheel(e),
          { passive: false }
        );
      }
    }, 100);
  }

  generateOfficialReport(): void {
    this.calculateDefaultFit();
    this.viewMode.set('preview');
    this.setupWheelListener();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  backToConfig(): void {
    this.viewMode.set('config');
  }

  returnToAdmin(): void {
    this.router.navigate(['/tabs/admin']);
  }

  zoomIn(): void {
    const oldZoom = this.zoomLevel();
    const newZoom = Math.min(250, oldZoom + 10);
    if (oldZoom === newZoom) return;
    const ratio = newZoom / oldZoom;
    this.panX.set(Math.round(this.panX() * ratio));
    this.panY.set(Math.round(this.panY() * ratio));
    this.zoomLevel.set(newZoom);
    this.isFitToPage.set(false);
  }

  zoomOut(): void {
    const oldZoom = this.zoomLevel();
    const newZoom = Math.max(25, oldZoom - 10);
    if (oldZoom === newZoom) return;
    const ratio = newZoom / oldZoom;
    this.panX.set(Math.round(this.panX() * ratio));
    this.panY.set(Math.round(this.panY() * ratio));
    this.zoomLevel.set(newZoom);
    this.isFitToPage.set(false);
  }

  fitToPage(): void {
    this.panX.set(0);
    this.panY.set(0);
    this.calculateDefaultFit();
  }

  // ── MOUSE DRAG / PAN ──────────────────────────────────
  onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    this.isDragging.set(true);
    this.mouseStartX = e.clientX - this.panX();
    this.mouseStartY = e.clientY - this.panY();
  }

  onMouseMove(e: MouseEvent): void {
    if (!this.isDragging()) return;
    e.preventDefault();
    this.panX.set(Math.round(e.clientX - this.mouseStartX));
    this.panY.set(Math.round(e.clientY - this.mouseStartY));
  }

  onMouseUp(): void {
    this.isDragging.set(false);
  }

  // ── TOUCH DRAG / PAN & PINCH ZOOM ──────────────────────
  onTouchStart(e: TouchEvent): void {
    const viewport = document.querySelector('.a4-document-viewport') as HTMLElement;
    const rect = viewport ? viewport.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

    if (e.touches.length === 2) {
      this.isDragging.set(false);
      this.startPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      this.startPinchZoom = this.zoomLevel();
      this.startPinchPanX = this.panX();
      this.startPinchPanY = this.panY();
      this.startPinchMidX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - (rect.left + rect.width / 2);
      this.startPinchMidY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - (rect.top + rect.height / 2);
    } else if (e.touches.length === 1) {
      this.isDragging.set(true);
      this.touchStartX = e.touches[0].clientX - this.panX();
      this.touchStartY = e.touches[0].clientY - this.panY();
    }
  }

  onTouchMove(e: TouchEvent): void {
    if (e.touches.length === 2 && this.startPinchDist > 10) {
      e.preventDefault();
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = currentDist / this.startPinchDist;
      const targetZoom = Math.max(25, Math.min(250, Math.round(this.startPinchZoom * ratio)));
      const zoomRatio = targetZoom / this.startPinchZoom;

      const newPanX = this.startPinchMidX - (this.startPinchMidX - this.startPinchPanX) * zoomRatio;
      const newPanY = this.startPinchMidY - (this.startPinchMidY - this.startPinchPanY) * zoomRatio;

      this.panX.set(Math.round(newPanX));
      this.panY.set(Math.round(newPanY));
      this.zoomLevel.set(targetZoom);
      this.isFitToPage.set(false);
    } else if (e.touches.length === 1 && this.isDragging()) {
      e.preventDefault();
      this.panX.set(Math.round(e.touches[0].clientX - this.touchStartX));
      this.panY.set(Math.round(e.touches[0].clientY - this.touchStartY));
    }
  }

  onTouchEnd(): void {
    this.isDragging.set(false);
    this.startPinchDist = 0;
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    e.stopPropagation();

    const viewport = document.querySelector('.a4-document-viewport') as HTMLElement;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const cursorX = e.clientX - (rect.left + rect.width / 2);
    const cursorY = e.clientY - (rect.top + rect.height / 2);

    const oldZoom = this.zoomLevel();
    const zoomDelta = e.deltaY < 0 ? 8 : -8;
    const newZoom = Math.max(25, Math.min(250, oldZoom + zoomDelta));
    if (oldZoom === newZoom) return;

    const ratio = newZoom / oldZoom;
    const newPanX = cursorX - (cursorX - this.panX()) * ratio;
    const newPanY = cursorY - (cursorY - this.panY()) * ratio;

    this.panX.set(Math.round(newPanX));
    this.panY.set(Math.round(newPanY));
    this.zoomLevel.set(newZoom);
    this.isFitToPage.set(false);
  }

  triggerPrint(): void {
    const printElement = document.getElementById('official-print-document');
    if (!printElement) {
      window.print();
      return;
    }

    const clone = printElement.cloneNode(true) as HTMLElement;
    clone.removeAttribute('style');
    clone.style.cssText = 'width: 100% !important; max-width: 100% !important; min-width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; box-shadow: none !important; zoom: 1 !important; transform: none !important; position: static !important;';

    // Create or reuse hidden iframe for isolated print rendering without Ionic shadow root bugs
    let iframe = document.getElementById('srh-print-iframe') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'srh-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) {
      window.print();
      return;
    }

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SRH TODA Official Report</title>
        <meta charset="utf-8">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
          @page {
            size: A4 portrait;
            margin: 8mm 10mm 8mm 10mm !important;
          }
          *, *::before, *::after {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-sizing: border-box !important;
          }
          .a4-paper-sheet {
            zoom: 1 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 100% !important;
            min-height: calc(297mm - 16mm) !important;
            box-sizing: border-box !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            position: relative !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-start !important;
            transform: none !important;
          }
          ${this.getPrintStyles()}
        </style>
      </head>
      <body>
        ${clone.outerHTML}
      </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 400);
  }

  private getPrintStyles(): string {
    return `
      .doc-letterhead {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding-bottom: 8px !important;
        border-bottom: 1.5px solid #000000 !important;
        width: 100% !important;
      }
      .side-logo-wrap {
        width: 56px !important;
        height: 56px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex: 0 0 56px !important;
      }
      .side-logo {
        width: 50px !important;
        height: 50px !important;
        object-fit: contain !important;
      }
      .center-letterhead-info {
        flex: 1 1 auto !important;
        text-align: center !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 1px !important;
        margin: 0 !important;
        padding: 0 8px !important;
      }
      .lh-country { font-size: 8.5pt !important; font-weight: 700 !important; letter-spacing: 0.05em !important; color: #1e293b !important; }
      .lh-province { font-size: 7.5pt !important; font-weight: 700 !important; color: #334155 !important; letter-spacing: 0.02em !important; }
      .lh-barangay { font-size: 13pt !important; font-weight: 900 !important; color: #000000 !important; margin: 1px 0 !important; letter-spacing: 0.02em !important; }
      .lh-assoc { font-size: 9pt !important; font-weight: 800 !important; color: #1d4ed8 !important; margin: 0 !important; letter-spacing: 0.01em !important; }
      .lh-address, .lh-contact { font-size: 7.5pt !important; color: #334155 !important; line-height: 1.25 !important; }

      .doc-meta-strip {
        padding: 6px 0 !important;
        border-bottom: 1px solid #cbd5e1 !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 3px !important;
        margin-bottom: 8px !important;
        width: 100% !important;
      }
      .meta-row { display: flex !important; justify-content: space-between !important; font-size: 8.2pt !important; width: 100% !important; }
      .meta-item { display: flex !important; gap: 6px !important; }
      .meta-item.text-right { justify-content: flex-end !important; }
      .meta-label { font-weight: 700 !important; color: #475569 !important; }
      .meta-val { font-weight: 800 !important; color: #000000 !important; }
      .meta-val.status-certified { color: #059669 !important; font-weight: 900 !important; letter-spacing: 0.03em !important; }

      .doc-section-heading {
        font-size: 10.5pt !important;
        font-weight: 900 !important;
        color: #000000 !important;
        text-align: center !important;
        margin: 6px 0 8px !important;
        letter-spacing: 0.03em !important;
        text-transform: uppercase !important;
      }
      .doc-section-sub {
        font-size: 7.8pt !important;
        color: #64748b !important;
        text-align: center !important;
        display: block !important;
        margin-top: -4px !important;
        margin-bottom: 8px !important;
      }

      .doc-official-table {
        width: 100% !important;
        border-collapse: collapse !important;
        font-size: 7.2pt !important;
        margin-bottom: 4px !important;
      }
      .doc-official-table thead th {
        background: #0b3c66 !important;
        color: #ffffff !important;
        font-weight: 800 !important;
        text-align: left !important;
        padding: 4px 6px !important;
        font-size: 7pt !important;
        letter-spacing: 0.03em !important;
        border: 1px solid #0b3c66 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .doc-official-table tbody td {
        padding: 4px 6px !important;
        border: 1px solid #e2e8f0 !important;
        color: #1e293b !important;
        vertical-align: middle !important;
        line-height: 1.3 !important;
        font-size: 7pt !important;
      }
      .doc-official-table tbody tr:nth-child(even) td {
        background: #f8fafc !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .complainant-name, .driver-roster-name {
        font-weight: 700 !important;
        color: #2563eb !important;
      }
      .driver-involved-name { font-weight: 800 !important; color: #000000 !important; display: block !important; }
      .driver-mtop-sub {
        font-size: 6.8pt !important;
        color: #2563eb !important;
        font-weight: 700 !important;
        display: block !important;
      }
      .status-chip {
        font-size: 6.8pt !important;
        font-weight: 800 !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        display: inline-block !important;
        letter-spacing: 0.02em !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .status-chip.resolved { background: #dcfce7 !important; color: #15803d !important; border: 1px solid #bbf7d0 !important; }
      .status-chip.investigating { background: #dbeafe !important; color: #1d4ed8 !important; border: 1px solid #bfdbfe !important; }
      .status-chip.pending { background: #fef3c7 !important; color: #b45309 !important; border: 1px solid #fde68a !important; }
      .status-chip.dismissed { background: #f1f5f9 !important; color: #475569 !important; border: 1px solid #e2e8f0 !important; }
      .desc-cell { font-size: 7pt !important; color: #334155 !important; line-height: 1.3 !important; }
      .active-member-note { font-size: 6.8pt !important; color: #475569 !important; }
      .suspension-note { font-size: 6.8pt !important; color: #dc2626 !important; font-weight: 700 !important; }
      .pending-member-note { font-size: 6.8pt !important; color: #475569 !important; }

      .total-row-right {
        text-align: right !important;
        font-size: 8pt !important;
        font-weight: 800 !important;
        color: #000000 !important;
        margin-top: 3px !important;
        margin-bottom: 8px !important;
        width: 100% !important;
      }

      .roster-group { margin-bottom: 12px !important; width: 100% !important; }
      .roster-group-banner {
        font-size: 7.5pt !important;
        font-weight: 900 !important;
        padding: 4px 8px !important;
        letter-spacing: 0.04em !important;
        border-radius: 4px 4px 0 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .roster-group-banner.approved-banner { background: #dcfce7 !important; color: #15803d !important; border: 1px solid #bbf7d0; border-left: 3px solid #16a34a !important; }
      .roster-group-banner.removed-banner { background: #fee2e2 !important; color: #b91c1c !important; border: 1px solid #fecaca; border-left: 3px solid #dc2626 !important; }
      .roster-group-banner.pending-banner { background: #fef3c7 !important; color: #b45309 !important; border: 1px solid #fde68a; border-left: 3px solid #d97706 !important; }
      .roster-group-banner.month-banner { background: #dbeafe !important; color: #1e40af !important; border: 1px solid #bfdbfe; border-left: 3px solid #2563eb !important; }

      .group-subtotal-row {
        text-align: right !important;
        font-size: 7.2pt !important;
        font-weight: 700 !important;
        color: #475569 !important;
        margin-top: 2px !important;
        margin-bottom: 6px !important;
        width: 100% !important;
      }
      .total-fleet-summary-row {
        text-align: right !important;
        font-size: 7.8pt !important;
        color: #0f172a !important;
        font-weight: 700 !important;
        padding-top: 6px !important;
        border-top: 1px solid #cbd5e1 !important;
        margin-top: 10px !important;
        margin-bottom: 14px !important;
        width: 100% !important;
      }

      .dashboard-kpi-summary-grid {
        display: grid !important;
        grid-template-columns: repeat(4, 1fr) !important;
        gap: 8px !important;
        margin-bottom: 12px !important;
        width: 100% !important;
      }
      .dash-kpi-box {
        border: 1px solid #cbd5e1 !important;
        border-radius: 6px !important;
        padding: 6px 8px !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 2px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .dash-kpi-box.blue-border { border-top: 3px solid #2563eb !important; }
      .dash-kpi-box.amber-border { border-top: 3px solid #f59e0b !important; }
      .dash-kpi-box.red-border { border-top: 3px solid #ef4444 !important; }
      .dash-kpi-label { font-size: 6pt !important; font-weight: 800 !important; color: #64748b !important; }
      .dash-kpi-val { font-size: 11pt !important; font-weight: 900 !important; color: #0f172a !important; }

      .dashboard-charts-two-col {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 12px !important;
        margin-bottom: 12px !important;
        width: 100% !important;
      }
      .chart-panel {
        border: 1px solid #cbd5e1 !important;
        border-radius: 6px !important;
        padding: 8px !important;
        display: flex !important;
        flex-direction: column !important;
      }
      .panel-heading {
        font-size: 6.5pt !important;
        font-weight: 900 !important;
        letter-spacing: 0.05em !important;
        color: #0f172a !important;
        margin-bottom: 8px !important;
      }
      .mini-bar-chart {
        height: 80px !important;
        display: flex !important;
        align-items: flex-end !important;
        justify-content: center !important;
      }
      .bar-col {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        gap: 4px !important;
      }
      .bar-fill-stem {
        width: 24px !important;
        background: #2563eb !important;
        border-radius: 3px 3px 0 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        color: #ffffff !important;
        font-size: 7.5pt !important;
        font-weight: 800 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .bar-x-label { font-size: 6.5pt !important; font-weight: 700 !important; color: #64748b !important; }

      .donut-visual-row { display: flex !important; align-items: center !important; gap: 12px !important; }
      .donut-ring-graphic {
        width: 68px !important;
        height: 68px !important;
        border-radius: 50% !important;
        background: conic-gradient(#10b981 0% 74%, #f59e0b 74% 85%, #ef4444 85% 100%) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex-shrink: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .donut-center-text {
        width: 44px !important;
        height: 44px !important;
        border-radius: 50% !important;
        background: #ffffff !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .donut-num { font-size: 8.5pt !important; font-weight: 900 !important; color: #0f172a !important; line-height: 1 !important; }
      .donut-sub { font-size: 4.5pt !important; font-weight: 800 !important; color: #64748b !important; }
      .donut-legend-col { display: flex !important; flex-direction: column !important; gap: 4px !important; font-size: 6.5pt !important; }
      .legend-item { display: flex !important; align-items: center !important; gap: 4px !important; }
      .legend-dot { width: 7px !important; height: 7px !important; border-radius: 2px !important; }
      .legend-dot.green { background: #10b981 !important; }
      .legend-dot.amber { background: #f59e0b !important; }
      .legend-dot.red { background: #ef4444 !important; }
      .legend-name { font-weight: 700 !important; color: #475569 !important; }
      .legend-val { font-weight: 800 !important; color: #0f172a !important; }

      .category-breakdown-section { margin-bottom: 12px !important; width: 100% !important; }
      .progress-share-wrap { display: flex !important; align-items: center !important; gap: 6px !important; }
      .progress-share-fill { height: 6px !important; background: #2563eb !important; border-radius: 3px !important; min-width: 4px !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .progress-share-pct { font-size: 6.5pt !important; font-weight: 700 !important; color: #475569 !important; }

      .compliance-insight-callout {
        background: #f0fdf4 !important;
        border: 1px solid #bbf7d0 !important;
        border-radius: 6px !important;
        padding: 8px 10px !important;
        margin-bottom: 10px !important;
        width: 100% !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .insight-title { font-size: 6.5pt !important; font-weight: 900 !important; color: #15803d !important; margin: 0 0 2px !important; }
      .insight-body { font-size: 6.8pt !important; color: #166534 !important; line-height: 1.4 !important; margin: 0 !important; }

      .doc-signatories-section { margin-top: 14px !important; margin-bottom: 12px !important; width: 100% !important; }
      .sig-column { width: 260px !important; display: flex !important; flex-direction: column !important; gap: 2px !important; }
      .sig-caption { font-size: 7.5pt !important; color: #475569 !important; }
      .sig-name-box { display: flex !important; flex-direction: column !important; margin-top: 8px !important; }
      .sig-name { font-size: 9pt !important; font-weight: 900 !important; color: #000000 !important; }
      .sig-title { font-size: 7.5pt !important; color: #475569 !important; }
      .sig-underline { width: 100% !important; border-bottom: 1.5px solid #000000 !important; margin-top: 2px !important; margin-bottom: 2px !important; }
      .sig-subtext { font-size: 6.5pt !important; color: #94a3b8 !important; font-style: italic !important; }

      .doc-footer-strip {
        margin-top: auto !important;
        padding-top: 6px !important;
        border-top: 1px solid #cbd5e1 !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: flex-end !important;
        width: 100% !important;
        font-size: 6.8pt !important;
        color: #64748b !important;
        line-height: 1.35 !important;
      }
      .footer-left { display: flex !important; flex-direction: column !important; text-align: left !important; }
      .footer-right { display: flex !important; flex-direction: column !important; align-items: flex-end !important; text-align: right !important; }
      .ft-barangay { font-weight: 800 !important; color: #000000 !important; }
      .ft-date { font-weight: 600 !important; }
    `;
  }
}
