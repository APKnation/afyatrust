import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

type LoginRole = 'PATIENT' | 'DOCTOR' | 'STAFF';

/**
 * Single sign-in for every role. The user enters their identifier and
 * secret; the backend recognises the credential type and returns the role,
 * and the app routes to the matching workspace. The page reveals nothing
 * about which roles exist.
 */
@Component({
  selector: 'app-login',
  imports: [NgIf, FormsModule, RouterLink],
  template: `
    <nav class="absolute top-0 left-0 right-0 z-50 px-6 py-5 lg:px-12">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <a routerLink="/" class="brand-wordmark text-2xl text-slate-900 no-underline">Afya<span class="text-primary-700">Trust</span></a>
        </div>
        <div class="hidden md:flex items-center gap-4">
          <a routerLink="/" class="text-slate-500 hover:text-slate-900 font-medium transition-colors">Back to Home</a>
          <a routerLink="/register" class="px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors shadow-sm">Get Started</a>
        </div>
        <button (click)="menuOpen = !menuOpen"
                class="md:hidden flex flex-col items-center justify-center gap-1.5 p-2"
                aria-label="Toggle menu">
          <span class="h-0.5 w-6 bg-ink transition-transform" [class.rotate-45]="menuOpen" [class.translate-y-1.5]="menuOpen"></span>
          <span class="h-0.5 w-6 bg-ink transition-opacity" [class.opacity-0]="menuOpen"></span>
          <span class="h-0.5 w-6 bg-ink transition-transform" [class.-rotate-45]="menuOpen" [class.-translate-y-1.5]="menuOpen"></span>
        </button>
      </div>
      <div *ngIf="menuOpen" class="md:hidden mt-4 bg-white border border-gray-200 rounded-xl shadow">
        <div class="flex flex-col p-4 gap-3">
          <a routerLink="/" (click)="menuOpen = false">Back to Home</a>
          <a routerLink="/register" (click)="menuOpen = false" class="px-4 py-2 bg-slate-900 text-white rounded-lg text-center">Get Started</a>
        </div>
      </div>
    </nav>

    <div class="flex min-h-screen bg-white">
      <!-- RIGHT: Form Side on desktop -->
      <div class="w-full lg:order-2 lg:w-1/2 flex flex-col justify-center px-8 sm:px-16 lg:px-24 xl:px-32 relative z-10 pt-24 pb-12 overflow-y-auto">
        <div class="max-w-[420px] w-full mx-auto">
          <div class="mb-10">
            <h1 class="text-3xl font-bold text-slate-900 mb-3 tracking-tight">Sign in</h1>
            <p class="text-slate-500 text-lg">View your records and manage access.</p>
          </div>
          
          <div *ngIf="error" class="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-3 animate-fade-in">
             <span>{{ error }}</span>
          </div>

          <form (ngSubmit)="login()" #form="ngForm" class="flex flex-col gap-5">
            <div class="space-y-1.5">
              <label class="text-sm font-semibold text-slate-700">Health ID or medical license</label>
              <input type="text" name="identity" [(ngModel)]="identity" required autocomplete="username" 
                     class="w-full rounded-xl border-slate-200 bg-slate-50/50 px-4 py-3.5 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all" 
                     placeholder="Enter your Health ID or license" />
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-semibold text-slate-700">4-digit PIN</label>
              <input type="password" name="secret" [(ngModel)]="secret" required autocomplete="current-password" 
                     class="w-full rounded-xl border-slate-200 bg-slate-50/50 px-4 py-3.5 text-base text-slate-900 placeholder-slate-400 focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all"
                     placeholder="Enter your PIN" />
            </div>

            <button type="submit" [disabled]="loading || !identity || !secret" 
                    class="btn-primary w-full py-4 mt-4 text-lg rounded-xl shadow-lg shadow-primary-500/25">
              {{ loading ? 'Signing in…' : 'Sign in securely' }}
            </button>
          </form>

          <p class="mt-8 text-center text-slate-500 font-medium">
            Need an account?
            <a routerLink="/register" class="font-bold text-primary-600 hover:text-primary-700 transition-colors ml-1">Create an account</a>
          </p>
        </div>
      </div>

      <!-- LEFT: Hero Side on desktop -->
      <div class="hidden lg:order-1 lg:flex lg:w-1/2 relative bg-slate-900 overflow-hidden items-center justify-center p-12">
        <!-- Abstract glowing orbs background -->
        <div class="absolute inset-0 opacity-40">
           <div class="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-primary-600 mix-blend-screen filter blur-[120px] animate-pulse" style="animation-duration: 8s"></div>
           <div class="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] rounded-full bg-accent-500 mix-blend-screen filter blur-[140px] animate-pulse" style="animation-delay: 2s; animation-duration: 10s"></div>
        </div>
        
        <article class="relative z-10 max-w-xl w-full">
          <h2 class="max-w-lg text-5xl font-bold leading-[1.05] tracking-tight text-white">Care that keeps you in control.</h2>
          <p class="mt-6 max-w-md text-lg leading-8 text-slate-300">Sign in to see your health record, make access decisions, and review activity in one clear place.</p>

          <ol class="mt-12 border-l border-white/20 pl-7">
            <li class="relative pb-8"><span class="absolute -left-[2.2rem] top-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-xs font-bold text-slate-950">1</span><p class="m-0 text-base font-semibold text-white">Review a request</p><p class="mt-1 text-sm leading-6 text-slate-400">See who needs access and why before making a decision.</p></li>
            <li class="relative pb-8"><span class="absolute -left-[2.2rem] top-0 flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-slate-900 text-xs font-bold text-white">2</span><p class="m-0 text-base font-semibold text-white">Choose with confidence</p><p class="mt-1 text-sm leading-6 text-slate-400">Approve, decline, or end access whenever you need to.</p></li>
            <li class="relative"><span class="absolute -left-[2.2rem] top-0 flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-slate-900 text-xs font-bold text-white">3</span><p class="m-0 text-base font-semibold text-white">Keep a clear record</p><p class="mt-1 text-sm leading-6 text-slate-400">Review access and care activity whenever you return.</p></li>
          </ol>
        </article>
      </div>
    </div>
  `,
})
export class LoginComponent {
  menuOpen = false;
  identity = '';
  secret = '';
  loading = false;
  error = '';

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private router: Router
  ) {}

  async login() {
    this.error = '';
    this.loading = true;
    try {
      const res = await this.api.unifiedLogin(this.identity.trim(), this.secret);
      this.auth.setUnifiedSession(res);
      this.router.navigate(this.routeFor(res.role as LoginRole));
    } catch (e: any) {
      this.error = e?.error?.error || e?.message || 'Invalid credentials';
    } finally {
      this.loading = false;
    }
  }

  private routeFor(role: LoginRole): string[] {
    switch (role) {
      case 'DOCTOR': return ['/doctor'];
      case 'STAFF':  return ['/hospital'];
      default:       return ['/patient'];
    }
  }
}
