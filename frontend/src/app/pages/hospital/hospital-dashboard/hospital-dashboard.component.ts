import { Component, OnInit } from '@angular/core';
import { NgIf, NgFor, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService, ReferralItem } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';

/**
 * Hospital referral desk.
 * Staff of the receiving hospital see incoming referrals and accept or
 * decline them — no Django admin needed. Filter by status; every response
 * is recorded with the staff member's name (audit).
 */
@Component({
  selector: 'app-hospital-dashboard',
  imports: [NgIf, NgFor, DatePipe],
  template: `
    <div class="mx-auto max-w-6xl">
      <!-- Header -->
      <div class="mb-5 rounded-xl bg-surface p-6 shadow-card">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 class="mb-1 text-2xl font-bold">{{ hospitalName || 'Hospital' }} — Referral Desk</h1>
            <p class="m-0 text-sm text-muted">
              Signed in as <strong>{{ auth.fullName }}</strong>
              <span *ngIf="auth.hospitalCode" class="ml-1">({{ auth.hospitalCode }})</span>
            </p>
          </div>
          <span class="rounded bg-accent-100 px-3 py-1.5 text-sm font-bold text-accent-800">
            🏥 {{ pendingCount }} pending
          </span>
        </div>
      </div>

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
      <div *ngFor="let r of referrals" class="mb-3.5 rounded-xl border border-gray-200 bg-surface p-5 shadow-card">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="m-0 text-lg font-bold text-ink">
              🧑 {{ r.patient_name }}
              <span class="text-sm font-normal text-muted">({{ r.patient_health_id }})</span>
            </p>
            <p class="m-0 mt-1 text-sm text-muted">
              From: <strong>{{ r.from_hospital || 'Unknown facility' }}</strong>
              <span *ngIf="r.from_doctor" class="ml-1">· Dr. {{ r.from_doctor }}</span>
            </p>
            <p *ngIf="r.reason" class="mb-0 mt-2 rounded-md bg-gray-100 px-3 py-2 text-sm text-ink italic">
              💬 {{ r.reason }}
            </p>
            <p class="m-0 mt-2 text-xs text-muted">📅 Sent {{ r.created_at | date:'medium' }}</p>
            <p *ngIf="r.responded_by" class="m-0 text-xs text-muted">
              Responded by {{ r.responded_by }} {{ r.responded_at ? ('· ' + (r.responded_at | date:'short')) : '' }}
            </p>
          </div>
          <div class="flex flex-col items-end gap-2.5">
            <span class="rounded px-2.5 py-1 text-xs font-bold" [class]="badge(r.status)">{{ r.status }}</span>
            <div *ngIf="r.status === 'PENDING'" class="flex gap-2">
              <button (click)="respond(r, 'ACCEPTED')" [disabled]="busyId === r.id"
                      class="cursor-pointer rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50">
                ✅ Accept
              </button>
              <button (click)="respond(r, 'DECLINED')" [disabled]="busyId === r.id"
                      class="cursor-pointer rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50">
                ❌ Decline
              </button>
            </div>
          </div>
        </div>
      </div>

      <p *ngIf="referrals.length === 0 && !loading" class="py-10 text-center text-muted italic">
        {{ filter === 'PENDING' ? 'No pending referrals — all caught up! 🎉' : 'No referrals found.' }}
      </p>
    </div>
  `,
})
export class HospitalDashboardComponent implements OnInit {
  filter = 'PENDING';
  filters = [
    { label: '📬 Pending', value: 'PENDING' },
    { label: '✅ Accepted', value: 'ACCEPTED' },
    { label: '❌ Declined', value: 'DECLINED' },
    { label: '🗂️ All', value: '' },
  ] as const;

  referrals: ReferralItem[] = [];
  loading = false;
  busyId: number | null = null;

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private router: Router
  ) {}

  get hospitalName(): string {
    return this.auth.hospitalCode; // name comes from login response; code is a fine label
  }

  get pendingCount(): number {
    return this.referrals.filter((r) => r.status === 'PENDING').length;
  }

  async ngOnInit() {
    if (!this.auth.isStaff) {
      this.router.navigate(['/staff-login']);
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
    try {
      this.referrals = await this.api.hospitalReferrals(this.filter || undefined);
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed to load referrals'));
    } finally {
      this.loading = false;
    }
  }

  async respond(r: ReferralItem, action: 'ACCEPTED' | 'DECLINED') {
    this.busyId = r.id;
    try {
      await this.api.respondReferral(r.id, action);
      await this.reload();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    } finally {
      this.busyId = null;
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
}
