import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

/**
 * Registration for the PoC.
 * In production a facility registers patients; here the patient can
 * self-register to try the demo. No MetaMask — the backend creates the
 * custodial wallet. The patient chooses a 4-digit PIN for login.
 */
@Component({
  selector: 'app-register',
  imports: [NgIf, FormsModule, RouterLink],
  template: `
    <div class="page-bg flex min-h-[calc(100svh-4.5rem)] items-center justify-center px-4 py-8 sm:px-6">
      <div class="card w-full max-w-[440px] p-8 sm:p-10">
        <span class="eyebrow mb-3">AfyaTrust</span>
        <h1 class="mb-2 text-2xl font-bold sm:text-3xl">Register</h1>
        <p class="mb-6 text-muted">
          Choose your PIN. Your wallet is created and managed for you — no MetaMask needed.
        </p>

        <div *ngIf="error" class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {{ error }}
        </div>

        <form (ngSubmit)="register()" #form="ngForm" class="flex flex-col gap-4">
          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-ink">Full Name</span>
            <input type="text" name="full_name" [(ngModel)]="model.full_name" required
                   class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500" />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-ink">Health ID</span>
            <input type="text" name="health_id" [(ngModel)]="model.health_id" required
                   class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500" />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-ink">Phone (optional)</span>
            <input type="text" name="phone" [(ngModel)]="model.phone"
                   class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500" />
          </label>

          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">PIN (4 digits)</span>
              <input type="password" name="pin" [(ngModel)]="model.pin" required minlength="4"
                     maxlength="4" pattern="[0-9]*" inputmode="numeric"
                     class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] tracking-[0.4em] outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Confirm PIN</span>
              <input type="password" name="pin2" [(ngModel)]="model.pin2" required minlength="4"
                     maxlength="4" pattern="[0-9]*" inputmode="numeric"
                     class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] tracking-[0.4em] outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500" />
            </label>
          </div>

          <button type="submit"
                  [disabled]="loading || !model.full_name || !model.health_id || model.pin.length !== 4"
                  class="mt-2 w-full rounded-lg bg-primary-500 px-3.5 py-3.5 text-base font-semibold text-ink transition-colors hover:bg-primary-400 disabled:opacity-50">
            {{ loading ? 'Registering…' : 'Register' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-muted">
          Already registered?
          <a routerLink="/login" class="font-semibold text-accent-700 hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  `,
})
export class RegisterComponent {
  loading = false;
  error = '';

  model = {
    full_name: '',
    health_id: '',
    phone: '',
    pin: '',
    pin2: '',
  };

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private router: Router
  ) {}

  async register() {
    this.error = '';

    if (this.model.pin !== this.model.pin2) {
      this.error = 'PINs do not match.';
      return;
    }
    if (!/^\d{4}$/.test(this.model.pin)) {
      this.error = 'PIN must be exactly 4 digits.';
      return;
    }

    this.loading = true;
    try {
      await this.api.registerPatient({
        health_id: this.model.health_id.trim(),
        full_name: this.model.full_name.trim(),
        pin: this.model.pin,
        phone: this.model.phone.trim() || undefined,
      });

      // Log straight in after registering.
      const res = await this.api.login(this.model.health_id.trim(), this.model.pin);
      this.auth.setSession(res);
      this.router.navigate(['/patient']);
    } catch (e: any) {
      this.error = e?.error?.error || e?.message || 'Registration failed';
    } finally {
      this.loading = false;
    }
  }
}
