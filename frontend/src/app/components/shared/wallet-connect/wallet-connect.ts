import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

/**
 * Navbar session widget.
 * Patients: shows Health ID + sign-out (their wallet is custodial).
 * Visitors: shows Sign in / Register links.
 * (Doctors connect MetaMask inside the doctor page, optionally.)
 */
@Component({
  selector: 'app-wallet-connect',
  imports: [NgIf, RouterLink],
  template: `
    <div class="flex items-center gap-2.5">
      <ng-container *ngIf="!auth.isAuthenticated(); else session">
        <a routerLink="/login"
           class="rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-ink no-underline transition-colors hover:bg-primary-400">
          Sign in
        </a>
        <a routerLink="/register"
           class="rounded-lg bg-accent-500 px-4 py-2 text-sm font-bold text-white no-underline transition-colors hover:bg-accent-600">
          Register
        </a>
      </ng-container>

      <ng-template #session>
        <div class="flex items-center gap-2.5 rounded-xl bg-surface px-4 py-2 shadow-card">
          <span class="text-sm font-bold text-ink">🏥 {{ auth.healthId }}</span>
          <button (click)="signOut()"
                  class="cursor-pointer rounded-lg bg-ink px-2.5 py-1.5 text-sm text-white transition-opacity hover:opacity-80">
            Sign out
          </button>
        </div>
      </ng-template>
    </div>
  `,
})
export class WalletConnectComponent {
  constructor(
    public auth: AuthService,
    private router: Router
  ) {}

  signOut() {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
