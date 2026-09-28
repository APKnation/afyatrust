import { Component, OnInit } from '@angular/core';
import { NgIf, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../services/api.service';
import { DoctorSessionService } from '../doctor-landing/doctor-session.service';

/**
 * Doctor verification panel.
 * Doctors self-register with a license number + wallet; an administrator
 * approves the account in the Django admin. Until then every data request
 * is rejected by the backend.
 */
@Component({
  selector: 'app-doctor-verification',
  imports: [NgIf, SlicePipe, FormsModule],
  template: `
    <div class="rounded-2xl border border-gray-200 bg-white p-6">
      <h2 class="mb-1 text-xl font-bold">Doctor Verification</h2>
      <p class="mb-4 text-sm text-gray-500">
        Access to patient data requires a verified account (license + wallet).
        Admin approval is handled at /admin.
      </p>

      <!-- NOT CONNECTED -->
      <div *ngIf="!wallet" class="flex flex-wrap items-center gap-3">
        <button (click)="connect()"
                class="cursor-pointer rounded-lg bg-amber-500 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-amber-600">
          🦊 Connect MetaMask
        </button>
        <span class="text-sm text-gray-500">required — your wallet is your doctor identity</span>
      </div>

      <!-- CONNECTED -->
      <div *ngIf="wallet" class="flex flex-col gap-3.5">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded bg-gray-100 px-2.5 py-1.5 font-mono text-sm">
            {{ wallet | slice:0:8 }}…{{ wallet | slice:-6 }}
          </span>
          <span *ngIf="state === 'APPROVED'"
                class="rounded bg-emerald-500 px-2.5 py-1.5 text-xs font-bold text-white">✓ VERIFIED</span>
          <span *ngIf="state === 'PENDING'"
                class="rounded bg-amber-500 px-2.5 py-1.5 text-xs font-bold text-white">⏳ PENDING REVIEW</span>
          <span *ngIf="state === 'REJECTED'"
                class="rounded bg-red-500 px-2.5 py-1.5 text-xs font-bold text-white">✕ REVOKED</span>
          <button *ngIf="state !== 'APPROVED'" (click)="check()"
                  class="cursor-pointer rounded border border-gray-300 bg-white px-3 py-1.5 text-sm transition-colors hover:bg-gray-50">
            ⟳ Refresh status
          </button>
          <button (click)="disconnect()"
                  class="cursor-pointer rounded border border-gray-300 bg-white px-3 py-1.5 text-sm transition-colors hover:bg-gray-50">
            Disconnect
          </button>
        </div>

        <!-- NOT REGISTERED YET -->
        <div *ngIf="state === ''" class="grid grid-cols-1 gap-2.5 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
          <input [(ngModel)]="fullName" placeholder="Full name"
                 class="rounded-md border border-gray-300 px-2.5 py-2.5 text-sm" />
          <input [(ngModel)]="licenseNo" placeholder="Medical license number"
                 class="rounded-md border border-gray-300 px-2.5 py-2.5 text-sm" />
          <input [(ngModel)]="facilityId" placeholder="Facility ID (e.g. FAC-1)"
                 class="rounded-md border border-gray-300 px-2.5 py-2.5 text-sm sm:col-span-2" />
          <button (click)="register()" [disabled]="busy"
                  class="cursor-pointer rounded-md bg-teal-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50 sm:col-span-2">
            {{ busy ? 'Submitting…' : 'Submit for admin approval' }}
          </button>
        </div>

        <p *ngIf="state === 'PENDING'" class="m-0 text-sm text-amber-700">
          Your registration is waiting for an administrator to approve it.
          Once approved, press "Refresh status", then request access and view records below.
        </p>
      </div>
    </div>
  `,
})
export class DoctorVerificationComponent implements OnInit {
  fullName = '';
  licenseNo = '';
  facilityId = '';
  busy = false;

  private static readonly WALLET_KEY = 'afyatrust_doctor_wallet';

  constructor(
    private api: ApiService,
    public session: DoctorSessionService
  ) {}

  get wallet(): string {
    return this.session.wallet;
  }

  get state(): '' | 'PENDING' | 'APPROVED' | 'REJECTED' {
    return this.session.status;
  }

  async ngOnInit() {
    // Restore a previous session so a page refresh keeps the doctor signed in.
    const saved = localStorage.getItem(DoctorVerificationComponent.WALLET_KEY);
    if (saved) {
      this.session.wallet = saved;
      await this.check();
    }
  }

  async connect() {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      alert('MetaMask not installed. Install it, or ask the administrator to register your wallet manually.');
      return;
    }
    try {
      const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
      this.session.wallet = accounts[0] || '';
      if (this.session.wallet) {
        localStorage.setItem(DoctorVerificationComponent.WALLET_KEY, this.session.wallet);
        await this.check();
      }
    } catch {
      // declined — stay disconnected
    }
  }

  disconnect() {
    this.session.wallet = '';
    this.session.status = '';
    localStorage.removeItem(DoctorVerificationComponent.WALLET_KEY);
  }

  async check() {
    if (!this.session.wallet) return;
    try {
      const res: any = await this.api.doctorStatus(this.session.wallet);
      this.session.status = res.registered ? res.status : '';
      this.session.fullName = res.full_name || '';
      this.session.facilityId = res.facility_id || '';
      if (res.registered) {
        this.fullName = res.full_name || '';
        this.facilityId = res.facility_id || '';
      }
    } catch {
      // keep current state
    }
  }

  async register() {
    if (!this.fullName.trim() || !this.licenseNo.trim() || !this.facilityId.trim()) {
      alert('Full name, license number and facility ID are required.');
      return;
    }
    this.busy = true;
    try {
      await this.api.registerDoctor({
        full_name: this.fullName.trim(),
        license_no: this.licenseNo.trim(),
        wallet_address: this.session.wallet,
        facility_id: this.facilityId.trim(),
      });
      this.session.status = 'PENDING';
      this.session.fullName = this.fullName.trim();
      this.session.facilityId = this.facilityId.trim();
      alert('Submitted. An administrator must approve your account before you can access patient data.');
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    } finally {
      this.busy = false;
    }
  }
}
