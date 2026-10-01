import { Component, input, output, signal, inject, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { star, starOutline, checkmarkCircle, closeOutline, alertCircleOutline, shieldOutline, heartOutline } from 'ionicons/icons';
import { DashboardService } from '../../services/dashboard.service';

@Component({
  selector: 'app-passenger-rating-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: './passenger-rating-modal.component.html',
  styleUrls: ['./passenger-rating-modal.component.scss'],
})
export class PassengerRatingModalComponent {
  private dashboardService = inject(DashboardService);

  ride = input.required<any>();
  isOpen = input<boolean>(false);
  mode = input<'rating' | 'report'>('rating');
  closeModal = output<void>();
  submitted = output<void>();

  rating = signal<number>(5);
  comment = signal<string>('');
  selectedTags = signal<string[]>([]);
  isSubmitting = signal<boolean>(false);

  // Reporting mode
  isReportMode = signal<boolean>(false);
  reportCategory = signal<string>('Overcharging');
  reportSubject = signal<string>('');
  reportDescription = signal<string>('');

  availableTags = [
    'Polite Driver',
    'Smooth Driving',
    'Clean Tricycle',
    'Punctual Arrival',
    'Safe & Careful',
  ];

  ratingLabels: Record<number, string> = {
    1: 'Poor Experience',
    2: 'Needs Improvement',
    3: 'Average Trip',
    4: 'Great Service!',
    5: 'Excellent Ride! ⭐',
  };

  reportCategories = [
    'Overcharging',
    'Reckless Driving',
    'Driver Rudeness / Misconduct',
    'Refusal to Drop Off at Pinned Location',
    'Unsafe Vehicle Condition',
    'Other Issue',
  ];

  constructor() {
    addIcons({
      star,
      starOutline,
      checkmarkCircle,
      closeOutline,
      alertCircleOutline,
      shieldOutline,
      heartOutline,
    });

    // When the modal opens, always start from a clean state — either the rating flow
    // (default) or directly in the incident-report form (for active-ride / history reports).
    effect(() => {
      const open = this.isOpen();
      untracked(() => {
        if (open) {
          this.isReportMode.set(this.mode() === 'report');
          this.isSubmitting.set(false);
          this.reportCategory.set('Overcharging');
          this.reportSubject.set('');
          this.reportDescription.set('');
          this.rating.set(5);
          this.comment.set('');
          this.selectedTags.set([]);
        }
      });
    });
  }

  setRating(stars: number): void {
    this.rating.set(stars);
  }

  toggleTag(tag: string): void {
    this.selectedTags.update((tags) =>
      tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]
    );
  }

  submitRating(): void {
    const r = this.ride();
    if (!r?.id || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.dashboardService
      .rateRide(r.id, {
        rating: this.rating(),
        review_comment: this.comment().trim() || undefined,
        feedback_tags: this.selectedTags(),
      })
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.submitted.emit();
          this.closeModal.emit();
        },
        error: () => {
          this.isSubmitting.set(false);
          this.closeModal.emit();
        },
      });
  }

  submitReport(): void {
    const r = this.ride();
    if (!r?.id || !this.reportDescription().trim() || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.dashboardService
      .reportDriver(r.id, {
        category: this.reportCategory(),
        subject: this.reportSubject().trim() || this.reportCategory(),
        description: this.reportDescription().trim(),
      })
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.submitted.emit();
          this.closeModal.emit();
        },
        error: () => {
          this.isSubmitting.set(false);
          this.closeModal.emit();
        },
      });
  }

  handleClose(): void {
    this.closeModal.emit();
  }
}
