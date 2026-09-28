import { Component, OnInit } from '@angular/core';
import { NgIf, NgFor, SlicePipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-patient-dashboard',
  imports: [NgIf, NgFor, SlicePipe, DatePipe, FormsModule],
  template: `
    <div class="dashboard" *ngIf="!loading && !patient; else content">
      <div class="loading">
        <h2>Inapakia data...</h2>
        <p>Sisitafuta data.</p>
      </div>
    </div>

    <ng-template #content>
      <div class="dashboard">
        <div class="welcome-card">
          <h1>Karibu, {{ patient.full_name }}</h1>
          <p>Health ID: <strong>{{ patient.health_id }}</strong></p>
          <p>Wallet: <code>{{ wallet | slice:0:10 }}...{{ wallet | slice:-8 }}</code></p>
        </div>

        <div class="tabs">
          <button
            [class.active]="tab === 'records'"
            (click)="tab = 'records'"
          >
            📋 Records Zangu ({{ patient.records.length }})
          </button>
          <button
            [class.active]="tab === 'permissions'"
            (click)="tab = 'permissions'"
          >
            🔐 Ruhusa Zangu
          </button>
          <button
            [class.active]="tab === 'requests'"
            (click)="tab = 'requests'"
          >
            📬 Maombi <span *ngIf="pendingRequests.length > 0" class="badge">{{ pendingRequests.length }}</span>
          </button>
          <button
            [class.active]="tab === 'audit'"
            (click)="tab = 'audit'"
          >
            👁️ Nani Ameona Data Yangu
          </button>
        </div>

        <!-- RECORDS -->
        <div *ngIf="tab === 'records'" class="tab-content">
          <h2>Historia Yako ya Matibabu</h2>
          <div *ngFor="let rec of patient.records" class="record-card">
            <div class="record-header">
              <span class="facility">🏥 {{ rec.facility }}</span>
              <span class="date">📅 {{ rec.date | date:'medium' }}</span>
              <span *ngIf="rec.verified" class="verified">✅ Imethibitishwa</span>
              <span *ngIf="!rec.verified" class="unverified">⚠️ Haijathibitishwa</span>
            </div>
            <div class="record-type">
              <strong>{{ rec.type }}</strong>
            </div>
            <div class="record-body">
              <div *ngFor="let item of getDataEntries(rec.data)" class="data-row">
                <span class="key">{{ item.key }}:</span>
                <span class="value">{{ item.value }}</span>
              </div>
            </div>
            <div class="record-footer">
              <span class="hash">🔒 Hash: {{ rec.hash | slice:0:15 }}...</span>
              <a *ngIf="rec.tx_hash" href="https://sepolia.etherscan.io/tx/{{ rec.tx_hash }}" target="_blank" class="etherscan-link">🔗 Angalia kwenye Etherscan</a>
            </div>
          </div>
          <p *ngIf="patient.records.length === 0" class="empty">
            Huna records bado. Tembelea hospitali iliyosajiliwa.
          </p>
        </div>

        <!-- PERMISSIONS -->
        <div *ngIf="tab === 'permissions'" class="tab-content">
          <div class="header-actions">
            <h2>Ruhusa Uliyotoa</h2>
            <button (click)="showGrantForm = true" class="btn btn-primary">➕ Toa Ruhusa kwa Daktari</button>
          </div>

          <div *ngIf="showGrantForm" class="form-card">
            <h3>Toa Ruhusa</h3>
            <div class="form-grid">
              <input [(ngModel)]="newPermission.doctor_wallet" placeholder="Wallet ya Daktari (0x...)" />
              <input [(ngModel)]="newPermission.doctor_name" placeholder="Jina la Daktari" />
              <input type="number" [(ngModel)]="newPermission.days" placeholder="Siku (mfano 7)" min="1" />
            </div>
            <div class="form-actions">
              <button (click)="grantAccess()" [disabled]="loading" class="btn btn-success">
                {{ loading ? 'Inatuma...' : '✅ Toa Ruhusa' }}
              </button>
              <button (click)="showGrantForm = false" class="btn btn-secondary">Ghairi</button>
            </div>
          </div>

          <div *ngFor="let perm of permissions" class="permission-card">
            <div class="perm-info">
              <p><strong>👨‍⚕️ {{ perm.doctor_name || 'Daktari' }}</strong></p>
              <p class="wallet">Wallet: <code>{{ perm.grantedTo || perm.doctor_wallet }}</code></p>
              <p class="expiry">📅 Inaisha: {{ formatDate(perm.expiry) }}</p>
              <p class="granted-by">
                Imetolewa na: <span [class]="'role-' + perm.grantedByRole?.toLowerCase()">
                  {{ perm.grantedByRole }}
                </span>
              </p>
            </div>
            <button (click)="revokeAccess(perm.grantedTo || perm.doctor_wallet)" class="btn btn-danger">❌ Batilisha</button>
          </div>
          <p *ngIf="permissions.length === 0" class="empty">Hujatoa ruhusa yoyote bado.</p>
        </div>

        <!-- REQUESTS -->
        <div *ngIf="tab === 'requests'" class="tab-content">
          <h2>Maombi ya Ruhusa</h2>
          <div *ngFor="let req of pendingRequests" class="request-card">
            <p><strong>👨‍⚕️ {{ req.doctor_name }}</strong> kutoka <strong>{{ req.facility_id }}</strong></p>
            <p class="reason">💬 {{ req.reason }}</p>
            <p class="time">📅 {{ req.created_at | date:'medium' }}</p>
            <div class="actions">
              <button (click)="approveRequest(req)" class="btn btn-success">✅ Kubali</button>
              <button (click)="rejectRequest(req)" class="btn btn-danger">❌ Kataa</button>
            </div>
          </div>
          <p *ngIf="pendingRequests.length === 0" class="empty">Hakuna maombi mapya.</p>
        </div>

        <!-- AUDIT -->
        <div *ngIf="tab === 'audit'" class="tab-content">
          <h2>Nani Ameona Data Yangu</h2>
          <div class="audit-scroll">
            <table class="audit-table">
              <thead>
                <tr>
                  <th>Tarehe</th>
                  <th>Mtu</th>
                  <th>Jukumu</th>
                  <th>Kitendo</th>
                  <th>Kituo</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let event of patient.audit_trail">
                  <td>{{ event.timestamp * 1000 | date:'short' }}</td>
                  <td><code>{{ event.accessor | slice:0:10 }}...</code></td>
                  <td>
                    <span [class]="'role-badge role-' + event.role.toLowerCase()">{{ event.role }}</span>
                  </td>
                  <td>
                    <span [class]="'action-badge action-' + event.action.toLowerCase()">{{ event.action }}</span>
                  </td>
                  <td>{{ event.facility || '-' }}</td>
                </tr>
              </tbody>
            </table>
            <p *ngIf="patient.audit_trail.length === 0" class="empty">Hakuna shughuli bado.</p>
          </div>
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    .dashboard {
      max-width: 1100px;
      margin: 0 auto;
    }

    .welcome-card {
      background: linear-gradient(135deg, #1e40af, #3b82f6);
      color: white;
      padding: 24px;
      border-radius: 14px;
      margin-bottom: 20px;
    }

    .welcome-card h1 { margin: 0 0 8px; }
    .welcome-card code { background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 6px; }

    .tabs {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    }

    .tabs button {
      background: none;
      border: none;
      padding: 12px 18px;
      cursor: pointer;
      font-size: 15px;
      color: #6b7280;
      border-bottom: 3px solid transparent;
      position: relative;
      flex: 1 1 160px;
      text-align: center;
    }

    .tabs button.active {
      color: #1e40af;
      border-bottom-color: #1e40af;
      font-weight: 700;
    }

    .badge {
      background: #ef4444;
      color: white;
      border-radius: 10px;
      padding: 2px 8px;
      font-size: 12px;
      margin-left: 6px;
    }

    .tab-content { animation: fadeIn 0.25s; }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    .header-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 20px;
    }

    .form-card {
      background: #f9fafb;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 20px;
      border: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .form-card input {
      padding: 10px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      box-sizing: border-box;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
    }

    .form-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 6px;
    }

    .btn {
      padding: 10px 18px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: opacity 0.2s;
    }

    .btn-primary { background: #1e40af; color: white; }
    .btn-success { background: #10b981; color: white; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-secondary { background: #6b7280; color: white; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .permission-card, .request-card {
      background: white;
      padding: 18px;
      border-radius: 12px;
      margin-bottom: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      border-left: 4px solid #3b82f6;
    }

    .perm-info p { margin: 4px 0; }
    .wallet code, .reason { font-size: 13px; color: #666; }
    .expiry { color: #f59e0b; font-size: 13px; }
    .granted-by { font-size: 12px; color: #666; }

    .request-card .reason {
      font-style: italic;
      background: #f3f4f6;
      padding: 8px;
      border-radius: 6px;
    }

    .request-card .time { font-size: 12px; color: #999; }
    .request-card .actions { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; }

    .audit-scroll { max-height: 520px; overflow-y: auto; }
    .audit-table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }

    .audit-table th {
      background: #1e40af;
      color: white;
      padding: 12px;
      text-align: left;
      font-size: 14px;
    }
    .audit-table td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
    .audit-table tr:hover { background: #f9fafb; }

    .role-badge, .action-badge {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 700;
    }

    .role-patient { background: #dbeafe; color: #1e40af; }
    .role-doctor  { background: #dcfce7; color: #166534; }
    .role-facility{ background: #fef3c7; color: #92400e; }

    .action-view        { background: #e0e7ff; color: #3730a3; }
    .action-break_glass { background: #fee2e2; color: #991b1b; }
    .action-granted_to_do { background: #dcfce7; color: #166534; }
    .action-record_added{ background: #dbeafe; color: #1e40af; }
    .action-patient_registered { background: #fce7f3; color: #9d174d; }
    .action-revoked_doctor { background: #fef3c7; color: #92400e; }

    .record-card {
      background: white;
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      border-left: 4px solid #1e40af;
    }

    .record-header {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }

    .record-header .facility { font-weight: 700; color: #1e40af; }
    .record-header .date { color: #666; font-size: 14px; }
    .verified { background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .unverified { background: #f59e0b; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; }

    .record-type {
      background: #eff6ff;
      padding: 8px 12px;
      border-radius: 6px;
      margin-bottom: 12px;
      color: #1e40af;
    }

    .record-body {
      background: #f9fafb;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 12px;
    }

    .data-row {
      display: flex;
      padding: 5px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .data-row:last-child { border-bottom: none; }
    .data-row .key { font-weight: 600; width: 200px; color: #374151; }
    .data-row .value { color: #111827; }

    .record-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: #6b7280;
    }

    .hash { font-family: monospace; }
    .etherscan-link { color: #1e40af; text-decoration: none; }
    .etherscan-link:hover { text-decoration: underline; }

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
export class PatientDashboardComponent implements OnInit {
  tab: 'records' | 'permissions' | 'requests' | 'audit' = 'records';
  patient: any = null;
  wallet = '';
  permissions: any[] = [];
  pendingRequests: any[] = [];
  auditTrail: any[] = [];
  showGrantForm = false;
  loading = false;
  newPermission = { doctor_wallet: '', doctor_name: '', days: 7 };

  constructor(private api: ApiService, private auth: AuthService) {}

  async ngOnInit() {
    this.wallet = this.auth.wallet;
    await this.loadPatient();
  }

  async loadPatient() {
    this.loading = true;
    try {
      const data = await this.api.myRecords();
      this.patient = data;
      this.permissions = this.patient.permissions || [];
      this.pendingRequests = this.patient.pendingRequests || [];
      this.auditTrail = this.patient.audit_trail || [];
    } catch (e: any) {
      console.error('Failed to load patient data', e);
    } finally {
      this.loading = false;
    }
  }

  getDataEntries(data: any): { key: string; value: any }[] {
    if (!data) return [];
    return Object.entries(data).map(([key, value]) => ({ key, value }));
  }

  formatDate(value: any): string {
    const ts = Number(value);
    if (!isNaN(ts) && ts > 10000000000) return new Date(ts * 1000).toLocaleDateString();
    return String(value);
  }

  async grantAccess() {
    this.loading = true;
    try {
      await this.api.grantAccess(this.newPermission);
      this.showGrantForm = false;
      this.newPermission = { doctor_wallet: '', doctor_name: '', days: 7 };
      await this.loadPatient();
    } catch (e: any) {
      alert('Hitilafu: ' + (e.error?.message || e.message || 'Kitatipatia'));
    } finally {
      this.loading = false;
    }
  }

  async revokeAccess(walletAddr: string) {
    if (!confirm('Batilisha ruhusa kwa daktari huu?')) return;
    try {
      await this.api.revokeAccess(walletAddr);
      await this.loadPatient();
    } catch (e: any) {
      alert('Hitilafu: ' + (e.error?.message || e.message || 'Kitatipatia'));
    }
  }

  async approveRequest(req: any) {
    try {
      await this.api.approveRequest(req.id);
      await this.loadPatient();
    } catch (e: any) {
      alert('Hitilafu: ' + (e.error?.message || e.message || 'Kitatipatia'));
    }
  }

  async rejectRequest(req: any) {
    try {
      await this.api.rejectRequest(req.id);
      await this.loadPatient();
    } catch (e: any) {
      alert('Hitilafu: ' + (e.error?.message || e.message || 'Kitatipatia'));
    }
  }
}
