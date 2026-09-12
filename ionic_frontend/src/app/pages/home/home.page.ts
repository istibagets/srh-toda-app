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
import { AttachmentViewerService } from '../../services/attachment-viewer.service';
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
  passengerMarker: any = null;
  terminalMarker: any = null;
  terminalGroundDot: any = null;

  currentSnap = signal<SheetSnap>('min');
  showTerminalModal = signal<boolean>(false);

  showToast = signal<boolean>(false);
  toastMessage = signal<string>('');
  toastColor = signal<string | undefined>(undefined);

  attachmentViewer = inject(AttachmentViewerService);

  // Appeal form state for suspended / rejected screen
  appealText = signal<string>('');
  appealFiles = signal<Array<{ name: string; size: string; url?: string }>>([]);

  // Terminal Real Coordinates from dynamic driverService / Laravel backend
  get TERMINAL_LNG(): number { return this.driverService.terminalLng(); }
  get TERMINAL_LAT(): number { return this.driverService.terminalLat(); }
  get TERMINAL_RADIUS_METERS(): number { return this.driverService.terminalRadius(); }

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

  // Live Event-Driven GPS Tracking & Route Engine
  // Single authoritative geolocation watch with graceful degrade/re-escalate,
  // lifecycle-aware subscribe/resume, and a stale-fix supervisor (no busy polling).
  private gpsWatchId: number | null = null;
  private gpsUseHighAccuracy = true;
  private gpsLastFixAt = 0;
  private gpsFixIsCoarse = false;
  private gpsRetryCount = 0;
  private gpsRetryTimeout: any = null;
  private gpsEscalationTimeout: any = null;
  private gpsWakeTimeout: any = null;
  private gpsListenersRegistered = false;
  private gpsLastCamFollowAt = 0;
  private lastProcessedGpsCoords: { lat: number; lng: number; time: number } | null = null;
  private boundVisibilityHandler = (): void => this.onGpsVisibilityChanged();
  private boundPageShowHandler = (): void => this.onGpsPageShow();
  private boundOnlineHandler = (): void => this.onGpsOnline();
  private lastBroadcastTime = 0;
  private lastDriverBroadcastTime = 0;
  private lastRerouteTime = 0;
  private currentActiveRouteCoordinates: [number, number][] = [];
  private currentRouteDestination: [number, number] | null = null;
  private currentRouteColor: string = '#2563eb';

  // 60/120fps Smooth Marker Interpolation Engine
  private markerAnimRafId: number | null = null;
  private markerCurrentLngLat: [number, number] | null = null;
  private driverTweenTarget: [number, number] | null = null;
  private passMarkerAnimRafId: number | null = null;
  private passMarkerCurrentLngLat: [number, number] | null = null;

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

  isTripInTransit = computed(() => {
    const pStatus = String(this.activePassengerRide()?.status || '').toLowerCase().trim();
    const dStatus = String(this.driverService.activeTrip()?.status || '').toLowerCase().trim();
    return pStatus === 'in_transit' || dStatus === 'in_transit';
  });
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
      this.selectedLandmarkLat.set(null);
      this.selectedLandmarkLng.set(null);
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
      // User typed custom destination name without pinning coordinates on the map
      this.selectedLandmarkLat.set(null);
      this.selectedLandmarkLng.set(null);
      if (this.destinationPinMarker) {
        this.destinationPinMarker.remove();
        this.destinationPinMarker = null;
      }
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
        this.syncPassengerDriverTricycleMarker();
        if (this.destinationPinMarker) {
          this.destinationPinMarker.remove();
          this.destinationPinMarker = null;
        }
        this.displayToast('❌ Ride request cancelled.');
      },
      error: () => {
        this.activePassengerRide.set(null);
        this.syncPassengerDriverTricycleMarker();
      }
    });
  }

  acceptPassengerFare(): void {
    const ride = this.activePassengerRide();
    if (!ride?.id) return;

    this.dashboardService.acceptFare(ride.id).subscribe({
      next: (res) => {
        const mergedRide = {
          ...ride,
          ...(res?.ride || {}),
          status: 'en_route',
        };
        this.activePassengerRide.set(mergedRide);
        this.isUserPanned.set(false);
        this.mapControlState.set(3);
        this.syncPassengerDriverTricycleMarker();
        // Pan camera to driver, tricycle facing the actual road ahead
        this.panToDriverWithRoadBearing(mergedRide);
        this.displayToast('🎉 Proposed fare accepted! Tricycle is en route.');
        this.refreshDashboard();
      },
      error: (err) => {
        this.displayToast(err?.error?.message || 'Unable to accept proposed fare.');
      },
    });
  }

  /**
   * Pans the passenger map to the driver's position and orients the camera and
   * tricycle marker along the actual road heading (first segment of the OSRM route).
   * Falls back to the DB heading when OSRM is unavailable.
   */
  private async panToDriverWithRoadBearing(ride: any): Promise<void> {
    if (!this.map) return;

    const drvLat = Number(ride.driver_lat || ride.driver?.lat || this.TERMINAL_LAT);
    const drvLng = Number(ride.driver_lng || ride.driver?.lng || this.TERMINAL_LNG);
    const pickupLat = Number(ride.pickup_lat || 0);
    const pickupLng = Number(ride.pickup_lng || 0);

    // Immediate fallback pan so the camera moves now (before the async route fetch)
    const fallbackHeading = Number(ride.driver_heading ?? ride.driver?.heading ?? 0);
    this.map.easeTo({
      center: [drvLng, drvLat],
      pitch: 60,
      bearing: fallbackHeading,
      zoom: 16.5,
      padding: this.getVisibleMapPadding(),
      duration: 500,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      essential: true,
    });

    // If pickup coords are valid, fetch the actual road route to get the correct bearing
    if (pickupLat && pickupLng && drvLat && drvLng) {
      try {
        const coords = await this.fetchRoadRouteBetweenPoints(drvLng, drvLat, pickupLng, pickupLat);
        if (coords && coords.length >= 2 && this.map) {
          // Use the OSRM road-snapped start point as the bearing origin (not raw GPS)
          const [snapLng, snapLat] = coords[0];
          const [nextLng, nextLat] = coords[1];
          const roadBearing = Math.round(this.calculateBearing(snapLat, snapLng, nextLat, nextLng));

          if (!isNaN(roadBearing)) {
            // Lock tricycle to face the actual road direction ahead
            this.updateDriverHeadingCone(roadBearing);

            // Smooth camera to align with road bearing
            if (!this.isUserPanned()) {
              this.map.easeTo({
                center: [snapLng, snapLat],
                pitch: 60,
                bearing: roadBearing,
                zoom: 16.5,
                padding: this.getVisibleMapPadding(),
                duration: 450,
                easing: (t: number) => 1 - Math.pow(1 - t, 3),
                essential: true,
              });
            }
          }
        }
      } catch { /* non-critical: fallback heading already applied */ }
    }
  }

  openTripChat(): void {
    if (this.isTripInTransit()) {
      this.displayToast('Trip has started. In-trip chat is disabled.');
      this.showChatModal.set(false);
      return;
    }
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
  // ROAD ROUTING & NAVIGATION ENGINE
  // ==========================================
  private lastAppliedRouteColor: string | null = null;

  private applyRouteLineCoordinates(coordinates: [number, number][], color = '#2563eb'): void {
    if (!this.map) return;
    try {
      if (!Array.isArray(coordinates) || coordinates.length < 2) return;
      if (coordinates.some(([lng, lat]) => isNaN(lng) || isNaN(lat) || !lng || !lat)) return;

      this.currentActiveRouteCoordinates = coordinates;
      this.currentRouteColor = color;

      // Only update layer paint properties if the color scheme has actually changed to prevent style re-render flicker
      if (this.lastAppliedRouteColor !== color) {
        this.lastAppliedRouteColor = color;
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

    this.currentRouteDestination = [toLng, toLat];
    this.currentRouteColor = color;

    // Fetch the actual road trace without flashing straight lines
    const detailedCoords = await this.fetchRoadRouteBetweenPoints(fromLng, fromLat, toLng, toLat);
    if (!detailedCoords || detailedCoords.length < 2 || !this.map) return;

    // Check if status has become arrived while fetching (pickup routeline must disappear)
    if (!this.authService.isPassenger()) {
      const currentTrip = this.driverService.activeTrip();
      if (currentTrip?.status === 'arrived') return;
    } else {
      const currentRide = this.activePassengerRide();
      if (currentRide?.status === 'arrived') return;
    }

    // Apply the real road curve geometry directly
    this.applyRouteLineCoordinates(detailedCoords, color);

    // For DRIVER: snap marker to road start, orient camera along road
    if (!this.authService.isPassenger() && detailedCoords.length >= 2) {
      const [roadLng, roadLat] = detailedCoords[0];
      const [nextLng, nextLat] = detailedCoords[1];
      const roadBearing = Math.round(this.calculateBearing(roadLat, roadLng, nextLat, nextLng));
      if (!isNaN(roadBearing)) {
        this.driverHeading.set(roadBearing);
        // Persist road bearing so compass & camera functions always face the route, not device gyro
        this.driverRouteBearing = roadBearing;
        this.animateDriverMarkerTo(roadLng, roadLat, roadBearing, 450);
        if (lockCamera && !this.isUserPanned()) {
          this.smoothCameraFollow(roadLng, roadLat, roadBearing, 60, 600);
        }
      }

    // For PASSENGER on active trip: tricycle marker snaps to road-facing position and camera follows
    } else if (this.authService.isPassenger() && detailedCoords.length >= 2) {
      const pRide = this.activePassengerRide();
      const pStatus = String(pRide?.status || '').toLowerCase().trim();
      const hasActiveTrip = !!pRide && ['accepted', 'en_route', 'arrived', 'in_transit'].includes(pStatus);

      if (hasActiveTrip) {
        // coords[0] is the OSRM road-snapped driver position, coords[1] is the next waypoint
        const [snapLng, snapLat] = detailedCoords[0];
        const [nextLng, nextLat] = detailedCoords[1];
        const roadBearing = Math.round(this.calculateBearing(snapLat, snapLng, nextLat, nextLng));

        if (!isNaN(roadBearing)) {
          // Persist so location broadcasts can use it instantly without waiting for OSRM
          this.passengerRouteBearing = roadBearing;
          this.animateDriverMarkerTo(snapLng, snapLat, roadBearing, 450);
          if (lockCamera && !this.isUserPanned()) {
            this.smoothCameraFollow(snapLng, snapLat, roadBearing, 60, 600);
          }
        }
      }
    }
  }

  private async fetchAndApplyReroute(
    fromLng: number,
    fromLat: number,
    toLng: number,
    toLat: number,
    color = '#2563eb'
  ): Promise<void> {
    const coords = await this.fetchRoadRouteBetweenPoints(fromLng, fromLat, toLng, toLat);
    if (!coords || coords.length < 2 || !this.map) return;

    this.currentActiveRouteCoordinates = coords;
    this.currentRouteDestination = [toLng, toLat];
    this.applyRouteLineCoordinates(coords, color);

    const [roadLng, roadLat] = coords[0];
    const [nextLng, nextLat] = coords[1];
    const roadBearing = Math.round(this.calculateBearing(roadLat, roadLng, nextLat, nextLng));

    if (!isNaN(roadBearing)) {
      this.driverHeading.set(roadBearing);
      this.driverRouteBearing = roadBearing;
      this.driverLat.set(roadLat);
      this.driverLng.set(roadLng);
      this.animateDriverMarkerTo(roadLng, roadLat, roadBearing, 450);
      if (!this.isUserPanned()) {
        this.smoothCameraFollow(roadLng, roadLat, roadBearing, 60, 600);
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

    const cacheKey = `${fromLng.toFixed(4)},${fromLat.toFixed(4)}_${toLng.toFixed(4)},${toLat.toFixed(4)}`;
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
      if (e?.name === 'AbortError') {
        // Return empty array on abort so we NEVER overwrite existing route line with a straight fallback line!
        return [];
      }
      console.warn('OSRM route fetch notice:', e);
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
          this.syncPassengerDriverTricycleMarker();

          const status = String(ride.status || '').toLowerCase().trim();
          if (['accepted', 'en_route', 'arrived', 'in_transit'].includes(status)) {
            this.isUserPanned.set(false);
            this.mapControlState.set(3);
            // Wait for map to be ready then draw the route (which snaps & orients everything)
            this.waitForMapAndDrawRoute(ride);
          }
        } else {
          this.activePassengerRide.set(null);
          this.syncPassengerDriverTricycleMarker();
        }
      },
      error: () => {}
    });
  }

  /**
   * Waits up to 5s for the map instance to be ready, then calls drawRoadRouteLine
   * which is the single source of truth for snapping the tricycle to the road and
   * orienting the camera along the route bearing.
   */
  private waitForMapAndDrawRoute(ride: any, attempt = 0): void {
    if (!this.map) {
      if (attempt >= 25) return; // give up after 5s
      setTimeout(() => this.waitForMapAndDrawRoute(ride, attempt + 1), 200);
      return;
    }

    const status = String(ride.status || '').toLowerCase().trim();
    const drvLat = Number(ride.driver_lat || ride.driver?.lat || this.TERMINAL_LAT);
    const drvLng = Number(ride.driver_lng || ride.driver?.lng || this.TERMINAL_LNG);

    if ((status === 'en_route' || status === 'accepted') && ride.pickup_lat && ride.pickup_lng) {
      this.drawRoadRouteLine(drvLng, drvLat, Number(ride.pickup_lng), Number(ride.pickup_lat), '#2563eb', true);
    } else if (status === 'in_transit') {
      const dLat = Number(ride.destination_lat || ride.dest_lat || 0);
      const dLng = Number(ride.destination_lng || ride.dest_lng || 0);
      if (dLat && dLng) {
        this.drawRoadRouteLine(drvLng, drvLat, dLng, dLat, '#059669', true);
      }
    } else if (status === 'arrived') {
      // Arrived at pickup: pickup route line should disappear
      this.clearReturnRoutePolyline();
    }
  }

  togglePassengerSheet(): void {
    this.passengerSheet()?.toggleSnap();
  }

  // Comprehensive Santa Rosa Roadway Network for Instant Centerline Snapping
  private readonly ROAD_NETWORKS: [number, number][][] = [
    // Santa Rosa - Tarlac Road / Fort Magsaysay Road (West to East Arterial passing Terminal)
    [
      [120.9000, 15.42930],
      [120.9100, 15.42940],
      [120.9160, 15.42945],
      [120.9200, 15.42950],
      [120.92240292427664, 15.429550175641715],
      [120.9260, 15.42960],
      [120.9320, 15.42970],
      [120.9380, 15.42980],
      [120.9450, 15.42990],
      [120.9535, 15.43000],
      [120.9620, 15.43050],
      [120.9700, 15.43100],
    ],
    // Maharlika Highway (G106 / AH26 - North-South National Highway)
    [
      [120.9220, 15.4050],
      [120.9222, 15.4150],
      [120.9224, 15.4230],
      [120.9224, 15.4270],
      [120.92240292427664, 15.429550175641715],
      [120.9224, 15.4330],
      [120.9225, 15.4370],
      [120.9226, 15.4450],
      [120.9228, 15.4550],
      [120.9230, 15.4650],
    ],
    // Santa Rosa Bypass Road (G106 Bypass - Eastern North-South Highway Corridor)
    [
      [120.9542, 15.4050],
      [120.9540, 15.4150],
      [120.9538, 15.4220],
      [120.9535, 15.4260],
      [120.9532, 15.4300],
      [120.9528, 15.4380],
      [120.9525, 15.4480],
      [120.9520, 15.4580],
      [120.9515, 15.4680],
    ],
    // Cruz Roja / Sapang / Malasin Road
    [
      [120.9224, 15.4330],
      [120.9260, 15.4350],
      [120.9320, 15.4380],
      [120.9400, 15.4420],
      [120.9500, 15.4460],
      [120.9530, 15.4480],
    ],
    // Cojuangco St (South Parallel connector)
    [
      [120.9150, 15.4265],
      [120.9180, 15.4265],
      [120.9224, 15.4265],
      [120.9260, 15.4265],
      [120.9350, 15.4265],
      [120.9535, 15.4265],
    ],
    // Bonifacio / Market Road (North Parallel connector)
    [
      [120.9150, 15.4325],
      [120.9180, 15.4325],
      [120.9224, 15.4325],
      [120.9260, 15.4325],
      [120.9350, 15.4325],
      [120.9530, 15.4325],
    ],
  ];

  /**
   * Snaps any coordinate immediately to the nearest roadway centerline in 0ms.
   * Completely prevents vehicle marker from ever appearing in fields or outside road lane.
   */
  snapToNearestRoad(lng: number, lat: number): [number, number] {
    let nearestPoint: [number, number] = [lng, lat];
    let minDistanceSq = Infinity;

    if (this.map) {
      try {
        // 1. First priority: Snap to active route line if one exists on the map
        const activeRouteSource: any = this.map.getSource('terminal-return-route-source');
        const activeRouteData = activeRouteSource?._data || activeRouteSource?._options?.data;
        if (activeRouteData?.geometry?.coordinates?.length > 1) {
          const coords = activeRouteData.geometry.coordinates as [number, number][];
          for (let i = 0; i < coords.length - 1; i++) {
            const a = coords[i];
            const b = coords[i + 1];
            if (Array.isArray(a) && Array.isArray(b) && a.length >= 2 && b.length >= 2) {
              const proj = this.projectPointOnSegment(lng, lat, a, b);
              if (proj.distSq < minDistanceSq) {
                minDistanceSq = proj.distSq;
                nearestPoint = [proj.x, proj.y];
              }
            }
          }
        }

        // 2. Query MapLibre rendered roadway vector features across an adaptive radius
        const p = this.map.project([lng, lat]);
        const r = 380; // 380px search radius easily bridges taps in fields back to roads
        const bbox: [[number, number], [number, number]] = [
          [Math.max(0, p.x - r), Math.max(0, p.y - r)],
          [p.x + r, p.y + r],
        ];

        // Filter strictly for line layers that represent roads/streets/highways
        const styleLayers = this.map.getStyle()?.layers || [];
        const roadLayerIds = styleLayers
          .filter((l: any) => {
            if (l.type !== 'line') return false;
            const srcLayer = (l['source-layer'] || '').toLowerCase();
            const id = (l.id || '').toLowerCase();
            if (id.includes('glow') || id.includes('casing') || id.includes('terminal-return')) return false;
            return (
              srcLayer === 'transportation' ||
              srcLayer === 'road' ||
              srcLayer === 'highway' ||
              id.includes('road') ||
              id.includes('highway') ||
              id.includes('street') ||
              id.includes('path') ||
              id.includes('bridge') ||
              id.includes('tunnel') ||
              id.includes('motorway') ||
              id.includes('trunk') ||
              id.includes('primary') ||
              id.includes('secondary') ||
              id.includes('tertiary')
            );
          })
          .map((l: any) => l.id);

        let features = roadLayerIds.length > 0
          ? this.map.queryRenderedFeatures(bbox, { layers: roadLayerIds })
          : this.map.queryRenderedFeatures(bbox);

        // Viewport fallback: if user zoomed out or tapped far into field
        if (!features || features.length === 0) {
          features = roadLayerIds.length > 0
            ? this.map.queryRenderedFeatures({ layers: roadLayerIds })
            : [];
        }

        for (const feat of features) {
          // STRICT GEOMETRY CHECK: ONLY LineString and MultiLineString! NEVER Polygons!
          if (feat.geometry.type !== 'LineString' && feat.geometry.type !== 'MultiLineString') {
            continue;
          }

          const coords = (feat.geometry as any)?.coordinates;
          if (!Array.isArray(coords)) continue;

          const lines = feat.geometry.type === 'MultiLineString' ? coords : [coords];
          for (const line of lines) {
            if (!Array.isArray(line)) continue;
            for (let i = 0; i < line.length - 1; i++) {
              const a = line[i];
              const b = line[i + 1];
              if (Array.isArray(a) && Array.isArray(b) && a.length >= 2 && b.length >= 2) {
                const proj = this.projectPointOnSegment(lng, lat, a, b);
                if (proj.distSq < minDistanceSq) {
                  minDistanceSq = proj.distSq;
                  nearestPoint = [proj.x, proj.y];
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('Road snapping notice:', err);
      }
    }

    // 3. Mathematical check against ROAD_NETWORKS
    for (const road of this.ROAD_NETWORKS) {
      for (let i = 0; i < road.length - 1; i++) {
        const a = road[i];
        const b = road[i + 1];
        const proj = this.projectPointOnSegment(lng, lat, a, b);
        if (proj.distSq < minDistanceSq) {
          minDistanceSq = proj.distSq;
          nearestPoint = [proj.x, proj.y];
        }
      }
    }

    // If nearest road feature is farther than 45 meters, retain true physical coordinates
    if (minDistanceSq > 2025) {
      return [lng, lat];
    }

    return nearestPoint;
  }

  private projectPointOnSegment(
    px: number,
    py: number,
    a: [number, number] | any,
    b: [number, number] | any
  ): { x: number; y: number; distSq: number } {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      const distLng = (px - a[0]) * 111320 * Math.cos((py * Math.PI) / 180);
      const distLat = (py - a[1]) * 110540;
      return { x: a[0], y: a[1], distSq: distLng * distLng + distLat * distLat };
    }
    const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / lenSq));
    const projX = a[0] + t * dx;
    const projY = a[1] + t * dy;
    const distLng = (px - projX) * 111320 * Math.cos((py * Math.PI) / 180);
    const distLat = (py - projY) * 110540;
    return { x: projX, y: projY, distSq: distLng * distLng + distLat * distLat };
  }

  // Cached DOM elements for zero-lag 120fps gesture updates
  private floatingPowerEl: HTMLElement | null = null;
  private floatingMapControlsEl: HTMLElement | null = null;
  private driverHeaderEl: HTMLElement | null = null;

  private boundDeviceOrientation = (e: DeviceOrientationEvent) => this.handleDeviceOrientation(e);
  private compassLastBearing = 0;
  private coneCumulativeHeading = 0;
  private compassListenerType: string | null = null;
  private compassRafId: number | null = null;
  private lastCompassUpdateTime = 0;
  /** Last confirmed road-aligned bearing for the passenger view. Persisted so the camera never snaps to wrong angle between OSRM fetches. */
  private passengerRouteBearing = 0;
  /** Last confirmed road-aligned bearing for the driver view (active trip routeline). Prevents compass from overriding route direction. */
  private driverRouteBearing = 0;

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
            this.syncPassengerDriverTricycleMarker();
            if (this.destinationPinMarker) {
              this.destinationPinMarker.remove();
              this.destinationPinMarker = null;
            }
          } else {
            // Driver side: admin reset or passenger cancel — clear route, return to 2D top view
            this.driverRouteBearing = 0;
            this.mapControlState.set(2);
            if (this.map && !this.isUserPanned()) {
              this.map.easeTo({
                bearing: 0,
                pitch: 0,
                duration: 500,
                essential: true,
              });
            }
            // Immediately refresh dashboard to pull updated queue position
            this.refreshDashboard();
          }
        });
      }
    });

    // Reactive sync for driver map marker online/offline appearance
    effect(() => {
      const isOnline = this.driverService.isOnline();
      untracked(() => {
        this.updateDriverMarkerStatus(isOnline);
      });
    });

    // Reactive Road-Tracing Route Line Sync for Passenger & Driver (Locked 3D Navigation)
    effect(() => {
      const isPassenger = this.authService.isPassenger();
      const pRide = this.activePassengerRide();
      const dTrip = this.driverService.activeTrip();
      const dLat = !isPassenger ? this.driverLat() : 0;
      const dLng = !isPassenger ? this.driverLng() : 0;

      untracked(() => {
        if (isPassenger) {
          this.syncPassengerDriverTricycleMarker();
        }
        if (isPassenger && pRide) {
          const status = String(pRide.status || '').toLowerCase().trim();
          if (status === 'en_route' || status === 'accepted') {
            const pLat = Number(pRide.pickup_lat);
            const pLng = Number(pRide.pickup_lng);
            const drvLat = Number(pRide.driver_lat || pRide.driver?.lat || this.TERMINAL_LAT);
            const drvLng = Number(pRide.driver_lng || pRide.driver?.lng || this.TERMINAL_LNG);
            if (pLat && pLng && drvLat && drvLng) {
              this.clearDestinationPin();
              this.setPickupPin(pLng, pLat, pRide.pickup_location);
              this.drawRoadRouteLine(drvLng, drvLat, pLng, pLat, '#2563eb', true);
            }
          } else if (status === 'arrived') {
            this.clearDestinationPin();
            this.clearReturnRoutePolyline();
            const pLat = Number(pRide.pickup_lat);
            const pLng = Number(pRide.pickup_lng);
            if (pLat && pLng) {
              this.setPickupPin(pLng, pLat, pRide.pickup_location);
            }
          } else if (status === 'in_transit') {
            this.clearPickupPin();
            const dLat2 = Number(pRide.destination_lat || pRide.dest_lat);
            const dLng2 = Number(pRide.destination_lng || pRide.dest_lng);
            if (dLat2 && dLng2 && !isNaN(dLat2) && !isNaN(dLng2)) {
              const drvLat = Number(pRide.driver_lat || pRide.driver?.lat || this.TERMINAL_LAT);
              const drvLng = Number(pRide.driver_lng || pRide.driver?.lng || this.TERMINAL_LNG);
              this.setDestinationPin(dLng2, dLat2);
              this.drawRoadRouteLine(drvLng, drvLat, dLng2, dLat2, '#059669', true);
            } else {
              // Unpinned destination: no routeline, identical to a terminal walk-in ride!
              this.clearDestinationPin();
              this.clearReturnRoutePolyline();
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
            this.clearReturnRoutePolyline();
            const pLat = Number(dTrip.pickupLat);
            const pLng = Number(dTrip.pickupLng);
            if (pLat && pLng) {
              this.setPickupPin(pLng, pLat, dTrip.pickupLocation);
            }
          } else if (status === 'in_transit') {
            const hasDropoff = !!dTrip.dropoffLat && !!dTrip.dropoffLng && !isNaN(Number(dTrip.dropoffLat)) && !isNaN(Number(dTrip.dropoffLng));
            const isWalkInOrWayside = dTrip.tripType === 'terminal_walk_in' || dTrip.tripType === 'wayside_pickup' || !hasDropoff;
            if (isWalkInOrWayside) {
              // Unpinned destination or terminal walk-in: no routeline!
              this.clearDestinationPin();
              this.clearPickupPin();
              this.clearReturnRoutePolyline();
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

    // Real-time ride status update broadcast listener (Event-driven instant UI updates for Passenger & Driver)
    effect(() => {
      const ride = this.driverService.rideStatusBroadcast();
      if (!ride) return;
      untracked(() => {
        const isPassenger = this.authService.isPassenger();
        const currentUserId = this.authService.currentUser()?.id;

        if (isPassenger && Number(ride.passenger_id) === Number(currentUserId)) {
          const status = String(ride.status || '').toLowerCase().trim();
          const prevRide = this.activePassengerRide();
          const prevStatus = String(prevRide?.status || '').toLowerCase().trim();

          if (['accepted', 'en_route', 'arrived', 'in_transit'].includes(status)) {
            const merged = {
              ...(prevRide || {}),
              ...ride,
              status: status,
              driver_lat: ride.driver_lat || prevRide?.driver_lat || this.TERMINAL_LAT,
              driver_lng: ride.driver_lng || prevRide?.driver_lng || this.TERMINAL_LNG,
              driver_heading: ride.driver_heading !== undefined ? ride.driver_heading : (prevRide?.driver_heading || 0),
            };
            this.activePassengerRide.set(merged);

            if (status === 'en_route' || status === 'accepted') {
              if (prevStatus !== 'en_route' && prevStatus !== 'accepted') {
                this.soundService.playNotificationChime();
                this.displayToast('🚖 Driver is on the way to pick you up!');
              }
              this.isUserPanned.set(false);
              this.mapControlState.set(3);
              this.syncPassengerDriverTricycleMarker();
              // Draw route — this snaps tricycle to road and orients camera (single source of truth)
              this.waitForMapAndDrawRoute(merged);
            } else if (status === 'arrived') {
              if (prevStatus !== 'arrived') {
                this.soundService.playArrived();
                this.displayToast('📍 Driver is waiting outside at your pickup location!');
                if (typeof document !== 'undefined' && document.hidden) {
                  this.pushService.showLocalBanner(
                    '📍 Driver is Waiting Outside!',
                    'Your TODA tricycle driver has arrived and is waiting outside at your pickup location.',
                    '/tabs/home'
                  );
                }
              }
              this.clearReturnRoutePolyline();
              this.syncPassengerDriverTricycleMarker();
            } else if (status === 'in_transit') {
              if (prevStatus !== 'in_transit') {
                this.soundService.playNotificationChime();
                this.displayToast('🚀 Trip started! On the way to your destination.');
              }
              this.showChatModal.set(false);
              this.syncPassengerDriverTricycleMarker();
            } else {
              this.syncPassengerDriverTricycleMarker();
            }
          } else if (status === 'bargaining' || status === 'searching') {
            const merged = {
              ...(prevRide || {}),
              ...ride,
              status: status,
            };
            this.activePassengerRide.set(merged);
            this.refreshDashboard();
          } else if (status === 'fare_proposed') {
            const merged = {
              ...(prevRide || {}),
              ...ride,
              status: status,
            };
            this.activePassengerRide.set(merged);
            if (prevStatus !== 'fare_proposed') {
              this.soundService.playBookingAlert();
              this.displayToast(`💰 Driver proposed a fare of ₱${Number(ride.fare || 0).toFixed(2)}`);
            }
          } else if (status === 'completed') {
            this.activePassengerRide.set(null);
            this.showChatModal.set(false);
            this.clearRouteLine();
            this.syncPassengerDriverTricycleMarker();
            this.completedRideForRating.set(ride);
            this.showRatingModal.set(true);
            this.soundService.playDropoffSuccess();
            this.displayToast('🏁 You have arrived at your destination!');
          } else if (status === 'cancelled') {
            this.activePassengerRide.set(null);
            this.showChatModal.set(false);
            this.clearRouteLine();
            this.syncPassengerDriverTricycleMarker();
            this.displayToast('❌ Ride request was cancelled.');
            this.soundService.playOffDuty();
          }
        } else if (!isPassenger) {
          // Driver side: handle ride status broadcasts (e.g. admin reset cancels the ride or reassigns)
          const status = String(ride.status || '').toLowerCase().trim();
          const currentTrip = this.driverService.activeTrip();
          const currentTripId = currentTrip ? Number(String(currentTrip.id).replace(/\D/g, '')) : null;

          if (currentTripId && Number(ride.id) === currentTripId && Number(ride.driver_id) !== Number(currentUserId)) {
            // Ride was reassigned away from this driver (admin reset while bargaining)
            this.showChatModal.set(false);
            this.clearRouteLine();
            this.driverRouteBearing = 0;
            this.mapControlState.set(2);
            this.refreshDashboard();
          } else if (status === 'cancelled') {
            this.showChatModal.set(false);
            // Clear route line and return to 2D top view immediately
            this.clearRouteLine();
            this.driverRouteBearing = 0;
            this.mapControlState.set(2);
            if (this.map && !this.isUserPanned()) {
              this.map.easeTo({
                bearing: 0,
                pitch: 0,
                duration: 500,
                essential: true,
              });
            }
            // Immediate dashboard refresh to pull updated queue position from backend
            this.refreshDashboard();
          } else if (status === 'in_transit') {
            this.showChatModal.set(false);
          }
        }
      });
    });

    // Real-time location broadcast listener across multi-devices (updates passenger map live ONLY when on an active trip with the driver)
    effect(() => {
      const loc = this.driverService.locationBroadcast();
      if (loc) {
        this.lastDriverBroadcastTime = Date.now();
        untracked(() => {
          const currentUserId = this.authService.currentUser()?.id;
          if (loc.driverId === currentUserId || loc.driver_user_id === currentUserId) {
            return;
          }

          const isPassenger = this.authService.isPassenger();
          if (isPassenger) {
            const pRide = this.activePassengerRide();
            // ONLY sync driver location if passenger has an active ongoing trip with THIS driver
            if (pRide && (pRide.status === 'en_route' || pRide.status === 'accepted' || pRide.status === 'arrived' || pRide.status === 'in_transit')) {
              const rideDriverId = pRide.driver?.id || pRide.driver_id;
              const matchesRide = !!(loc.rideId && pRide.id && Number(loc.rideId) === Number(pRide.id));
              const matchesDriver = !loc.driverId || !rideDriverId ||
                Number(loc.driverId) === Number(rideDriverId) ||
                Number(loc.driver_user_id) === Number(rideDriverId) ||
                Number(loc.userId) === Number(rideDriverId) ||
                Number(loc.driverTableId) === Number(pRide.driver?.driver_table_id);

              if (!matchesRide && !matchesDriver) {
                return;
              }

              // Update the active ride driver coordinates
              this.activePassengerRide.update((r) =>
                r ? { ...r, driver_lat: loc.lat, driver_lng: loc.lng, driver_heading: loc.heading } : null
              );

              const drvHeading = loc.heading || this.passengerRouteBearing || 0;

              // Smoothly glide driver tricycle marker
              if (!this.driverMarker) {
                this.syncPassengerDriverTricycleMarker();
              }
              this.animateDriverMarkerTo(loc.lng, loc.lat, drvHeading, 500);

              // If passenger has an active routeline, progressively trim it
              if (this.currentActiveRouteCoordinates && this.currentActiveRouteCoordinates.length >= 2) {
                const nearest = this.findNearestPointOnRoute(loc.lng, loc.lat, this.currentActiveRouteCoordinates);
                if (nearest.distMeters <= 35 && nearest.segIndex < this.currentActiveRouteCoordinates.length - 1) {
                  const remaining: [number, number][] = [
                    nearest.point,
                    ...this.currentActiveRouteCoordinates.slice(nearest.segIndex + 1),
                  ];
                  if (remaining.length >= 2) {
                    this.currentActiveRouteCoordinates = remaining;
                    this.applyRouteLineCoordinates(remaining, this.currentRouteColor);
                  }
                }
              }

              // Smoothly follow camera if centered
              if (this.map && !this.isUserPanned()) {
                const is3D = this.mapControlState() === 3;
                this.smoothCameraFollow(loc.lng, loc.lat, is3D ? (this.passengerRouteBearing || drvHeading) : 0, is3D ? 60 : 0, 600);
              }
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

  ionViewDidEnter(): void {
    if (this.map) {
      setTimeout(() => {
        try { this.map.resize(); } catch { }
      }, 50);
    }
    this.startRealGpsTracking();
  }

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

    // Start continuous event-driven high-accuracy GPS tracking
    this.startRealGpsTracking();
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.boundWindowResize);
    this.stopGpsTracking();
    this.stopCompassTracking();

    if (this.markerAnimRafId !== null) {
      cancelAnimationFrame(this.markerAnimRafId);
      this.markerAnimRafId = null;
    }
    if (this.passMarkerAnimRafId !== null) {
      cancelAnimationFrame(this.passMarkerAnimRafId);
      this.passMarkerAnimRafId = null;
    }
    if (this.driverMarker) {
      try { this.driverMarker.remove(); } catch { }
      this.driverMarker = null;
    }
    if (this.passengerMarker) {
      try { this.passengerMarker.remove(); } catch { }
      this.passengerMarker = null;
    }
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
      next: (data: any) => {
        if (data?.geofencing) {
          this.driverService.updateTerminalSettings(
            data.geofencing.terminal_lat,
            data.geofencing.terminal_lng,
            data.geofencing.terminal_radius
          );
          if (this.map) {
            this.initTerminalGeofence(this.map);
          }
        }
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
              if (this.driverMarker) {
                this.driverMarker.setLngLat([dLng, dLat]);
              } else {
                this.syncPassengerDriverTricycleMarker();
              }
              if (dHeading) {
                this.updateDriverHeadingCone(dHeading);
              }
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
                this.displayToast('📍 Driver is waiting outside at your pickup location!');
                this.clearReturnRoutePolyline();
              } else if (newStatus === 'in_transit') {
                this.soundService.playNotificationChime();
                this.displayToast('🚀 Trip started! On the way to your destination.');
                this.showChatModal.set(false);
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
        const isPassenger = this.authService.isPassenger();
        const pRide = this.activePassengerRide();
        const dTrip = this.driverService.activeTrip();
        const hasActivePassengerTrip = isPassenger && !!pRide && ['en_route', 'accepted', 'arrived', 'in_transit'].includes(String(pRide?.status || '').toLowerCase().trim());
        const hasActiveDriverTrip = !isPassenger && !!dTrip && ['en_route', 'in_transit', 'arrived', 'accepted'].includes(String(dTrip?.status || '').toLowerCase().trim());
        const centerLng = hasActivePassengerTrip ? Number(pRide.driver_lng || pRide.driver?.lng || this.driverLng()) : this.driverLng();
        const centerLat = hasActivePassengerTrip ? Number(pRide.driver_lat || pRide.driver?.lat || this.driverLat()) : this.driverLat();
        const is3D = this.mapControlState() === 3;
        // Use route bearing when driver is on an active trip with a routeline (NOT device compass)
        const activeBearing = hasActiveDriverTrip && this.driverRouteBearing
          ? this.driverRouteBearing
          : (hasActivePassengerTrip ? this.passengerRouteBearing : this.driverHeading());

        this.map.easeTo({
          center: [centerLng, centerLat],
          bearing: is3D ? activeBearing : 0,
          pitch: is3D ? 60 : 0,
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
        const isPassenger = this.authService.isPassenger();
        const pRide = this.activePassengerRide();
        const dTrip = this.driverService.activeTrip();
        const hasActivePassengerTrip = isPassenger && !!pRide && ['en_route', 'accepted', 'arrived', 'in_transit'].includes(String(pRide?.status || '').toLowerCase().trim());
        const hasActiveDriverTrip = !isPassenger && !!dTrip && ['en_route', 'in_transit', 'arrived', 'accepted'].includes(String(dTrip?.status || '').toLowerCase().trim());
        const centerLng = hasActivePassengerTrip ? Number(pRide.driver_lng || pRide.driver?.lng || this.driverLng()) : this.driverLng();
        const centerLat = hasActivePassengerTrip ? Number(pRide.driver_lat || pRide.driver?.lat || this.driverLat()) : this.driverLat();
        const is3D = this.mapControlState() === 3;
        // Use route bearing when driver is on an active trip with a routeline (NOT device compass)
        const activeBearing = hasActiveDriverTrip && this.driverRouteBearing
          ? this.driverRouteBearing
          : (hasActivePassengerTrip ? this.passengerRouteBearing : this.driverHeading());

        this.map.easeTo({
          center: [centerLng, centerLat],
          bearing: is3D ? activeBearing : 0,
          pitch: is3D ? 60 : 0,
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
        const rawLng = e.lngLat.lng;
        const rawLat = e.lngLat.lat;

        // Manual drop-off pin mode for passenger
        if (this.isPinningMode()) {
          this.selectedLandmarkLat.set(rawLat);
          this.selectedLandmarkLng.set(rawLng);
          this.setDestinationPin(rawLng, rawLat);
          this.isPinningMode.set(false);
          this.bookingDestination.set('');
          this.calculateCustomFare(rawLat, rawLng);
          setTimeout(() => {
            this.showBookingModal.set(true);
          }, 200);
          return;
        }

        // If user is a PASSENGER: allow location override ONLY when NOT on an active trip.
        // During an active trip, the passenger is in the tricycle — their own location pin is hidden
        // and should never be repositioned. The map follows the driver tricycle, not passenger GPS.
        if (this.authService.isPassenger()) {
          const pRide = this.activePassengerRide();
          const hasActiveTrip = !!pRide && ['en_route', 'accepted', 'arrived', 'in_transit'].includes(String(pRide?.status || '').toLowerCase().trim());

          // BLOCK all location override while on active trip — no tap should move the passenger marker
          if (hasActiveTrip) return;

          this.isLocationOverridden.set(true);
          this.hasGpsFix.set(true);
          this.driverLat.set(rawLat);
          this.driverLng.set(rawLng);

          if (this.passengerMarker) {
            this.passengerMarker.setLngLat([rawLng, rawLat]);
          }

          if (this.map && !this.isUserPanned()) {
            this.map.easeTo({
              center: [rawLng, rawLat],
              zoom: 16.5,
              duration: 350,
              essential: true,
            });
          }
          return;
        }

        this.isLocationOverridden.set(true);
        this.isUserPanned.set(false);

        // 1. When returning: snap marker to road route line and orient along road segment
        if (this.driverService.isReturning()) {
          // Snap to road only when there IS a routeline to follow
          const [roadLng, roadLat] = this.snapToNearestRoad(rawLng, rawLat);
          await this.applyRoadRouteAndSnap(roadLng, roadLat);
          return;
        }

        // 2. When in active trip (en_route or in_transit): snap to road so vehicle stays on roadway
        const dTrip = this.driverService.activeTrip();
        if (dTrip && (dTrip.status === 'en_route' || dTrip.status === 'in_transit')) {
          // Snap to road ONLY when there's an active routeline
          const [roadLng, roadLat] = this.snapToNearestRoad(rawLng, rawLat);
          const isEnRoute = dTrip.status === 'en_route';
          const anyTrip = dTrip as any;
          const targetLng = isEnRoute
            ? Number(anyTrip.pickupLng || anyTrip.pickup_lng)
            : Number(anyTrip.dropoffLng || anyTrip.dropoff_lng || anyTrip.destinationLng || anyTrip.destination_lng);
          const targetLat = isEnRoute
            ? Number(anyTrip.pickupLat || anyTrip.pickup_lat)
            : Number(anyTrip.dropoffLat || anyTrip.dropoff_lat || anyTrip.destinationLat || anyTrip.destination_lat);
          const hasTargetCoord = !!targetLng && !!targetLat && !isNaN(targetLng) && !isNaN(targetLat);
          const isWalkInOrWayside = (!isEnRoute && !hasTargetCoord) || dTrip.tripType === 'terminal_walk_in' || dTrip.tripType === 'wayside_pickup';

          let roadHeading = this.driverRouteBearing || this.driverHeading();
          if (this.driverLat() && this.driverLng()) {
            const calc = Math.round(this.calculateBearing(this.driverLat(), this.driverLng(), roadLat, roadLng));
            if (!isNaN(calc) && (Math.abs(roadLat - this.driverLat()) > 0.00003 || Math.abs(roadLng - this.driverLng()) > 0.00003)) {
              roadHeading = calc;
            }
          }

          // Instantly update driver position on the road with 0ms delay!
          this.hasGpsFix.set(true);
          this.driverLat.set(roadLat);
          this.driverLng.set(roadLng);
          this.driverHeading.set(roadHeading);
          this.updateDriverLocationWebGL(roadLng, roadLat, roadHeading);

          if (this.map && !this.isUserPanned()) {
            this.map.easeTo({
              center: [roadLng, roadLat],
              pitch: 60,
              bearing: roadHeading,
              zoom: 16.5,
              padding: this.getVisibleMapPadding(),
              duration: 450,
              easing: (t: number) => 1 - Math.pow(1 - t, 3),
              essential: true,
            });
          }

          this.driverService.updateDriverLocation({
            lat: roadLat,
            lng: roadLng,
            heading: roadHeading,
            ride_id: Number(String(dTrip.id).replace(/\D/g, '')),
          });

          if (!isWalkInOrWayside && hasTargetCoord) {
            const color = isEnRoute ? '#2563eb' : '#059669';
            // Asynchronously draw the real road curve without blocking the immediate UI update
            this.drawRoadRouteLine(roadLng, roadLat, targetLng, targetLat, color, true);
          } else {
            // Unpinned destination: no routeline! Just like a terminal walk-in ride
            this.clearDestinationPin();
            this.clearReturnRoutePolyline();
          }
          return;
        }

        // 3. FREE ROAM — no active trip, not returning: use raw tap coordinates, NO road snapping!
        // The vehicle can be placed anywhere the driver taps (open field, parking area, etc.)
        let newHeading = this.driverHeading();
        if (this.driverLat() && this.driverLng()) {
          const calc = Math.round(this.calculateBearing(this.driverLat(), this.driverLng(), rawLat, rawLng));
          if (!isNaN(calc) && (Math.abs(rawLat - this.driverLat()) > 0.00003 || Math.abs(rawLng - this.driverLng()) > 0.00003)) {
            newHeading = calc;
          }
        }

        this.hasGpsFix.set(true);
        this.driverLat.set(rawLat);
        this.driverLng.set(rawLng);
        this.driverHeading.set(newHeading);
        this.updateDriverLocationWebGL(rawLng, rawLat, newHeading);

        if (this.map && !this.isUserPanned()) {
          const is3D = this.mapControlState() === 3;
          this.map.easeTo({
            center: [rawLng, rawLat],
            pitch: is3D ? 60 : 0,
            bearing: is3D ? newHeading : 0,
            zoom: 16.5,
            padding: this.getVisibleMapPadding(),
            duration: 450,
            easing: (t: number) => 1 - Math.pow(1 - t, 3),
            essential: true,
          });
        }

        // Broadcast raw overridden location via Reverb to all connected devices/sessions
        this.driverService.updateDriverLocation({
          lat: rawLat,
          lng: rawLng,
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

          if (isPassenger && pRide && ['accepted', 'en_route', 'arrived', 'in_transit'].includes(String(pRide.status || '').toLowerCase().trim())) {
            const centerLng = Number(pRide.driver_lng || pRide.driver?.lng || pRide.pickup_lng || this.driverLng());
            const centerLat = Number(pRide.driver_lat || pRide.driver?.lat || pRide.pickup_lat || this.driverLat());
            const initBearing = Number(pRide.driver_heading || pRide.driver?.heading || 0);
            mapInstance.jumpTo({
              center: [centerLng, centerLat],
              padding: pad,
              pitch: 60,
              bearing: initBearing,
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

      // ONLY set isUserPanned when the USER physically touches, drags, or zooms the map
      const markUserInteracting = (e: any) => {
        if (e && e.originalEvent) {
          this.isUserPanned.set(true);
        }
      };
      mapInstance.on('dragstart', markUserInteracting);
      mapInstance.on('zoomstart', markUserInteracting);
      mapInstance.on('rotatestart', markUserInteracting);
      mapInstance.on('pitchstart', markUserInteracting);

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

      // 2. Animated Location Puck (Passenger: Blue Dot & Cone Beam; Driver: 3D Tricycle)
      const isOnline = this.driverService.isOnline();

      if (!isPassenger) {
        if (!this.driverMarker) {
          // Use current GPS position if available; fallback to terminal/signal coords
          const initLng = this.markerCurrentLngLat ? this.markerCurrentLngLat[0] : this.driverLng();
          const initLat = this.markerCurrentLngLat ? this.markerCurrentLngLat[1] : this.driverLat();
          const driverEl = document.createElement('div');
          driverEl.className = `driver-live-map-marker-container ${isOnline ? 'is-online' : 'is-offline'}`;
          driverEl.innerHTML = `
            <div class="driver-marker-ping"></div>
            <div class="driver-tricycle-puck" id="driver-tricycle-puck-element" style="transform: rotate(${this.driverHeading()}deg)">
              <img src="assets/images/tricycle-marker.png" alt="Tricycle" class="tricycle-puck-img" />
            </div>
          `;

          this.driverMarker = new maplibregl.Marker({
            element: driverEl,
            anchor: 'center',
            offset: [0, 0],
            pitchAlignment: 'map',
            rotationAlignment: 'map',
          })
            .setLngLat([initLng, initLat])
            .addTo(mapInstance);
          // Seed cumulative heading so the first update delta is 0
          this.coneCumulativeHeading = this.driverHeading();
          // Sync markerCurrentLngLat so animations start from correct position
          this.markerCurrentLngLat = [initLng, initLat];
        }
      } else {
        // PASSENGER: Own location puck (Blue Dot without cone)
        if (!this.passengerMarker) {
          const initLng = this.passMarkerCurrentLngLat ? this.passMarkerCurrentLngLat[0] : this.driverLng();
          const initLat = this.passMarkerCurrentLngLat ? this.passMarkerCurrentLngLat[1] : this.driverLat();
          const passEl = document.createElement('div');
          passEl.className = 'driver-live-map-marker-container is-passenger-puck';
          passEl.innerHTML = `
            <div class="driver-marker-ping"></div>
            <div class="driver-center-dot"></div>
          `;

          this.passengerMarker = new maplibregl.Marker({
            element: passEl,
            anchor: 'center',
            offset: [0, 0],
            pitchAlignment: 'viewport',
            rotationAlignment: 'viewport',
          })
            .setLngLat([initLng, initLat])
            .addTo(mapInstance);
          this.passMarkerCurrentLngLat = [initLng, initLat];
        }

        // Check if passenger already has an active trip and sync the driver's tricycle marker
        // Also hide own location pin if already on active trip at init
        this.syncPassengerDriverTricycleMarker();
      }

      // If we have a real GPS fix already, immediately center the camera
      if (this.hasGpsFix() && !this.isUserPanned()) {
        const curLng = this.driverLng();
        const curLat = this.driverLat();
        const is3D = this.mapControlState() === 3;
        try {
          mapInstance.easeTo({
            center: [curLng, curLat],
            pitch: is3D ? 60 : 0,
            bearing: is3D ? this.driverHeading() : 0,
            zoom: 16.5,
            padding: this.getVisibleMapPadding(),
            duration: 500,
            essential: true,
          });
        } catch { }
      }
    } catch (err) {
      console.warn('Map marker add notice:', err);
    }
  }

  /**
   * For passengers on an active trip (accepted, en_route, arrived, in_transit):
   * Ensures the driver's location is rendered as the 3D Tricycle Icon (not blue circle with cone).
   * Also hides/shows the passenger's own location pin (passengerMarker) so it never overlaps
   * the route or causes the camera to follow the wrong marker.
   * Automatically cleans up the marker when trip ends or is cancelled.
   */
  private syncPassengerDriverTricycleMarker(): void {
    if (!this.map || !this.authService.isPassenger()) return;
    const pRide = this.activePassengerRide();
    const status = String(pRide?.status || '').toLowerCase().trim();
    const hasActiveTrip = !!pRide && ['accepted', 'en_route', 'arrived', 'in_transit'].includes(status);

    if (hasActiveTrip) {
      if (this.mapControlState() !== 3) {
        this.mapControlState.set(3);
      }

      // Hide passenger's own location pin — they are in the tricycle, no need to show their GPS dot
      // This also prevents the camera from being pulled to the passenger GPS position during the trip
      if (this.passengerMarker) {
        const el = this.passengerMarker.getElement();
        if (el) el.style.display = 'none';
      }

      const drvLat = Number(
        pRide.driver_lat || 
        pRide.driver?.lat || 
        this.TERMINAL_LAT
      );
      const drvLng = Number(
        pRide.driver_lng || 
        pRide.driver?.lng || 
        this.TERMINAL_LNG
      );

      // Determine heading: use live heading, or calculate from driver position to target along path
      let drvHeading = Number(
        pRide.driver_heading !== undefined && pRide.driver_heading !== null && pRide.driver_heading !== 0
          ? pRide.driver_heading 
          : (pRide.driver?.heading ? pRide.driver.heading : 0)
      );

      if (!drvHeading) {
        const targetLat = status === 'in_transit'
          ? Number(pRide.destination_lat || pRide.dest_lat)
          : Number(pRide.pickup_lat);
        const targetLng = status === 'in_transit'
          ? Number(pRide.destination_lng || pRide.dest_lng)
          : Number(pRide.pickup_lng);

        if (targetLat && targetLng && (drvLat !== targetLat || drvLng !== targetLng)) {
          const calc = Math.round(this.calculateBearing(drvLat, drvLng, targetLat, targetLng));
          if (!isNaN(calc)) {
            drvHeading = calc;
          }
        }
      }

      if (!this.driverMarker) {
        const driverEl = document.createElement('div');
        driverEl.className = 'driver-live-map-marker-container is-online';
        driverEl.innerHTML = `
          <div class="driver-marker-ping"></div>
          <div class="driver-tricycle-puck" id="driver-tricycle-puck-element" style="transform: rotate(${drvHeading}deg)">
            <img src="assets/images/tricycle-marker.png" alt="Tricycle" class="tricycle-puck-img" />
          </div>
        `;
        this.driverMarker = new maplibregl.Marker({
          element: driverEl,
          anchor: 'center',
          offset: [0, 0],
          pitchAlignment: 'map',
          rotationAlignment: 'map',
        })
          .setLngLat([drvLng, drvLat])
          .addTo(this.map);
        // Seed cumulative heading so the first update delta is 0
        this.coneCumulativeHeading = drvHeading;
      } else {
        // Ensure element has tricycle icon (not passenger cone)
        const tricycleImg = this.driverMarker.getElement()?.querySelector('.tricycle-puck-img');
        if (!tricycleImg) {
          const el = this.driverMarker.getElement();
          if (el) {
            el.className = 'driver-live-map-marker-container is-online';
            el.innerHTML = `
              <div class="driver-marker-ping"></div>
              <div class="driver-tricycle-puck" id="driver-tricycle-puck-element" style="transform: rotate(${drvHeading}deg)">
                <img src="assets/images/tricycle-marker.png" alt="Tricycle" class="tricycle-puck-img" />
              </div>
            `;
          }
        }
        this.driverMarker.setLngLat([drvLng, drvLat]);
      }
      this.updateDriverHeadingCone(drvHeading);
    } else {
      // Trip ended or cancelled: remove driver's tricycle marker from passenger's map
      if (this.driverMarker) {
        try {
          this.driverMarker.remove();
        } catch { }
        this.driverMarker = null;
      }
      // Re-show the passenger's own location pin (they are back at their drop-off/current location)
      if (this.passengerMarker) {
        const el = this.passengerMarker.getElement();
        if (el) el.style.display = '';
      }
      if (this.mapControlState() === 3) {
        this.mapControlState.set(2);
      }
    }
  }

  private updateDriverHeadingCone(heading: number): void {
    // --- Shortest-path bearing update ---
    // Instead of always setting raw 0-360 degrees (which causes the browser CSS transition
    // to spin the long way when crossing the 0/360 boundary), we maintain a cumulative
    // unwrapped heading that only ever moves by the shortest angular delta (≤180°).
    // e.g. going from 350° to 10° adds +20 to the cumulative value (not -340).
    const normalizedNew = ((heading % 360) + 360) % 360;
    const normalizedCur = ((this.coneCumulativeHeading % 360) + 360) % 360;
    let delta = normalizedNew - normalizedCur;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    this.coneCumulativeHeading += delta;

    const cumDeg = this.coneCumulativeHeading;

    const tricycleEl = this.driverMarker?.getElement()?.querySelector('#driver-tricycle-puck-element') ||
      document.getElementById('driver-tricycle-puck-element');
    if (tricycleEl) {
      (tricycleEl as HTMLElement).style.transform = `rotate(${cumDeg}deg)`;
    }

    const coneEl = document.getElementById('driver-cone-beam-element');
    if (coneEl) {
      coneEl.style.transform = `rotate(${cumDeg}deg)`;
    }
  }

  private updateDriverMarkerStatus(isOnline: boolean): void {
    const markerEl = document.querySelector('.driver-live-map-marker-container');
    if (markerEl) {
      if (isOnline) {
        markerEl.classList.add('is-online');
        markerEl.classList.remove('is-offline');
      } else {
        markerEl.classList.add('is-offline');
        markerEl.classList.remove('is-online');
      }
    }
  }

  private updateDriverLocationWebGL(lng: number, lat: number, heading: number): void {
    this.animateDriverMarkerTo(lng, lat, heading, 400);
  }

  private animateDriverMarkerTo(targetLng: number, targetLat: number, targetHeading: number, duration = 450): void {
    // Always update the heading cone regardless of marker state
    this.updateDriverHeadingCone(targetHeading);

    // Always track our target position so we can sync once marker is ready
    const nextLngLat: [number, number] = [targetLng, targetLat];

    if (!this.driverMarker) {
      this.markerCurrentLngLat = nextLngLat;
      if (this.map) {
        try {
          const isOnline = this.driverService.isOnline();
          const driverEl = document.createElement('div');
          driverEl.className = `driver-live-map-marker-container ${isOnline ? 'is-online' : 'is-offline'}`;
          driverEl.innerHTML = `
            <div class="driver-marker-ping"></div>
            <div class="driver-tricycle-puck" id="driver-tricycle-puck-element" style="transform: rotate(${targetHeading}deg)">
              <img src="assets/images/tricycle-marker.png" alt="Tricycle" class="tricycle-puck-img" />
            </div>
          `;
          this.driverMarker = new maplibregl.Marker({
            element: driverEl,
            anchor: 'center',
            offset: [0, 0],
            pitchAlignment: 'map',
            rotationAlignment: 'map',
          })
            .setLngLat(nextLngLat)
            .addTo(this.map);
          this.coneCumulativeHeading = targetHeading;
        } catch (e) {
          console.warn('Driver marker create notice:', e);
          this.driverMarker = null;
        }
      }
      return;
    }

    if (!this.markerCurrentLngLat) {
      this.markerCurrentLngLat = nextLngLat;
      this.driverMarker.setLngLat(nextLngLat);
      return;
    }

    const cur = this.markerCurrentLngLat;
    if (Math.abs(cur[0] - targetLng) < 0.000001 && Math.abs(cur[1] - targetLat) < 0.000001) {
      return;
    }

    // Newest target always wins: if a tween is already gliding, simply re-target it
    // (picks up from the current interpolated value) instead of canceling + restarting,
    // which eliminates rubber-banding on rapid consecutive GPS ticks.
    this.driverTweenTarget = nextLngLat;
    if (this.markerAnimRafId !== null) {
      return;
    }

    const startPoint: [number, number] = [cur[0], cur[1]];
    let from: [number, number] = startPoint;
    let to: [number, number] = nextLngLat;
    let t0 = performance.now();

    const step = (currentTime: number) => {
      const target = this.driverTweenTarget;
      if (!target) {
        this.markerAnimRafId = null;
        return;
      }

      // A fresher fix arrived mid-flight → glide from the current interpolated value
      if (target[0] !== to[0] || target[1] !== to[1]) {
        from = this.markerCurrentLngLat ? [this.markerCurrentLngLat[0], this.markerCurrentLngLat[1]] : [to[0], to[1]];
        to = [target[0], target[1]];
        t0 = currentTime;
      }

      const progress = Math.min((currentTime - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);

      const currentLng = from[0] + (to[0] - from[0]) * ease;
      const currentLat = from[1] + (to[1] - from[1]) * ease;
      this.markerCurrentLngLat = [currentLng, currentLat];

      if (this.driverMarker) {
        this.driverMarker.setLngLat([currentLng, currentLat]);
      }

      if (progress < 1) {
        this.markerAnimRafId = requestAnimationFrame(step);
      } else {
        this.markerCurrentLngLat = to;
        this.driverTweenTarget = null;
        this.markerAnimRafId = null;
      }
    };

    this.markerAnimRafId = requestAnimationFrame(step);
  }

  private animatePassengerMarkerTo(targetLng: number, targetLat: number, duration = 450): void {
    const nextLngLat: [number, number] = [targetLng, targetLat];

    if (!this.passengerMarker) {
      this.passMarkerCurrentLngLat = nextLngLat;
      if (this.map && this.authService.isPassenger()) {
        try {
          const passEl = document.createElement('div');
          passEl.className = 'driver-live-map-marker-container is-passenger-puck';
          passEl.innerHTML = `
            <div class="driver-marker-ping"></div>
            <div class="driver-center-dot"></div>
          `;
          this.passengerMarker = new maplibregl.Marker({
            element: passEl,
            anchor: 'center',
            offset: [0, 0],
            pitchAlignment: 'viewport',
            rotationAlignment: 'viewport',
          })
            .setLngLat(nextLngLat)
            .addTo(this.map);
        } catch (e) {
          console.warn('Passenger marker create notice:', e);
          this.passengerMarker = null;
        }
      }
      return;
    }

    if (!this.passMarkerCurrentLngLat) {
      this.passMarkerCurrentLngLat = nextLngLat;
      this.passengerMarker.setLngLat(nextLngLat);
      return;
    }

    if (!this.passMarkerCurrentLngLat) {
      this.passMarkerCurrentLngLat = [this.driverLng(), this.driverLat()];
    }

    const startLng = this.passMarkerCurrentLngLat[0];
    const startLat = this.passMarkerCurrentLngLat[1];
    const startTime = performance.now();

    if (this.passMarkerAnimRafId !== null) {
      cancelAnimationFrame(this.passMarkerAnimRafId);
      this.passMarkerAnimRafId = null;
    }

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);

      const currentLng = startLng + (targetLng - startLng) * ease;
      const currentLat = startLat + (targetLat - startLat) * ease;
      this.passMarkerCurrentLngLat = [currentLng, currentLat];

      if (this.passengerMarker) {
        this.passengerMarker.setLngLat([currentLng, currentLat]);
      }

      if (progress < 1) {
        this.passMarkerAnimRafId = requestAnimationFrame(animate);
      } else {
        this.passMarkerAnimRafId = null;
        this.passMarkerCurrentLngLat = [targetLng, targetLat];
      }
    };

    this.passMarkerAnimRafId = requestAnimationFrame(animate);
  }

  private smoothCameraFollow(lng: number, lat: number, bearing = 0, pitch = 0, duration = 600): void {
    if (!this.map || this.isUserPanned()) return;

    const now = Date.now();
    const center = this.map.getCenter();
    const dist = this.calculateDistanceMeters(center.lat, center.lng, lat, lng);
    const sinceLast = now - this.gpsLastCamFollowAt;

    // Avoid redundant eases: skip camera work when already centered on a near-identical spot.
    // Coarse fixes (cell/Wi-Fi hops) get a slower, wider cadence so the view doesn't jitter.
    if (this.gpsFixIsCoarse) {
      if (dist < 12 && sinceLast < 2500) return;
    } else if (dist < 0.7 && sinceLast < 2000) {
      return;
    }
    this.gpsLastCamFollowAt = now;

    // Honor the user's selected viewport: 2D stays north-up & flat, 3D keeps route/device heading
    const is3D = this.mapControlState() === 3;
    const targetBearing = is3D ? bearing : 0;
    const targetPitch = is3D ? pitch : 0;

    this.map.easeTo({
      center: [lng, lat],
      bearing: targetBearing,
      pitch: targetPitch,
      padding: this.getVisibleMapPadding(),
      duration: duration,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      essential: true,
    });
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

  // --- 4. GPS TRACKING (Event-driven watch, degrade/re-escalate, lifecycle-aware) ---
  private get gpsWatchOptions(): PositionOptions {
    return {
      // High accuracy for live road movement; collapses to network/cell fix when GPS is blocked
      enableHighAccuracy: this.gpsUseHighAccuracy,
      // Never accept stale cache for fresh movement updates
      maximumAge: this.gpsUseHighAccuracy ? 0 : 5000,
      // Long timeout: a watch must only report failure when the device truly has no fix,
      // never die because a tricycle GPS is slow to re-acquire under trees / urban canyons.
      timeout: 60000,
    };
  }

  private startRealGpsTracking(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.isGpsFetching.set(false);
      return;
    }
    if (this.gpsWatchId !== null) {
      return;
    }

    this.isGpsFetching.set(true);
    this.registerGpsLifecycleListeners();

    // 1. Seed instantly with a fresh one-shot fix so the marker never waits for the watcher
    this.requestFreshGpsFix(true);

    // 2. Subscribe the single authoritative, event-driven watcher
    this.subscribeGpsWatch();

    // 3. Stale-fix supervisor: pokes once (a single getCurrentPosition) whenever no event
    //    has arrived, instead of hammering the GPS with a fixed-interval poller.
    this.scheduleGpsWakeGuard();
  }

  private subscribeGpsWatch(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    if (this.gpsWatchId !== null) {
      try { navigator.geolocation.clearWatch(this.gpsWatchId); } catch { }
      this.gpsWatchId = null;
    }

    this.isGpsFetching.set(true);
    try {
      this.gpsWatchId = navigator.geolocation.watchPosition(
        (pos) => this.onGpsFixAcquired(pos),
        (err) => this.onGpsWatchError(err),
        this.gpsWatchOptions
      );
    } catch (e) {
      console.warn('Could not initialize GPS watcher:', e);
      this.gpsWatchId = null;
      this.isGpsFetching.set(false);
    }
  }

  private onGpsFixAcquired(pos: GeolocationPosition): void {
    if (!pos || !pos.coords) return;
    this.gpsLastFixAt = Date.now();
    this.gpsRetryCount = 0;
    this.isGpsFetching.set(false);

    // Running on degraded network fix? Reload the hardware GPS once it has had time to recover.
    if (!this.gpsUseHighAccuracy) {
      this.scheduleGpsAccuracyEscalation();
    }

    this.handleGpsUpdate(pos);
  }

  private onGpsWatchError(err: GeolocationPositionError): void {
    const code = err?.code;
    this.isGpsFetching.set(false);

    // PERMISSION_DENIED: the user blocked geolocation — stop burning battery retrying
    if (code === 1) {
      this.stopGpsWatchOnly();
      return;
    }

    // TIMEOUT / POSITION_UNAVAILABLE: GPS signal lost while moving. Degrade to the
    // network/cell fix so the marker keeps moving instead of freezing, then re-escalate
    // once hardware GPS recovers.
    if (this.gpsUseHighAccuracy) {
      this.gpsUseHighAccuracy = false;
      this.scheduleGpsRetry(1200);
    } else {
      this.scheduleGpsRetry(4000);
    }
  }

  private scheduleGpsRetry(delay: number): void {
    if (this.gpsRetryTimeout !== null) return;

    if (this.gpsRetryCount >= 8) {
      // Give the radio stack a real breather, then allow one consumer-friendly retry
      this.stopGpsWatchOnly();
      this.gpsRetryTimeout = setTimeout(() => {
        this.gpsRetryTimeout = null;
        this.gpsRetryCount = 0;
        this.subscribeGpsWatch();
      }, 45000);
      return;
    }

    this.gpsRetryCount++;
    this.gpsRetryTimeout = setTimeout(() => {
      this.gpsRetryTimeout = null;
      this.subscribeGpsWatch();
    }, delay);
  }

  private scheduleGpsAccuracyEscalation(): void {
    if (this.gpsEscalationTimeout !== null) return;
    this.gpsEscalationTimeout = setTimeout(() => {
      this.gpsEscalationTimeout = null;
      if (!this.gpsUseHighAccuracy) {
        this.gpsUseHighAccuracy = true;
        this.subscribeGpsWatch();
      }
    }, 25000);
  }

  private scheduleGpsWakeGuard(): void {
    if (this.gpsWakeTimeout !== null) clearTimeout(this.gpsWakeTimeout);
    this.gpsWakeTimeout = setTimeout(() => {
      this.gpsWakeTimeout = null;
      if (typeof document !== 'undefined' && document.hidden) {
        this.scheduleGpsWakeGuard();
        return;
      }
      if (this.gpsWatchId !== null && Date.now() - this.gpsLastFixAt > 12000) {
        this.requestFreshGpsFix();
      }
      this.scheduleGpsWakeGuard();
    }, 12000);
  }

  private requestFreshGpsFix(initial = false): void {
    if (typeof navigator === 'undefined' || typeof navigator.geolocation === 'undefined') return;
    if (initial) this.isGpsFetching.set(true);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => this.onGpsFixAcquired(pos),
        () => { this.isGpsFetching.set(false); },
        {
          enableHighAccuracy: this.gpsUseHighAccuracy,
          maximumAge: initial ? 0 : 5000,
          timeout: 8000,
        }
      );
    } catch { }
  }

  private onGpsVisibilityChanged(): void {
    if (typeof document !== 'undefined' && document.hidden) {
      this.stopGpsWatchOnly();
    } else {
      this.resumeGpsTracking();
    }
  }

  private onGpsPageShow(): void {
    if (typeof document === 'undefined' || !document.hidden) {
      this.resumeGpsTracking();
    }
  }

  private onGpsOnline(): void {
    if (typeof document === 'undefined' || !document.hidden) {
      this.resumeGpsTracking(true);
    }
  }

  private resumeGpsTracking(resetAccuracy = false): void {
    if (resetAccuracy) this.gpsUseHighAccuracy = true;
    if (this.gpsWatchId === null) {
      this.startRealGpsTracking();
      return;
    }
    this.requestFreshGpsFix();
  }

  private registerGpsLifecycleListeners(): void {
    if (this.gpsListenersRegistered) return;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.boundVisibilityHandler);
      window.addEventListener('pageshow', this.boundPageShowHandler);
      window.addEventListener('online', this.boundOnlineHandler);
      this.gpsListenersRegistered = true;
    }
  }

  private unregisterGpsLifecycleListeners(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
      window.removeEventListener('pageshow', this.boundPageShowHandler);
      window.removeEventListener('online', this.boundOnlineHandler);
      this.gpsListenersRegistered = false;
    }
  }

  private stopGpsWatchOnly(): void {
    if (this.gpsWatchId !== null) {
      try { navigator.geolocation.clearWatch(this.gpsWatchId); } catch { }
      this.gpsWatchId = null;
    }
    if (this.gpsRetryTimeout !== null) { clearTimeout(this.gpsRetryTimeout); this.gpsRetryTimeout = null; }
    if (this.gpsEscalationTimeout !== null) { clearTimeout(this.gpsEscalationTimeout); this.gpsEscalationTimeout = null; }
    this.isGpsFetching.set(false);
  }

  private stopGpsTracking(): void {
    this.stopGpsWatchOnly();
    if (this.gpsWakeTimeout !== null) { clearTimeout(this.gpsWakeTimeout); this.gpsWakeTimeout = null; }
    this.unregisterGpsLifecycleListeners();
    this.lastProcessedGpsCoords = null;
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
    const bridgeCoord: [number, number] = [120.92600, 15.42400];
    const junctionCorridor: [number, number] = [120.92600, 15.42955];
    const terminalJunction: [number, number] = [120.92240, 15.42955];

    if (fromLat < 15.424) {
      route.push([120.92600, Math.min(fromLat, 15.42000)]);
      route.push(bridgeCoord);
      route.push(junctionCorridor);
      route.push(terminalJunction);
      route.push([toLng, 15.42955]);
      route.push([toLng, toLat]);
    } else {
      // Connect along the Santa Rosa Fort Magsaysay arterial corridor
      route.push([fromLng, 15.42955]);
      route.push([toLng, 15.42955]);
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

    this.currentRouteDestination = [this.TERMINAL_LNG, this.TERMINAL_LAT];
    this.currentRouteColor = '#2563eb';
    this.currentActiveRouteCoordinates = coordinates;
    this.applyRouteLineCoordinates(coordinates);

    // Orient vehicle and camera along the actual road direction ahead
    if (this.driverService.isReturning() && coordinates.length >= 2) {
      const [roadLng, roadLat] = coordinates[0];
      const [nextLng, nextLat] = coordinates[1];
      const roadBearing = Math.round(this.calculateBearing(driverLat, driverLng, nextLat, nextLng));
      if (!isNaN(roadBearing)) {
        this.driverHeading.set(roadBearing);
        this.driverRouteBearing = roadBearing;
        this.animateDriverMarkerTo(roadLng, roadLat, roadBearing, 450);

        if (this.map && !this.isUserPanned()) {
          this.smoothCameraFollow(roadLng, roadLat, roadBearing, 60, 600);
        }
      }
    }
  }

  private clearReturnRoutePolyline(): void {
    if (this.routeBetweenAbortController) {
      try {
        this.routeBetweenAbortController.abort();
      } catch { }
      this.routeBetweenAbortController = null;
    }
    this.currentActiveRouteCoordinates = [];
    this.currentRouteDestination = null;
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

    this.currentRouteDestination = [this.TERMINAL_LNG, this.TERMINAL_LAT];
    this.currentRouteColor = '#2563eb';

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
    this.driverRouteBearing = roadHeading;

    try {
      localStorage.setItem('srh_last_driver_coords', JSON.stringify({
        lat: roadLat,
        lng: roadLng,
        heading: roadHeading,
      }));
    } catch { }

    this.animateDriverMarkerTo(roadLng, roadLat, roadHeading, 450);
    this.applyRouteLineCoordinates(coordinates);

    if (this.map && !this.isUserPanned()) {
      this.smoothCameraFollow(roadLng, roadLat, roadHeading, 60, 600);
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

  private findNearestPointOnRoute(
    lng: number,
    lat: number,
    coords: [number, number][]
  ): { point: [number, number]; segIndex: number; distMeters: number } {
    let bestDistSq = Infinity;
    let bestPoint: [number, number] = [lng, lat];
    let bestSegIndex = 0;

    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      if (Array.isArray(a) && Array.isArray(b) && a.length >= 2 && b.length >= 2) {
        const proj = this.projectPointOnSegment(lng, lat, a, b);
        if (proj.distSq < bestDistSq) {
          bestDistSq = proj.distSq;
          bestPoint = [proj.x, proj.y];
          bestSegIndex = i;
        }
      }
    }

    const distMeters = Math.sqrt(bestDistSq);
    return { point: bestPoint, segIndex: bestSegIndex, distMeters };
  }

  private handleGpsUpdate(pos: GeolocationPosition): void {
    if (!pos || !pos.coords) return;
    const rawLat = pos.coords.latitude;
    const rawLng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;
    const speed = pos.coords.speed;
    const heading = pos.coords.heading;

    // Degraded fixes still move the marker (never freeze during GPS dropouts); they only
    // get a wider jitter window so cell/Wi-Fi noise can't ping-pong the tricycle.
    this.gpsFixIsCoarse = accuracy !== null && accuracy !== undefined && accuracy > 600;
    const jitterWindow = this.gpsFixIsCoarse ? 1500 : 250;

    // Basic validity check
    if (isNaN(rawLat) || isNaN(rawLng) || rawLat === 0 || rawLng === 0) {
      return;
    }

    const now = Date.now();

    // Deadband: only skip micro-jitter (< 0.25m) received within the jitter window
    if (this.lastProcessedGpsCoords) {
      const distFromLast = this.calculateDistanceMeters(
        this.lastProcessedGpsCoords.lat,
        this.lastProcessedGpsCoords.lng,
        rawLat,
        rawLng
      );
      if (distFromLast < 0.25 && (now - this.lastProcessedGpsCoords.time) < jitterWindow) {
        return;
      }
    }

    this.lastProcessedGpsCoords = { lat: rawLat, lng: rawLng, time: now };
    this.hasGpsFix.set(true);

    this.processLiveLocation(rawLng, rawLat, heading, speed);
  }

  private processLiveLocation(
    rawLng: number,
    rawLat: number,
    reportedHeading: number | null,
    speed: number | null
  ): void {
    const isPassenger = this.authService.isPassenger();
    const pRide = this.activePassengerRide();
    const dTrip = !isPassenger ? this.driverService.activeTrip() : null;
    const isReturning = !isPassenger && this.driverService.isReturning();
    const isPassengerOnActiveTrip = isPassenger && !!pRide && ['accepted', 'en_route', 'arrived', 'in_transit'].includes(String(pRide?.status || '').toLowerCase().trim());
    const isDriverOnActiveTrip = !isPassenger && !!dTrip && ['accepted', 'en_route', 'arrived', 'in_transit'].includes(String(dTrip?.status || '').toLowerCase().trim());

    // 1. If PASSENGER is on an active trip:
    // Sync current location. If no recent live driver broadcast arrived (> 2.5s), use own physical GPS to glide tricycle
    if (isPassengerOnActiveTrip) {
      this.driverLat.set(rawLat);
      this.driverLng.set(rawLng);

      const lastB = this.lastDriverBroadcastTime || 0;
      if (Date.now() - lastB > 2500) {
        let drvHeading = this.passengerRouteBearing || this.driverHeading();
        if (reportedHeading !== null && reportedHeading !== undefined && !isNaN(reportedHeading) && (speed || 0) > 0.4) {
          drvHeading = Math.round(reportedHeading);
        } else if (this.driverLat() && this.driverLng()) {
          const calc = Math.round(this.calculateBearing(this.driverLat(), this.driverLng(), rawLat, rawLng));
          if (!isNaN(calc) && (Math.abs(rawLat - this.driverLat()) > 0.00003 || Math.abs(rawLng - this.driverLng()) > 0.00003)) {
            drvHeading = calc;
          }
        }
        this.driverHeading.set(drvHeading);

        if (!this.driverMarker) {
          this.syncPassengerDriverTricycleMarker();
        }
        this.animateDriverMarkerTo(rawLng, rawLat, drvHeading, 450);

        if (!this.isUserPanned()) {
          this.smoothCameraFollow(rawLng, rawLat, drvHeading, 60, 600);
        }
      }
      return;
    }

    // 2. Determine if there is an active navigation route destination
    let targetDestLng: number | null = null;
    let targetDestLat: number | null = null;
    let routeColor = '#2563eb';

    if (isReturning) {
      targetDestLng = this.TERMINAL_LNG;
      targetDestLat = this.TERMINAL_LAT;
      routeColor = '#2563eb';
    } else if (isDriverOnActiveTrip && dTrip) {
      const isEnRoute = dTrip.status === 'en_route';
      const anyTrip = dTrip as any;
      const tLng = isEnRoute
        ? Number(anyTrip.pickupLng || anyTrip.pickup_lng)
        : Number(anyTrip.dropoffLng || anyTrip.dropoff_lng || anyTrip.destinationLng || anyTrip.destination_lng);
      const tLat = isEnRoute
        ? Number(anyTrip.pickupLat || anyTrip.pickup_lat)
        : Number(anyTrip.dropoffLat || anyTrip.dropoff_lat || anyTrip.destinationLat || anyTrip.destination_lat);
      if (tLng && tLat && !isNaN(tLng) && !isNaN(tLat)) {
        targetDestLng = tLng;
        targetDestLat = tLat;
        routeColor = isEnRoute ? '#2563eb' : '#059669';
      }
    }

    const hasActiveRouteTarget = targetDestLng !== null && targetDestLat !== null;
    const hasExistingRouteCoords = this.currentActiveRouteCoordinates && this.currentActiveRouteCoordinates.length >= 2;

    // 3. IF THERE IS AN ACTIVE ROUTELINE:
    // During degraded (coarse) fixes skip road-matching entirely — network hops would
    // randomly snap the tricycle on/off the route and trigger phantom reroutes/412 glitches.
    if (hasActiveRouteTarget && hasExistingRouteCoords && !this.gpsFixIsCoarse) {
      const nearest = this.findNearestPointOnRoute(rawLng, rawLat, this.currentActiveRouteCoordinates);

      // On-route threshold: 35 meters
      if (nearest.distMeters <= 35) {
        // --- ON ROUTE ---
        const [roadLng, roadLat] = nearest.point;
        const coords = this.currentActiveRouteCoordinates;
        const segIdx = nearest.segIndex;

        // Determine road heading forward
        let roadHeading = this.driverRouteBearing || this.driverHeading();
        if (segIdx < coords.length - 1) {
          const [nextLng, nextLat] = coords[segIdx + 1];
          const calc = Math.round(this.calculateBearing(roadLat, roadLng, nextLat, nextLng));
          if (!isNaN(calc)) {
            roadHeading = calc;
          }
        }

        // Progressive Route Trimming: slice away passed segments so routeline begins from the vehicle
        const remainingCoords: [number, number][] = [
          [roadLng, roadLat],
          ...coords.slice(segIdx + 1),
        ];

        if (remainingCoords.length >= 2) {
          this.currentActiveRouteCoordinates = remainingCoords;
          this.applyRouteLineCoordinates(remainingCoords, routeColor);
        }

        this.driverLat.set(roadLat);
        this.driverLng.set(roadLng);
        this.driverHeading.set(roadHeading);
        this.driverRouteBearing = roadHeading;

        this.animateDriverMarkerTo(roadLng, roadLat, roadHeading, 450);

        if (!this.isUserPanned()) {
          this.smoothCameraFollow(roadLng, roadLat, roadHeading, 60, 600);
        }

        // Check terminal arrival if returning
        if (isReturning) {
          const distToTerminal = this.calculateDistanceMeters(roadLat, roadLng, this.TERMINAL_LAT, this.TERMINAL_LNG);
          this.isInsideTerminal.set(distToTerminal <= this.TERMINAL_RADIUS_METERS);
          if (distToTerminal <= this.TERMINAL_RADIUS_METERS) {
            this.handleTerminalArrival();
          }
        }

        this.broadcastDriverLocationThrottled(roadLat, roadLng, roadHeading, speed);
        return;
      } else {
        // --- OFF ROUTE / Went the other way around ---
        const [roadLng, roadLat] = this.snapToNearestRoad(rawLng, rawLat);
        const now = Date.now();

        let moveHeading = this.driverHeading();
        if (this.driverLat() && this.driverLng()) {
          const calc = Math.round(this.calculateBearing(this.driverLat(), this.driverLng(), roadLat, roadLng));
          if (!isNaN(calc) && (Math.abs(roadLat - this.driverLat()) > 0.00003 || Math.abs(roadLng - this.driverLng()) > 0.00003)) {
            moveHeading = calc;
          }
        }

        this.driverLat.set(roadLat);
        this.driverLng.set(roadLng);
        this.driverHeading.set(moveHeading);
        this.animateDriverMarkerTo(roadLng, roadLat, moveHeading, 450);

        if (!this.isUserPanned()) {
          this.smoothCameraFollow(roadLng, roadLat, moveHeading, 60, 600);
        }

        // Seamless dynamic rerouting from current road point to destination
        if (now - this.lastRerouteTime > 1500 && targetDestLng && targetDestLat) {
          this.lastRerouteTime = now;
          this.fetchAndApplyReroute(roadLng, roadLat, targetDestLng, targetDestLat, routeColor);
        }

        this.broadcastDriverLocationThrottled(roadLat, roadLng, moveHeading, speed);
        return;
      }
    }

    // 4. If active route target exists but no coordinates yet (initial draw)
    if (hasActiveRouteTarget && !hasExistingRouteCoords && targetDestLng && targetDestLat) {
      const [roadLng, roadLat] = this.snapToNearestRoad(rawLng, rawLat);
      this.driverLat.set(roadLat);
      this.driverLng.set(roadLng);
      this.drawRoadRouteLine(roadLng, roadLat, targetDestLng, targetDestLat, routeColor, true);
      this.broadcastDriverLocationThrottled(roadLat, roadLng, this.driverHeading(), speed);
      return;
    }

    // 5. FREE ROAM (No active routeline)
    let moveHeading = this.driverHeading();
    if (reportedHeading !== null && reportedHeading !== undefined && !isNaN(reportedHeading) && (speed || 0) > 0.4) {
      moveHeading = Math.round(reportedHeading);
    } else if (this.driverLat() && this.driverLng()) {
      const calc = Math.round(this.calculateBearing(this.driverLat(), this.driverLng(), rawLat, rawLng));
      if (!isNaN(calc) && (Math.abs(rawLat - this.driverLat()) > 0.00003 || Math.abs(rawLng - this.driverLng()) > 0.00003)) {
        moveHeading = calc;
      }
    }

    this.driverLat.set(rawLat);
    this.driverLng.set(rawLng);
    this.driverHeading.set(moveHeading);

    const distToTerminal = this.calculateDistanceMeters(rawLat, rawLng, this.TERMINAL_LAT, this.TERMINAL_LNG);
    this.isInsideTerminal.set(distToTerminal <= this.TERMINAL_RADIUS_METERS);

    if (isPassenger) {
      this.animatePassengerMarkerTo(rawLng, rawLat, 450);
    } else {
      this.animateDriverMarkerTo(rawLng, rawLat, moveHeading, 450);
      this.broadcastDriverLocationThrottled(rawLat, rawLng, moveHeading, speed);
    }

    if (!this.isUserPanned()) {
      const is3D = this.mapControlState() === 3;
      this.smoothCameraFollow(rawLng, rawLat, is3D ? moveHeading : 0, is3D ? 60 : 0, 600);
    }
  }

  private broadcastDriverLocationThrottled(lat: number, lng: number, heading: number, speed: number | null): void {
    if (this.authService.isPassenger()) return;
    const now = Date.now();
    if (now - this.lastBroadcastTime < 1000) return;
    this.lastBroadcastTime = now;

    const dTrip = this.driverService.activeTrip();
    const rideId = dTrip ? Number(String(dTrip.id).replace(/\D/g, '')) : undefined;

    this.driverService.updateDriverLocation({
      lat,
      lng,
      heading,
      speed: speed ?? undefined,
      ride_id: rideId,
    });
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
    // When driver is returning to terminal: keep view locked to road navigation, disable gyro drift
    if (this.driverService.isReturning()) {
      return;
    }

    // When there is an active route line on the map: strictly disable compass / gyro to keep road lock
    if (this.currentActiveRouteCoordinates && this.currentActiveRouteCoordinates.length >= 2) {
      return;
    }

    // When DRIVER has an ACTIVE TRIP with a routeline: tricycle bearing must stay locked to
    // the road/route direction. Device compass must NOT override it.
    if (!this.authService.isPassenger()) {
      const dTrip = this.driverService.activeTrip();
      if (dTrip && ['en_route', 'in_transit', 'arrived', 'accepted'].includes(String(dTrip.status || '').toLowerCase().trim())) {
        return;
      }
    }

    // When PASSENGER has an ACTIVE TRIP with a routeline: the tricycle bearing must stay
    // locked to the road direction. Device compass must NOT override it.
    if (this.authService.isPassenger()) {
      const pRide = this.activePassengerRide();
      const pStatus = String(pRide?.status || '').toLowerCase().trim();
      if (pRide && ['accepted', 'en_route', 'arrived', 'in_transit'].includes(pStatus)) {
        return;
      }
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

    const isPassenger = this.authService.isPassenger();
    const pRide = this.activePassengerRide();
    const hasActivePassengerTrip = isPassenger && !!pRide && ['en_route', 'accepted', 'arrived', 'in_transit'].includes(String(pRide?.status || '').toLowerCase().trim());
    const hasActiveTrip = hasActivePassengerTrip; // alias for backward compat below

    // 1. If location is overridden or GPS fix lost: ALWAYS fetch device GPS (target icon spins during fetch)
    if (this.isLocationOverridden() || !this.hasGpsFix()) {
      this.fetchAndRecenterGpsLocation();
      return;
    }

    // 2. If user only panned the map without overriding location:
    if (this.isUserPanned()) {
      this.isUserPanned.set(false);
      this.recenterToDriverOrTerminal();
      this.displayToast(hasActiveTrip ? 'Re-centered on Driver Tricycle' : 'Re-centered on Location');
      return;
    }

    const currentState = this.mapControlState();
    const targetLng = hasActiveTrip ? Number(pRide.driver_lng || pRide.driver?.lng || this.driverLng()) : this.driverLng();
    const targetLat = hasActiveTrip ? Number(pRide.driver_lat || pRide.driver?.lat || this.driverLat()) : this.driverLat();
    const targetHeading = hasActiveTrip ? Number(pRide.driver_heading || pRide.driver?.heading || 0) : this.driverHeading();

    if (currentState === 2) {
      const dTrip = this.driverService.activeTrip();
      const hasActiveDriverTrip = !isPassenger && !!dTrip && ['en_route', 'in_transit', 'arrived', 'accepted'].includes(String(dTrip?.status || '').toLowerCase().trim());
      const hasActiveTrip = hasActivePassengerTrip || hasActiveDriverTrip;

      // When on an active trip with a routeline, lock to route bearing (not device compass)
      // Only request compass permission in true free-roam 3D mode
      if (!hasActiveTrip) {
        if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
          (DeviceOrientationEvent as any).requestPermission().catch(() => {});
        }
      }

      // Use route bearing when on active trip, device heading otherwise
      const bearing3D = hasActiveDriverTrip && this.driverRouteBearing
        ? this.driverRouteBearing
        : (hasActivePassengerTrip ? this.passengerRouteBearing : targetHeading);

      // Switch from 2D Top View to 3D Tilted Route/Compass View
      this.isUserPanned.set(false);
      this.mapControlState.set(3);
      this.map.easeTo({
        center: [targetLng, targetLat],
        padding: this.getVisibleMapPadding(),
        zoom: 17.2,
        pitch: 60,
        bearing: bearing3D,
        duration: 650,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
        essential: true,
      });
      this.displayToast(hasActiveTrip ? '3D Route View (Facing Route Direction)' : '3D Compass View (Follows Device Orientation)');
    } else {
      // Switch from 3D Tilted View back to 2D Top View
      this.isUserPanned.set(false);
      this.mapControlState.set(2);
      this.map.easeTo({
        center: [targetLng, targetLat],
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
    this.isUserPanned.set(false);
    this.isLocationOverridden.set(false);
    this.startRealGpsTracking();

    if (!navigator.geolocation) {
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

        if (this.authService.isPassenger()) {
          this.animatePassengerMarkerTo(lng, lat, 400);
        } else {
          this.animateDriverMarkerTo(lng, lat, this.driverHeading(), 400);
          this.broadcastDriverLocationThrottled(lat, lng, this.driverHeading(), pos.coords.speed);
        }

        const isPassenger = this.authService.isPassenger();
        const pRide = this.activePassengerRide();
        const hasActiveTrip = isPassenger && !!pRide && ['en_route', 'accepted', 'arrived', 'in_transit'].includes(String(pRide?.status || '').toLowerCase().trim());

        if (hasActiveTrip) {
          this.recenterToDriverOrTerminal();
          this.displayToast('GPS restored • Centered on Driver');
          return;
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
        this.isLocationOverridden.set(false);
        this.recenterToDriverOrTerminal();
        this.displayToast('Re-centered on last known position');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  private recenterToDriverOrTerminal(): void {
    if (!this.map) return;
    const isPassenger = this.authService.isPassenger();
    const pRide = this.activePassengerRide();
    const hasActiveTrip = isPassenger && !!pRide && ['en_route', 'accepted', 'arrived', 'in_transit'].includes(String(pRide?.status || '').toLowerCase().trim());
    const targetLng = hasActiveTrip ? Number(pRide.driver_lng || pRide.driver?.lng || this.driverLng()) : this.driverLng();
    const targetLat = hasActiveTrip ? Number(pRide.driver_lat || pRide.driver?.lat || this.driverLat()) : this.driverLat();
    const is3D = this.mapControlState() === 3;
    const targetBearing = hasActiveTrip ? Number(pRide.driver_heading || pRide.driver?.heading || 0) : (is3D ? this.driverHeading() : 0);

    this.map.flyTo({
      center: [targetLng, targetLat],
      padding: this.getVisibleMapPadding(),
      zoom: is3D ? 17.2 : 16.6,
      pitch: is3D ? 60 : 0,
      bearing: targetBearing,
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
      const newFiles: Array<{ name: string; size: string; url?: string }> = [];
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        let fileUrl = '';
        try {
          fileUrl = URL.createObjectURL(file);
        } catch {
          fileUrl = '';
        }
        newFiles.push({
          name: file.name,
          size: (file.size / 1024).toFixed(1) + ' KB',
          url: fileUrl,
        });
      }
      this.appealFiles.set([...this.appealFiles(), ...newFiles]);
    }
  }

  previewAppealFile(file: { name: string; url?: string }): void {
    if (file.url) {
      this.attachmentViewer.open(file.name, file.url, 'ATTACHED APPEAL PROOF');
    }
  }

  previewSubmittedAttachment(att: { name: string; url?: string }): void {
    const url = att.url || `/api/attachments/appeal/${att.name}`;
    this.attachmentViewer.open(att.name, url, 'SUBMITTED APPEAL PROOF');
  }

  removeAppealFile(index: number, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
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
