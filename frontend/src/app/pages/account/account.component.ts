import { Component, OnInit } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

/**
 * Account page: view + edit your profile AND rotate your credential.
 * - Patients + doctors: edit full name / phone, and change PIN.
 * - Hospital staff: change password (staff profiles are admin-managed).
 *
 * The page adapts its labels and editable fields to the signed-in role.
 */
@Component({
  selector: 'app-account',
  imports: [NgIf, FormsModule, RouterLink],
  template: `
    <div class="page-bg flex min-h-[calc(100svh-4.5rem)] items-center justify-center px-4 py-8 sm:px-6">
      <div class="card w-full max-w-[480px] p-8 sm:p-10">
        <span class="eyebrow mb-3">Account</span>
        <h1 class="mb-1 text-2xl font-bold sm:text-3xl">Account settings</h1>
        <p class="mb-6 text-sm text-muted">
          {{ isStaff ? 'Admin-managed staff account — update your password below.' : 'Update your profile and your sign-in PIN.' }}
        </p>

        <div *ngIf="error" class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {{ error }}
        </div>
        <div *ngIf="success" class="mb-4 rounded-lg border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-900">
          {{ success }}
        </div>

        <!-- ============ PATIENT / DOCTOR: PROFILE SECTION ============ -->
        <div *ngIf="!isStaff" class="mb-6">
          <h2 class="mb-3 text-lg font-bold text-ink">Profile</h2>
          <p class="mb-4 text-xs text-muted">
            Full name and phone are editable. Health ID and wallet address are
            assigned by the platform and cannot be changed.
          </p>

          <dl class="mb-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <span class="text-xs text-muted uppercase tracking-wide">Health ID</span>
              <span class="text-sm font-mono font-semibold text-ink">{{ profile?.health_id }}</span>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <span class="text-xs text-muted uppercase tracking-wide">Wallet address</span>
              <span class="text-xs font-mono text-ink break-all">{{ profile?.wallet_address }}</span>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <span class="text-xs text-muted uppercase tracking-wide">Role</span>
              <span class="text-sm font-semibold text-ink">{{ roleLabel }}</span>
            </div>
          </dl>

          <form (ngSubmit)="saveProfile()" #profileForm="ngForm" class="flex flex-col gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Full name</span>
              <input
                type="text"
                name="full_name"
                [(ngModel)]="profileName"
                required
                autocomplete="name"
                class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Phone (optional)</span>
              <input
                type="tel"
                name="phone"
                [(ngModel)]="profilePhone"
                autocomplete="tel"
                class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>

            <button
              type="submit"
              [disabled]="profileBusy || !profileForm.valid"
              class="mt-2 w-full rounded-lg bg-primary-500 px-3.5 py-3.5 text-base font-semibold text-ink transition-colors hover:bg-primary-400 disabled:opacity-50"
            >
              {{ profileBusy ? 'Saving…' : 'Save profile' }}
            </button>
          </form>
        </div>

        <!-- ============ ALL ROLES: CREDENTIAL SECTION ============ -->
        <hr class="my-6 border-slate-200" />

        <h2 class="mb-3 text-lg font-bold text-ink">
          {{ isStaff ? 'Change password' : 'Change PIN' }}
        </h2>
        <p class="mb-4 text-xs text-muted">
          {{ isStaff ? 'Use a password with at least 8 characters.' : 'Use a 4-digit PIN you have not used before.' }}
        </p>

        <form (ngSubmit)="saveCredential()" #credForm="ngForm" class="flex flex-col gap-4">
          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-ink">{{ isStaff ? 'Current password' : 'Current PIN' }}</span>
            <input
              type="password"
              name="current_secret"
              [(ngModel)]="current"
              required
              [attr.inputmode]="isStaff ? null : 'numeric'"
              autocomplete="current-password"
              class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-ink">
              {{ isStaff ? 'New password (min 8 characters)' : 'New PIN (4 digits)' }}
            </span>
            <input
              type="password"
              name="new_secret"
              [(ngModel)]="next"
              required
              [minlength]="isStaff ? 8 : 4"
              [maxlength]="isStaff ? 72 : 4"
              [attr.inputmode]="isStaff ? null : 'numeric'"
              autocomplete="new-password"
              class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-ink">Confirm new</span>
            <input
              type="password"
              name="confirm"
              [(ngModel)]="confirm"
              required
              autocomplete="new-password"
              class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>

          <button
            type="submit"
            [disabled]="credBusy || !credForm.valid"
            class="mt-2 w-full rounded-lg bg-primary-500 px-3.5 py-3.5 text-base font-semibold text-ink transition-colors hover:bg-primary-400 disabled:opacity-50"
          >
            {{ credBusy ? 'Saving…' : (isStaff ? 'Save password' : 'Save PIN') }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-muted">
          <a routerLink="/login" class="font-semibold text-accent-700 hover:underline">Back to sign in</a>
        </p>
      </div>
    </div>
  `,
})
export class AccountComponent implements OnInit {
  current = '';
  next = '';
  confirm = '';
  busy = false;
  error = '';
  success = '';

  profile: { health_id: string; full_name: string; phone: string; wallet_address: string } | null = null;
  profileName = '';
  profilePhone = '';
  profileBusy = false;

  credBusy = false;

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private router: Router
  ) {}

  get isStaff(): boolean {
    return this.auth.isStaff;
  }

  get roleLabel(): string {
    if (this.auth.isPatient) return 'Patient';
    if (this.auth.isDoctor) return 'Doctor';
    if (this.auth.isStaff) return 'Hospital staff';
    return 'Signed in';
  }

  async ngOnInit() {
    if (!this.auth.isStaff) {
      try {
        this.profile = await this.api.patientProfile();
        this.profileName = this.profile.full_name;
        this.profilePhone = this.profile.phone || '';
      } catch {
        this.profile = null;
        this.profileName = '';
        this.profilePhone = '';
      }
    }
  }

  async saveProfile() {
    if (!this.profile) return;
    this.error = '';
    this.profileBusy = true;
    try {
      const res: any = await this.api.patchPatientProfile({
        full_name: this.profileName.trim(),
        phone: this.profilePhone.trim(),
      });
      this.success = 'Profile updated.';
      this.profile = { ...this.profile, full_name: res.full_name, phone: res.phone };
    } catch (e: any) {
      this.error = e?.error?.error || e?.message || 'Could not update profile';
    } finally {
      this.profileBusy = false;
    }
  }

  async saveCredential() {
    this.error = '';
    this.success = '';

    if (this.isStaff) {
      if (this.next.length < 8) {
        this.error = 'New password must be at least 8 characters.';
        return;
      }
    } else {
      if (!/^\d{4}$/.test(this.next)) {
        this.error = 'New PIN must be exactly 4 digits.';
        return;
      }
    }
    if (this.next !== this.confirm) {
      this.error = 'New credentials do not match.';
      return;
    }

    this.credBusy = true;
    try {
      await this.api.changeSecret(this.current, this.next);
      this.success = this.isStaff
        ? 'Password updated. Use it next time you sign in.'
        : 'PIN updated. Use it next time you sign in.';
      this.current = '';
      this.next = '';
      this.confirm = '';
      // Navigate to the role's workspace after a short beat.
      const target = this.auth.isDoctor ? ['/doctor'] : this.auth.isStaff ? ['/hospital'] : ['/patient'];
      setTimeout(() => this.router.navigate(target), 1200);
    } catch (e: any) {
      this.error = e?.error?.error || e?.message || 'Could not update credentials';
    } finally {
      this.credBusy = false;
    }
  }
}
