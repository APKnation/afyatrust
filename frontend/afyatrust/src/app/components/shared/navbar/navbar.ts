import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-navbar',
  template: `
    <nav class="navbar">
      <div class="logo" routerLink="/">
        🏥 <strong>AfyaTrust</strong>
      </div>

      <div class="nav-links">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}">Nyumbani</a>
        <a *ngIf="role === 'PATIENT'" routerLink="/patient" routerLinkActive="active">Mgonjwa</a>
        <a *ngIf="role === 'DOCTOR'" routerLink="/doctor" routerLinkActive="active">Daktari</a>
        <a routerLink="/register" routerLinkActive="active">Usajili</a>
      </div>

      <app-wallet-connect></app-wallet-connect>
    </nav>
  `,
  styles: [`
    .navbar {
      display: flex; justify-content: space-between; align-items: center;
      background: #1e40af; color: white; padding: 15px 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .logo { font-size: 20px; }
    .nav-links { display: flex; gap: 20px; }
    .nav-links a {
      color: white; text-decoration: none; padding: 8px 15px;
      border-radius: 6px; transition: background 0.2s;
    }
    .nav-links a:hover, .nav-links a.active {
      background: rgba(255,255,255,0.2);
    }
  `]
})
export class NavbarComponent {
  role = '';

  constructor(private auth: AuthService) {
    this.auth.role$.subscribe(r => this.role = r);
    this.role = this.auth.getRole();
  }
}