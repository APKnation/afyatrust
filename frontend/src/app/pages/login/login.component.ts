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
    <div class="flex min-h-screen bg-white">
      <!-- RIGHT: Form Side on desktop -->
      <div class="w-full lg:order-2 lg:w-1/2 flex flex-col justify-center px-8 sm:px-16 lg:px-24 xl:px-32 relative z-10 py-12 overflow-y-auto">
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
      <div class="hidden lg:order-1 lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center bg-cover bg-center p-12" style="background-image: url('/hospital.jpg')">
        <div class="absolute inset-0 bg-slate-950/75"></div>
        <!-- Abstract glowing orbs background -->
        <div class="absolute inset-0 opacity-40">
           <div class="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-primary-600 mix-blend-screen filter blur-[120px] animate-pulse" style="animation-duration: 8s"></div>
           <div class="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] rounded-full bg-accent-500 mix-blend-screen filter blur-[140px] animate-pulse" style="animation-delay: 2s; animation-duration: 10s"></div>
        </div>
        
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
