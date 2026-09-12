import { Injectable, NgZone } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ToastGestureService {
  private isInitialized = false;
  private activeToast: HTMLElement | null = null;
  private activeWrapper: HTMLElement | null = null;
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;
  private startTime = 0;
  private isSwiping = false;
  private isBlocked = false;
  private restingY = 0;
  private originalTransform = '';

  constructor(private ngZone: NgZone) {}

  init(): void {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    this.ngZone.runOutsideAngular(() => {
      // Touch listeners for mobile devices
      document.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
      document.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
      document.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });
      document.addEventListener('touchcancel', this.onTouchCancel.bind(this), { passive: false });

      // Mouse listeners for desktop preview & testing
      document.addEventListener('mousedown', this.onMouseDown.bind(this));
      document.addEventListener('mousemove', this.onMouseMove.bind(this));
      document.addEventListener('mouseup', this.onMouseUp.bind(this));
    });
  }

  private getToastFromEvent(e: Event): HTMLElement | null {
    const path = e.composedPath ? e.composedPath() : [];
    for (const item of path) {
      if (item instanceof HTMLElement && item.tagName?.toLowerCase() === 'ion-toast') {
        return item;
      }
    }
    const target = e.target as HTMLElement;
    if (target && target.closest) {
      const toast = target.closest('ion-toast');
      if (toast) return toast as HTMLElement;
    }
    return null;
  }

  private getWrapper(toast: HTMLElement): HTMLElement {
    if (toast.shadowRoot) {
      // .toast-wrapper is the outer card containing background, border-radius, and box-shadow
      const wrapper = toast.shadowRoot.querySelector('.toast-wrapper') as HTMLElement;
      if (wrapper) return wrapper;
      const container = toast.shadowRoot.querySelector('.toast-container') as HTMLElement;
      if (container) return container;
    }
    const lightWrapper = toast.querySelector('.toast-wrapper') as HTMLElement;
    if (lightWrapper) return lightWrapper;
    const lightContainer = toast.querySelector('.toast-container') as HTMLElement;
    if (lightContainer) return lightContainer;
    return toast;
  }

  private getRestingY(element: HTMLElement): number {
    try {
      const computed = window.getComputedStyle(element);
      const transform = computed.transform;
      if (!transform || transform === 'none') {
        return 0;
      }
      if (typeof DOMMatrixReadOnly !== 'undefined') {
        const matrix = new DOMMatrixReadOnly(transform);
        return matrix.m42 || 0;
      }
      const match2d = transform.match(/^matrix\((?:[^,]+,){5}\s*([^)]+)\)/);
      if (match2d) {
        return parseFloat(match2d[1]) || 0;
      }
      const match3d = transform.match(/^matrix3d\((?:[^,]+,){13}\s*([^)]+)\)/);
      if (match3d) {
        return parseFloat(match3d[1]) || 0;
      }
    } catch {
      // ignore
    }
    return 0;
  }

  private onTouchStart(e: TouchEvent): void {
    if (!e.touches || e.touches.length !== 1) return;
    const touch = e.touches[0];
    this.handleStart(touch.clientX, touch.clientY, e);
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return; // Only track left-click
    this.handleStart(e.clientX, e.clientY, e);
  }

  private handleStart(clientX: number, clientY: number, e: Event): void {
    const toast = this.getToastFromEvent(e);
    if (!toast) return;

    this.activeToast = toast;
    this.activeWrapper = this.getWrapper(toast);
    this.startX = clientX;
    this.startY = clientY;
    this.currentX = clientX;
    this.currentY = clientY;
    this.startTime = Date.now();
    this.isSwiping = false;
    this.isBlocked = false;
    this.originalTransform = this.activeWrapper.style.transform || '';
    this.restingY = this.getRestingY(this.activeWrapper);
  }

  private onTouchMove(e: TouchEvent): void {
    if (!this.activeToast || !this.activeWrapper || !e.touches || e.touches.length !== 1) return;
    const touch = e.touches[0];
    this.handleMove(touch.clientX, touch.clientY, e);
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.activeToast || !this.activeWrapper) return;
    this.handleMove(e.clientX, e.clientY, e);
  }

  private handleMove(clientX: number, clientY: number, e: Event): void {
    const wrapper = this.activeWrapper;
    if (!wrapper || !this.activeToast) return;

    if (this.isBlocked) {
      return;
    }

    this.currentX = clientX;
    this.currentY = clientY;

    const deltaX = clientX - this.startX;
    const deltaY = clientY - this.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Strictly swipe left or right only:
    // If vertical movement dominates, block this gesture so toast never moves vertically
    if (!this.isSwiping) {
      if (absY > 6 && absY > absX) {
        this.isBlocked = true;
        return;
      } else if (absX > 6 && absX >= absY) {
        this.isSwiping = true;
      } else {
        return;
      }
    }

    if (e.cancelable) {
      e.preventDefault();
    }

    // Pure horizontal translation: Y is locked to its exact resting position
    const tx = deltaX;
    const progress = Math.min(1, absX / 160);
    const opacity = Math.max(0.1, 1 - progress * 0.85);

    wrapper.style.transition = 'none';
    wrapper.style.transform = `translate3d(${tx}px, ${this.restingY}px, 0)`;
    wrapper.style.opacity = `${opacity}`;
  }

  private onTouchEnd(): void {
    this.handleEnd();
  }

  private onMouseUp(): void {
    this.handleEnd();
  }

  private onTouchCancel(): void {
    this.handleCancel();
  }

  private handleEnd(): void {
    if (!this.activeToast || !this.activeWrapper) {
      this.resetState();
      return;
    }

    if (!this.isSwiping) {
      this.resetState();
      return;
    }

    const deltaX = this.currentX - this.startX;
    const absX = Math.abs(deltaX);
    const elapsed = Date.now() - this.startTime;
    const velocityX = absX / Math.max(1, elapsed);

    const toastToDismiss = this.activeToast;
    const wrapper = this.activeWrapper;

    const isSideDismiss = absX > 50 || (absX > 20 && velocityX > 0.3);
    if (isSideDismiss) {
      wrapper.style.transition = 'transform 0.18s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.16s ease';
      wrapper.style.opacity = '0';
      const flyX = deltaX > 0 ? '110vw' : '-110vw';
      wrapper.style.transform = `translate3d(${flyX}, ${this.restingY}px, 0)`;

      setTimeout(() => {
        try {
          (toastToDismiss as any).dismiss();
        } catch {}
      }, 130);
    } else {
      wrapper.style.transition = 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease';
      wrapper.style.transform = this.originalTransform || `translate3d(0px, ${this.restingY}px, 0)`;
      wrapper.style.opacity = '';
    }

    this.resetState();
  }

  private handleCancel(): void {
    if (this.activeWrapper) {
      this.activeWrapper.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      this.activeWrapper.style.transform = this.originalTransform || `translate3d(0px, ${this.restingY}px, 0)`;
      this.activeWrapper.style.opacity = '';
    }
    this.resetState();
  }

  private resetState(): void {
    this.activeToast = null;
    this.activeWrapper = null;
    this.isSwiping = false;
    this.isBlocked = false;
    this.restingY = 0;
    this.originalTransform = '';
  }
}
