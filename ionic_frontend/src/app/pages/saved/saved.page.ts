import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonIcon,
  IonSpinner,
  IonModal,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  bookmarkOutline,
  bookmark,
  addOutline,
  homeOutline,
  businessOutline,
  schoolOutline,
  cartOutline,
  locationOutline,
  trashOutline,
  shieldOutline,
  footballOutline,
  storefrontOutline,
  navigateOutline,
  closeOutline,
  checkmarkCircleOutline,
  pinOutline,
  sparklesOutline,
  informationCircleOutline,
  chevronDownCircleOutline,
} from 'ionicons/icons';
import { SavedLocationService, SavedLocation, NeighborhoodLandmark } from '../../services/saved-location.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-saved',
  templateUrl: './saved.page.html',
  styleUrls: ['./saved.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonIcon,
    IonSpinner,
    IonModal,
  ],
})
export class SavedPage implements OnInit {
  savedService = inject(SavedLocationService);
  authService = inject(AuthService);
  router = inject(Router);
  private fb = inject(FormBuilder);
  private toastCtrl = inject(ToastController);

  showAddModal = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  filterType = signal<string>('all');

  placeForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    address: ['', [Validators.required, Validators.minLength(3)]],
    type: ['home', [Validators.required]],
    latitude: [15.42955],
    longitude: [120.92240],
  });

  constructor() {
    addIcons({
      bookmarkOutline,
      bookmark,
      addOutline,
      homeOutline,
      businessOutline,
      schoolOutline,
      cartOutline,
      locationOutline,
      trashOutline,
      shieldOutline,
      footballOutline,
      storefrontOutline,
      navigateOutline,
      closeOutline,
      checkmarkCircleOutline,
      pinOutline,
      sparklesOutline,
      informationCircleOutline,
      chevronDownCircleOutline,
    });
  }

  ngOnInit(): void {
    this.savedService.loadSavedLocations().subscribe();
  }

  handleRefresh(event: any): void {
    this.savedService.loadSavedLocations().subscribe({
      next: () => event.target.complete(),
      error: () => event.target.complete(),
    });
  }

  openAddModal(presetType?: string): void {
    this.placeForm.reset({
      name: '',
      address: '',
      type: presetType || 'home',
      latitude: 15.42955,
      longitude: 120.92240,
    });
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
  }

  savePlace(): void {
    if (this.placeForm.invalid) {
      this.placeForm.markAllAsTouched();
      this.showToast('Please fill in place name and address.', 'warning');
      return;
    }

    this.isSaving.set(true);
    const formVal = this.placeForm.value;

    this.savedService.saveLocation(formVal).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeAddModal();
        this.showToast(`⭐ ${formVal.name} saved to your places!`, 'success');
      },
      error: () => {
        this.isSaving.set(false);
        this.showToast('Failed to save location.', 'danger');
      },
    });
  }

  quickSaveLandmark(landmark: NeighborhoodLandmark): void {
    // Check if already saved
    const exists = this.savedService.locations().some(l => l.name.toLowerCase() === landmark.name.toLowerCase());
    if (exists) {
      this.showToast(`${landmark.name} is already in your saved places!`, 'primary');
      return;
    }

    this.savedService.quickSave({
      name: landmark.name,
      address: `${landmark.desc}, Santa Rosa Homes`,
      latitude: landmark.lat,
      longitude: landmark.lng,
      type: 'favorite',
    }).subscribe({
      next: () => {
        this.showToast(`⭐ ${landmark.name} added to your Saved Places!`, 'success');
      },
      error: () => {
        this.showToast('Failed to save landmark.', 'danger');
      },
    });
  }

  deletePlace(location: SavedLocation, event: Event): void {
    event.stopPropagation();
    this.savedService.deleteLocation(location.id).subscribe({
      next: () => {
        this.showToast(`${location.name} removed from saved places.`, 'primary');
      },
      error: () => {
        this.showToast('Could not delete location.', 'danger');
      },
    });
  }

  getTypeIcon(type: string): string {
    switch (type) {
      case 'home': return 'home-outline';
      case 'work': return 'business-outline';
      case 'school': return 'school-outline';
      case 'shopping': return 'cart-outline';
      case 'favorite': return 'sparkles-outline';
      default: return 'location-outline';
    }
  }

  bookRideTo(item: { name: string; latitude?: number; lat?: number; longitude?: number; lng?: number }): void {
    const lat = item.latitude ?? item.lat ?? 15.42955;
    const lng = item.longitude ?? item.lng ?? 120.92240;
    this.router.navigate(['/tabs/home'], {
      queryParams: {
        destination: item.name,
        destLat: lat,
        destLng: lng,
        book: 'true',
      },
    });
  }

  private async showToast(message: string, color: 'success' | 'danger' | 'warning' | 'primary' = 'primary'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color,
      position: 'top',
    });
    await toast.present();
  }
}
