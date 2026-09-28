import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

/**
 * Role-aware responsive navbar.
 * - Patient session: shows Health ID chip + Sign out.
 * - Doctor session: shows doctor chip + Sign out.
 * - Visitor: Sign in / Register / Doctor Portal CTAs.
 * Desktop (≥md) shows inline links; mobile gets a hamburger dropdown.
 */
@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive, NgIf],
  template: `
    <nav class="sticky top-0 z-50 bg-surface shadow-card">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-3.5">
        <!-- Brand -->
        <a
          class="flex shrink-0 items-center gap-2.5 text-xl font-heading text-ink no-underline sm:text-[22px]"
          routerLink="/"
          routerLinkActive="bg-primary-100"
          [routerLinkActiveOptions]="{ exact: true }"
        >
          <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500 text-lg">🏥</span>
          <strong>AfyaTrust</strong>
        </a>

        <!-- Desktop links -->
        <div class="hidden items-center gap-1 md:flex">
          <a routerLink="/"
             routerLinkActive="bg-primary-100"
             [routerLinkActiveOptions]="{ exact: true }"
             class="rounded-lg px-4 py-2 text-[15px] text-ink no-underline transition-colors hover:bg-primary-100">Home</a>
          <a *ngIf="auth.isPatient" routerLink="/patient"
             routerLinkActive="bg-primary-100"
             class="rounded-lg px-4 py-2 text-[15px] text-ink no-underline transition-colors hover:bg-primary-100">My Records</a>
          <a *ngIf="!auth.isDoctor" routerLink="/doctor-auth"
             routerLinkActive="bg-primary-100"
             class="rounded-lg px-4 py-2 text-[15px] text-ink no-underline transition-colors hover:bg-primary-100">Doctor Portal</a>
          <a *ngIf="auth.isDoctor" routerLink="/doctor"
             routerLinkActive="bg-primary-100"
             class="rounded-lg px-4 py-2 text-[15px] text-ink no-underline transition-colors hover:bg-primary-100">My Dashboard</a>
          <a *ngIf="!auth.isStaff" routerLink="/staff-login"
             routerLinkActive="bg-primary-100"
             class="rounded-lg px-4 py-2 text-[15px] text-ink no-underline transition-colors hover:bg-primary-100">Hospital</a>
          <a *ngIf="auth.isStaff" routerLink="/hospital"
             routerLinkActive="bg-primary-100"
             class="rounded-lg px-4 py-2 text-[15px] text-ink no-underline transition-colors hover:bg-primary-100">Referral Desk</a>

          <!-- Desktop session area -->
          <div class="ml-2 flex items-center gap-2.5">
            <!-- Patient chip -->
            <div *ngIf="auth.isPatient" class="flex items-center gap-2.5 rounded-xl bg-surface px-4 py-2 shadow-card">
              <span class="text-sm font-bold text-ink">🏥 {{ auth.healthId }}</span>
              <button (click)="signOut()"
                      class="cursor-pointer rounded-lg bg-ink px-2.5 py-1.5 text-sm text-white transition-opacity hover:opacity-80">Sign out</button>
            </div>

            <!-- Doctor chip -->
            <div *ngIf="auth.isDoctor" class="flex items-center gap-2.5 rounded-xl bg-surface px-4 py-2 shadow-card">
              <span class="text-sm font-bold text-ink">🩺 Dr. {{ auth.fullName }}</span>
              <span class="rounded bg-accent-100 px-2 py-0.5 text-xs font-bold text-accent-800">✓ verified</span>
              <button (click)="signOut()"
                      class="cursor-pointer rounded-lg bg-ink px-2.5 py-1.5 text-sm text-white transition-opacity hover:opacity-80">Sign out</button>
            </div>

            <!-- Staff chip -->
            <div *ngIf="auth.isStaff" class="flex items-center gap-2.5 rounded-xl bg-surface px-4 py-2 shadow-card">
              <span class="text-sm font-bold text-ink">🏥 {{ auth.fullName }}</span>
              <button (click)="signOut()"
                      class="cursor-pointer rounded-lg bg-ink px-2.5 py-1.5 text-sm text-white transition-opacity hover:opacity-80">Sign out</button>
            </div>

            <!-- Visitor CTAs -->
            <ng-container *ngIf="!auth.isAuthenticated()">
              <a routerLink="/login"
                 class="rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-ink no-underline transition-colors hover:bg-primary-400">Sign in</a>
              <a routerLink="/register"
                 class="rounded-lg bg-accent-500 px-4 py-2 text-sm font-bold text-white no-underline transition-colors hover:bg-accent-600">Register</a>
            </ng-container>
          </div>
        </div>

        <!-- Mobile: compact session + hamburger -->
        <div class="flex items-center gap-2 md:hidden">
          <span *ngIf="auth.isPatient" class="rounded-lg bg-primary-100 px-2.5 py-1.5 text-xs font-bold text-ink">🏥 {{ auth.healthId }}</span>
          <span *ngIf="auth.isDoctor" class="rounded-lg bg-accent-100 px-2.5 py-1.5 text-xs font-bold text-accent-800">🩺 ✓</span>
          <span *ngIf="auth.isStaff" class="rounded-lg bg-primary-100 px-2.5 py-1.5 text-xs font-bold text-ink">🏥</span>
          <button (click)="menuOpen = !menuOpen"
                  aria-label="Toggle menu"
                  [attr.aria-expanded]="menuOpen"
                  class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-2xl text-ink transition-colors hover:bg-primary-100">
            {{ menuOpen ? '✕' : '☰' }}
          </button>
        </div>
      </div>

      <!-- Mobile menu panel -->
      <div *ngIf="menuOpen" class="border-t border-gray-100 bg-surface px-4 pb-4 pt-2 md:hidden">
        <a routerLink="/" (click)="menuOpen = false"
           class="block rounded-lg px-4 py-3 text-base font-semibold text-ink no-underline transition-colors hover:bg-primary-100">Home</a>
        <a *ngIf="auth.isPatient" routerLink="/patient" (click)="menuOpen = false"
           class="block rounded-lg px-4 py-3 text-base font-semibold text-ink no-underline transition-colors hover:bg-primary-100">My Records</a>
        <a *ngIf="!auth.isDoctor" routerLink="/doctor-auth" (click)="menuOpen = false"
           class="block rounded-lg px-4 py-3 text-base font-semibold text-ink no-underline transition-colors hover:bg-primary-100">Doctor Portal</a>
        <a *ngIf="auth.isDoctor" routerLink="/doctor" (click)="menuOpen = false"
           class="block rounded-lg px-4 py-3 text-base font-semibold text-ink no-underline transition-colors hover:bg-primary-100">My Dashboard</a>
        <a *ngIf="!auth.isStaff" routerLink="/staff-login" (click)="menuOpen = false"
           class="block rounded-lg px-4 py-3 text-base font-semibold text-ink no-underline transition-colors hover:bg-primary-100">Hospital</a>
        <a *ngIf="auth.isStaff" routerLink="/hospital" (click)="menuOpen = false"
           class="block rounded-lg px-4 py-3 text-base font-semibold text-ink no-underline transition-colors hover:bg-primary-100">Referral Desk</a>

        <button *ngIf="auth.isAuthenticated()" (click)="signOut()"
                class="mt-2 w-full cursor-pointer rounded-lg bg-ink px-4 py-3 font-semibold text-white">Sign out</button>
        <ng-container *ngIf="!auth.isAuthenticated()">
          <a routerLink="/login" (click)="menuOpen = false"
             class="mt-2 block rounded-lg bg-primary-500 px-4 py-3 text-center font-bold text-ink no-underline">Sign in</a>
          <a routerLink="/register" (click)="menuOpen = false"
             class="mt-2 block rounded-lg bg-accent-500 px-4 py-3 text-center font-bold text-white no-underline">Register</a>
        </ng-container>
      </div>
    </nav>
  `,
})
export class NavbarComponent {
  menuOpen = false;

  constructor(
    public auth: AuthService,
    private router: Router
  ) {}

  signOut() {
    this.menuOpen = false;
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
