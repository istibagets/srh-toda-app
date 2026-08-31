import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { Subject, of } from 'rxjs';
import { debounceTime, switchMap, tap, catchError, finalize } from 'rxjs/operators';
import { DriverProfile, QueueItem, DriverOnTrip, RideTrip } from '../models/driver.model';
import { AuthService } from './auth.service';
import { DashboardService } from './dashboard.service';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root',
})
export class DriverService {
  private authService = inject(AuthService);
  private dashboardService = inject(DashboardService);
  private notificationService = inject(NotificationService);

  // Terminal Center Coordinates (Santa Rosa Central TODA)
  readonly TERMINAL_LNG = 120.92240292427664;
  readonly TERMINAL_LAT = 15.429550175641715;
  readonly TERMINAL_RADIUS_METERS = 35;

  isQueueSorting = signal<boolean>(false);

  isDutySyncing = signal<boolean>(false);
  showDutyLoading = signal<boolean>(false);
  private dutyToggleSubject = new Subject<{ targetState: boolean; previousState: boolean }>();
  private dutyLoadingTimer: any = null;

  // 1. Reactive Signal for Driver Profile
  private driverSignal = signal<DriverProfile>({
    id: 0,
    name: 'Driver',
    bodyNumber: '',
    mtopNumber: '',
    todaAssociation: 'Santa Rosa Central TODA',
    avatarUrl: '',
    rating: 5.0,
    ratingCount: 0,
    complianceStatus: 'Approved',
    suspensionReason: null,
    appealStatus: 'None',
    appealMessage: null,
    appealAttachments: [],
    appealedAt: null,
    isOnline: false,
    queuePosition: null,
    totalQueueCount: 0,
    todayEarnings: 0,
    weeklyEarnings: 0,
    monthlyEarnings: 0,
    tripsTodayCount: 0,
    role: 'driver',
  });

  // 2. Reactive Signal for Active Terminal Queue
  private queueSignal = signal<QueueItem[]>([]);

  // 3. Reactive Signal for Drivers Currently On Trip
  private driversOnTripSignal = signal<DriverOnTrip[]>([]);

  // 4. Reactive Signal for Active Live Trip
  private activeTripSignal = signal<RideTrip | null>(null);

  // 5. Reactive Signal for Returning to Terminal State
  private isReturningSignal = signal<boolean>(false);

  // 6. Reactive Signal for Completed Trip History
  private tripHistorySignal = signal<RideTrip[]>([]);

  // 7. Admin Queue Unsaved Changes Tracker
  private originalQueueOrderSignal = signal<number[]>([]);
  private hasUnsavedQueueOrderSignal = signal<boolean>(false);

  // 8. Real-time broadcast sync trigger signal
  private syncTriggerSignal = signal<number>(0);

  // 9. Real-time peer driver live coordinate broadcast signal
  readonly locationBroadcast = signal<{
    driverId: number;
    lat: number;
    lng: number;
    heading?: number;
    speed?: number;
    rideId?: number;
    status?: string;
  } | null>(null);

  // 10. Real-time cross-client ride cancellation notification signal
  readonly rideCancelledNotice = signal<{ role: 'driver' | 'passenger'; message: string; timestamp: number } | null>(null);

  // Readonly Public Accessors
  driver = this.driverSignal.asReadonly();
  queue = this.queueSignal.asReadonly();
  driversOnTrip = this.driversOnTripSignal.asReadonly();
  activeTrip = this.activeTripSignal.asReadonly();
  isReturning = this.isReturningSignal.asReadonly();
  tripHistory = this.tripHistorySignal.asReadonly();
  syncTrigger = this.syncTriggerSignal.asReadonly();

  // Computed signals
  isOnline = computed(() => this.driverSignal().isOnline);
  queuePosition = computed(() => this.driverSignal().queuePosition);
  totalQueueCount = computed(() => this.driverSignal().totalQueueCount);
  todayEarnings = computed(() => this.driverSignal().todayEarnings);
  tripsTodayCount = computed(() => this.driverSignal().tripsTodayCount);
  complianceStatus = computed(() => this.driverSignal().complianceStatus);
  appealStatus = computed(() => this.driverSignal().appealStatus);
  hasUnsavedQueueOrder = computed(() => this.hasUnsavedQueueOrderSignal());
  isSuspended = computed(() => {
    const s = this.driverSignal().complianceStatus;
    return s === 'Suspended' || s === 'Removed' || s === 'Rejected';
  });

  private readonly ACTIVE_TRIP_KEY = 'srh_driver_active_trip';
  private readonly HISTORY_KEY = 'srh_driver_trip_history';
  private readonly RETURNING_KEY = 'srh_driver_is_returning';
  private readonly DRIVER_PROFILE_KEY = 'srh_driver_profile_state';
  private readonly QUEUE_CACHE_KEY = 'srh_driver_queue_cache';
  private lastToggleTimestamp = 0;
  private liveChannel: BroadcastChannel | null = null;

  constructor() {
    // Setup idempotent duty toggle pipeline (Instant 0ms Optimistic UI + Spam Protection)
    this.dutyToggleSubject.pipe(
      switchMap(({ targetState, previousState }) => {
        return this.dashboardService.toggleDriverDuty(targetState).pipe(
          tap({
            next: (res) => {
              if (res?.is_online !== undefined) {
                this.driverSignal.update((d) => ({
                  ...d,
                  isOnline: !!res.is_online,
                  queuePosition: res.queue_position ?? (res.is_online ? d.queuePosition : null),
                  totalQueueCount: res.total_queue_count ?? d.totalQueueCount,
                }));

                if (Array.isArray(res.active_queue)) {
                  this.syncFromDashboard({
                    driver: {
                      active_queue: res.active_queue,
                      total_queue_count: res.total_queue_count,
                      profile: { is_online: res.is_online, queue_position: res.queue_position },
                    },
                  });
                }
              }
              this.broadcastLiveUpdate();
            },
            error: (err) => {
              console.warn('Duty sync error:', err?.status);
              // Rollback if network request fails
              this.driverSignal.update((d) => ({ ...d, isOnline: previousState }));
              this.broadcastLiveUpdate();
            },
          }),
          catchError(() => of(null))
        );
      })
    ).subscribe();

    // Setup real-time inter-tab event listener for seamless multi-device/multi-window updates
    if (typeof window !== 'undefined') {
      try {
        if ('BroadcastChannel' in window) {
          this.liveChannel = new BroadcastChannel('srh_live_toda_channel');
          this.liveChannel.onmessage = (evt) => {
            if (evt.data?.type === 'QUEUE_UPDATED') {
              this.syncTriggerSignal.update((n) => n + 1);
            } else if (evt.data?.type === 'TRICYCLE_LOCATION_UPDATED') {
              this.handleLocationBroadcast(evt.data);
            } else if (evt.data?.type === 'RIDE_CANCELLED') {
              const currentUserId = this.authService.currentUser()?.id;
              const isPassenger = this.authService.isPassenger();
              const isDriver = this.authService.isDriver();

              if (isPassenger && (evt.data.passengerId === currentUserId || !evt.data.passengerId)) {
                this.rideCancelledNotice.set({
                  role: 'passenger',
                  message: '❌ Ride was cancelled.',
                  timestamp: Date.now()
                });
              } else if (isDriver && (evt.data.driverId === currentUserId || !evt.data.driverId)) {
                this.activeTripSignal.set(null);
                this.rideCancelledNotice.set({
                  role: 'driver',
                  message: '❌ Passenger cancelled the ride request.',
                  timestamp: Date.now()
                });
              }
              this.syncTriggerSignal.update((n) => n + 1);
            }
          };
        }
        window.addEventListener('storage', (e) => {
          if (e.key === 'srh_live_sync_pulse' || e.key === 'srh_ride_cancelled_pulse') {
            this.syncTriggerSignal.update((n) => n + 1);
          } else if (e.key === 'srh_live_driver_loc' && e.newValue) {
            try {
              const loc = JSON.parse(e.newValue);
              this.handleLocationBroadcast(loc);
            } catch {}
          }
        });
      } catch (e) {
        console.warn('Live broadcast listener note:', e);
      }
    }
    // Restore persisted active trip, returning state, history, online duty & queue from localStorage (0ms instant startup)
    try {
      const savedTrip = localStorage.getItem(this.ACTIVE_TRIP_KEY);
      if (savedTrip) {
        const parsedTrip: RideTrip = JSON.parse(savedTrip);
        this.activeTripSignal.set(parsedTrip);
      }
      const savedReturning = localStorage.getItem(this.RETURNING_KEY);
      if (savedReturning === 'true' && !savedTrip) {
        this.isReturningSignal.set(true);
      }
      const savedHistory = localStorage.getItem(this.HISTORY_KEY);
      if (savedHistory) {
        this.tripHistorySignal.set(JSON.parse(savedHistory));
      }
      const isPassenger = this.authService.isPassenger();
      const savedProfile = localStorage.getItem(this.DRIVER_PROFILE_KEY);
      if (savedProfile && !isPassenger) {
        const parsed = JSON.parse(savedProfile);
        this.driverSignal.update((d) => ({
          ...d,
          isOnline: !!parsed.isOnline,
          queuePosition: parsed.queuePosition ?? null,
          totalQueueCount: parsed.totalQueueCount ?? 0,
        }));
      } else if (isPassenger) {
        this.driverSignal.update((d) => ({
          ...d,
          isOnline: false,
          queuePosition: null,
          totalQueueCount: 0,
        }));
      }

      const savedQueue = localStorage.getItem(this.QUEUE_CACHE_KEY);
      if (savedQueue && !isPassenger) {
        const parsedQ: QueueItem[] = JSON.parse(savedQueue);
        const isRet = localStorage.getItem(this.RETURNING_KEY) === 'true';
        const hasActiveTrip = !!localStorage.getItem(this.ACTIVE_TRIP_KEY);
        const isOffline = !this.driverSignal().isOnline;
        if (isRet || hasActiveTrip || isOffline) {
          this.queueSignal.set(parsedQ.filter((item) => !item.isCurrentDriver));
        } else {
          this.queueSignal.set(parsedQ);
        }
      } else if (isPassenger) {
        this.queueSignal.set([]);
      }
    } catch (e) {
      console.warn('Failed to parse persisted driver trip state:', e);
    }

    // Sync current user profile info from AuthService
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.driverSignal.update((d) => {
          const profileMtop = user.driver_profile?.mtop_number;
          const finalMtop = (profileMtop && profileMtop !== 'PENDING' && profileMtop !== 'ADMIN')
            ? String(profileMtop).replace(/^MTOP-?/i, '').trim()
            : (d.mtopNumber && d.mtopNumber !== '22' ? d.mtopNumber : '128491');

          return {
            ...d,
            id: user.id,
            name: user.name,
            bodyNumber: finalMtop,
            mtopNumber: finalMtop,
            avatarUrl: user.avatar_url || d.avatarUrl,
            role: user.role,
            complianceStatus:
              (user.driver_profile?.compliance_status as any) ||
              (user.role === 'admin' || user.role === 'superadmin' ? 'Approved' : d.complianceStatus),
            isOnline: user.driver_profile?.is_online ?? d.isOnline,
            queuePosition: user.driver_profile?.queue_position ?? d.queuePosition,
          };
        });
      }
    });

    // Auto-persist active trip state for 0ms instant reload restoration
    effect(() => {
      const trip = this.activeTripSignal();
      if (typeof window !== 'undefined') {
        try {
          if (trip) {
            localStorage.setItem(this.ACTIVE_TRIP_KEY, JSON.stringify(trip));
          } else {
            localStorage.removeItem(this.ACTIVE_TRIP_KEY);
          }
        } catch { }
      }
    });

    // Auto-persist returning state
    effect(() => {
      const isRet = this.isReturningSignal();
      if (typeof window !== 'undefined') {
        try {
          if (isRet) {
            localStorage.setItem(this.RETURNING_KEY, 'true');
          } else {
            localStorage.removeItem(this.RETURNING_KEY);
          }
        } catch { }
      }
    });

    // Auto-persist driver profile state (online duty / queue position)
    effect(() => {
      const d = this.driverSignal();
      if (typeof window !== 'undefined' && !this.authService.isPassenger()) {
        try {
          localStorage.setItem(
            this.DRIVER_PROFILE_KEY,
            JSON.stringify({
              isOnline: d.isOnline,
              queuePosition: d.queuePosition,
              totalQueueCount: d.totalQueueCount,
            })
          );
        } catch { }
      }
    });
  }

  getDisplayQueuePosition(): number {
    const current = this.driverSignal();
    if (current.queuePosition && current.queuePosition > 0) return current.queuePosition;
    const myItem = this.queueSignal().find((item) => item.isCurrentDriver || item.driverId === current.id);
    if (myItem?.position && myItem.position > 0) return myItem.position;

    const queueList = this.queueSignal();
    const otherDrivers = queueList.filter(
      (item) => !item.isCurrentDriver && item.driverId !== current.id && item.driverName !== current.name && item.mtopNumber !== current.mtopNumber
    );
    return Math.max(1, otherDrivers.length + 1);
  }

  // ==========================================
  // DUTY TOGGLE (Optimistic UI + Geofence Check)
  // ==========================================
  toggleDuty(forcedState?: boolean, driverDistanceMeters?: number): { success: boolean; isOnline: boolean; message: string } {
    const current = this.driverSignal();
    const previousState = current.isOnline;
    const targetState = forcedState !== undefined ? forcedState : !previousState;

    // Check compliance status
    if (current.complianceStatus === 'Suspended' || current.complianceStatus === 'Removed' || current.complianceStatus === 'Rejected') {
      return {
        success: false,
        isOnline: false,
        message: current.complianceStatus === 'Removed'
          ? 'ACCOUNT REMOVED: Please contact TODA Administration.'
          : `ACCOUNT ${current.complianceStatus.toUpperCase()}: ${current.suspensionReason || 'Please review compliance requirements.'}`,
      };
    }

    if (targetState) {
      if (driverDistanceMeters !== undefined && !isNaN(driverDistanceMeters) && driverDistanceMeters > 35) {
        return {
          success: false,
          isOnline: false,
          message: `Outside Terminal Area: You are ${Math.round(driverDistanceMeters)}m away. You must be physically at the TODA Terminal (within 35m) to go on duty.`,
        };
      }

      // Filter out ANY existing entry for this driver to prevent ANY duplicate
      const queueList = this.queueSignal();
      const otherDrivers = queueList.filter(
        (item) => !item.isCurrentDriver && item.driverId !== current.id && item.driverName !== current.name && item.mtopNumber !== current.mtopNumber
      );
      const nextPos = Math.max(otherDrivers.length, this.driverSignal().totalQueueCount) + 1;

      // 1. Instant 0ms Optimistic UI State Update
      this.driverSignal.update((d) => ({
        ...d,
        isOnline: true,
        queuePosition: nextPos,
        totalQueueCount: nextPos,
      }));

      const newItem: QueueItem = {
        id: current.id || Date.now(),
        driverId: current.id,
        driverName: current.name,
        bodyNumber: current.bodyNumber,
        mtopNumber: current.mtopNumber,
        position: nextPos,
        status: nextPos === 1 ? 'Ready' : 'In Line',
        isCurrentDriver: true,
        timeJoined: 'Just now',
      };
      this.queueSignal.set([...otherDrivers, newItem]);

      this.lastToggleTimestamp = Date.now();
      try {
        localStorage.setItem(this.DRIVER_PROFILE_KEY, JSON.stringify({
          isOnline: true,
          queuePosition: nextPos,
          totalQueueCount: nextPos,
        }));
        localStorage.setItem(this.QUEUE_CACHE_KEY, JSON.stringify(this.queueSignal()));
      } catch {}

      this.broadcastLiveUpdate();

      // 2. Dispatch to Debounced & Idempotent Backend Pipeline
      this.dutyToggleSubject.next({ targetState: true, previousState });

      return {
        success: true,
        isOnline: true,
        message: `On Duty! Position #${nextPos} in TODA Queue.`,
      };
    } else {
      // Turning OFFLINE - 1. Instant 0ms Optimistic UI State Update
      this.lastToggleTimestamp = Date.now();
      const remainingDrivers = this.queueSignal().filter(
        (item) => !item.isCurrentDriver && item.driverId !== current.id && item.driverName !== current.name && item.mtopNumber !== current.mtopNumber
      );
      const reindexed = remainingDrivers.map((item, idx) => ({
        ...item,
        position: idx + 1,
        status: (idx === 0 ? 'Ready' : 'In Line') as 'Ready' | 'In Line',
      }));

      const remainingCount = Math.max(reindexed.length, Math.max(0, (current.totalQueueCount || 0) - 1));

      this.driverSignal.update((d) => ({
        ...d,
        isOnline: false,
        queuePosition: null,
        totalQueueCount: remainingCount,
      }));

      this.queueSignal.set(reindexed);

      try {
        localStorage.setItem(this.DRIVER_PROFILE_KEY, JSON.stringify({
          isOnline: false,
          queuePosition: null,
          totalQueueCount: remainingCount,
        }));
        localStorage.setItem(this.QUEUE_CACHE_KEY, JSON.stringify(reindexed));
      } catch {}

      this.broadcastLiveUpdate();

      // 2. Dispatch to Debounced & Idempotent Backend Pipeline
      this.dutyToggleSubject.next({ targetState: false, previousState });

      return {
        success: true,
        isOnline: false,
        message: 'Off Duty. You have left the terminal queue.',
      };
    }
  }

  // ==========================================
  // 1. TERMINAL WALK-IN RIDE DISPATCH
  // ==========================================
  startTerminalRide(dropoffLocation: string, passengerCount: number, fare: number): void {
    const current = this.driverSignal();
    const trip: RideTrip = {
      id: `WALK-IN-${Date.now()}`,
      passengerName: 'Walk-In Passenger',
      pickupLocation: 'TODA Central Station Terminal',
      dropoffLocation: dropoffLocation,
      passengerCount: passengerCount,
      fare: fare,
      status: 'in_transit',
      tripType: 'terminal_walk_in',
      startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    this.activeTripSignal.set(trip);
    try {
      localStorage.setItem(this.ACTIVE_TRIP_KEY, JSON.stringify(trip));
    } catch {}

    // Update driver state (departed / on trip -> queue position is null)
    this.driverSignal.update((d) => ({
      ...d,
      queuePosition: null,
    }));

    // Remove current driver from queue and re-index remaining queue positions
    this.queueSignal.update((list) => {
      const filtered = list.filter(
        (item) => !item.isCurrentDriver && item.driverId !== current.id && item.driverName !== current.name && item.mtopNumber !== current.mtopNumber
      );
      return filtered.map((item, idx) => ({
        ...item,
        position: idx + 1,
        status: idx === 0 ? 'Ready' : 'In Line',
      }));
    });

    try {
      localStorage.setItem(this.QUEUE_CACHE_KEY, JSON.stringify(this.queueSignal()));
    } catch {}

    // Add driver to drivers on trip list
    this.driversOnTripSignal.update((list) => [
      {
        id: Date.now(),
        rideId: trip.id,
        driverName: current.name,
        mtopNumber: current.mtopNumber,
        status: 'In Transit',
        pickupLocation: trip.pickupLocation,
        destination: trip.dropoffLocation,
        fare: trip.fare,
      },
      ...list.filter((t) => t.driverName !== current.name),
    ]);

    this.broadcastLiveUpdate();

    // Persist to backend and trigger instant Reverb broadcast
    this.dashboardService
      .startWalkIn({
        destination: dropoffLocation,
        passenger_count: passengerCount,
        fare: fare,
      })
      .subscribe({
        next: (res) => {
          if (res?.ride?.id) {
            this.activeTripSignal.update((t) => t ? { ...t, id: `TRIP-${res.ride.id}` } : t);
          }
          this.broadcastLiveUpdate();
        },
        error: (err) => {
          console.warn('Walk-in start notice:', err?.status);
        },
      });
  }

  // ==========================================
  // COMPLETE DROP-OFF ACTION
  // ==========================================
  completeDropOff(): { success: boolean; fare: number; message: string } {
    const currentTrip = this.activeTripSignal();
    if (!currentTrip) {
      return { success: false, fare: 0, message: 'No active trip to complete.' };
    }

    const numericFare = Number(currentTrip.fare) || 0;
    const current = this.driverSignal();
    const completedTrip: RideTrip = {
      ...currentTrip,
      fare: numericFare,
      status: 'completed',
      completedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    this.tripHistorySignal.update((hist) => [completedTrip, ...hist]);
    this.driverSignal.update((d) => ({
      ...d,
      isOnline: true,
      queuePosition: null,
      todayEarnings: (d.todayEarnings || 0) + numericFare,
      weeklyEarnings: (d.weeklyEarnings || 0) + numericFare,
      monthlyEarnings: (d.monthlyEarnings || 0) + numericFare,
      tripsTodayCount: (d.tripsTodayCount || 0) + 1,
    }));

    // Ensure queue definitely does not contain the driver while returning
    this.queueSignal.update((list) => {
      const filtered = list.filter(
        (item) => !item.isCurrentDriver && item.driverId !== current.id && item.driverName !== current.name && item.mtopNumber !== current.mtopNumber
      );
      return filtered.map((item, idx) => ({
        ...item,
        position: idx + 1,
        status: idx === 0 ? 'Ready' : 'In Line',
      }));
    });

    try {
      localStorage.setItem(this.QUEUE_CACHE_KEY, JSON.stringify(this.queueSignal()));
    } catch {}

    // Transition to Returning to Terminal State
    this.isReturningSignal.set(true);
    this.activeTripSignal.set(null);

    // Update or insert driver into drivers on trip list with status "Returning"
    this.driversOnTripSignal.update((list) => {
      const filtered = list.filter((t) => t.driverName !== current.name && (!current.mtopNumber || t.mtopNumber !== current.mtopNumber));
      return [
        ...filtered,
        {
          id: `RETURNING-${Date.now()}`,
          rideId: `RET-${Date.now()}`,
          driverName: current.name || 'TODA Driver',
          mtopNumber: current.mtopNumber || '500106',
          destination: 'TODA Terminal',
          fare: 0.00,
          status: 'Returning',
          pickupLocation: currentTrip.dropoffLocation || 'Drop-off Point',
        },
      ];
    });

    try {
      localStorage.setItem(this.RETURNING_KEY, 'true');
      localStorage.removeItem(this.ACTIVE_TRIP_KEY);
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(this.tripHistorySignal()));
    } catch {}

    this.broadcastLiveUpdate();

    this.dashboardService.completeDropOff({ fare: numericFare }).subscribe({
      next: (res) => {
        if (res?.today_earnings !== undefined) {
          this.driverSignal.update((d) => ({
            ...d,
            todayEarnings: Number(res.today_earnings) || 0,
            tripsTodayCount: res.today_rides_count ?? d.tripsTodayCount,
          }));
        }
        this.broadcastLiveUpdate();
      },
      error: (err) => {
        console.warn('Drop-off complete notice:', err?.status);
      },
    });

    return {
      success: true,
      fare: numericFare,
      message: `Drop-off completed! ₱${numericFare.toFixed(2)} added to earnings. Heading back to TODA Terminal.`,
    };
  }

  // ==========================================
  // 2. WAYSIDE PASSENGER RIDE DISPATCH
  // ==========================================
  startWaysideRide(dropoffLocation: string, passengerCount: number, fare: number): void {
    const current = this.driverSignal();
    const trip: RideTrip = {
      id: `WAYSIDE-${Date.now()}`,
      passengerName: 'Wayside Passenger',
      pickupLocation: 'Current Wayside Location',
      dropoffLocation: dropoffLocation,
      passengerCount: passengerCount,
      fare: fare,
      status: 'in_transit',
      tripType: 'wayside_pickup',
      startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    this.activeTripSignal.set(trip);
    this.isReturningSignal.set(false);

    try {
      localStorage.setItem(this.ACTIVE_TRIP_KEY, JSON.stringify(trip));
      localStorage.removeItem(this.RETURNING_KEY);
    } catch {}

    // Update driver state
    this.driverSignal.update((d) => ({
      ...d,
      isOnline: true,
      queuePosition: null,
    }));

    // Remove from queue while on wayside trip
    this.queueSignal.update((list) => {
      const filtered = list.filter(
        (item) => !item.isCurrentDriver && item.driverId !== current.id && item.driverName !== current.name && item.mtopNumber !== current.mtopNumber
      );
      return filtered.map((item, idx) => ({
        ...item,
        position: idx + 1,
        status: idx === 0 ? 'Ready' : 'In Line',
      }));
    });

    try {
      localStorage.setItem(this.QUEUE_CACHE_KEY, JSON.stringify(this.queueSignal()));
    } catch {}

    // Update in-transit list
    this.driversOnTripSignal.update((list) => [
      {
        id: Date.now(),
        rideId: trip.id,
        driverName: current.name,
        mtopNumber: current.mtopNumber,
        status: 'In Transit',
        pickupLocation: trip.pickupLocation,
        destination: trip.dropoffLocation,
        fare: trip.fare,
      },
      ...list.filter((t) => t.driverName !== current.name),
    ]);

    this.broadcastLiveUpdate();

    this.dashboardService
      .startWayside({
        destination: dropoffLocation,
        passenger_count: passengerCount,
        fare: fare,
      })
      .subscribe({
        next: (res) => {
          if (res?.ride?.id) {
            this.activeTripSignal.update((t) => t ? { ...t, id: `TRIP-${res.ride.id}` } : t);
          }
          this.broadcastLiveUpdate();
        },
        error: (err) => {
          console.warn('Wayside start notice:', err?.status);
        },
      });
  }

  proposeFare(proposedFare: number): void {
    const trip = this.activeTrip();
    if (!trip) return;
    const numId = Number(String(trip.id).replace(/\D/g, ''));
    if (!numId) return;

    this.activeTripSignal.update((t) => t ? { ...t, fare: proposedFare, status: 'fare_proposed' } : null);
    this.driversOnTripSignal.update((list) =>
      list.map((d) => (d.rideId === trip.id || d.driverName === this.driverSignal().name) ? { ...d, fare: proposedFare, status: 'Bargaining' } : d)
    );
    this.broadcastLiveUpdate();

    this.dashboardService.proposeFare(numId, proposedFare).subscribe({
      next: () => this.broadcastLiveUpdate(),
      error: (err) => console.warn('Propose fare notice:', err),
    });
  }

  notifyDriverArrived(): void {
    const trip = this.activeTrip();
    if (!trip) return;
    const numId = Number(String(trip.id).replace(/\D/g, ''));
    if (!numId) return;

    this.activeTripSignal.update((t) => t ? { ...t, status: 'arrived' } : null);
    this.driversOnTripSignal.update((list) =>
      list.map((d) => (d.rideId === trip.id || d.driverName === this.driverSignal().name) ? { ...d, status: 'At Pickup' } : d)
    );
    this.broadcastLiveUpdate();

    this.dashboardService.driverArrived(numId).subscribe({
      next: () => this.broadcastLiveUpdate(),
      error: (err) => console.warn('Driver arrived notice:', err),
    });
  }

  startDepartTrip(): void {
    const trip = this.activeTrip();
    if (!trip) return;
    const numId = Number(String(trip.id).replace(/\D/g, ''));
    if (!numId) return;

    this.activeTripSignal.update((t) => t ? { ...t, status: 'in_transit' } : null);
    this.driversOnTripSignal.update((list) =>
      list.map((d) => (d.rideId === trip.id || d.driverName === this.driverSignal().name) ? { ...d, status: 'In Transit' } : d)
    );
    this.broadcastLiveUpdate();

    this.dashboardService.startTrip(numId).subscribe({
      next: () => this.broadcastLiveUpdate(),
      error: (err) => console.warn('Start trip notice:', err),
    });
  }

  cancelActiveTrip(): void {
    const trip = this.activeTrip();
    if (!trip) return;
    const numId = Number(String(trip.id).replace(/\D/g, ''));
    const wasPreTrip = trip.status === 'bargaining' || trip.status === 'fare_proposed' || trip.status === 'accepted' || trip.status === 'arrived';

    this.activeTripSignal.set(null);
    try {
      localStorage.removeItem(this.ACTIVE_TRIP_KEY);
    } catch {}

    if (wasPreTrip) {
      // Driver never left terminal - optimistically restore to #1 in queue instantly!
      const current = this.driverSignal();
      this.driverSignal.update((d) => ({
        ...d,
        isOnline: true,
        queuePosition: 1,
        totalQueueCount: Math.max(1, d.totalQueueCount || this.queueSignal().length + 1),
      }));

      // Re-insert self into queueSignal at position 1
      this.queueSignal.update((list) => {
        const filtered = list.filter((item) => !item.isCurrentDriver && item.driverId !== current.id);
        const myItem: QueueItem = {
          id: current.id || 999,
          driverId: current.id,
          driverName: current.name,
          bodyNumber: current.mtopNumber,
          mtopNumber: current.mtopNumber,
          position: 1,
          status: 'Ready',
          isCurrentDriver: true,
          timeJoined: 'Active',
        };
        const reindexed = filtered.map((item, idx) => ({
          ...item,
          position: idx + 2,
          status: 'In Line' as const,
        }));
        return [myItem, ...reindexed];
      });
    }

    if (numId) {
      this.dashboardService.cancelActiveRide(numId).subscribe({
        next: (res) => {
          if (res?.active_queue) {
            this.syncFromDashboard({ driver: { active_queue: res.active_queue, total_queue_count: res.total_queue_count } });
          }
          this.broadcastLiveUpdate();
        },
        error: (err) => console.warn('Cancel trip notice:', err),
      });
    }
  }

  setReturning(isReturning: boolean): void {
    this.isReturningSignal.set(isReturning);
    try {
      if (isReturning) {
        localStorage.setItem(this.RETURNING_KEY, 'true');
      } else {
        localStorage.removeItem(this.RETURNING_KEY);
      }
    } catch {}
  }

  // ==========================================
  // 3. AUTO-JOIN QUEUE ON TERMINAL ARRIVAL (FIFO)
  // ==========================================
  autoJoinQueueOnTerminalArrival(): { position: number; message: string } {
    const current = this.driverSignal();
    this.isReturningSignal.set(false);
    this.activeTripSignal.set(null);

    try {
      localStorage.removeItem(this.RETURNING_KEY);
      localStorage.removeItem(this.ACTIVE_TRIP_KEY);
    } catch {}

    const queueList = this.queueSignal();
    const otherDrivers = queueList.filter(
      (item) => !item.isCurrentDriver && item.driverId !== current.id && item.driverName !== current.name && item.mtopNumber !== current.mtopNumber
    );
    const nextPos = Math.max(1, otherDrivers.length + 1);

    this.driverSignal.update((d) => ({
      ...d,
      isOnline: true,
      queuePosition: nextPos,
      totalQueueCount: Math.max(d.totalQueueCount || 0, nextPos),
    }));

    const newItem: QueueItem = {
      id: Date.now(),
      driverId: current.id,
      driverName: current.name,
      bodyNumber: current.bodyNumber,
      mtopNumber: current.mtopNumber,
      position: nextPos,
      status: nextPos === 1 ? 'Ready' : 'In Line',
      isCurrentDriver: true,
      timeJoined: 'Just now',
    };
    this.queueSignal.set([...otherDrivers, newItem]);

    try {
      localStorage.setItem(this.DRIVER_PROFILE_KEY, JSON.stringify({
        isOnline: true,
        queuePosition: nextPos,
        totalQueueCount: nextPos,
      }));
      localStorage.setItem(this.QUEUE_CACHE_KEY, JSON.stringify(this.queueSignal()));
    } catch {}

    // Remove from drivers on trip / transit
    this.driversOnTripSignal.update((list) => list.filter((t) => t.driverName !== current.name));

    this.broadcastLiveUpdate();

    this.dashboardService.returnToTerminal().subscribe({
      next: (res) => {
        if (res?.queue_position) {
          const finalPos = Number(res.queue_position);
          this.driverSignal.update((d) => ({
            ...d,
            queuePosition: finalPos,
            totalQueueCount: Math.max(d.totalQueueCount, finalPos),
          }));
          this.queueSignal.update((list) =>
            list.map((item) =>
              item.isCurrentDriver || item.driverId === current.id
                ? { ...item, position: finalPos, status: finalPos === 1 ? 'Ready' : 'In Line' }
                : item
            )
          );
        }
        this.broadcastLiveUpdate();
      },
      error: (err) => {
        console.warn('Return to terminal notice:', err?.status);
      },
    });

    return {
      position: nextPos,
      message: `Arrived at TODA Terminal! Auto-joined queue at Position #${nextPos}.`,
    };
  }

  // ==========================================
  // REAL-TIME BACKEND DASHBOARD SYNC
  // ==========================================
  syncFromDashboard(data: any): void {
    if (!data) return;
    const user = data.user || this.authService.currentUser();
    const dData = data.driver;
    const aData = data.admin;

    if (dData) {
      if (dData.profile) {
        const isLockActive = Date.now() - this.lastToggleTimestamp < 3000;
        if (!isLockActive) {
          this.driverSignal.update((d) => ({
            ...d,
            id: dData.profile.id || d.id,
            name: dData.profile.full_name || d.name,
            mtopNumber: dData.profile.mtop_number || d.mtopNumber,
            bodyNumber: dData.profile.mtop_number || d.bodyNumber,
            complianceStatus: dData.profile.compliance_status || d.complianceStatus,
            isOnline: !!dData.profile.is_online,
            queuePosition: dData.profile.queue_position ?? null,
            suspensionReason: dData.profile.suspension_reason || null,
            rating: dData.profile.rating !== undefined && dData.profile.rating !== null ? Number(dData.profile.rating) : d.rating,
            ratingCount: dData.profile.rating_count !== undefined && dData.profile.rating_count !== null ? Number(dData.profile.rating_count) : d.ratingCount,
            todayEarnings: dData.today_earnings ?? 0,
            tripsTodayCount: dData.today_rides_count ?? 0,
            totalQueueCount: dData.total_queue_count ?? 0,
          }));

          // If online with no active ride, sync returning state from queue_position
          if (dData.profile.is_online && !dData.active_ride) {
            if (dData.profile.queue_position === null || dData.profile.queue_position === undefined) {
              this.isReturningSignal.set(true);
            } else if (Number(dData.profile.queue_position) > 0) {
              this.isReturningSignal.set(false);
            }
          }
        }

        try {
          localStorage.setItem(this.DRIVER_PROFILE_KEY, JSON.stringify({
            isOnline: this.driverSignal().isOnline,
            queuePosition: this.driverSignal().queuePosition,
            totalQueueCount: this.driverSignal().totalQueueCount,
          }));
        } catch {}
      }

      if (Array.isArray(dData.active_queue)) {
        const currentUserId = user?.id;
        const currentDriverName = this.driverSignal().name;
        const currentMtop = this.driverSignal().mtopNumber;

        const mappedQueue: QueueItem[] = dData.active_queue.map((item: any, idx: number) => {
          const isMe = (currentUserId && Number(item.user_id) === Number(currentUserId)) ||
            (currentDriverName && item.full_name === currentDriverName) ||
            (currentMtop && item.mtop_number === currentMtop);

          return {
            id: item.id,
            driverId: item.user_id || item.id,
            driverName: item.full_name,
            bodyNumber: item.mtop_number,
            mtopNumber: item.mtop_number,
            position: item.queue_position || idx + 1,
            status: (item.queue_position === 1 || idx === 0) ? 'Ready' : 'In Line',
            isCurrentDriver: isMe,
            timeJoined: 'Active',
          };
        });

        // Deduplicate to guarantee no driver is shown twice
        const seenIds = new Set<any>();
        const uniqueQueue: QueueItem[] = [];
        for (const q of mappedQueue) {
          const key = q.isCurrentDriver ? 'CURRENT_DRIVER_ME' : (q.driverId || q.driverName || q.mtopNumber);
          if (!seenIds.has(key)) {
            seenIds.add(key);
            uniqueQueue.push(q);
          }
        }

        // If the driver is returning or on trip, ensure they are NOT in the active queue
        let finalQueue = uniqueQueue;
        if (this.isReturning() || this.activeTrip() || !this.driverSignal().isOnline) {
          finalQueue = uniqueQueue.filter((q) => !q.isCurrentDriver);
        }

        this.queueSignal.set(finalQueue);
        
        // Sync own position and queue count only outside of toggle lock window
        const isLockActive = Date.now() - this.lastToggleTimestamp < 3000;
        if (!isLockActive) {
          const myItem = finalQueue.find((q) => q.isCurrentDriver);
          if (myItem && this.driverSignal().isOnline && !this.isReturning() && !this.activeTrip()) {
            this.driverSignal.update((d) => ({
              ...d,
              queuePosition: myItem.position,
              totalQueueCount: finalQueue.length,
            }));
          } else if (this.isReturning() || this.activeTrip()) {
            this.driverSignal.update((d) => ({
              ...d,
              isOnline: true,
              queuePosition: null,
              totalQueueCount: finalQueue.length,
            }));
          } else if (!this.driverSignal().isOnline) {
            this.driverSignal.update((d) => ({
              ...d,
              isOnline: false,
              queuePosition: null,
              totalQueueCount: finalQueue.length,
            }));
          }
        }

        try {
          localStorage.setItem(this.QUEUE_CACHE_KEY, JSON.stringify(finalQueue));
        } catch {}
      }

      if (Array.isArray(dData.drivers_in_transit)) {
        const mappedTransit: DriverOnTrip[] = dData.drivers_in_transit.map((t: any) => ({
          id: t.id,
          rideId: `TRIP-${t.id}`,
          driverName: t.driver_name,
          mtopNumber: t.mtop_number,
          status: (t.status === 'Returning' || t.status === 'returning')
            ? 'Returning'
            : (t.status === 'bargaining' || t.status === 'Bargaining' || t.status === 'fare_proposed')
              ? 'Bargaining'
              : (t.status === 'in_transit' || t.status === 'In Transit')
                ? 'In Transit'
                : (t.status === 'en_route' || t.status === 'accepted' || t.status === 'En Route')
                  ? 'En Route'
                  : (t.status === 'arrived' || t.status === 'At Pickup')
                    ? 'At Pickup'
                    : 'Returning',
          pickupLocation: t.pickup || t.pickupLocation || 'Drop-off Point',
          destination: t.destination || 'TODA Terminal',
          fare: Number(t.fare) || 0,
        }));
        this.driversOnTripSignal.set(mappedTransit);
      }

      if (dData.active_ride) {
        const r = dData.active_ride;
        this.isReturningSignal.set(false);
        this.activeTripSignal.set({
          id: `TRIP-${r.id}`,
          passengerId: r.passenger_id ?? (r.passenger?.id || null),
          passengerName: r.passenger?.name || 'Passenger',
          passengerPhone: r.passenger?.phone_number || '',
          pickupLocation: r.pickup_address || r.pickup_location || 'Pickup Point',
          dropoffLocation: r.destination_address || r.destination || 'Destination Point',
          pickupLat: r.pickup_lat ? Number(r.pickup_lat) : undefined,
          pickupLng: r.pickup_lng ? Number(r.pickup_lng) : undefined,
          dropoffLat: (r.destination_lat || r.dest_lat) ? Number(r.destination_lat || r.dest_lat) : undefined,
          dropoffLng: (r.destination_lng || r.dest_lng) ? Number(r.destination_lng || r.dest_lng) : undefined,
          passengerCount: r.passenger_count || 1,
          fare: Number(r.fare) || 0,
          originalFare: Number(r.original_fare || r.fare) || 0,
          status: r.status,
          tripType: r.trip_type || 'online_dispatch',
          startedAt: r.created_at ? new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        });
      } else if (dData.active_ride === null && this.activeTrip()) {
        const prevTrip = this.activeTrip();
        this.activeTripSignal.set(null);
        if (prevTrip && (prevTrip.status === 'bargaining' || prevTrip.status === 'fare_proposed' || prevTrip.status === 'accepted' || prevTrip.status === 'arrived')) {
          this.driverSignal.update((d) => ({
            ...d,
            isOnline: true,
            queuePosition: 1,
          }));
        }
      }
    } else if (aData && Array.isArray(aData.active_queue)) {
      const currentUserId = user?.id;
      const mappedQueue: QueueItem[] = aData.active_queue.map((item: any, idx: number) => ({
        id: item.id,
        driverId: item.user_id || item.id,
        driverName: item.full_name,
        bodyNumber: item.mtop_number,
        mtopNumber: item.mtop_number,
        position: item.queue_position || idx + 1,
        status: (item.queue_position === 1 || idx === 0) ? 'Ready' : 'In Line',
        isCurrentDriver: Boolean(currentUserId && Number(item.user_id) === Number(currentUserId)),
        timeJoined: 'Active',
      }));
      this.queueSignal.set(mappedQueue);
    }

    const pData = data.passenger;
    if (pData) {
      const queueCount = Number(pData.terminal_queue_count ?? pData.active_drivers_count ?? 0);
      this.driverSignal.update((d) => ({
        ...d,
        totalQueueCount: queueCount,
      }));

      if (Array.isArray(pData.active_queue)) {
        const mappedQueue: QueueItem[] = pData.active_queue.map((item: any, idx: number) => ({
          id: item.id,
          driverId: item.user_id || item.id,
          driverName: item.full_name,
          bodyNumber: item.mtop_number,
          mtopNumber: item.mtop_number,
          position: item.queue_position || idx + 1,
          status: (item.queue_position === 1 || idx === 0) ? 'Ready' : 'In Line',
          isCurrentDriver: false,
          timeJoined: 'Active',
        }));
        this.queueSignal.set(mappedQueue);
      } else {
        this.queueSignal.set([]);
      }
    }

    if (Array.isArray(data.announcements)) {
      this.notificationService.setAnnouncements(
        data.announcements.map((a: any) => ({
          id: a.id,
          title: a.title,
          message: a.message,
          targetAudience: a.target_audience || 'ALL',
          createdAt: a.created_at || 'Just now',
          isRead: false,
        }))
      );
    }
  }

  // ==========================================
  // DRIVING HISTORY ACTIONS
  // ==========================================
  clearHistory(): void {
    this.tripHistorySignal.set([]);
  }

  // ==========================================
  // ADMIN QUEUE REORDERING
  // ==========================================
  private baselineQueue: QueueItem[] | null = null;

  reorderQueue(driverIds: number[]): void {
    const currentQueue = this.queueSignal();
    if (!this.baselineQueue) {
      this.baselineQueue = [...currentQueue];
    }

    const newQueue: QueueItem[] = [];
    driverIds.forEach((id, idx) => {
      const match = currentQueue.find((item) => item.driverId === id || item.id === id);
      if (match) {
        newQueue.push({
          ...match,
          position: idx + 1,
          status: idx === 0 ? 'Ready' : 'In Line',
        });
      }
    });

    currentQueue.forEach((item) => {
      if (!newQueue.some((q) => q.id === item.id || q.driverId === item.driverId)) {
        newQueue.push({
          ...item,
          position: newQueue.length + 1,
          status: newQueue.length === 0 ? 'Ready' : 'In Line',
        });
      }
    });

    this.queueSignal.set(newQueue);
    this.hasUnsavedQueueOrderSignal.set(true);

    // Sync own queue position and total count
    const ownItem = newQueue.find((item) => item.isCurrentDriver);
    if (ownItem) {
      this.driverSignal.update((d) => ({
        ...d,
        queuePosition: ownItem.position,
        totalQueueCount: newQueue.length,
      }));
    }
  }

  setHasUnsavedQueueOrder(hasUnsaved: boolean): void {
    this.hasUnsavedQueueOrderSignal.set(hasUnsaved);
  }

  saveQueueOrder(orderedIds?: number[]): void {
    const list = this.queueSignal();
    this.baselineQueue = [...list];
    this.hasUnsavedQueueOrderSignal.set(false);
    this.broadcastLiveUpdate();

    const ids = (orderedIds && orderedIds.length > 0)
      ? orderedIds
      : list.map((item) => item.id || item.driverId);

    if (ids.length > 0) {
      this.dashboardService.reorderQueue(ids).subscribe({
        next: (res) => {
          if (res.status === 'success') {
            this.broadcastLiveUpdate();
          }
        },
        error: (err) => {
          console.warn('Queue reorder sync error:', err?.status);
        },
      });
    }
  }

  broadcastLiveUpdate(): void {
    try {
      this.liveChannel?.postMessage({ type: 'QUEUE_UPDATED', time: Date.now() });
      localStorage.setItem('srh_live_sync_pulse', String(Date.now()));
    } catch {}
  }

  broadcastRideCancelled(rideId?: number, passengerId?: number, driverId?: number): void {
    try {
      this.liveChannel?.postMessage({
        type: 'RIDE_CANCELLED',
        rideId,
        passengerId,
        driverId,
        time: Date.now(),
      });
      localStorage.setItem('srh_ride_cancelled_pulse', String(Date.now()));
    } catch {}
  }

  triggerLiveSync(): void {
    this.syncTriggerSignal.update((n) => n + 1);
  }

  handleLocationBroadcast(event: any): void {
    if (!event) return;
    const dId = event.driverId ?? event.driver_id;
    const lat = event.lat ? Number(event.lat) : null;
    const lng = event.lng ? Number(event.lng) : null;
    if (dId && lat && lng) {
      this.locationBroadcast.set({
        driverId: Number(dId),
        lat: lat,
        lng: lng,
        heading: event.heading ? Number(event.heading) : undefined,
        speed: event.speed ? Number(event.speed) : undefined,
        rideId: event.rideId ? Number(event.rideId) : undefined,
      });
    }
  }

  handleRideStatusBroadcast(event: any): void {
    if (!event || !event.ride) return;
    const ride = event.ride;
    const currentUserId = this.authService.currentUser()?.id;
    const isDriver = this.authService.isDriver();
    const isPassenger = this.authService.isPassenger();

    if (ride.status === 'cancelled') {
      if (isDriver && Number(ride.driver_id) === Number(currentUserId)) {
        this.activeTripSignal.set(null);
        this.rideCancelledNotice.set({
          role: 'driver',
          message: '❌ Ride was cancelled by the passenger.',
          timestamp: Date.now(),
        });
      } else if (isPassenger && Number(ride.passenger_id) === Number(currentUserId)) {
        this.rideCancelledNotice.set({
          role: 'passenger',
          message: '❌ Ride request was cancelled.',
          timestamp: Date.now(),
        });
      }
      this.syncTriggerSignal.update((n) => n + 1);
      return;
    }

    if (currentUserId && Number(ride.driver_id) === Number(currentUserId)) {
      if (['in_transit', 'accepted', 'arrived'].includes(ride.status)) {
        this.activeTripSignal.set({
          id: `TRIP-${ride.id}`,
          passengerName: ride.passenger_name || 'Passenger',
          pickupLocation: ride.pickup_location || 'Pickup Point',
          dropoffLocation: ride.destination || 'Destination Point',
          passengerCount: 1,
          fare: ride.fare || 0,
          status: ride.status,
          tripType: 'online_dispatch',
          startedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        this.isReturningSignal.set(false);
      } else if (ride.status === 'returning') {
        this.activeTripSignal.set(null);
        this.isReturningSignal.set(true);
      } else if (['completed'].includes(ride.status)) {
        this.activeTripSignal.set(null);
      }
    }
  }

  updateDriverLocation(coords: { lat: number; lng: number; heading?: number; speed?: number; ride_id?: number }): void {
    const dId = this.driver()?.id || this.authService.currentUser()?.id;
    try {
      this.liveChannel?.postMessage({
        type: 'TRICYCLE_LOCATION_UPDATED',
        driverId: dId,
        driver_id: dId,
        lat: coords.lat,
        lng: coords.lng,
        heading: coords.heading,
        speed: coords.speed,
        rideId: coords.ride_id,
      });
      localStorage.setItem('srh_live_driver_loc', JSON.stringify({
        driverId: dId,
        driver_id: dId,
        lat: coords.lat,
        lng: coords.lng,
        heading: coords.heading,
        speed: coords.speed,
        rideId: coords.ride_id,
        time: Date.now(),
      }));
    } catch {}

    this.dashboardService.updateDriverLocation(coords).subscribe({
      next: () => {},
      error: (err) => console.warn('Location broadcast notice:', err?.status),
    });
  }

  cancelQueueOrderChanges(): void {
    if (this.baselineQueue) {
      this.queueSignal.set([...this.baselineQueue]);
      const ownItem = this.baselineQueue.find((item) => item.isCurrentDriver);
      if (ownItem) {
        this.driverSignal.update((d) => ({ ...d, queuePosition: ownItem.position }));
      }
      this.baselineQueue = null;
    }
    this.hasUnsavedQueueOrderSignal.set(false);
  }

  // ==========================================
  // COMPLIANCE & REINSTATEMENT APPEAL
  // ==========================================
  setComplianceStatus(status: 'Approved' | 'Pending' | 'Suspended' | 'Rejected' | 'Removed', reason?: string): void {
    this.driverSignal.update((d) => ({
      ...d,
      complianceStatus: status,
      suspensionReason: reason || (status === 'Suspended' ? 'Administrative suspension for verification' : null),
      isOnline: status === 'Approved' ? d.isOnline : false,
      queuePosition: status === 'Approved' ? d.queuePosition : null,
    }));
  }

  submitAppeal(message: string, attachments: Array<{ name: string; url?: string; extension?: string }>): void {
    this.driverSignal.update((d) => ({
      ...d,
      appealStatus: 'Pending',
      appealMessage: message,
      appealAttachments: attachments,
      appealedAt: 'Just now',
    }));
  }
}
