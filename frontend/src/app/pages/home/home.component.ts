import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIf } from '@angular/common';
import { AuthService } from '../../services/auth.service';

/**
 * Public landing page — role aware.
 * Patients see "Open my records", verified doctors are pointed to their
 * workspace, visitors get the standard register/sign-in CTAs.
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink, NgIf],
  template: `
    <!-- ================= NAVBAR ================= -->
    <nav aria-label="Main navigation" class="relative z-50 border-b border-slate-200 bg-white">
      <div class="flex items-center justify-between px-6 py-4">
        <div class="flex items-center gap-2">
          <a routerLink="/" class="brand-wordmark text-2xl text-ink no-underline">Afya<span class="text-primary-700">Trust</span></a>
        </div>
        <div class="hidden md:flex items-center gap-8">
          <a routerLink="/" class="text-slate-600 hover:text-ink font-medium transition-colors relative after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-full after:bg-primary-500 after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-300">Home</a>
          <a href="/#how-it-works" class="text-slate-600 hover:text-ink font-medium transition-colors relative after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-full after:bg-primary-500 after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-300">How it works</a>
        </div>
        <div class="hidden md:flex items-center gap-3">
          <ng-container *ngIf="!auth.isAuthenticated()">
            <a routerLink="/login" class="px-4 py-2 text-slate-700 font-medium hover:text-ink transition-colors">Log in</a>
            <a routerLink="/register" class="px-4 py-2 bg-primary-500 text-ink text-sm font-medium rounded-md hover:bg-primary-600 transition-colors">Get Started</a>
          </ng-container>
          <ng-container *ngIf="auth.isAuthenticated()">
            <a *ngIf="auth.isPatient" routerLink="/patient" class="px-4 py-2 bg-primary-500 text-ink text-sm font-medium rounded-md hover:bg-primary-600 transition-colors">Dashboard</a>
            <a *ngIf="auth.isDoctor" routerLink="/doctor" class="px-4 py-2 bg-primary-500 text-ink text-sm font-medium rounded-md hover:bg-primary-600 transition-colors">Dashboard</a>
            <a *ngIf="auth.isStaff" routerLink="/hospital" class="px-4 py-2 bg-primary-500 text-ink text-sm font-medium rounded-md hover:bg-primary-600 transition-colors">Dashboard</a>
          </ng-container>
        </div>
        <!-- Mobile menu button -->
        <button (click)="menuOpen = !menuOpen"
                class="md:hidden flex flex-col items-center justify-center gap-1.5 p-2 text-ink"
                aria-label="Toggle menu"
                aria-controls="home-mobile-menu"
                [attr.aria-expanded]="menuOpen">
          <span class="h-0.5 w-6 bg-ink transition-transform" [class.rotate-45]="menuOpen" [class.translate-y-1.5]="menuOpen"></span>
          <span class="h-0.5 w-6 bg-ink transition-opacity" [class.opacity-0]="menuOpen"></span>
          <span class="h-0.5 w-6 bg-ink transition-transform" [class.-rotate-45]="menuOpen" [class.-translate-y-1.5]="menuOpen"></span>
        </button>
      </div>
      <!-- Mobile menu -->
      <div *ngIf="menuOpen" id="home-mobile-menu" class="md:hidden border-t border-slate-200 bg-white">
        <div class="flex flex-col px-6 py-4 gap-4">
          <a routerLink="/" (click)="menuOpen = false" class="text-slate-700 hover:text-ink font-medium">Home</a>
          <a href="/#how-it-works" (click)="menuOpen = false" class="text-slate-700 hover:text-ink font-medium">How it works</a>
          <ng-container *ngIf="!auth.isAuthenticated()">
            <a routerLink="/login" (click)="menuOpen = false" class="text-slate-700 hover:text-ink font-medium">Log in</a>
            <a routerLink="/register" (click)="menuOpen = false" class="px-4 py-2 bg-primary-500 text-ink text-sm font-medium rounded-md text-center hover:bg-primary-600">Get Started</a>
          </ng-container>
          <ng-container *ngIf="auth.isAuthenticated()">
            <a *ngIf="auth.isPatient" routerLink="/patient" (click)="menuOpen = false" class="px-4 py-2 bg-primary-500 text-ink text-sm font-medium rounded-md text-center hover:bg-primary-600">Dashboard</a>
            <a *ngIf="auth.isDoctor" routerLink="/doctor" (click)="menuOpen = false" class="px-4 py-2 bg-primary-500 text-ink text-sm font-medium rounded-md text-center hover:bg-primary-600">Dashboard</a>
            <a *ngIf="auth.isStaff" routerLink="/hospital" (click)="menuOpen = false" class="px-4 py-2 bg-primary-500 text-ink text-sm font-medium rounded-md text-center hover:bg-primary-600">Dashboard</a>
          </ng-container>
        </div>
      </div>
    </nav>

    <!-- ================= HERO ================= -->
    <section class="relative isolate overflow-hidden bg-slate-900">
      <picture aria-hidden="true">
        <source media="(max-width: 767px)" srcset="matibabu-mobile.jpg" />
        <img
          src="matibabu-hero.jpg"
          alt=""
          class="absolute inset-0 -z-10 h-full w-full object-cover object-center"
          fetchpriority="high"
        />
      </picture>
      <div aria-hidden="true" class="absolute inset-0 -z-10 bg-slate-950/65"></div>
      <div class="mx-auto flex min-h-[68svh] max-w-7xl flex-col justify-center px-4 py-16 text-white sm:px-6 sm:py-20 lg:py-24">
        <span class="mb-5 inline-flex w-fit items-center gap-2 rounded-full bg-primary-500 px-3 py-1 text-xs font-medium tracking-wide text-ink">
          Your health. Your choice.
        </span>
        <h1 class="max-w-4xl text-[clamp(36px,8vw,64px)] leading-[1.1] font-medium tracking-[-0.03em] text-balance">
          Your health records.<br />
          <span class="text-primary-300">Your consent.</span> Your say.
        </h1>

        <!-- Role-aware subline -->
        <p *ngIf="auth.isPatient" class="mt-5 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">
          Welcome back, <strong>{{ auth.fullName }}</strong>. Your records and
          permissions are one tap away.
        </p>
        <p *ngIf="auth.isDoctor" class="mt-5 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">
          Welcome back, <strong>Dr. {{ auth.fullName }}</strong>. Your patients and
          measurements are one tap away.
        </p>
        <p *ngIf="!auth.isAuthenticated()" class="mt-5 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">
          Your care team keeps your records at the facility. You decide when a
          doctor can view them, and can check who has accessed them.
        </p>

        <!-- Role-aware CTAs -->
        <div class="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <ng-container *ngIf="auth.isPatient; else notPatient">
            <a routerLink="/patient"
               class="rounded-md bg-primary-500 px-4 py-2 text-center text-sm font-medium text-ink no-underline transition-colors hover:bg-primary-600">
              Open my records
            </a>
          </ng-container>
          <ng-template #notPatient>
            <ng-container *ngIf="auth.isDoctor; else visitorCtas">
              <a routerLink="/doctor"
                 class="rounded-md bg-primary-500 px-4 py-2 text-center text-sm font-medium text-ink no-underline transition-colors hover:bg-primary-600">
                Open doctor dashboard
              </a>
            </ng-container>
            <ng-template #visitorCtas>
              <a routerLink="/register"
                 class="rounded-md bg-primary-500 px-4 py-2 text-center text-sm font-medium text-ink no-underline transition-colors hover:bg-primary-600">
                Get Started
              </a>
              <a routerLink="/login"
                 class="rounded-md border border-white/80 bg-black/20 px-4 py-2 text-center text-sm font-medium text-white no-underline transition-colors hover:bg-white/10">
                Sign in
              </a>
            </ng-template>
          </ng-template>
        </div>

        <!-- Trust strip -->
        <div class="mt-12 grid max-w-2xl grid-cols-1 gap-3 text-left sm:grid-cols-3 sm:gap-4">
          <div class="rounded-lg border border-white/30 bg-black/25 px-4 py-3 backdrop-blur-sm">
            <div class="text-sm leading-snug text-white">See who viewed your records</div>
          </div>
          <div class="rounded-lg border border-white/30 bg-black/25 px-4 py-3 backdrop-blur-sm">
            <div class="text-sm leading-snug text-white">Choose who gets access</div>
          </div>
          <div class="rounded-lg border border-white/30 bg-black/25 px-4 py-3 backdrop-blur-sm">
            <div class="text-sm leading-snug text-white">Access ends automatically</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= HOW IT WORKS ================= -->
    <section id="how-it-works" class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
      <h2 class="text-center text-[28px] font-bold sm:text-4xl">How it works</h2>
      <p class="mx-auto mt-3 max-w-2xl text-center text-muted">
        Your records stay with your care facility. Doctors request access when
        they need it; you choose whether to approve, and can change your mind.
      </p>
      <div class="mt-10 grid gap-6 md:grid-cols-3">
        <div class="rounded-xl bg-surface p-6 shadow-card sm:p-8">
          <div class="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-500 text-lg font-bold text-ink">1</div>
          <h3 class="mt-4 text-xl font-bold">Set up your account</h3>
          <p class="mt-2 text-muted">
            Your facility gives you a Health ID. Create a PIN to sign in and
            manage requests to view your records.
          </p>
        </div>
        <div class="rounded-xl bg-surface p-6 shadow-card sm:p-8">
          <div class="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-500 text-lg font-bold text-ink">2</div>
          <h3 class="mt-4 text-xl font-bold">Choose who can view</h3>
          <p class="mt-2 text-muted">
            Verified doctors request access for your care. Review each request
            and approve or decline it. Approved access ends after 7 days, and
            you can end it sooner.
          </p>
        </div>
        <div class="rounded-xl bg-surface p-6 shadow-card sm:p-8">
          <div class="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-500 text-lg font-bold text-ink">3</div>
          <h3 class="mt-4 text-xl font-bold">Know when records are viewed</h3>
          <p class="mt-2 text-muted">
            Check your access history to see when your records were viewed and
            by whom. Emergency access follows facility rules and is shown in
            the history too.
          </p>
        </div>
      </div>
      <div class="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-6 shadow-card sm:p-8">
        <h3 class="text-center text-xl font-bold mb-4">What stays in your control</h3>
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div class="text-center">
            <h4 class="font-semibold text-sm">Your decision</h4>
            <p class="text-xs text-muted mt-1">Choose whether to approve a doctor's request</p>
          </div>
          <div class="text-center">
            <h4 class="font-semibold text-sm">Verified care teams</h4>
            <p class="text-xs text-muted mt-1">Facilities review clinicians before they can request access</p>
          </div>
          <div class="text-center">
            <h4 class="font-semibold text-sm">Limited access</h4>
            <p class="text-xs text-muted mt-1">Approved access expires after 7 days</p>
          </div>
          <div class="text-center">
            <h4 class="font-semibold text-sm">A clear history</h4>
            <p class="text-xs text-muted mt-1">See when and by whom your records were viewed</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= FEATURES ================= -->
    <section class="bg-primary-50">
      <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div class="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 class="text-[28px] font-bold sm:text-4xl">Built for patients,<br class="hidden sm:block" /> trusted by clinicians</h2>
            <p class="mt-4 text-muted">
              Your medical records stay with the facility that cares for you.
              Doctors request access when needed, and the facility checks who
              they are before you decide whether to approve.
            </p>
            <ul class="mt-6 flex flex-col gap-3">
              <li class="flex items-start gap-3">
                <span class="btn-primary">&#10003;</span>
                <span><strong>You choose</strong> — approve or decline a doctor's request</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="btn-primary">&#10003;</span>
                <span><strong>Clinicians are checked</strong> — facilities verify doctors before access requests</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="btn-primary">&#10003;</span>
                <span><strong>Access history</strong> — see who viewed your records and when</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="btn-primary">&#10003;</span>
                <span><strong>Simple sign-in</strong> — use your Health ID and PIN</span>
              </li>
            </ul>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="rounded-xl bg-surface p-5 shadow-card sm:p-6">
              <h3 class="font-bold">Private by design</h3>
              <p class="mt-1 text-sm text-muted">Your records remain with your care facility.</p>
            </div>
            <div class="rounded-xl bg-surface p-5 shadow-card sm:p-6">
              <h3 class="font-bold">Clear access history</h3>
              <p class="mt-1 text-sm text-muted">Check when your records were viewed and by whom.</p>
            </div>
            <div class="rounded-xl bg-surface p-5 shadow-card sm:p-6">
              <h3 class="font-bold">Facility-first privacy</h3>
              <p class="mt-1 text-sm text-muted">Your medical information stays with the facility that holds it.</p>
            </div>
            <div class="rounded-xl bg-surface p-5 shadow-card sm:p-6">
              <h3 class="font-bold">Accountable emergencies</h3>
              <p class="mt-1 text-sm text-muted">Emergency access is handled under facility rules and appears in your history.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= IMAGE + DESCRIPTION ================= -->
    <section class="bg-surface">
      <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div class="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
          <!-- Image (left) -->
          <div class="overflow-hidden rounded-xl shadow-card">
            <img
              src="picha1.jpg"
              alt="Community members gather for a local health outreach event"
              class="h-64 w-full object-cover sm:h-80 lg:h-[420px]"
              loading="lazy"
              decoding="async"
            />
          </div>

          <!-- Description (right) -->
          <div>
            <span class="eyebrow">Why AfyaTrust</span>
            <h2 class="mt-4 text-[28px] font-bold sm:text-4xl">
              One record, every facility — without giving up control
            </h2>
            <p class="mt-4 text-muted">
              Paper records can be hard to find when you visit another facility.
              AfyaTrust helps your care team find the records held by your
              facility, while you stay informed about who views them.
            </p>
            <ul class="mt-6 flex flex-col gap-3">
              <li class="flex items-start gap-3">
                <span class="btn-primary">&#10003;</span>
                <span><strong>Find your record</strong> — use your Health ID to access your account</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="btn-primary">&#10003;</span>
                <span><strong>Manage access</strong> — review approvals, expiry dates, and end access early</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="btn-primary">&#10003;</span>
                <span><strong>Made for local care</strong> — facilities can update records when a connection is available</span>
              </li>
            </ul>
            <a routerLink="/register"
               class="btn-primary mt-8 inline-block no-underline">
              Create your record
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= FOR CARE TEAMS (text left / image right) ================= -->
    <section class="bg-primary-50">
      <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div class="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
          <!-- Description (left) -->
          <div>
            <span class="eyebrow">For doctors &amp; facilities</span>
            <h2 class="mt-4 text-[28px] font-bold sm:text-4xl">
              Faster decisions, zero paperwork
            </h2>
            <p class="mt-4 text-muted">
              Doctors can view records only after their request is approved.
              Patients can review access history, and care teams can coordinate
              with the patient's facility.
            </p>
            <div class="mt-6 grid gap-4 sm:grid-cols-2">
              <div class="rounded-xl bg-surface p-5 shadow-card sm:p-6">
                <h3 class="font-bold">Checked clinicians</h3>
                <p class="mt-1 text-sm text-muted">Facilities verify doctors before they can request access.</p>
              </div>
              <div class="rounded-xl bg-surface p-5 shadow-card sm:p-6">
                <h3 class="font-bold">Time-limited access</h3>
                <p class="mt-1 text-sm text-muted">Permissions lapse after 7 days unless renewed.</p>
              </div>
              <div class="rounded-xl bg-surface p-5 shadow-card sm:p-6">
                <h3 class="font-bold">Visible activity</h3>
                <p class="mt-1 text-sm text-muted">Patients can see who viewed their records and when.</p>
              </div>
              <div class="rounded-xl bg-surface p-5 shadow-card sm:p-6">
                <h3 class="font-bold">Accountable care</h3>
                <p class="mt-1 text-sm text-muted">Access history helps facilities answer questions about record views.</p>
              </div>
            </div>
          </div>

          <!-- Image (right) -->
          <div class="overflow-hidden rounded-xl shadow-card">
            <img
              src="hospital.jpg"
              alt="Health facility opening ceremony with staff and community representatives"
              class="h-64 w-full object-cover sm:h-80 lg:h-[420px]"
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- ================= TRUST & PRIVACY ================= -->
    <section class="border-y border-slate-200 bg-white">
      <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 class="text-[28px] font-medium text-ink sm:text-4xl">Trust you can understand</h2>
        <p class="mt-3 max-w-2xl text-slate-600">
          Know where your records stay, who can request access, and how long
          approved access lasts.
        </p>
        <div class="mt-10 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          <div class="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <div class="text-xl font-medium text-ink sm:text-2xl">At your facility</div>
            <div class="mt-1 text-sm leading-snug text-slate-600">Your medical records stay with the facility that holds them.</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <div class="text-xl font-medium text-ink sm:text-2xl">You decide</div>
            <div class="mt-1 text-sm leading-snug text-slate-600">Review a doctor's request before choosing to approve it.</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <div class="text-xl font-medium text-ink sm:text-2xl">Up to 7 days</div>
            <div class="mt-1 text-sm leading-snug text-slate-600">Approved access ends automatically, or sooner if you revoke it.</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <div class="text-xl font-medium text-ink sm:text-2xl">Easy to review</div>
            <div class="mt-1 text-sm leading-snug text-slate-600">Check who viewed your records and when.</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= CTA BAND ================= -->
    <section class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
      <div class="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-ink shadow-card sm:px-12">
        <h2 class="text-[28px] font-medium sm:text-4xl">Own your health history today</h2>
        <p class="mx-auto mt-3 max-w-xl text-slate-600">
          Create an account with your Health ID, then manage record access in one place.
        </p>
        <div class="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a *ngIf="!auth.isPatient" routerLink="/register"
             class="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-ink no-underline transition-colors hover:bg-primary-600">
            Get Started
          </a>
          <a *ngIf="auth.isPatient" routerLink="/patient"
             class="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-ink no-underline transition-colors hover:bg-primary-600">
            Open my records
          </a>
          <a routerLink="/login"
             class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-ink no-underline transition-colors hover:bg-slate-50">
            Sign in
          </a>
        </div>
      </div>
    </section>

    <!-- ================= FOOTER ================= -->
    <footer class="border-t border-gray-200">
      <div class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
        <div class="flex items-center gap-2">
          <strong class="brand-wordmark text-ink">AfyaTrust</strong>
        </div>
        <p class="m-0 text-center">UDOM · Built by Atanasi Patrick Kafuka</p>
        <div class="flex gap-5">
          <a *ngIf="!auth.isAuthenticated()" routerLink="/login" class="text-accent-700 no-underline hover:underline">Sign in</a>
        </div>
      </div>
    </footer>
  `,
})
export class HomeComponent {
  menuOpen = false;
  constructor(public auth: AuthService) {}
}
