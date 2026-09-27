import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-doctor-landing',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="dashboard" *ngIf="!loading && !doctorsRecord; else content">
      <div class="loading">
        <h2>Inapakia data...</h2>
        <p>Sisitafuta data.</p>
      </div>
    </div>

    <ng-template #content>
      <div class="dashboard">
        <div class="welcome-card">
          <h1>Daktari, Karibu</h1>
          <p>Sajili data yako kwa migogoro yako (requests) kutoka kwa mgonjwa.</p>
          <p>Wallet: <code>{{ wallet | slice:0:10 }}...{{ wallet | slice:-8 }}</code></p>
        </div>

        <div class="panel">
          <h2>Maombi Yako ya Ruhusa</h2>
          <div class="panel-toolbar">
            <input
              [(ngModel)]="searchQuery"
              placeholder="Tafuta kwa jina au facility..."
            />
          </div>

          <div *ngIf="!requests.length" class="empty">
            Hakuna maombi mapya. Kwa madhara, tepua kwa mgonjwa.
          </div>

          <div *ngFor="let req of filteredRequests" class="request-card">
            <div class="request-main">
              <p><strong>Mgonjwa:</strong> {{ req.patient_name }}</p>
              <p><strong>Health ID:</strong> {{ req.patient_health_id }}</p>
              <p><strong>Kituo:</strong> {{ req.facility_id }}</p>
              <p class="reason">💬 {{ req.reason }}</p>
              <p class="time">📅 {{ req.created_at | date:'medium' }}</p>
            </div>
            <div class="request-actions">
              <button (click)="handleAccessRequest(req, 'grant')" class="btn btn-success">✅ Ruhusa</button>
              <button (click)="handleAccessRequest(req, 'break-glass')" class="btn btn-primary">🔓 Break-Glass</button>
              <button (click)="handleAccessRequest(req, 'reject')" class="btn btn-danger">❌ Kataa</button>
            </div>
          </div>
        </div>

        <div class="panel">
          <h2>Greta ya Data (View Record)</h2>
          <div class="search-box">
            <input [(ngModel)]="recordHealthId" placeholder="Health ID ya mgonjwa" />
            <input [(ngModel)]="recordFacility" placeholder="Facility ID" />
            <button (click)="viewRecord()" class="btn btn-primary">🔍 Fikiria</button>
          </div>
          <p class="hint">Kwa kupata ruhusa, untakusudiwa kwa mgonjwa.</p>

          <div *ngIf="records.length" class="record-scroll">
            <div *ngFor="let rec of records" class="record-card">
              <div class="record-header">
                <span class="facility">🏥 {{ rec.facility }}</span>
                <span class="date">📅 {{ rec.date | date:'medium' }}</span>
                <span class="type">{{ rec.type }}</span>
              </div>
              <div class="record-body">
                <div *ngFor="let item of getDataEntries(rec.data)" class="data-row">
                  <span class="key">{{ item.key }}:</span>
                  <span class="value">{{ item.value }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    .dashboard { max-width: 1100px; margin: 0 auto; }

    .welcome-card {
      background: linear-gradient(135deg, #0f766e, #134e4a);
      color: white;
      padding: 24px;
      border-radius: 14px;
      margin-bottom: 20px;
    }
    .welcome-card h1 { margin: 0 0 8px; }
    .welcome-card code { background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 6px; }

    .panel {
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      padding: 24px;
      margin-bottom: 20px;
    }

    .panel h2 {
      margin: 0 0 16px;
      font-size: 20px;
    }

    .panel-toolbar {
      position: relative;
      margin-bottom: 12px;
    }
    .panel-toolbar input {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      box-sizing: border-box;
    }

    .search-box {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .search-box input {
      flex: 1 1 200px;
      padding: 10px 14px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      box-sizing: border-box;
    }
    .hint { font-size: 13px; color: #666; margin: 8px 0 16px; }

    .request-card {
      background: white;
      padding: 18px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      border-left: 4px solid #134e4a;
      flex-wrap: wrap;
    }
    .request-main { flex: 1 1 280px; }
    .request-main p { margin: 4px 0; }
    .request-main .reason { font-style: italic; color: #666; }
    .request-main .time { font-size: 12px; color: #999; }

    .request-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .btn {
      padding: 10px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 700;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: opacity 0.2s;
      flex-shrink: 0;
    }
    .btn-success { background: #10b981; color: white; }
    .btn-danger   { background: #ef4444; color: white; }
    .btn-primary  { background: #1e40af; color: white; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .record-scroll { max-height: 520px; overflow-y: auto; }
    .record-card {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 14px;
    }
    .record-header {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .record-header .facility { font-weight: 700; color: #15803d; }
    .record-header .date { color: #4b5563; font-size: 13px; }
    .record-header .type { background: #dcfce7; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 700; }

    .record-body {
      background: white;
      padding: 10px;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }
    .data-row { display: flex; padding: 4px 0; border-bottom: 1px solid #f3f4f6; }
    .data-row:last-child { border-bottom: none; }
    .data-row .key { font-weight: 600; width: 160px; color: #374151; }
    .data-row .value { color: #111827; }

    .empty {
      text-align: center;
      color: #999;
      padding: 32px;
      font-style: italic;
    }

    .loading {
      text-align: center;
      padding: 60px;
      color: #666;
    }
  `],
})
export class DoctorLandingComponent implements OnInit {
  wallet = '';
  requests: any[] = [];
  filteredRequests: any[] = [];
  searchQuery = '';
  recordHealthId = '';
  recordFacility = '';
  records: any[] = [];
  loading = false;

  constructor(private api: ApiService, private auth: AuthService) {}

  async ngOnInit() {
    const wallet = await this.auth.wallet$;
    this.wallet = wallet;
    await this.loadPendingRequests();
  }

  async loadPendingRequests() {
    this.loading = true;
    try {
      const data = await this.api.doctorPendingRequests();
      this.requests = (data as any)?.data || [];
      this.filteredRequests = this.requests;
    } catch (e: any) {
      console.error('Failed to load requests', e);
    } finally {
      this.loading = false;
    }
  }

  async handleAccessRequest(req: any, action: 'grant' | 'break-glass' | 'reject') {
    try {
      if (action === 'grant') {
        await this.api.doctorGrantAccess(req);
      } else if (action === 'break-glass') {
        await this.api.breakGlass({
          health_id: req.patient_health_id,
          facility_id: req.facility_id,
          reason: req.reason,
        });
      } else {
        await this.api.rejectRequest(req.id);
      }
      await this.loadPendingRequests();
      await this.loadRecords();
    } catch (e: any) {
      alert('Hitilafu: ' + (e.error?.message || e.message || 'Kitatipatia'));
    }
  }

  async viewRecord() {
    if (!this.recordHealthId) return;
    try {
      const data = await this.api.doctorViewRecord(this.recordHealthId, this.recordFacility || undefined);
      this.records = (data as any)?.data?.records || [];
    } catch (e: any) {
      alert('Hitilafu: ' + (e.error?.message || e.message || 'Kitatipatia'));
    }
  }

  getDataEntries(data: any): { key: string; value: any }[] {
    if (!data) return [];
    return Object.entries(data).map(([key, value]) => ({ key, value }));
  }
}
