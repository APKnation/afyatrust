import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink],
  template: `
    <footer class="border-t border-slate-200 bg-white">
      <div class="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 md:grid-cols-[1fr_auto] md:items-center">
        <div class="text-center md:text-left">
          <a routerLink="/" class="brand-wordmark text-lg text-ink no-underline">Afya<span class="text-primary-700">Trust</span></a>
          <p class="mb-0 mt-1 text-sm text-slate-600">Your health, your choice.</p>
        </div>
        <nav aria-label="Footer navigation" class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm md:justify-end">
          <a routerLink="/" class="min-h-11 inline-flex items-center text-slate-600 no-underline hover:text-primary-700 hover:underline">Home</a>
          <a routerLink="/login" class="min-h-11 inline-flex items-center text-slate-600 no-underline hover:text-primary-700 hover:underline">Sign in</a>
          <a routerLink="/register" class="min-h-11 inline-flex items-center text-slate-600 no-underline hover:text-primary-700 hover:underline">Create account</a>
        </nav>
        <p class="m-0 text-center text-xs text-slate-500 md:col-span-2 md:text-left">© {{ year }} AfyaTrust · UDOM</p>
      </div>
    </footer>
  `,
})
export class SiteFooterComponent {
  readonly year = new Date().getFullYear();
}
