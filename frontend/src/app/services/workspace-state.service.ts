import { Injectable, signal } from '@angular/core';
import type {
  AccessRequest,
  ActivityStoryItem,
  AssignedPatient,
  BlockchainEvent,
  DoctorDashboard,
  FacilityRecord,
  PatientData,
  ReferralItem,
} from './api.service';

export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface StateSnapshot<T> {
  data: T | null;
  status: LoadStatus;
  error: string | null;
  updatedAt: number | null;
}

/** A small signal-backed resource with request de-duplication and explicit invalidation. */
export class StateSlice<T> {
  readonly snapshot = signal<StateSnapshot<T>>({
    data: null,
    status: 'idle',
    error: null,
    updatedAt: null,
  });
  private pending: Promise<T> | null = null;
  private generation = 0;

  get data(): T | null { return this.snapshot().data; }
  get status(): LoadStatus { return this.snapshot().status; }

  set(data: T): void {
    this.snapshot.set({ data, status: 'loaded', error: null, updatedAt: Date.now() });
  }

  async load(loader: () => Promise<T>, refresh = false): Promise<T> {
    if (!refresh && this.data !== null) return this.data;
    if (this.pending) return this.pending;

    this.snapshot.update((state) => ({ ...state, status: 'loading', error: null }));
    const generation = ++this.generation;
    const request = Promise.resolve().then(loader).then((data) => {
      if (generation === this.generation) this.set(data);
      return data;
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Could not load data.';
      if (generation === this.generation) {
        this.snapshot.update((state) => ({ ...state, status: 'error', error: message }));
      }
      throw error;
    }).finally(() => {
      if (generation === this.generation) this.pending = null;
    });
    this.pending = request;
    return request;
  }

  clear(): void {
    this.generation++;
    this.pending = null;
    this.snapshot.set({ data: null, status: 'idle', error: null, updatedAt: null });
  }
}

/** Shared API-backed workspace state. Form drafts, filters and dialogs remain page-local. */
@Injectable({ providedIn: 'root' })
export class WorkspaceStateService {
  readonly patientRecords = new StateSlice<PatientData>();
  readonly patientRequests = new StateSlice<AccessRequest[]>();
  readonly patientActivity = new StateSlice<ActivityStoryItem[]>();

  readonly doctorDashboard = new StateSlice<DoctorDashboard>();
  readonly doctorPatients = new StateSlice<AssignedPatient[]>();
  readonly doctorRequests = new StateSlice<AccessRequest[]>();
  readonly doctorReferrals = new StateSlice<ReferralItem[]>();
  readonly doctorIncoming = new StateSlice<ReferralItem[]>();
  readonly doctorTransactions = new StateSlice<BlockchainEvent[]>();

  readonly hospitalIncoming = new StateSlice<ReferralItem[]>();
  readonly hospitalOutgoing = new StateSlice<ReferralItem[]>();
  readonly hospitalExchange = new StateSlice<unknown[]>();
  readonly hospitalRecords = new StateSlice<FacilityRecord[]>();
  readonly hospitalEvents = new StateSlice<BlockchainEvent[]>();
  readonly hospitalSummary = new StateSlice<{ summary: Record<string, number>; total_transactions: number }>();

  private sessionKey = '';

  /** Start a fresh feature state when another account signs in. */
  bindSession(token: string | null): void {
    const nextKey = token || '';
    if (nextKey === this.sessionKey) return;
    this.sessionKey = nextKey;
    this.reset();
  }

  reset(): void {
    [
      this.patientRecords, this.patientRequests, this.patientActivity,
      this.doctorDashboard, this.doctorPatients, this.doctorRequests, this.doctorReferrals,
      this.doctorIncoming, this.doctorTransactions, this.hospitalIncoming, this.hospitalOutgoing,
      this.hospitalExchange, this.hospitalRecords, this.hospitalEvents, this.hospitalSummary,
    ].forEach((slice) => slice.clear());
  }
}
