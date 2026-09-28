import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [NgIf, FormsModule, RouterLink],
  template: `
    <div class="flex min-h-[calc(100svh-4.5rem)] items-center justify-center px-4 py-8 sm:px-6">
      <div class="w-full max-w-[420px] rounded-xl bg-surface p-8 shadow-card">
        <h1 class="mb-2 text-2xl font-bold">Patient sign in</h1>
        <p class="mb-6 text-muted">Use your Health ID and PIN.</p>

        <div *ngIf="error" class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {{ error }}
        </div>

        <form (ngSubmit)="login()" #form="ngForm" class="flex flex-col gap-4">
          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-ink">Health ID</span>
            <input
              type="text"
              name="health_id"
              [(ngModel)]="healthId"
              required
              autocomplete="username"
              class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-ink">PIN (4 digits)</span>
            <input
              type="password"
              name="pin"
              [(ngModel)]="pin"
              required
              minlength="4"
              maxlength="4"
              pattern="[0-9]*"
              inputmode="numeric"
              autocomplete="current-password"
              class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] tracking-[0.5em] outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500"
            />
          </label>

          <button
            type="submit"
            [disabled]="loading || !healthId || pin.length !== 4"
            class="mt-2 w-full rounded-lg bg-primary-500 px-3.5 py-3.5 text-base font-semibold text-ink transition-colors hover:bg-primary-400 disabled:opacity-50"
          >
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-muted">
          New patient? Visit a registered facility, then
          <a routerLink="/register" class="font-semibold text-accent-700 hover:underline">set your PIN</a>.
        </p>
      </div>
    </div>
  `,
})
export class LoginComponent {
  healthId = '';
  pin = '';
  loading = false;
  error = '';

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private router: Router
  ) {}

  async login() {
    this.error = '';
    this.loading = true;
    try {
      const res = await this.api.login(this.healthId.trim(), this.pin);
      this.auth.setSession(res);
      this.router.navigate(['/patient']);
    } catch (e: any) {
      this.error = e?.error?.error || e?.message || 'Sign-in failed';
    } finally {
      this.loading = false;
    }
  }
}
