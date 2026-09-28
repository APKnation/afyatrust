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
    <div class="flex min-h-full items-center justify-center p-6">
      <div class="w-full max-w-[440px] rounded-2xl border border-gray-200 bg-slate-50 p-8">
        <h1 class="mb-2 text-2xl font-bold">Register</h1>
        <p class="mb-6 text-gray-600">
          Choose your PIN. Your wallet is created and managed for you — no MetaMask needed.
        </p>

        <div *ngIf="error" class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {{ error }}
        </div>

        <form (ngSubmit)="register()" #form="ngForm" class="flex flex-col gap-4">
          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-gray-700">Full Name</span>
            <input type="text" name="full_name" [(ngModel)]="model.full_name" required
                   class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-blue-800" />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-gray-700">Health ID</span>
            <input type="text" name="health_id" [(ngModel)]="model.health_id" required
                   class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-blue-800" />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-gray-700">Phone (optional)</span>
            <input type="text" name="phone" [(ngModel)]="model.phone"
                   class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-blue-800" />
          </label>

          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-gray-700">PIN (4 digits)</span>
              <input type="password" name="pin" [(ngModel)]="model.pin" required minlength="4"
                     maxlength="4" pattern="[0-9]*" inputmode="numeric"
                     class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] tracking-[0.4em] outline-none focus:border-transparent focus:ring-2 focus:ring-blue-800" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-gray-700">Confirm PIN</span>
              <input type="password" name="pin2" [(ngModel)]="model.pin2" required minlength="4"
                     maxlength="4" pattern="[0-9]*" inputmode="numeric"
                     class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] tracking-[0.4em] outline-none focus:border-transparent focus:ring-2 focus:ring-blue-800" />
            </label>
          </div>

          <button type="submit"
                  [disabled]="loading || !model.full_name || !model.health_id || model.pin.length !== 4"
                  class="mt-2 w-full rounded-lg bg-blue-800 px-3.5 py-3.5 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
            {{ loading ? 'Registering…' : 'Register' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-gray-600">
          Already registered?
          <a routerLink="/login" class="font-semibold text-blue-800 hover:underline">Sign in</a>
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
