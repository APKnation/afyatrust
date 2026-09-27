export interface Permission {
  doctor_wallet: string;
  doctor_name: string;
  granted_by: string;
  granted_by_role: string;
  expiry: number;
  is_active: boolean;
}

export interface AccessRequest {
  id: number;
  doctor_name: string;
  doctor_wallet: string;
  facility_id: string;
  reason: string;
  status: string;
  created_at: string;
}

export interface GrantPermissionInput {
  doctor_wallet: string;
  doctor_name: string;
  days: number;
}