import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { NgIf, NgFor, DatePipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ApiService, FacilityRecord, ReferralItem,
} from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';

/**
 * Hospital workspace: referral desk + staff record entry.
 * Clean typographic design matching the landing page — no decorative glyphs.
 * Staff of the receiving hospital see incoming referrals and accept or
 * decline them. The Add Record form writes the SHA-256 hash of clinical
 * data to Sepolia (real addRecord transaction) and lists each record's
 * on-chain status with an Etherscan link.
 */
@Component({
  selector: 'app-hospital-dashboard',
  imports: [NgIf, NgFor, DatePipe, SlicePipe, FormsModule],
  template: `
    <div class="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <!-- Hero header -->
      <div class="card mb-6 p-6 sm:p-8">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span class="eyebrow mb-2">Hospital Desk</span>
            <h1 class="mb-1 text-2xl font-bold text-ink sm:text-3xl">{{ hospitalName || 'Hospital' }}</h1>
            <p class="m-0 text-sm text-muted">
              Signed in as <strong class="text-ink">{{ auth.fullName }}</strong>
              <span *ngIf="auth.hospitalCode" class="mx-2 text-gray-300">|</span>
              Facility code <strong class="text-ink">{{ auth.hospitalCode }}</strong>
            </p>
          </div>
          <span class="rounded-full bg-accent-100 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-accent-800">
            {{ pendingCount }} pending referrals
          </span>
        </div>
      </div>

      <!-- Tabs -->
      <div class="mb-6 flex flex-wrap gap-1 border-b-2 border-gray-200">
        <button (click)="setTab('referrals')"
                class="cursor-pointer border-none bg-transparent px-4 py-3 text-[15px] transition-colors"
                [class]="tab === 'referrals' ? 'border-b-3 border-primary-500 font-bold text-ink' : 'text-muted hover:text-ink'">
          Referral Desk
          <span *ngIf="pendingCount > 0"
                class="ml-1.5 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{{ pendingCount }}</span>
        </button>
        <button (click)="setTab('records'); loadFacilityRecords()"
                class="cursor-pointer border-none bg-transparent px-4 py-3 text-[15px] transition-colors"
                [class]="tab === 'records' ? 'border-b-3 border-primary-500 font-bold text-ink' : 'text-muted hover:text-ink'">
          Add Record
        </button>
      </div>

      <!-- ================= REFERRAL DESK ================= -->
      <div *ngIf="tab === 'referrals'" class="animate-fade-in">
        <!-- Filters -->
        <div class="mb-5 flex flex-wrap gap-2">
          <button *ngFor="let f of filters" (click)="setFilter(f.value)"
                  class="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                  [class]="filter === f.value ? 'bg-ink text-white' : 'bg-primary-100 text-ink hover:bg-primary-200'">
            {{ f.label }}
            <span *ngIf="f.value === 'PENDING' && pendingCount > 0"
                  class="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] text-white">{{ pendingCount }}</span>
          </button>
        </div>

        <!-- Referral list -->
        <div *ngFor="let r of referrals" class="card mb-4 p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="m-0 text-lg font-bold text-ink">
                {{ r.patient_name }}
                <span class="text-sm font-normal text-muted">({{ r.patient_health_id }})</span>
              </p>
              <p class="m-0 mt-1 text-sm text-muted">
                From: <strong>{{ r.from_hospital || 'Unknown facility' }}</strong>
                <span *ngIf="r.from_doctor" class="ml-1">· Dr. {{ r.from_doctor }}</span>
              </p>
              <p *ngIf="r.reason" class="mb-0 mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm italic text-ink">
                {{ r.reason }}
              </p>
              <p class="m-0 mt-2 text-xs text-muted">Sent {{ r.created_at | date:'medium' }}</p>
              <p *ngIf="r.responded_by" class="m-0 text-xs text-muted">
                Responded by {{ r.responded_by }} {{ r.responded_at ? ('· ' + (r.responded_at | date:'short')) : '' }}
              </p>
            </div>
            <div class="flex flex-col items-end gap-2.5">
              <span class="rounded-full px-3 py-1 text-xs font-bold" [class]="badge(r.status)">{{ r.status }}</span>
              <div *ngIf="r.status === 'PENDING'" class="flex gap-2">
                <button (click)="respond(r, 'ACCEPTED')" [disabled]="busyId === r.id"
                        class="cursor-pointer rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50">
                  Accept
                </button>
                <button (click)="respond(r, 'DECLINED')" [disabled]="busyId === r.id"
                        class="cursor-pointer rounded-lg border-2 border-red-500 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500 hover:text-white disabled:opacity-50">
                  Decline
                </button>
              </div>
            </div>
          </div>
        </div>

        <div *ngIf="referrals.length === 0 && !loading" class="card p-10 text-center">
          <h3 class="mb-1 text-lg font-bold">
            {{ filter === 'PENDING' ? 'All caught up' : 'Nothing here yet' }}
          </h3>
          <p class="m-0 text-muted">
            {{ filter === 'PENDING' ? 'No pending referrals right now.' : 'No referrals match this filter.' }}
          </p>
        </div>
      </div>

      <!-- ================= ADD RECORD ================= -->
      <div *ngIf="tab === 'records'" class="animate-fade-in">
        <div class="card mb-6 p-6">
          <h2 class="mb-1 text-xl font-bold">Add Medical Record</h2>
          <p class="m-0 text-sm text-muted">
            Clinical data stays off-chain. A SHA-256 hash of the content is written to
            Sepolia, so patients and doctors can verify it on Etherscan.
          </p>
        </div>

        <div class="card mb-5 p-6">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Patient Health ID</span>
              <input [(ngModel)]="form.health_id" placeholder="e.g. 1234"
                     class="rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Record type</span>
              <select [(ngModel)]="form.record_type"
                      class="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm">
                <option *ngFor="let t of recordTypes" [value]="t">{{ t }}</option>
              </select>
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Facility name (shown to patient)</span>
              <input [(ngModel)]="form.facility_name" [placeholder]="hospitalName || 'Hospital name'"
                     class="rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
            </label>
          </div>

          <!-- key/value rows -->
          <div class="mt-4">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-[13px] font-semibold text-ink">Clinical data (field — value)</span>
              <button (click)="addRow()" type="button"
                      class="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-ink">
                Add field
              </button>
            </div>
            <div *ngFor="let row of rows; let i = index" class="mb-2 flex flex-wrap gap-2">
              <input [(ngModel)]="row.key" [placeholder]="'field, e.g. ' + keyHints[i % keyHints.length]"
                     class="min-w-40 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input [(ngModel)]="row.value" placeholder="value"
                     class="min-w-40 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <button *ngIf="rows.length > 1" (click)="removeRow(i)" type="button" aria-label="Remove field"
                      class="cursor-pointer rounded-lg border border-gray-300 bg-white px-3.5 text-sm font-semibold text-red-600 transition-colors hover:border-red-500">
                ×
              </button>
            </div>
          </div>

          <button (click)="submitRecord()" [disabled]="busy || !form.health_id"
                  class="mt-4 cursor-pointer rounded-lg bg-accent-500 px-6 py-3 font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50">
            {{ busy ? 'Writing to Sepolia — this can take about 30 seconds…' : 'Add record to blockchain' }}
          </button>
          <p *ngIf="formMsg" class="mb-0 mt-2 text-sm" [class]="formOk ? 'text-accent-700' : 'text-red-600'">{{ formMsg }}</p>
        </div>

        <!-- Success box with Etherscan link -->
        <div *ngIf="lastResult" class="card mb-5 border-l-4 border-accent-500 p-6">
          <h3 class="mb-2 text-lg font-bold text-accent-900">Record written to Sepolia</h3>
          <div class="flex flex-col gap-1.5 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-ink">Record hash:</span>
              <code class="rounded bg-gray-50 px-2 py-1 font-mono text-xs">{{ lastResult.hash }}</code>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-ink">Transaction:</span>
              <a *ngIf="!lastResult.tx_hash.startsWith('PENDING')"
                 [href]="'https://sepolia.etherscan.io/tx/' + lastResult.tx_hash"
                 target="_blank" rel="noopener"
                 class="rounded bg-gray-50 px-2 py-1 font-mono text-xs text-accent-700 underline">
                {{ lastResult.tx_hash | slice:0:26 }}… view on Etherscan
              </a>
              <code *ngIf="lastResult.tx_hash.startsWith('PENDING')"
                    class="rounded bg-gray-50 px-2 py-1 font-mono text-xs text-red-600">
                {{ lastResult.tx_hash }}
              </code>
            </div>
            <p class="m-0 text-xs text-muted">
              Verify it: Etherscan — contract — Read Contract — getRecords — enter the patient's Health ID.
            </p>
          </div>
        </div>

        <!-- Recent facility records -->
        <div class="card p-6">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 class="m-0 text-lg font-bold">Recent records — {{ hospitalName || 'my hospital' }}</h3>
            <button (click)="loadFacilityRecords()" [disabled]="loadingRecords"
                    class="cursor-pointer rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink">
              Refresh
            </button>
          </div>
          <div *ngFor="let r of facilityRecords" class="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div class="mb-2 flex flex-wrap items-center gap-3">
              <span class="font-bold text-ink">{{ r.patient_name }}</span>
              <span class="text-xs text-muted">({{ r.health_id }})</span>
              <span class="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-bold text-primary-900">{{ r.record_type }}</span>
              <span *ngIf="r.verified" class="rounded-full bg-accent-500 px-2.5 py-0.5 text-xs font-semibold text-white">On-chain</span>
              <span *ngIf="!r.verified" class="rounded-full bg-primary-200 px-2.5 py-0.5 text-xs font-semibold text-primary-900">Pending</span>
              <span class="ml-auto text-xs text-muted">{{ r.created_at | date:'medium' }}</span>
            </div>
            <div class="mb-2 flex flex-wrap gap-3 text-xs text-muted">
              <span *ngFor="let kv of entries(r.record_data)">
                <strong class="text-ink">{{ kv.key }}:</strong> {{ kv.value }}
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <code class="rounded bg-white px-1.5 py-0.5 font-mono text-muted">hash: {{ r.record_hash | slice:0:26 }}…</code>
              <a *ngIf="r.verified"
                 [href]="'https://sepolia.etherscan.io/tx/' + r.tx_hash"
                 target="_blank" rel="noopener"
                 class="font-mono text-accent-700 underline">tx {{ r.tx_hash | slice:0:14 }}…</a>
            </div>
          </div>
          <p *ngIf="facilityRecords.length === 0 && !loadingRecords" class="py-6 text-center text-muted italic">
            No records added by your hospital yet.
          </p>
        </div>
      </div>
    </div>
  `,
})
export class HospitalDashboardComponent implements OnInit {
  tab: 'referrals' | 'records' = 'referrals';

  filter = 'PENDING';
  filters = [
    { label: 'Pending', value: 'PENDING' },
    { label: 'Accepted', value: 'ACCEPTED' },
    { label: 'Declined', value: 'DECLINED' },
    { label: 'All', value: '' },
  ] as const;

  referrals: ReferralItem[] = [];
  loading = false;
  busyId: number | null = null;

  // --- Add record form ---
  recordTypes = ['DIAGNOSIS', 'LAB', 'PRESCRIPTION', 'SURGERY', 'IMMUNIZATION', 'GENERAL'];
  keyHints = ['temperature', 'diagnosis', 'medication', 'result', 'notes'];
  rows: { key: string; value: string }[] = [{ key: '', value: '' }, { key: '', value: '' }];
  form = { health_id: '', record_type: 'DIAGNOSIS', facility_name: '' };
  busy = false;
  formMsg = '';
  formOk = false;
  lastResult: { hash: string; tx_hash: string } | null = null;

  facilityRecords: FacilityRecord[] = [];
  loadingRecords = false;

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  /** Angular 22 is zoneless by default — re-render after async mutations. */
  private syncView() {
    this.cdr.detectChanges();
  }

  setTab(t: 'referrals' | 'records') {
    this.tab = t;
    this.syncView();
  }

  get hospitalName(): string {
    return this.auth.hospitalCode;
  }

  get pendingCount(): number {
    return this.referrals.filter((r) => r.status === 'PENDING').length;
  }

  async ngOnInit() {
    if (!this.auth.isStaff) {
      this.router.navigate(['/login']);
      return;
    }
    await this.reload();
  }

  setFilter(value: string) {
    this.filter = value;
    void this.reload();
  }

  async reload() {
    this.loading = true;
    this.syncView();
    try {
      this.referrals = await this.api.hospitalReferrals(this.filter || undefined);
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed to load referrals'));
    } finally {
      this.loading = false;
      this.syncView();
    }
  }

  async respond(r: ReferralItem, action: 'ACCEPTED' | 'DECLINED') {
    this.busyId = r.id;
    this.syncView();
    try {
      await this.api.respondReferral(r.id, action);
      await this.reload();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    } finally {
      this.busyId = null;
      this.syncView();
    }
  }

  // ---------- Add record ----------

  addRow() {
    this.rows.push({ key: '', value: '' });
    this.syncView();
  }

  removeRow(i: number) {
    this.rows.splice(i, 1);
    this.syncView();
  }

  async submitRecord() {
    this.formMsg = '';
    this.formOk = false;
    this.lastResult = null;

    const healthId = this.form.health_id.trim();
    if (!healthId) {
      this.formMsg = 'Patient Health ID is required.';
      this.syncView();
      return;
    }
    const data: Record<string, string> = {};
    for (const row of this.rows) {
      if (row.key.trim()) data[row.key.trim()] = row.value.trim();
    }
    if (Object.keys(data).length === 0) {
      this.formMsg = 'Add at least one data field (field + value).';
      this.syncView();
      return;
    }

    this.busy = true;
    this.syncView();
    try {
      const res = await this.api.addRecord({
        health_id: healthId,
        facility_id: this.auth.hospitalCode || 'UNKNOWN',
        facility_name: this.form.facility_name.trim() || this.hospitalName || 'Hospital',
        record_type: this.form.record_type,
        record_data: data,
      });
      this.formOk = true;
      this.formMsg = 'Record saved and hash written to Sepolia.';
      this.lastResult = { hash: res.hash, tx_hash: res.tx_hash || '' };
      this.rows = [{ key: '', value: '' }, { key: '', value: '' }];
      await this.loadFacilityRecords();
    } catch (e: any) {
      this.formMsg = e?.error?.error || e?.message || 'Failed to add record';
    } finally {
      this.busy = false;
      this.syncView();
    }
  }

  async loadFacilityRecords() {
    this.loadingRecords = true;
    this.syncView();
    try {
      this.facilityRecords = await this.api.facilityRecords();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed to load records'));
    } finally {
      this.loadingRecords = false;
      this.syncView();
    }
  }

  badge(status: string): string {
    switch (status) {
      case 'ACCEPTED':  return 'bg-accent-500 text-white';
      case 'DECLINED':  return 'bg-red-500 text-white';
      case 'CANCELLED': return 'bg-gray-200 text-ink';
      default:          return 'bg-primary-300 text-ink';
    }
  }

  entries(data: Record<string, any>): { key: string; value: any }[] {
    if (!data) return [];
    return Object.entries(data).map(([key, value]) => ({ key, value }));
  }
}
