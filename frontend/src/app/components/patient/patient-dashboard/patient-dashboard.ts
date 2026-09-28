import { Component, OnInit } from '@angular/core';
import { NgIf, NgFor, SlicePipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';
import { RecordCardComponent } from '../../shared/record-card/record-card';

@Component({
  selector: 'app-patient-dashboard',
  imports: [NgIf, NgFor, SlicePipe, DatePipe, FormsModule, RecordCardComponent],
  template: `
    <div *ngIf="!patient" class="py-12 text-center text-gray-600">
      <h2 class="mb-1 text-xl font-bold">Loading...</h2>
    </div>

    <div *ngIf="patient">
      <div class="mb-5 rounded-2xl bg-gradient-to-br from-blue-800 to-blue-500 p-7 text-white">
        <h1 class="mb-2.5 text-2xl font-bold">Welcome, {{ patient.full_name }}</h1>
        <p class="m-0">Health ID: <strong>{{ patient.health_id }}</strong></p>
        <p class="m-0">Wallet: <code class="rounded bg-white/20 px-1.5 py-1 text-sm">{{ wallet | slice:0:10 }}...{{ wallet | slice:-8 }}</code></p>
      </div>

      <div class="mb-5 flex flex-wrap gap-2.5 border-b-2 border-gray-200">
        <button
          class="relative cursor-pointer border-none bg-transparent px-4.5 py-3 text-[15px] text-gray-500"
          [class.!border-b-3]="tab === 'records'"
          [class.border-blue-800]="tab === 'records'"
          [class.font-bold]="tab === 'records'"
          [class.text-blue-800]="tab === 'records'"
          (click)="tab = 'records'"
        >
          📋 My Records ({{ patient.records.length }})
        </button>
        <button
          class="relative cursor-pointer border-none bg-transparent px-4.5 py-3 text-[15px] text-gray-500"
          [class.!border-b-3]="tab === 'permissions'"
          [class.border-blue-800]="tab === 'permissions'"
          [class.font-bold]="tab === 'permissions'"
          [class.text-blue-800]="tab === 'permissions'"
          (click)="tab = 'permissions'"
        >
          🔐 My Permissions
        </button>
        <button
          class="relative cursor-pointer border-none bg-transparent px-4.5 py-3 text-[15px] text-gray-500"
          [class.!border-b-3]="tab === 'requests'"
          [class.border-blue-800]="tab === 'requests'"
          [class.font-bold]="tab === 'requests'"
          [class.text-blue-800]="tab === 'requests'"
          (click)="tab = 'requests'"
        >
          📬 Requests
          <span
            *ngIf="pendingRequests.length > 0"
            class="ml-1.5 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white"
          >{{ pendingRequests.length }}</span>
        </button>
        <button
          class="relative cursor-pointer border-none bg-transparent px-4.5 py-3 text-[15px] text-gray-500"
          [class.!border-b-3]="tab === 'audit'"
          [class.border-blue-800]="tab === 'audit'"
          [class.font-bold]="tab === 'audit'"
          [class.text-blue-800]="tab === 'audit'"
          (click)="tab = 'audit'"
        >
          👁️ Who Viewed My Data
        </button>
      </div>

      <!-- RECORDS -->
      <div *ngIf="tab === 'records'" class="animate-fade-in">
        <h2 class="mb-4 text-xl font-bold">My Medical History</h2>
        <app-record-card *ngFor="let rec of patient.records" [record]="rec" />
        <p *ngIf="patient.records.length === 0" class="py-10 text-center text-gray-400 italic">
          No records yet. Visit a registered facility to get started.
        </p>
      </div>

      <!-- PERMISSIONS -->
      <div *ngIf="tab === 'permissions'" class="animate-fade-in">
        <div class="mb-5 flex items-center justify-between">
          <h2 class="text-xl font-bold">Permissions You Granted</h2>
          <button (click)="showGrantForm = true" class="cursor-pointer rounded-md border-none bg-blue-800 px-5 py-2.5 font-medium text-white">
            ➕ Grant Doctor Access
          </button>
        </div>

        <div *ngIf="showGrantForm" class="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-5">
          <h3 class="mb-2.5 mt-0 text-base font-bold">Grant Access</h3>
          <input [(ngModel)]="newPermission.doctor_wallet" placeholder="Doctor's wallet (0x...)" class="mb-2.5 box-border block w-full rounded-md border border-gray-300 px-2.5 py-2.5 text-sm" />
          <input [(ngModel)]="newPermission.doctor_name" placeholder="Doctor's name" class="mb-2.5 box-border block w-full rounded-md border border-gray-300 px-2.5 py-2.5 text-sm" />
          <input type="number" [(ngModel)]="newPermission.days" placeholder="Days (e.g. 7)" min="1" class="mb-2.5 box-border block w-full rounded-md border border-gray-300 px-2.5 py-2.5 text-sm" />
          <div class="mt-3.5 flex gap-2.5">
            <button (click)="grantAccess()" [disabled]="loading" class="cursor-pointer rounded-md border-none bg-emerald-500 px-5 py-2.5 font-medium text-white disabled:opacity-50">
              {{ loading ? 'Sending...' : '✅ Grant Access' }}
            </button>
            <button (click)="showGrantForm = false" class="cursor-pointer rounded-md border-none bg-gray-500 px-5 py-2.5 font-medium text-white">Cancel</button>
          </div>
        </div>

        <div
          *ngFor="let perm of permissions"
          class="mb-3.5 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-blue-500 bg-white p-5 shadow-md"
        >
          <div>
            <p class="my-1"><strong>👨‍⚕️ {{ perm.doctor_name || 'Doctor' }}</strong></p>
            <p class="my-1 text-[13px] text-gray-600">Wallet: <code>{{ perm.grantedTo || perm.doctor_wallet }}</code></p>
            <p class="my-1 text-[13px] text-amber-500">📅 Expires: {{ formatDate(perm.expiry) }}</p>
            <p class="my-1 text-xs text-gray-600">
              Granted by:
              <span class="rounded px-2 py-0.5 text-xs font-semibold" [class]="permBadgeClass(perm.grantedByRole)">
                {{ perm.grantedByRole || '—' }}
              </span>
            </p>
          </div>
          <button (click)="revokeAccess(perm.grantedTo || perm.doctor_wallet)" class="cursor-pointer rounded-md border-none bg-red-500 px-5 py-2.5 font-medium text-white">
            ❌ Revoke
          </button>
        </div>
        <p *ngIf="permissions.length === 0" class="py-10 text-center text-gray-400 italic">You haven't granted any access yet.</p>
      </div>

      <!-- REQUESTS -->
      <div *ngIf="tab === 'requests'" class="animate-fade-in">
        <h2 class="mb-4 text-xl font-bold">Access Requests</h2>
        <div
          *ngFor="let req of pendingRequests"
          class="mb-3.5 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-blue-500 bg-white p-5 shadow-md"
        >
          <div>
            <p class="my-1"><strong>👨‍⚕️ {{ req.doctor_name }}</strong> from <strong>{{ req.facility_id }}</strong></p>
            <p class="my-1 rounded-md bg-gray-100 px-2 py-2 text-[13px] text-gray-600 italic">💬 {{ req.reason }}</p>
            <p class="my-1 text-xs text-gray-400">📅 {{ req.created_at | date:'medium' }}</p>
          </div>
          <div class="mt-3.5 flex gap-2.5">
            <button (click)="approveRequest(req)" class="cursor-pointer rounded-md border-none bg-emerald-500 px-5 py-2.5 font-medium text-white">✅ Approve</button>
            <button (click)="rejectRequest(req)" class="cursor-pointer rounded-md border-none bg-red-500 px-5 py-2.5 font-medium text-white">❌ Reject</button>
          </div>
        </div>
        <p *ngIf="pendingRequests.length === 0" class="py-10 text-center text-gray-400 italic">No new requests.</p>
      </div>

      <!-- AUDIT -->
      <div *ngIf="tab === 'audit'" class="animate-fade-in">
        <h2 class="mb-4 text-xl font-bold">Who Viewed My Data</h2>
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
            <tr *ngFor="let event of patient.audit_trail" class="border-b border-gray-200 hover:bg-gray-50">
              <td class="px-3 py-3">{{ event.timestamp * 1000 | date:'short' }}</td>
              <td class="px-3 py-3"><code>{{ event.accessor | slice:0:10 }}...</code></td>
              <td class="px-3 py-3">
                <span class="rounded px-2 py-1 text-xs font-semibold" [class]="permBadgeClass(event.role)">{{ event.role }}</span>
              </td>
              <td class="px-3 py-3">
                <span class="rounded px-2 py-1 text-xs font-semibold" [class]="permBadgeClass(event.action)">{{ event.action }}</span>
              </td>
              <td class="px-3 py-3">{{ event.facility || '-' }}</td>
            </tr>
          </tbody>
        </table>
        <p *ngIf="patient.audit_trail.length === 0" class="py-10 text-center text-gray-400 italic">
          No activity yet.
        </p>
      </div>
    </div>
  `,
})
export class PatientDashboard implements OnInit {
  tab: 'records' | 'permissions' | 'requests' | 'audit' = 'records';
  patient: any = null;
  wallet = '';
  permissions: any[] = [];
  pendingRequests: any[] = [];
  showGrantForm = false;
  loading = false;
  newPermission = { doctor_wallet: '', doctor_name: '', days: 7 };

  constructor(private api: ApiService, private auth: AuthService) {}

  async ngOnInit() {
    this.wallet = this.auth.wallet;
    await this.loadPatient();
  }

  async loadPatient() {
    this.loading = true;
    try {
      const data = await this.api.myRecords();
      this.patient = (data as any)?.data ?? data;
      this.permissions = this.patient?.permissions || [];
      this.pendingRequests = this.patient?.pendingRequests || [];
    } catch (e: any) {
      console.error('Failed to load patient data', e);
    } finally {
      this.loading = false;
    }
  }

  formatDate(value: any): string {
    const ts = Number(value);
    if (!isNaN(ts) && ts > 10000000000) return new Date(ts * 1000).toLocaleDateString();
    return String(value);
  }

  /** Tailwind classes for role/action badges. */
  permBadgeClass(role?: string): string {
    switch ((role || '').toLowerCase()) {
      case 'patient':            return 'bg-blue-100 text-blue-800';
      case 'doctor':             return 'bg-emerald-100 text-emerald-900';
      case 'facility':           return 'bg-amber-100 text-amber-800';
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
    this.loading = true;
    try {
      await this.api.grantAccess(this.newPermission);
      this.showGrantForm = false;
      this.newPermission = { doctor_wallet: '', doctor_name: '', days: 7 };
      await this.loadPatient();
    } catch (e: any) {
      alert('Error: ' + (e.error?.message || e.message || 'Something went wrong'));
    } finally {
      this.loading = false;
    }
  }

  async revokeAccess(walletAddr: string) {
    if (!confirm('Revoke access for this doctor?')) return;
    try {
      await this.api.revokeAccess(walletAddr);
      await this.loadPatient();
    } catch (e: any) {
      alert('Error: ' + (e.error?.message || e.message || 'Something went wrong'));
    }
  }

  async approveRequest(req: any) {
    try {
      await this.api.approveRequest(req.id);
      await this.loadPatient();
    } catch (e: any) {
      alert('Error: ' + (e.error?.message || e.message || 'Something went wrong'));
    }
  }

  async rejectRequest(req: any) {
    try {
      await this.api.rejectRequest(req.id);
      await this.loadPatient();
    } catch (e: any) {
      alert('Error: ' + (e.error?.message || e.message || 'Something went wrong'));
    }
  }
}
