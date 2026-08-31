import { Component, inject, input, output, signal, effect, untracked, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  chatbubbleEllipsesOutline,
  navigateOutline,
  checkmarkCircleOutline,
  closeOutline,
  personOutline,
  callOutline,
  locationOutline,
  timeOutline,
  cashOutline,
  addOutline,
  removeOutline,
  flashOutline,
} from 'ionicons/icons';
import { DriverService } from '../../services/driver.service';

@Component({
  selector: 'app-drop-off-card',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: './drop-off-card.component.html',
  styleUrls: ['./drop-off-card.component.scss'],
})
export class DropOffCardComponent implements OnDestroy {
  driverService = inject(DriverService);

  unreadChatCount = input<number>(0);

  dropOffClick = output<void>();
  openChatClick = output<void>();
  proposeFareClick = output<number>();
  driverArrivedClick = output<void>();
  startTripClick = output<void>();
  cancelTripClick = output<void>();

  // Bargaining state
  proposedFare = signal<number>(25);
  countdownSeconds = signal<number>(20);
  private countdownTimer: any = null;

  constructor() {
    addIcons({
      chatbubbleEllipsesOutline,
      navigateOutline,
      checkmarkCircleOutline,
      closeOutline,
      personOutline,
      callOutline,
      locationOutline,
      timeOutline,
      cashOutline,
      addOutline,
      removeOutline,
      flashOutline,
    });

    effect(() => {
      const trip = this.driverService.activeTrip();
      untracked(() => {
        if (trip?.status === 'bargaining') {
          const defaultF = trip.fare || 25;
          this.proposedFare.set(defaultF);
          this.startCountdown();
        } else {
          this.stopCountdown();
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  private startCountdown(): void {
    this.stopCountdown();
    this.countdownSeconds.set(20);
    this.countdownTimer = setInterval(() => {
      const current = this.countdownSeconds();
      if (current <= 1) {
        this.stopCountdown();
        // Auto-cancel / decline incoming request on timeout
        this.onDecline();
      } else {
        this.countdownSeconds.set(current - 1);
      }
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  adjustFare(delta: number): void {
    const current = this.proposedFare();
    const updated = Math.max(15, Math.min(200, current + delta));
    this.proposedFare.set(updated);
  }

  setPresetFare(fare: number): void {
    this.proposedFare.set(fare);
  }

  onSendProposal(): void {
    this.stopCountdown();
    this.proposeFareClick.emit(this.proposedFare());
  }

  onDecline(): void {
    this.stopCountdown();
    this.cancelTripClick.emit();
  }

  onArrived(): void {
    this.driverArrivedClick.emit();
  }

  onStartTrip(): void {
    this.startTripClick.emit();
  }

  onDropOff(): void {
    this.dropOffClick.emit();
  }

  onOpenChat(): void {
    this.openChatClick.emit();
  }

  onCancelTrip(): void {
    this.cancelTripClick.emit();
  }
}
