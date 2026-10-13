import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { NgIf, NgFor, DatePipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  AccessRequest, ApiService, AssignedPatient, DoctorDashboard, HospitalOption, HospitalPatientItem, MeasurementItem, PatientRecord, ReferralItem,
  BlockchainEvent,
} from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';
import { RecordChartComponent, RecordChartPoint } from '../../../components/shared/record-chart/record-chart.component';
import { DashboardGaugeComponent } from '../../../components/shared/dashboard-gauge/dashboard-gauge.component';
import { WorkspaceStateService } from '../../../services/workspace-state.service';

/**
 * Doctor workspace (PIN-login, JWT-identified).
 * Clean typographic design matching the landing page — no decorative glyphs.
 * - My Patients: everyone who granted this doctor access, with liveness.
 * - Dashboard: practice-wide stats and charts — every doctor at every
 *   hospital sees the same overview, scoped to their own patients.
 * - Patient detail: records, measurements (add new), referral to another
 *   hospital via a dropdown, plus the full access-request / break-glass flow.
 */
@Component({
  selector: 'app-doctor-dashboard',
  imports: [NgIf, NgFor, DatePipe, SlicePipe, FormsModule, RecordChartComponent, DashboardGaugeComponent],
  styles: [`:host { display: block; width: 100%; }`],
  template: `
    <!-- Full-width shell: sidebar hugs the left edge; content fills the rest. -->
    <div class="flex min-h-screen w-full items-stretch gap-0 bg-slate-50">
      <!-- Mobile backdrop for the sidebar drawer -->
      <div *ngIf="sidebarOpen" (click)="sidebarOpen = false" aria-hidden="true"
           class="fixed inset-0 z-[60] bg-ink/50 lg:hidden"></div>

      <!-- ================= SIDEBAR NAV ================= -->
      <aside
        [class.translate-x-0]="sidebarOpen"
        [class.-translate-x-full]="!sidebarOpen"
        class="fixed inset-y-0 left-0 z-[70] w-64 max-w-[80vw] overflow-y-auto bg-white p-5 shadow-xl transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:block lg:min-h-screen lg:w-56 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:rounded-none lg:p-6 lg:border-r lg:border-slate-200">
        <div class="mb-4 flex items-center justify-between lg:hidden">
          <span class="eyebrow">Workspace</span>
          <button (click)="sidebarOpen = false" aria-label="Close menu"
                  class="cursor-pointer border-none bg-transparent text-xl leading-none text-slate-500 hover:text-slate-900 hover:bg-slate-100">×</button>
        </div>

        <div class="mb-8 hidden items-center gap-3 lg:flex">
          <div><p class="m-0 text-base font-bold text-slate-900">AfyaTrust</p><p class="m-0 text-[11px] text-slate-500">Clinical workspace</p></div>
        </div>
        <p class="mb-2 hidden px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 lg:block">Workspace</p>

        <nav class="flex flex-col gap-1" aria-label="Dashboard sections">
          <button *ngFor="let t of tabs" type="button" (click)="setTab(t.id)"
                  class="flex cursor-pointer items-center justify-between gap-2 rounded-lg border-none px-3.5 py-2.5 text-left text-[15px] transition-colors"
                  [class]="tab === t.id ? 'bg-primary-500 text-white font-semibold shadow-sm' : 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'"
                  [attr.aria-current]="tab === t.id ? 'page' : null">
            <span>{{ t.label }}</span>
            <span *ngIf="t.id === 'referrals' && pendingIncoming > 0"
                  class="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{{ pendingIncoming }}</span>
            <span *ngIf="t.id === 'requests' && pendingRequestCount > 0"
                  class="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{{ pendingRequestCount }}</span>
          </button>
        </nav>        <div class="mt-4 hidden border-t border-gray-100 pt-3 text-xs text-muted lg:block">
          <span *ngIf="hospitalName">{{ hospitalName }}</span>
          <span *ngIf="!hospitalName">Clinical workspace</span>
        </div>

        <!-- BOTTOM ACTIONS -->
        <div class="mt-6 pt-4 border-t border-slate-200 space-y-2">
          <a class="inline-flex w-full min-h-11 items-center justify-center rounded-lg border border-primary-600 bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600" target="_blank" rel="noopener" href="https://sepolia.etherscan.io/address/0x142F4871c1D1c1999A8D1d9fbAD6Bbff4bDc92ED">
            View on Etherscan
          </a>
          <button (click)="logoutAndRedirect()"
                  class="btn-logout w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all duration-200 group">
            <span class="font-medium">Sign Out</span>
            <span aria-hidden="true" class="text-lg leading-none transition-transform group-hover:translate-x-0.5">→</span>
          </button>
        </div>
      </aside>


        <div class="mx-auto w-full min-w-0 max-w-[1480px] flex-1 px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
          <div *ngIf="feedbackMessage" role="status" aria-live="polite"
               class="fixed right-4 top-4 z-[100] flex max-w-[calc(100vw-2rem)] items-start gap-3 border px-4 py-3 shadow-lg sm:right-6 sm:top-6 sm:max-w-md"
               [class]="feedbackError ? 'border-red-200 bg-red-50 text-red-800' : 'border-primary-200 bg-primary-50 text-primary-900'">
            <p class="m-0 flex-1 text-sm font-medium">{{ feedbackMessage }}</p>
            <button type="button" (click)="feedbackMessage = ''" aria-label="Dismiss message" class="min-h-6 border-0 bg-transparent px-1 text-lg leading-none">×</button>
          </div>
          <header class="mb-7 flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div class="flex min-w-0 items-center gap-3">
              <button type="button" (click)="sidebarOpen = true" aria-label="Open navigation" [attr.aria-expanded]="sidebarOpen"
                      class="flex h-10 w-10 shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white lg:hidden">
                <span class="h-0.5 w-5 rounded bg-ink"></span><span class="h-0.5 w-5 rounded bg-ink"></span>
              </button>
              <div class="min-w-0">
                <p class="m-0 hidden text-[10px] font-bold uppercase tracking-[0.16em] text-primary-700 sm:block">AfyaTrust · Care operations</p>
                <p class="m-0 truncate text-base font-bold text-slate-900 sm:text-lg">{{ currentTabLabel }}</p>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-2 sm:gap-3">
              <span class="hidden rounded-full border border-accent-200 bg-accent-50 px-3 py-1.5 text-xs font-semibold text-accent-800 sm:inline-flex">Verified clinician</span>
              <div class="hidden text-right sm:block"><p class="m-0 text-xs font-semibold text-slate-800">Dr. {{ auth.fullName }}</p><p class="m-0 text-[11px] text-slate-500">{{ hospitalName || 'Clinical practice' }}</p></div>
            </div>
          </header>

      <!-- LAST ON-CHAIN ACTION (break-glass, etc.) — Etherscan-verifiable -->
      <div *ngIf="lastTx" class="mb-6 rounded-2xl border-l-4 p-5 bg-white shadow-sm border border-slate-100"
           [class]="lastTx.pending ? 'border-l-orange-500' : 'border-l-red-500'">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="m-0 text-sm font-bold text-ink">{{ lastTx.label }}</h2>
            <p class="m-0 text-xs text-muted">
              {{ lastTx.pending
                ? 'Transaction submitted — the BreakGlassUsed event will appear in your Blockchain Transactions tab shortly.'
                : 'Permanently logged on-chain — verify it on Etherscan.' }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <code class="rounded bg-gray-100 px-2 py-1 font-mono text-xs">{{ lastTx.tx_hash | slice:0:20 }}…</code>
            <a *ngIf="!isPendingTx(lastTx.tx_hash)"
               [href]="etherscanUrl(lastTx.tx_hash)" target="_blank" rel="noopener"
               class="btn-secondary text-sm">
              View on Etherscan
            </a>
            <button (click)="lastTx = null" aria-label="Dismiss"
                    class="cursor-pointer border-none bg-transparent text-lg leading-none text-slate-500 hover:text-slate-900 hover:bg-slate-100">×</button>
          </div>
        </div>
      </div>

      <!-- INCOMING REFERRAL TOASTS (poll-fed) -->
      <div class="fixed top-20 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
        <div *ngFor="let n of incomingToasts" class="card animate-fade-in border-l-4 border-accent-500 p-4">
          <div class="mb-1 flex items-center justify-between gap-2">
            <span class="text-sm font-bold text-ink">Referral received</span>
            <button (click)="dismissReferral(n.id)" aria-label="Dismiss"
                    class="cursor-pointer border-none bg-transparent text-xl leading-none text-slate-500 hover:text-slate-900 hover:bg-slate-100">×</button>
          </div>
          <p class="m-0 text-sm text-ink">
            <strong>{{ n.patient_name }}</strong> ({{ n.patient_health_id }}) sent from
            <strong>{{ n.from_hospital }}</strong>
            <span *ngIf="n.from_doctor" class="block">by Dr. {{ n.from_doctor }}</span>
          </p>
          <p *ngIf="n.reason" class="mb-0 mt-1 rounded-md bg-primary-50 px-2 py-1.5 text-[13px] italic text-muted">{{ n.reason }}</p>
          <div class="mt-3 flex gap-2">
            <button (click)="respondIncoming(n, 'ACCEPTED')" [disabled]="busyIncoming === n.id"
                    class="btn-primary">Accept</button>
            <button (click)="respondIncoming(n, 'DECLINED')" [disabled]="busyIncoming === n.id"
                    class="flex-1 cursor-pointer rounded-lg border-2 border-red-500 px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500 hover:text-white disabled:opacity-50">Decline</button>
          </div>
        </div>
      </div>

      <!-- ================= DASHBOARD (overview + charts) ================= -->
      <div *ngIf="tab === 'dashboard'" class="animate-fade-in">
        <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p class="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-primary-700">Practice overview</p>
            <h1 class="m-0 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Your care at a glance</h1>
            <p class="mb-0 mt-1 text-sm text-muted">A live view of your patients, clinical activity, and care coordination.</p>
          </div>
          <button (click)="loadDashboard()" [disabled]="loadingDashboard"
                  class="btn-secondary">
            {{ loadingDashboard ? 'Updating…' : 'Refresh' }}
          </button>
        </div>

        <!-- STAT CARDS -->
        <div class="mb-6 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div class="doctor-overview-stat">
            <div class="mb-5 flex items-center justify-between"><span class="doctor-overview-icon"><svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></span><span class="doctor-stat-tag">Care team</span></div>
            <p class="doctor-stat-label">Patients under your care</p><div class="flex items-end justify-between gap-2"><p class="doctor-stat-value">{{ loadingDashboard ? '…' : (dashboard?.total_patients ?? 0) }}</p><span class="mb-1 text-xs font-semibold text-primary-700">{{ dashboard?.active_patients ?? 0 }} active</span></div>
          </div>
          <div class="doctor-overview-stat">
            <div class="mb-5 flex items-center justify-between"><span class="doctor-overview-icon"><svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg></span><span class="doctor-stat-tag">Clinical</span></div>
            <p class="doctor-stat-label">Measurements recorded</p><p class="doctor-stat-value">{{ loadingDashboard ? '…' : (dashboard?.total_measurements ?? 0) }}</p>
          </div>
          <div class="doctor-overview-stat">
            <div class="mb-5 flex items-center justify-between"><span class="doctor-overview-icon"><svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v18M3 12h18"/></svg></span><span class="doctor-stat-tag">Audit trail</span></div>
            <p class="doctor-stat-label">Recorded care actions</p><p class="doctor-stat-value">{{ loadingDashboard ? '…' : (dashboard?.total_actions ?? 0) }}</p>
          </div>
          <div class="doctor-overview-stat">
            <div class="mb-5 flex items-center justify-between"><span class="doctor-overview-icon"><svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span><span class="doctor-stat-tag">Coordination</span></div>
            <p class="doctor-stat-label">Referrals sent</p><div class="flex items-end justify-between gap-2"><p class="doctor-stat-value">{{ loadingDashboard ? '…' : (dashboard?.referrals?.sent ?? 0) }}</p><span class="mb-1 text-xs font-semibold text-amber-700">{{ dashboard?.referrals?.incoming_pending ?? 0 }} to review</span></div>
          </div>
        </div>

        <!-- CHARTS -->
        <div class="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
          <div class="xl:col-span-2">
          <app-record-chart
            title="Which diseases exist more (rate)"
            description="Share of your patients whose records mention each condition."
            [data]="diseaseChartData"
            emptyMessage="No diagnosis entries in your patients' records yet." />
          </div>
          <app-dashboard-gauge
            title="Patient access"
            description="Patients with active permission in your care workspace."
            [numerator]="dashboard?.active_patients ?? 0"
            [denominator]="dashboard?.total_patients ?? 0"
            [loading]="loadingDashboard"
            centerLabel="active"
            footer="Access follows patient consent and expiry rules." />
          <app-record-chart
            title="Measurements by type"
            description="Readings you recorded, grouped by measurement kind."
            [data]="measurementKindChartData"
            emptyMessage="No measurements recorded yet." />
          <app-record-chart
            title="Referral activity"
            description="Referrals you sent by status, plus incoming ones awaiting a response."
            [data]="referralChartData"
            emptyMessage="No referrals yet." />
          <app-record-chart
            title="Access requests"
            description="Your requests to view patient records and how patients answered."
            [data]="requestChartData"
            emptyMessage="No access requests yet." />
        </div>

        <div class="mt-5">
          <div class="mb-3 flex items-center justify-between gap-2"><h2 class="m-0 text-sm font-bold text-slate-800">Quick actions</h2><span class="text-xs text-slate-500">Go directly to a task</span></div>
          <div class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button type="button" (click)="setTab('find')" class="doctor-quick-action"><span class="doctor-quick-action-icon">01</span><span class="min-w-0 flex-1"><strong>Find a patient</strong><small>Open a consent-checked record</small></span><span aria-hidden="true" class="text-lg text-primary-700">›</span></button>
            <button type="button" (click)="setTab('measurements')" class="doctor-quick-action"><span class="doctor-quick-action-icon">02</span><span class="min-w-0 flex-1"><strong>Record measurement</strong><small>Add a clinical reading</small></span><span aria-hidden="true" class="text-lg text-primary-700">›</span></button>
            <button type="button" (click)="setTab('referrals')" class="doctor-quick-action"><span class="doctor-quick-action-icon">03</span><span class="min-w-0 flex-1"><strong>Manage referrals</strong><small>{{ dashboard?.referrals?.incoming_pending ?? 0 }} incoming to review</small></span><span aria-hidden="true" class="text-lg text-primary-700">›</span></button>
            <button type="button" (click)="setTab('requests')" class="doctor-quick-action"><span class="doctor-quick-action-icon">04</span><span class="min-w-0 flex-1"><strong>Access requests</strong><small>{{ dashboard?.access_requests?.pending ?? 0 }} awaiting patient response</small></span><span aria-hidden="true" class="text-lg text-primary-700">›</span></button>
          </div>
        </div>
      </div>

      <!-- ================= MY PATIENTS ================= -->
      <div *ngIf="tab === 'patients'" class="animate-fade-in">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-xl font-bold text-slate-900 mb-1">My Patients</h2>
            <p class="m-0 text-sm text-muted">
              Patients who granted you access and patients referred to your hospital.
              Referrals do not grant record access; patient consent or emergency access is still required.
            </p>
          </div>
          <button (click)="loadPatients()" [disabled]="loadingPatients"
                  class="btn-secondary">
            Refresh
          </button>
        </div>

        <button *ngFor="let p of patients" type="button" (click)="openPatient(p)"
             class="card mb-4 flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 p-5 text-left transition-transform hover:-translate-y-0.5">
          <div>
            <p class="m-0 font-bold text-ink">{{ p.full_name }}</p>
            <p class="m-0 text-sm text-muted">Health ID: {{ p.health_id }}</p>
          </div>
          <div class="text-right text-sm">
            <p class="m-0" [class]="p.active ? 'font-bold text-accent-700' : 'font-semibold text-red-600'">
              {{ p.active
                ? (p.source === 'BREAK_GLASS' ? 'Emergency access'
                  : 'Access active')
                : (p.source === 'REFERRAL' ? 'Referral received; access not granted' : 'Access expired or revoked') }}
            </p>
            <p *ngIf="p.expires_at" class="m-0 text-xs text-muted">until {{ p.expires_at | date:'medium' }}</p>
          </div>
        </button>
        <div *ngIf="patients.length === 0 && !loadingPatients" class="card p-10 text-center">
          <h3 class="mb-1 text-lg font-bold">No patients yet</h3>
          <p class="m-0 text-muted">Use Find Patient to request access to a record.</p>
        </div>
      </div>

      <!-- ================= HOSPITAL PATIENTS ================= -->
      <div *ngIf="tab === 'hospital-patients'" class="animate-fade-in">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-xl font-bold text-slate-900 mb-1">Hospital Patients</h2>
            <p class="m-0 text-sm text-muted">
              All patients that received medical care from you at this hospital — based on recorded
              measurements and clinical records. Click a row to open their full history.
            </p>
          </div>
          <button (click)="loadHospitalPatients()" [disabled]="loadingHospitalPatients"
                  class="btn-secondary">
            {{ loadingHospitalPatients ? 'Loading…' : 'Refresh' }}
          </button>
        </div>

        <!-- Search -->
        <div class="mb-4">
          <input [(ngModel)]="hospitalPatientsSearch"
                 placeholder="Search by name, Health ID or hospital…"
                 class="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200" />
        </div>

        <!-- Stats bar -->
        <div *ngIf="hospitalPatients.length" class="mb-4 flex flex-wrap gap-3">
          <span class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
            {{ hospitalPatients.length }} patient{{ hospitalPatients.length === 1 ? '' : 's' }} total
          </span>
          <span class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 shadow-sm">
            {{ hospitalPatients.filter(hp => hp.has_active_access).length }} with active access
          </span>
        </div>

        <!-- Patient table -->
        <div class="card overflow-hidden p-0">
          <div *ngIf="loadingHospitalPatients" class="p-10 text-center">
            <p class="text-sm text-muted">Loading patients…</p>
          </div>

          <div *ngIf="!loadingHospitalPatients && filteredHospitalPatients.length === 0 && hospitalPatients.length === 0"
               class="p-10 text-center">
            <h3 class="mb-2 text-lg font-bold text-slate-800">No care records yet</h3>
            <p class="text-sm text-muted">
              Patients will appear here once you record measurements or
              your hospital anchors clinical records for them.
            </p>
          </div>

          <div *ngIf="!loadingHospitalPatients && hospitalPatients.length > 0 && filteredHospitalPatients.length === 0"
               class="p-8 text-center">
            <p class="text-sm text-muted italic">No patients match your search.</p>
          </div>

          <div class="overflow-x-auto" *ngIf="!loadingHospitalPatients && filteredHospitalPatients.length > 0">
            <table class="w-full">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50">
                  <th class="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Patient</th>
                  <th class="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Health ID</th>
                  <th class="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Hospital</th>
                  <th class="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Measurements</th>
                  <th class="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Records</th>
                  <th class="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Last Care</th>
                  <th class="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Access</th>
                  <th class="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr *ngFor="let p of filteredHospitalPatients"
                    class="group transition-colors hover:bg-primary-50/60">
                  <td class="px-4 py-3">
                    <p class="font-semibold text-slate-900">{{ p.full_name }}</p>
                  </td>
                  <td class="px-4 py-3">
                    <code class="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">{{ p.health_id }}</code>
                  </td>
                  <td class="px-4 py-3 text-sm text-slate-600">{{ p.hospital || '—' }}</td>
                  <td class="px-4 py-3 text-center">
                    <span class="inline-flex items-center justify-center rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-bold text-primary-800">
                      {{ p.measurements_count }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="inline-flex items-center justify-center rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-bold text-accent-800">
                      {{ p.records_count }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm text-slate-600">
                    {{ p.last_care_date ? (p.last_care_date | date:'mediumDate') : '—' }}
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span *ngIf="p.has_active_access"
                          class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                      Active
                    </span>
                    <span *ngIf="!p.has_active_access"
                          class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                      None
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <button type="button" (click)="openPatientFromHospitalList(p)"
                            class="btn-secondary text-xs">
                      View history
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <!-- Totals footer -->
            <div class="border-t border-slate-200 bg-slate-50 px-4 py-3 text-right text-xs text-slate-500">
              Showing {{ filteredHospitalPatients.length }} of {{ hospitalPatients.length }} patient{{ hospitalPatients.length === 1 ? '' : 's' }}
            </div>
          </div>
        </div>
      </div>

      <!-- ================= FIND PATIENT ================= -->
      <div *ngIf="tab === 'find'" class="animate-fade-in">
        <div class="card mb-4 p-6">
          <h2 class="text-xl font-bold text-slate-900 mb-1">Find Patient</h2>
          <p class="mb-4 m-0 text-sm text-muted">Enter a Health ID. Your individual access is checked before any history is shown.</p>
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
              For routine care, request patient approval. If this is an emergency and the patient cannot communicate or consent, document the clinical reason and use emergency access.
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <input [(ngModel)]="requestReason" placeholder="Reason for access"
                     class="flex-1 rounded-lg border border-primary-300 px-3 py-2 text-sm" />
              <button (click)="requestAccess()" [disabled]="requestStatusFor(healthId) === 'PENDING'"
                      class="btn-primary">
                {{ requestStatusFor(healthId) === 'PENDING' ? 'Request awaiting patient' : 'Request access' }}
              </button>
            </div>
            <div class="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <span class="block text-sm font-semibold text-red-900">Emergency reason (required)</span>
              <span class="mt-1 block text-xs text-red-800">
                Explain why the patient cannot communicate or give consent and why immediate access is necessary. The detailed reason stays off-chain; its hash is recorded on-chain for audit.
              </span>
              <label for="emergency-consent-confirm" class="mt-3 flex min-h-11 items-start gap-2 text-sm font-medium text-red-900">
                <input id="emergency-consent-confirm" type="checkbox" [(ngModel)]="emergencyPatientUnableToConsent"
                       class="mt-1 h-4 w-4 rounded border-red-300" />
                <span>I confirm the patient cannot communicate or consent and immediate access is necessary.</span>
              </label>
              <label for="emergency-reason-input" class="mt-3 block text-sm font-semibold text-red-900">Emergency reason</label>
              <textarea id="emergency-reason-input" [(ngModel)]="emergencyReasonInput" rows="3" required
                        placeholder="Explain why immediate access is necessary."
                        class="mt-1 w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-slate-900"
                        [attr.aria-describedby]="'emergency-reason-help' + healthId"></textarea>
              <p [id]="'emergency-reason-help' + healthId" class="mt-1 text-xs text-red-800">The detailed reason stays off-chain; its hash is recorded on-chain for audit.</p>
              <button type="button" (click)="breakGlass()"
                      [disabled]="!emergencyPatientUnableToConsent || !emergencyReasonInput.trim() || emergencyBusy"
                      class="mt-2 min-h-11 cursor-pointer rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50">
                {{ emergencyBusy ? 'Recording emergency access…' : 'Use emergency access for 1 hour' }}
              </button>
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

        <!-- Patient detail (full medical history) -->
        <div *ngIf="viewedName" class="space-y-6">
          <!-- Patient header + referral reason -->
          <div class="card p-6">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="mb-1 flex flex-wrap items-baseline gap-2">
                  <h2 class="text-xl font-bold">{{ viewedName }}</h2>
                  <span class="text-sm text-slate-500">Health ID: {{ viewedHealthId }}</span>
                </div>
                <p class="m-0 text-sm text-muted">Every view of this page is logged on-chain.</p>
              </div>
              <div class="flex flex-col items-end gap-1">
                <span class="rounded-full bg-accent-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent-800">
                  {{ records.length }} records
                </span>
                <span class="rounded-full bg-primary-100 px-3 py-1 text-xs font-bold text-primary-800">
                  {{ measurements.length }} measurements
                </span>
              </div>
            </div>

            <!-- Why this patient was referred to / is under care -->
            <div *ngIf="referrals.length" class="mt-4 p-4 bg-indigo-50 rounded-xl border border-indigo-200">
              <p class="text-xs font-semibold text-indigo-800 uppercase tracking-wide mb-2">Referral context</p>
              <div *ngFor="let r of referrals" class="text-sm">
                <p class="font-semibold text-indigo-900">
                  {{ r.from_hospital }} → {{ r.to_hospital }}
                  <span *ngIf="r.status" class="text-xs text-muted ml-2">({{ r.status }})</span>
                </p>
                <p class="text-slate-700">{{ r.reason || 'No reason recorded' }}</p>
                <p class="text-xs text-muted mt-1">
                  {{ r.created_at | date:'medium' }}
                  <span *ngIf="r.responded_at">· responded {{ r.responded_at | date:'medium' }}</span>
                </p>
              </div>
            </div>

            <!-- Access status -->
            <div class="mt-4 flex flex-wrap items-center gap-3">
              <span class="rounded-full px-3 py-1 text-xs font-bold"
                    [class.bg-accent-500]="!denied" [class.text-white]="!denied"
                    [class.bg-red-500]="denied" [class.text-white]="denied">
                {{ denied ? 'No access permission' : 'Access granted' }}
              </span>
              <span class="text-xs text-muted">
                {{ denied
                  ? 'Request patient consent, or use break-glass only for an emergency.'
                  : (emergencyAccess
                    ? 'Temporary emergency access — ' + (emergencyCountdownLabel
                        ? 'expires in ' + emergencyCountdownLabel + '.'
                        : 'expires after one hour.')
                    : 'Your individual patient access was verified on-chain.') }}
              </span>
            </div>
          </div>

          <div *ngIf="integrityIssues.length" class="card border border-amber-300 bg-amber-50 p-5">
            <h3 class="mb-2 text-base font-bold text-amber-900">History integrity warnings</h3>
            <p class="mb-3 text-sm text-amber-900">
              These entries are not shown as blockchain-verified. Treat legacy or changed data accordingly.
            </p>
            <div *ngFor="let issue of integrityIssues" class="mb-2 break-all rounded-lg bg-white p-3 text-xs last:mb-0">
              <strong>{{ issue.record_type }}</strong> · {{ issue.facility_id || 'Unknown facility' }} · {{ issue.reason }}
              <code *ngIf="issue.record_hash" class="mt-1 block font-mono">{{ issue.record_hash }}</code>
            </div>
          </div>
          <div *ngIf="emergencyAccess && emergencyReason" class="card border border-red-200 bg-red-50 p-4">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <p class="m-0 text-sm font-semibold text-red-900">Emergency access reason</p>
              <p class="m-0 text-sm font-bold text-red-900" aria-live="polite">
                <span *ngIf="emergencyCountdownLabel">Expires in {{ emergencyCountdownLabel }}</span>
                <span *ngIf="!emergencyCountdownLabel">Emergency window ended</span>
              </p>
            </div>
            <p class="mb-0 mt-1 text-sm text-red-800">{{ emergencyReason }}</p>
            <p class="mb-0 mt-2 text-xs text-red-700">
              Access is audited: every view is logged on-chain as a BREAK_GLASS audit entry.
              The patient sees this window on their dashboard and can end it early.
            </p>
          </div>
          <div *ngIf="referralContext" class="card border border-indigo-200 bg-indigo-50 p-4">
            <p class="m-0 text-sm font-semibold text-indigo-900">Referral context</p>
            <p class="mb-0 mt-1 text-sm text-indigo-800">
              <span *ngIf="referralContext.from_doctor">Dr. {{ referralContext.from_doctor }} ({{ referralContext.from_hospital || 'another hospital' }})</span>
              <span *ngIf="!referralContext.from_doctor">{{ referralContext.from_hospital || 'Another hospital' }}</span>
              referred this patient to your hospital. The patient must still grant you access to their records.
              <span *ngIf="referralContext.reason">Reason: {{ referralContext.reason }}.</span>
              <span *ngIf="referralContext.accepted_at">Accepted {{ referralContext.accepted_at | date:'medium' }}.</span>
            </p>
          </div>
          <div *ngIf="chainVerificationUnavailable" class="card border-2 border-red-400 bg-red-50 p-4">
            <p class="m-0 font-bold text-red-900">Blockchain unavailable — emergency history is unverified</p>
            <p class="mb-0 mt-1 text-sm text-red-800">
              Off-chain records are shown for emergency care only when their local payload still matches its saved hash.
              Their blockchain anchors could not be checked.
            </p>
          </div>

          <!-- Patient health summary (most-used meds, frequent measurements, diagnoses) -->
          <div *ngIf="summary" class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <app-record-chart
              title="Recorded conditions and record types"
              description="Frequency in the blockchain-verified history."
              [data]="diagnosisChartData"
              emptyMessage="No verified diagnosis or record-type entries." />
            <app-record-chart
              title="Measurement history"
              description="Frequency of verified measurements."
              [data]="measurementChartData"
              emptyMessage="No verified measurements are available." />
            <app-record-chart
              title="Medicine mentions"
              description="Recorded medication entries; this is not a measure of doses taken."
              [data]="medicineChartData"
              emptyMessage="No verified medicine entries." />
            <app-record-chart
              title="Recorded activity by hospital"
              description="Verified activity days grouped by facility."
              [data]="hospitalChartData"
              emptyMessage="No verified hospital activity is available." />
          </div>
          <div *ngIf="summary" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <!-- Most-used medicines -->
            <div class="card p-5">
              <h3 class="mb-3 text-lg font-bold">Most-used medicines</h3>
              <div *ngIf="summary.medicines && summary.medicines.length" class="space-y-2">
                <div *ngFor="let med of summary.medicines" class="flex items-center justify-between gap-2 text-sm">
                  <span class="text-slate-900">{{ med.detail }}</span>
                  <span class="text-xs text-muted">{{ med.count }}×</span>
                </div>
              </div>
              <p *ngIf="!summary.medicines || !summary.medicines.length" class="text-sm text-muted italic">
                No medicines recorded yet.
              </p>
            </div>

            <!-- Most frequent measurements -->
            <div class="card p-5">
              <h3 class="mb-3 text-lg font-bold">Most frequent measurements</h3>
              <div *ngIf="summary.measurements && summary.measurements.length" class="space-y-2">
                <div *ngFor="let m of summary.measurements" class="flex items-center justify-between gap-2 text-sm">
                  <div>
                    <span class="font-semibold text-slate-900">{{ m.kind }}</span>
                    <span class="text-xs text-muted">: {{ m.latest_value }} {{ m.latest_unit }}</span>
                  </div>
                  <span class="text-xs text-muted">{{ m.count }}×</span>
                </div>
              </div>
              <p *ngIf="!summary.measurements || !summary.measurements.length" class="text-sm text-muted italic">
                No measurements recorded yet.
              </p>
            </div>

            <!-- Frequent diagnoses -->
            <div class="card p-5">
              <h3 class="mb-3 text-lg font-bold">Most repeated recorded conditions</h3>
              <div *ngIf="summary.diagnoses && summary.diagnoses.length" class="space-y-2">
                <div *ngFor="let d of summary.diagnoses" class="flex items-center justify-between gap-2 text-sm">
                  <span class="text-slate-900">{{ d.type }}</span>
                  <span class="text-xs text-muted">{{ d.count }}×</span>
                </div>
              </div>
              <p *ngIf="!summary.diagnoses || !summary.diagnoses.length" class="text-sm text-muted italic">
                No verified diagnosis or condition entries recorded yet.
              </p>
            </div>

            <!-- Visit frequency per hospital -->
            <div class="card p-5">
              <h3 class="mb-3 text-lg font-bold">Recorded visit days per hospital</h3>
              <div *ngIf="summary.hospital_visits && summary.hospital_visits.length" class="space-y-2">
                <div *ngFor="let h of summary.hospital_visits" class="flex items-center justify-between gap-2 text-sm">
                  <span class="text-slate-900">{{ h.facility }}</span>
                  <span class="text-xs text-muted">{{ h.count }} days with recorded activity</span>
                </div>
              </div>
              <p *ngIf="!summary.hospital_visits || !summary.hospital_visits.length" class="text-sm text-muted italic">
                No verified visit activity recorded yet.
              </p>
            </div>
          </div>

          <!-- Full medical records -->
          <div class="card p-6">
            <h3 class="mb-3 text-lg font-bold">Medical records (all facilities)</h3>
            <p class="mb-4 text-sm text-muted">
              Records from every hospital the patient has visited. Each record's hash
              is anchored on-chain — Hospital B verifies the data by hash, not by trust.
            </p>
            <div class="max-h-[500px] overflow-y-auto">
              <div *ngFor="let rec of records" class="mb-3.5 rounded-xl border border-gray-200 bg-gray-50 p-4.5">
                <div class="mb-3 flex flex-wrap items-center gap-3">
                  <span class="font-bold text-accent-700">{{ rec.facility }}</span>
                  <span class="text-sm text-slate-500">{{ rec.date | date:'medium' }}</span>
                  <span class="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-bold text-primary-900">{{ rec.type }}</span>
                  <span *ngIf="rec.verified" class="btn-primary">On-chain</span>
                  <span *ngIf="!rec.verified" class="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">Not blockchain verified</span>
                </div>
                <div *ngIf="rec.source_uri" class="mb-3 text-xs text-muted flex items-center gap-1.5">
                  <span class="font-semibold">Source:</span>
                  <a [href]="rec.source_uri" target="_blank" rel="noopener" class="text-accent-600 hover:underline break-all">{{ rec.source_uri }}</a>
                </div>
                <div class="rounded-lg p-3 ">
                  <div *ngFor="let item of entries(rec.data)"
                       class="flex border-b border-gray-100 py-1.5 last:border-b-0">
                    <span class="w-44 shrink-0 font-semibold capitalize text-ink">{{ item.key }}:</span>
                    <span class="text-gray-900">{{ item.value }}</span>
                  </div>
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span class="text-muted">hash:</span>
                  <code class="rounded bg-white px-1 py-0.5 font-mono text-muted">{{ rec.hash | slice:0:28 }}…</code>
                  <a *ngIf="rec.tx_hash && !rec.tx_hash.startsWith('PENDING')"
                     [href]="'https://sepolia.etherscan.io/tx/' + rec.tx_hash"
                     target="_blank" rel="noopener"
                     class="text-accent-700 hover:underline">
                    Verify ↗
                  </a>
                </div>
              </div>
              <div *ngIf="records.length === 0" class="p-8 text-center">
                <p class="m-0 text-muted italic">No records for this patient yet.</p>
              </div>
            </div>
          </div>

          <!-- Measurements history -->
          <div class="card p-6">
            <h3 class="mb-3 text-lg font-bold">Measurements history</h3>
            <p class="mb-4 text-sm text-muted">
              All clinical readings recorded for this patient across hospitals.
            </p>
            <div class="overflow-x-auto">
              <table *ngIf="measurements.length" class="w-full">
                <thead>
                  <tr class="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Type</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Value</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Doctor</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Hospital</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                  <tr *ngFor="let m of measurements" class="hover:bg-slate-50/80 transition-colors group">
                    <td class="px-4 py-3 text-sm text-slate-900">{{ m.date | date:'short' }}</td>
                    <td class="px-4 py-3 text-sm font-semibold text-slate-900">
                      {{ m.kind }}
                      <span class="ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                            [class]="m.verified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'">
                        {{ m.verified ? 'Blockchain verified' : 'Not verified' }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-sm text-slate-900">
                      <span *ngIf="!m.withheld">{{ m.value }} <span class="text-slate-500">{{ m.unit }}</span></span>
                      <span *ngIf="m.withheld" class="font-semibold text-red-700">Withheld — integrity check failed</span>
                    </td>
                    <td class="px-4 py-3 text-sm text-slate-600">{{ m.doctor || '—' }}</td>
                    <td class="px-4 py-3 text-sm text-slate-600">{{ m.hospital || '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <p *ngIf="!measurements.length" class="py-6 text-center text-muted italic">
                No measurements recorded for this patient.
              </p>
            </div>
          </div>
        </div>
      </div>
      </div>

      <!-- ================= MEASUREMENTS ================= -->
      <section *ngIf="tab === 'measurements'" aria-labelledby="measurements-heading" class="animate-fade-in">
        <h1 id="measurements-heading" class="text-xl font-bold text-slate-900 mb-1">Measurements</h1>
        <p class="mb-4 text-sm text-muted">Record a clinical reading, then watch the trend for any measurement type.</p>

        <!-- Add measurement -->
        <div class="card mb-4 p-6">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Patient Health ID</span>
              <input [(ngModel)]="meas.health_id" placeholder="e.g. HTD-2024-001"
                     class="px-3 py-2.5 text-sm" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Measurement type</span>
              <select [(ngModel)]="meas.kind" (ngModelChange)="setUnit()"
                      class="px-3 py-2.5 text-sm">
                <option *ngFor="let k of measurementKinds" [value]="k">{{ k }}</option>
              </select>
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Value {{ meas.unit ? '(' + meas.unit + ')' : '' }}</span>
              <input type="number" step="any" [(ngModel)]="meas.value"
                     class="px-3 py-2.5 text-sm" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Notes (optional)</span>
              <input [(ngModel)]="meas.notes" placeholder="e.g. measured after treatment"
                     class="px-3 py-2.5 text-sm" />
            </label>
          </div>
          <div class="mt-5 flex justify-end">
            <button (click)="addMeasurement()" [disabled]="busyMeas"
                    class="btn-primary w-full sm:w-auto">
              {{ busyMeas ? 'Saving…' : 'Record measurement' }}
            </button>
          </div>
          <p *ngIf="measMsg" class="mb-0 mt-2 text-sm"
             [class]="measOk ? 'text-accent-700' : (measPending ? 'text-amber-800' : 'text-red-600')">
            {{ measMsg }}
          </p>
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
                <td class="px-3 py-2.5 text-sm">
                  <span *ngIf="!m.withheld">{{ m.value }} {{ m.unit }}</span>
                  <span *ngIf="m.withheld" class="font-semibold text-red-700">Withheld — integrity check failed</span>
                  <span *ngIf="!m.verified" class="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    {{ m.record_hash ? 'Not verified' : 'Legacy, unanchored' }}
                  </span>
                  <span *ngIf="m.verified" class="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    Blockchain verified
                  </span>
                </td>
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
            <p *ngIf="historyChainUnavailable" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Emergency fallback: the blockchain could not be reached. Readings are shown as unverified; hash mismatches remain withheld.
            </p>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 class="m-0 font-bold text-ink">Trend over time</h4>
              <select [(ngModel)]="trendKind"
                      class="px-3 py-2.5 text-sm">
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
            </div>
            <p *ngIf="trendPoints.length < 2" class="mb-0 mt-2 text-xs text-muted">
              One reading of this type so far — the line appears with the second one.
            </p>
          </div>
        </div>
      </section>

      <!-- ================= MY REQUESTS ================= -->
      <div *ngIf="tab === 'requests'" class="animate-fade-in">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-xl font-bold text-slate-900 mb-1">My Access Request History</h2>
            <p class="m-0 text-sm text-muted">Every request and permission outcome, including pending, approved, declined, expired, and unconfirmed actions.</p>
          </div>
          <button type="button" (click)="loadMyRequests()" [disabled]="requestsLoading" class="btn-secondary min-h-11">
            {{ requestsLoading ? 'Refreshing…' : 'Refresh history' }}
          </button>
        </div>
        <div *ngIf="requestsLoading && myRequests.length === 0" class="card mb-3 p-5 text-sm text-muted" role="status">Loading your request history…</div>
        <div *ngIf="requestsError" class="mb-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {{ requestsError }} <button type="button" (click)="loadMyRequests()" class="font-semibold underline">Try again</button>
        </div>
        <div *ngFor="let r of myRequests" class="card mb-3 flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p class="m-0 font-bold text-ink">{{ r.patient_name }} <span class="text-sm font-normal text-muted">({{ r.patient_health_id }})</span></p>
            <p class="m-0 text-sm text-muted">{{ r.reason || 'No reason given' }} · {{ r.created_at | date:'medium' }}</p>
            <p *ngIf="r.responded_at" class="m-0 text-xs text-muted">responded {{ r.responded_at | date:'short' }}</p>
            <p *ngIf="requestStatus(r) === 'FAILED'" class="m-0 mt-1 text-xs font-medium text-red-700">The permission could not be confirmed. It was not granted.</p>
            <details *ngIf="r.tx_hash" class="mt-1"><summary class="cursor-pointer text-xs text-muted">Technical details</summary><code class="block break-all text-[11px] text-muted">{{ r.tx_hash }}</code></details>
          </div>
          <div class="flex items-center gap-2">
            <span class="rounded-full px-3 py-1 text-xs font-bold"
                  [class]="requestStatusClass(r)">{{ requestStatusLabel(r) }}</span>
            <button *ngIf="requestStatus(r) === 'APPROVED' && r.patient_health_id" (click)="healthId = r.patient_health_id; setTab('find'); viewRecord()"
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
        <h2 class="text-xl font-bold text-slate-900 mb-1">Refer a Patient to Another Hospital</h2>
        <p class="mb-4 text-sm text-muted">The receiving hospital's staff or doctors accept or decline — every response is audited.</p>

        <div class="card mb-4 p-6">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Patient Health ID</span>
              <input [(ngModel)]="referral.health_id" placeholder="e.g. HTD-2024-001"
                     class="px-3 py-2.5 text-sm" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Send to hospital</span>
              <select [(ngModel)]="referral.to_hospital"
                      class="px-3 py-2.5 text-sm">
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
                        class="px-3 py-2.5 text-sm"></textarea>
            </label>
          </div>
          <div class="mt-5 flex justify-end">
            <button (click)="sendReferral()" [disabled]="busyRef || !referral.to_hospital"
                    class="btn-primary w-full sm:w-auto">
              {{ busyRef ? 'Sending…' : 'Send referral' }}
            </button>
          </div>
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
                      class="btn-primary">Accept</button>
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
        <h2 class="text-xl font-bold text-slate-900 mb-1">Blockchain Transaction History</h2>
        <p class="mb-4 text-sm text-muted">
          All on-chain transactions for {{ hospitalName || 'your hospital' }}. Filter by event type or patient Health ID.
          Every transaction is verifiable on Etherscan.
        </p>

        <!-- Filters -->
        <div class="card mb-4 p-6">
          <div class="flex flex-wrap gap-3">
            <select [(ngModel)]="txFilterEvent" (ngModelChange)="applyTxFilter()"
                    class="px-3 py-2.5 text-sm">
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
                    class="btn-secondary">
              Clear Filters
            </button>
          </div>
        </div>

        <div *ngIf="filteredTransactions.length" class="space-y-3">
          <div *ngFor="let tx of filteredTransactions" class="card">
            <div class="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div class="flex flex-wrap items-center gap-3">
                <span class="rounded-full px-3 py-1 text-xs font-bold" [class]="eventBadge(tx.event)">{{ formatEventName(tx.event) }}</span>
                <span class="text-sm text-slate-500">{{ tx.timestamp ? (tx.timestamp * 1000 | date:'medium') : '—' }}</span>
              </div>
              <a [href]="tx.etherscan_url" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors">
                View on Etherscan
              </a>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p class="text-xs text-slate-500 mb-1">Transaction Hash</p>
                <code class="text-xs font-mono text-slate-700 break-all">{{ tx.transaction_hash }}</code>
              </div>
              <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p class="text-xs text-slate-500 mb-1">Block Number</p>
                <span class="text-sm font-mono text-slate-700">{{ tx.block_number }}</span>
              </div>
            </div>
            <div *ngIf="eventArgs(tx.args).length > 0" class="p-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200">
              <p class="text-xs font-semibold text-slate-600 mb-2">Event Details</p>
              <div *ngFor="let arg of eventArgs(tx.args)" class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-2 border-b border-slate-200 last:border-b-0">
                <span class="text-xs font-medium text-slate-600 capitalize">{{ arg.key }}</span>
                <span class="text-sm text-slate-900 break-all">{{ arg.value }}</span>
              </div>
            </div>
          </div>
        </div>
        <div *ngIf="filteredTransactions.length === 0 && transactions.length > 0" class="card">
          <h3 class="mb-2 text-lg font-bold text-slate-900">No transactions match your filters</h3>
          <p class="text-slate-600">Try adjusting your filters or clearing them.</p>
        </div>
        <div *ngIf="transactions.length === 0" class="card">
          <h3 class="mb-2 text-lg font-bold text-slate-900">No blockchain transactions yet</h3>
          <p class="text-slate-600">Transactions appear here when records are added, access is granted, or data is viewed.</p>
        </div>
      </div>

      <!-- ================= HOW IT WORKS ================= -->
      <div *ngIf="tab === 'how-it-works'" class="animate-fade-in">
        <div class="card p-6">
          <h2 class="text-xl font-bold text-slate-900 mb-1">How it works</h2>
          <p class="text-sm text-muted">
            A guide for healthcare providers on using the platform securely and effectively.
          </p>
        </div>
        <div class="space-y-4">
          <div class="card p-6">
            <h3 class="text-lg font-bold text-slate-900 mb-3">Clinical Workflow</h3>
            <div class="space-y-3">
              <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p class="text-sm font-semibold text-slate-900 mb-1">1. Access Patient Records</p>
                <p class="text-sm text-slate-600">
                  Use "Find Patient" to search by Health ID. The system verifies your access rights on-chain.
                  If no access, you can request permission or use break-glass in emergencies.
                </p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p class="text-sm font-semibold text-slate-900 mb-1">2. Record Measurements &amp; Data</p>
                <p class="text-sm text-slate-600">
                  Add clinical measurements and view patient history. All actions are logged on the blockchain
                  for complete auditability.
                </p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p class="text-sm font-semibold text-slate-900 mb-1">3. Collaborate Across Hospitals</p>
                <p class="text-sm text-slate-600">
                  Refer patients to specialists at other hospitals. Accepting a referral does not grant
                  record access; request patient consent or use break-glass only in an emergency.
                </p>
              </div>
            </div>
          </div>
          <div class="card p-6">
            <h3 class="text-lg font-bold text-slate-900 mb-3">Security &amp; Compliance</h3>
            <div class="space-y-3">
              <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p class="text-sm font-semibold text-slate-900 mb-1">Verified Identity</p>
                <p class="text-sm text-slate-600">
                  Only licensed doctors verified by hospital administration can access the system.
                </p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p class="text-sm font-semibold text-slate-900 mb-1">Consent-Based Access</p>
                <p class="text-sm text-slate-600">
                  Patient consent is required for all non-emergency access. Access expires after 7 days.
                </p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p class="text-sm font-semibold text-slate-900 mb-1">Complete Audit Trail</p>
                <p class="text-sm text-slate-600">
                  Every record view, grant, and action is immutably logged on the Sepolia blockchain.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ================= PROFILE ================= -->
      <div *ngIf="tab === 'profile'" class="animate-fade-in">
        <h2 class="text-xl font-bold text-slate-900 mb-1">My Profile</h2>
        <p class="mb-4 text-sm text-muted">Your account information and professional details.</p>
        <div class="card p-6 space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Full Name</p>
              <p class="text-sm font-semibold text-slate-900">Dr. {{ auth.fullName }}</p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">License Number</p>
              <p class="text-sm font-semibold text-slate-900">{{ license }}</p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Hospital</p>
              <p class="text-sm font-semibold text-slate-900">{{ hospitalName || '—' }}</p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Wallet Address</p>
              <p *ngIf="walletVisible" class="text-xs font-mono text-slate-900 break-all">{{ walletAddress }}</p>
              <p *ngIf="!walletVisible" class="text-xs text-slate-500">Hidden</p>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>

  `,
})
export class DoctorLandingComponent implements OnDestroy, OnInit {
  tab: 'dashboard' | 'patients' | 'hospital-patients' | 'find' | 'measurements' | 'referrals' | 'requests' | 'transactions' | 'how-it-works' | 'profile' = 'dashboard';
  tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'patients', label: 'My Patients' },
    { id: 'hospital-patients', label: 'Hospital Patients' },
    { id: 'find', label: 'Patient History' },
    { id: 'measurements', label: 'Measurements' },
    { id: 'referrals', label: 'Referrals' },
    { id: 'requests', label: 'My Requests' },
    { id: 'transactions', label: 'Blockchain Transactions' },
    { id: 'how-it-works', label: 'How it works' },
    { id: 'profile', label: 'Profile' },
  ] as const;

  /** Mobile sidebar drawer state (desktop sidebar is always visible). */
  sidebarOpen = false;

  license = '';
  hospitalName = '';
  myHospitalCode = '';
  walletAddress = '';
  walletVisible = false;

  // patients
  get patients(): AssignedPatient[] { return this.workspaceState.doctorPatients.data ?? []; }
  set patients(value: AssignedPatient[]) { this.workspaceState.doctorPatients.set(value); }
  loadingPatients = false;

  // hospital patients (all patients cared for by this doctor)
  hospitalPatients: HospitalPatientItem[] = [];
  loadingHospitalPatients = false;
  hospitalPatientsSearch = '';
  get filteredHospitalPatients(): HospitalPatientItem[] {
    const q = this.hospitalPatientsSearch.trim().toLowerCase();
    if (!q) return this.hospitalPatients;
    return this.hospitalPatients.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q) ||
        p.health_id.toLowerCase().includes(q) ||
        (p.hospital || '').toLowerCase().includes(q)
    );
  }

  // dashboard overview
  get dashboard(): DoctorDashboard | null { return this.workspaceState.doctorDashboard.data; }
  set dashboard(value: DoctorDashboard | null) { value ? this.workspaceState.doctorDashboard.set(value) : this.workspaceState.doctorDashboard.clear(); }
  loadingDashboard = false;
  get diseaseChartData(): RecordChartPoint[] {
    return (this.dashboard?.diseases ?? []).map((d) => ({
      label: `${d.name} (${d.rate}% of patients)`,
      value: d.count,
    }));
  }
  get measurementKindChartData(): RecordChartPoint[] {
    return (this.dashboard?.measurements_by_kind ?? []).map((m) => ({
      label: m.kind,
      value: m.count,
    }));
  }
  get referralChartData(): RecordChartPoint[] {
    const r = this.dashboard?.referrals;
    if (!r) return [];
    return [
      { label: 'Sent — pending', value: r.sent_pending },
      { label: 'Sent — accepted', value: r.sent_accepted },
      { label: 'Sent — declined', value: r.sent_declined },
      { label: 'Incoming — pending', value: r.incoming_pending },
    ].filter((p) => p.value > 0);
  }
  get requestChartData(): RecordChartPoint[] {
    const a = this.dashboard?.access_requests;
    if (!a) return [];
    return [
      { label: 'Awaiting patient', value: a.pending },
      { label: 'Approved', value: a.approved },
      { label: 'Rejected', value: a.rejected },
    ].filter((p) => p.value > 0);
  }

  // find patient
  healthId = '';
  requestReason = '';
  emergencyReasonInput = '';
  emergencyPatientUnableToConsent = false;
  emergencyBusy = false;
  viewedName = '';
  viewedHealthId = '';
  records: PatientRecord[] = [];
  measurements: MeasurementItem[] = [];
  referrals: ReferralItem[] = [];
  summary: any = null;
  get diagnosisChartData(): RecordChartPoint[] {
    return (this.summary?.diagnoses ?? []).map((item: { type: string; count: number }) => ({
      label: item.type, value: item.count,
    }));
  }
  get measurementChartData(): RecordChartPoint[] {
    return (this.summary?.measurements ?? []).map((item: { kind: string; count: number }) => ({
      label: item.kind, value: item.count,
    }));
  }
  get medicineChartData(): RecordChartPoint[] {
    return (this.summary?.medicines ?? []).map((item: { detail: string; count: number }) => ({
      label: item.detail, value: item.count,
    }));
  }
  get hospitalChartData(): RecordChartPoint[] {
    return (this.summary?.hospital_visits ?? []).map((item: { facility: string; count: number }) => ({
      label: item.facility, value: item.count,
    }));
  }
  integrityIssues: { record_hash: string | null; facility_id: string; record_type: string; reason: string }[] = [];
  emergencyAccess = false;
  emergencyReason = '';
  /** Live break-glass window: when it ends and the seconds left (ticked below). */
  emergencyExpiresAt = '';
  emergencyRemaining = 0;
  private emergencyTimer: any = null;
  referralAccess = false;
  referralContext: {
    from_hospital: string;
    from_doctor: string;
    reason: string;
    accepted_at: string | null;
  } | null = null;
  chainVerificationUnavailable = false;
  denied = false;
  requestSent = false;
  loading = false;
  resChainChecked = false;
  feedbackMessage = '';
  feedbackError = false;
  private feedbackTimer: any = null;

  // my access requests (patient responses)
  get myRequests(): AccessRequest[] { return this.workspaceState.doctorRequests.data ?? []; }
  set myRequests(value: AccessRequest[]) { this.workspaceState.doctorRequests.set(value); }
  pendingRequestCount = 0;
  requestsLoading = false;
  requestsError = '';

  // measurements
  measurementKinds = [
    'Blood pressure (systolic)', 'Blood pressure (diastolic)', 'Heart rate',
    'Temperature', 'Blood sugar', 'SpO2', 'Weight', 'Hemoglobin', 'Malaria RDT',
  ];
  meas = { health_id: '', kind: this.measurementKinds[0], value: null as number | null, unit: '', notes: '' };
  busyMeas = false;
  measMsg = '';
  measOk = false;
  measPending = false;
  historyHealthId = '';
  measurementHistory: MeasurementItem[] = [];
  historyLoaded = false;
  historyChainUnavailable = false;

  // referrals
  hospitals: HospitalOption[] = [];
  referral = { health_id: '', to_hospital: '', reason: '' };
  busyRef = false;
  refMsg = '';
  refOk = false;
  get referralsSent(): ReferralItem[] { return this.workspaceState.doctorReferrals.data ?? []; }
  set referralsSent(value: ReferralItem[]) { this.workspaceState.doctorReferrals.set(value); }

  // incoming referral notifications (toasts + referrals tab)
  get incomingAll(): ReferralItem[] { return this.workspaceState.doctorIncoming.data ?? []; }
  set incomingAll(value: ReferralItem[]) { this.workspaceState.doctorIncoming.set(value); }
  incomingToasts: ReferralItem[] = [];
  pendingIncoming = 0;
  busyIncoming: number | null = null;
  private dismissedReferrals = new Set<number>();
  private referralTimer: any = null;

  // blockchain transactions
  get transactions(): BlockchainEvent[] { return this.workspaceState.doctorTransactions.data ?? []; }
  set transactions(value: BlockchainEvent[]) { this.workspaceState.doctorTransactions.set(value); }
  filteredTransactions: BlockchainEvent[] = [];
  txFilterEvent = '';
  txFilterHealthId = '';
  private txFilterTimer: ReturnType<typeof setTimeout> | null = null;

  /** Most recent on-chain action by this doctor (break-glass), surfaced
   * as a banner with a direct Etherscan link. */
  lastTx: { label: string; tx_hash: string; pending: boolean } | null = null;

  // measurement trend chart
  trendKind = '';

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private workspaceState: WorkspaceStateService
  ) {}

  /** Angular 22 is zoneless by default — re-render after async mutations. */
  private syncView() {
    this.cdr.detectChanges();
  }

  private notify(message: string, error = false) {
    this.feedbackMessage = message;
    this.feedbackError = error;
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => {
      this.feedbackMessage = '';
      this.syncView();
    }, 5000);
    this.syncView();
  }

  setTab(id: 'dashboard' | 'patients' | 'hospital-patients' | 'find' | 'measurements' | 'referrals' | 'requests' | 'transactions' | 'how-it-works' | 'profile') {
    this.tab = id;
    this.sidebarOpen = false; // close the mobile drawer after navigating
    if (id === 'dashboard') void this.loadDashboard();
    if (id === 'requests') void this.loadMyRequests();
    if (id === 'transactions') void this.loadTransactions();
    if (id === 'hospital-patients') void this.loadHospitalPatients();
    this.syncView();
  }

  /** Label of the active section, shown next to the mobile hamburger. */
  get currentTabLabel(): string {
    return this.tabs.find((t) => t.id === this.tab)?.label ?? '';
  }

  async ngOnInit() {
    this.workspaceState.bindSession(this.auth.token);
    if (!this.auth.isDoctor) {
      // Not signed in — the route guard normally prevents this.
      return;
    }
    this.license = this.auth.licenseNo;
    this.myHospitalCode = this.auth.hospitalCode;
    // Start independent dashboard requests together. Each section renders as
    // soon as its own response arrives instead of waiting behind chain reads.
    const profile = this.api.doctorMe().then((me) => {
      this.hospitalName = me.hospital_name || me.hospital_code;
      this.walletAddress = me.wallet_address || '';
    }).catch(() => { /* keep the facility code label */ });
    const hospitals = this.api.hospitals().then((items) => {
      this.hospitals = items;
    }).catch(() => { this.hospitals = []; });
    this.startReferralPolling();
    void Promise.allSettled([
      profile,
      hospitals,
      this.loadDashboard(false),
      this.loadPatients(false),
      this.loadReferralsSent(false),
      this.loadMyRequests(false),
      this.refreshIncoming(),
    ]).then(() => this.syncView());
  }

  /** Poll patient responses so an approval unlocks records without a refresh. */
  private async pollMyRequests() {
    const before = this.pendingRequestCount;
    try {
      this.myRequests = await this.workspaceState.doctorRequests.load(() => this.api.doctorPendingRequests(), true);
      this.pendingRequestCount = this.myRequests.filter((r) => this.requestStatus(r) === 'PENDING').length;
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
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    if (this.txFilterTimer) clearTimeout(this.txFilterTimer);
    this.stopEmergencyCountdown();
  }

  /** Tick the emergency countdown once a second while a window is open. */
  private startEmergencyCountdown() {
    this.stopEmergencyCountdown();
    if (!this.emergencyAccess || !this.emergencyExpiresAt) return;
    this.tickEmergencyCountdown();
    this.emergencyTimer = setInterval(() => this.tickEmergencyCountdown(), 1000);
  }

  private stopEmergencyCountdown() {
    if (this.emergencyTimer) {
      clearInterval(this.emergencyTimer);
      this.emergencyTimer = null;
    }
  }

  private tickEmergencyCountdown() {
    const ms = new Date(this.emergencyExpiresAt).getTime() - Date.now();
    this.emergencyRemaining = Math.max(0, Math.floor(ms / 1000));
    if (this.emergencyRemaining === 0) this.stopEmergencyCountdown();
    this.syncView();
  }

  /** "42:07" (or "1:02:03") left on the emergency window; empty if none. */
  get emergencyCountdownLabel(): string {
    if (!this.emergencyAccess || !this.emergencyExpiresAt) return '';
    const total = this.emergencyRemaining;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return hours > 0
      ? `${hours}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(minutes)}:${pad(seconds)}`;
  }

  /** Poll referrals addressed to my hospital so toasts appear live. */
  private startReferralPolling() {
    this.referralTimer = setInterval(() => {
      void this.refreshIncoming();
      void this.pollMyRequests();
      // Keep the Etherscan log live while the doctor watches it, and resolve
      // a pending break-glass tx once it is mined.
      if (this.tab === 'transactions') void this.loadTransactions();
    }, 15000);
  }

  async loadMyRequests(refresh = true) {
    this.requestsLoading = true;
    this.requestsError = '';
    this.syncView();
    try {
      this.myRequests = await this.workspaceState.doctorRequests.load(() => this.api.doctorPendingRequests(), refresh);
      this.pendingRequestCount = this.myRequests.filter((r) => this.requestStatus(r) === 'PENDING').length;
    } catch (e: any) {
      this.requestsError = e?.error?.error || e?.message || 'Could not load your request history.';
    } finally {
      this.requestsLoading = false;
      this.syncView();
    }
  }

  requestStatus(r: AccessRequest): string {
    return (r.status || 'PENDING').trim().toUpperCase();
  }

  requestStatusLabel(r: AccessRequest): string {
    const labels: Record<string, string> = {
      PENDING: 'Awaiting patient', APPROVED: 'Approved', REJECTED: 'Declined',
      EXPIRED: 'Expired', FAILED: 'Not confirmed', BREAK_GLASS: 'Emergency access',
    };
    return labels[this.requestStatus(r)] || this.requestStatus(r);
  }

  requestStatusClass(r: AccessRequest): string {
    switch (this.requestStatus(r)) {
      case 'APPROVED': return 'bg-accent-500 text-white';
      case 'REJECTED':
      case 'FAILED': return 'bg-red-500 text-white';
      case 'EXPIRED': return 'bg-slate-200 text-slate-700';
      case 'BREAK_GLASS': return 'bg-orange-100 text-orange-800';
      default: return 'bg-primary-300 text-ink';
    }
  }

  async refreshIncoming() {
    try {
      this.incomingAll = await this.workspaceState.doctorIncoming.load(() => this.api.incomingReferrals(), true);
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
      this.notify(action === 'ACCEPTED' ? 'Referral accepted.' : 'Referral declined.');
      await this.refreshIncoming();
      await this.loadReferralsSent();
      if (action === 'ACCEPTED' && r.patient_health_id) {
        // Show referral context, then let the access check direct the doctor
        // to request patient consent or use break-glass for an emergency.
        this.healthId = r.patient_health_id;
        this.setTab('find');
        await this.viewRecord();
      }
    } catch (e: any) {
      this.notify(e?.error?.error || e?.message || 'Could not update the referral.', true);
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

  async loadDashboard(refresh = true) {
    this.loadingDashboard = true;
    this.syncView();
    try {
      this.dashboard = await this.workspaceState.doctorDashboard.load(() => this.api.doctorDashboard(), refresh);
    } catch {
      // Keep the last successful result visible while offline.
    } finally {
      this.loadingDashboard = false;
      this.syncView();
    }
  }

  async loadPatients(refresh = true) {
    this.loadingPatients = true;
    this.syncView();
    try {
      this.patients = await this.workspaceState.doctorPatients.load(() => this.api.myPatients(), refresh);
    } catch (e: any) {
      this.notify(e?.error?.error || e?.message || 'Could not load patients.', true);
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

  /** Navigate to Patient History pre-loaded with this patient's health ID. */
  openPatientFromHospitalList(p: HospitalPatientItem) {
    this.healthId = p.health_id;
    this.tab = 'find';
    this.syncView();
    void this.viewRecord();
  }

  async loadHospitalPatients() {
    this.loadingHospitalPatients = true;
    this.syncView();
    try {
      this.hospitalPatients = await this.api.doctorHospitalPatients();
    } catch (e: any) {
      this.notify(e?.error?.error || e?.message || 'Could not load hospital patients.', true);
    } finally {
      this.loadingHospitalPatients = false;
      this.syncView();
    }
  }

  async viewRecord() {
    if (!this.healthId.trim()) return;
    this.emergencyReasonInput = '';
    this.emergencyPatientUnableToConsent = false;
    this.loading = true;
    this.denied = false;
    this.requestSent = false;
    this.records = [];
    this.measurements = [];
    this.referrals = [];
    this.summary = null;
    this.integrityIssues = [];
    this.emergencyAccess = false;
    this.emergencyReason = '';
    this.emergencyExpiresAt = '';
    this.emergencyRemaining = 0;
    this.stopEmergencyCountdown();
    this.referralAccess = false;
    this.referralContext = null;
    this.chainVerificationUnavailable = false;
    this.viewedName = '';
    this.viewedHealthId = '';
    this.syncView();
    try {
      const res: any = await this.api.doctorViewRecord(this.healthId.trim());
      this.viewedName = res.full_name;
      this.viewedHealthId = res.health_id;
      this.records = res.records || [];
      this.measurements = res.measurements || [];
      this.referrals = res.referrals || [];
      this.summary = res.summary || null;
      this.integrityIssues = res.integrity_issues || [];
      this.emergencyAccess = !!res.emergency_access;
      this.emergencyReason = res.emergency_reason || '';
      this.emergencyExpiresAt = res.emergency_expires_at || '';
      this.emergencyRemaining = res.emergency_remaining_seconds || 0;
      this.startEmergencyCountdown();
      this.referralAccess = !!res.referral_access;
      this.referralContext = res.referral_context || null;
      this.chainVerificationUnavailable = !!res.chain_verification_unavailable;
      this.resChainChecked = res.chain_checked ?? true;
    } catch (e: any) {
      if (e?.status === 403) {
        this.denied = true;
      } else {
        this.notify(e?.error?.error || e?.message || 'Could not load this record.', true);
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
      this.notify('Access request sent to the patient.');
      await this.loadMyRequests();
    } catch (e: any) {
      this.notify(e?.error?.error || e?.message || 'Could not send the access request.', true);
    }
    this.syncView();
  }

  async breakGlass() {
    const reason = this.emergencyReasonInput.trim();
    if (!this.emergencyPatientUnableToConsent) {
      this.notify('Confirm that the patient cannot communicate or consent before using emergency access.', true);
      return;
    }
    if (!reason) {
      this.notify('Document why the patient cannot communicate or consent and why immediate access is necessary.', true);
      return;
    }
    if (this.emergencyBusy) return;
    if (!confirm('Use emergency access for this patient for up to one hour? This is only for an immediate emergency when the patient cannot communicate or consent. The detailed reason stays off-chain; its hash and access event are recorded on-chain.')) return;
    this.emergencyBusy = true;
    this.syncView();
    try {
      const res: any = await this.api.breakGlass({
        health_id: this.healthId.trim(),
        reason,
        patient_unable_to_consent: this.emergencyPatientUnableToConsent,
      });
      const h: string = res?.tx_hash || '';
      if (h && !h.startsWith('PENDING')) {
        this.lastTx = { label: `Break-glass used for ${this.healthId.trim()}`, tx_hash: h, pending: false };
      } else {
        this.lastTx = { label: `Break-glass submitted for ${this.healthId.trim()}`, tx_hash: h || '', pending: true };
      }
      this.emergencyReasonInput = '';
      this.emergencyPatientUnableToConsent = false;
      // Immediately reflect the BreakGlassUsed event in the on-chain log.
      void this.loadTransactions();
      this.notify(res.chain_logged
        ? 'Emergency access granted for 1 hour and logged on-chain.'
        : 'Emergency access granted for 1 hour, but its blockchain audit transaction is pending. Check your transaction log.');
      await this.viewRecord();
    } catch (e: any) {
      this.notify(e?.error?.error || e?.message || 'Could not activate emergency access.', true);
    } finally {
      this.emergencyBusy = false;
      this.syncView();
    }
  }

  isPendingTx(h: string): boolean {
    return h.startsWith('PENDING');
  }

  etherscanUrl(h: string): string {
    return `https://sepolia.etherscan.io/tx/${h}`;
  }

  async addMeasurement() {
    this.measMsg = '';
    this.measOk = false;
    this.measPending = false;
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
      this.measOk = Boolean(res.verified);
      this.measPending = !res.verified;
      this.measMsg = res.message || (
        res.verified
          ? 'Measurement recorded and verified on-chain.'
          : 'Measurement saved locally but is not blockchain-verified.'
      );
      this.meas = { health_id: this.meas.health_id, kind: this.measurementKinds[0], value: null, unit: '', notes: '' };
      void this.scheduleHistoryReload();
    } catch (e: any) {
      this.measPending = false;
      this.measMsg = e?.error?.error || e?.message || 'Failed to record measurement';
    } finally {
      this.busyMeas = false;
      this.syncView();
    }
  }

  /** Reload the measurement history only when the save does not block the user,
   * and only if the history section is already open for this patient. */
  private pendingHistoryTimer: ReturnType<typeof setTimeout> | null = null;

  private async scheduleHistoryReload() {
    if (!this.historyHealthId.trim()) return;
    if (this.pendingHistoryTimer) {
      clearTimeout(this.pendingHistoryTimer);
      this.pendingHistoryTimer = null;
    }
    this.pendingHistoryTimer = setTimeout(async () => {
      this.pendingHistoryTimer = null;
      await this.loadMeasurements();
    }, 60);
  }

  async loadMeasurements() {
    if (!this.historyHealthId.trim()) return;
    try {
      this.measurementHistory = await this.api.patientMeasurements(this.historyHealthId.trim());
      this.historyChainUnavailable = this.measurementHistory.some(
        (measurement) => measurement.blockchain_unavailable
      );
      this.historyLoaded = true;
      const kinds = this.trendKinds;
      if (!kinds.includes(this.trendKind)) this.trendKind = kinds[0] || '';
    } catch (e: any) {
      this.notify(e?.error?.error || e?.message || 'Could not load measurements.', true);
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

  async loadReferralsSent(refresh = true) {
    try {
      this.referralsSent = await this.workspaceState.doctorReferrals.load(() => this.api.myReferralsSent(), refresh);
    } catch {
      // Keep the last successful result visible while the slice records the error.
    }
    this.syncView();
  }

  /** Load blockchain transaction history for this doctor's hospital. */
  private async loadTransactions() {
    try {
      const healthId = this.txFilterHealthId.trim();
      this.transactions = await this.workspaceState.doctorTransactions.load(async () => {
        const res = await this.api.blockchainEvents(healthId ? { health_id: healthId } : undefined);
        return res.events;
      }, true);
      this.filteredTransactions = this.transactions.filter(
        (tx) => !this.txFilterEvent || tx.event === this.txFilterEvent
      );
      // A pending break-glass just mined? Flip the banner to the live link.
      if (this.lastTx?.pending && this.transactions.some((t) => t.transaction_hash === this.lastTx!.tx_hash)) {
        this.lastTx.pending = false;
      }
    } catch (e: any) {
      console.error('Failed to load transactions:', e);
      this.filteredTransactions = [];
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

  doctorCopyWallet() {
    if (!this.walletAddress) return;
    navigator.clipboard.writeText(this.walletAddress).catch(() => {});
  }

  /** Log out and take the user back to the sign-in page. */
  logoutAndRedirect() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  entries(data: any): { key: string; value: any }[] {
    if (!data) return [];
    return Object.entries(data).map(([key, value]) => ({ key, value }));
  }

  // ---------- Transaction filter helpers ----------
  applyTxFilter() {
    const healthId = this.txFilterHealthId.trim();
    if (healthId) {
      if (this.txFilterTimer) clearTimeout(this.txFilterTimer);
      this.filteredTransactions = [];
      this.txFilterTimer = setTimeout(() => {
        this.txFilterTimer = null;
        void this.loadTransactions();
      }, 350);
      return;
    }
    this.filteredTransactions = this.transactions.filter((tx) => {
      const eventMatch = !this.txFilterEvent || tx.event === this.txFilterEvent;
      return eventMatch;
    });
  }

  clearTxFilter() {
    this.txFilterEvent = '';
    this.txFilterHealthId = '';
    if (this.txFilterTimer) clearTimeout(this.txFilterTimer);
    this.txFilterTimer = null;
    void this.loadTransactions();
  }

  eventBadge(event?: string): string {
    switch ((event || '').toLowerCase()) {
      case 'patientregistered':     return 'bg-primary-100 text-primary-900';
      case 'recordadded':           return 'bg-accent-100 text-accent-900';
      case 'accessgranted':         return 'bg-accent-200 text-accent-900';
      case 'accessrevoked':         return 'bg-red-100 text-red-900';
      case 'recordviewed':          return 'bg-primary-200 text-primary-900';
      case 'breakglassused':        return 'bg-red-200 text-red-900';
      case 'emergencyaccessgranted': return 'bg-orange-100 text-orange-900';
      default:                      return 'bg-gray-100 text-ink';
    }
  }

  formatEventName(event: string): string {
    const map: Record<string, string> = {
      'PatientRegistered': 'Patient Registered',
      'RecordAdded': 'Record Added',
      'AccessGranted': 'Access Granted',
      'AccessRevoked': 'Access Revoked',
      'RecordViewed': 'Record Viewed',
      'BreakGlassUsed': 'Break-Glass Used',
      'EmergencyAccessGranted': 'Emergency Access',
    };
    return map[event] || event;
  }

  eventArgs(args: Record<string, any>): { key: string; value: any }[] {
    if (!args) return [];
    return Object.entries(args).map(([key, value]) => ({ key, value }));
  }
}
