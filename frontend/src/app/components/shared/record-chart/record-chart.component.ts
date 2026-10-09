import { Component, Input } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';

export interface RecordChartPoint {
  label: string;
  value: number;
}

@Component({
  selector: 'app-record-chart',
  standalone: true,
  imports: [NgFor, NgIf],
  template: `
    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 class="mb-1 text-base font-bold text-slate-900">{{ title }}</h3>
      <p *ngIf="description" class="mb-4 text-xs text-slate-500">{{ description }}</p>
      <div *ngIf="data.length" role="img" [attr.aria-label]="chartDescription" class="space-y-3">
        <div *ngFor="let point of data">
          <div class="mb-1 flex items-center justify-between gap-3 text-sm">
            <span class="min-w-0 truncate text-slate-700">{{ point.label }}</span>
            <span class="shrink-0 font-semibold tabular-nums text-slate-900">{{ point.value }}</span>
          </div>
          <div class="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div class="h-full rounded-full bg-primary-500 transition-all"
                 [style.width.%]="barWidth(point.value)"></div>
          </div>
        </div>
      </div>
      <p *ngIf="!data.length" class="m-0 py-3 text-sm italic text-slate-500">{{ emptyMessage }}</p>
    </section>
  `,
})
export class RecordChartComponent {
  @Input() title = 'Health record activity';
  @Input() description = '';
  @Input() data: RecordChartPoint[] = [];
  @Input() emptyMessage = 'No recorded activity yet.';

  get chartDescription(): string {
    return `${this.title}: ${this.data.map((point) => `${point.label}, ${point.value}`).join('; ')}`;
  }

  barWidth(value: number): number {
    const maximum = Math.max(0, ...this.data.map((point) => point.value));
    return maximum > 0 && value > 0 ? Math.max(4, (value / maximum) * 100) : 0;
  }
}
