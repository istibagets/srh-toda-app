import {
  Component,
  inject,
  signal,
  computed,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  viewChild,
  effect,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { IonContent, IonToast, IonIcon, IonModal, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  shieldCheckmarkOutline,
  warningOutline,
  lockClosedOutline,
  documentAttachOutline,
  sendOutline,
  closeOutline,
  refreshOutline,
  bookmarkOutline,
  location,
  locationOutline,
  navigate,
  navigateOutline,
  pin,
  sparklesOutline,
  cartOutline,
  footballOutline,
  timeOutline,
  personOutline,
  shieldOutline,
  callOutline,
  carOutline,
  star,
  cashOutline,
  peopleOutline,
  radioOutline,
  checkmarkCircleOutline,
  chevronForwardOutline,
  addOutline,
  removeOutline,
  pricetagOutline,
  storefrontOutline,
  businessOutline,
} from 'ionicons/icons';
import { DriverService } from '../../services/driver.service';
import { DriverHeaderComponent } from '../../components/driver-header/driver-header.component';
import { DutyButtonComponent } from '../../components/duty-button/duty-button.component';
import { QueueCardComponent, SheetSnap } from '../../components/queue-card/queue-card.component';
import { PassengerSheetComponent } from '../../components/passenger-sheet/passenger-sheet.component';
import { TerminalRideModalComponent } from '../../components/terminal-ride-modal/terminal-ride-modal.component';
import { TripChatComponent } from '../../components/trip-chat/trip-chat.component';
import { PassengerRatingModalComponent } from '../../components/passenger-rating-modal/passenger-rating-modal.component';

import { AuthService } from '../../services/auth.service';
import { DashboardService } from '../../services/dashboard.service';
import { SoundService } from '../../services/sound.service';
import { PushService } from '../../services/push.service';

declare const maplibregl: any;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    IonContent,
    IonToast,
    IonIcon,
    IonModal,
    IonSpinner,
    DriverHeaderComponent,
    DutyButtonComponent,
    QueueCardComponent,
    PassengerSheetComponent,
    TerminalRideModalComponent,
    TripChatComponent,
    PassengerRatingModalComponent,
  ],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements AfterViewInit, OnDestroy {
  driverService = inject(DriverService);
  authService = inject(AuthService);
  dashboardService = inject(DashboardService);
  soundService = inject(SoundService);
  pushService = inject(PushService);
  route = inject(ActivatedRoute);

  mapContainer = viewChild<ElementRef<HTMLDivElement>>('mapContainer');
  queueCard = viewChild<QueueCardComponent>(QueueCardComponent);
  passengerSheet = viewChild<PassengerSheetComponent>(PassengerSheetComponent);

  map: any = null;
  driverMarker: any = null;
  terminalMarker: any = null;
  terminalGroundDot: any = null;

  currentSnap = signal<SheetSnap>('min');
  showTerminalModal = signal<boolean>(false);

  showToast = signal<boolean>(false);
  toastMessage = signal<string>('');
  toastColor = signal<string | undefined>(undefined);

  // Appeal form state for suspended / rejected screen
  appealText = signal<string>('');
  appealFiles = signal<Array<{ name: string; size: string }>>([]);

  // Terminal Real Coordinates from Laravel backend
  readonly TERMINAL_LNG = 120.92240292427664;
  readonly TERMINAL_LAT = 15.429550175641715;
  readonly TERMINAL_RADIUS_METERS = 35;

  driverLng = signal<number>(120.92240292427664);
  driverLat = signal<number>(15.429550175641715);
  driverHeading = signal<number>(0);
  hasGpsFix = signal<boolean>(false);
  isLocationOverridden = signal<boolean>(false);
  isInsideTerminal = signal<boolean>(false);

  // Unified Map Control State:
  // 2 = 2D Centered Top View (Default)
  // 3 = 3D Tilted Compass Tracking
  mapControlState = signal<number>(2);
  isGpsFetching = signal<boolean>(false);
  isUserPanned = signal<boolean>(false);
  isWaysideModal = signal<boolean>(false);
  private lastDriverTripStatus: string | null = null;
  private cachedPowerEl: HTMLElement | null = null;
  private cachedMapControlsEl: HTMLElement | null = null;
  private cachedHeaderEl: HTMLElement | null = null;

  // ══════════════════════════════════════════════════════════════════════════
  // PASSENGER BOOKING STATE & REGULATED LANDMARKS
  // ══════════════════════════════════════════════════════════════════════════
  readonly popularLandmarks = [
    { name: 'Main Gate Guard House', fare: 20, icon: 'shield-outline', color: 'blue', desc: 'Main Entrance & Central Bay', lat: 15.42955, lng: 120.92240 },
    { name: 'Phase 1 Clubhouse', fare: 25, icon: 'business-outline', color: 'emerald', desc: 'Recreation Center & Pool', lat: 15.42780, lng: 120.92410 },
    { name: 'Phase 2 Community Park', fare: 30, icon: 'football-outline', color: 'amber', desc: 'Playground & Court', lat: 15.43120, lng: 120.92050 },
    { name: 'Commercial Plaza Strip', fare: 20, icon: 'cart-outline', color: 'cyan', desc: 'Groceries, Bakeries & Eateries', lat: 15.42990, lng: 120.92380 },
    { name: 'Santa Rosa Public Market', fare: 35, icon: 'storefront-outline', color: 'purple', desc: 'Town Center Terminal', lat: 15.43550, lng: 120.92640 },
  ];

  private readonly PASSENGER_RIDE_KEY = 'srh_passenger_active_ride';
  showBookingModal = signal<boolean>(false);
  isSubmittingBooking = signal<boolean>(false);
  activePassengerRide = signal<any>(this.getStoredPassengerRide());
  showChatModal = signal<boolean>(false);
  unreadChatCount = signal<number>(0);
  showRatingModal = signal<boolean>(false);
  completedRideForRating = signal<any>(null);
  isPinningMode = signal<boolean>(false);
  destinationPinMarker: any = null;
  pickupPinMarker: any = null;

  private getStoredPassengerRide(): any {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(this.PASSENGER_RIDE_KEY);
        return saved ? JSON.parse(saved) : null;
      }
    } catch { }
    return null;
  }

  chatRideId = computed<number>(() => {
    if (this.authService.isPassenger()) {
      return Number(this.activePassengerRide()?.id || 0);
    }
    const trip = this.driverService.activeTrip();
    return Number(String(trip?.id || '').replace(/\D/g, '')) || 0;
  });

  chatTargetName = computed<string>(() => {
    if (this.authService.isPassenger()) {
      return this.activePassengerRide()?.driver?.name || 'TODA Driver';
    }
    return this.driverService.activeTrip()?.passengerName || 'Passenger';
  });

  chatTargetSub = computed<string>(() => {
    if (this.authService.isPassenger()) {
      const mtop = this.activePassengerRide()?.driver?.mtop_number;
      return mtop ? `MTOP #${mtop}` : 'TODA Tricycle';
    }
    return 'Passenger Commuter';
  });

  chatTargetAvatar = computed<string | null>(() => {
    if (this.authService.isPassenger()) {
      return this.activePassengerRide()?.driver?.avatar_url || null;
    }
    return null;
  });

  bookingPickup = signal<string>('');
  bookingDestination = signal<string>('');
  bookingPax = signal<number>(1);
  bookingFare = signal<number>(20);
  bookingNotes = signal<string>('');
  selectedLandmarkLat = signal<number | null>(null);
  selectedLandmarkLng = signal<number | null>(null);

  openBookingModal(landmark?: any): void {
    if (this.driverService.totalQueueCount() <= 0) {
      this.displayToast('No TODA drivers currently available on queue. Please try again later.');
      return;
    }

    if (landmark) {
      this.selectDestination(landmark);
    } else if (!this.selectedLandmarkLat() && !this.bookingDestination()) {
      this.bookingPickup.set('');
      this.bookingDestination.set('');
      this.bookingFare.set(20);
      if (this.destinationPinMarker) {
        this.destinationPinMarker.remove();
        this.destinationPinMarker = null;
      }
    }
    this.showBookingModal.set(true);
  }

  closeBookingModal(): void {
    this.showBookingModal.set(false);
  }

  selectDestination(lm: any): void {
    this.bookingDestination.set(lm.name);
    this.selectedLandmarkLat.set(lm.lat);
    this.selectedLandmarkLng.set(lm.lng);
    this.calculateFare();
    this.setDestinationPin(lm.lng, lm.lat, true);
  }

  onDestinationInputChange(val: string): void {
    this.bookingDestination.set(val);
    const matched = this.popularLandmarks.find(l => l.name.toLowerCase() === val.trim().toLowerCase());
    if (matched) {
      this.selectedLandmarkLat.set(matched.lat);
      this.selectedLandmarkLng.set(matched.lng);
      this.setDestinationPin(matched.lng, matched.lat, true);
      this.calculateFare();
    } else {
      this.calculateFare();
    }
  }

  startManualPinning(): void {
    this.showBookingModal.set(false);
    this.isPinningMode.set(true);
    this.passengerSheet()?.setSnap('min');
    this.displayToast('📍 Tap anywhere on the map to pin drop-off location');
  }

  cancelManualPinning(): void {
    this.isPinningMode.set(false);
    this.showBookingModal.set(true);
  }



  private currentPickupPinCoords: string | null = null;
  private currentDestPinCoords: string | null = null;

  setPickupPin(lng: number, lat: number, label?: string): void {
    if (!this.map) return;
    if (isNaN(lng) || isNaN(lat) || !lng || !lat) return;

    const coordsKey = `${lng.toFixed(5)},${lat.toFixed(5)}_${label || ''}`;
    if (this.pickupPinMarker && this.currentPickupPinCoords === coordsKey) {
      return; // Pin is already placed at exact location
    }

    try {
      if (this.pickupPinMarker) {
        try {
          this.pickupPinMarker.remove();
        } catch { }
        this.pickupPinMarker = null;
      }
      this.currentPickupPinCoords = coordsKey;

      const pinEl = document.createElement('div');
      pinEl.className = 'srh-pickup-marker-pin';
      pinEl.innerHTML = `
        <div class="pickup-blue-pin">
          <div class="pin-bubble">
            <span class="pickup-dot"></span>
            <span class="pickup-txt">${label || 'Pickup Location'}</span>
          </div>
          <div class="pin-pointer"></div>
        </div>
      `;

      this.pickupPinMarker = new maplibregl.Marker({
        element: pinEl,
        anchor: 'bottom',
        offset: [0, 0],
        pitchAlignment: 'viewport',
        rotationAlignment: 'viewport',
      })
        .setLngLat([lng, lat])
        .addTo(this.map);
    } catch (err) {
      console.warn('Pickup pin notice:', err);
    }
  }

  clearPickupPin(): void {
    this.currentPickupPinCoords = null;
    if (this.pickupPinMarker) {
      try {
        this.pickupPinMarker.remove();
      } catch { }
      this.pickupPinMarker = null;
    }
  }

  setDestinationPin(lng: number, lat: number, autoPan = false): void {
    if (!this.map) return;
    if (isNaN(lng) || isNaN(lat) || !lng || !lat) return;

    const coordsKey = `${lng.toFixed(5)},${lat.toFixed(5)}`;
    if (this.destinationPinMarker && this.currentDestPinCoords === coordsKey) {
      return; // Destination pin is already placed at exact location
    }

    try {
      if (this.destinationPinMarker) {
        try {
          this.destinationPinMarker.remove();
        } catch { }
        this.destinationPinMarker = null;
      }
      this.currentDestPinCoords = coordsKey;

      const pinEl = document.createElement('div');
      pinEl.className = 'srh-destination-marker-pin';
      pinEl.innerHTML = `
        <div class="dest-green-pin">
          <svg viewBox="0 0 24 24" width="30" height="38" class="dest-pin-svg">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" fill="#059669"/>
          </svg>
        </div>
      `;

      this.destinationPinMarker = new maplibregl.Marker({
        element: pinEl,
        anchor: 'bottom',
        offset: [0, 0],
        pitchAlignment: 'viewport',
        rotationAlignment: 'viewport',
      })
        .setLngLat([lng, lat])
        .addTo(this.map);

      if (autoPan && !this.isUserPanned()) {
        this.map.flyTo({
          center: [lng, lat],
          zoom: 17.2,
          duration: 650,
          essential: true,
        });
      }
    } catch (err) {
      console.warn('Destination pin notice:', err);
    }
  }

  clearDestinationPin(): void {
    this.currentDestPinCoords = null;
    if (this.destinationPinMarker) {
      try {
        this.destinationPinMarker.remove();
      } catch { }
      this.destinationPinMarker = null;
    }
  }

  incrementPax(): void {
    if (this.bookingPax() < 4) {
      this.bookingPax.update(p => p + 1);
      this.calculateFare();
    }
  }

  decrementPax(): void {
    if (this.bookingPax() > 1) {
      this.bookingPax.update(p => p - 1);
      this.calculateFare();
    }
  }

  calculateFare(): void {
    const dest = this.bookingDestination();
    const matched = this.popularLandmarks.find(l => l.name === dest);
    const base = matched ? matched.fare : 25;
    const extraPax = Math.max(0, this.bookingPax() - 2);
    this.bookingFare.set(base + extraPax * 5);
  }

  calculateCustomFare(lat: number, lng: number): void {
    let closestFare = 25;
    let minDist = 999999;
    for (const lm of this.popularLandmarks) {
      const dist = this.calculateDistanceMeters(lat, lng, lm.lat, lm.lng);
      if (dist < minDist) {
        minDist = dist;
        closestFare = lm.fare;
      }
    }
    const extraPax = Math.max(0, this.bookingPax() - 2);
    this.bookingFare.set(closestFare + extraPax * 5);
  }

  submitPassengerBooking(): void {
    if (this.driverService.totalQueueCount() <= 0) {
      this.displayToast('No TODA drivers currently available on queue. Please try again later.');
      this.showBookingModal.set(false);
      return;
    }

    const pickup = this.bookingPickup()?.trim();
    const destination = this.bookingDestination()?.trim();

    if (!pickup) {
      this.displayToast('Please enter your pickup location (Block & Lot).');
      return;
    }

    if (!destination) {
      this.displayToast('Please enter or pin your drop-off destination.');
      return;
    }

    this.isSubmittingBooking.set(true);

    this.dashboardService.requestPassengerRide({
      pickup_location: pickup,
      destination: destination,
      fare: this.bookingFare(),
      passenger_count: this.bookingPax(),
      notes: this.bookingNotes(),
      pickup_lat: this.driverLat(),
      pickup_lng: this.driverLng(),
      destination_lat: this.selectedLandmarkLat() ?? undefined,
      destination_lng: this.selectedLandmarkLng() ?? undefined,
    }).subscribe({
      next: (res) => {
        this.isSubmittingBooking.set(false);
        this.showBookingModal.set(false);
        if (res?.ride) {
          this.activePassengerRide.set(res.ride);
          this.displayToast('🚖 Tricycle requested! Dispatching nearest driver.');
        }
      },
      error: (err) => {
        this.isSubmittingBooking.set(false);
        this.displayToast(err?.error?.message || 'Unable to request tricycle. Please try again.');
      }
    });
  }

  cancelPassengerRide(): void {
    const ride = this.activePassengerRide();
    if (!ride?.id) return;

    this.driverService.broadcastRideCancelled(ride.id, ride.passenger_id, ride.driver_id || ride.driver?.id);
    this.dashboardService.cancelActiveRide(ride.id).subscribe({
      next: () => {
        this.activePassengerRide.set(null);
        if (this.destinationPinMarker) {
          this.destinationPinMarker.remove();
          this.destinationPinMarker = null;
        }
        this.displayToast('❌ Ride request cancelled.');
      },
      error: () => {
        this.activePassengerRide.set(null);
      }
    });
  }

  acceptPassengerFare(): void {
    const ride = this.activePassengerRide();
    if (!ride?.id) return;

    this.dashboardService.acceptFare(ride.id).subscribe({
      next: (res) => {
        if (res?.ride) {
          this.activePassengerRide.set(res.ride);
        } else {
          this.activePassengerRide.update((r) => r ? { ...r, status: 'en_route' } : null);
        }
        this.displayToast('🎉 Proposed fare accepted! Tricycle is en route.');
        this.refreshDashboard();
      },
      error: (err) => {
        this.displayToast(err?.error?.message || 'Unable to accept proposed fare.');
      },
    });
  }

  openTripChat(): void {
    this.unreadChatCount.set(0);
    this.showChatModal.set(true);
  }

  closeTripChat(): void {
    this.showChatModal.set(false);
  }

  onNewChatMessage(msg: any): void {
    if (!this.showChatModal()) {
      this.unreadChatCount.update((c) => c + 1);
      const sender = msg.sender_name || (this.authService.isPassenger() ? 'Driver' : 'Passenger');
      this.displayToast(`💬 ${sender}: "${msg.message}"`);
      try {
        this.soundService.playBookingAlert();
      } catch {}
    }
  }

  onRatingSubmitted(): void {
    this.showRatingModal.set(false);
    this.completedRideForRating.set(null);
    this.displayToast('⭐ Thank you for your feedback! Ride completed.');
    this.refreshDashboard();
  }

  // ==========================================
  // MAP 3D HIGHWAY ROUTE LINE ENGINE (GeoJSON Layers)
  // ==========================================
  private applyRouteLineCoordinates(coordinates: [number, number][], color = '#2563eb'): void {
    if (!this.map) return;
    try {
      if (!Array.isArray(coordinates) || coordinates.length < 2) return;
      if (coordinates.some(([lng, lat]) => isNaN(lng) || isNaN(lat) || !lng || !lat)) return;

      const isEmerald = color === '#059669';
      const glowColor = isEmerald ? '#059669' : '#1d4ed8';
      const casingColor = isEmerald ? '#34d399' : '#60a5fa';
      const lineColor = isEmerald ? '#059669' : '#2563eb';
      const coreColor = isEmerald ? '#a7f3d0' : '#93c5fd';

      if (this.map.getLayer('terminal-return-route-glow')) {
        this.map.setPaintProperty('terminal-return-route-glow', 'line-color', glowColor);
      }
      if (this.map.getLayer('terminal-return-route-casing')) {
        this.map.setPaintProperty('terminal-return-route-casing', 'line-color', casingColor);
      }
      if (this.map.getLayer('terminal-return-route-line')) {
        this.map.setPaintProperty('terminal-return-route-line', 'line-color', lineColor);
      }
      if (this.map.getLayer('terminal-return-route-core')) {
        this.map.setPaintProperty('terminal-return-route-core', 'line-color', coreColor);
      }

      const source: any = this.map.getSource('terminal-return-route-source');
      if (source) {
        source.setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coordinates,
          },
          properties: {},
        });
      }
    } catch (e) {
      console.warn('Map route line notice:', e);
    }
  }

  private routeBetweenAbortController: AbortController | null = null;
  private roadRouteCache = new Map<string, [number, number][]>();

  async drawRoadRouteLine(
    fromLng: number,
    fromLat: number,
    toLng: number,
    toLat: number,
    color = '#2563eb',
    lockCamera = true
  ): Promise<void> {
    if (!this.map) return;
    if (isNaN(fromLng) || isNaN(fromLat) || isNaN(toLng) || isNaN(toLat) || !fromLng || !fromLat || !toLng || !toLat) return;

    // Fetch the actual road trace without flashing straight lines
    const detailedCoords = await this.fetchRoadRouteBetweenPoints(fromLng, fromLat, toLng, toLat);
    if (!detailedCoords || detailedCoords.length < 2 || !this.map) return;

    // Apply the real road curve geometry directly
    this.applyRouteLineCoordinates(detailedCoords, color);

    // 3D Locked Road View centered along pathway with smooth 900ms cubic easing (matching Returning to Terminal)
    if (lockCamera && !this.isUserPanned() && detailedCoords.length >= 2) {
      const [roadLng, roadLat] = detailedCoords[0];
      const [nextLng, nextLat] = detailedCoords[1];
      const roadBearing = Math.round(this.calculateBearing(roadLat, roadLng, nextLat, nextLng));
      if (!isNaN(roadBearing)) {
        this.driverHeading.set(roadBearing);
        this.updateDriverHeadingCone(roadBearing);
        this.updateDriverLocationWebGL(roadLng, roadLat, roadBearing);
        this.map.easeTo({
          center: [roadLng, roadLat],
          bearing: roadBearing,
          pitch: 60,
          zoom: 16.5,
          duration: 900,
          easing: (t: number) => 1 - Math.pow(1 - t, 3),
          essential: true,
        });
      }
    }
  }

  private async fetchRoadRouteBetweenPoints(
    fromLng: number,
    fromLat: number,
    toLng: number,
    toLat: number
  ): Promise<[number, number][]> {
    if (this.calculateDistanceMeters(fromLat, fromLng, toLat, toLng) <= 10) {
      return [[fromLng, fromLat], [toLng, toLat]];
    }

    const cacheKey = `${fromLng.toFixed(5)},${fromLat.toFixed(5)}_${toLng.toFixed(5)},${toLat.toFixed(5)}`;
    if (this.roadRouteCache.has(cacheKey)) {
      return this.roadRouteCache.get(cacheKey)!;
    }

    try {
      if (this.routeBetweenAbortController) {
        this.routeBetweenAbortController.abort();
      }
      this.routeBetweenAbortController = new AbortController();

      const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=false`;
      const response = await fetch(url, { signal: this.routeBetweenAbortController.signal });
      if (response.ok) {
        const data = await response.json();
        if (data && data.routes && data.routes.length > 0 && data.routes[0].geometry?.coordinates?.length > 1) {
          const coords = data.routes[0].geometry.coordinates as [number, number][];
          if (this.roadRouteCache.size > 150) this.roadRouteCache.clear();
          this.roadRouteCache.set(cacheKey, coords);
          return coords;
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.warn('OSRM route fetch notice:', e);
      }
    }

    return this.buildFallbackRoadRoute(fromLng, fromLat, toLng, toLat);
  }

  clearRouteLine(): void {
    this.clearReturnRoutePolyline();
    this.clearPickupPin();
    this.clearDestinationPin();
  }

  checkPassengerActiveRide(): void {
    this.dashboardService.getActiveRide().subscribe({
      next: (res) => {
        const ride = res?.active_ride || res?.ride;
        if (ride) {
          this.activePassengerRide.set(ride);
          if (ride.driver_lat && ride.driver_lng) {
            this.driverLat.set(Number(ride.driver_lat));
            this.driverLng.set(Number(ride.driver_lng));
            if (ride.driver_heading !== undefined && ride.driver_heading !== null) {
              this.driverHeading.set(Number(ride.driver_heading));
            }
            this.updateDriverLocationWebGL(Number(ride.driver_lng), Number(ride.driver_lat), Number(ride.driver_heading || 0));
          }
        } else {
          this.activePassengerRide.set(null);
        }
      },
      error: () => {}
    });
  }

  togglePassengerSheet(): void {
    this.passengerSheet()?.toggleSnap();
  }

  // Santa Rosa Roadway Network for Centerline Locking
  private readonly ROAD_NETWORKS: [number, number][][] = [
    // Santa Rosa - Tarlac Road (West to East Arterial passing Terminal)
    [
      [120.9100, 15.42940],
      [120.9160, 15.42945],
      [120.9200, 15.42950],
      [120.92240292427664, 15.429550175641715],
      [120.9260, 15.42960],
      [120.9320, 15.42970],
      [120.9380, 15.42980],
    ],
    // Maharlika Highway (North-South National Highway)
    [
      [120.9224, 15.4230],
      [120.9224, 15.4270],
      [120.92240292427664, 15.429550175641715],
      [120.9224, 15.4330],
      [120.9225, 15.4370],
    ],
    // Cojuangco St (South Parallel connector)
    [
      [120.9180, 15.4265],
      [120.9224, 15.4265],
      [120.9260, 15.4265],
    ],
    // Bonifacio / Market Road (North Parallel connector)
    [
      [120.9180, 15.4325],
      [120.9224, 15.4325],
      [120.9260, 15.4325],
    ],
  ];

  // Cached DOM elements for zero-lag 120fps gesture updates
  private floatingPowerEl: HTMLElement | null = null;
  private floatingMapControlsEl: HTMLElement | null = null;
  private driverHeaderEl: HTMLElement | null = null;

  private boundDeviceOrientation = (e: DeviceOrientationEvent) => this.handleDeviceOrientation(e);
  private compassLastBearing = 0;
  private compassListenerType: string | null = null;
  private compassRafId: number | null = null;
  private lastCompassUpdateTime = 0;

  constructor() {
    addIcons({
      shieldCheckmarkOutline,
      warningOutline,
      lockClosedOutline,
      documentAttachOutline,
      sendOutline,
      closeOutline,
      refreshOutline,
      bookmarkOutline,
      location,
      locationOutline,
      navigate,
      navigateOutline,
      pin,
      sparklesOutline,
      cartOutline,
      footballOutline,
      timeOutline,
      personOutline,
      shieldOutline,
      callOutline,
      carOutline,
      star,
      cashOutline,
      peopleOutline,
      radioOutline,
      checkmarkCircleOutline,
      chevronForwardOutline,
      addOutline,
      removeOutline,
      pricetagOutline,
      storefrontOutline,
      businessOutline,
    });

    // Auto-persist active passenger ride to localStorage for 0ms instant reload restoration
    effect(() => {
      const ride = this.activePassengerRide();
      if (typeof window !== 'undefined') {
        try {
          if (ride) {
            localStorage.setItem(this.PASSENGER_RIDE_KEY, JSON.stringify(ride));
          } else {
            localStorage.removeItem(this.PASSENGER_RIDE_KEY);
          }
        } catch { }
      }
    });

    // Real-time inter-tab & cross-device event driven sync listener
    effect(() => {
      const _ = this.driverService.syncTrigger();
      untracked(() => {
        this.refreshDashboard();
      });
    });

    // Toast notification when a ride is cancelled on either driver or passenger
    effect(() => {
      const notice = this.driverService.rideCancelledNotice();
      if (notice && notice.message) {
        untracked(() => {
          this.displayToast(notice.message);
          this.clearRouteLine();
          if (this.authService.isPassenger()) {
            this.activePassengerRide.set(null);
            if (this.destinationPinMarker) {
              this.destinationPinMarker.remove();
              this.destinationPinMarker = null;
            }
          }
        });
      }
    });

    // Reactive Road-Tracing Route Line Sync for Passenger & Driver (Locked 3D Navigation)
    effect(() => {
      const isPassenger = this.authService.isPassenger();
      const pRide = this.activePassengerRide();
      const dTrip = this.driverService.activeTrip();
      const dLat = this.driverLat();
      const dLng = this.driverLng();

      untracked(() => {
        if (isPassenger && pRide) {
          const status = String(pRide.status || '').toLowerCase().trim();
          if (status === 'en_route' || status === 'accepted') {
            const pLat = Number(pRide.pickup_lat);
            const pLng = Number(pRide.pickup_lng);
            const drvLat = Number(pRide.driver_lat || dLat);
            const drvLng = Number(pRide.driver_lng || dLng);
            if (pLat && pLng && drvLat && drvLng) {
              this.clearDestinationPin();
              this.setPickupPin(pLng, pLat, pRide.pickup_location);
              this.drawRoadRouteLine(drvLng, drvLat, pLng, pLat, '#2563eb', true);
            }
          } else if (status === 'arrived') {
            this.clearDestinationPin();
            const pLat = Number(pRide.pickup_lat);
            const pLng = Number(pRide.pickup_lng);
            if (pLat && pLng) {
              this.setPickupPin(pLng, pLat, pRide.pickup_location);
            }
          } else if (status === 'in_transit') {
            this.clearPickupPin();
            const drvLat = Number(pRide.driver_lat || dLat);
            const drvLng = Number(pRide.driver_lng || dLng);
            const dLat2 = Number(pRide.destination_lat || pRide.dest_lat);
            const dLng2 = Number(pRide.destination_lng || pRide.dest_lng);
            if (drvLat && drvLng && dLat2 && dLng2) {
              this.setDestinationPin(dLng2, dLat2);
              this.drawRoadRouteLine(drvLng, drvLat, dLng2, dLat2, '#059669', true);
            }
          } else {
            this.clearRouteLine();
          }
        } else if (!isPassenger && dTrip) {
          const status = String(dTrip.status || '').toLowerCase().trim();
          if (status && this.lastDriverTripStatus !== status) {
            if (status === 'bargaining' || status === 'fare_proposed') {
              this.soundService.playBookingAlert();
            } else if (status === 'arrived') {
              this.soundService.playArrived();
            } else if (status === 'in_transit') {
              this.soundService.playNotificationChime();
            }
            this.lastDriverTripStatus = status;
          }
          if (status === 'en_route') {
            const pLat = Number(dTrip.pickupLat);
            const pLng = Number(dTrip.pickupLng);
            if (pLat && pLng && dLat && dLng) {
              this.clearDestinationPin();
              this.setPickupPin(pLng, pLat, dTrip.pickupLocation);
              this.drawRoadRouteLine(dLng, dLat, pLng, pLat, '#2563eb', true);
            }
          } else if (status === 'arrived') {
            this.clearDestinationPin();
            const pLat = Number(dTrip.pickupLat);
            const pLng = Number(dTrip.pickupLng);
            if (pLat && pLng) {
              this.setPickupPin(pLng, pLat, dTrip.pickupLocation);
            }
          } else if (status === 'in_transit') {
            const isWalkInOrWayside = dTrip.tripType === 'terminal_walk_in' || dTrip.tripType === 'wayside_pickup' || !dTrip.dropoffLat;
            if (isWalkInOrWayside) {
              this.clearRouteLine();
            } else {
              this.clearPickupPin();
              const dLat2 = Number(dTrip.dropoffLat);
              const dLng2 = Number(dTrip.dropoffLng);
              if (dLat && dLng && dLat2 && dLng2) {
                this.setDestinationPin(dLng2, dLat2);
                this.drawRoadRouteLine(dLng, dLat, dLng2, dLat2, '#059669', true);
              }
            }
          } else {
            this.clearRouteLine();
          }
        } else {
          this.clearDestinationPin();
          this.clearPickupPin();
          if (!this.driverService.isReturning()) {
            this.clearReturnRoutePolyline();
          }
        }
      });
    });

    // Real-time location broadcast listener across multi-devices (updates passenger map live ONLY when on an active trip with the driver)
    effect(() => {
      const loc = this.driverService.locationBroadcast();
      if (loc) {
        untracked(() => {
          const currentUserId = this.authService.currentUser()?.id;
          if (loc.driverId === currentUserId) {
            return;
          }

          const isPassenger = this.authService.isPassenger();
          if (isPassenger) {
            const pRide = this.activePassengerRide();
            // ONLY sync driver location if passenger has an active ongoing trip with THIS driver
            if (pRide && (pRide.status === 'en_route' || pRide.status === 'accepted' || pRide.status === 'arrived' || pRide.status === 'in_transit')) {
              const driverId = pRide.driver?.id || pRide.driver_id;
              if (loc.driverId && driverId && Number(loc.driverId) !== Number(driverId)) {
                return;
              }
              if (loc.rideId && pRide.id && Number(loc.rideId) !== Number(pRide.id)) {
                return;
              }

              this.driverLat.set(loc.lat);
              this.driverLng.set(loc.lng);
              if (loc.heading !== undefined) {
                this.driverHeading.set(loc.heading);
              }
              this.updateDriverLocationWebGL(loc.lng, loc.lat, loc.heading || 0);

              this.activePassengerRide.update((r) =>
                r ? { ...r, driver_lat: loc.lat, driver_lng: loc.lng } : null
              );
            }
          }
        });
      }
    });

    // Automatically sync floating action buttons position whenever trip, returning, or duty states change
    effect(() => {
      const isRet = this.driverService.isReturning();
      const hasTrip = !!this.driverService.activeTrip();
      const isOnline = this.driverService.driver().isOnline;
      const ride = this.activePassengerRide();
      untracked(() => {
        setTimeout(() => {
          const card = this.queueCard();
          if (card) {
            this.onSheetDragSync(card.activeTranslateY || card.MID_TRANSLATE_Y);
          } else {
            const pSheet = this.passengerSheet();
            if (pSheet) {
              this.onSheetDragSync(pSheet.activeTranslateY || (ride ? pSheet.MID_TRANSLATE_Y : pSheet.MAX_TRANSLATE_Y));
            }
          }
        }, 50);
      });
    });

    // Check if routed from Saved Places or external link with destination query param
    this.route.queryParams.subscribe(params => {
      if (params && params['destination']) {
        const dest = params['destination'];
        const lat = params['destLat'] ? parseFloat(params['destLat']) : 15.42955;
        const lng = params['destLng'] ? parseFloat(params['destLng']) : 120.92240;
        this.bookingDestination.set(dest);
        this.selectedLandmarkLat.set(lat);
        this.selectedLandmarkLng.set(lng);
        this.calculateFare();
        setTimeout(() => {
          this.setDestinationPin(lng, lat);
          if (params['book'] === 'true') {
            this.showBookingModal.set(true);
          }
        }, 400);
      }
    });
  }

  private boundWindowResize = () => {
    if (this.map) {
      try {
        this.map.resize();
        const pad = this.getVisibleMapPadding();
        if (!this.isUserPanned()) {
          this.map.jumpTo({
            center: [this.driverLng(), this.driverLat()],
            padding: pad,
          });
        }
      } catch { }
    }
  };

  ngAfterViewInit(): void {
    window.addEventListener('resize', this.boundWindowResize);
    setTimeout(() => {
      this.initMapTilerMap();
      this.initCompassTracking();

      // If active trip or returning state was persisted on reload, restore 3D view and docked sheet
      if (this.driverService.activeTrip()) {
        this.mapControlState.set(3);
        setTimeout(() => {
          this.queueCard()?.setSnap('mid');
        }, 300);
      } else if (this.driverService.isReturning()) {
        this.mapControlState.set(3);
        this.updateReturnRoutePolyline(this.driverLng(), this.driverLat());
        setTimeout(() => {
          this.queueCard()?.setSnap('mid');
        }, 300);
      }
    }, 100);

    // Initial full dashboard fetch on startup
    this.refreshDashboard();
    if (this.authService.isPassenger()) {
      this.checkPassengerActiveRide();
    }

    // Initial high-accuracy GPS position fetch on startup
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.hasGpsFix.set(true);
          this.handleGpsUpdate(pos);
        },
        (err) => {
          console.warn('Initial GPS query failed:', err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.boundWindowResize);
    this.stopCompassTracking();
    if (this.map) {
      try {
        this.map.remove();
      } catch { }
      this.map = null;
    }
  }



  refreshDashboard(): void {
    if (!this.authService.token()) return;
    if (this.driverService.hasUnsavedQueueOrder() || this.queueCard()?.hasPendingChanges()) {
      return;
    }
    this.dashboardService.getDashboardData().subscribe({
      next: (data) => {
        this.driverService.syncFromDashboard(data);

        if (this.authService.isPassenger()) {
          const prev = this.activePassengerRide();
          if (data?.passenger?.active_ride) {
            const ar = data.passenger.active_ride;
            const prevStatus = prev?.status;
            const newStatus = ar.status;
            this.activePassengerRide.set(ar);

            if (ar.driver_lat && ar.driver_lng) {
              const dLat = Number(ar.driver_lat);
              const dLng = Number(ar.driver_lng);
              const dHeading = Number(ar.driver_heading || 0);
              this.driverLat.set(dLat);
              this.driverLng.set(dLng);
              this.driverHeading.set(dHeading);
              this.updateDriverLocationWebGL(dLng, dLat, dHeading);
            }

            if (prevStatus && prevStatus !== newStatus) {
              if (newStatus === 'fare_proposed') {
                this.soundService.playBookingAlert();
                this.displayToast(`💰 Driver proposed a fare of ₱${Number(data.passenger.active_ride.fare || 0).toFixed(2)}`);
              } else if (newStatus === 'en_route' || newStatus === 'accepted') {
                this.soundService.playNotificationChime();
                this.displayToast('🚖 Driver is on the way to pick you up!');
              } else if (newStatus === 'arrived') {
                this.soundService.playArrived();
                this.displayToast('📍 Your driver has arrived at the pickup location!');
              } else if (newStatus === 'in_transit') {
                this.soundService.playNotificationChime();
                this.displayToast('🚀 Trip started! On the way to your destination.');
              } else if (newStatus === 'completed') {
                this.soundService.playDropoffSuccess();
                this.displayToast('🏁 You have arrived at your destination!');
                this.completedRideForRating.set(data.passenger.active_ride);
                this.showRatingModal.set(true);
                this.showChatModal.set(false);
                this.clearRouteLine();
              } else if (newStatus === 'cancelled') {
                this.soundService.playOffDuty();
                this.displayToast('❌ Ride request was cancelled.');
                this.activePassengerRide.set(null);
                this.clearRouteLine();
              }
            }
          } else if (prev && prev.status !== 'cancelled' && prev.status !== 'completed') {
            if (prev.status === 'in_transit' || prev.status === 'arrived') {
              this.displayToast('🏁 You have arrived at your destination!');
              this.completedRideForRating.set(prev);
              this.showRatingModal.set(true);
              this.showChatModal.set(false);
            } else {
              this.displayToast('❌ Ride request was cancelled.');
            }
            this.activePassengerRide.set(null);
            this.clearRouteLine();
          }
        }
      },
      error: (err) => {
        if (err?.status === 401) {
          console.warn('Authentication expired or invalidated. Redirecting to login.');
          this.authService.logout();
        } else {
          console.warn('Dashboard sync transient notice:', err?.status);
        }
      },
    });
  }

  // Render pump management: Keep WebGL canvas hot and running at 120fps during touch gestures and modal/snap animations
  private mapRenderPumpTimeout: any = null;

  wakeMapRenderLoop(durationMs = 600): void {
    if (!this.map) return;
    if (this.mapRenderPumpTimeout) {
      clearTimeout(this.mapRenderPumpTimeout);
      this.mapRenderPumpTimeout = null;
    }
    this.map.repaint = true;
    try {
      this.map.triggerRepaint();
    } catch { }

    this.mapRenderPumpTimeout = setTimeout(() => {
      if (this.map) {
        this.map.repaint = false;
      }
      this.mapRenderPumpTimeout = null;
    }, durationMs);
  }

  onSnapChange(snap: SheetSnap): void {
    this.currentSnap.set(snap);
    this.wakeMapRenderLoop(450);
    if (snap === 'max') return;

    if (this.map && !this.isUserPanned()) {
      try {
        this.map.easeTo({
          center: [this.driverLng(), this.driverLat()],
          padding: this.getVisibleMapPadding(),
          duration: 380,
          essential: true,
          easing: (t: number) => 1 - Math.pow(1 - t, 3),
        });
      } catch { }
    }
  }

  onSheetDragStart(): void {
    // Lightweight drag start - DOM elements glide with 0ms lag
  }

  onSheetDragEnd(): void {
    if (this.currentSnap() === 'max') return;

    if (this.map && !this.isUserPanned()) {
      try {
        this.map.easeTo({
          center: [this.driverLng(), this.driverLat()],
          padding: this.getVisibleMapPadding(),
          duration: 380,
          essential: true,
          easing: (t: number) => 1 - Math.pow(1 - t, 3),
        });
      } catch { }
    }
  }

  // Strict 1:1 real-time on-sync calculation for floating buttons, Stage 1 tuck/hide, Stage 2 header zoom/fade & map parallax
  onSheetDragSync(currentTranslateY: number): void {
    const sheetTopFromBottom = window.innerHeight - 56 - currentTranslateY;
    const normalPos = Math.round(sheetTopFromBottom + 72);

    // Stage 1 Trigger: Starts across center pin (~52% from top / 48% sheet height)
    const buttonHideStart = Math.round(window.innerHeight * 0.52);
    const buttonHideRange = 100;
    const buttonHideEnd = buttonHideStart + buttonHideRange;

    let btnTransform = '';
    let btnOpacity = 1;

    // --- 1. FLOATING BUTTONS (Life360 Downward Tuck & Fade - Natural Full Scale) ---
    if (sheetTopFromBottom <= buttonHideStart) {
      // Below trigger line: Buttons locked 1:1 with sheet top edge
      btnTransform = `translate3d(0, -${normalPos}px, 0)`;
      btnOpacity = 1;
    } else {
      // Past trigger: Buttons smoothly tuck downward behind the rising sheet edge while fading out (NO scaling)
      const btnProgress = Math.min(1, Math.max(0, (sheetTopFromBottom - buttonHideStart) / buttonHideRange));
      const tuckDown = Math.round(btnProgress * (sheetTopFromBottom - buttonHideStart + 45));
      const buttonY = Math.round(normalPos - tuckDown);
      btnOpacity = Math.max(0, parseFloat((1 - btnProgress * 1.25).toFixed(3)));
      btnTransform = `translate3d(0, -${buttonY}px, 0)`;
    }

    let headerTransform = 'translate3d(0, 0, 0) scale(1)';
    let headerOpacity = 1;

    // --- 2. TOP HEADER COMPONENTS (Stage 2 Zoom-In & Fade-Away Animation) ---
    if (sheetTopFromBottom > buttonHideEnd) {
      const headerRange = Math.max(70, window.innerHeight - 56 - 60 - buttonHideEnd);
      const headerProgress = Math.min(1, Math.max(0, (sheetTopFromBottom - buttonHideEnd) / headerRange));
      const headerScale = (1 + headerProgress * 0.16).toFixed(3);
      const headerY = Math.round(-headerProgress * 24);
      headerOpacity = Math.max(0, parseFloat((1 - headerProgress * 1.2).toFixed(3)));
      headerTransform = `translate3d(0, ${headerY}px, 0) scale(${headerScale})`;
    }

    // Direct DOM Writes for Instantaneous Zero-Lag 120fps Rendering
    if (!this.cachedPowerEl) this.cachedPowerEl = document.getElementById('floating-power-container');
    if (!this.cachedMapControlsEl) this.cachedMapControlsEl = document.getElementById('floating-map-controls-container');
    if (!this.cachedHeaderEl) this.cachedHeaderEl = document.getElementById('driver-header-motion-wrapper');

    const powerEl = this.cachedPowerEl;
    const mapControlsEl = this.cachedMapControlsEl;
    const headerEl = this.cachedHeaderEl;

    if (powerEl) {
      powerEl.style.transform = btnTransform;
      powerEl.style.opacity = `${btnOpacity}`;
      powerEl.style.pointerEvents = btnOpacity > 0.2 ? 'auto' : 'none';
      powerEl.style.visibility = btnOpacity <= 0 ? 'hidden' : 'visible';
    }

    if (mapControlsEl) {
      mapControlsEl.style.transform = btnTransform;
      mapControlsEl.style.opacity = `${btnOpacity}`;
      mapControlsEl.style.pointerEvents = btnOpacity > 0.2 ? 'auto' : 'none';
      mapControlsEl.style.visibility = btnOpacity <= 0 ? 'hidden' : 'visible';
    }

    if (headerEl) {
      headerEl.style.transform = headerTransform;
      headerEl.style.opacity = `${headerOpacity}`;
      headerEl.style.visibility = headerOpacity <= 0 ? 'hidden' : 'visible';
    }
  }

  getVisibleMapPadding(): { top: number; bottom: number; left: number; right: number } {
    const snap = this.currentSnap();
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    const card = this.queueCard();
    const pSheet = this.passengerSheet();
    let currentY = card?.activeTranslateY || card?.MID_TRANSLATE_Y || pSheet?.activeTranslateY || pSheet?.MID_TRANSLATE_Y || Math.round(h * 0.48);

    if (snap === 'min') {
      currentY = card ? card.MAX_TRANSLATE_Y : (pSheet ? pSheet.MAX_TRANSLATE_Y : Math.round(h * 0.88));
    } else if (snap === 'max') {
      currentY = card ? card.MID_TRANSLATE_Y : (pSheet ? pSheet.MIN_TRANSLATE_Y : Math.round(h * 0.5));
    } else if (snap === 'mid') {
      currentY = card ? card.MID_TRANSLATE_Y : (pSheet ? pSheet.MID_TRANSLATE_Y : Math.round(h * 0.65));
    }

    const bottomCovered = Math.max(75, Math.min(Math.round(h * 0.55), Math.round(h - currentY)));

    return {
      top: 55,
      bottom: bottomCovered,
      left: 0,
      right: 0,
    };
  }

  // --- 1. MAP INITIALIZATION ---
  private initMapTilerMap(): void {
    const container = document.getElementById('grab-home-map') || this.mapContainer()?.nativeElement;
    if (!container) {
      setTimeout(() => this.initMapTilerMap(), 150);
      return;
    }

    if (typeof maplibregl === 'undefined') {
      setTimeout(() => this.initMapTilerMap(), 200);
      return;
    }

    const maptilerStyleUrl =
      'https://api.maptiler.com/maps/streets-v2/style.json?key=fUp084w51J2w3A1tlAXq';

    try {
      const is3D = this.mapControlState() === 3;
      const initialCenter: [number, number] = [this.driverLng(), this.driverLat()];

      const mapInstance = new maplibregl.Map({
        container: container,
        style: maptilerStyleUrl,
        center: initialCenter,
        zoom: is3D ? 17.2 : 16.6,
        pitch: is3D ? 60 : 0,
        bearing: is3D ? this.driverHeading() : 0,
        attributionControl: false,
      });

      this.map = mapInstance;

      // Disable double click zoom as requested
      mapInstance.doubleClickZoom.disable();

      // On map click/tap GPS override or Drop-Off Destination Pinning
      mapInstance.on('click', async (e: any) => {
        const lng = e.lngLat.lng;
        const lat = e.lngLat.lat;

        // Manual drop-off pin mode for passenger
        if (this.isPinningMode()) {
          this.selectedLandmarkLat.set(lat);
          this.selectedLandmarkLng.set(lng);
          this.setDestinationPin(lng, lat);
          this.isPinningMode.set(false);
          this.bookingDestination.set('');
          this.calculateCustomFare(lat, lng);
          setTimeout(() => {
            this.showBookingModal.set(true);
          }, 200);
          return;
        }

        this.isLocationOverridden.set(true);
        this.isUserPanned.set(false);

        // 1. When returning: snap marker to road route line and orient along road segment
        if (this.driverService.isReturning()) {
          await this.applyRoadRouteAndSnap(lng, lat);
          return;
        }

        // 2. When in active trip (en_route or in_transit):
        const dTrip = this.driverService.activeTrip();
        if (dTrip && (dTrip.status === 'en_route' || dTrip.status === 'in_transit')) {
          const isWalkInOrWayside = dTrip.tripType === 'terminal_walk_in' || dTrip.tripType === 'wayside_pickup' || !dTrip.dropoffLat;

          if (isWalkInOrWayside) {
            let newHeading = this.driverHeading();
            if (this.driverLat() && this.driverLng()) {
              newHeading = Math.round(this.calculateBearing(this.driverLat(), this.driverLng(), lat, lng));
            }
            this.hasGpsFix.set(true);
            this.driverLat.set(lat);
            this.driverLng.set(lng);
            this.driverHeading.set(newHeading);
            this.updateDriverLocationWebGL(lng, lat, newHeading);
            this.clearRouteLine();

            if (this.map && !this.isUserPanned()) {
              this.map.easeTo({
                center: [lng, lat],
                pitch: 60,
                bearing: newHeading,
                zoom: 16.5,
                duration: 650,
                easing: (t: number) => 1 - Math.pow(1 - t, 3),
                essential: true,
              });
            }

            this.driverService.updateDriverLocation({
              lat: lat,
              lng: lng,
              heading: newHeading,
              ride_id: Number(dTrip.id),
            });
            return;
          }

          const targetLng = dTrip.status === 'en_route' ? Number(dTrip.pickupLng || 120.92240) : Number(dTrip.dropoffLng || 120.92240);
          const targetLat = dTrip.status === 'en_route' ? Number(dTrip.pickupLat || 15.42955) : Number(dTrip.dropoffLat || 15.42955);
          const color = dTrip.status === 'en_route' ? '#2563eb' : '#059669';

          const coordinates = await this.fetchRoadRouteBetweenPoints(lng, lat, targetLng, targetLat);
          const roadLng = coordinates && coordinates.length > 0 ? coordinates[0][0] : lng;
          const roadLat = coordinates && coordinates.length > 0 ? coordinates[0][1] : lat;
          const nextLng = coordinates && coordinates.length > 1 ? coordinates[1][0] : targetLng;
          const nextLat = coordinates && coordinates.length > 1 ? coordinates[1][1] : targetLat;
          const roadHeading = Math.round(this.calculateBearing(roadLat, roadLng, nextLat, nextLng)) || this.driverHeading();

          this.hasGpsFix.set(true);
          this.driverLat.set(roadLat);
          this.driverLng.set(roadLng);
          this.driverHeading.set(roadHeading);
          this.updateDriverLocationWebGL(roadLng, roadLat, roadHeading);

          if (coordinates) {
            this.applyRouteLineCoordinates(coordinates, color);
          }

          if (this.map && !this.isUserPanned()) {
            this.map.easeTo({
              center: [roadLng, roadLat],
              pitch: 60,
              bearing: roadHeading,
              zoom: 16.5,
              duration: 900,
              easing: (t: number) => 1 - Math.pow(1 - t, 3),
              essential: true,
            });
          }

          this.driverService.updateDriverLocation({
            lat: roadLat,
            lng: roadLng,
            heading: roadHeading,
            ride_id: Number(dTrip.id),
          });
          return;
        }

        // 3. Standard 2D/3D map click when NOT returning and NOT in active trip
        let newHeading = this.driverHeading();
        if (this.driverLat() && this.driverLng()) {
          newHeading = Math.round(this.calculateBearing(this.driverLat(), this.driverLng(), lat, lng));
        }

        this.handleGpsUpdate({
          coords: {
            latitude: lat,
            longitude: lng,
            heading: newHeading,
            speed: 15,
            accuracy: 5,
          },
        } as any);

        // Broadcast overridden location via Reverb to all connected devices/sessions
        this.driverService.updateDriverLocation({
          lat: lat,
          lng: lng,
          heading: newHeading,
        });
      });

      mapInstance.on('load', () => {
        mapInstance.resize();
        try {
          const pad = this.getVisibleMapPadding();
          mapInstance.setPadding(pad);

          const isPassenger = this.authService.isPassenger();
          const pRide = this.activePassengerRide();
          const dTrip = this.driverService.activeTrip();

          if (isPassenger && pRide && (pRide.status === 'en_route' || pRide.status === 'in_transit')) {
            const centerLng = Number(pRide.driver_lng || pRide.pickup_lng || this.driverLng());
            const centerLat = Number(pRide.driver_lat || pRide.pickup_lat || this.driverLat());
            mapInstance.jumpTo({
              center: [centerLng, centerLat],
              padding: pad,
              pitch: 60,
              zoom: 16.5,
            });
          } else if (!isPassenger && dTrip && (dTrip.status === 'en_route' || dTrip.status === 'in_transit')) {
            mapInstance.jumpTo({
              center: [this.driverLng(), this.driverLat()],
              padding: pad,
              pitch: 60,
              zoom: 16.5,
            });
          } else if (!isPassenger && this.driverService.isReturning()) {
            mapInstance.jumpTo({
              center: [this.driverLng(), this.driverLat()],
              padding: pad,
              pitch: 60,
              zoom: 16.2,
            });
          } else {
            // Idle / Booking state: default to terminal or current location top view
            mapInstance.jumpTo({
              center: [this.driverLng(), this.driverLat()],
              padding: pad,
              pitch: 0,
              zoom: 16.0,
            });
          }
        } catch { }
        this.initTerminalGeofence(mapInstance);
        this.initReturnRouteLayer(mapInstance);
        this.addMapMarkers(mapInstance);

        if (!this.authService.isPassenger() && this.driverService.isReturning()) {
          this.updateReturnRoutePolyline(this.driverLng(), this.driverLat());
        }
      });

      mapInstance.on('styleimagemissing', (e: any) => {
        const id = e?.id;
        if (id && !mapInstance.hasImage(id)) {
          // Supply a 1x1 transparent fallback SDF image to eliminate MapLibre missing POI sprite warnings and SDF buffer conflicts
          const transparentImage = new ImageData(1, 1);
          try {
            mapInstance.addImage(id, transparentImage, { sdf: true });
          } catch { }
        }
      });

      mapInstance.on('styledata', () => {
        mapInstance.resize();
        this.initTerminalGeofence(mapInstance);
        this.initReturnRouteLayer(mapInstance);
        if (this.driverService.isReturning()) {
          this.updateReturnRoutePolyline(this.driverLng(), this.driverLat());
        }
      });

      // ONLY set isUserPanned when the USER physically touches and drags the map
      mapInstance.on('dragstart', (e: any) => {
        if (e && e.originalEvent) {
          this.isUserPanned.set(true);
        }
      });

      mapInstance.on('error', (e: any) => {
        if (e && e.error && e.error.message && !mapInstance.isStyleLoaded()) {
          this.applyCartoFallback(mapInstance);
        }
      });

      setTimeout(() => mapInstance.resize(), 200);
      setTimeout(() => mapInstance.resize(), 600);
      setTimeout(() => mapInstance.resize(), 1200);
    } catch (err) {
      console.error('Map init error:', err);
    }
  }

  private applyCartoFallback(mapInstance: any): void {
    try {
      mapInstance.setStyle({
        version: 8,
        sources: {
          'carto-voyager': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
              'https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
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
      });
      this.initTerminalGeofence(mapInstance);
      this.addMapMarkers(mapInstance);
    } catch { }
  }

  // --- 2. 35m TERMINAL GEOFENCE ---
  private initTerminalGeofence(mapInstance: any): void {
    if (this.authService.isPassenger()) {
      // Passengers see a clean map without driver geofence radius circles
      return;
    }

    const circleGeoJSON = this.createTerminalGeoJSONCircle(
      this.TERMINAL_LNG,
      this.TERMINAL_LAT,
      this.TERMINAL_RADIUS_METERS
    );

    try {
      if (mapInstance.getSource('terminal-geofence-source')) {
        mapInstance.getSource('terminal-geofence-source').setData(circleGeoJSON);
        return;
      }

      mapInstance.addSource('terminal-geofence-source', {
        type: 'geojson',
        data: circleGeoJSON,
      });

      mapInstance.addLayer({
        id: 'terminal-geofence-fill',
        type: 'fill',
        source: 'terminal-geofence-source',
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.14,
        },
      });

      mapInstance.addLayer({
        id: 'terminal-geofence-line',
        type: 'line',
        source: 'terminal-geofence-source',
        paint: {
          'line-color': '#2563eb',
          'line-width': 2.5,
          'line-dasharray': [3, 3],
          'line-opacity': 0.95,
        },
      });
    } catch { }
  }

  private createTerminalGeoJSONCircle(
    centerLng: number,
    centerLat: number,
    radiusMeters: number,
    points = 64
  ): any {
    const coords: [number, number][] = [];
    const km = radiusMeters / 1000;
    const distanceX = km / (111.32 * Math.cos((centerLat * Math.PI) / 180));
    const distanceY = km / 110.574;

    for (let i = 0; i < points; i++) {
      const theta = (i / points) * (2 * Math.PI);
      const x = distanceX * Math.cos(theta);
      const y = distanceY * Math.sin(theta);
      coords.push([centerLng + x, centerLat + y]);
    }
    coords.push(coords[0]);

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [coords],
      },
      properties: {},
    };
  }

  // --- 3. MODERN PROFESSIONAL MAP MARKERS (Google Maps / Apple Maps / Grab Style) ---
  private addMapMarkers(mapInstance: any): void {
    try {
      const isPassenger = this.authService.isPassenger();

      if (isPassenger) {
        // Passenger View: Clean modern terminal station pin without geofence clutter
        if (!this.terminalMarker) {
          const terminalEl = document.createElement('div');
          terminalEl.className = 'srh-passenger-terminal-pin';
          terminalEl.innerHTML = `
            <div class="passenger-terminal-bubble">
              <svg class="station-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
              </svg>
              <span>SRH TODA Terminal</span>
            </div>
            <div class="pin-tail"></div>
          `;

          this.terminalMarker = new maplibregl.Marker({
            element: terminalEl,
            anchor: 'bottom',
            pitchAlignment: 'viewport',
            rotationAlignment: 'viewport',
          })
            .setLngLat([this.TERMINAL_LNG, this.TERMINAL_LAT])
            .addTo(mapInstance);
        }
      } else {
        // Driver View: Ground dot + upright billboard badge
        if (!this.terminalGroundDot) {
          const dotEl = document.createElement('div');
          dotEl.className = 'srh-terminal-ground-dot';
          this.terminalGroundDot = new maplibregl.Marker({
            element: dotEl,
            anchor: 'center',
            pitchAlignment: 'map',
            rotationAlignment: 'map',
          })
            .setLngLat([this.TERMINAL_LNG, this.TERMINAL_LAT])
            .addTo(mapInstance);
        }

        if (!this.terminalMarker) {
          const terminalEl = document.createElement('div');
          terminalEl.className = 'srh-terminal-marker-pin';
          terminalEl.innerHTML = `
            <div class="terminal-pill-badge">
              <svg class="pin-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
              </svg>
              <span>SRH TODA Terminal</span>
            </div>
          `;

          this.terminalMarker = new maplibregl.Marker({
            element: terminalEl,
            anchor: 'bottom',
            offset: [0, -8],
            pitchAlignment: 'viewport',
            rotationAlignment: 'viewport',
          })
            .setLngLat([this.TERMINAL_LNG, this.TERMINAL_LAT])
            .addTo(mapInstance);
        }
      }

      // 2. Driver Animated Location Puck (Google Maps / Apple Maps / Uber style)
      if (!this.driverMarker) {
        const driverEl = document.createElement('div');
        driverEl.className = 'driver-live-map-marker-container';
        driverEl.innerHTML = `
          <div class="driver-marker-ping"></div>
          <div class="driver-cone-beam" id="driver-cone-beam-element" style="transform: rotate(${this.driverHeading()}deg)">
            <svg viewBox="0 0 70 70" fill="none">
              <defs>
                <linearGradient id="headingConeGrad" x1="35" y1="35" x2="35" y2="2" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.6"/>
                  <stop offset="60%" stop-color="#60a5fa" stop-opacity="0.25"/>
                  <stop offset="100%" stop-color="#93c5fd" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <path d="M35 35 L16 3 A35 35 0 0 1 54 3 Z" fill="url(#headingConeGrad)"/>
            </svg>
          </div>
          <div class="driver-center-dot"></div>
        `;

        this.driverMarker = new maplibregl.Marker({
          element: driverEl,
          offset: [0, 0],
          pitchAlignment: 'map',
          rotationAlignment: 'map',
        })
          .setLngLat([this.driverLng(), this.driverLat()])
          .addTo(mapInstance);
      }
    } catch (err) {
      console.warn('Map marker add notice:', err);
    }
  }

  private updateDriverHeadingCone(heading: number): void {
    const coneEl = document.getElementById('driver-cone-beam-element');
    if (coneEl) {
      coneEl.style.transform = `rotate(${heading}deg)`;
    }
  }

  private updateDriverLocationWebGL(lng: number, lat: number, heading: number): void {
    if (this.driverMarker) {
      this.driverMarker.setLngLat([lng, lat]);
    }
    this.updateDriverHeadingCone(heading);
  }

  private createDriverBeamConeGeoJSON(centerLng: number, centerLat: number, headingDeg: number): any {
    const radiusMeters = 28;
    const halfSpread = 32;
    const km = radiusMeters / 1000;
    const distanceX = km / (111.32 * Math.cos((centerLat * Math.PI) / 180));
    const distanceY = km / 110.574;

    const coords: [number, number][] = [[centerLng, centerLat]];
    const startAngle = headingDeg - halfSpread;
    const endAngle = headingDeg + halfSpread;
    const steps = 14;

    for (let i = 0; i <= steps; i++) {
      const deg = startAngle + (i / steps) * (endAngle - startAngle);
      const rad = (90 - deg) * (Math.PI / 180);
      const x = distanceX * Math.cos(rad);
      const y = distanceY * Math.sin(rad);
      coords.push([centerLng + x, centerLat + y]);
    }
    coords.push([centerLng, centerLat]);

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [coords],
      },
      properties: {},
    };
  }

  // --- 4. GPS TRACKING (Single Fetch on First Load — No Drift Interval) ---
  private startRealGpsTracking(): void {
    if (!navigator.geolocation) {
      this.isGpsFetching.set(false);
      return;
    }

    this.isGpsFetching.set(true);

    // Fetch once on app open / first load with high accuracy
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.isGpsFetching.set(false);
        this.handleGpsUpdate(pos);
      },
      (err) => {
        console.warn('GPS initial location fetch error:', err);
        this.isGpsFetching.set(false);
        this.displayToast('Unable to acquire GPS location. Please check device location permissions.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  private stopGpsTracking(): void {
    this.isGpsFetching.set(false);
  }

  // --- 2.1 ROADWAY CENTERLINE PROJECTION SNAPPING ---
  snapToNearestRoad(lat: number, lng: number): { lat: number; lng: number } {
    let closestPt = { lat, lng };
    let minDistanceSq = Infinity;

    for (const line of this.ROAD_NETWORKS) {
      for (let i = 0; i < line.length - 1; i++) {
        const [lngA, latA] = line[i];
        const [lngB, latB] = line[i + 1];

        const dx = lngB - lngA;
        const dy = latB - latA;
        const lenSq = dx * dx + dy * dy;

        let t = 0;
        if (lenSq > 0) {
          t = ((lng - lngA) * dx + (lat - latA) * dy) / lenSq;
          t = Math.max(0, Math.min(1, t));
        }

        const projLng = lngA + t * dx;
        const projLat = latA + t * dy;

        const distSq = Math.pow(projLat - lat, 2) + Math.pow(projLng - lng, 2);
        if (distSq < minDistanceSq) {
          minDistanceSq = distSq;
          closestPt = { lat: projLat, lng: projLng };
        }
      }
    }

    return closestPt;
  }

  // --- 2.2 RETURNING TO TERMINAL NAVIGATION ROUTE LAYER ---
  private initReturnRouteLayer(mapInstance: any): void {
    try {
      if (!mapInstance.getSource('terminal-return-route-source')) {
        mapInstance.addSource('terminal-return-route-source', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [],
            },
            properties: {},
          },
        });

        // 1. Soft Ambient Glow under the road corridor
        mapInstance.addLayer({
          id: 'terminal-return-route-glow',
          type: 'line',
          source: 'terminal-return-route-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#1d4ed8',
            'line-width': [
              'interpolate', ['exponential', 1.5], ['zoom'],
              12, 8,
              14, 14,
              16, 22,
              18, 34,
              20, 48
            ],
            'line-opacity': 0.28,
            'line-blur': 2,
          },
        });

        // 2. High-Contrast Outer Road-Border Casing
        mapInstance.addLayer({
          id: 'terminal-return-route-casing',
          type: 'line',
          source: 'terminal-return-route-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#60a5fa',
            'line-width': [
              'interpolate', ['exponential', 1.5], ['zoom'],
              12, 6,
              14, 11,
              16, 17,
              18, 28,
              20, 40
            ],
            'line-opacity': 0.9,
          },
        });

        // 3. Vibrant Electric Blue Road-Filling Core Line
        mapInstance.addLayer({
          id: 'terminal-return-route-line',
          type: 'line',
          source: 'terminal-return-route-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#2563eb',
            'line-width': [
              'interpolate', ['exponential', 1.5], ['zoom'],
              12, 4,
              14, 8,
              16, 13,
              18, 22,
              20, 32
            ],
            'line-opacity': 1.0,
          },
        });

        // 4. Center Highway Highlight Shimmer
        mapInstance.addLayer({
          id: 'terminal-return-route-core',
          type: 'line',
          source: 'terminal-return-route-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#93c5fd',
            'line-width': [
              'interpolate', ['exponential', 1.5], ['zoom'],
              12, 1.5,
              14, 3,
              16, 5,
              18, 8,
              20, 12
            ],
            'line-opacity': 0.65,
          },
        });
      }
    } catch { }
  }

  private routingAbortController: AbortController | null = null;
  private lastRoutedCoords: { lat: number; lng: number } | null = null;

  private async fetchRoadRouteToTerminal(driverLng: number, driverLat: number): Promise<[number, number][]> {
    const termLng = this.TERMINAL_LNG;
    const termLat = this.TERMINAL_LAT;

    if (this.calculateDistanceMeters(driverLat, driverLng, termLat, termLng) <= 10) {
      return [[driverLng, driverLat], [termLng, termLat]];
    }

    try {
      if (this.routingAbortController) {
        this.routingAbortController.abort();
      }
      this.routingAbortController = new AbortController();

      const url = `https://router.project-osrm.org/route/v1/driving/${driverLng},${driverLat};${termLng},${termLat}?overview=full&geometries=geojson&steps=false`;
      const response = await fetch(url, { signal: this.routingAbortController.signal });
      if (response.ok) {
        const data = await response.json();
        if (data && data.routes && data.routes.length > 0 && data.routes[0].geometry?.coordinates?.length > 1) {
          return data.routes[0].geometry.coordinates as [number, number][];
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.warn('OSRM route fetch notice:', e);
      }
    }

    // High-accuracy fallback roadway path through Santa Rosa bridge and road corridor
    return this.buildFallbackRoadRoute(driverLng, driverLat, termLng, termLat);
  }

  private buildFallbackRoadRoute(fromLng: number, fromLat: number, toLng: number, toLat: number): [number, number][] {
    const route: [number, number][] = [[fromLng, fromLat]];
    const bridgeCoord: [number, number] = [120.9260, 15.4240];
    const junctionCoord: [number, number] = [120.9260, 15.42955];

    if (fromLat < 15.424) {
      route.push([120.9260, Math.min(fromLat, 15.4200)]);
      route.push(bridgeCoord);
      route.push(junctionCoord);
      route.push([toLng, toLat]);
    } else {
      route.push([fromLng, toLat]);
      route.push([toLng, toLat]);
    }

    return route;
  }

  private async updateReturnRoutePolyline(driverLng: number, driverLat: number): Promise<void> {
    if (!this.map) return;

    if (this.lastRoutedCoords) {
      const distMoved = this.calculateDistanceMeters(driverLat, driverLng, this.lastRoutedCoords.lat, this.lastRoutedCoords.lng);
      if (distMoved < 3) return;
    }
    this.lastRoutedCoords = { lat: driverLat, lng: driverLng };

    const coordinates = await this.fetchRoadRouteToTerminal(driverLng, driverLat);
    if (!coordinates || coordinates.length < 2 || !this.map) return;

    try {
      const source = this.map.getSource('terminal-return-route-source');
      if (source) {
        source.setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coordinates,
          },
          properties: {},
        });
      }

      // Orient vehicle and camera along the actual road direction ahead
      if (this.driverService.isReturning() && coordinates.length >= 2) {
        const [nextLng, nextLat] = coordinates[1];
        const roadBearing = Math.round(this.calculateBearing(driverLat, driverLng, nextLat, nextLng));
        if (!isNaN(roadBearing)) {
          this.driverHeading.set(roadBearing);
          const coneEl = document.getElementById('driver-tricycle-cone');
          if (coneEl) {
            coneEl.style.transform = `rotate(${roadBearing}deg)`;
          }

          if (this.map && !this.isUserPanned()) {
            this.map.easeTo({
              center: [driverLng, driverLat],
              bearing: roadBearing,
              pitch: 60,
              zoom: 16.2,
              duration: 350,
            });
          }
        }
      }
    } catch { }
  }

  private clearReturnRoutePolyline(): void {
    if (!this.map) return;
    this.lastRoutedCoords = null;
    try {
      const source = this.map.getSource('terminal-return-route-source');
      if (source) {
        source.setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [],
          },
          properties: {},
        });
      }
    } catch { }
  }

  private async applyRoadRouteAndSnap(inputLng: number, inputLat: number): Promise<boolean> {
    const coordinates = await this.fetchRoadRouteToTerminal(inputLng, inputLat);
    if (!coordinates || coordinates.length < 2) return false;

    // 1. The exact road centerline starting coordinate
    const [roadLng, roadLat] = coordinates[0];

    // 2. The next turnpoint along the road
    const [nextLng, nextLat] = coordinates[1];

    // 3. Heading strictly along the road segment towards the turnpoint
    const roadHeading = Math.round(this.calculateBearing(roadLat, roadLng, nextLat, nextLng));

    this.hasGpsFix.set(true);
    this.driverLat.set(roadLat);
    this.driverLng.set(roadLng);
    this.driverHeading.set(roadHeading);

    try {
      localStorage.setItem('srh_last_driver_coords', JSON.stringify({
        lat: roadLat,
        lng: roadLng,
        heading: roadHeading,
      }));
    } catch { }

    if (this.driverMarker) {
      this.driverMarker.setLngLat([roadLng, roadLat]);
      const coneEl = document.getElementById('driver-tricycle-cone');
      if (coneEl) coneEl.style.transform = `rotate(${roadHeading}deg)`;
    }
    this.updateDriverLocationWebGL(roadLng, roadLat, roadHeading);

    this.applyRouteLineCoordinates(coordinates);

    if (this.map && !this.isUserPanned()) {
      this.map.easeTo({
        center: [roadLng, roadLat],
        pitch: 60,
        bearing: roadHeading,
        duration: 900,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
      });
    }

    const distToTerminal = this.calculateDistanceMeters(roadLat, roadLng, this.TERMINAL_LAT, this.TERMINAL_LNG);
    this.isInsideTerminal.set(distToTerminal <= this.TERMINAL_RADIUS_METERS);
    if (this.driverService.isReturning() && distToTerminal <= this.TERMINAL_RADIUS_METERS) {
      this.handleTerminalArrival();
    }

    return true;
  }

  private handleTerminalArrival(): void {
    const joinResult = this.driverService.autoJoinQueueOnTerminalArrival();
    this.clearReturnRoutePolyline();
    this.displayToast(joinResult.message);

    this.mapControlState.set(2);
    if (this.map) {
      this.map.easeTo({
        center: [this.TERMINAL_LNG, this.TERMINAL_LAT],
        pitch: 0,
        bearing: 0,
        zoom: 16.6,
        duration: 600,
      });
    }

    setTimeout(() => {
      this.queueCard()?.setSnap('mid');
      this.onSheetDragSync(this.queueCard()?.MID_TRANSLATE_Y ?? 0);
    }, 120);
  }

  private async handleGpsUpdate(pos: GeolocationPosition): Promise<void> {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;

    if (this.driverService.isReturning()) {
      await this.applyRoadRouteAndSnap(lng, lat);
      return;
    }

    this.hasGpsFix.set(true);
    this.driverLat.set(lat);
    this.driverLng.set(lng);

    const distToTerminal = this.calculateDistanceMeters(
      lat,
      lng,
      this.TERMINAL_LAT,
      this.TERMINAL_LNG
    );
    this.isInsideTerminal.set(distToTerminal <= this.TERMINAL_RADIUS_METERS);

    let currentHeading = this.driverHeading();
    if (pos.coords.heading !== null && pos.coords.heading !== undefined && !isNaN(pos.coords.heading)) {
      currentHeading = Math.round(pos.coords.heading);
      this.driverHeading.set(currentHeading);
    } else {
      const prevLat = this.driverLat();
      const prevLng = this.driverLng();
      const dist = this.calculateDistanceMeters(prevLat, prevLng, lat, lng);
      if (dist >= 1.5) {
        currentHeading = Math.round(this.calculateBearing(prevLat, prevLng, lat, lng));
        this.driverHeading.set(currentHeading);
      }
    }

    try {
      localStorage.setItem('srh_last_driver_coords', JSON.stringify({
        lat,
        lng,
        heading: currentHeading,
      }));
    } catch { }

    if (this.driverMarker) {
      this.driverMarker.setLngLat([lng, lat]);
    }
    this.updateDriverHeadingCone(currentHeading);

    // Center map smoothly on driver's location without altering the current zoom level
    if (this.map && !this.isUserPanned()) {
      const is3D = this.mapControlState() === 3;
      this.map.easeTo({
        center: [lng, lat],
        bearing: is3D ? currentHeading : 0,
        pitch: is3D ? 60 : 0,
        duration: 800,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
      });
    }
  }

  // --- 5. COMPASS TRACKING & 3D ORIENTATION CAMERA ---
  private initCompassTracking(): void {
    if (typeof window === 'undefined') return;

    // Register a single optimal listener to prevent conflicting event streams and drift
    if ('ondeviceorientationabsolute' in (window as any)) {
      this.compassListenerType = 'deviceorientationabsolute';
      (window as any).addEventListener('deviceorientationabsolute', this.boundDeviceOrientation as any, { passive: true });
    } else if (typeof window !== 'undefined') {
      this.compassListenerType = 'deviceorientation';
      (window as any).addEventListener('deviceorientation', this.boundDeviceOrientation as any, { passive: true });
    }
  }

  private stopCompassTracking(): void {
    if (typeof window !== 'undefined' && this.compassListenerType) {
      if (this.compassListenerType === 'deviceorientationabsolute') {
        (window as any).removeEventListener('deviceorientationabsolute', this.boundDeviceOrientation as any);
      } else {
        (window as any).removeEventListener('deviceorientation', this.boundDeviceOrientation as any);
      }
      this.compassListenerType = null;
    }
    if (this.compassRafId !== null) {
      cancelAnimationFrame(this.compassRafId);
      this.compassRafId = null;
    }
  }

  private handleDeviceOrientation(e: DeviceOrientationEvent): void {
    // In Returning to Terminal state: disable gyro compass drift to keep view locked to road navigation!
    if (this.driverService.isReturning()) {
      return;
    }

    let rawHeading: number | null = null;

    if ((e as any).webkitCompassHeading !== undefined && (e as any).webkitCompassHeading !== null) {
      // iOS WebKit (Safari): provides absolute magnetic/true heading (0 = North, clockwise)
      rawHeading = (e as any).webkitCompassHeading;
    } else if (e.alpha !== null && e.alpha !== undefined) {
      // Android / W3C standard: alpha is rotation around Z-axis
      rawHeading = (360 - e.alpha) % 360;
    }

    if (rawHeading === null || isNaN(rawHeading)) return;

    const now = performance.now();
    // Throttle sensor processing to ~30fps to avoid jitter/drift
    if (now - this.lastCompassUpdateTime < 32) return;
    this.lastCompassUpdateTime = now;

    // Normalize angular difference [-180, 180]
    const diff = ((rawHeading - this.compassLastBearing + 540) % 360) - 180;

    // Deadband threshold: ignore micro-noise (< 2.0 degrees) to stay stationary when holding device
    if (Math.abs(diff) < 2.0) {
      return;
    }

    // Smooth lerp on angle
    this.compassLastBearing = (this.compassLastBearing + diff * 0.25 + 360) % 360;
    const smoothedHeading = Math.round(this.compassLastBearing);

    this.driverHeading.set(smoothedHeading);

    // Rotate visual vehicle cone beam marker dynamically
    this.updateDriverHeadingCone(smoothedHeading);

    // In 3D Compass View (mapControlState === 3), smoothly rotate camera and lock 60deg tilt (pitch)
    if (this.map && this.mapControlState() === 3 && !this.isUserPanned()) {
      if (this.compassRafId === null) {
        this.compassRafId = requestAnimationFrame(() => {
          this.compassRafId = null;
          if (this.map && this.mapControlState() === 3 && !this.isUserPanned()) {
            this.map.easeTo({
              bearing: smoothedHeading,
              pitch: 60,
              duration: 220,
              easing: (t: number) => t,
            });
          }
        });
      }
    }
  }

  private calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
    const x =
      Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
      Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180);
    const θ = Math.atan2(y, x);
    return ((θ * 180) / Math.PI + 360) % 360;
  }

  // --- 6. UNIFIED MAP BUTTON CONTROLLER ---
  handleUnifiedMapButtonClick(): void {
    if (!this.map) return;

    if (this.isUserPanned()) {
      if (this.isLocationOverridden() || !this.hasGpsFix()) {
        this.fetchAndRecenterGpsLocation();
      } else {
        this.isUserPanned.set(false);
        this.recenterToDriverOrTerminal();
      }
      return;
    }

    const currentState = this.mapControlState();

    if (currentState === 2) {
      // Request iOS device orientation permission if required
      if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
        (DeviceOrientationEvent as any).requestPermission().catch(() => {});
      }

      // Switch from 2D Top View to 3D Tilted Compass View
      this.isUserPanned.set(false);
      this.mapControlState.set(3);
      this.map.easeTo({
        center: [this.driverLng(), this.driverLat()],
        padding: this.getVisibleMapPadding(),
        zoom: 17.2,
        pitch: 60,
        bearing: this.driverHeading(),
        duration: 650,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
        essential: true,
      });
      this.displayToast('3D Compass View (Follows Device Orientation)');
    } else {
      // Switch from 3D Tilted Compass View back to 2D Top View
      this.isUserPanned.set(false);
      this.mapControlState.set(2);
      this.map.easeTo({
        center: [this.driverLng(), this.driverLat()],
        padding: this.getVisibleMapPadding(),
        zoom: 16.6,
        pitch: 0,
        bearing: 0,
        duration: 650,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
        essential: true,
      });
      this.displayToast('2D Top View (North-Up)');
    }
  }

  fetchAndRecenterGpsLocation(): void {
    if (!navigator.geolocation) {
      this.isUserPanned.set(false);
      this.recenterToDriverOrTerminal();
      return;
    }

    this.isGpsFetching.set(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.isGpsFetching.set(false);
        this.isUserPanned.set(false);
        this.isLocationOverridden.set(false);

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        this.hasGpsFix.set(true);
        this.driverLat.set(lat);
        this.driverLng.set(lng);

        const distToTerminal = this.calculateDistanceMeters(
          lat,
          lng,
          this.TERMINAL_LAT,
          this.TERMINAL_LNG
        );
        this.isInsideTerminal.set(distToTerminal <= this.TERMINAL_RADIUS_METERS);

        if (this.driverMarker) {
          this.driverMarker.setLngLat([lng, lat]);
        }

        const is3D = this.mapControlState() === 3;
        this.map.flyTo({
          center: [lng, lat],
          padding: this.getVisibleMapPadding(),
          zoom: is3D ? 17.2 : 16.6,
          pitch: is3D ? 60 : 0,
          bearing: is3D ? this.driverHeading() : 0,
          speed: 1.4,
          curve: 1.2,
          essential: true,
        });

        this.displayToast('Re-centered on Live Location');
      },
      (err) => {
        console.warn('GPS location fetch error on recenter:', err);
        this.isGpsFetching.set(false);
        this.isUserPanned.set(false);
        this.recenterToDriverOrTerminal();
        this.displayToast('Re-centered on last known position');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  private recenterToDriverOrTerminal(): void {
    if (!this.map) return;
    const is3D = this.mapControlState() === 3;
    this.map.flyTo({
      center: [this.driverLng(), this.driverLat()],
      padding: this.getVisibleMapPadding(),
      zoom: is3D ? 17.2 : 16.6,
      pitch: is3D ? 60 : 0,
      bearing: is3D ? this.driverHeading() : 0,
      speed: 1.2,
      curve: 1.4,
      essential: true,
    });
  }

  onStartTerminalRide(): void {
    if (!this.driverService.isOnline()) {
      this.displayToast('You are currently Off Duty. Toggle On Duty to start a ride.');
      return;
    }

    const currentPos = this.driverService.queuePosition();
    if (currentPos && currentPos > 1) {
      this.displayToast(`You need to be #1 in queue to start a terminal ride. (Currently #${currentPos})`);
      return;
    }

    this.wakeMapRenderLoop(650);
    this.isWaysideModal.set(false);
    this.showTerminalModal.set(true);
  }

  onAddWaysideRide(): void {
    this.wakeMapRenderLoop(650);
    this.isWaysideModal.set(true);
    this.showTerminalModal.set(true);
  }

  closeTerminalModal(): void {
    this.wakeMapRenderLoop(450);
    this.showTerminalModal.set(false);
  }

  onTerminalRideConfirmed(details: any): void {
    if (this.isWaysideModal()) {
      this.driverService.startWaysideRide(
        details.destination,
        details.passengerCount,
        details.fare
      );
      this.displayToast(`Wayside ride dispatched to ${details.destination}! (${details.passengerCount} Pax • ₱${details.fare})`);
    } else {
      this.driverService.startTerminalRide(
        details.destination,
        details.passengerCount,
        details.fare
      );
      this.displayToast(`Departed for ${details.destination} (${details.passengerCount} Pax • ₱${details.fare})`);
    }

    this.clearReturnRoutePolyline();

    // Animate map into tilted 3D compass mode
    this.isUserPanned.set(false);
    this.mapControlState.set(3);
    if (this.map) {
      this.map.easeTo({
        center: [this.driverLng(), this.driverLat()],
        zoom: 17.2,
        pitch: 60,
        bearing: this.driverHeading(),
        duration: 650,
        essential: true,
      });
    }

    // Automatically retract bottom sheet to docked position and sync floating controls
    setTimeout(() => {
      this.queueCard()?.setSnap('mid');
    }, 60);
  }

  async onDropOffClicked(): Promise<void> {
    const result = this.driverService.completeDropOff();
    this.soundService.playDropoffSuccess();
    this.displayToast(result.message);

    this.mapControlState.set(3);
    setTimeout(() => {
      this.queueCard()?.setSnap('mid');
    }, 120);

    // Snap to actual road route and orient view along road towards terminal
    await this.applyRoadRouteAndSnap(this.driverLng(), this.driverLat());
  }

  onDutyToggled(isOnline: boolean): void {
    if (isOnline) {
      if (!this.hasGpsFix()) {
        this.displayToast('Acquiring GPS location... Please ensure Location/GPS is enabled.');
        return;
      }

      const dist = this.calculateDistanceMeters(
        this.driverLat(),
        this.driverLng(),
        this.TERMINAL_LAT,
        this.TERMINAL_LNG
      );

      if (dist > this.TERMINAL_RADIUS_METERS) {
        this.displayToast(
          `Outside Terminal Area: You are ${Math.round(dist)}m away. You must be physically inside the TODA Terminal (within ${this.TERMINAL_RADIUS_METERS}m) to go on duty.`
        );
        return;
      }
    }

    const currentDist = this.hasGpsFix()
      ? this.calculateDistanceMeters(this.driverLat(), this.driverLng(), this.TERMINAL_LAT, this.TERMINAL_LNG)
      : (isOnline ? 999999 : 0);

    const localResult = this.driverService.toggleDuty(isOnline, currentDist);
    this.displayToast(localResult.message, isOnline && localResult.success ? 'success' : undefined);
    if (!localResult.success) {
      return;
    }

    if (isOnline) {
      this.soundService.playOnDuty();
      this.pushService.requestPermissionAndSubscribe();
      this.recenterToDriverOrTerminal();
      this.mapControlState.set(2);
    } else {
      this.soundService.playOffDuty();
    }
  }

  displayToast(msg: string, color?: string): void {
    this.toastMessage.set(msg);
    this.toastColor.set(color);
    this.showToast.set(true);
  }

  // --- Appeal Form Handlers for Suspended / Rejected State ---
  handleAppealFileUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const newFiles: Array<{ name: string; size: string }> = [];
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        newFiles.push({
          name: file.name,
          size: (file.size / 1024).toFixed(1) + ' KB',
        });
      }
      this.appealFiles.set([...this.appealFiles(), ...newFiles]);
    }
  }

  removeAppealFile(index: number): void {
    const current = [...this.appealFiles()];
    current.splice(index, 1);
    this.appealFiles.set(current);
  }

  submitAppealForm(): void {
    const text = this.appealText();
    if (!text || !text.trim()) {
      this.displayToast('Please write an explanation for your appeal.');
      return;
    }

    this.driverService.submitAppeal(
      text.trim(),
      this.appealFiles().map((f) => ({ name: f.name }))
    );
    this.appealText.set('');
    this.appealFiles.set([]);
    this.displayToast('Your appeal has been submitted to TODA Admin for review.');
  }
}
