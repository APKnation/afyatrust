import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { NgIf, NgFor, SlicePipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, PatientData, AccessRequest } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-patient-dashboard',
  imports: [NgIf, NgFor, SlicePipe, DatePipe, FormsModule],
  template: `
    <!-- LOADING (only when there really is nothing yet) -->
    <div *ngIf="loading && !data" class="py-15 text-center text-muted">
      <h2 class="mb-1 text-xl font-bold">Loading…</h2>
    </div>

    <!-- NOT LOGGED IN (e.g. token expired or server unreachable) -->
    <div *ngIf="!auth.isAuthenticated()" class="py-15 text-center text-muted">
      <h2 class="mb-1 text-xl font-bold">Your session expired</h2>
      <p class="mb-4">Please sign in again to see your records.</p>
      <button
        (click)="logoutAndRedirect()"
        class="rounded-lg bg-primary-500 px-5 py-2.5 font-semibold text-ink hover:bg-primary-400">
        Sign in again
      </button>
    </div>

    <!-- LOAD FAILED (visible error, never a silent stall) -->
    <div *ngIf="errorMsg && !data" class="mx-auto max-w-2xl py-15 text-center">
      <h2 class="mb-2 text-xl font-bold text-red-600">Could not load your records</h2>
      <p class="mb-5 text-muted">{{ errorMsg }}</p>
      <button (click)="retry()"
              class="rounded-lg bg-primary-500 px-5 py-2.5 font-semibold text-ink hover:bg-primary-400">
        Try again
      </button>
    </div>

    <!-- DASHBOARD -->
    <div *ngIf="data" class="mx-auto max-w-6xl">
      <div class="mb-5 rounded-xl bg-surface p-6 shadow-card">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 class="mb-1 text-2xl font-bold">Welcome, {{ data.full_name }}</h1>
            <p class="m-0 text-sm text-muted">Health ID: <strong>{{ data.health_id }}</strong></p>
          </div>
          <p class="text-xs text-muted">
            Wallet:
            <code class="rounded bg-primary-100 px-1.5 py-1 text-sm">{{ data.wallet_address | slice:0:10 }}…</code>
            <span class="ml-2 text-[11px] opacity-80">(managed for you — no MetaMask needed)</span>
          </p>
        </div>
      </div>

      <div class="mb-5 flex flex-wrap gap-2.5 border-b-2 border-gray-200">
        <button
          *ngFor="let t of tabs"
          class="cursor-pointer border-none bg-transparent px-4.5 py-3 text-[15px] text-muted"
          [class]="tab === t.id
            ? 'border-b-3 border-primary-500 font-bold text-ink'
            : 'text-muted'"
          (click)="tab = t.id"
        >
          {{ t.label }}
          <span *ngIf="t.id === 'requests' && requests.length > 0"
                class="ml-1.5 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
            {{ requests.length }}
          </span>
        </button>
      </div>

      <!-- RECORDS -->
      <div *ngIf="tab === 'records'" class="animate-fade-in">
        <h2 class="mb-4 text-xl font-bold">My Medical History</h2>
        <p class="mb-3 text-xs text-muted">
          Only the SHA-256 hash of each record is stored on-chain. Data stays at the
          facility that created it. The card turns <strong>On-chain</strong> when the
          backend has written the hash to the blockchain.
        </p>
        <div *ngFor="let rec of data.records"
             class="mb-3.5 rounded-xl border-l-4 border-primary-500 bg-surface p-4.5 shadow-card">
          <div class="mb-3 flex flex-wrap items-center gap-3">
            <span class="font-bold text-accent-700"> {{ rec.facility }}</span>
            <span class="text-sm text-muted"> {{ rec.date | date:'medium' }}</span>
            <span class="rounded px-2 py-0.5 text-xs font-bold text-primary-800">{{ rec.type }}</span>
            <span *ngIf="rec.verified"
                  class="rounded bg-accent-500 px-2 py-1 text-xs font-semibold text-white"> On-chain</span>
            <span *ngIf="!rec.verified"
                  class="rounded bg-primary-300 px-2 py-1 text-xs font-semibold text-ink"> Pending</span>
          </div>
          <div class="mb-3 rounded-lg bg-gray-50 p-3">
            <div *ngFor="let item of entries(rec.data)"
                 class="flex border-b border-gray-200 py-1 last:border-b-0">
              <span class="w-48 shrink-0 font-semibold text-ink">{{ item.key }}:</span>
              <span class="text-gray-900">{{ item.value }}</span>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Record hash:</span>
            <code class="rounded bg-primary-100 px-1.5 py-0.5 font-mono">{{ rec.hash | slice:0:40 }}…</code>
            <span *ngIf="rec.tx_hash"
                  class="rounded bg-primary-200 px-1.5 py-0.5 font-mono">
              tx: {{ rec.tx_hash | slice:0:10 }}…
            </span>
          </div>
        </div>
        <p *ngIf="data.records.length === 0" class="py-8 text-center text-muted italic">
          No records yet. A facility adds them when it draws your clinical data —
          it never moves the actual data; only the hash is recorded on-chain.
        </p>
      </div>

      <!-- MEASUREMENTS -->
      <div *ngIf="tab === 'measurements'" class="animate-fade-in">
        <h2 class="mb-4 text-xl font-bold">My Measurements</h2>
        <p class="mb-3 text-xs text-muted">
          A doctor records a reading against your Health ID. The value stays off-chain;
          access is required before writing.
        </p>
        <div class="max-h-[520px] overflow-y-auto">
          <table *ngIf="data?.measurements?.length" class="w-full overflow-hidden rounded-lg bg-white shadow-md">
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
              <tr *ngFor="let m of data.measurements" class="border-b border-gray-200 hover:bg-gray-50">
                <td class="px-3 py-2.5 text-sm">{{ m.date | date:'short' }}</td>
                <td class="px-3 py-2.5 text-sm font-semibold">{{ m.kind }}</td>
                <td class="px-3 py-2.5 text-sm">{{ m.value }} {{ m.unit }}</td>
                <td class="px-3 py-2.5 text-sm">{{ m.doctor || '—' }}</td>
                <td class="px-3 py-2.5 text-sm">{{ m.hospital || '—' }}</td>
              </tr>
            </tbody>
          </table>
          <p *ngIf="!data.measurements.length" class="py-8 text-center text-muted italic">
            No measurements yet. They appear when a doctor records one.
          </p>
        </div>
      </div>

      <!-- REFERRALS -->
      <div *ngIf="tab === 'referrals'" class="animate-fade-in">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 class="mb-1 text-xl font-bold">My Referrals</h2>
          <button
            (click)="referralTab = true"
            class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-gray-50">
            Send me to a hospital
          </button>
        </div>
        <p class="mb-3 text-xs text-muted">
          A doctor of another hospital issues a referral. The receiving hospital's
          staff accepts or declines it. Your record moves only after it is accepted.
        </p>
        <div *ngFor="let r of data.referrals"
             class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-primary-400 bg-surface p-4.5 shadow-card">
          <div>
            <p class="m-0 font-bold text-ink"> {{ r.to_hospital }}</p>
            <p class="m-0 text-sm text-muted">
              {{ r.reason || 'No reason recorded' }} ·  {{ r.date | date:'medium' }}
              <span *ngIf="r.responded_by" class="ml-2">
                responded by {{ r.responded_by }}{{ r.responded_at ? ('· ' + (r.responded_at | date:'short')) : '' }}
              </span>
            </p>
          </div>
          <span class="rounded px-2.5 py-1 text-xs font-bold"
                [class]="r.status === 'ACCEPTED' ? 'bg-accent-500 text-white'
                  : r.status === 'DECLINED' ? 'bg-red-500 text-white'
                  : r.status === 'CANCELLED' ? 'bg-gray-200 text-ink'
                  : 'bg-primary-300 text-ink'">{{ r.status }}</span>
        </div>
        <p *ngIf="data.referrals.length === 0" class="py-8 text-center text-muted italic">
          No referrals yet. When a doctor sends you to another hospital, it shows here.
        </p>
      </div>

      <!-- PERMISSIONS -->
      <div *ngIf="tab === 'permissions'" class="animate-fade-in">
        <h2 class="mb-4 text-xl font-bold">Grant Access to a Doctor</h2>
        <p class="mb-4 text-xs text-muted">
          Enter a doctor's medical license number. The backend finds the matching
          wallet and grants them access for the number of days you choose.
        </p>
        <div class="mb-5 flex flex-col gap-3.5 rounded-xl border border-gray-200 bg-gray-50 p-5">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input [(ngModel)]="grant.doctor_license" placeholder="Doctor's license number"
                   class="rounded-md border border-gray-300 px-2.5 py-2.5 text-sm" />
            <input [(ngModel)]="grant.doctor_name" placeholder="Doctor's name (optional)"
                   class="rounded-md border border-gray-300 px-2.5 py-2.5 text-sm" />
            <input type="number" [(ngModel)]="grant.days" min="1" max="90" placeholder="Days"
                   class="rounded-md border border-gray-300 px-2.5 py-2.5 text-sm" />
          </div>
          <button (click)="grantAccess()" [disabled]="busy"
                  class="self-start rounded-lg bg-accent-500 px-4.5 py-2.5 font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50">
            {{ busy ? 'Sending…' : ' Grant Access' }}
          </button>
        </div>
        <p class="text-sm text-muted">
          Access expires automatically after the chosen number of days. Revoke from a
          facility or ask staff to end it early.
        </p>
      </div>

      <!-- REQUESTS -->
      <div *ngIf="tab === 'requests'" class="animate-fade-in">
        <h2 class="mb-4 text-xl font-bold">Access Requests</h2>
        <p class="mb-3 text-xs text-muted">A verified doctor has asked to see your records.</p>
        <div *ngFor="let req of requests"
             class="mb-3.5 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-primary-400 bg-surface p-4.5 shadow-card">
          <div>
            <p class="my-1"><strong> {{ req.doctor_name }}</strong> from <strong>{{ req.facility_id }}</strong></p>
            <p class="my-1 rounded-md bg-gray-100 px-2 py-2 text-[13px] text-muted italic"> {{ req.reason }}</p>
            <p class="my-1 text-xs text-muted"> {{ req.created_at | date:'medium' }}</p>
          </div>
          <div class="flex gap-2.5">
            <button (click)="approve(req)" class="rounded-lg bg-accent-500 px-4.5 py-2.5 font-semibold text-white transition-colors hover:bg-accent-600"> Approve</button>
            <button (click)="reject(req)" class="rounded-md bg-red-500 px-4.5 py-2.5 font-semibold text-white"> Reject</button>
          </div>
        </div>
        <p *ngIf="requests.length === 0" class="py-8 text-center text-muted italic">No pending requests.</p>
      </div>

      <!-- AUDIT -->
      <div *ngIf="tab === 'audit'" class="animate-fade-in">
        <h2 class="mb-4 text-xl font-bold">Who Accessed My Data</h2>
        <p class="mb-3 text-xs text-muted">
          Every access event is written on-chain: who viewed what, when, and from
          which facility. Break-glass (emergency) access is logged too.
        </p>
        <div class="max-h-[520px] overflow-y-auto">
          <table class="w-full overflow-hidden rounded-lg bg-white shadow-md">
            <thead>
              <tr class="bg-primary-500 text-left text-ink">
                <th class="px-3 py-3 text-sm">Date</th>
                <th class="px-3 py-3 text-sm">Who</th>
                <th class="px-3 py-3 text-sm">Role</th>
                <th class="px-3 py-3 text-sm">Action</th>
                <th class="px-3 py-3 text-sm">Facility</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let ev of data.audit_trail" class="border-b border-gray-200 hover:bg-gray-50">
                <td class="px-3 py-3">{{ ev.timestamp * 1000 | date:'short' }}</td>
                <td class="px-3 py-3"><code>{{ ev.accessor | slice:0:10 }}…</code></td>
                <td class="px-3 py-3">
                  <span class="rounded px-2 py-1 text-xs font-bold" [class]="roleBadge(ev.role)">{{ ev.role }}</span>
                </td>
                <td class="px-3 py-3">
                  <span class="rounded px-2 py-1 text-xs font-bold" [class]="actionBadge(ev.action)">{{ ev.action }}</span>
                </td>
                <td class="px-3 py-3">{{ ev.facility || '—' }}</td>
              </tr>
            </tbody>
          </table>
          <p *ngIf="data.audit_trail.length === 0" class="py-8 text-center text-muted italic">
            No access events yet.
          </p>
        </div>
      </div>
    </div>

    <!-- ACCESS-REQUEST NOTIFICATIONS (popup, survives tab switches) -->
    <div class="fixed top-20 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
      <div *ngFor="let n of notifications"
           class="animate-fade-in rounded-xl border-l-4 border-primary-500 bg-surface p-4 shadow-card">
        <div class="mb-1 flex items-center justify-between gap-2">
          <span class="text-sm font-bold text-ink"> New access request</span>
          <button (click)="dismiss(n.id)" aria-label="Dismiss"
                  class="cursor-pointer border-none bg-transparent text-lg leading-none text-muted hover:text-ink">✕</button>
        </div>
        <p class="m-0 text-sm text-ink">
          <strong>{{ n.doctor_name }}</strong> from <strong>{{ n.facility_id }}</strong>
          wants to view your records.
        </p>
        <p *ngIf="n.reason" class="mb-0 mt-1 rounded-md bg-primary-50 px-2 py-1.5 text-[13px] text-muted italic"> {{ n.reason }}</p>
        <div class="mt-3 flex gap-2">
          <button (click)="approveFromToast(n)"
                  class="flex-1 cursor-pointer rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600"> Approve</button>
          <button (click)="rejectFromToast(n)"
                  class="flex-1 cursor-pointer rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600"> Reject</button>
        </div>
        <p class="mb-0 mt-2 text-center text-[11px] text-muted">Approval grants 7 days of access and is logged on-chain.</p>
      </div>
    </div>

    <!-- REFERRAL SEND MODAL (patient) -->
    <div *ngIf="referralTab"
         class="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
      <div class="w-full max-w-lg rounded-xl bg-surface p-6 shadow-card">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-bold">Send me to a hospital</h2>
          <button (click)="referralTab = false" aria-label="Close"
                  class="cursor-pointer rounded-lg p-1 text-muted hover:text-ink">✕</button>
        </div>
        <p class="mb-4 text-sm text-muted">
          Choose the hospital you want to be referred to and why.
          That hospital's staff or doctor must accept it before the referral is complete.
        </p>
        <div class="flex flex-col gap-3">
          <select [(ngModel)]="referralForm.to_hospital"
                  class="rounded-md border border-gray-300 px-3 py-2.5 text-sm">
            <option value="" disabled>Select target hospital…</option>
            <option *ngFor="let h of sendHospitals"
                    [value]="h.code">{{ h.name }} ({{ h.code }})</option>
          </select>
          <textarea [(ngModel)]="referralForm.reason" rows="2"
                    placeholder="e.g. specialist review, follow-up after discharge"
                    class="rounded-md border border-gray-300 px-3 py-2.5 text-sm"></textarea>
        </div>
        <div class="mt-4 flex gap-2">
          <button (click)="sendReferral()" [disabled]="sendBusy || !referralForm.to_hospital"
                  class="flex-1 rounded-lg bg-accent-500 px-4 py-2.5 font-semibold text-white hover:bg-accent-600 disabled:opacity-50">
            {{ sendBusy ? 'Sending…' : ' Send referral' }}
          </button>
          <button (click)="referralTab = false"
                  class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-gray-50">
            Cancel
          </button>
        </div>
        <p *ngIf="sendMsg" class="mb-0 mt-3 text-sm" [class]="sendOk ? 'text-accent-700' : 'text-red-600'">{{ sendMsg }}</p>
      </div>
    </div>
  `,
})
export class PatientDashboardComponent implements OnInit, OnDestroy {
  tab: 'records' | 'measurements' | 'referrals' | 'permissions' | 'requests' | 'audit' = 'records';
  tabs = [
    { id: 'records', label: ' Records' },
    { id: 'measurements', label: ' Measurements' },
    { id: 'referrals', label: ' Referrals' },
    { id: 'permissions', label: ' Permissions' },
    { id: 'requests', label: ' Requests' },
    { id: 'audit', label: ' Audit Trail' },
  ] as const;

  data: PatientData | null = null;
  requests: AccessRequest[] = [];
  loading = false;
  busy = false;
  errorMsg = '';
  grant = { doctor_license: '', doctor_name: '', days: 7 };

  // patient-initiated referral send
  referralTab = false;
  sendHospitals: { code: string; name: string }[] = [];
  referralForm = { to_hospital: '', reason: '' };
  sendBusy = false;
  sendMsg = '';
  sendOk = false;

  // --- Access-request notifications (popup) ---
  notifications: AccessRequest[] = [];
  private dismissedIds = new Set<number>();
  private pollTimer: any = null;

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  /**
   * Angular 22 runs ZONELESS by default: plain property assignments after an
   * async fetch do NOT trigger change detection, so the page would stay on
   * "Loading…" forever even with data loaded. Call this after every async
   * state mutation to re-render immediately.
   */
  private syncView() {
    this.cdr.detectChanges();
  }

  async ngOnInit() {
    if (!this.auth.isPatient) {
      this.router.navigate(['/login']);
      return;
    }
    this.loadSendHospitals();
    await this.reload();
    this.startPolling();
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  /** Load the list of hospitals so the patient can pick where to go. */
  private async loadSendHospitals() {
    try {
      this.sendHospitals = await this.api.hospitals();
    } catch {
      this.sendHospitals = [];
    }
    this.syncView();
  }

  /**
   * Poll every 15s: refresh access requests (popups) AND the core payload
   * (records, measurements, referrals, audit trail) so the dashboard stays
   * live — e.g. a doctor's VIEW event or a new record appears on its own.
   */
  private startPolling() {
    this.pollTimer = setInterval(async () => {
      let changed = false;
      try {
        this.requests = await this.api.myRequests();
        this.syncNotifications();
        changed = true;
      } catch {
        // offline tick — retry on the next cycle
      }
      // Silent background refresh: never toggles the loading spinner.
      try {
        const fresh = await this.api.myRecords();
        this.data = fresh;
        this.errorMsg = '';
        changed = true;
      } catch {
        // offline tick — the current data stays on screen
      }
      if (changed) this.syncView();
    }, 15000);
  }

  private syncNotifications() {
    this.notifications = this.requests.filter((r) => !this.dismissedIds.has(r.id));
    this.syncView();
  }

  dismiss(id: number) {
    this.dismissedIds.add(id);
    this.syncNotifications();
  }

  async approveFromToast(req: AccessRequest) {
    await this.approve(req);
    this.dismiss(req.id);
  }

  async rejectFromToast(req: AccessRequest) {
    await this.reject(req);
    this.dismiss(req.id);
  }

  async reload() {
    this.loading = true;
    this.errorMsg = '';
    this.syncView();
    try {
      // Records first — render the dashboard as soon as the core payload
      // arrives instead of waiting on the (non-critical) request list.
      const data = await this.api.myRecords();
      this.data = data;
    } catch (e: any) {
      // 401 = token expired: log the user out so the login page handles it
      if (e?.status === 401) {
        this.auth.logout();
        this.router.navigate(['/login']);
        return;
      }
      this.errorMsg = e?.error?.error || e?.message || 'Could not load your records.';
      this.loading = false;
      this.syncView();
      return;
    } finally {
      this.loading = false;
      this.syncView();
    }

    // Requests are non-blocking: the dashboard is already visible.
    try {
      this.requests = await this.api.myRequests();
      this.syncNotifications();
    } catch {
      // non-critical — retry happens on the next poll tick
    }
    this.syncView();
  }

  retry() {
    void this.reload();
  }

  entries(data: any): { key: string; value: any }[] {
    if (!data) return [];
    return Object.entries(data).map(([key, value]) => ({ key, value }));
  }

  roleBadge(role?: string): string {
    switch ((role || '').toLowerCase()) {
      case 'patient':  return 'bg-primary-100 text-primary-900';
      case 'doctor':   return 'bg-accent-100 text-accent-900';
      case 'facility': return 'bg-primary-200 text-primary-900';
      default:         return 'bg-gray-100 text-ink';
    }
  }

  actionBadge(action?: string): string {
    switch ((action || '').toLowerCase()) {
      case 'view':               return 'bg-accent-100 text-accent-900';
      case 'break_glass':        return 'bg-red-100 text-red-900';
      case 'granted_to_doctor':  return 'bg-accent-200 text-accent-900';
      case 'record_added':       return 'bg-primary-100 text-primary-900';
      case 'patient_registered': return 'bg-primary-200 text-primary-900';
      case 'revoked_doctor':     return 'bg-gray-200 text-ink';
      default:                   return 'bg-gray-100 text-ink';
    }
  }

  async grantAccess() {
    if (!this.grant.doctor_license) return;
    this.busy = true;
    this.syncView();
    try {
      await this.api.grantAccess(this.grant);
      this.grant = { doctor_license: '', doctor_name: '', days: 7 };
      await this.reload();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    } finally {
      this.busy = false;
      this.syncView();
    }
  }

  async approve(req: AccessRequest) {
    try {
      await this.api.approveRequest(req.id);
      await this.reload();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    }
    this.syncView();
  }

  async reject(req: AccessRequest) {
    try {
      await this.api.rejectRequest(req.id);
      await this.reload();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    }
    this.syncView();
  }

  /** Patient sends a referral request to another hospital (staff/doctor must accept). */
  async sendReferral() {
    if (!this.referralForm.to_hospital) {
      this.sendMsg = 'Choose a target hospital.';
      this.sendOk = false;
      return;
    }
    this.sendBusy = true;
    this.sendMsg = '';
    this.syncView();
    try {
      const res: any = await this.api.sendPatientReferral({
        to_hospital: this.referralForm.to_hospital,
        reason: this.referralForm.reason.trim(),
      });
      this.sendOk = true;
      this.sendMsg = res.message || 'Referral request sent — the receiving hospital must accept it.';
      this.referralForm = { to_hospital: '', reason: '' };
      await this.reload();
    } catch (e: any) {
      this.sendMsg = e?.error?.error || e?.message || 'Failed to send referral';
      this.sendOk = false;
    } finally {
      this.sendBusy = false;
      this.syncView();
    }
  }

  /** Log out and take the user back to the sign-in page. */
  logoutAndRedirect() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
