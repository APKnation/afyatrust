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
    <nav class="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-5 lg:px-12">
      <div class="flex items-center gap-2">
        <a routerLink="/" class="text-2xl font-bold text-slate-900 tracking-tight cursor-pointer">Afya<span class="text-primary-500">Trust</span></a>
      </div>
      <div class="flex items-center gap-4">
        <a routerLink="/" class="hidden sm:block text-slate-500 hover:text-slate-900 font-medium transition-colors">Back to Home</a>
        <a routerLink="/login" class="px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors shadow-sm">Log in</a>
      </div>
    </nav>

    <div class="flex min-h-screen bg-white">
      <!-- LEFT: Form Side -->
      <div class="w-full lg:w-1/2 flex flex-col justify-center px-8 sm:px-16 lg:px-24 xl:px-32 relative z-10 pt-28 pb-12 overflow-y-auto">
        <div class="max-w-[440px] w-full mx-auto">
          <div class="mb-10">
            <span class="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary-50 text-primary-600 mb-6 border border-primary-100/50">
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </span>
            <h1 class="text-3xl font-bold text-slate-900 mb-3 tracking-tight">Create your account</h1>
            <p class="text-slate-500 text-lg">Your custodial blockchain wallet will be automatically generated for you.</p>
          </div>
          
          <div *ngIf="error" class="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-3 animate-fade-in">
             <svg class="w-5 h-5 shrink-0 mt-0.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
             <span>{{ error }}</span>
          </div>

          <form (ngSubmit)="register()" #form="ngForm" class="flex flex-col gap-5">
            <div class="space-y-1.5">
              <label class="text-sm font-semibold text-slate-700">Full Name</label>
              <input type="text" name="full_name" [(ngModel)]="model.full_name" required 
                     class="w-full rounded-xl border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all" 
                     placeholder="John Doe" />
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-semibold text-slate-700">Health ID</label>
              <input type="text" name="health_id" [(ngModel)]="model.health_id" required 
                     class="w-full rounded-xl border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all" 
                     placeholder="e.g. 123456789" />
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-semibold text-slate-700">Registering hospital</label>
              <select name="facility_id" [(ngModel)]="model.facility_id" required 
                      class="w-full rounded-xl border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all">
                <option value="" disabled selected>Select your hospital</option>
                <option *ngFor="let hospital of hospitals" [value]="hospital.code">
                  {{ hospital.name }} ({{ hospital.code }})
                </option>
              </select>
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-semibold text-slate-700 flex justify-between">
                <span>Phone Number</span>
                <span class="text-slate-400 font-normal">Optional</span>
              </label>
              <input type="text" name="phone" [(ngModel)]="model.phone" 
                     class="w-full rounded-xl border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all" 
                     placeholder="+255..." />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="text-sm font-semibold text-slate-700">PIN (4 digits)</label>
                <input type="password" name="pin" [(ngModel)]="model.pin" required minlength="4" maxlength="4" pattern="[0-9]*" inputmode="numeric" 
                       class="w-full rounded-xl border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all tracking-[0.4em] text-center font-mono text-lg" 
                       placeholder="••••" />
              </div>
              <div class="space-y-1.5">
                <label class="text-sm font-semibold text-slate-700">Confirm PIN</label>
                <input type="password" name="pin2" [(ngModel)]="model.pin2" required minlength="4" maxlength="4" pattern="[0-9]*" inputmode="numeric" 
                       class="w-full rounded-xl border-slate-200 bg-slate-50/50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all tracking-[0.4em] text-center font-mono text-lg" 
                       placeholder="••••" />
              </div>
            </div>

            <button type="submit" [disabled]="loading || !model.full_name || !model.health_id || !model.facility_id || model.pin.length !== 4" 
                    class="btn-primary w-full py-4 mt-4 text-lg rounded-xl shadow-lg shadow-primary-500/25">
              {{ loading ? 'Generating Wallet & Registering…' : 'Complete Registration' }}
            </button>
          </form>

          <p class="mt-8 text-center text-slate-500 font-medium">
            Already registered? 
            <a routerLink="/login" class="font-bold text-primary-600 hover:text-primary-700 transition-colors ml-1">Log in here</a>
          </p>
        </div>
      </div>

      <!-- RIGHT: Hero Side -->
      <div class="hidden lg:flex lg:w-1/2 relative bg-slate-900 overflow-hidden items-center justify-center p-12">
        <!-- Abstract glowing orbs background -->
        <div class="absolute inset-0 opacity-40">
           <div class="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-accent-500 mix-blend-screen filter blur-[120px] animate-pulse" style="animation-duration: 9s"></div>
           <div class="absolute bottom-[-10%] left-[-10%] w-[70%] h-[70%] rounded-full bg-primary-600 mix-blend-screen filter blur-[140px] animate-pulse" style="animation-delay: 3s; animation-duration: 11s"></div>
        </div>
        
        <!-- Glassmorphism overlay card -->
        <div class="relative z-10 max-w-lg w-full text-center px-10 py-16 rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl">
          <div class="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-md mb-8 border border-white/20 shadow-inner">
            <svg class="w-4 h-4 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
            Zero-knowledge custodial wallets
          </div>
          <h2 class="text-4xl font-bold text-white mb-6 leading-[1.15] tracking-tight">Your health data.<br/>Under your control.</h2>
          <p class="text-lg text-slate-300 font-light leading-relaxed">No MetaMask required. We automatically encrypt and manage your on-chain identity while you log in seamlessly with just an ID and PIN.</p>
        </div>
      </div>
    </div>
  `,
})
export class RegisterComponent implements OnInit {
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
      this.error = e?.error?.error || e?.message || 'Could not load hospitals.';
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
