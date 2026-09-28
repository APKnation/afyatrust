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

export interface PatientData {
  health_id: string;
  full_name: string;
  wallet_address: string;
  records: PatientRecord[];
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

  // ---------- Patient ----------

  myRecords(): Promise<PatientData> {
    return this.request<PatientData>('GET', '/patient/my-records/');
  }

  myRequests(): Promise<AccessRequest[]> {
    return this.request<AccessRequest[]>('GET', '/patient/requests/');
  }

  grantAccess(payload: { doctor_wallet: string; doctor_name: string; days: number }) {
    return this.request('POST', '/patient/grant-access/', payload);
  }

  revokeAccess(doctor_wallet: string) {
    return this.request('POST', '/patient/revoke-access/', { doctor_wallet });
  }

  approveRequest(request_id: number) {
    return this.request('POST', `/patient/approve-request/${request_id}/`);
  }

  rejectRequest(request_id: number) {
    return this.request('POST', `/patient/reject-request/${request_id}/`);
  }

  // ---------- Doctor ----------

  registerDoctor(payload: {
    full_name: string;
    license_no: string;
    wallet_address: string;
    facility_id: string;
  }) {
    return this.request('POST', '/doctor/register/', payload);
  }

  doctorStatus(wallet: string) {
    return this.request<{ registered: boolean; status?: string; full_name?: string; facility_id?: string }>(
      'GET', `/doctor/status/?wallet=${encodeURIComponent(wallet)}`
    );
  }

  requestAccess(payload: {
    health_id: string;
    doctor_wallet: string;
    doctor_name: string;
    facility_id: string;
    reason: string;
  }) {
    return this.request('POST', '/doctor/request-access/', payload);
  }

  /** Doctors optionally connect MetaMask; the wallet identifies them. */
  doctorViewRecord(health_id: string, wallet: string, facility_id?: string) {
    const headers: Record<string, string> = { 'X-Wallet-Address': wallet };
    if (facility_id) headers['X-Facility-ID'] = facility_id;
    return this.request<any>('GET', `/doctor/patient/${health_id}/`, undefined, headers);
  }

  breakGlass(payload: { health_id: string; facility_id: string; reason: string }, wallet: string) {
    return this.request('POST', '/doctor/break-glass/', payload, {
      'X-Wallet-Address': wallet,
    });
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
