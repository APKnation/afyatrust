import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

/**
 * Account page: rotate your own credential (works for every role).
 * Patients and doctors use a 4-digit PIN; hospital staff use a password
 * (8+ characters). The current secret must be supplied — the page adapts
 * its labels to the signed-in role.
 */
@Component({
  selector: 'app-account',
  imports: [NgIf, FormsModule, RouterLink],
  template: `
    <div class="page-bg flex min-h-[calc(100svh-4.5rem)] items-center justify-center px-4 py-8 sm:px-6">
      <div class="card w-full max-w-[440px] p-8 sm:p-10">
        <span class="eyebrow mb-3">Account</span>
        <h1 class="mb-2 text-2xl font-bold sm:text-3xl">Account settings</h1>
        <p class="mb-6 text-muted">
          {{ isStaff ? 'Change your password.' : 'Change your PIN.' }}
        </p>

        <div *ngIf="error" class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {{ error }}
        </div>
        <div *ngIf="success" class="mb-4 rounded-lg border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-900">
          {{ success }}
        </div>

        <form (ngSubmit)="save()" #form="ngForm" class="flex flex-col gap-4">
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
            [disabled]="busy || !form.valid"
            class="mt-2 w-full rounded-lg bg-primary-500 px-3.5 py-3.5 text-base font-semibold text-ink transition-colors hover:bg-primary-400 disabled:opacity-50"
          >
            {{ busy ? 'Saving…' : 'Save' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-muted">
          <a routerLink="/login" class="font-semibold text-accent-700 hover:underline">Back to sign in</a>
        </p>
      </div>
    </div>
  `,
})
export class AccountComponent {
  current = '';
  next = '';
  confirm = '';
  busy = false;
  error = '';
  success = '';

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private router: Router
  ) {}

  get isStaff(): boolean {
    return this.auth.isStaff;
  }

  async save() {
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

    this.busy = true;
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
      this.busy = false;
    }
  }
}
