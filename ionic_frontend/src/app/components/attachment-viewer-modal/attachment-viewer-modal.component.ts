import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  chevronBackOutline,
  closeOutline,
  downloadOutline,
  printOutline,
  openOutline,
  addOutline,
  removeOutline,
  refreshOutline,
  expandOutline,
} from 'ionicons/icons';
import { AttachmentViewerService } from '../../services/attachment-viewer.service';

@Component({
  selector: 'app-attachment-viewer-modal',
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: './attachment-viewer-modal.component.html',
  styleUrls: ['./attachment-viewer-modal.component.scss'],
})
export class AttachmentViewerModalComponent {
  viewerService = inject(AttachmentViewerService);

  isOpen = computed(() => this.viewerService.isOpen());
  item = computed(() => this.viewerService.activeAttachment());

  // Interactive Zoom & Pan State
  zoomScale = signal<number>(1);
  panX = signal<number>(0);
  panY = signal<number>(0);

  private initialPinchDist = 0;
  private initialScale = 1;
  private lastTapTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;
  private initialPanX = 0;
  private initialPanY = 0;

  constructor() {
    addIcons({
      arrowBackOutline,
      chevronBackOutline,
      closeOutline,
      downloadOutline,
      printOutline,
      openOutline,
      addOutline,
      removeOutline,
      refreshOutline,
      expandOutline,
    });
  }

  close(): void {
    this.resetZoom();
    this.viewerService.close();
  }

  zoomIn(): void {
    this.zoomScale.update((s) => Math.min(4, +(s + 0.4).toFixed(1)));
  }

  zoomOut(): void {
    this.zoomScale.update((s) => {
      const ns = Math.max(1, +(s - 0.4).toFixed(1));
      if (ns === 1) {
        this.panX.set(0);
        this.panY.set(0);
      }
      return ns;
    });
  }

  resetZoom(): void {
    this.zoomScale.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }

  onWheelZoom(event: WheelEvent): void {
    event.preventDefault();
    if (event.deltaY < 0) {
      this.zoomIn();
    } else {
      this.zoomOut();
    }
  }

  // Touch Handlers for Pinch-to-Zoom and Panning
  onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 2) {
      // Pinch gesture
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      this.initialPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      this.initialScale = this.zoomScale();
    } else if (event.touches.length === 1) {
      const now = Date.now();
      const touch = event.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.initialPanX = this.panX();
      this.initialPanY = this.panY();

      // Double tap to toggle zoom
      if (now - this.lastTapTime < 300) {
        if (this.zoomScale() > 1.2) {
          this.resetZoom();
        } else {
          this.zoomScale.set(2.2);
        }
        this.lastTapTime = 0;
        return;
      }
      this.lastTapTime = now;
    }
  }

  onTouchMove(event: TouchEvent): void {
    if (event.touches.length === 2) {
      event.preventDefault();
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (this.initialPinchDist > 0) {
        const factor = dist / this.initialPinchDist;
        const newScale = Math.min(4, Math.max(1, +(this.initialScale * factor).toFixed(2)));
        this.zoomScale.set(newScale);
        if (newScale === 1) {
          this.panX.set(0);
          this.panY.set(0);
        }
      }
    } else if (event.touches.length === 1) {
      const touch = event.touches[0];
      const deltaX = touch.clientX - this.touchStartX;
      const deltaY = touch.clientY - this.touchStartY;

      if (this.zoomScale() > 1) {
        event.preventDefault();
        const maxPan = (this.zoomScale() - 1) * 220;
        this.panX.set(Math.max(-maxPan, Math.min(maxPan, this.initialPanX + deltaX)));
        this.panY.set(Math.max(-maxPan, Math.min(maxPan, this.initialPanY + deltaY)));
      }
    }
  }

  onTouchEnd(): void {
    this.initialPinchDist = 0;
    if (this.zoomScale() === 1) {
      this.panX.set(0);
      this.panY.set(0);
    }
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) {
      this.close();
    }
  }
}
