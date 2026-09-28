import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

type LoginRole = 'PATIENT' | 'DOCTOR' | 'STAFF';

/**
 * Single sign-in for every role. The user enters their identifier and
 * secret; the backend recognises the credential type and returns the role,
 * and the app routes to the matching workspace. The page reveals nothing
 * about which roles exist.
 */
@Component({
  selector: 'app-login',
  imports: [NgIf, FormsModule, RouterLink],
  template: `
    <div class="page-bg flex min-h-[calc(100svh-4.5rem)] items-center justify-center px-4 py-8 sm:px-6">
      <div class="card w-full max-w-[420px] p-8 sm:p-10">
        <span class="eyebrow mb-3">AfyaTrust</span>
        <h1 class="mb-2 text-2xl font-bold sm:text-3xl">Sign in</h1>
        <p class="mb-6 text-muted">
          Enter your ID and PIN or password. You will be taken to your workspace.
        </p>

        <div *ngIf="error" class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {{ error }}
        </div>

        <form (ngSubmit)="login()" #form="ngForm" class="flex flex-col gap-4">
          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-ink">ID</span>
            <input
              type="text"
              name="identity"
              [(ngModel)]="identity"
              required
              autocomplete="username"
              class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-ink">PIN or password</span>
            <input
              type="password"
              name="secret"
              [(ngModel)]="secret"
              required
              autocomplete="current-password"
              class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500"
            />
          </label>

          <button
            type="submit"
            [disabled]="loading || !identity || !secret"
            class="mt-2 w-full rounded-lg bg-primary-500 px-3.5 py-3.5 text-base font-bold text-ink transition-colors hover:bg-primary-400 disabled:opacity-50"
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
  identity = '';
  secret = '';
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
      const res = await this.api.unifiedLogin(this.identity.trim(), this.secret);
      this.auth.setUnifiedSession(res);
      this.router.navigate(this.routeFor(res.role as LoginRole));
    } catch (e: any) {
      this.error = e?.error?.error || e?.message || 'Invalid credentials';
    } finally {
      this.loading = false;
    }
  }

  private routeFor(role: LoginRole): string[] {
    switch (role) {
      case 'DOCTOR': return ['/doctor'];
      case 'STAFF':  return ['/hospital'];
      default:       return ['/patient'];
    }
  }
}
