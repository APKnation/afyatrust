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
    <section class="dashboard-chart-card">
      <div class="mb-5 flex items-start justify-between gap-3">
        <div><h3 class="mb-1 text-base font-bold text-slate-900">{{ title }}</h3>
        <p *ngIf="description" class="m-0 text-xs leading-relaxed text-slate-500">{{ description }}</p></div>
        <span *ngIf="data.length" class="text-xs font-medium text-slate-500">{{ data.length }} categories</span>
      </div>
      <div *ngIf="data.length" role="list" [attr.aria-label]="chartDescription" class="divide-y divide-slate-200 border-y border-slate-200">
        <div *ngFor="let point of data" role="listitem" class="flex min-h-11 items-center justify-between gap-4 bg-white px-1 py-2">
          <span class="min-w-0 truncate text-sm text-slate-700">{{ point.label }}</span>
          <span class="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{{ point.value }}</span>
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

}
