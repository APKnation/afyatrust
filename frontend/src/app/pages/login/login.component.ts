import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Web3Service, LoginResult } from '../../services/web3.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [NgIf, RouterLink],
  template: `
    <div class="flex min-h-full items-center justify-center p-6">
      <div class="w-full max-w-[440px] rounded-2xl border border-gray-200 bg-slate-50 p-8">
        <h1 class="mb-2 text-2xl font-bold">Sign in</h1>
        <p class="mb-6 text-gray-600">
          Sign in with your wallet to access your AfyaTrust account.
        </p>

        <div *ngIf="error" class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {{ error }}
        </div>

        <div *ngIf="info" class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {{ info }}
          <div class="mt-2">
            <a routerLink="/register" class="font-semibold text-amber-900 underline">Go to registration →</a>
          </div>
        </div>

        <button
          (click)="login()"
          [disabled]="loading"
          class="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-3.5 text-base font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          <span *ngIf="!loading">🦊 Sign in with MetaMask</span>
          <span *ngIf="loading">Waiting for signature…</span>
        </button>

        <p class="mt-4 text-center text-xs text-gray-500">
          Signing proves you own your wallet. It is not a transaction and costs no gas.
        </p>

        <p class="mt-6 text-center text-sm text-gray-600">
          No account yet?
          <a routerLink="/register" class="font-semibold text-blue-800 hover:underline">Register here</a>
        </p>
      </div>
    </div>
  `,
})
export class LoginComponent {
  loading = false;
  error = '';
  info = '';

  constructor(
    private web3: Web3Service,
    private auth: AuthService,
    private router: Router
  ) {}

  async login() {
    this.error = '';
    this.info = '';
    this.loading = true;
    try {
      const result: LoginResult = await this.web3.login();

      if (result.registered) {
        // Route by the role reported by the backend.
        this.router.navigate([result.role === 'DOCTOR' ? '/doctor' : '/patient']);
      } else {
        this.info = 'This wallet is not registered yet.';
      }
    } catch (e: any) {
      if (e?.code === 'ACTION_REJECTED') {
        this.error = 'Signature request was rejected.';
      } else {
        this.error = e?.error?.error || e?.error?.message || e?.message || 'Sign-in failed';
      }
    } finally {
      this.loading = false;
    }
  }
}
