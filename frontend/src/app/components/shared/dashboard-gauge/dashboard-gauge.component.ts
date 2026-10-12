import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-dashboard-gauge',
  standalone: true,
  template: `
    <section class="dashboard-gauge-card">
      <div class="flex items-start justify-between gap-3">
        <div><h3 class="m-0 text-base font-bold text-slate-900">{{ title }}</h3>
          <p class="mb-0 mt-1 text-xs leading-relaxed text-slate-500">{{ description }}</p></div>
      </div>
      <div class="my-5 flex justify-center">
        <div class="relative h-40 w-40" role="img" [attr.aria-label]="loading ? title + ': loading' : (denominator > 0 ? percent + '% ' + title : title + ': no data yet')">
          <svg viewBox="0 0 120 120" class="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r="49" fill="none" stroke="#e8edf2" stroke-width="11" />
            <circle cx="60" cy="60" r="49" fill="none" stroke="var(--primary, #008254)" stroke-width="11"
              stroke-linecap="round" pathLength="100" stroke-dasharray="100" [attr.stroke-dashoffset]="100 - percent" />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <strong class="text-3xl font-bold tracking-tight text-slate-900">{{ loading ? '…' : (denominator > 0 ? percent + '%' : '—') }}</strong>
            <span class="mt-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">{{ loading ? 'loading' : (denominator > 0 ? centerLabel : 'no data') }}</span>
          </div>
        </div>
      </div>
      <div class="rounded-xl bg-slate-50 px-4 py-3 text-center">
        <p class="m-0 text-sm font-semibold text-slate-800">{{ loading ? 'Updating summary…' : (denominator > 0 ? numerator + ' of ' + denominator : 'No records yet') }}</p>
        <p class="mb-0 mt-1 text-xs text-slate-500">{{ loading ? 'Your latest data is on the way.' : footer }}</p>
      </div>
    </section>
  `,
})
export class DashboardGaugeComponent {
  @Input() title = 'Progress';
  @Input() description = '';
  @Input() numerator = 0;
  @Input() denominator = 0;
  @Input() loading = false;
  @Input() centerLabel = 'coverage';
  @Input() footer = '';

  get percent(): number {
    if (!this.denominator || this.denominator < 0) return 0;
    return Math.min(100, Math.max(0, Math.round((this.numerator / this.denominator) * 100)));
  }
}
