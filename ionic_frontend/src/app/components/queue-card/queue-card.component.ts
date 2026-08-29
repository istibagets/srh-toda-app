import {
  Component,
  inject,
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
import { DriverService } from '../../services/driver.service';
import { AuthService } from '../../services/auth.service';
import { DropOffCardComponent } from '../drop-off-card/drop-off-card.component';
import { ReturningCardComponent } from '../returning-card/returning-card.component';
import Sortable from 'sortablejs';

export type SheetSnap = 'min' | 'mid' | 'max';

@Component({
  selector: 'app-queue-card',
  standalone: true,
  imports: [CommonModule, DropOffCardComponent, ReturningCardComponent],
  templateUrl: './queue-card.component.html',
  styleUrls: ['./queue-card.component.scss'],
})
export class QueueCardComponent implements AfterViewInit, OnDestroy {
  driverService = inject(DriverService);
  authService = inject(AuthService);
  isAdmin = computed(() => this.authService.currentUser()?.role === 'admin');
  private ngZone = inject(NgZone);

  startWalkIn = output<void>();
  toggleDutyClick = output<void>();
  dropOffClick = output<void>();
  addWayside = output<void>();
  snapChange = output<SheetSnap>();
  dragSync = output<number>(); // Emits live translateY coordinate for 120fps hardware transforms
  dragStart = output<void>();
  dragEnd = output<void>();

  sheetRef = viewChild<ElementRef<HTMLDivElement>>('sheetElement');
  scrollContentRef = viewChild<ElementRef<HTMLDivElement>>('scrollContentElement');
  sortableQueueContainer = viewChild<ElementRef<HTMLDivElement>>('sortableQueueContainer');

  snapState = signal<SheetSnap>('mid');

  private currentDragEventType: 'pointer' | 'touch' | 'mouse' | null = null;
  private boundDragMove = (e: TouchEvent | PointerEvent | MouseEvent) => this.onDragMove(e);
  private boundDragEnd = (e: TouchEvent | PointerEvent | MouseEvent) => this.onDragEnd(e);
  private boundWindowResize = () => this.handleWindowResize();

  private sortableInstance: Sortable | null = null;
  private isItemSorting = false;

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
  private pendingTranslateY: number | null = null;
  private unbindTouchListeners: (() => void) | null = null;

  get MIN_TRANSLATE_Y(): number {
    if (this.driverService.isReturning() || this.driverService.activeTrip()) {
      return this.MID_TRANSLATE_Y; // Disables dragging UP completely in single-card states!
    }
    return 0; // 0px from top (full view)
  }

  get MID_TRANSLATE_Y(): number {
    let visibleHeight = 235; // Original online state docked height
    if (this.driverService.isReturning()) {
      visibleHeight = 175; // Snug height for returning card
    } else if (this.driverService.activeTrip()) {
      visibleHeight = 205; // Snug height for drop-off card
    } else if (!this.driverService.isOnline()) {
      visibleHeight = 235; // Offline card
    }
    return Math.max(80, window.innerHeight - 56 - visibleHeight);
  }

  get MAX_TRANSLATE_Y(): number {
    return window.innerHeight - 56 - 43; // 43px visible (pushed down sliver)
  }

  readonly queueOrdinalText = computed(() => {
    const pos = this.driverService.queuePosition() || 1;
    if (pos === 1) return 'Next for TODA terminal & app passenger dispatch!';
    const ends = ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'];
    const ordStr =
      pos % 100 >= 11 && pos % 100 <= 13 ? `${pos}th` : `${pos}${ends[pos % 10]}`;
    return `${ordStr} for TODA terminal & app passenger dispatch!`;
  });

  hasPendingChanges = signal<boolean>(false);
  private originalDriverOrder: number[] = [];

  constructor() {
    effect(() => {
      // Auto-retract to exact snug content height on any state change
      const _ = this.driverService.isReturning() || this.driverService.activeTrip() || this.driverService.isOnline();
      untracked(() => {
        setTimeout(() => {
          this.setSnap('mid');
        }, 50);
      });
    });

    effect(() => {
      const queue = this.driverService.queue();
      untracked(() => {
        if (!this.hasPendingChanges() && !this.driverService.hasUnsavedQueueOrder()) {
          const ids = queue.map((i) => i.id);
          if (ids.length > 0) {
            this.originalDriverOrder = [...ids];
          }
          setTimeout(() => {
            this.updateVisualQueueNumbers();
          }, 50);
        }
      });
    });

    effect(() => {
      // Automatically re-bind SortableJS whenever the queue container is restored in the DOM
      const containerRef = this.sortableQueueContainer();
      if (containerRef?.nativeElement && this.isAdmin()) {
        untracked(() => {
          setTimeout(() => {
            this.initSortableQueue();
            this.captureOriginalOrder();
            this.updateVisualQueueNumbers();
          }, 80);
        });
      }
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
      setTimeout(() => {
        this.initSortableQueue();
        this.captureOriginalOrder();
      }, 100);
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
    if (this.sortableInstance) {
      try {
        this.sortableInstance.destroy();
      } catch { }
      this.sortableInstance = null;
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

  // =========================================================================
  // SORTABLEJS REORDERING ENGINE (Exact match to PHP frontend)
  // =========================================================================
  private captureOriginalOrder(): void {
    const container = this.sortableQueueContainer()?.nativeElement;
    if (!container) return;
    const items = container.querySelectorAll('.draggable-queue-item:not(.sortable-fallback)');
    const ids: number[] = [];
    items.forEach((item) => {
      const id = item.getAttribute('data-id');
      if (id) ids.push(Number(id));
    });
    if (ids.length > 0) {
      this.originalDriverOrder = ids;
    }
  }

  private checkUnsavedChanges(): void {
    const container = this.sortableQueueContainer()?.nativeElement;
    if (!container) return;

    const items = container.querySelectorAll('.draggable-queue-item:not(.sortable-fallback)');
    const currentOrder: number[] = [];
    items.forEach((item) => {
      const id = item.getAttribute('data-id');
      if (id) currentOrder.push(Number(id));
    });

    if (this.originalDriverOrder.length === 0) {
      this.originalDriverOrder = [...currentOrder];
      this.hasPendingChanges.set(false);
      this.driverService.setHasUnsavedQueueOrder(false);
      return;
    }

    const isDifferent =
      currentOrder.length !== this.originalDriverOrder.length ||
      currentOrder.some((id, idx) => id !== this.originalDriverOrder[idx]);

    this.hasPendingChanges.set(isDifferent);
    this.driverService.setHasUnsavedQueueOrder(isDifferent);
  }

  private initSortableQueue(): void {
    if (!this.isAdmin()) return; // Non-admin normal drivers cannot reorder or override queue!
    const container = this.sortableQueueContainer()?.nativeElement;
    if (!container) return;

    if (this.sortableInstance) {
      try {
        this.sortableInstance.destroy();
      } catch { }
      this.sortableInstance = null;
    }

    this.sortableInstance = new Sortable(container, {
      animation: 200,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      handle: '.drag-handle-icon, .drag-handle',
      draggable: '.draggable-queue-item',
      filter: '.driver-info-col, .queue-number-badge, .admin-arrow-controls, .arr-btn, .fixed-unsaved-order-bar, .fixed-unsaved-order-bar button',
      preventOnFilter: false,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      fallbackClass: 'sortable-fallback',
      chosenClass: 'sortable-chosen',
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 6,
      touchStartThreshold: 6,
      swapThreshold: 0.5,
      onStart: () => {
        this.isItemSorting = true;
        if (this.originalDriverOrder.length === 0) {
          this.captureOriginalOrder();
        }
        if (navigator.vibrate) {
          try {
            navigator.vibrate(20);
          } catch { }
        }
      },
      onChange: () => {
        // Live change queue numbers dynamically on screen as the card pushes other drivers
        this.updateVisualQueueNumbers();
      },
      onEnd: () => {
        this.isItemSorting = false;
        if (navigator.vibrate) {
          try {
            navigator.vibrate([15, 15]);
          } catch { }
        }
        this.ngZone.run(() => {
          this.updateVisualQueueNumbers();
          this.checkUnsavedChanges();
        });
      },
    });
  }

  private updateVisualQueueNumbers(): void {
    const container = this.sortableQueueContainer()?.nativeElement;
    if (!container) return;

    const items = container.querySelectorAll(
      '.draggable-queue-item:not(.sortable-fallback)'
    );
    items.forEach((item, index) => {
      const numSpan = item.querySelector('.queue-number-badge') as HTMLElement;
      if (numSpan) {
        const newText = '#' + (index + 1);
        if (numSpan.innerText !== newText) {
          numSpan.innerText = newText;
        }
        if (index === 0) {
          numSpan.className =
            'queue-number-badge first font-black text-sm px-2.5 py-1 rounded-xl shadow-xs bg-blue-600 text-white shrink-0';
        } else {
          numSpan.className =
            'queue-number-badge font-black text-sm px-2.5 py-1 rounded-xl shadow-xs bg-blue-50 text-blue-700 border border-blue-200 shrink-0';
        }
      }
    });

    const fallback = document.querySelector('.sortable-fallback');
    const ghost = container.querySelector('.sortable-ghost');
    if (fallback && ghost) {
      const realSiblings = Array.from(container.children).filter(
        (child) => !child.classList.contains('sortable-fallback')
      );
      const ghostIndex = realSiblings.indexOf(ghost);
      const fallbackBadge = fallback.querySelector('.queue-number-badge') as HTMLElement;
      if (fallbackBadge && ghostIndex !== -1) {
        fallbackBadge.innerText = '#' + (ghostIndex + 1);
        if (ghostIndex === 0) {
          fallbackBadge.className =
            'queue-number-badge first font-black text-sm px-2.5 py-1 rounded-xl shadow-xs bg-blue-600 text-white shrink-0';
        } else {
          fallbackBadge.className =
            'queue-number-badge font-black text-sm px-2.5 py-1 rounded-xl shadow-xs bg-blue-50 text-blue-700 border border-blue-200 shrink-0';
        }
      }
    }
  }

  // =========================================================================
  // NATIVE BOTTOM SHEET TOUCH ENGINE (Instant Direct 1:1 Response)
  // =========================================================================
  private attachNativeTouchGestures(sheetEl: HTMLElement): void {
    const onStart = (e: TouchEvent | PointerEvent | MouseEvent) => this.onDragStart(e);

    // Support Pointer Events (works uniformly for mouse, touch, stylus & DevTools mobile emulation)
    sheetEl.addEventListener('pointerdown', onStart as EventListener);
    sheetEl.addEventListener('touchstart', onStart as EventListener, { passive: true });
    sheetEl.addEventListener('mousedown', onStart as EventListener);

    this.unbindTouchListeners = () => {
      sheetEl.removeEventListener('pointerdown', onStart as EventListener);
      sheetEl.removeEventListener('touchstart', onStart as EventListener);
      sheetEl.removeEventListener('mousedown', onStart as EventListener);
      this.removeWindowDragListeners();
    };
  }

  private addWindowDragListeners(type: 'pointer' | 'touch' | 'mouse'): void {
    if (type === 'pointer') {
      window.addEventListener('pointermove', this.boundDragMove, { passive: false });
      window.addEventListener('pointerup', this.boundDragEnd);
      window.addEventListener('pointercancel', this.boundDragEnd);
    } else if (type === 'touch') {
      window.addEventListener('touchmove', this.boundDragMove, { passive: false });
      window.addEventListener('touchend', this.boundDragEnd);
      window.addEventListener('touchcancel', this.boundDragEnd);
    } else {
      window.addEventListener('mousemove', this.boundDragMove);
      window.addEventListener('mouseup', this.boundDragEnd);
    }
  }

  private removeWindowDragListeners(): void {
    window.removeEventListener('pointermove', this.boundDragMove);
    window.removeEventListener('pointerup', this.boundDragEnd);
    window.removeEventListener('pointercancel', this.boundDragEnd);

    window.removeEventListener('touchmove', this.boundDragMove);
    window.removeEventListener('touchend', this.boundDragEnd);
    window.removeEventListener('touchcancel', this.boundDragEnd);

    window.removeEventListener('mousemove', this.boundDragMove);
    window.removeEventListener('mouseup', this.boundDragEnd);
  }

  private getClientY(e: TouchEvent | PointerEvent | MouseEvent): number {
    if ('touches' in e && e.touches && e.touches.length > 0) return e.touches[0].clientY;
    if ('changedTouches' in e && e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientY;
    return (e as MouseEvent | PointerEvent).clientY;
  }

  private getClientX(e: TouchEvent | PointerEvent | MouseEvent): number {
    if ('touches' in e && e.touches && e.touches.length > 0) return e.touches[0].clientX;
    if ('changedTouches' in e && e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientX;
    return (e as MouseEvent | PointerEvent).clientX;
  }

  private getCurrentTranslateY(): number {
    const el = this.sheetRef()?.nativeElement;
    if (!el) return this.activeTranslateY || this.MID_TRANSLATE_Y;
    const style = window.getComputedStyle(el);
    const transform = style.transform || (style as any).webkitTransform;
    if (transform && transform !== 'none') {
      const match = transform.match(/^matrix\((.+)\)$/);
      if (match) return parseFloat(match[1].split(',')[5]) || this.activeTranslateY;
      const match3d = transform.match(/^matrix3d\((.+)\)$/);
      if (match3d) return parseFloat(match3d[1].split(',')[13]) || this.activeTranslateY;
    }
    return this.activeTranslateY || this.MID_TRANSLATE_Y;
  }

  private onDragStart(e: TouchEvent | PointerEvent | MouseEvent): void {
    if (this.isItemSorting || this.currentDragEventType !== null) {
      return;
    }

    if ('button' in e && (e as MouseEvent).button !== 0 && (e as MouseEvent).button !== undefined) {
      return;
    }

    const targetEl = e.target as HTMLElement;
    if (targetEl) {
      // Exclude ONLY the 6-dots drag handle icon so grabbing reorders the queue, while touching anywhere else drags the sheet
      if (
        targetEl.closest(
          '.drag-handle-icon, .drag-handle, [data-no-sheet-drag], .sortable-drag, .sortable-chosen, .sortable-fallback, .fixed-unsaved-order-bar'
        )
      ) {
        return;
      }
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
    if (this.isHeaderOrHandle(targetEl)) {
      this.startScrollTop = 0;
    }

    this.startTouchY = this.getClientY(e);
    this.startTouchX = this.getClientX(e);
    this.lastTouchY = this.startTouchY;
    this.lastTouchTime = performance.now();
    this.velocity = 0;

    this.baseTranslateY = this.activeTranslateY || this.getCurrentTranslateY();
    this.dragAnchorY = this.startTouchY;

    if ('pointerId' in e) {
      this.currentDragEventType = 'pointer';
    } else if ('touches' in e) {
      this.currentDragEventType = 'touch';
    } else {
      this.currentDragEventType = 'mouse';
    }
    this.addWindowDragListeners(this.currentDragEventType);
  }

  private isHeaderOrHandle(el: HTMLElement | null): boolean {
    if (!el) return false;
    return Boolean(
      el.closest(
        '#sheet-drag-handle, .sheet-drag-handle, #queue-card-container, .queue-card-sticky-wrapper, #hero-queue-card, .srh-queue-hero-card'
      )
    );
  }

  private onDragMove(e: TouchEvent | PointerEvent | MouseEvent): void {
    if (this.isItemSorting || this.gestureMode === 'ignored' || this.currentDragEventType === null) return;

    if ('buttons' in e && (e as MouseEvent).buttons === 0 && (this.currentDragEventType === 'mouse' || (this.currentDragEventType === 'pointer' && (e as PointerEvent).pointerType === 'mouse'))) {
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

    const isSheetAtTop = this.activeTranslateY <= this.MIN_TRANSLATE_Y + 5;
    const targetEl = e.target as HTMLElement;

    if (this.gestureMode === 'idle') {
      if (Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && Math.abs(deltaX) > 8) {
        this.gestureMode = 'ignored';
        this.removeWindowDragListeners();
        this.currentDragEventType = null;
        return;
      }

      if (Math.abs(deltaY) >= 2) {
        this.hasMoved = true;
        const isHeaderTouch = this.isHeaderOrHandle(targetEl);

        if (!isSheetAtTop || isHeaderTouch) {
          // Sheet is not at MAX, or user touched top handle/hero card -> Sheet Drag
          this.gestureMode = 'sheet_drag';
          this.dragAnchorY = curY;
          this.baseTranslateY = this.activeTranslateY;
          if (e.cancelable) e.preventDefault();
        } else {
          // Sheet is at MAX:
          if (deltaY > 0 && this.startScrollTop <= 0) {
            // User touches inside the queue list while at the top (scrollTop <= 0) and pulls DOWN -> Sheet Drag!
            this.gestureMode = 'sheet_drag';
            this.dragAnchorY = curY;
            this.baseTranslateY = this.MIN_TRANSLATE_Y;
            if (e.cancelable) e.preventDefault();
          } else {
            // User touches inside the list when scrolled or moving UP -> 100% Native List Scroll
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

      const dragDelta = curY - this.dragAnchorY;
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

    // If user only tapped without moving:
    if (this.baseTranslateY <= this.MIN_TRANSLATE_Y + 5 && finalPos <= this.MIN_TRANSLATE_Y + 5 && !this.hasMoved) {
      this.dragEnd.emit();
      return;
    }

    const dragDelta = finalPos - this.baseTranslateY; // < 0 is Drag UP, > 0 is Drag DOWN
    const isFlickUp = this.velocity < -0.3;
    const isFlickDown = this.velocity > 0.3;
    const isStrongFlickDown = this.velocity > 0.7;
    const isStrongFlickUp = this.velocity < -0.7;

    let targetSnap: SheetSnap = 'mid';

    // Determine current starting snap state
    const isStartedNearMin = this.baseTranslateY >= this.MID_TRANSLATE_Y + 40;
    const isStartedNearMax = this.baseTranslateY <= this.MIN_TRANSLATE_Y + 40;

    // In returning or active trip states: only snap between mid (docked) and min (tucked down), never max (fullscreen)
    if (this.driverService.isReturning() || this.driverService.activeTrip()) {
      if (finalPos >= this.MID_TRANSLATE_Y + 50 || isFlickDown) {
        targetSnap = 'min';
      } else {
        targetSnap = 'mid';
      }
      this.animateToSnap(targetSnap, 320);
      return;
    }

    if (isStartedNearMax) {
      // Starting from fully expanded (MAX)
      // Only go all the way to MIN if dragged past MID or strong intentional downward flick
      if (finalPos >= this.MID_TRANSLATE_Y + 80 || (finalPos >= this.MID_TRANSLATE_Y && isStrongFlickDown)) {
        targetSnap = 'min';
      } else if (dragDelta > 35 || isFlickDown) {
        targetSnap = 'mid'; // Gracefully stops at MID
      } else {
        targetSnap = 'max';
      }
    } else if (isStartedNearMin) {
      // Starting from collapsed bottom (MIN)
      // Only go all the way to MAX if dragged past MID or strong intentional upward flick
      if (finalPos <= this.MID_TRANSLATE_Y - 80 || (finalPos <= this.MID_TRANSLATE_Y && isStrongFlickUp)) {
        targetSnap = 'max';
      } else if (dragDelta < -35 || isFlickUp) {
        targetSnap = 'mid'; // Gracefully stops at MID
      } else {
        targetSnap = 'min';
      }
    } else {
      // Starting from resting middle (MID)
      if (dragDelta < -40 || isFlickUp) {
        targetSnap = 'max';
      } else if (dragDelta > 40 || isFlickDown) {
        targetSnap = 'min';
      } else {
        targetSnap = 'mid';
      }
    }

    this.animateToSnap(targetSnap, 340);
  }

  setSnap(snap: SheetSnap): void {
    this.animateToSnap(snap, 340);
  }

  private animateToSnap(targetSnap: SheetSnap, duration = 340): void {
    if (this.snapRafId !== null) {
      cancelAnimationFrame(this.snapRafId);
      this.snapRafId = null;
    }

    if ((this.driverService.isReturning() || this.driverService.activeTrip()) && targetSnap === 'max') {
      targetSnap = 'mid';
    }

    let targetTranslateY = this.MID_TRANSLATE_Y;
    if (targetSnap === 'min') targetTranslateY = this.MAX_TRANSLATE_Y;
    else if (targetSnap === 'max') targetTranslateY = this.MIN_TRANSLATE_Y;

    const sheetEl = this.sheetRef()?.nativeElement;
    const contentEl = this.scrollContentRef()?.nativeElement;

    if (sheetEl) {
      sheetEl.style.transition = 'none';
      sheetEl.style.willChange = 'transform';
    }

    // Immediately enable scrolling when moving to max so user can scroll right away even while snapping up
    if (contentEl && targetSnap === 'max') {
      contentEl.style.overflowY = 'auto';
    }

    const startY = this.activeTranslateY;
    const diffY = targetTranslateY - startY;
    const startTime = performance.now();

    this.dragStart.emit();

    const snapStep = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      // Fast, smooth cubic ease-out deceleration curve for ultra-smooth gliding
      const ease = 1 - Math.pow(1 - progress, 3.2);
      const currentY = startY + diffY * ease;

      this.activeTranslateY = currentY;

      if (sheetEl) {
        sheetEl.style.transform = `translate3d(0, ${currentY.toFixed(2)}px, 0)`;
      }
      this.dragSync.emit(currentY);

      if (progress < 1) {
        this.snapRafId = requestAnimationFrame(snapStep);
      } else {
        this.snapRafId = null;
        this.activeTranslateY = targetTranslateY;
        if (sheetEl) {
          sheetEl.style.transform = `translate3d(0, ${targetTranslateY.toFixed(2)}px, 0)`;
          sheetEl.style.willChange = 'auto';
        }
        if (contentEl) {
          if (targetSnap === 'max') {
            contentEl.style.overflowY = 'auto';
          } else {
            contentEl.style.overflowY = 'hidden';
            contentEl.scrollTop = 0;
          }
        }
        this.ngZone.run(() => {
          this.snapState.set(targetSnap);
          this.snapChange.emit(targetSnap);
          this.dragEnd.emit();
        });
      }
    };

    this.snapRafId = requestAnimationFrame(snapStep);
  }

  onStartWalkIn(): void {
    if (!this.driverService.isOnline()) return;
    this.startWalkIn.emit();
  }

  onDropOff(): void {
    this.dropOffClick.emit();
  }

  onAddWayside(): void {
    this.addWayside.emit();
  }

  onToggleDuty(): void {
    this.toggleDutyClick.emit();
  }

  saveAdminQueue(): void {
    const container = this.sortableQueueContainer()?.nativeElement;
    if (!container) return;
    const items = container.querySelectorAll(
      '.draggable-queue-item:not(.sortable-fallback)'
    );
    const newOrder: number[] = [];
    items.forEach((el) => {
      const id = el.getAttribute('data-id');
      if (id) newOrder.push(Number(id));
    });

    if (newOrder.length > 0) {
      this.originalDriverOrder = [...newOrder];
      this.driverService.reorderQueue(newOrder);
      this.driverService.saveQueueOrder(newOrder);
    }
    this.hasPendingChanges.set(false);
    this.driverService.setHasUnsavedQueueOrder(false);
    this.updateVisualQueueNumbers();
  }

  cancelAdminQueue(): void {
    const container = this.sortableQueueContainer()?.nativeElement;
    if (container && this.originalDriverOrder.length > 0) {
      const itemMap = new Map<number, HTMLElement>();
      const items = container.querySelectorAll(
        '.draggable-queue-item:not(.sortable-fallback)'
      );
      items.forEach((item) => {
        const id = Number(item.getAttribute('data-id'));
        if (id) itemMap.set(id, item as HTMLElement);
      });

      this.originalDriverOrder.forEach((id) => {
        const item = itemMap.get(id);
        if (item) {
          container.appendChild(item);
        }
      });
    }

    this.driverService.cancelQueueOrderChanges();
    this.hasPendingChanges.set(false);
    this.driverService.setHasUnsavedQueueOrder(false);
    this.updateVisualQueueNumbers();
  }
}
