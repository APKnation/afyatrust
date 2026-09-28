import { Component, OnInit } from '@angular/core';
import { NgIf, NgFor, SlicePipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, PatientData, AccessRequest } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-patient-dashboard',
  imports: [NgIf, NgFor, SlicePipe, DatePipe, FormsModule],
  template: `
    <div *ngIf="loading && !data" class="py-15 text-center text-gray-600">
      <h2 class="mb-1 text-xl font-bold">Loading…</h2>
    </div>

    <div *ngIf="data" class="mx-auto max-w-6xl">
      <div class="mb-5 rounded-2xl bg-gradient-to-br from-blue-800 to-blue-500 p-6 text-white">
        <h1 class="mb-2 text-2xl font-bold">Welcome, {{ data.full_name }}</h1>
        <p class="m-0">Health ID: <strong>{{ data.health_id }}</strong></p>
        <p class="m-0">
          Wallet:
          <code class="rounded bg-white/20 px-1.5 py-1 text-sm">{{ data.wallet_address | slice:0:10 }}…</code>
          <span class="ml-1 text-xs opacity-80">(managed for you — no MetaMask needed)</span>
        </p>
      </div>

      <div class="mb-5 flex flex-wrap gap-2.5 border-b-2 border-gray-200">
        <button
          *ngFor="let t of tabs"
          class="cursor-pointer border-none bg-transparent px-4.5 py-3 text-[15px] text-gray-500"
          [class]="tab === t.id
            ? 'border-b-3 border-blue-800 font-bold text-blue-800'
            : 'text-gray-500'"
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
        <div *ngFor="let rec of data.records"
             class="mb-3.5 rounded-xl border-l-4 border-blue-700 bg-white p-4.5 shadow-md">
          <div class="mb-3 flex flex-wrap items-center gap-3">
            <span class="font-bold text-blue-700">🏥 {{ rec.facility }}</span>
            <span class="text-sm text-gray-600">📅 {{ rec.date | date:'medium' }}</span>
            <span class="rounded px-2 py-0.5 text-xs font-bold text-blue-800">{{ rec.type }}</span>
            <span *ngIf="rec.verified"
                  class="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-white">✅ On-chain</span>
            <span *ngIf="!rec.verified"
                  class="rounded bg-amber-500 px-2 py-1 text-xs font-semibold text-white">⏳ Pending</span>
          </div>
          <div class="mb-3 rounded-lg bg-gray-50 p-3">
            <div *ngFor="let item of entries(rec.data)"
                 class="flex border-b border-gray-200 py-1 last:border-b-0">
              <span class="w-48 shrink-0 font-semibold text-gray-700">{{ item.key }}:</span>
              <span class="text-gray-900">{{ item.value }}</span>
            </div>
          </div>
          <div class="font-mono text-xs text-gray-500">🔒 {{ rec.hash | slice:0:22 }}…</div>
        </div>
        <p *ngIf="data.records.length === 0" class="py-8 text-center text-gray-400 italic">
          No records yet. They appear when a facility adds them.
        </p>
      </div>

      <!-- PERMISSIONS -->
      <div *ngIf="tab === 'permissions'" class="animate-fade-in">
        <h2 class="mb-4 text-xl font-bold">Grant Access to a Doctor</h2>
        <div class="mb-5 flex flex-col gap-3.5 rounded-xl border border-gray-200 bg-gray-50 p-5">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input [(ngModel)]="grant.doctor_wallet" placeholder="Doctor's wallet (0x…)"
                   class="rounded-md border border-gray-300 px-2.5 py-2.5 text-sm" />
            <input [(ngModel)]="grant.doctor_name" placeholder="Doctor's name"
                   class="rounded-md border border-gray-300 px-2.5 py-2.5 text-sm" />
            <input type="number" [(ngModel)]="grant.days" min="1" max="90" placeholder="Days"
                   class="rounded-md border border-gray-300 px-2.5 py-2.5 text-sm" />
          </div>
          <button (click)="grantAccess()" [disabled]="busy"
                  class="self-start rounded-md bg-emerald-500 px-4.5 py-2.5 font-semibold text-white disabled:opacity-50">
            {{ busy ? 'Sending…' : '✅ Grant Access' }}
          </button>
        </div>
        <p class="text-sm text-gray-500">
          Access expires automatically after the chosen number of days. Revoke from a
          facility or ask staff to end it early.
        </p>
      </div>

      <!-- REQUESTS -->
      <div *ngIf="tab === 'requests'" class="animate-fade-in">
        <h2 class="mb-4 text-xl font-bold">Access Requests</h2>
        <div *ngFor="let req of requests"
             class="mb-3.5 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-blue-500 bg-white p-4.5 shadow-md">
          <div>
            <p class="my-1"><strong>👨‍⚕️ {{ req.doctor_name }}</strong> from <strong>{{ req.facility_id }}</strong></p>
            <p class="my-1 rounded-md bg-gray-100 px-2 py-2 text-[13px] text-gray-600 italic">💬 {{ req.reason }}</p>
            <p class="my-1 text-xs text-gray-400">📅 {{ req.created_at | date:'medium' }}</p>
          </div>
          <div class="flex gap-2.5">
            <button (click)="approve(req)" class="rounded-md bg-emerald-500 px-4.5 py-2.5 font-semibold text-white">✅ Approve</button>
            <button (click)="reject(req)" class="rounded-md bg-red-500 px-4.5 py-2.5 font-semibold text-white">❌ Reject</button>
          </div>
        </div>
        <p *ngIf="requests.length === 0" class="py-8 text-center text-gray-400 italic">No pending requests.</p>
      </div>

      <!-- AUDIT -->
      <div *ngIf="tab === 'audit'" class="animate-fade-in">
        <h2 class="mb-4 text-xl font-bold">Who Accessed My Data</h2>
        <div class="max-h-[520px] overflow-y-auto">
          <table class="w-full overflow-hidden rounded-lg bg-white shadow-md">
            <thead>
              <tr class="bg-blue-800 text-left text-white">
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
          <p *ngIf="data.audit_trail.length === 0" class="py-8 text-center text-gray-400 italic">
            No access events yet.
          </p>
        </div>
      </div>
    </div>
  `,
})
export class PatientDashboardComponent implements OnInit {
  tab: 'records' | 'permissions' | 'requests' | 'audit' = 'records';
  tabs = [
    { id: 'records', label: '📋 Records' },
    { id: 'permissions', label: '🔐 Permissions' },
    { id: 'requests', label: '📬 Requests' },
    { id: 'audit', label: '👁️ Audit Trail' },
  ] as const;

  data: PatientData | null = null;
  requests: AccessRequest[] = [];
  loading = false;
  busy = false;
  grant = { doctor_wallet: '', doctor_name: '', days: 7 };

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private router: Router
  ) {}

  async ngOnInit() {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
    await this.reload();
  }

  async reload() {
    this.loading = true;
    try {
      const [data, requests] = await Promise.all([
        this.api.myRecords(),
        this.api.myRequests().catch(() => [] as AccessRequest[]),
      ]);
      this.data = data;
      this.requests = requests;
    } catch (e: any) {
      console.error('Failed to load patient data', e);
    } finally {
      this.loading = false;
    }
  }

  entries(data: any): { key: string; value: any }[] {
    if (!data) return [];
    return Object.entries(data).map(([key, value]) => ({ key, value }));
  }

  roleBadge(role?: string): string {
    switch ((role || '').toLowerCase()) {
      case 'patient':  return 'bg-blue-100 text-blue-800';
      case 'doctor':   return 'bg-emerald-100 text-emerald-900';
      case 'facility': return 'bg-amber-100 text-amber-800';
      default:         return 'bg-gray-100 text-gray-700';
    }
  }

  actionBadge(action?: string): string {
    switch ((action || '').toLowerCase()) {
      case 'view':               return 'bg-indigo-100 text-indigo-900';
      case 'break_glass':        return 'bg-red-100 text-red-900';
      case 'granted_to_doctor':  return 'bg-emerald-100 text-emerald-900';
      case 'record_added':       return 'bg-blue-100 text-blue-800';
      case 'patient_registered': return 'bg-pink-100 text-pink-900';
      case 'revoked_doctor':     return 'bg-amber-100 text-amber-800';
      default:                   return 'bg-gray-100 text-gray-700';
    }
  }

  async grantAccess() {
    if (!this.grant.doctor_wallet) return;
    this.busy = true;
    try {
      await this.api.grantAccess(this.grant);
      this.grant = { doctor_wallet: '', doctor_name: '', days: 7 };
      await this.reload();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    } finally {
      this.busy = false;
    }
  }

  async approve(req: AccessRequest) {
    try {
      await this.api.approveRequest(req.id);
      await this.reload();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    }
  }

  async reject(req: AccessRequest) {
    try {
      await this.api.rejectRequest(req.id);
      await this.reload();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    }
  }
}
