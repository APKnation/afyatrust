import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { WalletConnectComponent } from '../wallet-connect/wallet-connect';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive, NgIf, WalletConnectComponent],
  template: `
    <nav class="flex items-center justify-between bg-blue-800 px-6 py-3.5 text-white shadow-md">
      <a
        class="flex items-center gap-2.5 text-[22px] font-bold no-underline"
        routerLink="/"
        routerLinkActive="bg-white/20"
        [routerLinkActiveOptions]="{ exact: true }"
      >
        🏥 <strong>AfyaTrust</strong>
      </a>

      <div class="hidden items-center gap-4 sm:flex">
        <a
          routerLink="/"
          routerLinkActive="bg-white/20"
          [routerLinkActiveOptions]="{ exact: true }"
          class="rounded-lg px-4 py-2 text-[15px] no-underline transition-colors hover:bg-white/20"
        >Home</a>

        <a
          *ngIf="auth.isAuthenticated()"
          routerLink="/patient"
          routerLinkActive="bg-white/20"
          class="rounded-lg px-4 py-2 text-[15px] no-underline transition-colors hover:bg-white/20"
        >My Records</a>
        <a
          routerLink="/doctor"
          routerLinkActive="bg-white/20"
          class="rounded-lg px-4 py-2 text-[15px] no-underline transition-colors hover:bg-white/20"
        >Doctor</a>
      </div>

      <app-wallet-connect />
    </nav>
  `,
})
export class NavbarComponent {
  constructor(public auth: AuthService) {}
}
