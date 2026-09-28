import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface PatientRecord {
  id?: number;
  facility: string;
  type: string;
  data: any;
  hash: string;
  tx_hash?: string;
  date: string;
  verified: boolean;
}

export interface AuditEvent {
  accessor: string;
  role: string;
  facility: string;
  action: string;
  timestamp: number;
}

export interface MeasurementItem {
  id: number;
  kind: string;
  value: number;
  unit: string;
  notes: string;
  doctor: string;
  hospital: string;
  date?: string;
  created_at?: string;
}

export interface ReferralItem {
  id: number;
  patient_health_id?: string;
  patient_name?: string;
  from_hospital?: string;
  from_doctor?: string;
  to_hospital: string;
  to_hospital_code: string;
  reason: string;
  status: string;
  responded_by?: string;
  date?: string;
  created_at?: string;
  responded_at?: string;
}

export interface AssignedPatient {
  health_id: string;
  full_name: string;
  granted_at: string;
  expires_at: string;
  active: boolean;
  source: string;
}

export interface HospitalOption {
  code: string;
  name: string;
  region: string;
}

export interface PatientData {
  health_id: string;
  full_name: string;
  wallet_address: string;
  records: PatientRecord[];
  measurements: MeasurementItem[];
  referrals: ReferralItem[];
  audit_trail: AuditEvent[];
}

export interface AccessRequest {
  id: number;
  patient_health_id?: string;
  patient_name?: string;
  doctor_name?: string;
  doctor_wallet?: string;
  facility_id: string;
  reason: string;
  status?: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private api = environment.apiUrl;

  constructor(private auth: AuthService) {}

  private async request<T>(
    method: string,
    endpoint: string,
    body?: any,
    extraHeaders: Record<string, string> = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    const token = this.auth.token;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${this.api}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401) this.auth.logout(); // expired/invalid token
      const err = new Error((data as any)?.error || 'Request failed');
      (err as any).status = res.status;
      (err as any).error = data;
      throw err;
    }

    return data as T;
  }

  // ---------- Auth ----------

  /** Single sign-in for every role; the backend decides the role. */
  unifiedLogin(identity: string, secret: string) {
    return this.request<import('./auth.service').UnifiedLoginResponse>('POST', '/login/', {
      identity,
      secret,
    });
  }

  /** Legacy patient login (Health ID + PIN). */
  login(health_id: string, pin: string) {
    return this.request<import('./auth.service').LoginResponse>('POST', '/login/', {
      health_id,
      pin,
    });
  }

  registerPatient(payload: {
    health_id: string;
    full_name: string;
    pin: string;
    phone?: string;
    facility_id?: string;
  }) {
    return this.request('POST', '/register/', payload);
  }

  // ---------- Doctor (JWT; accounts are admin-created) ----------

  doctorMe() {
    return this.request<{
      license_no: string; full_name: string; hospital_code: string;
      hospital_name: string; wallet_address: string; status: string;
    }>('GET', '/doctor/me/');
  }

  // ---------- Hospitals ----------

  hospitals(): Promise<HospitalOption[]> {
    return this.request<HospitalOption[]>('GET', '/hospitals/');
  }

  // ---------- Patient ----------

  myRecords(): Promise<PatientData> {
    return this.request<PatientData>('GET', '/patient/my-records/');
  }

  myMeasurements(): Promise<MeasurementItem[]> {
    return this.request<MeasurementItem[]>('GET', '/patient/measurements/');
  }

  myReferrals(): Promise<ReferralItem[]> {
    return this.request<ReferralItem[]>('GET', '/patient/referrals/');
  }

  myRequests(): Promise<AccessRequest[]> {
    return this.request<AccessRequest[]>('GET', '/patient/requests/');
  }

  grantAccess(payload: { doctor_license?: string; doctor_wallet?: string; doctor_name: string; days: number }) {
    return this.request('POST', '/patient/grant-access/', payload);
  }

  revokeAccess(payload: { doctor_license?: string; doctor_wallet?: string }) {
    return this.request('POST', '/patient/revoke-access/', payload);
  }

  approveRequest(request_id: number) {
    return this.request('POST', `/patient/approve-request/${request_id}/`);
  }

  rejectRequest(request_id: number) {
    return this.request('POST', `/patient/reject-request/${request_id}/`);
  }

  // ---------- Doctor ----------

  requestAccess(payload: { health_id: string; reason: string }) {
    return this.request('POST', '/doctor/request-access/', payload);
  }

  /** View a patient's records (doctor identified by JWT). */
  doctorViewRecord(health_id: string) {
    return this.request<any>('GET', `/doctor/patient/${encodeURIComponent(health_id)}/`);
  }

  doctorPendingRequests(): Promise<AccessRequest[]> {
    return this.request<AccessRequest[]>('GET', '/doctor/pending-requests/');
  }

  myPatients(): Promise<AssignedPatient[]> {
    return this.request<AssignedPatient[]>('GET', '/doctor/patients/');
  }

  addMeasurement(payload: { health_id: string; kind: string; value: number; unit: string; notes?: string }) {
    return this.request('POST', '/doctor/measurements/', payload);
  }

  patientMeasurements(health_id: string): Promise<MeasurementItem[]> {
    return this.request<MeasurementItem[]>(
      'GET', `/doctor/measurements/${encodeURIComponent(health_id)}/`
    );
  }

  createReferral(payload: { health_id: string; to_hospital: string; reason: string }) {
    return this.request('POST', '/doctor/referrals/', payload);
  }

  myReferralsSent(): Promise<ReferralItem[]> {
    return this.request<ReferralItem[]>('GET', '/doctor/referrals/');
  }

  /** Pending referrals addressed to my hospital (notification feed). */
  incomingReferrals(): Promise<ReferralItem[]> {
    return this.request<ReferralItem[]>('GET', '/doctor/referrals/incoming/');
  }

  // ---------- Hospital staff ----------

  hospitalReferrals(status?: string): Promise<ReferralItem[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<ReferralItem[]>('GET', `/staff/referrals/${q}`);
  }

  respondReferral(referral_id: number, action: 'ACCEPTED' | 'DECLINED') {
    return this.request('POST', `/staff/referrals/${referral_id}/respond/`, { action });
  }

  breakGlass(payload: { health_id: string; facility_id: string; reason: string }) {
    return this.request('POST', '/doctor/break-glass/', payload);
  }

  // ---------- Facility ----------

  addRecord(payload: {
    health_id: string;
    facility_id: string;
    facility_name: string;
    record_type: string;
    record_data: any;
  }) {
    return this.request('POST', '/add-record/', payload);
  }
}
