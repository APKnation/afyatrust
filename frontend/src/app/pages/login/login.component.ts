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
    <nav class="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-5 lg:px-12">
      <div class="flex items-center gap-2">
        <a routerLink="/" class="text-2xl font-bold text-slate-900 tracking-tight cursor-pointer">Afya<span class="text-primary-500">Trust</span></a>
      </div>
      <div class="flex items-center gap-4">
        <a routerLink="/" class="hidden sm:block text-slate-500 hover:text-slate-900 font-medium transition-colors">Back to Home</a>
        <a routerLink="/register" class="px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors shadow-sm">Get Started</a>
      </div>
    </nav>

    <div class="flex min-h-screen bg-white">
      <!-- LEFT: Form Side -->
      <div class="w-full lg:w-1/2 flex flex-col justify-center px-8 sm:px-16 lg:px-24 xl:px-32 relative z-10 pt-24 pb-12 overflow-y-auto">
        <div class="max-w-[420px] w-full mx-auto">
          <div class="mb-10">
            <span class="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary-50 text-primary-600 mb-6 border border-primary-100/50">
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
              </svg>
            </span>
            <h1 class="text-3xl font-bold text-slate-900 mb-3 tracking-tight">Welcome back</h1>
            <p class="text-slate-500 text-lg">Enter your ID and PIN to access your secure workspace.</p>
          </div>
          
          <div *ngIf="error" class="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-3 animate-fade-in">
             <svg class="w-5 h-5 shrink-0 mt-0.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
             <span>{{ error }}</span>
          </div>

          <form (ngSubmit)="login()" #form="ngForm" class="flex flex-col gap-5">
            <div class="space-y-1.5">
              <label class="text-sm font-semibold text-slate-700">Health ID or License</label>
              <input type="text" name="identity" [(ngModel)]="identity" required autocomplete="username" 
                     class="w-full rounded-xl border-slate-200 bg-slate-50/50 px-4 py-3.5 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all" 
                     placeholder="Enter your ID" />
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-semibold text-slate-700">Secure PIN</label>
              <input type="password" name="secret" [(ngModel)]="secret" required autocomplete="current-password" 
                     class="w-full rounded-xl border-slate-200 bg-slate-50/50 px-4 py-3.5 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all tracking-widest font-mono text-lg" 
                     placeholder="••••" />
            </div>

            <button type="submit" [disabled]="loading || !identity || !secret" 
                    class="btn-primary w-full py-4 mt-4 text-lg rounded-xl shadow-lg shadow-primary-500/25">
              {{ loading ? 'Authenticating…' : 'Log into your account' }}
            </button>
          </form>

          <p class="mt-8 text-center text-slate-500 font-medium">
            Don't have an account? 
            <a routerLink="/register" class="font-bold text-primary-600 hover:text-primary-700 transition-colors ml-1">Register here</a>
          </p>
        </div>
      </div>

      <!-- RIGHT: Hero Side -->
      <div class="hidden lg:flex lg:w-1/2 relative bg-slate-900 overflow-hidden items-center justify-center p-12">
        <!-- Abstract glowing orbs background -->
        <div class="absolute inset-0 opacity-40">
           <div class="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-primary-600 mix-blend-screen filter blur-[120px] animate-pulse" style="animation-duration: 8s"></div>
           <div class="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] rounded-full bg-accent-500 mix-blend-screen filter blur-[140px] animate-pulse" style="animation-delay: 2s; animation-duration: 10s"></div>
        </div>
        
        <!-- Glassmorphism overlay card -->
        <div class="relative z-10 max-w-lg w-full text-center px-10 py-16 rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl">
          <div class="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-md mb-8 border border-white/20 shadow-inner">
            <span class="flex h-2.5 w-2.5 relative">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-500"></span>
            </span>
            Ethereum Sepolia Network
          </div>
          <h2 class="text-4xl font-bold text-white mb-6 leading-[1.15] tracking-tight">Securing health data<br/>with blockchain.</h2>
          <p class="text-lg text-slate-300 font-light leading-relaxed">Experience tamper-proof medical records, seamless institutional referrals, and cryptographically enforced patient consent.</p>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
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
