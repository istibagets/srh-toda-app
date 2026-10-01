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
  locate,
  locateOutline,
  layersOutline,
  layers,
  earthOutline,
  earth,
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

  // Map coordinates & satellite mode tracking
  selectedLat = signal<number>(15.42780);
  selectedLng = signal<number>(120.92450);
  isSatelliteMode = signal<boolean>(false);

  readonly MAP_STREET_STYLE: any = 'https://api.maptiler.com/maps/streets-v2/style.json?key=fUp084w51J2w3A1tlAXq';
  readonly MAP_SATELLITE_STYLE: any = {
    version: 8,
    sources: {
      'google-satellite-hybrid': {
        type: 'raster',
        tiles: [
          'https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
          'https://mt1.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
          'https://mt2.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
          'https://mt3.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
        ],
        tileSize: 256,
        maxzoom: 20,
      },
    },
    layers: [
      {
        id: 'google-satellite-layer',
        type: 'raster',
        source: 'google-satellite-hybrid',
        minzoom: 0,
        maxzoom: 24,
      },
    ],
  };

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
      locate,
      locateOutline,
      layersOutline,
      layers,
      earthOutline,
      earth,
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
    }, 150);
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

    const maptilerStyleUrl = 'https://api.maptiler.com/maps/streets-v2/style.json?key=fUp084w51J2w3A1tlAXq';

    try {
      this.miniMap = new maplibregl.Map({
        container: container,
        style: maptilerStyleUrl,
        center: [this.selectedLng(), this.selectedLat()],
        zoom: 16.5,
        maxZoom: 20,
        minZoom: 10,
        attributionControl: false,
        dragPan: true,
        touchZoomRotate: true,
        scrollZoom: true,
      });

      // Pin marker element with robust standalone styling and vivid blue gradient
      const pinEl = document.createElement('div');
      pinEl.className = 'saved-map-marker-pin';
      pinEl.style.width = '36px';
      pinEl.style.height = '50px';
      pinEl.style.cursor = 'grab';
      pinEl.style.display = 'block';
      pinEl.style.position = 'relative';
      pinEl.style.userSelect = 'none';
      pinEl.style.webkitUserSelect = 'none';
      pinEl.style.touchAction = 'none';
      pinEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;position:relative;filter:drop-shadow(0 4px 8px rgba(37,99,235,0.45));">
          <svg viewBox="0 0 24 24" width="36" height="44" style="display:block;">
            <defs>
              <linearGradient id="saved-pin-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#3b82f6"/>
                <stop offset="100%" stop-color="#1d4ed8"/>
              </linearGradient>
            </defs>
            <path d="M12 1.5C7.3 1.5 3.5 5.3 3.5 10c0 5.8 7.5 12.8 8.5 13.5.2.2.5.2.7 0 1-.7 8.5-7.7 8.5-13.5 0-4.7-3.8-8.5-8.5-8.5z" fill="url(#saved-pin-grad)" stroke="#ffffff" stroke-width="1.8"/>
            <circle cx="12" cy="10" r="3.6" fill="#ffffff"/>
          </svg>
          <div style="width:16px;height:4px;background:rgba(15,23,42,0.35);border-radius:50%;margin-top:-3px;"></div>
        </div>
      `;

      this.miniMapMarker = new maplibregl.Marker({
        element: pinEl,
        draggable: true,
        anchor: 'bottom',
        offset: [0, 0],
      })
        .setLngLat([this.selectedLng(), this.selectedLat()])
        .addTo(this.miniMap);

      this.miniMapMarker.on('drag', () => {
        const lngLat = this.miniMapMarker!.getLngLat();
        this.updateSelectedCoords(lngLat.lat, lngLat.lng);
      });

      this.miniMapMarker.on('dragend', () => {
        const lngLat = this.miniMapMarker!.getLngLat();
        this.updateSelectedCoords(lngLat.lat, lngLat.lng);
      });

      this.miniMap.on('click', (e: any) => {
        const { lng, lat } = e.lngLat;
        if (this.miniMapMarker) {
          this.miniMapMarker.setLngLat([lng, lat]);
        }
        this.updateSelectedCoords(lat, lng);
      });

      this.miniMap.on('load', () => {
        this.miniMap?.resize();
      });

      // Prevent parent gestures/pull on the container and canvas
      const stopProp = (e: Event) => {
        e.stopPropagation();
      };
      ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove', 'mousedown', 'mousemove'].forEach((evt) => {
        container.addEventListener(evt, stopProp, { passive: true });
      });
    } catch (err) {
      console.warn('Mini map init notice:', err);
    }
  }

  recenterOnSelected(): void {
    if (this.miniMap) {
      this.miniMap.flyTo({
        center: [this.selectedLng(), this.selectedLat()],
        zoom: 16.5,
        essential: true,
      });
    }
  }

  toggleSatelliteMode(): void {
    const nextState = !this.isSatelliteMode();
    this.isSatelliteMode.set(nextState);
    if (this.miniMap) {
      const style = nextState ? this.MAP_SATELLITE_STYLE : this.MAP_STREET_STYLE;
      this.miniMap.setStyle(style);
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
