import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { NgIf, NgFor, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  AccessRequest, ApiService, AssignedPatient, HospitalOption, MeasurementItem, PatientRecord, ReferralItem,
  BlockchainEvent,
} from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';

/**
 * Doctor workspace (PIN-login, JWT-identified).
 * Clean typographic design matching the landing page — no decorative glyphs.
 * - My Patients: everyone who granted this doctor access, with liveness.
 * - Patient detail: records, measurements (add new), referral to another
 *   hospital via a dropdown, plus the full access-request / break-glass flow.
 */
@Component({
  selector: 'app-doctor-dashboard',
  imports: [NgIf, NgFor, DatePipe, FormsModule],
  template: `
    <div class="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <!-- Hero header -->
      <div class="card mb-6 p-6 sm:p-8">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span class="eyebrow mb-2">Clinical Workspace</span>
            <h1 class="mb-1 text-2xl font-bold text-ink sm:text-3xl">Dr. {{ auth.fullName }}</h1>
            <p class="m-0 text-sm text-muted">
              <span *ngIf="hospitalName">{{ hospitalName }}</span>
              <span *ngIf="hospitalName" class="mx-2 text-gray-300">|</span>
              License <strong class="text-ink">{{ license }}</strong>
            </p>
          </div>
          <span class="rounded-full bg-accent-100 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-accent-800">
            Verified clinician
          </span>
        </div>
      </div>

      <!-- INCOMING REFERRAL TOASTS (poll-fed) -->
      <div class="fixed top-20 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
        <div *ngFor="let n of incomingToasts" class="card animate-fade-in border-l-4 border-accent-500 p-4">
          <div class="mb-1 flex items-center justify-between gap-2">
            <span class="text-sm font-bold text-ink">Referral received</span>
            <button (click)="dismissReferral(n.id)" aria-label="Dismiss"
                    class="cursor-pointer border-none bg-transparent text-xl leading-none text-muted hover:text-ink">×</button>
          </div>
          <p class="m-0 text-sm text-ink">
            <strong>{{ n.patient_name }}</strong> ({{ n.patient_health_id }}) sent from
            <strong>{{ n.from_hospital }}</strong>
            <span *ngIf="n.from_doctor" class="block">by Dr. {{ n.from_doctor }}</span>
          </p>
          <p *ngIf="n.reason" class="mb-0 mt-1 rounded-md bg-primary-50 px-2 py-1.5 text-[13px] italic text-muted">{{ n.reason }}</p>
          <div class="mt-3 flex gap-2">
            <button (click)="respondIncoming(n, 'ACCEPTED')" [disabled]="busyIncoming === n.id"
                    class="flex-1 cursor-pointer rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50">Accept</button>
            <button (click)="respondIncoming(n, 'DECLINED')" [disabled]="busyIncoming === n.id"
                    class="flex-1 cursor-pointer rounded-lg border-2 border-red-500 px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500 hover:text-white disabled:opacity-50">Decline</button>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="mb-6 flex flex-wrap gap-1 border-b-2 border-gray-200">
        <button *ngFor="let t of tabs" (click)="setTab(t.id)"
                class="cursor-pointer border-none bg-transparent px-4 py-3 text-[15px] transition-colors"
                [class]="tab === t.id ? 'border-b-3 border-primary-500 font-bold text-ink' : 'text-muted hover:text-ink'">
          {{ t.label }}
          <span *ngIf="t.id === 'referrals' && pendingIncoming > 0"
                class="ml-1.5 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{{ pendingIncoming }}</span>
          <span *ngIf="t.id === 'requests' && pendingRequestCount > 0"
                class="ml-1.5 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{{ pendingRequestCount }}</span>
        </button>
      </div>

      <!-- ================= MY PATIENTS ================= -->
      <div *ngIf="tab === 'patients'" class="animate-fade-in">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="mb-1 text-xl font-bold">My Patients</h2>
            <p class="m-0 text-sm text-muted">
              Patients who granted you access. Liveness is verified against the chain;
              expired grants stay listed but marked.
            </p>
          </div>
          <button (click)="loadPatients()" [disabled]="loadingPatients"
                  class="cursor-pointer rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink">
            Refresh
          </button>
        </div>

        <div *ngFor="let p of patients" (click)="openPatient(p)"
             class="card mb-4 flex cursor-pointer flex-wrap items-center justify-between gap-3 p-5 transition-transform hover:-translate-y-0.5">
          <div>
            <p class="m-0 font-bold text-ink">{{ p.full_name }}</p>
            <p class="m-0 text-sm text-muted">Health ID: {{ p.health_id }}</p>
          </div>
          <div class="text-right text-sm">
            <p class="m-0" [class]="p.active ? 'font-bold text-accent-700' : 'font-semibold text-red-600'">
              {{ p.active
                ? (p.source === 'BREAK_GLASS' ? 'Emergency access' : 'Access active')
                : 'Access expired or revoked' }}
            </p>
            <p class="m-0 text-xs text-muted">until {{ p.expires_at | date:'medium' }}</p>
          </div>
        </div>
        <div *ngIf="patients.length === 0 && !loadingPatients" class="card p-10 text-center">
          <h3 class="mb-1 text-lg font-bold">No patients yet</h3>
          <p class="m-0 text-muted">Use Find Patient to request access to a record.</p>
        </div>
      </div>

      <!-- ================= FIND PATIENT ================= -->
      <div *ngIf="tab === 'find'" class="animate-fade-in">
        <div class="card mb-5 p-6">
          <h2 class="mb-1 text-xl font-bold">Find Patient</h2>
          <p class="mb-4 m-0 text-sm text-muted">Enter a Health ID. Permission is checked live on-chain before anything opens.</p>
          <div class="flex flex-wrap gap-3">
            <input [(ngModel)]="healthId" placeholder="Health ID"
                   class="min-w-50 flex-1 rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm" />
            <button (click)="viewRecord()" [disabled]="loading"
                    class="cursor-pointer rounded-lg bg-primary-500 px-5 py-2.5 font-bold text-ink transition-colors hover:bg-primary-400 disabled:opacity-50">
              {{ loading ? 'Checking…' : 'Access records' }}
            </button>
          </div>

          <!-- DENIED: request access / break-glass -->
          <div *ngIf="denied" class="mt-4 rounded-lg border border-primary-200 bg-primary-50 p-4">
            <p class="m-0 font-semibold text-primary-900">No access permission for this patient.</p>
            <p class="m-0 mt-1 text-sm text-primary-800">
              The patient must approve your request — or use break-glass in an emergency.
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <input [(ngModel)]="requestReason" placeholder="Reason for access"
                     class="flex-1 rounded-lg border border-primary-300 bg-white px-3 py-2 text-sm" />
              <button (click)="requestAccess()" [disabled]="requestStatusFor(healthId) === 'PENDING'"
                      class="cursor-pointer rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50">
                {{ requestStatusFor(healthId) === 'PENDING' ? 'Request awaiting patient' : 'Request access' }}
              </button>
              <button (click)="breakGlass()"
                      class="cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700">
                Break-glass
              </button>
            </div>
            <p *ngIf="requestStatusFor(healthId) === 'REJECTED'" class="mb-0 mt-2 text-xs font-semibold text-red-700">
              The patient rejected a previous request for this record.
            </p>
          </div>

          <!-- REQUEST SENT: waiting for the patient -->
          <div *ngIf="requestSent" class="mt-4 rounded-lg border-2 border-accent-300 bg-accent-50 p-4">
            <p class="m-0 font-bold text-accent-900">Request sent to the patient.</p>
            <p class="m-0 mt-1 text-sm text-accent-800">
              You'll see it under <strong>My Requests</strong>. When the patient approves,
              access unlocks here automatically (checked every 15 seconds) and the patient
              appears in <strong>My Patients</strong>.
            </p>
          </div>
        </div>

        <!-- Patient detail -->
        <div *ngIf="viewedName" class="card p-6">
          <div class="mb-1 flex flex-wrap items-baseline gap-2">
            <h2 class="text-xl font-bold">Records for {{ viewedHealthId }}</h2>
            <span class="text-sm text-muted">— {{ viewedName }}</span>
          </div>
          <p class="mb-4 text-sm text-muted">Every view of this page is logged on-chain.</p>

          <div class="max-h-[460px] overflow-y-auto">
            <div *ngFor="let rec of records" class="mb-3.5 rounded-xl border border-gray-200 bg-gray-50 p-4.5">
              <div class="mb-3 flex flex-wrap items-center gap-3">
                <span class="font-bold text-accent-700">{{ rec.facility }}</span>
                <span class="text-sm text-muted">{{ rec.date | date:'medium' }}</span>
                <span class="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-bold text-primary-900">{{ rec.type }}</span>
                <span *ngIf="rec.verified" class="rounded-full bg-accent-500 px-2.5 py-0.5 text-xs font-semibold text-white">On-chain</span>
              </div>
              <div *ngIf="rec.source_uri" class="mb-3 text-xs text-muted flex items-center gap-1.5">
                <span class="font-semibold">Source:</span>
                <a [href]="rec.source_uri" target="_blank" rel="noopener" class="text-accent-600 hover:underline break-all">{{ rec.source_uri }}</a>
              </div>
              <div class="rounded-lg bg-white p-3 shadow-sm">
                <div *ngFor="let item of entries(rec.data)"
                     class="flex border-b border-gray-100 py-1.5 last:border-b-0">
                  <span class="w-44 shrink-0 font-semibold capitalize text-ink">{{ item.key }}:</span>
                  <span class="text-gray-900">{{ item.value }}</span>
                </div>
              </div>
            </div>
            <div *ngIf="records.length === 0" class="p-8 text-center">
              <p class="m-0 text-muted italic">No records for this patient yet.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ================= MEASUREMENTS ================= -->
      <div *ngIf="tab === 'measurements'" class="animate-fade-in">
        <h2 class="mb-1 text-xl font-bold">Disease Measurements</h2>
        <p class="mb-4 text-sm text-muted">Record a clinical reading, then watch the trend for any measurement type.</p>

        <!-- Add measurement -->
        <div class="card mb-5 p-6">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Patient Health ID</span>
              <input [(ngModel)]="meas.health_id" placeholder="e.g. HTD-2024-001"
                     class="rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Measurement type</span>
              <select [(ngModel)]="meas.kind" (ngModelChange)="setUnit()"
                      class="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm">
                <option *ngFor="let k of measurementKinds" [value]="k">{{ k }}</option>
              </select>
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Value {{ meas.unit ? '(' + meas.unit + ')' : '' }}</span>
              <input type="number" step="any" [(ngModel)]="meas.value"
                     class="rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Notes (optional)</span>
              <input [(ngModel)]="meas.notes" placeholder="e.g. measured after treatment"
                     class="rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
            </label>
          </div>
          <button (click)="addMeasurement()" [disabled]="busyMeas"
                  class="mt-4 cursor-pointer rounded-lg bg-accent-500 px-6 py-3 font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50">
            {{ busyMeas ? 'Saving…' : 'Record measurement' }}
          </button>
          <p *ngIf="measMsg" class="mb-0 mt-2 text-sm" [class]="measOk ? 'text-accent-700' : 'text-red-600'">{{ measMsg }}</p>
        </div>

        <!-- History -->
        <div class="card p-6">
          <h3 class="mb-3 text-lg font-bold">History and trend</h3>
          <div class="flex flex-wrap items-center gap-3">
            <input [(ngModel)]="historyHealthId" placeholder="Health ID to view history"
                   class="min-w-50 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <button (click)="loadMeasurements()"
                    class="cursor-pointer rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-primary-400">
              View history
            </button>
          </div>

          <table *ngIf="measurementHistory.length" class="mt-4 w-full overflow-hidden rounded-lg">
            <thead>
              <tr class="bg-ink text-left text-white">
                <th class="px-3 py-2.5 text-sm font-semibold">Date</th>
                <th class="px-3 py-2.5 text-sm font-semibold">Type</th>
                <th class="px-3 py-2.5 text-sm font-semibold">Value</th>
                <th class="px-3 py-2.5 text-sm font-semibold">By</th>
                <th class="px-3 py-2.5 text-sm font-semibold">Hospital</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let m of measurementHistory" class="border-b border-gray-100 last:border-b-0 hover:bg-primary-50/50">
                <td class="px-3 py-2.5 text-sm">{{ m.created_at | date:'short' }}</td>
                <td class="px-3 py-2.5 text-sm font-semibold">{{ m.kind }}</td>
                <td class="px-3 py-2.5 text-sm">{{ m.value }} {{ m.unit }}</td>
                <td class="px-3 py-2.5 text-sm">{{ m.doctor || '—' }}</td>
                <td class="px-3 py-2.5 text-sm">{{ m.hospital || '—' }}</td>
              </tr>
            </tbody>
          </table>
          <p *ngIf="historyLoaded && measurementHistory.length === 0" class="py-6 text-center text-muted italic">
            No measurements recorded for this patient.
          </p>

          <!-- TREND CHART -->
          <div *ngIf="measurementHistory.length" class="mt-6 border-t border-gray-100 pt-5">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 class="m-0 font-bold text-ink">Trend over time</h4>
              <select [(ngModel)]="trendKind"
                      class="rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm">
                <option *ngFor="let k of trendKinds" [value]="k">{{ k }}</option>
              </select>
            </div>
            <div class="flex flex-wrap items-end gap-6">
              <div>
                <p class="m-0 text-3xl font-bold text-ink">
                  {{ trendLatest?.value }}
                  <span class="text-base font-normal text-muted">{{ trendLatest?.unit }}</span>
                </p>
                <p class="m-0 text-xs text-muted">latest of {{ trendPoints.length }} reading(s)</p>
              </div>
              <svg viewBox="0 0 300 120" class="h-32 w-full max-w-md" preserveAspectRatio="none">
                <polygon [attr.points]="trendAreaPoints()" fill="#82B440" opacity="0.15"></polygon>
                <polyline [attr.points]="trendLinePoints()" fill="none" stroke="#82B440"
                          stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></polyline>
                <circle *ngFor="let p of trendCircles" [attr.cx]="p.x" [attr.cy]="p.y"
                        r="3.5" fill="#82B440"></circle>
              </svg>
            </div>
            <p *ngIf="trendPoints.length < 2" class="mb-0 mt-2 text-xs text-muted">
              One reading of this type so far — the line appears with the second one.
            </p>
          </div>
        </div>
      </div>

      <!-- ================= MY REQUESTS ================= -->
      <div *ngIf="tab === 'requests'" class="animate-fade-in">
        <h2 class="mb-1 text-xl font-bold">My Access Requests</h2>
        <p class="mb-4 text-sm text-muted">
          Every request you've sent, with the patient's response. Approved requests unlock
          the patient's records and add them to My Patients.
        </p>
        <div *ngFor="let r of myRequests" class="card mb-3 flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p class="m-0 font-bold text-ink">{{ r.patient_name }} <span class="text-sm font-normal text-muted">({{ r.patient_health_id }})</span></p>
            <p class="m-0 text-sm text-muted">{{ r.reason || 'No reason given' }} · {{ r.created_at | date:'medium' }}</p>
            <p *ngIf="r.responded_at" class="m-0 text-xs text-muted">responded {{ r.responded_at | date:'short' }}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="rounded-full px-3 py-1 text-xs font-bold"
                  [class]="r.status === 'APPROVED' ? 'bg-accent-500 text-white'
                    : r.status === 'REJECTED' ? 'bg-red-500 text-white'
                    : 'bg-primary-300 text-ink'">{{ r.status === 'PENDING' ? 'Awaiting patient' : r.status }}</span>
            <button *ngIf="r.status === 'APPROVED' && r.patient_health_id" (click)="healthId = r.patient_health_id; setTab('find'); viewRecord()"
                    class="cursor-pointer rounded-lg bg-primary-500 px-3.5 py-2 text-sm font-bold text-ink transition-colors hover:bg-primary-400">
              Open records
            </button>
          </div>
        </div>
        <div *ngIf="myRequests.length === 0" class="card p-10 text-center">
          <h3 class="mb-1 text-lg font-bold">No requests yet</h3>
          <p class="m-0 text-muted">Use Find Patient, then Request access. The patient's response shows here.</p>
        </div>
      </div>

      <!-- ================= REFERRALS ================= -->
      <div *ngIf="tab === 'referrals'" class="animate-fade-in">
        <h2 class="mb-1 text-xl font-bold">Refer a Patient to Another Hospital</h2>
        <p class="mb-4 text-sm text-muted">The receiving hospital's staff or doctors accept or decline — every response is audited.</p>

        <div class="card mb-6 p-6">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Patient Health ID</span>
              <input [(ngModel)]="referral.health_id" placeholder="e.g. HTD-2024-001"
                     class="rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Send to hospital</span>
              <select [(ngModel)]="referral.to_hospital"
                      class="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm">
                <option value="" disabled>Select hospital…</option>
                <option *ngFor="let h of hospitals" [value]="h.code">
                  {{ h.name }}<span *ngIf="h.region"> — {{ h.region }}</span>
                  <span *ngIf="h.code === myHospitalCode"> (your hospital)</span>
                </option>
              </select>
            </label>
            <label class="flex flex-col gap-1.5 sm:col-span-2">
              <span class="text-[13px] font-semibold text-ink">Reason / diagnosis summary</span>
              <textarea [(ngModel)]="referral.reason" rows="2"
                        placeholder="e.g. needs specialist oncology review not available here"
                        class="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"></textarea>
            </label>
          </div>
          <button (click)="sendReferral()" [disabled]="busyRef || !referral.to_hospital"
                  class="mt-4 cursor-pointer rounded-lg bg-accent-500 px-6 py-3 font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50">
            {{ busyRef ? 'Sending…' : 'Send referral' }}
          </button>
          <p *ngIf="refMsg" class="mb-0 mt-2 text-sm" [class]="refOk ? 'text-accent-700' : 'text-red-600'">{{ refMsg }}</p>
        </div>

        <!-- Incoming to my hospital -->
        <div *ngIf="incomingAll.length" class="mb-6">
          <h3 class="mb-3 text-lg font-bold">Incoming — {{ hospitalName || 'my hospital' }}</h3>
          <div *ngFor="let r of incomingAll" class="card mb-3 flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p class="m-0 font-bold text-ink">{{ r.patient_name }} <span class="text-sm font-normal text-muted">({{ r.patient_health_id }})</span></p>
              <p class="m-0 text-sm text-muted">from {{ r.from_hospital }}<span *ngIf="r.from_doctor"> · Dr. {{ r.from_doctor }}</span> · {{ r.reason || 'no reason given' }}</p>
            </div>
            <div class="flex gap-2">
              <button (click)="respondIncoming(r, 'ACCEPTED')" [disabled]="busyIncoming === r.id"
                      class="cursor-pointer rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50">Accept</button>
              <button (click)="respondIncoming(r, 'DECLINED')" [disabled]="busyIncoming === r.id"
                      class="cursor-pointer rounded-lg border-2 border-red-500 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500 hover:text-white disabled:opacity-50">Decline</button>
            </div>
          </div>
        </div>

        <h3 class="mb-3 text-lg font-bold">Referrals I've sent</h3>
        <div *ngFor="let r of referralsSent" class="card mb-3 flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p class="m-0 font-bold text-ink">{{ r.patient_name }} <span class="text-sm font-normal text-muted">({{ r.patient_health_id }})</span></p>
            <p class="m-0 text-sm text-muted">to {{ r.to_hospital }} · {{ r.reason || 'no reason given' }}</p>
          </div>
          <span class="rounded-full px-3 py-1 text-xs font-bold" [class]="referralBadge(r.status)">{{ r.status }}</span>
        </div>
        <div *ngIf="referralsSent.length === 0" class="card p-8 text-center">
          <p class="m-0 text-muted italic">No referrals sent yet.</p>
        </div>
      </div>

      <!-- ================= BLOCKCHAIN TRANSACTIONS ================= -->
      <div *ngIf="tab === 'transactions'" class="animate-fade-in">
        <h2 class="mb-1 text-xl font-bold">Blockchain Transaction History</h2>
        <p class="mb-4 text-sm text-muted">
          All on-chain transactions for {{ hospitalName || 'your hospital' }}. Filter by event type or patient Health ID.
          Every transaction is verifiable on Etherscan.
        </p>

        <!-- Filters -->
        <div class="card mb-5 p-5">
          <div class="flex flex-wrap gap-3">
            <select [(ngModel)]="txFilterEvent" (ngModelChange)="applyTxFilter()"
                    class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
              <option value="">All Event Types</option>
              <option value="RecordAdded">Record Added</option>
              <option value="AccessGranted">Access Granted</option>
              <option value="AccessRevoked">Access Revoked</option>
              <option value="RecordViewed">Record Viewed</option>
              <option value="BreakGlassUsed">Break-Glass Used</option>
              <option value="EmergencyAccessGranted">Emergency Access</option>
            </select>
            <input [(ngModel)]="txFilterHealthId" (ngModelChange)="applyTxFilter()"
                   placeholder="Filter by Health ID (optional)"
                   class="min-w-50 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <button (click)="clearTxFilter()"
                    class="cursor-pointer rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink">
              Clear Filters
            </button>
          </div>
        </div>

        <div class="card overflow-hidden">
          <table *ngIf="filteredTransactions.length" class="w-full">
            <thead>
              <tr class="bg-ink text-left text-white">
                <th class="px-4 py-3 text-sm font-semibold">Date</th>
                <th class="px-4 py-3 text-sm font-semibold">Event Type</th>
                <th class="px-4 py-3 text-sm font-semibold">Transaction Hash</th>
                <th class="px-4 py-3 text-sm font-semibold">Block</th>
                <th class="px-4 py-3 text-sm font-semibold">Details</th>
                <th class="px-4 py-3 text-sm font-semibold">Verify</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let tx of filteredTransactions" class="border-b border-gray-100 last:border-b-0 hover:bg-primary-50/50">
                <td class="px-4 py-3 text-sm">{{ tx.timestamp ? (tx.timestamp * 1000 | date:'short') : '—' }}</td>
                <td class="px-4 py-3">
                  <span class="rounded-full px-2.5 py-0.5 text-xs font-bold"
                        [class]="eventBadge(tx.event)">{{ formatEventName(tx.event) }}</span>
                </td>
                <td class="px-4 py-3">
                  <code class="text-xs font-mono">{{ tx.transaction_hash | slice:0:20 }}…</code>
                </td>
                <td class="px-4 py-3 text-sm font-mono">{{ tx.block_number }}</td>
                <td class="px-4 py-3 text-xs text-muted">
                  <div *ngFor="let arg of eventArgs(tx.args)">{{ arg.key }}: <span class="text-ink">{{ arg.value }}</span></div>
                </td>
                <td class="px-4 py-3">
                  <a [href]="tx.etherscan_url" target="_blank" rel="noopener"
                     class="rounded bg-white px-2 py-1 text-xs font-mono text-accent-700 underline shadow-sm hover:bg-primary-50">
                    View on Etherscan
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
          <div *ngIf="filteredTransactions.length === 0 && transactions.length > 0" class="p-10 text-center">
            <h3 class="mb-1 text-lg font-bold">No transactions match your filters</h3>
            <p class="m-0 text-muted">Try adjusting your filters or clearing them.</p>
          </div>
          <div *ngIf="transactions.length === 0" class="p-10 text-center">
            <h3 class="mb-1 text-lg font-bold">No blockchain transactions yet</h3>
            <p class="m-0 text-muted">Transactions appear here when records are added, access is granted, or data is viewed.</p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class DoctorLandingComponent implements OnDestroy, OnInit {
  tab: 'patients' | 'find' | 'measurements' | 'referrals' | 'requests' | 'transactions' = 'patients';
  tabs = [
    { id: 'patients', label: 'My Patients' },
    { id: 'find', label: 'Find Patient' },
    { id: 'measurements', label: 'Measurements' },
    { id: 'referrals', label: 'Referrals' },
    { id: 'requests', label: 'My Requests' },
    { id: 'transactions', label: 'Blockchain Transactions' },
  ] as const;

  license = '';
  hospitalName = '';
  myHospitalCode = '';

  // patients
  patients: AssignedPatient[] = [];
  loadingPatients = false;

  // find patient
  healthId = '';
  requestReason = '';
  viewedName = '';
  viewedHealthId = '';
  records: PatientRecord[] = [];
  denied = false;
  requestSent = false;
  loading = false;

  // my access requests (patient responses)
  myRequests: AccessRequest[] = [];
  pendingRequestCount = 0;

  // measurements
  measurementKinds = [
    'Blood pressure (systolic)', 'Blood pressure (diastolic)', 'Heart rate',
    'Temperature', 'Blood sugar', 'SpO2', 'Weight', 'Hemoglobin', 'Malaria RDT',
  ];
  meas = { health_id: '', kind: this.measurementKinds[0], value: null as number | null, unit: '', notes: '' };
  busyMeas = false;
  measMsg = '';
  measOk = false;
  historyHealthId = '';
  measurementHistory: MeasurementItem[] = [];
  historyLoaded = false;

  // referrals
  hospitals: HospitalOption[] = [];
  referral = { health_id: '', to_hospital: '', reason: '' };
  busyRef = false;
  refMsg = '';
  refOk = false;
  referralsSent: ReferralItem[] = [];

  // incoming referral notifications (toasts + referrals tab)
  incomingAll: ReferralItem[] = [];
  incomingToasts: ReferralItem[] = [];
  pendingIncoming = 0;
  busyIncoming: number | null = null;
  private dismissedReferrals = new Set<number>();
  private referralTimer: any = null;

  // blockchain transactions
  transactions: BlockchainEvent[] = [];

  // measurement trend chart
  trendKind = '';

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  /** Angular 22 is zoneless by default — re-render after async mutations. */
  private syncView() {
    this.cdr.detectChanges();
  }

  setTab(id: 'patients' | 'find' | 'measurements' | 'referrals' | 'requests' | 'transactions') {
    this.tab = id;
    if (id === 'requests') void this.loadMyRequests();
    if (id === 'transactions') void this.loadTransactions();
    this.syncView();
  }

  async ngOnInit() {
    if (!this.auth.isDoctor) {
      // Not signed in — the route guard normally prevents this.
      return;
    }
    this.license = this.auth.licenseNo;
    this.myHospitalCode = this.auth.hospitalCode;
    try {
      const me = await this.api.doctorMe();
      this.hospitalName = me.hospital_name || me.hospital_code;
    } catch { /* keep code label */ }

    this.hospitals = await this.api.hospitals().catch(() => [] as HospitalOption[]);
    this.syncView();

    await this.loadPatients();
    await this.loadReferralsSent();
    await this.loadMyRequests();
    this.startReferralPolling();
  }

  /** Poll patient responses so an approval unlocks records without a refresh. */
  private async pollMyRequests() {
    const before = this.pendingRequestCount;
    try {
      this.myRequests = await this.api.doctorPendingRequests();
      this.pendingRequestCount = this.myRequests.filter((r) => r.status === 'PENDING').length;
    } catch {
      return; // offline tick
    }
    if (this.pendingRequestCount < before && this.healthId.trim()) {
      // A request was just answered — re-check access to this patient.
      await this.viewRecord();
      await this.loadPatients();
    }
    this.syncView();
  }

  ngOnDestroy() {
    if (this.referralTimer) clearInterval(this.referralTimer);
  }

  /** Poll referrals addressed to my hospital so toasts appear live. */
  private startReferralPolling() {
    this.referralTimer = setInterval(() => {
      void this.refreshIncoming();
      void this.pollMyRequests();
    }, 15000);
  }

  async loadMyRequests() {
    try {
      this.myRequests = await this.api.doctorPendingRequests();
      this.pendingRequestCount = this.myRequests.filter((r) => r.status === 'PENDING').length;
    } catch {
      this.myRequests = [];
    }
    this.syncView();
  }

  async refreshIncoming() {
    try {
      this.incomingAll = await this.api.incomingReferrals();
      this.incomingToasts = this.incomingAll.filter((r) => !this.dismissedReferrals.has(r.id));
      this.pendingIncoming = this.incomingAll.length;
    } catch {
      // offline tick — retry on the next cycle
    }
    this.syncView();
  }

  dismissReferral(id: number) {
    this.dismissedReferrals.add(id);
    this.incomingToasts = this.incomingToasts.filter((r) => r.id !== id);
    this.syncView();
  }

  async respondIncoming(r: ReferralItem, action: 'ACCEPTED' | 'DECLINED') {
    this.busyIncoming = r.id;
    this.syncView();
    try {
      await this.api.respondReferral(r.id, action);
      await this.refreshIncoming();
      await this.loadReferralsSent();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    } finally {
      this.busyIncoming = null;
      this.syncView();
    }
  }

  unitsFor(kind: string): string {
    if (kind.startsWith('Blood pressure')) return 'mmHg';
    if (kind === 'Heart rate') return 'bpm';
    if (kind === 'Temperature') return '°C';
    if (kind === 'Blood sugar') return 'mmol/L';
    if (kind === 'SpO2') return '%';
    if (kind === 'Weight') return 'kg';
    if (kind === 'Hemoglobin') return 'g/dL';
    return '';
  }

  setUnit() {
    this.meas.unit = this.unitsFor(this.meas.kind);
  }

  async loadPatients() {
    this.loadingPatients = true;
    this.syncView();
    try {
      this.patients = await this.api.myPatients();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed to load patients'));
    } finally {
      this.loadingPatients = false;
      this.syncView();
    }
  }

  openPatient(p: AssignedPatient) {
    this.healthId = p.health_id;
    this.tab = 'find';
    this.syncView();
    void this.viewRecord();
  }

  async viewRecord() {
    if (!this.healthId.trim()) return;
    this.loading = true;
    this.denied = false;
    this.requestSent = false;
    this.records = [];
    this.viewedName = '';
    this.viewedHealthId = '';
    this.syncView();
    try {
      const res = await this.api.doctorViewRecord(this.healthId.trim());
      this.viewedName = res.full_name;
      this.viewedHealthId = res.health_id;
      this.records = res.records || [];
    } catch (e: any) {
      if (e?.status === 403) {
        this.denied = true;
      } else {
        alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
      }
    } finally {
      this.loading = false;
      this.syncView();
    }
  }

  /** Status of this doctor's request for the health ID currently being viewed. */
  requestStatusFor(healthId: string): string | null {
    const id = healthId.trim().toLowerCase();
    const req = this.myRequests.find(
      (r) => (r.patient_health_id || '').trim().toLowerCase() === id
    );
    return req ? req.status || 'PENDING' : null;
  }

  async requestAccess() {
    try {
      await this.api.requestAccess({
        health_id: this.healthId.trim(),
        reason: this.requestReason || 'Clinical care',
      });
      this.requestSent = true;
      this.denied = false;
      this.requestReason = '';
      await this.loadMyRequests();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    }
    this.syncView();
  }

  async breakGlass() {
    const reason = this.requestReason.trim();
    if (!reason) {
      alert('A reason is required for break-glass access.');
      return;
    }
    if (!confirm('Use break-glass? This emergency access will be permanently logged on-chain.')) return;
    try {
      await this.api.breakGlass({
        health_id: this.healthId.trim(),
        facility_id: this.myHospitalCode || 'UNKNOWN',
        reason,
      });
      alert('Emergency access granted for 1 hour and logged on-chain.');
      await this.viewRecord();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    }
    this.syncView();
  }

  async addMeasurement() {
    this.measMsg = '';
    this.measOk = false;
    this.setUnit();
    if (!this.meas.health_id.trim() || this.meas.value === null || isNaN(this.meas.value)) {
      this.measMsg = 'Health ID and a numeric value are required.';
      this.syncView();
      return;
    }
    this.busyMeas = true;
    this.syncView();
    try {
      const res: any = await this.api.addMeasurement({
        health_id: this.meas.health_id.trim(),
        kind: this.meas.kind,
        value: this.meas.value,
        unit: this.meas.unit,
        notes: this.meas.notes,
      });
      this.measOk = true;
      this.measMsg = res.message || 'Measurement recorded.';
      this.meas = { health_id: this.meas.health_id, kind: this.measurementKinds[0], value: null, unit: '', notes: '' };
      if (this.historyHealthId.trim().toLowerCase() === this.meas.health_id.trim().toLowerCase()) {
        await this.loadMeasurements();
      }
    } catch (e: any) {
      this.measMsg = e?.error?.error || e?.message || 'Failed to record measurement';
    } finally {
      this.busyMeas = false;
      this.syncView();
    }
  }

  async loadMeasurements() {
    if (!this.historyHealthId.trim()) return;
    try {
      this.measurementHistory = await this.api.patientMeasurements(this.historyHealthId.trim());
      this.historyLoaded = true;
      const kinds = this.trendKinds;
      if (!kinds.includes(this.trendKind)) this.trendKind = kinds[0] || '';
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed to load measurements'));
    }
    this.syncView();
  }

  async sendReferral() {
    this.refMsg = '';
    this.refOk = false;
    if (!this.referral.health_id.trim() || !this.referral.to_hospital) {
      this.refMsg = 'Health ID and target hospital are required.';
      this.syncView();
      return;
    }
    this.busyRef = true;
    this.syncView();
    try {
      const res: any = await this.api.createReferral({
        health_id: this.referral.health_id.trim(),
        to_hospital: this.referral.to_hospital,
        reason: this.referral.reason,
      });
      this.refOk = true;
      this.refMsg = res.message || 'Referral sent.';
      this.referral = { health_id: '', to_hospital: '', reason: '' };
      await this.loadReferralsSent();
    } catch (e: any) {
      this.refMsg = e?.error?.error || e?.message || 'Failed to send referral';
    } finally {
      this.busyRef = false;
      this.syncView();
    }
  }

  async loadReferralsSent() {
    try {
      this.referralsSent = await this.api.myReferralsSent();
    } catch {
      this.referralsSent = [];
    }
    this.syncView();
  }

  /** Load blockchain transaction history for this doctor's hospital. */
  private async loadTransactions() {
    try {
      const res = await this.api.blockchainEvents();
      this.transactions = res.events;
    } catch (e: any) {
      console.error('Failed to load transactions:', e);
      this.transactions = [];
    }
    this.syncView();
  }

  // ---------- Measurement trend chart ----------

  get trendKinds(): string[] {
    return [...new Set(this.measurementHistory.map((m) => m.kind))];
  }

  get trendPoints(): MeasurementItem[] {
    return this.measurementHistory
      .filter((m) => m.kind === this.trendKind)
      .sort((a, b) => +new Date(a.created_at || 0) - +new Date(b.created_at || 0));
  }

  get trendLatest(): MeasurementItem | null {
    const pts = this.trendPoints;
    return pts.length ? pts[pts.length - 1] : null;
  }

  /** SVG coordinates (viewBox 0 0 300 120) for the trend polyline. */
  private trendCoords(): { x: number; y: number }[] {
    const pts = this.trendPoints;
    if (!pts.length) return [];
    const values = pts.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const step = pts.length > 1 ? 280 / (pts.length - 1) : 0;
    return pts.map((p, i) => ({
      x: 10 + i * step,
      y: 105 - ((p.value - min) / span) * 90,
    }));
  }

  trendLinePoints(): string {
    return this.trendCoords().map((c) => `${c.x},${c.y}`).join(' ');
  }

  trendAreaPoints(): string {
    const c = this.trendCoords();
    if (c.length < 2) return '';
    return `${c[0].x},115 ${c.map((p) => `${p.x},${p.y}`).join(' ')} ${c[c.length - 1].x},115`;
  }

  get trendCircles(): { x: number; y: number }[] {
    return this.trendCoords();
  }

  referralBadge(status: string): string {
    switch (status) {
      case 'ACCEPTED':  return 'bg-accent-500 text-white';
      case 'DECLINED':  return 'bg-red-500 text-white';
      case 'CANCELLED': return 'bg-gray-200 text-ink';
      default:          return 'bg-primary-300 text-ink'; // PENDING
    }
  }

  entries(data: any): { key: string; value: any }[] {
    if (!data) return [];
    return Object.entries(data).map(([key, value]) => ({ key, value }));
  }
}
