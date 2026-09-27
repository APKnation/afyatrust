import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-record-card',
  template: `
    <div class="record-card">
      <div class="record-header">
        <span class="facility">🏥 {{ record.facility }}</span>
        <span class="date">📅 {{ record.date | date:'medium' }}</span>
        <span *ngIf="record.verified" class="verified">✅ Imethibitishwa</span>
        <span *ngIf="!record.verified" class="unverified">⚠️ Haijathibitishwa</span>
      </div>

      <div class="record-type">
        <strong>{{ record.type }}</strong>
      </div>

      <div class="record-body">
        <div *ngFor="let item of getDataEntries()" class="data-row">
          <span class="key">{{ item.key }}:</span>
          <span class="value">{{ item.value }}</span>
        </div>
      </div>

      <div class="record-footer">
        <span class="hash" title="{{ record.hash }}">
          🔒 Hash: {{ record.hash | slice:0:15 }}...
        </span>
        <a *ngIf="record.tx_hash"
           href="https://sepolia.etherscan.io/tx/{{ record.tx_hash }}"
           target="_blank" class="etherscan-link">
          🔗 Angalia kwenye Etherscan
        </a>
      </div>
    </div>
  `,
  styles: [`
    .record-card {
      background: white; border-radius: 12px; padding: 20px;
      margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      border-left: 4px solid #1e40af;
    }
    .record-header {
      display: flex; gap: 15px; align-items: center;
      margin-bottom: 15px; flex-wrap: wrap;
    }
    .facility { font-weight: bold; color: #1e40af; }
    .date { color: #666; font-size: 14px; }
    .verified {
      background: #10b981; color: white; padding: 3px 8px;
      border-radius: 4px; font-size: 12px;
    }
    .unverified {
      background: #f59e0b; color: white; padding: 3px 8px;
      border-radius: 4px; font-size: 12px;
    }
    .record-type {
      background: #eff6ff; padding: 8px 12px; border-radius: 6px;
      margin-bottom: 12px; color: #1e40af;
    }
    .record-body {
      background: #f9fafb; padding: 15px; border-radius: 8px;
      margin-bottom: 12px;
    }
    .data-row {
      display: flex; padding: 5px 0; border-bottom: 1px solid #e5e7eb;
    }
    .data-row:last-child { border-bottom: none; }
    .key { font-weight: 600; width: 200px; color: #374151; }
    .value { color: #111827; }
    .record-footer {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 12px; color: #6b7280;
    }
    .hash { font-family: monospace; }
    .etherscan-link {
      color: #1e40af; text-decoration: none;
    }
    .etherscan-link:hover { text-decoration: underline; }
  `]
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