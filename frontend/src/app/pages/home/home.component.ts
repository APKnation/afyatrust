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
    <nav class="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-md bg-black/20 border-b border-white/10">
      <div class="flex items-center gap-2">
        <span class="text-2xl font-bold text-white tracking-tight">Afya<span class="text-primary-400">Trust</span></span>
      </div>
      <div class="hidden md:flex items-center gap-8">
        <a routerLink="/" class="text-white/80 hover:text-white font-medium transition-colors relative after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-full after:bg-primary-400 after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-300">Home</a>
        <a href="/#how-it-works" class="text-white/80 hover:text-white font-medium transition-colors relative after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-full after:bg-primary-400 after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-300">How it works</a>
      </div>
      <div class="flex items-center gap-3">
        <ng-container *ngIf="!auth.isAuthenticated()">
          <a routerLink="/login" class="px-4 py-2 text-white font-medium hover:text-primary-300 transition-colors hidden sm:block">Log in</a>
          <a routerLink="/register" class="px-5 py-2.5 bg-primary-500 text-white text-sm font-semibold rounded-xl hover:bg-primary-600 transition-colors shadow-sm">Get Started</a>
        </ng-container>
        <ng-container *ngIf="auth.isAuthenticated()">
          <a *ngIf="auth.isPatient" routerLink="/patient" class="px-5 py-2.5 bg-primary-500 text-white text-sm font-semibold rounded-xl hover:bg-primary-600 transition-colors shadow-sm">Dashboard</a>
          <a *ngIf="auth.isDoctor" routerLink="/doctor" class="px-5 py-2.5 bg-primary-500 text-white text-sm font-semibold rounded-xl hover:bg-primary-600 transition-colors shadow-sm">Dashboard</a>
          <a *ngIf="auth.isStaff" routerLink="/hospital" class="px-5 py-2.5 bg-primary-500 text-white text-sm font-semibold rounded-xl hover:bg-primary-600 transition-colors shadow-sm">Dashboard</a>
        </ng-container>
      </div>
    </nav>

    <!-- ================= HERO ================= -->
    <section class="relative isolate overflow-hidden">
      <picture>
        <source media="(max-width: 767px)" srcset="matibabu-mobile.jpg" />
        <img
          src="matibabu-hero.jpg"
          alt="Health workers attending to a patient"
          class="absolute inset-0 -z-10 h-full w-full object-cover"
          fetchpriority="high"
        />
      </picture>
      <div class="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/55 to-black/35 md:bg-gradient-to-r md:from-black/80 md:via-black/55 md:to-black/10"></div>

      <div class="mx-auto flex min-h-[86svh] max-w-7xl flex-col justify-center px-4 py-16 text-white sm:px-6 md:min-h-[92svh]">
        <span class="mb-4 w-fit rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-bold tracking-widest text-ink uppercase sm:text-sm">
          Secured by blockchain
        </span>
        <h1 class="max-w-3xl text-[36px] leading-[1.15] font-bold text-balance sm:text-5xl lg:text-[64px]">
          Your health records.<br />
          <span class="text-primary-400">Your consent.</span> On-chain.
        </h1>

        <!-- Role-aware subline -->
        <p *ngIf="auth.isPatient" class="mt-5 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">
          Welcome back, <strong>{{ auth.fullName }}</strong> — your records and
          permissions are one tap away.
        </p>
        <p *ngIf="auth.isDoctor" class="mt-5 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">
          Welcome back, <strong>Dr. {{ auth.fullName }}</strong> — your patients and
          measurements are one tap away.
        </p>
        <p *ngIf="!auth.isAuthenticated()" class="mt-5 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">
          AfyaTrust gives patients control of their medical history. Doctors get
          instant, verified access with your permission — and every view is
          permanently logged on Ethereum Sepolia.
        </p>

        <!-- Role-aware CTAs -->
        <div class="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <ng-container *ngIf="auth.isPatient; else notPatient">
            <a routerLink="/patient"
               class="rounded-lg bg-primary-500 px-7 py-3.5 text-center font-semibold text-ink no-underline transition-colors hover:bg-primary-400">
              Open my records
            </a>
          </ng-container>
          <ng-template #notPatient>
            <ng-container *ngIf="auth.isDoctor; else visitorCtas">
              <a routerLink="/doctor"
                 class="rounded-lg bg-primary-500 px-7 py-3.5 text-center font-semibold text-ink no-underline transition-colors hover:bg-primary-400">
                Open doctor dashboard
              </a>
            </ng-container>
            <ng-template #visitorCtas>
              <a routerLink="/register"
                 class="rounded-lg bg-primary-500 px-7 py-3.5 text-center font-semibold text-ink no-underline transition-colors hover:bg-primary-400">
                Get Started
              </a>
              <a routerLink="/login"
                 class="rounded-lg border-2 border-white/80 bg-transparent px-7 py-3.5 text-center font-semibold text-white no-underline transition-colors hover:bg-white/10">
                Sign in
              </a>
            </ng-template>
          </ng-template>
        </div>

        <!-- Trust strip -->
        <div class="mt-10 grid max-w-2xl grid-cols-3 gap-3 text-center sm:mt-12 sm:gap-6">
          <div class="rounded-xl bg-white/10 px-2 py-3 backdrop-blur-sm sm:px-4">
            <div class="text-[11px] leading-snug sm:text-sm">Tamper-proof audit</div>
          </div>
          <div class="rounded-xl bg-white/10 px-2 py-3 backdrop-blur-sm sm:px-4">
            <div class="text-[11px] leading-snug sm:text-sm">Consent with expiry</div>
          </div>
          <div class="rounded-xl bg-white/10 px-2 py-3 backdrop-blur-sm sm:px-4">
            <div class="text-[11px] leading-snug sm:text-sm">Emergency break-glass</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= HOW IT WORKS ================= -->
    <section class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
      <h2 class="text-center text-[28px] font-bold sm:text-4xl">How it works</h2>
      <p class="mx-auto mt-3 max-w-2xl text-center text-muted">
        Three steps, one promise: no record moves without the patient's consent.
      </p>
      <div class="mt-10 grid gap-6 md:grid-cols-3">
        <div class="rounded-xl bg-surface p-6 shadow-card sm:p-8">
          <div class="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-500 text-lg font-bold text-ink">1</div>
          <h3 class="mt-4 text-xl font-bold">Register at a facility</h3>
          <p class="mt-2 text-muted">
            The facility issues your Health ID and creates a secure wallet for you.
            You choose a 4-digit PIN — no MetaMask, no technical setup.
          </p>
        </div>
        <div class="rounded-xl bg-surface p-6 shadow-card sm:p-8">
          <div class="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-500 text-lg font-bold text-ink">2</div>
          <h3 class="mt-4 text-xl font-bold">Doctors request access</h3>
          <p class="mt-2 text-muted">
            Verified doctors ask to see your history. You approve or reject from
            your dashboard, and access expires automatically after 7 days.
          </p>
        </div>
        <div class="rounded-xl bg-surface p-6 shadow-card sm:p-8">
          <div class="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-500 text-lg font-bold text-ink">3</div>
          <h3 class="mt-4 text-xl font-bold">Every view is logged</h3>
          <p class="mt-2 text-muted">
            Who viewed what, when, and from which facility — permanently recorded
            on-chain. In emergencies, break-glass access is still auditable.
          </p>
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
              Clinical data never leaves the facility that holds it. Only record
              fingerprints, permissions, and audit events live on the blockchain —
              privacy by architecture, not just by policy.
            </p>
            <ul class="mt-6 flex flex-col gap-3">
              <li class="flex items-start gap-3">
                <span class="btn-primary">&#10003;</span>
                <span><strong>Self-sovereign consent</strong> — grant or revoke any doctor, any time</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="btn-primary">&#10003;</span>
                <span><strong>Verified doctors only</strong> — license-checked accounts, admin approved</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="btn-primary">&#10003;</span>
                <span><strong>Full audit trail</strong> — your dashboard shows every access event</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="btn-primary">&#10003;</span>
                <span><strong>No wallet needed</strong> — patients sign in with Health ID + PIN</span>
              </li>
            </ul>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="rounded-xl bg-surface p-5 shadow-card sm:p-6">
              <h3 class="font-bold">Encrypted custodial wallets</h3>
              <p class="mt-1 text-sm text-muted">Patient keys encrypted with AES-256-GCM.</p>
            </div>
            <div class="rounded-xl bg-surface p-5 shadow-card sm:p-6">
              <h3 class="font-bold">On-chain verification</h3>
              <p class="mt-1 text-sm text-muted">SHA-256 record hashes verifiable on Etherscan.</p>
            </div>
            <div class="rounded-xl bg-surface p-5 shadow-card sm:p-6">
              <h3 class="font-bold">Facility-first privacy</h3>
              <p class="mt-1 text-sm text-muted">Data stays at the source; only metadata moves.</p>
            </div>
            <div class="rounded-xl bg-surface p-5 shadow-card sm:p-6">
              <h3 class="font-bold">Accountable emergencies</h3>
              <p class="mt-1 text-sm text-muted">Break-glass saves lives and is logged forever.</p>
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
              src="matibabu.jpg"
              alt="A clinician reviewing a patient's digital health record"
              class="h-64 w-full object-cover sm:h-80 lg:h-[420px]"
              loading="lazy"
            />
          </div>

          <!-- Description (right) -->
          <div>
            <span class="eyebrow">Why AfyaTrust</span>
            <h2 class="mt-4 text-[28px] font-bold sm:text-4xl">
              One record, every facility — without giving up control
            </h2>
            <p class="mt-4 text-muted">
              Paper folders and scattered clinic systems mean history is lost when
              it matters most. AfyaTrust keeps a single, verified record you can
              open anywhere while clinicians only see it when you say so.
            </p>
            <ul class="mt-6 flex flex-col gap-3">
              <li class="flex items-start gap-3">
                <span class="btn-primary">&#10003;</span>
                <span><strong>Available in seconds</strong> — no forms, no waiting rooms to update your file</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="btn-primary">&#10003;</span>
                <span><strong>Consent you can see</strong> — active grants, expiry dates, and revoke buttons on your dashboard</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="btn-primary">&#10003;</span>
                <span><strong>Works offline-first</strong> — facilities sync when connectivity returns</span>
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
              Clinicians see the history they were granted — nothing more — and
              patients are notified the moment a record is opened. Facilities get
              a consistent ledger of who accessed what, ready for any audit.
            </p>
            <div class="mt-6 grid gap-4 sm:grid-cols-2">
              <div class="rounded-xl bg-surface p-5 shadow-card sm:p-6">
                <h3 class="font-bold">Verified access requests</h3>
                <p class="mt-1 text-sm text-muted">License-checked doctors, approved by the facility admin.</p>
              </div>
              <div class="rounded-xl bg-surface p-5 shadow-card sm:p-6">
                <h3 class="font-bold">Auto-expiring grants</h3>
                <p class="mt-1 text-sm text-muted">Permissions lapse after 7 days unless renewed.</p>
              </div>
              <div class="rounded-xl bg-surface p-5 shadow-card sm:p-6">
                <h3 class="font-bold">Instant notifications</h3>
                <p class="mt-1 text-sm text-muted">Patients see every view on their dashboard in real time.</p>
              </div>
              <div class="rounded-xl bg-surface p-5 shadow-card sm:p-6">
                <h3 class="font-bold">Audit-ready exports</h3>
                <p class="mt-1 text-sm text-muted">On-chain events verifiable on Etherscan anytime.</p>
              </div>
            </div>
          </div>

          <!-- Image (right) -->
          <div class="overflow-hidden rounded-xl shadow-card">
            <img
              src="matibabu-hero.jpg"
              alt="Health workers attending to a patient at a facility"
              class="h-64 w-full object-cover sm:h-80 lg:h-[420px]"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- ================= UNDER THE HOOD (stats band) ================= -->
    <section class="bg-ink">
      <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 class="text-[28px] font-bold text-white sm:text-4xl">Under the hood</h2>
        <p class="mt-3 max-w-2xl text-white/70">
          The guarantees the platform is built on — measurable, not marketed.
        </p>
        <div class="mt-10 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          <div class="rounded-xl bg-white/10 p-5 backdrop-blur-sm sm:p-6">
            <div class="text-3xl font-bold text-white sm:text-4xl">AES-256</div>
            <div class="mt-1 text-sm leading-snug text-white/70">GCM encryption for patient keys</div>
          </div>
          <div class="rounded-xl bg-white/10 p-5 backdrop-blur-sm sm:p-6">
            <div class="text-3xl font-bold text-white sm:text-4xl">SHA-256</div>
            <div class="mt-1 text-sm leading-snug text-white/70">record fingerprints anchored on-chain</div>
          </div>
          <div class="rounded-xl bg-white/10 p-5 backdrop-blur-sm sm:p-6">
            <div class="text-3xl font-bold text-white sm:text-4xl">7 days</div>
            <div class="mt-1 text-sm leading-snug text-white/70">default consent expiry, revocable anytime</div>
          </div>
          <div class="rounded-xl bg-white/10 p-5 backdrop-blur-sm sm:p-6">
            <div class="text-3xl font-bold text-white sm:text-4xl">100%</div>
            <div class="mt-1 text-sm leading-snug text-white/70">of record views written to the audit log</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= CTA BAND ================= -->
    <section class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
      <div class="rounded-xl bg-ink px-6 py-12 text-center text-white sm:px-12">
        <h2 class="text-[28px] font-bold sm:text-4xl">Own your health history today</h2>
        <p class="mx-auto mt-3 max-w-xl text-white/80">
          Register in under a minute — your wallet and PIN are set up automatically.
        </p>
        <div class="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a *ngIf="!auth.isPatient" routerLink="/register"
             class="rounded-lg bg-primary-500 px-8 py-3.5 font-semibold text-ink no-underline transition-colors hover:bg-primary-400">
            Get Started
          </a>
          <a *ngIf="auth.isPatient" routerLink="/patient"
             class="rounded-lg bg-primary-500 px-8 py-3.5 font-semibold text-ink no-underline transition-colors hover:bg-primary-400">
            Open my records
          </a>
          <a routerLink="/login"
             class="rounded-lg border-2 border-white/70 px-8 py-3.5 font-semibold text-white no-underline transition-colors hover:bg-white/10">
            Sign in
          </a>
        </div>
      </div>
    </section>

    <!-- ================= FOOTER ================= -->
    <footer class="border-t border-gray-200">
      <div class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
        <div class="flex items-center gap-2">
          <strong class="font-heading text-ink">AfyaTrust</strong>
        </div>
        <p class="m-0 text-center">UDOM · PoC by Atanasi Patrick Kafuka · Sepolia testnet</p>
        <div class="flex gap-5">
          <a *ngIf="!auth.isAuthenticated()" routerLink="/login" class="text-accent-700 no-underline hover:underline">Sign in</a>
        </div>
      </div>
    </footer>
  `,
})
export class HomeComponent {
  constructor(public auth: AuthService) {}
}
