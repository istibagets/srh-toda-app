import { Injectable, inject, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Location } from '@angular/common';
import { ModalController, NavController } from '@ionic/angular';
import { filter } from 'rxjs/operators';
import { AttachmentViewerService } from './attachment-viewer.service';

@Injectable({
  providedIn: 'root',
})
export class SwipeBackService {
  private router = inject(Router);
  private location = inject(Location);
  private modalController = inject(ModalController);
  private navController = inject(NavController);
  private attachmentViewer = inject(AttachmentViewerService);

  private history: string[] = [];
  private maxHistoryLength = 30;

  // Swipe gesture detection state
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private isEdgeSwipeCandidate = false;
  private isSwipingBack = false;

  // Visual feedback signal
  edgeSwipeProgress = signal<number>(0);
  isIndicatorVisible = signal<boolean>(false);

  constructor() {
    this.initRouteHistoryTracker();
    this.initGlobalGestureListeners();
  }

  private initRouteHistoryTracker(): void {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        const url = event.urlAfterRedirects || event.url;
        // Avoid duplicate consecutive entries
        if (this.history.length === 0 || this.history[this.history.length - 1] !== url) {
          this.history.push(url);
          if (this.history.length > this.maxHistoryLength) {
            this.history.shift();
          }
        }
      });
  }

  private initGlobalGestureListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener(
      'touchstart',
      (e: TouchEvent) => this.handleTouchStart(e),
      { passive: true }
    );

    window.addEventListener(
      'touchmove',
      (e: TouchEvent) => this.handleTouchMove(e),
      { passive: true }
    );

    window.addEventListener(
      'touchend',
      (e: TouchEvent) => this.handleTouchEnd(e),
      { passive: true }
    );

    window.addEventListener(
      'touchcancel',
      () => this.resetSwipeState(),
      { passive: true }
    );
  }

  private handleTouchStart(event: TouchEvent): void {
    if (event.touches.length !== 1) {
      this.resetSwipeState();
      return;
    }

    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = Date.now();

    // Strictly check if touch starts near the left edge of the screen (within 40px)
    const isLeftEdge = this.touchStartX <= 40;

    // Don't trigger if touch originates from attachment viewer canvas, map canvas, or interactive sliders
    const target = event.target as HTMLElement | null;
    const isExcluded = target?.closest('.viewer-body-viewport, .viewer-canvas-frame, .viewer-doc-image, .maplibregl-canvas, .maplibregl-map, input[type="range"]');

    if (isLeftEdge && !isExcluded) {
      this.isEdgeSwipeCandidate = true;
      this.isSwipingBack = false;
    } else {
      this.isEdgeSwipeCandidate = false;
    }
  }

  private handleTouchMove(event: TouchEvent): void {
    if (!this.isEdgeSwipeCandidate || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;

    // Must be primarily horizontal rightward swipe
    if (deltaX > 20 && Math.abs(deltaY) < deltaX * 0.75) {
      this.isSwipingBack = true;
      const progress = Math.min(1, Math.max(0, (deltaX - 20) / 100));
      this.edgeSwipeProgress.set(progress);
      this.isIndicatorVisible.set(true);
    } else if (Math.abs(deltaY) > deltaX) {
      // User is scrolling vertically, cancel edge swipe
      this.resetSwipeState();
    }
  }

  private async handleTouchEnd(event: TouchEvent): Promise<void> {
    if (!this.isSwipingBack) {
      this.resetSwipeState();
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch ? touch.clientX - this.touchStartX : 0;
    const duration = Date.now() - this.touchStartTime;
    const velocity = deltaX / Math.max(1, duration);

    const isSwipeSuccessful = deltaX >= 75 || (deltaX >= 40 && velocity > 0.4);

    if (isSwipeSuccessful) {
      await this.navigateBack();
    }

    this.resetSwipeState();
  }

  private resetSwipeState(): void {
    this.isEdgeSwipeCandidate = false;
    this.isSwipingBack = false;
    this.edgeSwipeProgress.set(0);
    this.isIndicatorVisible.set(false);
  }

  /**
   * Intelligently navigate back to the previous view, tab, modal, or page
   */
  async navigateBack(): Promise<void> {
    // 1. Priority 1: Dismiss open Full-Screen Attachment Viewer
    if (this.attachmentViewer.isOpen()) {
      this.attachmentViewer.close();
      return;
    }

    // 2. Priority 2: Dismiss topmost Ionic Modal if open
    try {
      const topModal = await this.modalController.getTop();
      if (topModal) {
        await this.modalController.dismiss();
        return;
      }
    } catch {
      // Continue to router navigation if modal controller fails
    }

    // 3. Priority 3: Check for native/custom open modal overlays in DOM
    const openCustomModal = document.querySelector('ion-modal.show-modal, ion-modal[is-open="true"]') as HTMLElement | null;
    if (openCustomModal) {
      const closeBtn = openCustomModal.querySelector('.modal-close-btn, .modal-close-round-btn, .back-pill-btn') as HTMLElement | null;
      if (closeBtn) {
        closeBtn.click();
        return;
      }
    }

    // 4. Priority 4: History Stack Navigation
    if (this.history.length > 1) {
      // Remove current route
      this.history.pop();
      const prevUrl = this.history[this.history.length - 1];

      if (prevUrl) {
        try {
          await this.router.navigateByUrl(prevUrl);
          return;
        } catch {
          this.location.back();
          return;
        }
      }
    }

    // 5. Fallback: Browser/Ionic location back
    try {
      this.location.back();
    } catch {
      this.navController.back();
    }
  }
}
