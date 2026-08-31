export interface DriverProfile {
  id: number;
  name: string;
  bodyNumber: string;
  mtopNumber: string;
  todaAssociation: string;
  avatarUrl: string;
  rating: number;
  ratingCount: number;
  complianceStatus: 'Approved' | 'Pending' | 'Suspended' | 'Rejected' | 'Removed';
  suspensionReason?: string | null;
  appealStatus?: 'None' | 'Pending' | 'Approved' | 'Rejected';
  appealMessage?: string | null;
  appealAttachments?: Array<{ name: string; url?: string; extension?: string }>;
  appealedAt?: string | null;
  isOnline: boolean;
  queuePosition: number | null;
  totalQueueCount: number;
  todayEarnings: number;
  weeklyEarnings: number;
  monthlyEarnings: number;
  tripsTodayCount: number;
  role: 'driver' | 'admin' | 'superadmin' | 'passenger';
}

export interface QueueItem {
  id: number;
  driverId: number;
  driverName: string;
  bodyNumber: string;
  mtopNumber?: string;
  position: number;
  status: 'Ready' | 'In Line' | 'On Trip' | 'Break';
  isCurrentDriver: boolean;
  avatarUrl?: string;
  timeJoined: string;
}

export interface DriverOnTrip {
  id: number | string;
  rideId?: string;
  driverName: string;
  mtopNumber: string;
  status: 'Bargaining' | 'Negotiating' | 'En Route' | 'At Pickup' | 'In Transit' | 'Returning' | 'On Trip';
  pickupLocation: string;
  destination: string;
  fare: number;
}

export interface RideTrip {
  id: string;
  passengerId?: number | null;
  passengerName?: string;
  passengerPhone?: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  passengerCount: number;
  fare: number;
  originalFare?: number;
  proposedFare?: number;
  status: 'searching' | 'bargaining' | 'fare_proposed' | 'fare_accepted' | 'en_route' | 'accepted' | 'arrived' | 'in_transit' | 'returning' | 'completed' | 'cancelled';
  tripType: 'terminal_walk_in' | 'online_dispatch' | 'wayside_pickup';
  startedAt: string;
  completedAt?: string;
  rating?: number;
  reviewComment?: string;
  feedbackTags?: string;
}

export interface ChatMessage {
  id: string;
  rideId: string;
  senderId: number;
  senderName: string;
  senderRole: 'driver' | 'passenger';
  message: string;
  timestamp: string;
  isDriver: boolean;
}

export interface Announcement {
  id: number;
  title: string;
  message: string;
  targetAudience: 'ALL' | 'DRIVERS' | 'PASSENGERS' | 'RATING' | 'APPEAL' | string;
  isRead: boolean;
  createdAt: string;
  ratingStars?: number;
  feedbackComment?: string;
  feedbackTags?: string[];
  actionUrl?: string;
}
