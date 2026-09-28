import { Component, OnInit } from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, HospitalOption } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';

/**
 * Doctor registration + login.
 * No MetaMask: the doctor registers with name + license number + hospital
 * (from a dropdown) + 4-digit PIN. An admin approves the account, then the
 * doctor signs in with license number + PIN. A custodial wallet is created
 * for on-chain permissions behind the scenes.
 */
@Component({
  selector: 'app-doctor-auth',
  imports: [NgIf, NgFor, FormsModule, RouterLink],
  template: `
    <div class="flex min-h-[calc(100svh-4.5rem)] items-center justify-center px-4 py-8 sm:px-6">
      <div class="w-full max-w-[480px] rounded-xl bg-surface p-8 shadow-card">
        <h1 class="mb-2 text-2xl font-bold">Doctor Portal</h1>

        <!-- Already signed in -->
        <div *ngIf="auth.isDoctor" class="mt-2">
          <p class="m-0">You are signed in as <strong>Dr. {{ auth.fullName }}</strong>.</p>
          <a routerLink="/doctor"
             class="mt-4 block rounded-lg bg-primary-500 px-4 py-3 text-center font-semibold text-ink no-underline transition-colors hover:bg-primary-400">
            Open my dashboard
          </a>
        </div>

        <ng-container *ngIf="!auth.isDoctor">
          <p class="mb-6 text-muted">
            No MetaMask, no crypto — sign in with your medical license number and PIN.
          </p>

          <!-- Tab switch -->
          <div class="mb-6 flex gap-2 rounded-lg bg-primary-50 p-1.5">
            <button type="button" (click)="mode = 'login'"
                    class="flex-1 cursor-pointer rounded-md border-none px-3 py-2.5 text-sm font-semibold transition-colors"
                    [class]="mode === 'login' ? 'bg-primary-500 text-ink' : 'bg-transparent text-muted'">
              Sign in
            </button>
            <button type="button" (click)="mode = 'register'"
                    class="flex-1 cursor-pointer rounded-md border-none px-3 py-2.5 text-sm font-semibold transition-colors"
                    [class]="mode === 'register' ? 'bg-primary-500 text-ink' : 'bg-transparent text-muted'">
              Register
            </button>
          </div>

          <div *ngIf="error" class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {{ error }}
          </div>
          <div *ngIf="info" class="mb-4 rounded-lg border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-900">
            {{ info }}
          </div>

          <!-- ============ LOGIN ============ -->
          <form *ngIf="mode === 'login'" (ngSubmit)="login()" #loginForm="ngForm" class="flex flex-col gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Medical license number</span>
              <input type="text" name="license_no" [(ngModel)]="loginModel.license_no" required
                     class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:ring-2 focus:ring-primary-500" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">PIN (4 digits)</span>
              <input type="password" name="pin" [(ngModel)]="loginModel.pin" required minlength="4"
                     maxlength="4" pattern="[0-9]*" inputmode="numeric"
                     class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] tracking-[0.4em] outline-none focus:ring-2 focus:ring-primary-500" />
            </label>
            <button type="submit" [disabled]="busy || !loginForm.valid"
                    class="mt-2 w-full rounded-lg bg-primary-500 px-3.5 py-3.5 text-base font-semibold text-ink transition-colors hover:bg-primary-400 disabled:opacity-50">
              {{ busy ? 'Signing in…' : 'Sign in' }}
            </button>
            <button type="button" (click)="checkStatus()"
                    class="w-full cursor-pointer rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-gray-50">
              ⟳ Check my approval status
            </button>
          </form>

          <!-- ============ REGISTER ============ -->
          <form *ngIf="mode === 'register'" (ngSubmit)="register()" #regForm="ngForm" class="flex flex-col gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Full name</span>
              <input type="text" name="full_name" [(ngModel)]="regModel.full_name" required
                     class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:ring-2 focus:ring-primary-500" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Medical license number</span>
              <input type="text" name="license_no" [(ngModel)]="regModel.license_no" required
                     class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:ring-2 focus:ring-primary-500" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Hospital</span>
              <select name="hospital_code" [(ngModel)]="regModel.hospital_code" required
                      class="rounded-lg border border-gray-300 bg-white px-3 py-3 text-[15px] outline-none focus:ring-2 focus:ring-primary-500">
                <option value="" disabled>Select your hospital…</option>
                <option *ngFor="let h of hospitals" [value]="h.code">{{ h.name }} ({{ h.code }})</option>
              </select>
              <span *ngIf="hospitals.length === 0" class="text-xs text-muted">
                No hospitals registered yet — ask the administrator to add one in the admin panel.
              </span>
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="flex flex-col gap-1.5">
                <span class="text-[13px] font-semibold text-ink">PIN (4 digits)</span>
                <input type="password" name="pin" [(ngModel)]="regModel.pin" required minlength="4"
                       maxlength="4" pattern="[0-9]*" inputmode="numeric"
                       class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] tracking-[0.4em] outline-none focus:ring-2 focus:ring-primary-500" />
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="text-[13px] font-semibold text-ink">Confirm PIN</span>
                <input type="password" name="pin2" [(ngModel)]="regModel.pin2" required minlength="4"
                       maxlength="4" pattern="[0-9]*" inputmode="numeric"
                       class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] tracking-[0.4em] outline-none focus:ring-2 focus:ring-primary-500" />
              </label>
            </div>
            <button type="submit" [disabled]="busy || !regForm.valid"
                    class="mt-2 w-full rounded-lg bg-accent-500 px-3.5 py-3.5 text-base font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50">
              {{ busy ? 'Submitting…' : 'Submit for admin approval' }}
            </button>
            <p class="mb-0 text-center text-[12px] text-muted">
              An administrator verifies your license and approves your account before you can sign in.
            </p>
          </form>
        </ng-container>
      </div>
    </div>
  `,
})
export class DoctorAuthComponent implements OnInit {
  mode: 'login' | 'register' = 'login';
  busy = false;
  error = '';
  info = '';

  hospitals: HospitalOption[] = [];

  loginModel = { license_no: '', pin: '' };
  regModel = { full_name: '', license_no: '', hospital_code: '', pin: '', pin2: '' };

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private router: Router
  ) {}

  async ngOnInit() {
    try {
      this.hospitals = await this.api.hospitals();
    } catch {
      this.hospitals = [];
    }
  }

  async login() {
    this.error = '';
    this.info = '';
    if (!/^\d{4}$/.test(this.loginModel.pin)) {
      this.error = 'PIN must be exactly 4 digits.';
      return;
    }
    this.busy = true;
    try {
      const res = await this.api.doctorLogin(
        this.loginModel.license_no.trim(), this.loginModel.pin
      );
      this.auth.setDoctorSession(res);
      this.router.navigate(['/doctor']);
    } catch (e: any) {
      this.error = e?.error?.error || e?.message || 'Sign in failed';
    } finally {
      this.busy = false;
    }
  }

  async register() {
    this.error = '';
    this.info = '';
    if (!/^\d{4}$/.test(this.regModel.pin)) {
      this.error = 'PIN must be exactly 4 digits.';
      return;
    }
    if (this.regModel.pin !== this.regModel.pin2) {
      this.error = 'PINs do not match.';
      return;
    }
    this.busy = true;
    try {
      await this.api.registerDoctor({
        full_name: this.regModel.full_name.trim(),
        license_no: this.regModel.license_no.trim(),
        hospital_code: this.regModel.hospital_code,
        pin: this.regModel.pin,
      });
      this.info =
        'Registration received. An administrator must approve your account before you can sign in.';
      this.mode = 'login';
      this.loginModel.license_no = this.regModel.license_no.trim();
      this.regModel = { full_name: '', license_no: '', hospital_code: '', pin: '', pin2: '' };
    } catch (e: any) {
      this.error = e?.error?.error || e?.message || 'Registration failed';
    } finally {
      this.busy = false;
    }
  }

  async checkStatus() {
    this.error = '';
    this.info = '';
    const license = this.loginModel.license_no.trim();
    if (!license) {
      this.error = 'Enter your license number first.';
      return;
    }
    try {
      const res: any = await this.api.doctorStatus(license);
      if (!res.registered) {
        this.info = 'No registration found for that license number — register first.';
      } else if (res.status === 'APPROVED') {
        this.info = 'Approved ✓ — you can sign in.';
      } else if (res.status === 'PENDING') {
        this.info = 'Your registration is waiting for admin approval.';
      } else {
        this.info = `Your account status: ${res.status}. Contact the administrator.`;
      }
    } catch (e: any) {
      this.error = e?.error?.error || e?.message || 'Could not check status';
    }
  }
}
