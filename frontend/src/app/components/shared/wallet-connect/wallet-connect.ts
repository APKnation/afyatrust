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
           class="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white no-underline transition-colors hover:bg-amber-600">
          Sign in
        </a>
        <a routerLink="/register"
           class="rounded-lg bg-white/20 px-4 py-2 text-sm font-bold text-white no-underline transition-colors hover:bg-white/30">
          Register
        </a>
      </ng-container>

      <ng-template #session>
        <div class="flex items-center gap-2.5 rounded-lg bg-gray-100 px-4 py-2">
          <span class="text-sm font-bold text-blue-800">🏥 {{ auth.healthId }}</span>
          <button (click)="signOut()"
                  class="cursor-pointer rounded border-none bg-red-500 px-2.5 py-1.5 text-white transition-colors hover:bg-red-600">
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
