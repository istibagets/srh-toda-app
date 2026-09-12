import { Component, OnInit, OnDestroy, inject, signal, viewChild, ElementRef } from '@angular/core';
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
  location,
  trashOutline,
  shieldOutline,
  footballOutline,
  storefrontOutline,
  navigateOutline,
  closeOutline,
  checkmarkCircleOutline,
  pinOutline,
  pin,
  sparklesOutline,
  starOutline,
  star,
  createOutline,
  add,
  remove,
  informationCircleOutline,
} from 'ionicons/icons';
import { SavedLocationService, SavedLocation, NeighborhoodLandmark } from '../../services/saved-location.service';
import { AuthService } from '../../services/auth.service';

declare const maplibregl: any;

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
export class SavedPage implements OnInit, OnDestroy {
  savedService = inject(SavedLocationService);
  authService = inject(AuthService);
  router = inject(Router);
  private fb = inject(FormBuilder);
  private toastCtrl = inject(ToastController);

  showAddModal = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  editingLocationId = signal<number | null>(null);

  // Map coordinates tracking
  selectedLat = signal<number>(15.42780);
  selectedLng = signal<number>(120.92450);

  modalMapContainer = viewChild<ElementRef<HTMLDivElement>>('modalMapContainer');
  private miniMap: any = null;
  private miniMapMarker: any = null;

  placeForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    address: ['', [Validators.required, Validators.minLength(3)]],
    type: ['custom', [Validators.required]],
    latitude: [15.42780],
    longitude: [120.92450],
  });

  constructor() {
    addIcons({
      bookmarkOutline,
      bookmark,
      addOutline,
      add,
      remove,
      homeOutline,
      businessOutline,
      schoolOutline,
      cartOutline,
      locationOutline,
      location,
      trashOutline,
      shieldOutline,
      footballOutline,
      storefrontOutline,
      navigateOutline,
      closeOutline,
      checkmarkCircleOutline,
      pinOutline,
      pin,
      sparklesOutline,
      starOutline,
      star,
      createOutline,
      informationCircleOutline,
    });
  }

  ngOnInit(): void {
    this.savedService.loadSavedLocations().subscribe();
  }

  ngOnDestroy(): void {
    this.destroyMiniMap();
  }

  handleRefresh(event: any): void {
    this.savedService.loadSavedLocations().subscribe({
      next: () => event.target.complete(),
      error: () => event.target.complete(),
    });
  }

  hasSavedType(type: string): boolean {
    return this.savedService.locations().some((loc) => loc.type === type);
  }

  openAddModal(presetType: string = 'custom'): void {
    this.editingLocationId.set(null);
    this.selectedLat.set(15.42780);
    this.selectedLng.set(120.92450);

    let defaultName = '';
    if (presetType === 'school') defaultName = 'School';
    else if (presetType === 'work') defaultName = 'Work';
    else if (presetType === 'market') defaultName = 'Public Market';
    else if (presetType === 'home') defaultName = 'Home';

    this.placeForm.reset({
      name: defaultName,
      address: '',
      type: presetType,
      latitude: 15.42780,
      longitude: 120.92450,
    });
    this.showAddModal.set(true);
  }

  openEditModal(place: SavedLocation, event?: Event): void {
    if (event) event.stopPropagation();
    this.editingLocationId.set(place.id);
    this.selectedLat.set(place.latitude || 15.42780);
    this.selectedLng.set(place.longitude || 120.92450);

    this.placeForm.reset({
      name: place.name,
      address: place.address,
      type: place.type || 'custom',
      latitude: place.latitude || 15.42780,
      longitude: place.longitude || 120.92450,
    });
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
    this.destroyMiniMap();
  }

  selectCategory(category: string): void {
    this.placeForm.patchValue({ type: category });
  }

  onModalPresented(): void {
    setTimeout(() => {
      this.initMiniMap();
    }, 120);
  }

  private initMiniMap(): void {
    const container = document.getElementById('saved-modal-map');
    if (!container) return;

    if (this.miniMap) {
      this.miniMap.resize();
      this.miniMap.setCenter([this.selectedLng(), this.selectedLat()]);
      if (this.miniMapMarker) {
        this.miniMapMarker.setLngLat([this.selectedLng(), this.selectedLat()]);
      }
      return;
    }

    try {
      this.miniMap = new maplibregl.Map({
        container: container,
        style: {
          version: 8,
          sources: {
            'carto-voyager': {
              type: 'raster',
              tiles: [
                'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
                'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
                'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
              ],
              tileSize: 256,
            },
          },
          layers: [
            {
              id: 'carto-layer',
              type: 'raster',
              source: 'carto-voyager',
              minzoom: 0,
              maxzoom: 20,
            },
          ],
        },
        center: [this.selectedLng(), this.selectedLat()],
        zoom: 15.5,
        attributionControl: false,
      });

      // Pin marker element
      const pinEl = document.createElement('div');
      pinEl.className = 'modal-map-pin-pulse';
      pinEl.innerHTML = `
        <div class="pin-dot">
          <svg viewBox="0 0 24 24" fill="currentColor" class="pin-svg">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
          </svg>
        </div>
      `;

      this.miniMapMarker = new maplibregl.Marker({
        element: pinEl,
        draggable: true,
        anchor: 'bottom',
      })
        .setLngLat([this.selectedLng(), this.selectedLat()])
        .addTo(this.miniMap);

      this.miniMapMarker.on('dragend', () => {
        const lngLat = this.miniMapMarker!.getLngLat();
        this.updateSelectedCoords(lngLat.lat, lngLat.lng);
      });

      this.miniMap.on('click', (e: any) => {
        const { lng, lat } = e.lngLat;
        this.miniMapMarker?.setLngLat([lng, lat]);
        this.updateSelectedCoords(lat, lng);
      });

      this.miniMap.on('load', () => {
        this.miniMap?.resize();
      });
    } catch (err) {
      console.warn('Mini map init notice:', err);
    }
  }

  private updateSelectedCoords(lat: number, lng: number): void {
    this.selectedLat.set(Number(lat.toFixed(5)));
    this.selectedLng.set(Number(lng.toFixed(5)));
    this.placeForm.patchValue({
      latitude: Number(lat.toFixed(5)),
      longitude: Number(lng.toFixed(5)),
    });
  }

  zoomIn(): void {
    this.miniMap?.zoomIn();
  }

  zoomOut(): void {
    this.miniMap?.zoomOut();
  }

  private destroyMiniMap(): void {
    if (this.miniMapMarker) {
      this.miniMapMarker.remove();
      this.miniMapMarker = null;
    }
    if (this.miniMap) {
      this.miniMap.remove();
      this.miniMap = null;
    }
  }

  savePlace(): void {
    if (this.placeForm.invalid) {
      this.placeForm.markAllAsTouched();
      this.showToast('Please enter a place name and address.', 'warning');
      return;
    }

    this.isSaving.set(true);
    const formVal = this.placeForm.value;
    const editingId = this.editingLocationId();

    if (editingId) {
      this.savedService.updateLocation(editingId, formVal).subscribe({
        next: () => {
          this.isSaving.set(false);
          this.closeAddModal();
          this.showToast(`⭐ ${formVal.name} updated successfully!`, 'success');
        },
        error: () => {
          this.isSaving.set(false);
          this.showToast('Failed to update saved place.', 'danger');
        },
      });
    } else {
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

  quickSaveLandmark(landmark: NeighborhoodLandmark): void {
    const exists = this.savedService.locations().some((l) => l.name.toLowerCase() === landmark.name.toLowerCase());
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

  getTypeIcon(type: string): string {
    switch (type) {
      case 'school': return 'school-outline';
      case 'work': return 'business-outline';
      case 'market': return 'cart-outline';
      case 'favorite': return 'star';
      case 'home': return 'home-outline';
      default: return 'location';
    }
  }

  getTypeSubtitle(place: SavedLocation): string {
    if (place.address && place.address.trim()) {
      return place.address;
    }
    switch (place.type) {
      case 'school': return 'Campus / High School / College';
      case 'work': return 'Office, shop, or workplace';
      case 'market': return 'Public market & grocery stalls';
      case 'home': return 'Primary residential address';
      default: return 'Custom pinned neighborhood place';
    }
  }

  bookRideTo(item: { name: string; latitude?: number; lat?: number; longitude?: number; lng?: number }): void {
    const lat = item.latitude ?? item.lat ?? 15.42780;
    const lng = item.longitude ?? item.lng ?? 120.92450;
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
