export interface DriverProfile {
  id: number;
  full_name: string;
  mtop_number: string;
  compliance_status: string;
  is_online: boolean;
  queue_position?: number | null;
  mtop_certificate_url?: string | null;
  drivers_license_url?: string | null;
}

export interface User {
  id: number;
  name: string;
  email: string;
  phone_number: string;
  role: 'superadmin' | 'admin' | 'driver' | 'passenger';
  is_active: boolean;
  avatar_url?: string | null;
  verification_channel?: string;
  is_verified?: boolean;
  driver_profile?: DriverProfile | null;
}

export interface AuthResponse {
  status: 'success' | 'error';
  message?: string;
  token?: string;
  user?: User;
  requires_otp?: boolean;
  errors?: Record<string, string[]>;
}

export interface CheckFieldResponse {
  field: string;
  value: string;
  available: boolean;
}
