import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { NgIf, NgFor, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ApiService, AssignedPatient, HospitalOption, MeasurementItem, PatientRecord, ReferralItem,
} from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';

/**
 * Doctor workspace (PIN-login, JWT-identified).
 * - My Patients: everyone who granted this doctor access, with liveness.
 * - Patient detail: records, measurements (add new), referral to another
 *   hospital via a dropdown, plus the full access-request / break-glass flow.
 */
@Component({
  selector: 'app-doctor-dashboard',
  imports: [NgIf, NgFor, DatePipe, FormsModule],
  template: `
    <div class="mx-auto max-w-6xl">
      <!-- Header -->
      <div class="mb-5 rounded-xl bg-surface p-6 shadow-card">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 class="mb-1 text-2xl font-bold">Doctor Workspace</h1>
            <p class="m-0 text-sm text-muted">
              Dr. {{ auth.fullName }}
              <span *ngIf="hospitalName" class="ml-1">— {{ hospitalName }}</span>
            </p>
          </div>
          <span class="rounded bg-accent-100 px-3 py-1.5 text-sm font-bold text-accent-800">
            ✓ verified · {{ license }}
          </span>
        </div>
      </div>

      <!-- INCOMING REFERRAL TOASTS (poll-fed) -->
      <div class="fixed top-20 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
        <div *ngFor="let n of incomingToasts"
             class="animate-fade-in rounded-xl border-l-4 border-accent-500 bg-surface p-4 shadow-card">
          <div class="mb-1 flex items-center justify-between gap-2">
            <span class="text-sm font-bold text-ink"> Referral received</span>
            <button (click)="dismissReferral(n.id)" aria-label="Dismiss"
                    class="cursor-pointer border-none bg-transparent text-lg leading-none text-muted hover:text-ink">✕</button>
          </div>
          <p class="m-0 text-sm text-ink">
            <strong>{{ n.patient_name }}</strong> ({{ n.patient_health_id }}) sent from
            <strong>{{ n.from_hospital }}</strong>
            <span *ngIf="n.from_doctor" class="block">by Dr. {{ n.from_doctor }}</span>
          </p>
          <p *ngIf="n.reason" class="mb-0 mt-1 rounded-md bg-primary-50 px-2 py-1.5 text-[13px] text-muted italic"> {{ n.reason }}</p>
          <div class="mt-3 flex gap-2">
            <button (click)="respondIncoming(n, 'ACCEPTED')" [disabled]="busyIncoming === n.id"
                    class="flex-1 cursor-pointer rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50"> Accept</button>
            <button (click)="respondIncoming(n, 'DECLINED')" [disabled]="busyIncoming === n.id"
                    class="flex-1 cursor-pointer rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"> Decline</button>
          </div>
        </div>
      </div>

      <div class="mb-5 flex flex-wrap gap-2.5 border-b-2 border-gray-200">
        <button *ngFor="let t of tabs" (click)="tab = t.id"
                class="cursor-pointer border-none bg-transparent px-4.5 py-3 text-[15px]"
                [class]="tab === t.id ? 'border-b-3 border-primary-500 font-bold text-ink' : 'text-muted'">
          {{ t.label }}
          <span *ngIf="t.id === 'referrals' && pendingIncoming > 0"
                class="ml-1.5 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{{ pendingIncoming }}</span>
        </button>
      </div>

      <!-- ================= MY PATIENTS ================= -->
      <div *ngIf="tab === 'patients'" class="animate-fade-in">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="m-0 text-xl font-bold">My Patients</h2>
          <button (click)="loadPatients()" [disabled]="loadingPatients"
                  class="cursor-pointer rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
            ⟳ Refresh
          </button>
        </div>

        <p class="mb-4 text-sm text-muted">
          Patients who granted you access. Liveness is verified against the chain
          when available; expired grants stay listed but marked.
        </p>

        <div *ngFor="let p of patients"
             (click)="openPatient(p)"
             class="mb-3 flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-surface p-4.5 shadow-card transition-shadow hover:shadow-lg">
          <div>
            <p class="m-0 font-bold text-ink"> {{ p.full_name }}</p>
            <p class="m-0 text-sm text-muted">Health ID: {{ p.health_id }}</p>
          </div>
          <div class="text-right text-sm">
            <p class="m-0" [class]="p.active ? 'font-bold text-accent-700' : 'text-red-600'">
              {{ p.active ? '✓ access active' : '✕ access expired/revoked' }}
            </p>
            <p class="m-0 text-xs text-muted">
              until {{ p.expires_at | date:'mediumDate' }}
            </p>
          </div>
        </div>
        <p *ngIf="patients.length === 0 && !loadingPatients" class="py-8 text-center text-muted italic">
          No patients yet — use “Find Patient” to request access.
        </p>
      </div>

      <!-- ================= FIND PATIENT ================= -->
      <div *ngIf="tab === 'find'" class="animate-fade-in">
        <div class="mb-5 rounded-2xl border border-gray-200 bg-slate-50 p-6">
          <h2 class="mb-4 text-xl font-bold">Find Patient</h2>
          <div class="flex flex-wrap gap-3">
            <input [(ngModel)]="healthId" placeholder="Health ID"
                   class="min-w-50 flex-1 rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm" />
            <button (click)="viewRecord()" [disabled]="loading"
                    class="cursor-pointer rounded-lg bg-primary-500 px-4 py-2.5 font-bold text-ink transition-colors hover:bg-primary-400 disabled:opacity-50">
              {{ loading ? 'Checking…' : ' Access Records' }}
            </button>
          </div>

          <!-- DENIED: request access / break-glass -->
          <div *ngIf="denied" class="mt-4 rounded-lg border border-primary-200 bg-primary-50 p-4">
            <p class="m-0 font-semibold text-primary-900">No access permission for this patient.</p>
            <p class="m-0 mt-1 text-sm text-primary-800">
              The patient must approve your request (or use break-glass in an emergency).
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <input [(ngModel)]="requestReason" placeholder="Reason for access"
                     class="flex-1 rounded-md border border-primary-300 px-2.5 py-2 text-sm" />
              <button (click)="requestAccess()"
                      class="cursor-pointer rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600">
                 Request Access
              </button>
              <button (click)="breakGlass()"
                      class="cursor-pointer rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white">
                 Break-Glass
              </button>
            </div>
          </div>
        </div>

        <!-- Patient detail -->
        <div *ngIf="viewedName" class="rounded-xl border border-gray-200 bg-surface p-6 shadow-card">
          <h2 class="mb-1 text-xl font-bold">Records for {{ viewedHealthId }}</h2>
          <p class="mb-4 text-sm text-muted">{{ viewedName }} — every view is logged on-chain.</p>

          <div class="max-h-[460px] overflow-y-auto">
            <div *ngFor="let rec of records"
                 class="mb-3.5 rounded-xl border border-accent-200 bg-surface p-4.5 shadow-card">
              <div class="mb-3 flex flex-wrap items-center gap-3">
                <span class="font-bold text-accent-700"> {{ rec.facility }}</span>
                <span class="text-sm text-muted"> {{ rec.date | date:'medium' }}</span>
                <span class="rounded bg-accent-100 px-2 py-0.5 text-xs font-bold text-accent-900">{{ rec.type }}</span>
                <span *ngIf="rec.verified"
                      class="rounded bg-accent-500 px-2 py-1 text-xs font-semibold text-white"> Verified</span>
              </div>
              <div class="rounded-lg bg-gray-50 p-3">
                <div *ngFor="let item of entries(rec.data)"
                     class="flex border-b border-gray-200 py-1 last:border-b-0">
                  <span class="w-44 shrink-0 font-semibold text-ink">{{ item.key }}:</span>
                  <span class="text-gray-900">{{ item.value }}</span>
                </div>
              </div>
            </div>
            <p *ngIf="records.length === 0" class="py-6 text-center text-muted italic">No records for this patient yet.</p>
          </div>
        </div>
      </div>

      <!-- ================= MEASUREMENTS ================= -->
      <div *ngIf="tab === 'measurements'" class="animate-fade-in">
        <h2 class="mb-4 text-xl font-bold">Disease Measurements</h2>

        <!-- Add measurement -->
        <div class="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-5">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Patient Health ID</span>
              <input [(ngModel)]="meas.health_id" placeholder="e.g. HTD-2024-001"
                     class="rounded-md border border-gray-300 px-2.5 py-2.5 text-sm" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Measurement type</span>
              <select [(ngModel)]="meas.kind" class="rounded-md border border-gray-300 bg-white px-2.5 py-2.5 text-sm">
                <option *ngFor="let k of measurementKinds" [value]="k">{{ k }}</option>
              </select>
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Value</span>
              <input type="number" step="any" [(ngModel)]="meas.value"
                     class="rounded-md border border-gray-300 px-2.5 py-2.5 text-sm" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Notes (optional)</span>
              <input [(ngModel)]="meas.notes" placeholder="e.g. measured after treatment"
                     class="rounded-md border border-gray-300 px-2.5 py-2.5 text-sm" />
            </label>
          </div>
          <button (click)="addMeasurement()" [disabled]="busyMeas"
                  class="mt-3 cursor-pointer rounded-lg bg-accent-500 px-4.5 py-2.5 font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50">
            {{ busyMeas ? 'Saving…' : '＋ Record measurement' }}
          </button>
          <p *ngIf="measMsg" class="mb-0 mt-2 text-sm" [class]="measOk ? 'text-accent-700' : 'text-red-600'">{{ measMsg }}</p>
        </div>

        <!-- History -->
        <div class="flex items-center gap-3">
          <input [(ngModel)]="historyHealthId" placeholder="Health ID to view history"
                 class="min-w-50 flex-1 rounded-md border border-gray-300 px-2.5 py-2 text-sm" />
          <button (click)="loadMeasurements()"
                  class="cursor-pointer rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-ink hover:bg-primary-400">
            View history
          </button>
        </div>
        <table *ngIf="measurementHistory.length" class="mt-4 w-full overflow-hidden rounded-lg bg-white shadow-md">
          <thead>
            <tr class="bg-primary-500 text-left text-ink">
              <th class="px-3 py-2.5 text-sm">Date</th>
              <th class="px-3 py-2.5 text-sm">Type</th>
              <th class="px-3 py-2.5 text-sm">Value</th>
              <th class="px-3 py-2.5 text-sm">By</th>
              <th class="px-3 py-2.5 text-sm">Hospital</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let m of measurementHistory" class="border-b border-gray-200 hover:bg-gray-50">
              <td class="px-3 py-2.5 text-sm">{{ m.created_at | date:'short' }}</td>
              <td class="px-3 py-2.5 text-sm font-semibold">{{ m.kind }}</td>
              <td class="px-3 py-2.5 text-sm">{{ m.value }} {{ m.unit }}</td>
              <td class="px-3 py-2.5 text-sm">{{ m.doctor || '—' }}</td>
              <td class="px-3 py-2.5 text-sm">{{ m.hospital || '—' }}</td>
            </tr>
          </tbody>
        </table>
        <p *ngIf="historyLoaded && measurementHistory.length === 0" class="py-6 text-center text-muted italic">
          No measurements recorded for this patient.
        </p>

        <!-- TREND CHART -->
        <div *ngIf="measurementHistory.length" class="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-5">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 class="m-0 text-lg font-bold"> Trend over time</h3>
            <select [(ngModel)]="trendKind"
                    class="rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm">
              <option *ngFor="let k of trendKinds" [value]="k">{{ k }}</option>
            </select>
          </div>
          <div class="flex flex-wrap items-end gap-6">
            <div>
              <p class="m-0 text-3xl font-bold text-ink">
                {{ trendLatest?.value }}
                <span class="text-base font-normal text-muted">{{ trendLatest?.unit }}</span>
              </p>
              <p class="m-0 text-xs text-muted">latest of {{ trendPoints.length }} reading(s)</p>
            </div>
            <svg viewBox="0 0 300 120" class="h-32 w-full max-w-md" preserveAspectRatio="none">
              <polygon [attr.points]="trendAreaPoints()" fill="#82B440" opacity="0.15"></polygon>
              <polyline [attr.points]="trendLinePoints()" fill="none" stroke="#82B440"
                        stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></polyline>
              <circle *ngFor="let p of trendCircles" [attr.cx]="p.x" [attr.cy]="p.y"
                      r="3.5" fill="#82B440"></circle>
            </svg>
          </div>
          <p *ngIf="trendPoints.length < 2" class="mb-0 mt-2 text-xs text-muted">
            One reading of this type so far — the line appears with the second one.
          </p>
        </div>
      </div>

      <!-- ================= REFERRALS ================= -->
      <div *ngIf="tab === 'referrals'" class="animate-fade-in">
        <h2 class="mb-4 text-xl font-bold">Refer a Patient to Another Hospital</h2>

        <div class="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-5">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Patient Health ID</span>
              <input [(ngModel)]="referral.health_id" placeholder="e.g. HTD-2024-001"
                     class="rounded-md border border-gray-300 px-2.5 py-2.5 text-sm" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Send to hospital</span>
              <select [(ngModel)]="referral.to_hospital"
                      class="rounded-md border border-gray-300 bg-white px-2.5 py-2.5 text-sm">
                <option value="" disabled>Select hospital…</option>
                <option *ngFor="let h of hospitals" [value]="h.code">
                  {{ h.name }}<span *ngIf="h.region"> — {{ h.region }}</span>
                  <span *ngIf="h.code === myHospitalCode"> (your hospital)</span>
                </option>
              </select>
            </label>
            <label class="flex flex-col gap-1.5 sm:col-span-2">
              <span class="text-[13px] font-semibold text-ink">Reason / diagnosis summary</span>
              <textarea [(ngModel)]="referral.reason" rows="2"
                        placeholder="e.g. needs specialist oncology review not available here"
                        class="rounded-md border border-gray-300 px-2.5 py-2.5 text-sm"></textarea>
            </label>
          </div>
          <button (click)="sendReferral()" [disabled]="busyRef || !referral.to_hospital"
                  class="mt-3 cursor-pointer rounded-lg bg-accent-500 px-4.5 py-2.5 font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50">
            {{ busyRef ? 'Sending…' : ' Send referral' }}
          </button>
          <p *ngIf="refMsg" class="mb-0 mt-2 text-sm" [class]="refOk ? 'text-accent-700' : 'text-red-600'">{{ refMsg }}</p>
        </div>

        <!-- Incoming to my hospital (doctors of the receiving hospital can respond) -->
        <div *ngIf="incomingAll.length" class="mb-6">
          <h3 class="mb-3 text-lg font-bold"> Incoming — {{ hospitalName || 'my hospital' }}</h3>
          <div *ngFor="let r of incomingAll"
               class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-accent-500 bg-surface p-4 shadow-card">
            <div>
              <p class="m-0 font-bold text-ink"> {{ r.patient_name }} <span class="text-sm font-normal text-muted">({{ r.patient_health_id }})</span></p>
              <p class="m-0 text-sm text-muted">from {{ r.from_hospital }}<span *ngIf="r.from_doctor"> · Dr. {{ r.from_doctor }}</span> · {{ r.reason || 'no reason given' }}</p>
            </div>
            <div class="flex gap-2">
              <button (click)="respondIncoming(r, 'ACCEPTED')" [disabled]="busyIncoming === r.id"
                      class="cursor-pointer rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50"> Accept</button>
              <button (click)="respondIncoming(r, 'DECLINED')" [disabled]="busyIncoming === r.id"
                      class="cursor-pointer rounded-md bg-red-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"> Decline</button>
            </div>
          </div>
        </div>

        <h3 class="mb-3 text-lg font-bold">Referrals I've sent</h3>
        <div *ngFor="let r of referralsSent"
             class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-surface p-4 shadow-card">
          <div>
            <p class="m-0 font-bold text-ink"> {{ r.patient_name }} <span class="text-sm font-normal text-muted">({{ r.patient_health_id }})</span></p>
            <p class="m-0 text-sm text-muted">→  {{ r.to_hospital }} · {{ r.reason || 'no reason given' }}</p>
          </div>
          <span class="rounded px-2.5 py-1 text-xs font-bold"
                [class]="referralBadge(r.status)">{{ r.status }}</span>
        </div>
        <p *ngIf="referralsSent.length === 0" class="py-6 text-center text-muted italic">No referrals sent yet.</p>
      </div>
    </div>
  `,
})
export class DoctorLandingComponent implements OnDestroy, OnInit {
  tab: 'patients' | 'find' | 'measurements' | 'referrals' = 'patients';
  tabs = [
    { id: 'patients', label: '‍‍ My Patients' },
    { id: 'find', label: ' Find Patient' },
    { id: 'measurements', label: ' Measurements' },
    { id: 'referrals', label: ' Referrals' },
  ] as const;

  license = '';
  hospitalName = '';
  myHospitalCode = '';

  // patients
  patients: AssignedPatient[] = [];
  loadingPatients = false;

  // find patient
  healthId = '';
  requestReason = '';
  viewedName = '';
  viewedHealthId = '';
  records: PatientRecord[] = [];
  denied = false;
  loading = false;

  // measurements
  measurementKinds = [
    'Blood pressure (systolic)', 'Blood pressure (diastolic)', 'Heart rate',
    'Temperature', 'Blood sugar', 'SpO₂', 'Weight', 'Hemoglobin', 'Malaria RDT',
  ];
  meas = { health_id: '', kind: this.measurementKinds[0], value: null as number | null, unit: '', notes: '' };
  busyMeas = false;
  measMsg = '';
  measOk = false;
  historyHealthId = '';
  measurementHistory: MeasurementItem[] = [];
  historyLoaded = false;

  // referrals
  hospitals: HospitalOption[] = [];
  referral = { health_id: '', to_hospital: '', reason: '' };
  busyRef = false;
  refMsg = '';
  refOk = false;
  referralsSent: ReferralItem[] = [];

  // incoming referral notifications (toasts + referrals tab)
  incomingAll: ReferralItem[] = [];
  incomingToasts: ReferralItem[] = [];
  pendingIncoming = 0;
  busyIncoming: number | null = null;
  private dismissedReferrals = new Set<number>();
  private referralTimer: any = null;

  // measurement trend chart
  trendKind = '';

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  /**
   * Angular 22 is zoneless by default — async property assignments don't
   * re-render the page. Call after every async state mutation.
   */
  private syncView() {
    this.cdr.detectChanges();
  }

  async ngOnInit() {
    if (!this.auth.isDoctor) {
      // Not signed in — the route guard normally prevents this.
      return;
    }
    this.license = this.auth.licenseNo;
    this.myHospitalCode = this.auth.hospitalCode;
    try {
      const me = await this.api.doctorMe();
      this.hospitalName = me.hospital_name || me.hospital_code;
    } catch { /* keep code label */ }

    const safeHospitals = await this.api.hospitals().catch(() => [] as HospitalOption[]);
    this.hospitals = safeHospitals;
    this.syncView();

    await this.loadPatients();
    await this.loadReferralsSent();
    this.startReferralPolling();
  }

  ngOnDestroy() {
    if (this.referralTimer) clearInterval(this.referralTimer);
  }

  /** Poll referrals addressed to my hospital so toasts appear live. */
  private startReferralPolling() {
    this.referralTimer = setInterval(() => this.refreshIncoming(), 15000);
  }

  async refreshIncoming() {
    try {
      this.incomingAll = await this.api.incomingReferrals();
      this.incomingToasts = this.incomingAll.filter((r) => !this.dismissedReferrals.has(r.id));
      this.pendingIncoming = this.incomingAll.length;
    } catch {
      // offline tick — retry on the next cycle
    }
    this.syncView();
  }

  dismissReferral(id: number) {
    this.dismissedReferrals.add(id);
    this.incomingToasts = this.incomingToasts.filter((r) => r.id !== id);
  }

  jumpToReferrals() {
    this.tab = 'referrals';
  }

  async respondIncoming(r: ReferralItem, action: 'ACCEPTED' | 'DECLINED') {
    this.busyIncoming = r.id;
    this.syncView();
    try {
      await this.api.respondReferral(r.id, action);
      await this.refreshIncoming();
      await this.loadReferralsSent();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    } finally {
      this.busyIncoming = null;
      this.syncView();
    }
  }

  unitsFor(kind: string): string {
    if (kind.startsWith('Blood pressure')) return 'mmHg';
    if (kind === 'Heart rate') return 'bpm';
    if (kind === 'Temperature') return '°C';
    if (kind === 'Blood sugar') return 'mmol/L';
    if (kind === 'SpO₂') return '%';
    if (kind === 'Weight') return 'kg';
    if (kind === 'Hemoglobin') return 'g/dL';
    return '';
  }

  private setUnit() {
    this.meas.unit = this.unitsFor(this.meas.kind);
  }

  async loadPatients() {
    this.loadingPatients = true;
    this.syncView();
    try {
      this.patients = await this.api.myPatients();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed to load patients'));
    } finally {
      this.loadingPatients = false;
      this.syncView();
    }
  }

  openPatient(p: AssignedPatient) {
    this.healthId = p.health_id;
    this.tab = 'find';
    void this.viewRecord();
  }

  async viewRecord() {
    if (!this.healthId.trim()) return;
    this.loading = true;
    this.denied = false;
    this.records = [];
    this.viewedName = '';
    this.viewedHealthId = '';
    this.syncView();
    try {
      const res = await this.api.doctorViewRecord(this.healthId.trim());
      this.viewedName = res.full_name;
      this.viewedHealthId = res.health_id;
      this.records = res.records || [];
    } catch (e: any) {
      if (e?.status === 403) {
        this.denied = true;
      } else {
        alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
      }
    } finally {
      this.loading = false;
      this.syncView();
    }
  }

  async requestAccess() {
    try {
      await this.api.requestAccess({
        health_id: this.healthId.trim(),
        reason: this.requestReason || 'Clinical care',
      });
      alert('Request sent — the patient will approve or reject it.');
      this.requestReason = '';
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    }
  }

  async breakGlass() {
    const reason = this.requestReason.trim();
    if (!reason) {
      alert('A reason is required for break-glass access.');
      return;
    }
    if (!confirm('Use break-glass? This emergency access will be permanently logged on-chain.')) return;
    try {
      await this.api.breakGlass({
        health_id: this.healthId.trim(),
        facility_id: this.myHospitalCode || 'UNKNOWN',
        reason,
      });
      await this.viewRecord();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    }
  }

  async addMeasurement() {
    this.measMsg = '';
    this.measOk = false;
    this.setUnit();
    if (!this.meas.health_id.trim() || this.meas.value === null || isNaN(this.meas.value)) {
      this.measMsg = 'Health ID and a numeric value are required.';
      return;
    }
    this.busyMeas = true;
    this.syncView();
    try {
      const res: any = await this.api.addMeasurement({
        health_id: this.meas.health_id.trim(),
        kind: this.meas.kind,
        value: this.meas.value,
        unit: this.meas.unit,
        notes: this.meas.notes,
      });
      this.measOk = true;
      this.measMsg = res.message || 'Measurement recorded.';
      this.meas = { health_id: this.meas.health_id, kind: this.measurementKinds[0], value: null, unit: '', notes: '' };
      if (this.historyHealthId.trim().toLowerCase() === this.meas.health_id.trim().toLowerCase()) {
        await this.loadMeasurements();
      }
    } catch (e: any) {
      this.measMsg = e?.error?.error || e?.message || 'Failed to record measurement';
    } finally {
      this.busyMeas = false;
      this.syncView();
    }
  }

  async loadMeasurements() {
    if (!this.historyHealthId.trim()) return;
    try {
      this.measurementHistory = await this.api.patientMeasurements(this.historyHealthId.trim());
      this.historyLoaded = true;
      const kinds = this.trendKinds;
      if (!kinds.includes(this.trendKind)) this.trendKind = kinds[0] || '';
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed to load measurements'));
    }
    this.syncView();
  }

  async sendReferral() {
    this.refMsg = '';
    this.refOk = false;
    if (!this.referral.health_id.trim() || !this.referral.to_hospital) {
      this.refMsg = 'Health ID and target hospital are required.';
      return;
    }
    this.busyRef = true;
    this.syncView();
    try {
      const res: any = await this.api.createReferral({
        health_id: this.referral.health_id.trim(),
        to_hospital: this.referral.to_hospital,
        reason: this.referral.reason,
      });
      this.refOk = true;
      this.refMsg = res.message || 'Referral sent.';
      this.referral = { health_id: '', to_hospital: '', reason: '' };
      await this.loadReferralsSent();
    } catch (e: any) {
      this.refMsg = e?.error?.error || e?.message || 'Failed to send referral';
    } finally {
      this.busyRef = false;
      this.syncView();
    }
  }

  async loadReferralsSent() {
    try {
      this.referralsSent = await this.api.myReferralsSent();
    } catch {
      this.referralsSent = [];
    }
    this.syncView();
  }

  // ---------- Measurement trend chart ----------

  get trendKinds(): string[] {
    return [...new Set(this.measurementHistory.map((m) => m.kind))];
  }

  get trendPoints(): MeasurementItem[] {
    return this.measurementHistory
      .filter((m) => m.kind === this.trendKind)
      .sort((a, b) => +new Date(a.created_at || 0) - +new Date(b.created_at || 0));
  }

  get trendLatest(): MeasurementItem | null {
    const pts = this.trendPoints;
    return pts.length ? pts[pts.length - 1] : null;
  }

  /** SVG coordinates (viewBox 0 0 300 120) for the trend polyline. */
  private trendCoords(): { x: number; y: number }[] {
    const pts = this.trendPoints;
    if (!pts.length) return [];
    const values = pts.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const step = pts.length > 1 ? 280 / (pts.length - 1) : 0;
    return pts.map((p, i) => ({
      x: 10 + i * step,
      y: 105 - ((p.value - min) / span) * 90,
    }));
  }

  trendLinePoints(): string {
    return this.trendCoords().map((c) => `${c.x},${c.y}`).join(' ');
  }

  trendAreaPoints(): string {
    const c = this.trendCoords();
    if (c.length < 2) return '';
    return `${c[0].x},115 ${c.map((p) => `${p.x},${p.y}`).join(' ')} ${c[c.length - 1].x},115`;
  }

  get trendCircles(): { x: number; y: number }[] {
    return this.trendCoords();
  }

  referralBadge(status: string): string {
    switch (status) {
      case 'ACCEPTED':  return 'bg-accent-500 text-white';
      case 'DECLINED':  return 'bg-red-500 text-white';
      case 'CANCELLED': return 'bg-gray-200 text-ink';
      default:          return 'bg-primary-300 text-ink'; // PENDING
    }
  }

  entries(data: any): { key: string; value: any }[] {
    if (!data) return [];
    return Object.entries(data).map(([key, value]) => ({ key, value }));
  }
}
