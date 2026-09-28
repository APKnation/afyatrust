import { Component, OnInit } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { NgIf } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { Web3Service } from '../../../services/web3.service';

@Component({
  selector: 'app-wallet-connect',
  imports: [SlicePipe, NgIf, RouterLink],
  template: `
    <div class="flex items-center gap-2.5">
      <!-- Not signed in -->
      <ng-container *ngIf="!auth.wallet">
        <a
          routerLink="/login"
          class="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white no-underline transition-colors hover:bg-amber-600"
        >
          🦊 Sign in
        </a>
      </ng-container>

      <!-- Signed in -->
      <div
        *ngIf="auth.wallet"
        class="flex flex-wrap items-center gap-2.5 rounded-lg bg-gray-100 px-4 py-2"
      >
        <span class="font-mono text-sm font-bold">
          {{ auth.wallet | slice:0:6 }}...{{ auth.wallet | slice:-4 }}
        </span>
        <span
          class="rounded px-2 py-1 text-xs font-semibold text-white"
          [class.bg-emerald-500]="auth.role === 'PATIENT'"
          [class.bg-teal-600]="auth.role === 'DOCTOR'"
          [class.bg-red-500]="auth.role !== 'PATIENT' && auth.role !== 'DOCTOR'"
        >
          {{ auth.role || 'GUEST' }}
        </span>
        <button
          (click)="disconnect()"
          class="cursor-pointer rounded border-none bg-red-500 px-2.5 py-1.5 text-white transition-colors hover:bg-red-600"
        >
          Sign out
        </button>
      </div>
    </div>
  `,
})
export class WalletConnectComponent implements OnInit {
  constructor(
    public auth: AuthService,
    private web3: Web3Service,
    private router: Router
  ) {}

  async ngOnInit() {
    // Nothing to auto-connect: sign-in now requires an explicit signature.
  }

  async connect() {
    try {
      const result = await this.web3.login();
      if (result.registered) {
        this.router.navigate([result.role === 'DOCTOR' ? '/doctor' : '/patient']);
      }
    } catch (e: any) {
      if (e?.code !== 'ACTION_REJECTED') {
        alert('Error: ' + (e?.error?.error || e?.message || 'Sign-in failed'));
      }
    }
  }

  disconnect() {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
