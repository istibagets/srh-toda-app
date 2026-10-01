import {
  Component,
  inject,
  input,
  output,
  signal,
  computed,
  ElementRef,
  viewChild,
  AfterViewInit,
  OnDestroy,
  NgZone,
  effect,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IonIcon, AlertController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  radioOutline,
  shieldOutline,
  businessOutline,
  footballOutline,
  cartOutline,
  storefrontOutline,
  bookmarkOutline,
  closeOutline,
  callOutline,
  timeOutline,
  chatbubbleEllipsesOutline,
  checkmarkCircleOutline,
  navigateOutline,
  flashOutline,
  personOutline,
  locationOutline,
  shieldCheckmarkOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import { DriverService } from '../../services/driver.service';
import { AuthService } from '../../services/auth.service';

export type SheetSnap = 'min' | 'mid' | 'max';

@Component({
  selector: 'app-passenger-sheet',
  standalone: true,
  imports: [CommonModule, RouterModule, IonIcon],
  templateUrl: './passenger-sheet.component.html',
  styleUrls: ['./passenger-sheet.component.scss'],
})
export class PassengerSheetComponent implements AfterViewInit, OnDestroy {
  driverService = inject(DriverService);
  authService = inject(AuthService);
  private ngZone = inject(NgZone);
  private alertController = inject(AlertController);

  activeRide = input<any>(null);
  unreadChatCount = input<number>(0);
  readonly popularLandmarks = input<Array<{ name: string; fare: number; icon: string; color: string; desc: string; lat: number; lng: number }>>([]);

  readonly isDriverVisible = computed(() => {
    const ride = this.activeRide();
    if (!ride || !ride.driver) return false;
    const status = String(ride.status || '').toLowerCase().trim();
    return status === 'accepted' || status === 'fare_accepted' || status === 'en_route' || status === 'arrived' || status === 'in_transit';
  });

  readonly driverName = computed(() => {
    const ride = this.activeRide();
    const d = ride?.driver;
    if (!d) return 'TODA Driver';
    return d.name || d.full_name || 'TODA Driver';
  });

  readonly driverMtopNumber = computed(() => {
    const ride = this.activeRide();
    const d = ride?.driver;
    if (!d) return '101';
    const mtop = d.mtop_number || d.driver_profile?.mtop_number || d.body_number;
    if (mtop && mtop !== 'PENDING' && mtop !== 'ADMIN') {
      return String(mtop).replace(/^MTOP-?/i, '').trim();
    }
    return mtop || '101';
  });

  openBooking = output<any>();
  acceptFare = output<void>();
  openChat = output<void>();
  cancelRide = output<void>();
  report = output<void>();
  snapChange = output<SheetSnap>();
  dragSync = output<number>(); // Emits live translateY coordinate for 120fps hardware transforms
  dragStart = output<void>();
  dragEnd = output<void>();

  sheetRef = viewChild<ElementRef<HTMLDivElement>>('sheetElement');
  scrollContentRef = viewChild<ElementRef<HTMLDivElement>>('scrollContentElement');

  snapState = signal<SheetSnap>('mid');

  async confirmCancelRide(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Cancel Ride Request?',
      subHeader: 'Driver is already en route',
      message: 'Are you sure you want to cancel? The driver is already on their way to your pickup location.',
      buttons: [
        { text: 'Keep Ride', role: 'cancel' },
        {
          text: 'Cancel Ride',
          role: 'destructive',
          handler: () => {
            this.cancelRide.emit();
          },
        },
      ],
    });
    await alert.present();
  }

  private currentDragEventType: 'touch' | 'mouse' | null = null;
  private boundDragMove = (e: TouchEvent | MouseEvent) => this.onDragMove(e);
  private boundDragEnd = (e: TouchEvent | MouseEvent) => this.onDragEnd(e);
  private boundDragCancel = () => this.onDragCancel();
  private boundWindowResize = () => this.handleWindowResize();

  private startTouchY = 0;
  private startTouchX = 0;
  private lastTouchY = 0;
  private lastTouchTime = 0;
  private velocity = 0;
  private baseTranslateY = 0;
  activeTranslateY = 0;
  private dragAnchorY = 0;
  private startScrollTop = 0;
  private gestureMode: 'idle' | 'sheet_drag' | 'content_scroll' | 'ignored' = 'idle';
  private hasMoved = false;

  private snapRafId: number | null = null;
  private dragRafId: number | null = null;
  private unbindTouchListeners: (() => void) | null = null;

  get MIN_TRANSLATE_Y(): number {
    if (this.activeRide()) {
      return this.MID_TRANSLATE_Y;
    }
    return Math.max(0, window.innerHeight - 56 - 250);
  }

  get MID_TRANSLATE_Y(): number {
    const ride = this.activeRide();
    if (ride) {
      const status = String(ride.status || '').toLowerCase().trim();
      if (status === 'fare_proposed') {
        return Math.max(15, window.innerHeight - 56 - 292);
      }
      if (status === 'accepted') {
        return Math.max(20, window.innerHeight - 56 - 252);
      }
      if (status === 'en_route') {
        return Math.max(20, window.innerHeight - 56 - 256);
      }
      if (status === 'arrived') {
        return Math.max(20, window.innerHeight - 56 - 256);
      }
      if (status === 'in_transit') {
        return Math.max(25, window.innerHeight - 56 - 256);
      }
      return Math.max(20, window.innerHeight - 56 - 245); // Searching / Alerting
    }
    return Math.max(40, window.innerHeight - 56 - 235); // Default booking hub
  }

  get MAX_TRANSLATE_Y(): number {
    if (this.activeRide()) {
      return this.MID_TRANSLATE_Y;
    }
    return window.innerHeight - 56 - 66; // 66px visible collapsed strip above bottom tab bar
  }

  constructor() {
    addIcons({
      radioOutline,
      shieldOutline,
      businessOutline,
      footballOutline,
      cartOutline,
      storefrontOutline,
      bookmarkOutline,
      closeOutline,
      callOutline,
      timeOutline,
      chatbubbleEllipsesOutline,
      checkmarkCircleOutline,
      navigateOutline,
      flashOutline,
      personOutline,
      locationOutline,
      shieldCheckmarkOutline,
      alertCircleOutline,
    });

    effect(() => {
      const ride = this.activeRide();
      untracked(() => {
        this.setSnap('mid');
      });
    });
  }

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      const sheet = this.sheetRef()?.nativeElement;
      if (sheet) {
        this.activeTranslateY = this.MID_TRANSLATE_Y;
        sheet.style.transform = `translate3d(0, ${this.activeTranslateY}px, 0)`;
        this.dragSync.emit(this.activeTranslateY);
        this.attachNativeTouchGestures(sheet);
      }
      window.addEventListener('resize', this.boundWindowResize);
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.boundWindowResize);
    if (this.dragRafId !== null) {
      cancelAnimationFrame(this.dragRafId);
      this.dragRafId = null;
    }
    if (this.snapRafId !== null) {
      cancelAnimationFrame(this.snapRafId);
      this.snapRafId = null;
    }
    if (this.unbindTouchListeners) {
      this.unbindTouchListeners();
      this.unbindTouchListeners = null;
    }
  }

  private handleWindowResize(): void {
    const sheet = this.sheetRef()?.nativeElement;
    if (!sheet) return;
    const snap = this.snapState();
    if (snap === 'min') {
      this.activeTranslateY = this.MAX_TRANSLATE_Y;
    } else if (snap === 'max') {
      this.activeTranslateY = this.MIN_TRANSLATE_Y;
    } else {
      this.activeTranslateY = this.MID_TRANSLATE_Y;
    }
    sheet.style.transform = `translate3d(0, ${this.activeTranslateY.toFixed(2)}px, 0)`;
    this.dragSync.emit(this.activeTranslateY);
  }

  private attachNativeTouchGestures(sheetEl: HTMLElement): void {
    const onTouchStart = (e: TouchEvent) => this.onDragStart(e);
    const onMouseDown = (e: MouseEvent) => this.onDragStart(e);

    sheetEl.addEventListener('touchstart', onTouchStart, { passive: true });
    sheetEl.addEventListener('mousedown', onMouseDown);

    this.unbindTouchListeners = () => {
      sheetEl.removeEventListener('touchstart', onTouchStart);
      sheetEl.removeEventListener('mousedown', onMouseDown);
      this.removeWindowDragListeners();
    };
  }

  private addWindowDragListeners(type: 'touch' | 'mouse'): void {
    if (type === 'touch') {
      window.addEventListener('touchmove', this.boundDragMove, { passive: false });
      window.addEventListener('touchend', this.boundDragEnd);
      window.addEventListener('touchcancel', this.boundDragCancel);
    } else {
      window.addEventListener('mousemove', this.boundDragMove);
      window.addEventListener('mouseup', this.boundDragEnd);
    }
  }

  private removeWindowDragListeners(): void {
    window.removeEventListener('touchmove', this.boundDragMove);
    window.removeEventListener('touchend', this.boundDragEnd);
    window.removeEventListener('touchcancel', this.boundDragCancel);

    window.removeEventListener('mousemove', this.boundDragMove);
    window.removeEventListener('mouseup', this.boundDragEnd);
  }

  private onDragCancel(): void {
    this.removeWindowDragListeners();
    this.currentDragEventType = null;
    this.gestureMode = 'idle';
    this.dragEnd.emit();
  }

  private getClientY(e: TouchEvent | MouseEvent): number {
    if ('touches' in e && e.touches && e.touches.length > 0) return e.touches[0].clientY;
    if ('changedTouches' in e && e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientY;
    return (e as MouseEvent).clientY;
  }

  private getClientX(e: TouchEvent | MouseEvent): number {
    if ('touches' in e && e.touches && e.touches.length > 0) return e.touches[0].clientX;
    if ('changedTouches' in e && e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientX;
    return (e as MouseEvent).clientX;
  }

  private getCurrentTranslateY(): number {
    const el = this.sheetRef()?.nativeElement;
    if (!el) return this.activeTranslateY || this.MAX_TRANSLATE_Y;
    const style = window.getComputedStyle(el);
    const transform = style.transform || (style as any).webkitTransform;
    if (transform && transform !== 'none') {
      const match = transform.match(/^matrix\((.+)\)$/);
      if (match) return parseFloat(match[1].split(',')[5]) || this.activeTranslateY;
      const match3d = transform.match(/^matrix3d\((.+)\)$/);
      if (match3d) return parseFloat(match3d[1].split(',')[13]) || this.activeTranslateY;
    }
    return this.activeTranslateY || this.MAX_TRANSLATE_Y;
  }

  private onDragStart(e: TouchEvent | MouseEvent): void {
    if (this.currentDragEventType !== null) return;
    if ('button' in e && (e as MouseEvent).button !== 0 && (e as MouseEvent).button !== undefined) return;

    const targetEl = e.target as HTMLElement;
    if (targetEl && targetEl.closest('button, a, input, select, textarea, [data-no-sheet-drag]')) {
      return;
    }

    if (this.dragRafId !== null) {
      cancelAnimationFrame(this.dragRafId);
      this.dragRafId = null;
    }
    if (this.snapRafId !== null) {
      cancelAnimationFrame(this.snapRafId);
      this.snapRafId = null;
    }

    const sheetEl = this.sheetRef()?.nativeElement;
    if (sheetEl) {
      sheetEl.style.transition = 'none';
      sheetEl.style.willChange = 'transform';
    }

    this.hasMoved = false;
    this.gestureMode = 'idle';
    this.dragStart.emit();

    const contentEl = this.scrollContentRef()?.nativeElement;
    this.startScrollTop = contentEl ? Math.max(0, contentEl.scrollTop) : 0;

    this.startTouchY = this.getClientY(e);
    this.startTouchX = this.getClientX(e);
    this.lastTouchY = this.startTouchY;
    this.lastTouchTime = performance.now();
    this.velocity = 0;

    this.baseTranslateY = this.activeTranslateY || this.getCurrentTranslateY();
    this.dragAnchorY = this.startTouchY;

    if ('touches' in e) {
      this.currentDragEventType = 'touch';
    } else {
      this.currentDragEventType = 'mouse';
    }
    this.addWindowDragListeners(this.currentDragEventType);
  }

  private isHeaderOrHandle(el: HTMLElement | null): boolean {
    if (!el) return false;
    return Boolean(el.closest('#sheet-drag-handle, .sheet-drag-handle, .passenger-collapsed-strip, .passenger-sheet-handle-wrap'));
  }

  private onDragMove(e: TouchEvent | MouseEvent): void {
    if (this.gestureMode === 'ignored' || this.currentDragEventType === null) return;

    if ('buttons' in e && (e as MouseEvent).buttons === 0 && this.currentDragEventType === 'mouse') {
      this.onDragEnd(e);
      return;
    }

    const curY = this.getClientY(e);
    const curX = this.getClientX(e);
    const deltaY = curY - this.startTouchY;
    const deltaX = curX - this.startTouchX;

    const prevTouchY = this.lastTouchY;
    const now = performance.now();
    const dt = now - this.lastTouchTime;
    if (dt > 0) {
      const instVel = (curY - prevTouchY) / dt;
      this.velocity = this.velocity === 0 ? instVel : this.velocity * 0.65 + instVel * 0.35;
    }
    this.lastTouchY = curY;
    this.lastTouchTime = now;

    const isSheetAtMax = this.activeTranslateY <= this.MIN_TRANSLATE_Y + 3;
    const targetEl = e.target as HTMLElement;

    if (this.gestureMode === 'idle') {
      if (Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && Math.abs(deltaX) > 6) {
        this.gestureMode = 'ignored';
        this.removeWindowDragListeners();
        this.currentDragEventType = null;
        return;
      }

      if (Math.abs(deltaY) >= 1) {
        this.hasMoved = true;
        const isHeaderTouch = this.isHeaderOrHandle(targetEl);

        if (!isSheetAtMax || isHeaderTouch) {
          this.gestureMode = 'sheet_drag';
          this.startTouchY = curY;
          this.baseTranslateY = this.activeTranslateY || this.getCurrentTranslateY();
          if (e.cancelable) e.preventDefault();
        } else {
          // Sheet is already fully expanded at MAX:
          if (deltaY > 0 && this.startScrollTop <= 1) {
            // Pulling DOWN while at top of scroll list -> Drag Sheet DOWN
            this.gestureMode = 'sheet_drag';
            this.startTouchY = curY;
            this.baseTranslateY = this.MIN_TRANSLATE_Y;
            if (e.cancelable) e.preventDefault();
          } else {
            // Swiping UP or scrolling through content items -> Native Smooth Content Scroll
            this.gestureMode = 'content_scroll';
            this.removeWindowDragListeners();
            this.currentDragEventType = null;
            return;
          }
        }
      }
    }

    if (this.gestureMode === 'sheet_drag') {
      if (e.cancelable) e.preventDefault();

      const dragDelta = curY - this.startTouchY;
      const computedTranslateY = this.baseTranslateY + dragDelta;
      const rawTranslateY = Math.max(
        this.MIN_TRANSLATE_Y,
        Math.min(this.MAX_TRANSLATE_Y, computedTranslateY)
      );

      this.activeTranslateY = rawTranslateY;
      const sheetEl = this.sheetRef()?.nativeElement;
      if (sheetEl) {
        sheetEl.style.transform = `translate3d(0, ${rawTranslateY.toFixed(2)}px, 0)`;
      }
      this.dragSync.emit(rawTranslateY);
    }
  }

  private onDragEnd(e: TouchEvent | PointerEvent | MouseEvent): void {
    this.removeWindowDragListeners();
    this.currentDragEventType = null;

    if (this.dragRafId !== null) {
      cancelAnimationFrame(this.dragRafId);
      this.dragRafId = null;
    }

    if (this.gestureMode !== 'sheet_drag') {
      this.gestureMode = 'idle';
      this.dragEnd.emit();
      return;
    }

    this.gestureMode = 'idle';
    const finalPos = this.activeTranslateY;

    if (!this.hasMoved) {
      this.dragEnd.emit();
      return;
    }

    const dragDelta = finalPos - this.baseTranslateY;
    const isFlickUp = this.velocity < -0.25;
    const isFlickDown = this.velocity > 0.25;

    let targetSnap: SheetSnap = 'mid';

    if (this.activeRide()) {
      targetSnap = 'mid';
    } else {
      const isStartedNearMin = this.baseTranslateY >= this.MID_TRANSLATE_Y + 40;
      if (isStartedNearMin) {
        if (dragDelta < -40 || isFlickUp) {
          targetSnap = 'mid';
        } else {
          targetSnap = 'min';
        }
      } else {
        if (dragDelta > 40 || isFlickDown) {
          targetSnap = 'min';
        } else {
          targetSnap = 'mid';
        }
      }
    }

    this.animateToSnap(targetSnap, 520);
  }

  setSnap(snap: SheetSnap): void {
    this.animateToSnap(snap, 520);
  }

  toggleSnap(): void {
    const nextSnap: SheetSnap = this.snapState() === 'min' ? 'mid' : 'min';
    this.setSnap(nextSnap);
  }

  private animateToSnap(targetSnap: SheetSnap, duration = 520): void {
    const sheetEl = this.sheetRef()?.nativeElement;
    if (!sheetEl) return;

    if (this.snapRafId !== null) {
      cancelAnimationFrame(this.snapRafId);
      this.snapRafId = null;
    }

    let targetY = this.MAX_TRANSLATE_Y;
    if (targetSnap === 'mid') targetY = this.MID_TRANSLATE_Y;
    else if (targetSnap === 'max') targetY = this.MIN_TRANSLATE_Y;

    sheetEl.style.transition = 'none';
    sheetEl.style.willChange = 'transform';

    const startY = this.activeTranslateY || this.getCurrentTranslateY();
    const diff = targetY - startY;
    const startTime = performance.now();

    this.dragStart.emit();

    this.ngZone.runOutsideAngular(() => {
      const snapStep = (now: number) => {
        const progress = Math.min(1, (now - startTime) / duration);
        const ease = 1 - Math.pow(1 - progress, 4.2);
        const currentY = startY + diff * ease;

        this.activeTranslateY = currentY;
        sheetEl.style.transform = `translate3d(0, ${currentY.toFixed(2)}px, 0)`;
        this.dragSync.emit(currentY);

        if (progress < 1) {
          this.snapRafId = requestAnimationFrame(snapStep);
        } else {
          this.snapRafId = null;
          this.activeTranslateY = targetY;
          sheetEl.style.transform = `translate3d(0, ${targetY.toFixed(2)}px, 0)`;
          sheetEl.style.willChange = 'auto';
          this.ngZone.run(() => {
            this.snapState.set(targetSnap);
            this.snapChange.emit(targetSnap);
            this.dragSync.emit(targetY);
            this.dragEnd.emit();
          });
        }
      };

      this.snapRafId = requestAnimationFrame(snapStep);
    });
  }
}
