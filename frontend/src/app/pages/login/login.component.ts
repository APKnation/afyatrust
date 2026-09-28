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
    <div class="flex min-h-full items-center justify-center p-6">
      <div class="w-full max-w-[420px] rounded-2xl border border-gray-200 bg-slate-50 p-8">
        <h1 class="mb-2 text-2xl font-bold">Patient sign in</h1>
        <p class="mb-6 text-gray-600">Use your Health ID and PIN.</p>

        <div *ngIf="error" class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {{ error }}
        </div>

        <form (ngSubmit)="login()" #form="ngForm" class="flex flex-col gap-4">
          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-gray-700">Health ID</span>
            <input
              type="text"
              name="health_id"
              [(ngModel)]="healthId"
              required
              autocomplete="username"
              class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-blue-800"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-gray-700">PIN (4 digits)</span>
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
              class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] tracking-[0.5em] outline-none focus:border-transparent focus:ring-2 focus:ring-blue-800"
            />
          </label>

          <button
            type="submit"
            [disabled]="loading || !healthId || pin.length !== 4"
            class="mt-2 w-full rounded-lg bg-blue-800 px-3.5 py-3.5 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-gray-600">
          New patient? Visit a registered facility, then
          <a routerLink="/register" class="font-semibold text-blue-800 hover:underline">set your PIN</a>.
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
