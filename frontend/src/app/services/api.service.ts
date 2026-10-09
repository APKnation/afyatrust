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
  source_uri?: string;
}

export interface AuditEvent {
  accessor: string;
  role: string;
  facility: string;
  action: string;
  timestamp: number;
  transaction_hash?: string;
}

export interface BlockchainEvent {
  transaction_hash: string;
  block_number: number;
  event: string;
  args: Record<string, any>;
  etherscan_url: string;
  timestamp?: number;
  datetime?: number;
}

export interface BlockchainEventsResponse {
  hospital_code: string;
  events: BlockchainEvent[];
  count: number;
}

export interface PatientBlockchainHistoryResponse {
  health_id: string;
  events: BlockchainEvent[];
  count: number;
}

/** One human-readable entry of the unified on-chain activity story. */
export interface ActivityStoryItem {
  action: string;
  event: string;
  who: string;
  wallet: string;
  role: string;
  facility: string;
  verb: string;
  icon: string;
  timestamp: number;
  transaction_hash: string | null;
  etherscan_url: string | null;
}

export interface ActivityStoryResponse {
  health_id: string;
  story: ActivityStoryItem[];
  count: number;
}

export interface HospitalBlockchainSummaryResponse {
  hospital_code: string;
  summary: Record<string, number>;
  total_transactions: number;
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

/** Doctor entry returned by the patient-facing doctor lookup. */
export interface DoctorOption {
  id: number;
  license_no: string;
  full_name: string;
  wallet_address: string;
  facility_id: string;
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
  responded_at?: string;
  created_at: string;
}

/** A record added by hospital staff (facility view). */
export interface FacilityRecord {
  id: number;
  health_id: string;
  patient_name: string;
  facility: string;
  record_type: string;
  record_data: Record<string, any>;
  record_hash: string;
  tx_hash: string;
  verified: boolean;
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

  patientProfile(): Promise<{ health_id: string; full_name: string; phone: string; wallet_address: string }> {
    return this.request('GET', '/patient/profile/');
  }

  patchPatientProfile(payload: { full_name: string; phone: string }) {
    return this.request('POST', '/patient/profile/patch/', payload);
  }

  /** Counts of active grants, pending requests, expiring-soon grants. */
  patientGrantAccessStatus(): Promise<{
    activeCount: number;
    pendingCount: number;
    expiringSoon: number;
    lastGrantAt: string | null;
    lastGrantDoctor: string | null;
  }> {
    return this.request('GET', '/patient/grant-access/status/');
  }

  /** Wallet-centric activity summary (address, last tx, pending ops). */
  patientWalletActivity(): Promise<{
    wallet_address: string;
    health_id: string;
    full_name: string;
    activityCount: number;
    lastTxHash: string | null;
    lastActivityAt: number | null;
    pendingOperations: number;
  }> {
    return this.request('GET', '/patient/wallet/activity/');
  }

  /** Blockchain-secured referral story: records anchored by sending hospital,
   * on-chain referral-acceptance tx, and receiving-hospital view events. */
  patientReferralTimeline(): Promise<{
    health_id: string;
    referrals: {
      id: number;
      patient_health_id: string;
      patient_name: string;
      from_hospital: string;
      from_hospital_code: string;
      from_doctor: string;
      to_hospital: string;
      to_hospital_code: string;
      reason: string;
      status: string;
      responded_by: string;
      created_at: string;
      responded_at: string;
      tx_hash: string;
      on_chain_referral_tx: string;
      on_chain_referral_accepted: boolean;
      on_chain_referral_tx_hash: string | null;
      from_hospital_records: {
        record_hash: string;
        facility_id: string;
        facility_name?: string;
        record_type?: string;
        metadata_uri: string | null;
        tx_hash?: string;
        verified?: boolean;
        created_at?: string;
        on_chain_timestamp?: number;
      }[];
      receiving_hospital_views: {
        accessor: string;
        role: string;
        facility_id: string;
        timestamp: number;
      }[];
    }[];
  }> {
    return this.request('GET', '/patient/referral-timeline/');
  }

  myMeasurements(): Promise<MeasurementItem[]> {
    return this.request<MeasurementItem[]>('GET', '/patient/measurements/');
  }

  myReferrals(): Promise<ReferralItem[]> {
    return this.request<ReferralItem[]>('GET', '/patient/referrals/');
  }

  /** Patient asks to be referred to another hospital (staff must accept). */
  sendPatientReferral(payload: { to_hospital: string; reason: string }) {
    return this.request('POST', '/patient/referrals/send/', payload);
  }

  myRequests(): Promise<AccessRequest[]> {
    return this.request<AccessRequest[]>('GET', '/patient/requests/');
  }

  /** Patient-facing doctor lookup: free-text search by name or license. */
  listDoctors(query?: string): Promise<DoctorOption[]> {
    const q = query ? `?q=${encodeURIComponent(query)}` : '';
    return this.request<DoctorOption[]>('GET', '/list-doctors/' + q);
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

  /** Doctor's own assigned patients (granted access, fresh from chain). */
  myPatients(): Promise<AssignedPatient[]> {
    return this.request<AssignedPatient[]>('GET', '/doctor/patients/');
  }

  /** This doctor's access requests with patient responses (approve/reject). */
  doctorPendingRequests(): Promise<AccessRequest[]> {
    return this.request<AccessRequest[]>('GET', '/doctor/pending-requests/');
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

  /** Referrals sent to this doctor's hospital (incoming, doctor-facing). */
  incomingReferrals(): Promise<ReferralItem[]> {
    return this.request<ReferralItem[]>('GET', '/doctor/referrals/incoming/');
  }

  // ---------- Account ----------

  /** Rotate the signed-in user's own PIN/password (any role). */
  changeSecret(current_secret: string, new_secret: string) {
    return this.request('POST', '/account/change-secret/', { current_secret, new_secret });
  }

  // ---------- Hospital staff ----------

  hospitalReferrals(status?: string): Promise<ReferralItem[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<ReferralItem[]>('GET', `/staff/referrals/${q}`);
  }

  /** Referrals sent FROM this hospital to another hospital. */
  hospitalOutgoingReferrals(status?: string): Promise<ReferralItem[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<ReferralItem[]>('GET', `/staff/referrals/outgoing/${q}`);
  }

  /** Records this hospital has anchored on-chain — the exchange pointers. */
  hospitalRecordsExchange(): Promise<{
    id: number;
    health_id: string;
    patient_name: string;
    record_type: string;
    record_hash: string;
    metadata_uri: string;
    tx_hash: string;
    verified: boolean;
    created_at: string;
  }[]> {
    return this.request('GET', '/staff/records-exchange/');
  }

  respondReferral(referral_id: number, action: 'ACCEPTED' | 'DECLINED') {
    return this.request('POST', `/staff/referrals/${referral_id}/respond/`, { action });
  }

  breakGlass(payload: { health_id: string; facility_id: string; reason: string }) {
    return this.request('POST', '/doctor/break-glass/', payload);
  }

  // ---------- Facility ----------

  /** Staff adds a clinical record: data off-chain, SHA-256 hash on-chain. */
  addRecord(payload: {
    health_id: string;
    facility_id: string;
    facility_name: string;
    record_type: string;
    record_data: any;
  }) {
    return this.request<{ status: string; record_id: number; hash: string; tx_hash: string }>(
      'POST', '/add-record/', payload
    );
  }

  /** Recent records added by my hospital (staff view, on-chain status). */
  facilityRecords(): Promise<FacilityRecord[]> {
    return this.request<FacilityRecord[]>('GET', '/facility/records/');
  }

  // ---------- Blockchain Event History (Etherscan-verified) ----------

  /** Fetch blockchain events for the authenticated user's hospital. */
  blockchainEvents(params?: {
    event_type?: string;
    health_id?: string;
    from_block?: string;
    to_block?: string;
    limit?: number;
  }): Promise<BlockchainEventsResponse> {
    const query = new URLSearchParams();
    if (params?.event_type) query.set('event_type', params.event_type);
    if (params?.health_id) query.set('health_id', params.health_id);
    if (params?.from_block) query.set('from_block', params.from_block);
    if (params?.to_block) query.set('to_block', params.to_block);
    if (params?.limit) query.set('limit', params.limit.toString());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<BlockchainEventsResponse>('GET', `/blockchain/events/${qs}`);
  }

  /** Fetch complete blockchain transaction history for a specific patient. */
  patientBlockchainHistory(health_id: string): Promise<PatientBlockchainHistoryResponse> {
    return this.request<PatientBlockchainHistoryResponse>('GET', `/blockchain/patient/${encodeURIComponent(health_id)}/`);
  }

  /** Unified human-readable on-chain story: who did what, when — tx-verified. */
  patientActivityStory(health_id: string): Promise<ActivityStoryResponse> {
    return this.request<ActivityStoryResponse>(
      'GET', `/blockchain/patient/${encodeURIComponent(health_id)}/story/`
    );
  }

  /** Get a summary of blockchain activity for the hospital. */
  hospitalBlockchainSummary(): Promise<HospitalBlockchainSummaryResponse> {
    return this.request<HospitalBlockchainSummaryResponse>('GET', '/blockchain/hospital-summary/');
  }
}
