import { Component } from '@angular/core';
import { NgIf, NgFor, SlicePipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, PatientRecord } from '../../../services/api.service';
import { DoctorVerificationComponent } from '../doctor-verification/doctor-verification.component';
import { DoctorSessionService } from './doctor-session.service';

/**
 * Doctor workspace.
 * Identity = connected MetaMask wallet, verified by an admin (license check).
 * The wallet address is sent as a header so the backend can enforce the
 * verification gate and check on-chain access.
 */
@Component({
  selector: 'app-doctor-dashboard',
  imports: [NgIf, NgFor, SlicePipe, DatePipe, FormsModule, DoctorVerificationComponent],
  template: `
    <div class="mx-auto max-w-6xl">
      <div class="mb-5 rounded-xl bg-surface p-6 shadow-card">
        <h1 class="mb-1 text-2xl font-bold">Doctor Workspace</h1>
        <p class="m-0 text-sm text-muted">
          Verify your account, look up a patient by Health ID, request access, then view their history.
        </p>
        <div class="mt-3 flex items-center gap-2 text-sm">
          <span *ngIf="wallet" class="rounded bg-primary-100 px-2 py-1 font-mono text-ink">
            {{ wallet | slice:0:6 }}…{{ wallet | slice:-4 }}
          </span>
          <span *ngIf="session.isApproved" class="font-semibold text-accent-700">
            ✓ verified — {{ session.fullName }} @ {{ session.facilityId }}
          </span>
        </div>
      </div>

      <!-- VERIFICATION (license + admin approval) -->
      <div class="mb-5">
        <app-doctor-verification />
      </div>

      <!-- LOOKUP -->
      <div class="mb-5 rounded-2xl border border-gray-200 bg-slate-50 p-6">
        <h2 class="mb-4 text-xl font-bold">Find Patient</h2>
        <div class="flex flex-wrap gap-3">
          <input [(ngModel)]="healthId" placeholder="Health ID"
                 class="min-w-50 flex-1 rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm" />
          <button (click)="viewRecord()" [disabled]="loading"
                  class="cursor-pointer rounded-lg bg-primary-500 px-4 py-2.5 font-bold text-ink transition-colors hover:bg-primary-400 disabled:opacity-50">
            {{ loading ? 'Checking…' : '🔍 Access Records' }}
          </button>
        </div>

        <!-- DENIED: needs verification first -->
        <div *ngIf="needsVerification" class="mt-4 rounded-lg border border-primary-200 bg-primary-50 p-4">
          <p class="m-0 font-semibold text-primary-900">Your account is not verified yet.</p>
          <p class="m-0 mt-1 text-sm text-primary-800">
            Connect MetaMask and submit your license number in the
            <strong>Doctor Verification</strong> panel above. An administrator must approve it
            before you can access patient data.
          </p>
        </div>

        <!-- DENIED: verified but no permission -->
        <div *ngIf="denied" class="mt-4 rounded-lg border border-primary-200 bg-primary-50 p-4">
          <p class="m-0 font-semibold text-primary-900">No access permission for this patient.</p>
          <p class="m-0 mt-1 text-sm text-primary-800">
            The patient must approve your request (or you can use break-glass in an emergency).
          </p>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <input [(ngModel)]="requestReason" placeholder="Reason for access"
                   class="flex-1 rounded-md border border-primary-300 px-2.5 py-2 text-sm" />
            <button (click)="requestAccess()"
                    class="cursor-pointer rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600">
              📨 Request Access
            </button>
            <button (click)="breakGlass()"
                    class="cursor-pointer rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white">
              🔓 Break-Glass
            </button>
          </div>
        </div>
      </div>

      <!-- RESULTS -->
      <div *ngIf="records.length" class="mb-5 rounded-xl border border-gray-200 bg-surface p-6 shadow-card">
        <h2 class="mb-1 text-xl font-bold">Records for {{ viewedHealthId }}</h2>
        <p class="mb-4 text-sm text-muted">{{ patientName }} — every view is logged on-chain.</p>
        <div class="max-h-[560px] overflow-y-auto">
          <div *ngFor="let rec of records"
               class="mb-3.5 rounded-xl border border-accent-200 bg-surface p-4.5 shadow-card">
            <div class="mb-3 flex flex-wrap items-center gap-3">
              <span class="font-bold text-accent-700">🏥 {{ rec.facility }}</span>
              <span class="text-sm text-muted">📅 {{ rec.date | date:'medium' }}</span>
              <span class="rounded bg-accent-100 px-2 py-0.5 text-xs font-bold text-accent-900">{{ rec.type }}</span>
              <span *ngIf="rec.verified"
                    class="rounded bg-accent-500 px-2 py-1 text-xs font-semibold text-white">✅ Verified</span>
            </div>
            <div class="rounded-lg bg-gray-50 p-3">
              <div *ngFor="let item of entries(rec.data)"
                   class="flex border-b border-gray-200 py-1 last:border-b-0">
                <span class="w-44 shrink-0 font-semibold text-ink">{{ item.key }}:</span>
                <span class="text-gray-900">{{ item.value }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class DoctorLandingComponent {
  healthId = '';
  requestReason = '';
  patientName = '';
  viewedHealthId = '';
  records: PatientRecord[] = [];
  denied = false;
  needsVerification = false;
  loading = false;

  constructor(
    private api: ApiService,
    public session: DoctorSessionService
  ) {}

  get wallet(): string {
    return this.session.wallet;
  }

  async viewRecord() {
    if (!this.healthId.trim()) return;
    this.loading = true;
    this.denied = false;
    this.needsVerification = false;
    this.records = [];
    try {
      const res = await this.api.doctorViewRecord(
        this.healthId.trim(), this.wallet, this.session.facilityId || undefined
      );
      this.patientName = res.full_name;
      this.viewedHealthId = res.health_id;
      this.records = res.records || [];
    } catch (e: any) {
      if (e?.status === 403) {
        if (e?.error?.action === 'REGISTER') {
          this.needsVerification = true;
        } else {
          this.denied = true;
        }
      } else {
        alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
      }
    } finally {
      this.loading = false;
    }
  }

  async requestAccess() {
    if (!this.session.isApproved) {
      this.needsVerification = true;
      return;
    }
    try {
      await this.api.requestAccess({
        health_id: this.healthId.trim(),
        doctor_wallet: this.wallet,
        doctor_name: this.session.fullName || 'Doctor',
        facility_id: this.session.facilityId || 'UNKNOWN',
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
      await this.api.breakGlass(
        { health_id: this.healthId.trim(), facility_id: this.session.facilityId || 'UNKNOWN', reason },
        this.wallet
      );
      await this.viewRecord();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    }
  }

  entries(data: any): { key: string; value: any }[] {
    if (!data) return [];
    return Object.entries(data).map(([key, value]) => ({ key, value }));
  }
}
