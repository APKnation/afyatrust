import { Component, Input } from '@angular/core';
import { NgIf, NgFor, DatePipe, SlicePipe } from '@angular/common';

@Component({
  selector: 'app-record-card',
  imports: [NgIf, NgFor, DatePipe, SlicePipe],
  template: `
    <div class="mb-4 rounded-xl border-l-4 border-blue-700 bg-white p-5 shadow-md">
      <div class="mb-4 flex flex-wrap items-center gap-4">
        <span class="font-bold text-blue-700">🏥 {{ record.facility }}</span>
        <span class="text-sm text-gray-600">📅 {{ record.date | date:'medium' }}</span>
        <span
          *ngIf="record.verified"
          class="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-white"
        >✅ Verified</span>
        <span
          *ngIf="!record.verified"
          class="rounded bg-amber-500 px-2 py-1 text-xs font-semibold text-white"
        >⚠️ Unverified</span>
      </div>

      <div class="mb-3 rounded-md bg-blue-50 px-3 py-2 font-bold text-blue-700">
        {{ record.type }}
      </div>

      <div class="mb-3 rounded-lg bg-gray-50 p-4">
        <div
          *ngFor="let item of getDataEntries()"
          class="flex border-b border-gray-200 py-1.5 last:border-b-0"
        >
          <span class="w-48 shrink-0 font-semibold text-gray-700">{{ item.key }}:</span>
          <span class="text-gray-900">{{ item.value }}</span>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <span class="font-mono" [title]="record.hash">
          🔒 Hash: {{ record.hash | slice:0:15 }}...
        </span>
        <a
          *ngIf="record.tx_hash"
          [href]="'https://sepolia.etherscan.io/tx/' + record.tx_hash"
          target="_blank"
          class="text-blue-700 no-underline hover:underline"
        >
          🔗 View on Etherscan
        </a>
      </div>
    </div>
  `,
})
export class RecordCardComponent {
  @Input() record: any;

  getDataEntries(): { key: string; value: any }[] {
    if (!this.record?.data) return [];
    return Object.entries(this.record.data).map(([key, value]) => ({
      key, value: this.formatValue(value)
    }));
  }

  formatValue(value: any): string {
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}
