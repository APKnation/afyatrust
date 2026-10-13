import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, HospitalOption } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

/**
 * Registration for the PoC.
 * In production a facility registers patients; here the patient can
 * self-register to try the demo. No MetaMask — the backend creates the
 * custodial wallet. The patient chooses a 4-digit PIN for login.
 */
@Component({
  selector: 'app-register',
  imports: [NgFor, NgIf, FormsModule, RouterLink],
  template: `
    <!-- ================= SPLIT LAYOUT ================= -->
    <div class="flex min-h-screen bg-white">

      <!-- RIGHT: Form Side on desktop -->
      <div class="w-full lg:order-2 lg:w-1/2 flex flex-col justify-center px-8 sm:px-16 lg:px-24 xl:px-32 relative z-10 py-12 overflow-y-auto">
        <div class="max-w-[440px] w-full mx-auto">
          <div class="mb-6">
            <button type="button" routerLink="/" class="inline-flex items-center text-sm font-medium text-slate-500 hover:text-primary-600 transition-colors gap-1.5 rounded-lg px-3 py-1.5 -ml-2 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
              Back to home
            </button>
          </div>

          <div class="mb-10">
            <h1 class="text-3xl font-bold text-slate-900 mb-3 tracking-tight">Create your account</h1>
          </div>

          <div *ngIf="error" class="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-3">
            <span>{{ error }}</span>
          </div>

          <form (ngSubmit)="register()" #form="ngForm" class="flex flex-col gap-3">

            <div class="space-y-1.5">
              <label class="text-sm font-semibold text-slate-700">Full name</label>
              <input type="text" name="full_name" [(ngModel)]="model.full_name" required
                     class="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all"
                     placeholder="Enter your full name" />
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-semibold text-slate-700">Health ID</label>
              <input type="text" name="health_id" [(ngModel)]="model.health_id" required
                     class="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all"
                     placeholder="Enter your Health ID" />
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-semibold text-slate-700">Registering hospital</label>
              <select name="facility_id" [(ngModel)]="model.facility_id" required
                      class="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-slate-900 outline-none focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all">
                <option value="" disabled selected>Select your hospital</option>
                <option *ngFor="let hospital of hospitals" [value]="hospital.code">
                  {{ hospital.name }} ({{ hospital.code }})
                </option>
              </select>
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-semibold text-slate-700 flex items-center justify-between">
                <span>Phone number</span>
                <span class="text-xs text-slate-400 font-normal">Optional</span>
              </label>
              <input type="text" name="phone" [(ngModel)]="model.phone"
                     class="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all"
                     placeholder="Enter your phone number" />
            </div>

            <div class="space-y-3">
              <div class="space-y-1.5">
                <label for="register-pin" class="text-sm font-semibold text-slate-700">Create a 4-digit PIN</label>
                <input id="register-pin" type="password" name="pin" [(ngModel)]="model.pin" required
                       minlength="4" maxlength="4" pattern="[0-9]*" inputmode="numeric"
                       autocomplete="new-password"
                       class="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-base text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all"
                       placeholder="Create your PIN" />
              </div>
              <div class="space-y-1.5">
                <label for="register-pin-confirm" class="text-sm font-semibold text-slate-700">Re-enter your 4-digit PIN</label>
                <input id="register-pin-confirm" type="password" name="pin2" [(ngModel)]="model.pin2" required
                       minlength="4" maxlength="4" pattern="[0-9]*" inputmode="numeric"
                       autocomplete="new-password" aria-describedby="pin-confirm-feedback"
                       class="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-base text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all"
                       placeholder="Confirm password" />
                <p *ngIf="model.pin2 && model.pin !== model.pin2" id="pin-confirm-feedback" class="m-0 text-sm text-red-700" role="alert">
                  The PINs do not match yet. Check both entries.
                </p>
                <p *ngIf="model.pin2 && model.pin === model.pin2" id="pin-confirm-feedback" class="m-0 text-sm text-slate-600">
                  PINs match.
                </p>
              </div>
            </div>

            <button type="submit"
                    [disabled]="loading || !model.full_name || !model.health_id || !model.facility_id || model.pin.length !== 4"
                    class="btn-primary w-full py-4 mt-4 text-base rounded-xl shadow-lg shadow-primary-500/25">
              {{ loading ? 'Creating your account…' : 'Create account' }}
            </button>
          </form>            <p class="mt-8 text-center text-slate-500 font-medium">
            Already have an account?
            <a routerLink="/login" class="font-bold text-primary-600 hover:text-primary-700 transition-colors ml-1">Sign in</a>
          </p>
        </div>
      </div>

      <!-- LEFT: Hero Side on desktop -->
      <div class="hidden lg:order-1 lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center bg-cover bg-center p-12" style="background-image: url('/hospital.jpg')">
        <div class="absolute inset-0 bg-slate-950/75"></div>
        <!-- Animated glowing orbs -->
        <div class="absolute inset-0 opacity-40 pointer-events-none">
          <div class="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-accent-500 mix-blend-screen filter blur-[120px] animate-pulse" style="animation-duration: 9s;"></div>
          <div class="absolute bottom-[-10%] left-[-10%] w-[70%] h-[70%] rounded-full bg-primary-600 mix-blend-screen filter blur-[140px] animate-pulse" style="animation-delay: 3s; animation-duration: 11s;"></div>
          <div class="absolute top-[40%] left-[30%] w-[40%] h-[40%] rounded-full bg-accent-600 mix-blend-screen filter blur-[100px] animate-pulse" style="animation-delay: 1s; animation-duration: 13s;"></div>
        </div>

      </div>
    </div>

  `,
})
export class RegisterComponent implements OnInit {
  menuOpen = false;
  loading = false;
  error = '';
  hospitals: HospitalOption[] = [];

  model = {
    full_name: '',
    health_id: '',
    phone: '',
    facility_id: '',
    pin: '',
    pin2: '',
  };

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    try {
      this.hospitals = await this.api.hospitals();
    } catch (e: any) {
      this.error = e?.error?.error || e?.error?.detail || 'Could not load hospitals. Please try again.';
    } finally {
      this.cdr.detectChanges();
    }
  }

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
    if (!this.model.facility_id) {
      this.error = 'Select the hospital where you are registering.';
      return;
    }

    this.loading = true;
    try {
      await this.api.registerPatient({
        health_id: this.model.health_id.trim(),
        full_name: this.model.full_name.trim(),
        pin: this.model.pin,
        phone: this.model.phone.trim() || undefined,
        facility_id: this.model.facility_id,
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
