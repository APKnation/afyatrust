import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="navbar">
      <a class="logo" routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
        🏥 <strong>AfyaTrust</strong>
      </a>

      <div class="nav-links">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Nyumbani</a>
        <a routerLink="/register" routerLinkActive="active">Usajili</a>

        <a *ngIf="role === 'PATIENT'" routerLink="/patient" routerLinkActive="active">Mgonjwa</a>
        <a *ngIf="role === 'DOCTOR'" routerLink="/doctor" routerLinkActive="active">Daktari</a>
      </div>

      <app-wallet-connect />
    </nav>
  `,
  styles: [`
    .navbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #1e40af;
      color: white;
      padding: 14px 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    .logo {
      font-size: 22px;
      font-weight: 700;
      text-decoration: none;
      color: white;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .nav-links {
      display: flex;
      gap: 16px;
    }

    .nav-links a {
      color: white;
      text-decoration: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 15px;
      transition: background 0.2s;
    }

    .nav-links a:hover,
    .nav-links a.active {
      background: rgba(255, 255, 255, 0.18);
    }
  `],
})
export class NavbarComponent {
  role = '';

  constructor() {
    // role is populated by the wallet-connect component once connected
  }
}
