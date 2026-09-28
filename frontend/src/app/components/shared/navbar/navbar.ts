import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

/**
 * Role-aware responsive navbar.
 * Active/hover states use an underline accent — no background highlights.
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
        >
          <strong>AfyaTrust</strong>
        </a>

        <!-- Desktop links -->
        <div class="hidden items-center gap-6 md:flex">
          <a routerLink="/"
             routerLinkActive="nav-link-active"
             [routerLinkActiveOptions]="{ exact: true }"
             class="nav-link px-1 py-2 text-[15px] text-ink no-underline">Home</a>
          <a *ngIf="auth.isPatient" routerLink="/patient"
             routerLinkActive="nav-link-active"
             class="nav-link px-1 py-2 text-[15px] text-ink no-underline">My Records</a>
          <a *ngIf="auth.isDoctor" routerLink="/doctor"
             routerLinkActive="nav-link-active"
             class="nav-link px-1 py-2 text-[15px] text-ink no-underline">My Dashboard</a>
          <a *ngIf="auth.isStaff" routerLink="/hospital"
             routerLinkActive="nav-link-active"
             class="nav-link px-1 py-2 text-[15px] text-ink no-underline">Referral Desk</a>

          <!-- Desktop session area -->
          <div class="ml-2 flex items-center gap-2.5">
            <!-- Patient chip -->
            <div *ngIf="auth.isPatient" class="flex items-center gap-2.5 rounded-xl bg-surface px-4 py-2 shadow-card">
              <span class="text-sm font-bold text-ink">{{ auth.healthId }}</span>
              <a routerLink="/account" class="text-sm font-semibold text-accent-700 no-underline hover:underline">Account</a>
              <button (click)="signOut()"
                      class="cursor-pointer rounded-lg bg-ink px-2.5 py-1.5 text-sm text-white transition-opacity hover:opacity-80">Sign out</button>
            </div>

            <!-- Doctor chip -->
            <div *ngIf="auth.isDoctor" class="flex items-center gap-2.5 rounded-xl bg-surface px-4 py-2 shadow-card">
              <span class="text-sm font-bold text-ink">Dr. {{ auth.fullName }}</span>
              <span class="text-xs font-bold text-accent-700">✓ verified</span>
              <a routerLink="/account" class="text-sm font-semibold text-accent-700 no-underline hover:underline">Account</a>
              <button (click)="signOut()"
                      class="cursor-pointer rounded-lg bg-ink px-2.5 py-1.5 text-sm text-white transition-opacity hover:opacity-80">Sign out</button>
            </div>

            <!-- Staff chip -->
            <div *ngIf="auth.isStaff" class="flex items-center gap-2.5 rounded-xl bg-surface px-4 py-2 shadow-card">
              <span class="text-sm font-bold text-ink">{{ auth.fullName }}</span>
              <a routerLink="/account" class="text-sm font-semibold text-accent-700 no-underline hover:underline">Account</a>
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
          <span *ngIf="auth.isPatient" class="text-xs font-bold text-ink">{{ auth.healthId }}</span>
          <span *ngIf="auth.isDoctor" class="text-xs font-bold text-accent-700">✓</span>
          <button (click)="menuOpen = !menuOpen"
                  aria-label="Toggle menu"
                  [attr.aria-expanded]="menuOpen"
                  class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-2xl text-ink transition-opacity hover:opacity-70">
            {{ menuOpen ? '✕' : '☰' }}
          </button>
        </div>
      </div>

      <!-- Mobile menu panel -->
      <div *ngIf="menuOpen" class="border-t border-gray-100 bg-surface px-4 pb-4 pt-2 md:hidden">
        <a routerLink="/" (click)="menuOpen = false"
           routerLinkActive="nav-link-active-mobile"
           [routerLinkActiveOptions]="{ exact: true }"
           class="block px-1 py-3 text-base font-semibold text-ink no-underline">Home</a>
        <a *ngIf="auth.isPatient" routerLink="/patient" (click)="menuOpen = false"
           routerLinkActive="nav-link-active-mobile"
           class="block px-1 py-3 text-base font-semibold text-ink no-underline">My Records</a>
        <a *ngIf="auth.isDoctor" routerLink="/doctor" (click)="menuOpen = false"
           routerLinkActive="nav-link-active-mobile"
           class="block px-1 py-3 text-base font-semibold text-ink no-underline">My Dashboard</a>
        <a *ngIf="auth.isStaff" routerLink="/hospital" (click)="menuOpen = false"
           routerLinkActive="nav-link-active-mobile"
           class="block px-1 py-3 text-base font-semibold text-ink no-underline">Referral Desk</a>

        <a *ngIf="auth.isAuthenticated()" routerLink="/account" (click)="menuOpen = false"
           class="mt-2 block rounded-lg px-4 py-3 text-center font-semibold text-accent-700 no-underline hover:underline">Account settings</a>
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
