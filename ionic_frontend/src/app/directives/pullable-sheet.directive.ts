import {
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  NgZone,
} from '@angular/core';

export interface SheetSyncEvent {
  visibleHeight: number;
  translateY: number;
  maxAllowed: number;
  isDragging: boolean;
  sheetTop: number;
}

export type SheetSnapState = 'min' | 'mid' | 'max';

@Directive({
  selector: '[appPullableSheet]',
  standalone: true,
})
export class PullableSheetDirective implements OnInit, OnDestroy {
  @Input() handleSelector: string = '.sheet-handle-bar';
  @Input() contentSelector: string = '.sheet-content-wrap';
  @Input() minButtonsBottom: number = 76;
  @Input() initialExpanded: boolean = false;
  @Input() disabled: boolean = false;

  // ── 3-State / 2-State Position Anchors ──
  @Input() minTranslateY?: number; // Top / full expanded position (0px down)
  @Input() midTranslateY?: number; // Middle / peek position (cardHeight - 235px down)
  @Input() maxTranslateY?: number; // Bottom / collapsed sliver position (cardHeight - 44px down)
  @Input() snapMode: '2-state' | '3-state' = '3-state';

  @Output() sync = new EventEmitter<SheetSyncEvent>();
  @Output() stateChange = new EventEmitter<'expanded' | 'collapsed' | 'mid'>();
  @Output() snapChange = new EventEmitter<SheetSnapState>();

  private cardEl!: HTMLElement;
  private handleEl: HTMLElement | null = null;
  private contentEl: HTMLElement | null = null;

  private startTouchY: number = 0;
  private startTouchX: number = 0;
  private lastTouchY: number = 0;
  private lastTouchTime: number = 0;
  private velocity: number = 0;
  private baseTranslateY: number = 0;
  private activeTranslateY: number = 0;
  private dragAnchorY: number = 0;
  private startScrollTop: number = 0;
  private gestureMode: 'idle' | 'sheet_drag' | 'content_scroll' | 'ignored' = 'idle';
  private hasMoved: boolean = false;

  private snapRafId: number | null = null;
  private snapState: SheetSnapState = 'mid';
  private cleanupFns: Array<() => void> = [];

  constructor(
    private el: ElementRef<HTMLElement>,
    private ngZone: NgZone
  ) { }

  // ── Stage & Peek Dimension Resolvers ──
  private getStageHeight(): number {
    const parent = this.cardEl?.parentElement;
    return parent?.clientHeight || parent?.offsetHeight || this.cardEl?.clientHeight || window.innerHeight;
  }

  private getPeekHeight(): number {
    const heroCard = this.cardEl?.querySelector('.queue-hero-card, .booking-card, .queue-card-container') as HTMLElement;
    if (heroCard) {
      const rect = heroCard.getBoundingClientRect();
      const sheetRect = this.cardEl.getBoundingClientRect();
      const h = (rect.bottom - sheetRect.top) + 14;
      if (h > 150 && h < 550) return Math.round(h);
    }
    return 275;
  }

  // ── 3 State Anchor Getters ──
  get MIN_TRANSLATE_Y(): number {
    if (this.minTranslateY !== undefined) return this.minTranslateY;
    return 0; // 0px down from top (full screen view)
  }

  get MID_TRANSLATE_Y(): number {
    if (this.midTranslateY !== undefined) return this.midTranslateY;
    const stageH = this.getStageHeight();
    return Math.max(0, stageH - this.getPeekHeight());
  }

  get MAX_TRANSLATE_Y(): number {
    if (this.maxTranslateY !== undefined) return this.maxTranslateY;
    const stageH = this.getStageHeight();
    return Math.max(0, stageH - 52);
  }

  ngOnInit(): void {
    this.cardEl = this.el.nativeElement;
    this.ngZone.runOutsideAngular(() => {
      this.initElements();
      this.bindEvents();
      this.snapState = this.initialExpanded ? 'max' : 'mid';

      const applyInitialPosition = () => {
        const stageH = this.getStageHeight();
        if (!stageH || stageH <= 0) return;

        const targetY = this.initialExpanded ? this.MIN_TRANSLATE_Y : this.MID_TRANSLATE_Y;
        this.activeTranslateY = targetY;
        this.cardEl.style.transition = 'none';
        this.cardEl.style.transform = `translate3d(0, ${targetY.toFixed(2)}px, 0)`;
        this.emitSync(targetY, false);
      };

      applyInitialPosition();

      requestAnimationFrame(() => {
        applyInitialPosition();
      });
    });
  }

  ngOnDestroy(): void {
    this.stopAnimations();
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
  }

  private initElements(): void {
    this.handleEl = this.cardEl.querySelector(this.handleSelector);
    this.contentEl = this.cardEl.querySelector(this.contentSelector);
  }

  public recalculateLimits(): number {
    return this.MAX_TRANSLATE_Y;
  }

  public getMaxAllowed(): number {
    return this.MAX_TRANSLATE_Y;
  }

  public getCurrentY(): number {
    const style = window.getComputedStyle(this.cardEl);
    const transform = style.transform || (style as any).webkitTransform;
    if (transform && transform !== 'none') {
      const matrix = transform.match(/^matrix\((.+)\)$/);
      if (matrix) return parseFloat(matrix[1].split(',')[5]) || 0;
      const matrix3d = transform.match(/^matrix3d\((.+)\)$/);
      if (matrix3d) return parseFloat(matrix3d[1].split(',')[13]) || 0;
    }
    return this.activeTranslateY;
  }

  private isFormInteractionTarget(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    return !!target.closest(
      'input, button, select, textarea, form, .landmark-chip, [data-no-sheet-drag]'
    );
  }

  private bindEvents(): void {
    const canUsePointer = 'PointerEvent' in window;

    const onPointerDown = (e: PointerEvent) => {
      if (this.disabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (this.isFormInteractionTarget(e.target)) return;
      this.handleGestureStart(e.clientX, e.clientY);
      try {
        this.cardEl.setPointerCapture(e.pointerId);
      } catch (err) { }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.gestureMode === 'idle' && this.lastTouchTime === 0) return;
      this.handleGestureMove(e.clientX, e.clientY, e);
    };

    const onPointerUp = (e: PointerEvent) => {
      this.handleGestureEnd();
      try {
        this.cardEl.releasePointerCapture(e.pointerId);
      } catch (err) { }
    };

    if (canUsePointer) {
      this.cardEl.addEventListener('pointerdown', onPointerDown);
      this.cardEl.addEventListener('pointermove', onPointerMove, { passive: false });
      this.cardEl.addEventListener('pointerup', onPointerUp, { capture: true });
      this.cardEl.addEventListener('pointercancel', onPointerUp, { capture: true });

      this.cleanupFns.push(() => {
        this.cardEl.removeEventListener('pointerdown', onPointerDown);
        this.cardEl.removeEventListener('pointermove', onPointerMove);
        this.cardEl.removeEventListener('pointerup', onPointerUp, { capture: true });
        this.cardEl.removeEventListener('pointercancel', onPointerUp, { capture: true });
      });
    } else {
      const onTouchStart = (e: TouchEvent) => {
        if (this.disabled || !e.touches?.length) return;
        if (this.isFormInteractionTarget(e.target)) return;
        this.handleGestureStart(e.touches[0].clientX, e.touches[0].clientY);
      };

      const onTouchMove = (e: TouchEvent) => {
        if (e.touches?.length) {
          this.handleGestureMove(e.touches[0].clientX, e.touches[0].clientY, e);
        }
      };

      const onTouchEnd = () => {
        this.handleGestureEnd();
      };

      this.cardEl.addEventListener('touchstart', onTouchStart, { passive: false });
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd, { capture: true });
      window.addEventListener('touchcancel', onTouchEnd, { capture: true });

      this.cleanupFns.push(() => {
        this.cardEl.removeEventListener('touchstart', onTouchStart);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd, { capture: true });
        window.removeEventListener('touchcancel', onTouchEnd, { capture: true });
      });
    }

    const onCardClick = (e: MouseEvent) => {
      if (this.hasMoved) {
        e.preventDefault();
        e.stopPropagation();
        this.hasMoved = false;
      }
    };
    this.cardEl.addEventListener('click', onCardClick, true);
    this.cleanupFns.push(() => this.cardEl.removeEventListener('click', onCardClick, true));
  }

  private handleGestureStart(clientX: number, clientY: number): void {
    this.stopAnimations();
    this.startTouchY = clientY;
    this.startTouchX = clientX;
    this.lastTouchY = clientY;
    this.lastTouchTime = performance.now();
    this.velocity = 0;
    this.hasMoved = false;
    this.gestureMode = 'idle';

    this.baseTranslateY = this.getCurrentY();
    this.activeTranslateY = this.baseTranslateY;

    if (this.contentEl) {
      this.startScrollTop = this.contentEl.scrollTop;
    }
  }

  private handleGestureMove(clientX: number, clientY: number, evt?: Event): void {
    const curY = clientY;
    const curX = clientX;
    const now = performance.now();
    const dt = Math.max(1, now - this.lastTouchTime);
    this.velocity = (curY - this.lastTouchY) / dt;
    this.lastTouchY = curY;
    this.lastTouchTime = now;

    const deltaY = curY - this.startTouchY;
    const deltaX = curX - this.startTouchX;

    if (this.gestureMode === 'idle') {
      if (Math.abs(deltaY) < 4 && Math.abs(deltaX) < 4) return;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        this.gestureMode = 'ignored';
        return;
      }

      this.hasMoved = true;
      const isSheetAtTop = this.baseTranslateY <= this.MIN_TRANSLATE_Y + 5;

      if (!isSheetAtTop) {
        if (this.contentEl) this.contentEl.style.overflowY = 'hidden';
        this.gestureMode = 'sheet_drag';
        this.dragAnchorY = this.startTouchY;
        if (evt?.cancelable) evt.preventDefault();
      } else {
        if (deltaY < 0 || this.startScrollTop > 0) {
          this.gestureMode = 'content_scroll';
        } else {
          if (this.contentEl) this.contentEl.style.overflowY = 'hidden';
          this.gestureMode = 'sheet_drag';
          this.dragAnchorY = this.startTouchY;
          this.baseTranslateY = this.MIN_TRANSLATE_Y;
          if (evt?.cancelable) evt.preventDefault();
        }
      }
    }

    if (this.gestureMode === 'content_scroll') return;

    if (this.gestureMode === 'sheet_drag') {
      if (evt?.cancelable) evt.preventDefault();
      if (this.contentEl) this.contentEl.style.overflowY = 'hidden';

      const dragDelta = curY - this.dragAnchorY;
      const minAllowed = this.snapMode === '2-state' ? this.MID_TRANSLATE_Y : this.MIN_TRANSLATE_Y;
      const rawTranslateY = Math.max(
        minAllowed,
        Math.min(this.MAX_TRANSLATE_Y, this.baseTranslateY + dragDelta)
      );

      this.activeTranslateY = rawTranslateY;
      this.cardEl.style.transition = 'none';
      this.cardEl.style.transform = `translate3d(0, ${rawTranslateY.toFixed(2)}px, 0)`;

      this.emitSync(rawTranslateY, true);
    }
  }

  private handleGestureEnd(): void {
    if (this.gestureMode !== 'sheet_drag') {
      this.gestureMode = 'idle';
      if (this.contentEl && this.activeTranslateY <= this.MIN_TRANSLATE_Y + 5) {
        this.contentEl.style.overflowY = 'auto';
      }
      return;
    }

    this.gestureMode = 'idle';

    const finalPos = this.activeTranslateY;
    const isFlickUp = this.velocity < -0.6;
    const isFlickDown = this.velocity > 0.6;

    let targetSnap: SheetSnapState = 'mid';

    if (this.snapMode === '2-state') {
      if (isFlickUp) {
        targetSnap = 'mid';
      } else if (isFlickDown) {
        targetSnap = 'min';
      } else {
        const midDist = Math.abs(finalPos - this.MID_TRANSLATE_Y);
        const minDist = Math.abs(finalPos - this.MAX_TRANSLATE_Y);
        targetSnap = midDist < minDist ? 'mid' : 'min';
      }
      this.animateToSnap(targetSnap, 340);
      return;
    }

    if (isFlickUp) {
      if (this.velocity < -1.4 || this.baseTranslateY <= this.MID_TRANSLATE_Y + 20) {
        targetSnap = 'max'; // Top Full View
      } else {
        targetSnap = 'mid';
      }
    } else if (isFlickDown) {
      if (this.velocity > 1.4 || this.baseTranslateY >= this.MID_TRANSLATE_Y - 20) {
        targetSnap = 'min'; // Bottom Collapsed Sliver
      } else {
        targetSnap = 'mid';
      }
    } else {
      // Distance-based threshold snap
      if (this.baseTranslateY <= this.MIN_TRANSLATE_Y + 20) {
        targetSnap = finalPos >= this.MIN_TRANSLATE_Y + 40 ? (finalPos >= this.MID_TRANSLATE_Y + 40 ? 'min' : 'mid') : 'max';
      } else if (this.baseTranslateY >= this.MAX_TRANSLATE_Y - 20) {
        targetSnap = finalPos <= this.MAX_TRANSLATE_Y - 40 ? (finalPos <= this.MID_TRANSLATE_Y - 40 ? 'max' : 'mid') : 'min';
      } else {
        if (finalPos <= this.MID_TRANSLATE_Y - 35) {
          targetSnap = 'max';
        } else if (finalPos >= this.MID_TRANSLATE_Y + 35) {
          targetSnap = 'min';
        } else {
          targetSnap = 'mid';
        }
      }
    }

    this.animateToSnap(targetSnap, 340);
  }

  public toggleSnap(): void {
    if (this.hasMoved) return;
    if (this.snapMode === '2-state') {
      this.animateToSnap(this.snapState === 'min' ? 'mid' : 'min', 340);
      return;
    }
    if (this.snapState === 'min') {
      this.animateToSnap('mid', 340);
    } else if (this.snapState === 'mid') {
      this.animateToSnap('max', 340);
    } else {
      this.animateToSnap('mid', 340);
    }
  }

  public toggleSheet(): void {
    this.toggleSnap();
  }

  public setSnap(snap: SheetSnapState): void {
    this.animateToSnap(snap, 340);
  }

  public snapTo(state: 'expanded' | 'collapsed' | 'mid' | 'min' | 'max', duration: number = 340): void {
    let target: SheetSnapState = 'mid';
    if (state === 'expanded' || state === 'max') target = 'max';
    else if (state === 'collapsed' || state === 'min') target = 'min';
    else if (state === 'mid') target = 'mid';
    this.animateToSnap(target, duration);
  }

  private animateToSnap(targetSnap: SheetSnapState, duration: number = 340): void {
    this.stopAnimations();
    this.snapState = targetSnap;
    this.snapChange.emit(targetSnap);

    let targetTranslateY = this.MID_TRANSLATE_Y;
    if (targetSnap === 'min') targetTranslateY = this.MAX_TRANSLATE_Y;
    else if (targetSnap === 'max') targetTranslateY = this.MIN_TRANSLATE_Y;

    this.cardEl.style.transition = 'none';
    this.cardEl.style.willChange = 'transform';

    const startY = this.activeTranslateY;
    const diffY = targetTranslateY - startY;
    const startTime = performance.now();

    const snapStep = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      // Quintic ease-out matching queue-card.component.ts
      const ease = 1 - Math.pow(1 - progress, 4);
      const currentY = startY + diffY * ease;

      this.activeTranslateY = currentY;
      this.cardEl.style.transform = `translate3d(0, ${currentY.toFixed(2)}px, 0)`;
      this.emitSync(currentY, false);

      if (progress < 1) {
        this.snapRafId = requestAnimationFrame(snapStep);
      } else {
        this.snapRafId = null;
        this.activeTranslateY = targetTranslateY;
        this.cardEl.style.transform = `translate3d(0, ${targetTranslateY.toFixed(2)}px, 0)`;
        this.cardEl.style.willChange = 'auto';
        if (this.contentEl) {
          this.contentEl.style.overflowY = targetSnap === 'max' ? 'auto' : 'hidden';
        }
        this.emitSync(targetTranslateY, false);
        this.emitState(targetTranslateY);
      }
    };
    this.snapRafId = requestAnimationFrame(snapStep);
  }

  private emitSync(translateY: number, isDragging: boolean): void {
    const stageH = this.cardEl?.parentElement?.offsetHeight || this.cardEl?.offsetHeight || window.innerHeight;
    // Exact visible pixel height of the sheet inside the stage
    const visibleH = Math.max(0, stageH - translateY);
    this.sync.emit({
      visibleHeight: visibleH,
      translateY,
      maxAllowed: this.MAX_TRANSLATE_Y,
      isDragging,
      sheetTop: translateY,
    });
  }

  private emitState(y: number): void {
    let state: 'expanded' | 'collapsed' | 'mid' = 'collapsed';
    if (y <= this.MIN_TRANSLATE_Y + 15) {
      state = 'expanded';
    } else if (Math.abs(y - this.MID_TRANSLATE_Y) <= 30) {
      state = 'mid';
    }
    this.stateChange.emit(state);
  }

  private stopAnimations(): void {
    if (this.snapRafId !== null) {
      cancelAnimationFrame(this.snapRafId);
      this.snapRafId = null;
    }
  }
}
