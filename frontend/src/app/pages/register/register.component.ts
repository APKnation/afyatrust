import { Component } from '@angular/core';
import { NgIf, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { Web3Service } from '../../services/web3.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  imports: [NgIf, SlicePipe, FormsModule, RouterLink],
  template: `
    <div class="flex min-h-full items-center justify-center p-6">
      <div class="w-full max-w-[440px] rounded-2xl border border-gray-200 bg-slate-50 p-8">
        <h1 class="mb-2 text-2xl font-bold">Register</h1>
        <p class="mb-6 text-gray-600">Create your AfyaTrust account to manage health records.</p>

        <!-- Role switch -->
        <div class="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-gray-200 p-1">
          <button
            type="button"
            (click)="accountType = 'PATIENT'"
            class="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            [class]="accountType === 'PATIENT' ? 'bg-white text-blue-800 shadow' : 'text-gray-600'"
          >
            🧑‍🦰 Patient
          </button>
          <button
            type="button"
            (click)="accountType = 'DOCTOR'"
            class="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            [class]="accountType === 'DOCTOR' ? 'bg-white text-blue-800 shadow' : 'text-gray-600'"
          >
            👨‍⚕️ Doctor
          </button>
        </div>

        <div *ngIf="error" class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {{ error }}
        </div>
        <div *ngIf="success" class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {{ success }}
        </div>

        <form (ngSubmit)="register()" #form="ngForm" class="flex flex-col gap-4.5">
          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-gray-700">Full Name</span>
            <input
              type="text"
              name="full_name"
              [(ngModel)]="model.full_name"
              required
              class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-blue-800"
            />
          </label>

          <!-- Patient-only fields -->
          <ng-container *ngIf="accountType === 'PATIENT'">
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-gray-700">Health ID</span>
              <input
                type="text"
                name="health_id"
                [(ngModel)]="model.health_id"
                required
                class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-blue-800"
              />
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-gray-700">Phone (optional)</span>
              <input
                type="text"
                name="phone"
                [(ngModel)]="model.phone"
                class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-blue-800"
              />
            </label>
          </ng-container>

          <!-- Doctor-only fields -->
          <label *ngIf="accountType === 'DOCTOR'" class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-gray-700">Facility ID (optional)</span>
            <input
              type="text"
              name="facility_id"
              [(ngModel)]="model.facility_id"
              class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-blue-800"
            />
          </label>

          <!-- Wallet -->
          <div class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-gray-700">Wallet</span>
            <button
              type="button"
              (click)="connectWallet()"
              [disabled]="connecting"
              class="w-full rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 px-3 py-3 text-[15px] font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
            >
              <span *ngIf="!model.wallet_address">
                {{ connecting ? 'Connecting…' : '🦊 Connect MetaMask' }}
              </span>
              <span *ngIf="model.wallet_address" class="font-mono">
                {{ model.wallet_address | slice:0:6 }}...{{ model.wallet_address | slice:-4 }}
              </span>
            </button>
          </div>

          <div class="mt-2">
            <button
              type="submit"
              [disabled]="loading || !model.wallet_address"
              class="w-full rounded-lg bg-blue-800 px-3.5 py-3.5 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {{ loading ? 'Registering…' : 'Register' }}
            </button>
          </div>
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
  accountType: 'PATIENT' | 'DOCTOR' = 'PATIENT';
  connecting = false;
  loading = false;
  error = '';
  success = '';

  model = {
    full_name: '',
    health_id: '',
    phone: '',
    facility_id: '',
    wallet_address: '',
  };

  constructor(
    private api: ApiService,
    private web3: Web3Service,
    private auth: AuthService,
    private router: Router
  ) {}

  async connectWallet() {
    this.error = '';
    this.connecting = true;
    try {
      this.model.wallet_address = await this.web3.connect();
    } catch (e: any) {
      this.error = e?.message || 'Could not connect wallet';
    } finally {
      this.connecting = false;
    }
  }

  async register() {
    this.error = '';
    this.success = '';
    this.loading = true;
    try {
      if (this.accountType === 'PATIENT') {
        await this.api.registerPatient({
          health_id: this.model.health_id,
          wallet_address: this.model.wallet_address,
          full_name: this.model.full_name,
          phone: this.model.phone || undefined,
        });
      } else {
        await this.api.registerDoctor({
          wallet_address: this.model.wallet_address,
          full_name: this.model.full_name,
          facility_id: this.model.facility_id || undefined,
        });
      }

      // Log the user straight in after registration.
      this.auth.setAuthenticated(this.model.wallet_address, this.accountType, '');
      this.success = 'Registration successful! Redirecting…';
      this.router.navigate([this.accountType === 'DOCTOR' ? '/doctor' : '/patient']);
    } catch (e: any) {
      this.error = e?.error?.error || e?.error?.message || e?.message || 'Registration failed';
    } finally {
      this.loading = false;
    }
  }
}
