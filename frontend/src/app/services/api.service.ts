import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export interface Patient {
  health_id: string;
  wallet_address: string;
  full_name: string;
  phone?: string;
  created_at?: string;
}

export interface PatientRecord {
  id?: number;
  facility: string;
  type: string;
  data: any;
  hash: string;
  date: string;
  verified: boolean;
  tx_hash?: string;
}

export interface PatientData {
  health_id: string;
  full_name: string;
  records: PatientRecord[];
  audit_trail: any[];
}

export interface AccessRequest {
  id: number;
  patient_health_id?: string;
  patient_name?: string;
  doctor_name: string;
  doctor_wallet: string;
  facility_id: string;
  reason: string;
  status: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private api = environment.apiUrl;

  private async request<T>(
    method: string,
    endpoint: string,
    body?: any,
    headers: Record<string, string> = {}
  ): Promise<T> {
    const hdrs: Record<string, string> = {
      ...headers,
      'Content-Type': 'application/json',
    };
    const token = localStorage.getItem('afyatrust_token');
    if (token) hdrs['Authorization'] = `Bearer ${token}`;

    // Backend identifies the caller by wallet address.
    const wallet = localStorage.getItem('afyatrust_wallet');
    if (wallet) hdrs['X-Wallet-Address'] = wallet;

    const res = await fetch(`${this.api}${endpoint}`, {
      method,
      headers: hdrs,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = new Error('Request failed');
      (err as any).status = res.status;
      (err as any).error = data;
      throw err;
    }

    return data as T;
  }

  // ---------- Auth ----------

  async authNonce(wallet_address: string): Promise<{ nonce: string; message: string }> {
    return this.request('POST', '/auth/nonce/', { wallet_address });
  }

  async authLogin(wallet_address: string, signature: string): Promise<any> {
    return this.request('POST', '/auth/login/', { wallet_address, signature });
  }

  async registerDoctor(payload: { wallet_address: string; full_name: string; facility_id?: string }): Promise<any> {
    return this.request('POST', '/auth/register-doctor/', payload);
  }

  // ---------- Patients / Registration ----------

  async registerPatient(patient: Patient): Promise<any> {
    return this.request('POST', '/register/', patient);
  }

  async addRecord(payload: any): Promise<any> {
    return this.request('POST', '/add-record/', payload);
  }

  // ---------- Patient dashboard ----------

  async myRecords(): Promise<PatientData> {
    return this.request<PatientData>('GET', '/patient/my-records/');
  }

  async myAccessRequests(): Promise<AccessRequest[]> {
    return this.request<AccessRequest[]>('GET', '/patient/pending-requests/');
  }

  async myPermissions(): Promise<any[]> {
    return this.request<any[]>('GET', '/patient/permissions/');
  }

  async myAuditTrail(): Promise<any[]> {
    return this.request<any[]>('GET', '/patient/audit-trail/');
  }

  async grantAccess(payload: { doctor_wallet: string; doctor_name: string; days: number }): Promise<any> {
    return this.request('POST', '/patient/grant-access/', payload);
  }

  async revokeAccess(doctor_wallet: string): Promise<any> {
    return this.request('POST', '/patient/revoke-access/', { doctor_wallet });
  }

  async approveRequest(request_id: number): Promise<any> {
    return this.request('POST', `/patient/approve-request/${request_id}/`);
  }

  async rejectRequest(request_id: number): Promise<any> {
    return this.request('POST', `/patient/reject-request/${request_id}/`);
  }

  // ---------- Doctor dashboard ----------

  async doctorPendingRequests(): Promise<AccessRequest[]> {
    return this.request<AccessRequest[]>('GET', '/patient/pending-requests/');
  }

  async doctorViewRecord(health_id: string, facility_id?: string): Promise<any> {
    const url = facility_id
      ? `/doctor/patient/${health_id}/?facility_id=${encodeURIComponent(facility_id)}`
      : `/doctor/patient/${health_id}/`;
    return this.request<any>('GET', url);
  }

  async doctorGrantAccess(req: any): Promise<any> {
    return this.request('POST', '/doctor/grant-access/', {
      request_id: req.id,
      doctor_wallet: req.doctor_wallet,
      doctor_name: req.doctor_name,
    });
  }

  async breakGlass(payload: { health_id: string; facility_id: string; reason: string }): Promise<any> {
    return this.request('POST', '/doctor/break-glass/', payload);
  }
}
