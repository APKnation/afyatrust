import { Component, OnInit } from '@angular/core';
import { NgIf, NgFor, SlicePipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-doctor-landing',
  imports: [NgIf, NgFor, SlicePipe, DatePipe, FormsModule],
  template: `
    <div *ngIf="!loading && !doctorsRecord; else content">
      <div class="py-15 text-center text-gray-600">
        <h2 class="mb-1 text-xl font-bold">Loading data...</h2>
        <p>Please wait.</p>
      </div>
    </div>

    <ng-template #content>
      <div class="mx-auto max-w-6xl">
        <div class="mb-5 rounded-2xl bg-gradient-to-br from-teal-700 to-teal-900 p-6 text-white">
          <h1 class="mb-2 text-2xl font-bold">Welcome, Doctor</h1>
          <p class="m-0">View and respond to access requests from your patients.</p>
          <p class="m-0">Wallet: <code class="rounded bg-white/20 px-2 py-1 text-sm">{{ wallet | slice:0:10 }}...{{ wallet | slice:-8 }}</code></p>
        </div>

        <div class="mb-5 rounded-2xl border border-gray-200 bg-slate-50 p-6">
          <h2 class="mb-4 text-xl font-bold">Access Requests</h2>
          <div class="relative mb-3">
            <input
              [(ngModel)]="searchQuery"
              placeholder="Search by name or facility..."
              class="box-border w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm"
            />
          </div>

          <div *ngIf="!requests.length" class="py-8 text-center text-gray-400 italic">
            No new requests. Access appears here after a patient approves it.
          </div>

          <div
            *ngFor="let req of filteredRequests"
            class="mb-3.5 flex flex-wrap items-start justify-between gap-4 rounded-xl border-l-4 border-teal-900 bg-white p-4.5 shadow-md"
          >
            <div class="min-w-[280px] flex-1">
              <p class="my-1"><strong>Patient:</strong> {{ req.patient_name }}</p>
              <p class="my-1"><strong>Health ID:</strong> {{ req.patient_health_id }}</p>
              <p class="my-1"><strong>Facility:</strong> {{ req.facility_id }}</p>
              <p class="my-1 text-[13px] text-gray-600 italic">💬 {{ req.reason }}</p>
              <p class="my-1 text-xs text-gray-400">📅 {{ req.created_at | date:'medium' }}</p>
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              <button (click)="handleAccessRequest(req, 'grant')" class="cursor-pointer rounded-md border-none bg-emerald-500 px-4 py-2.5 font-bold text-white transition-opacity hover:opacity-90">✅ Grant</button>
              <button (click)="handleAccessRequest(req, 'break-glass')" class="cursor-pointer rounded-md border-none bg-blue-800 px-4 py-2.5 font-bold text-white transition-opacity hover:opacity-90">🔓 Break-Glass</button>
              <button (click)="handleAccessRequest(req, 'reject')" class="cursor-pointer rounded-md border-none bg-red-500 px-4 py-2.5 font-bold text-white transition-opacity hover:opacity-90">❌ Reject</button>
            </div>
          </div>
        </div>

        <div class="mb-5 rounded-2xl border border-gray-200 bg-slate-50 p-6">
          <h2 class="mb-4 text-xl font-bold">View Patient Records</h2>
          <div class="mb-4 flex flex-wrap gap-3">
            <input [(ngModel)]="recordHealthId" placeholder="Patient's Health ID" class="min-w-50 flex-[1_1_200px] rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm" />
            <input [(ngModel)]="recordFacility" placeholder="Facility ID" class="min-w-50 flex-[1_1_200px] rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm" />
            <button (click)="viewRecord()" class="cursor-pointer rounded-md border-none bg-blue-800 px-4 py-2.5 font-bold text-white transition-opacity hover:opacity-90">🔍 View</button>
          </div>
          <p class="my-2 mb-4 text-[13px] text-gray-500">With permission, you can view the patient's full record.</p>

          <div *ngIf="records.length" class="max-h-[520px] overflow-y-auto">
            <div *ngFor="let rec of records" class="mb-3.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div class="mb-2.5 flex flex-wrap items-center gap-3">
                <span class="font-bold text-emerald-700">🏥 {{ rec.facility }}</span>
                <span class="text-[13px] text-gray-600">📅 {{ rec.date | date:'medium' }}</span>
                <span class="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold">{{ rec.type }}</span>
              </div>
              <div class="rounded-md border border-gray-200 bg-white p-2.5">
                <div *ngFor="let item of getDataEntries(rec.data)" class="flex border-b border-gray-100 py-1 last:border-b-0">
                  <span class="w-40 font-semibold text-gray-700">{{ item.key }}:</span>
                  <span class="text-gray-900">{{ item.value }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ng-template>
  `,
})
export class DoctorLandingComponent implements OnInit {
  wallet = '';
  requests: any[] = [];
  filteredRequests: any[] = [];
  searchQuery = '';
  recordHealthId = '';
  recordFacility = '';
  records: any[] = [];
  doctorsRecord: any = null;
  loading = false;

  constructor(private api: ApiService, private auth: AuthService) {}

  async ngOnInit() {
    this.wallet = this.auth.wallet;
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
      alert('Error: ' + (e.error?.message || e.message || 'Something went wrong'));
    }
  }

  async loadRecords() {
    if (!this.recordHealthId) return;
    await this.viewRecord();
  }

  async viewRecord() {
    if (!this.recordHealthId) return;
    try {
      const data = await this.api.doctorViewRecord(this.recordHealthId, this.recordFacility || undefined);
      this.records = (data as any)?.data?.records || [];
    } catch (e: any) {
      alert('Error: ' + (e.error?.message || e.message || 'Something went wrong'));
    }
  }

  getDataEntries(data: any): { key: string; value: any }[] {
    if (!data) return [];
    return Object.entries(data).map(([key, value]) => ({ key, value }));
  }
}
