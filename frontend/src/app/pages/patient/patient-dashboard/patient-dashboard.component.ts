import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { NgIf, NgFor, NgClass, SlicePipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, PatientData, AccessRequest, DoctorOption, ActivityStoryItem, EmergencyAccessItem, ActiveGrantItem, IntegrityCheckResult, IntegrityReport } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';
import { RecordChartComponent, RecordChartPoint } from '../../../components/shared/record-chart/record-chart.component';
import { DashboardGaugeComponent } from '../../../components/shared/dashboard-gauge/dashboard-gauge.component';
import { WorkspaceStateService } from '../../../services/workspace-state.service';

@Component({
  selector: 'app-patient-dashboard',
  imports: [NgIf, NgFor, NgClass, SlicePipe, DatePipe, FormsModule, RecordChartComponent, DashboardGaugeComponent],
  styles: [`:host { display: block; width: 100%; }`],
  template: `
    <!-- LOADING (instant — skeleton, disappears as soon as first bytes arrive) -->
    <div *ngIf="loading && !data" role="status" aria-live="polite" aria-busy="true" class="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
      <div aria-hidden="true" class="w-10 h-10 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin mb-4"></div>
      <p class="m-0 text-slate-700 text-sm font-semibold">Loading your health records…</p>
    </div>

    <!-- NOT LOGGED IN -->
    <div *ngIf="!auth.isAuthenticated()" class="min-h-screen flex items-center justify-center px-4 bg-slate-50">
      <div class="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
        <div class="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
        </div>
        <h2 class="text-2xl font-bold text-slate-900 mb-2">Session Expired</h2>
        <p class="text-slate-600 mb-6">Please sign in again to access your records.</p>
        <button (click)="logoutAndRedirect()" class="btn-primary w-full sm:w-auto">
          Sign In Again
        </button>
      </div>
    </div>

    <!-- LOAD FAILED -->
    <div *ngIf="errorMsg && !data" role="alert" class="min-h-screen flex items-center justify-center px-4 bg-slate-50">
      <div class="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
        <div class="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        </div>
        <h2 class="text-2xl font-bold text-slate-900 mb-2">Unable to Load</h2>
        <p class="text-slate-600 mb-6">{{ errorMsg }}</p>
        <button (click)="retry()" class="btn-primary w-full sm:w-auto">
          Try Again
        </button>
      </div>
    </div>

    <!-- DASHBOARD WITH SIDEBAR -->
    <div *ngIf="data" class="min-h-screen bg-slate-50">
      <div class="flex flex-col lg:flex-row">
        <!-- SIDEBAR -->
        <aside class="w-full border-b border-slate-200 bg-white lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r xl:w-72">
          <div class="p-4 sm:p-6">
            <div class="mb-5 lg:mb-8">
              <h2 class="text-xl font-bold text-slate-900 mb-1">{{ data.full_name }}</h2>
              <p class="text-sm text-slate-500 mb-3">Health ID: <span class="font-semibold text-slate-700">{{ data.health_id }}</span></p>
              <div class="flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-white">
                <div class="flex-1 min-w-0">
                  <p class="text-xs text-slate-500">Secure account</p>
                  <code class="text-xs font-mono text-slate-700 truncate block">{{ walletVisible ? data.wallet_address : 'Hidden' }}</code>
                </div>
                <button type="button" (click)="walletVisible = !walletVisible"
                        class="text-xs font-semibold text-primary-700 hover:underline"
                        [attr.aria-expanded]="walletVisible">
                  {{ walletVisible ? 'Hide wallet' : 'View wallet' }}
                </button>
              </div>
            </div>

            <!-- NAVIGATION -->
            <nav class="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible" aria-label="Patient dashboard sections">
              <button *ngFor="let t of tabs" type="button"
                      (click)="setTab(t.id)"
                      class="flex min-h-11 shrink-0 items-center gap-3 whitespace-nowrap rounded-md px-4 py-2.5 transition-all duration-200 group lg:w-full"
                      [class]="tab === t.id ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-100'"
                      [attr.aria-current]="tab === t.id ? 'page' : null">
                <span class="font-medium">{{ t.label }}</span>
                <span *ngIf="t.id === 'requests' && requests.length > 0" class="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{{ requests.length }}</span>
              </button>
            </nav>

            <!-- BOTTOM ACTIONS -->
            <div class="mt-3 flex gap-2 border-t border-slate-200 pt-3 lg:mt-6 lg:flex-col lg:pt-4">
              <button (click)="logoutAndRedirect()"
                      class="btn-logout flex min-h-11 items-center gap-3 rounded-md px-4 py-2.5 transition-all duration-200 group lg:w-full">
                <span class="font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </aside>

        <!-- MAIN CONTENT -->
        <main class="mx-auto w-full min-w-0 max-w-[1480px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div *ngIf="feedbackMessage" role="status" aria-live="polite"
               class="fixed right-4 top-4 z-[100] flex max-w-[calc(100vw-2rem)] items-start gap-3 border px-4 py-3 shadow-lg sm:right-6 sm:top-6 sm:max-w-md"
               [class]="feedbackError ? 'border-red-200 bg-red-50 text-red-800' : 'border-primary-200 bg-primary-50 text-primary-900'">
            <p class="m-0 flex-1 text-sm font-medium">{{ feedbackMessage }}</p>
            <button type="button" (click)="feedbackMessage = ''" aria-label="Dismiss message" class="min-h-6 border-0 bg-transparent px-1 text-lg leading-none">×</button>
          </div>
      <!-- RECENT ACCOUNT UPDATE -->
      <div *ngIf="lastTx" class="mb-6 rounded-2xl border-l-4 p-5 bg-white shadow-sm border border-slate-100"
           [class]="lastTx.pending ? 'border-l-orange-500' : 'border-l-accent-500'">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="m-0 text-sm font-bold text-ink">{{ lastTx.label }}</h2>
            <p class="m-0 text-xs text-muted">
              {{ lastTx.pending
                ? 'Your request was sent. We will update this message when it is confirmed.'
                : 'Your activity has been recorded and can be reviewed here.' }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <details class="text-xs"><summary class="cursor-pointer">Technical details</summary><code class="mt-1 block max-w-xs break-all rounded bg-gray-100 px-2 py-1 font-mono">{{ lastTx.tx_hash }}</code></details>
            <a *ngIf="!isPendingTx(lastTx.tx_hash)"
               [href]="etherscanUrl(lastTx.tx_hash)" target="_blank" rel="noopener"
               class="btn-secondary text-sm">
              Open optional activity details
            </a>
            <button (click)="lastTx = null" aria-label="Dismiss"
                    class="cursor-pointer border-none bg-transparent text-lg leading-none text-slate-500 hover:text-slate-900 hover:bg-slate-100">×</button>
          </div>
        </div>
      </div>

      <!-- PENDING REQUESTS BANNER (visible on every tab) -->
      <div *ngIf="requests.length > 0 && tab === 'dashboard'" class="card mb-6 border-l-4 border-l-accent-500 p-5">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="m-0 text-lg font-bold">Doctor waiting for your answer</h2>
            <p class="m-0 text-sm text-muted">Approving gives this doctor access for 7 days. You can review or remove access from Permissions.</p>
          </div>
          <button (click)="setTab('requests')"
                  class="btn-secondary text-sm">
            See all requests
          </button>
        </div>
        <div *ngFor="let req of requests" class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 border border-gray-100 p-4 last:mb-0 transition hover:bg-gray-100">
          <div>
            <p class="m-0 font-bold text-ink">Dr. {{ req.doctor_name }}</p>
            <p class="m-0 text-sm text-muted">
              {{ req.facility_id }} · {{ req.reason || 'wants to view your records' }}
              · {{ req.created_at | date:'short' }}
            </p>
          </div>
          <div class="flex gap-2">
            <button (click)="approve(req)" [disabled]="busyRequest === req.id"
                    class="btn-primary text-sm px-4 py-2 disabled:opacity-50">
              Accept
            </button>
            <button (click)="reject(req)" [disabled]="busyRequest === req.id"
                    class="btn-secondary text-sm px-4 py-2 !border-red-500 !text-red-500 hover:!bg-red-50 disabled:opacity-50">
              Reject
            </button>
          </div>
        </div>
      </div>

          <!-- RECORDS (Longitudinal Care Journey across all hospitals) -->
          <div *ngIf="tab === 'records'" class="space-y-6 animate-fade-in">
            <!-- Header -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
                  <span>Your Care History</span>
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white text-slate-700 border border-slate-200">
                    <span class="w-2 h-2 rounded-full bg-slate-400"></span>
                    Care across hospitals
                  </span>
                </h1>
                <p class="text-sm text-slate-500 mt-1 max-w-3xl leading-relaxed">
                  Review your care across hospitals, including visits, measurements, diagnoses, treatments, and the clinicians who recorded them. Verification details are available when recorded.
                </p>
              </div>
            </div>

            <!-- HOSPITAL CARE JOURNEY (Where care started to where it ended) -->
            <div *ngIf="careJourneyFacilities.length > 0" class="card bg-white p-5 sm:p-6">
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2.5">
                  <div class="w-8 h-8 rounded-lg bg-white text-slate-600 flex items-center justify-center border border-slate-200">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                  </div>
                  <div>
                    <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wider">Hospital Care Progression (Origin &rarr; Transfers)</h2>
                    <p class="text-xs text-slate-600">Your care history from each facility</p>
                  </div>
                </div>
                <span class="text-xs font-mono font-medium text-slate-700 bg-white px-2.5 py-1 rounded-full border border-slate-200">
                  {{ careJourneyFacilities.length }} Facility Stops
                </span>
              </div>

              <!-- Stepper Chain -->
              <div class="flex flex-col sm:flex-row sm:items-center gap-3 overflow-x-auto pb-2 pt-1">
                <div *ngFor="let fac of careJourneyFacilities; let i = index; let last = last" class="flex items-center gap-3 flex-shrink-0">
                  <div class="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 min-w-[200px]">
                    <div class="w-7 h-7 rounded-full bg-white text-slate-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {{ i + 1 }}
                    </div>
                    <div>
                      <p class="text-xs text-slate-600 font-medium">
                        {{ i === 0 ? 'Initial Facility' : (last ? 'Current / Latest' : 'Transfer Facility') }}
                      </p>
                      <p class="text-sm font-bold text-slate-900 capitalize truncate max-w-[160px]">{{ fac.name }}</p>
                      <p *ngIf="fac.doctor" class="text-[11px] text-slate-600 truncate max-w-[160px]">Dr. {{ fac.doctor }}</p>
                    </div>
                  </div>
                  <svg *ngIf="!last" class="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                  </svg>
                </div>
              </div>
            </div>

            <!-- 4 Summary Stat Cards -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div class="dashboard-metric">
                <span class="dashboard-metric-icon" aria-hidden="true">01</span><div>
                <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Care Events</p>
                <p class="text-2xl font-extrabold text-slate-900">{{ allMedicalHistoryItemsRaw.length }}</p>
                <p class="text-xs text-slate-500 mt-0.5">Clinical encounters recorded</p>
                </div>
              </div>
              <div class="dashboard-metric">
                <span class="dashboard-metric-icon" aria-hidden="true">02</span><div>
                <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Facilities Visited</p>
                <p class="text-2xl font-extrabold text-slate-900">{{ totalCareFacilitiesCount }}</p>
                <p class="text-xs text-slate-500 mt-0.5">Hospitals in your care journey</p>
                </div>
              </div>
              <div class="dashboard-metric">
                <span class="dashboard-metric-icon" aria-hidden="true">03</span><div>
                <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Doctors Engaged</p>
                <p class="text-2xl font-extrabold text-slate-900">{{ totalDoctorsEngagedCount }}</p>
                <p class="text-xs text-slate-500 mt-0.5">Attending physicians & staff</p>
                </div>
              </div>
              <div class="dashboard-metric">
                <span class="dashboard-metric-icon" aria-hidden="true">04</span><div>
                <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Records with verification</p>
                <p class="text-2xl font-extrabold text-slate-900">{{ onChainVerifiedEventsCount }}</p>
                <p class="text-xs text-slate-500 mt-0.5">Record details checked</p>
                </div>
              </div>
            </div>

            <!-- Filter Buttons -->
            <div class="flex items-center gap-2 overflow-x-auto pb-1">
              <button type="button" (click)="setHistoryFilter('all')"
                      class="px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      [class]="historyFilter === 'all' ? 'bg-primary-600 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'">
                All Events ({{ allMedicalHistoryItemsCount('all') }})
              </button>
              <button type="button" (click)="setHistoryFilter('measurements')"
                      class="px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      [class]="historyFilter === 'measurements' ? 'bg-primary-600 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'">
                Clinical Measurements ({{ allMedicalHistoryItemsCount('measurements') }})
              </button>
              <button type="button" (click)="setHistoryFilter('records')"
                      class="px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      [class]="historyFilter === 'records' ? 'bg-primary-600 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'">
                Diagnoses & Lab Records ({{ allMedicalHistoryItemsCount('records') }})
              </button>
              <button type="button" (click)="setHistoryFilter('hospitals')"
                      class="px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      [class]="historyFilter === 'hospitals' ? 'bg-primary-600 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'">
                Hospital Referrals ({{ allMedicalHistoryItemsCount('hospitals') }})
              </button>
            </div>

            <!-- List of Medical Care Events -->
            <div *ngIf="filteredMedicalHistoryItems.length > 0" class="space-y-4">
              <div *ngFor="let item of filteredMedicalHistoryItems" class="card hover:shadow-md transition-shadow duration-200">
                <!-- Top Row: Category Pill, Hospital Badge, Date -->
                <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div class="flex items-center gap-2">
                    <span class="px-2.5 py-1 text-xs font-bold rounded-lg uppercase tracking-wide"
                          [class]="item.category === 'measurement' ? 'bg-white text-slate-700 border border-slate-200' : (item.category === 'record' ? 'bg-white text-slate-700 border border-slate-200' : 'bg-white text-slate-700 border border-slate-200')">
                      {{ item.categoryLabel }}
                    </span>
                    <span class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white text-slate-700 border border-slate-200 flex items-center gap-1 capitalize">
                      <svg class="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                      {{ item.facility }}
                    </span>
                  </div>
                  <span class="text-xs text-slate-500 font-medium">
                    {{ item.date ? (item.date | date:'medium') : 'Date recorded' }}
                  </span>
                </div>

                <!-- Middle Row: Responsible Doctor & What Was Measured / Found -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
                  <!-- Responsible Doctor Box -->
                  <div class="p-3.5 bg-white rounded-xl border border-slate-200 flex items-start gap-3">
                    <div class="w-9 h-9 rounded-xl bg-white text-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                      </svg>
                    </div>
                    <div class="min-w-0">
                      <p class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Responsible Clinician</p>
                      <p class="text-sm font-bold text-slate-900 truncate">{{ item.doctor }}</p>
                      <p *ngIf="item.doctorLicense" class="text-xs text-slate-500">License: {{ item.doctorLicense }}</p>
                      <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 mt-1">
                        <svg class="w-3 h-3 text-slate-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                        Consent Authorized
                      </span>
                    </div>
                  </div>

                  <!-- What Was Done & Result Box -->
                  <div class="p-3.5 bg-white rounded-xl border border-slate-200">
                    <p class="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">What Was Measured & Result</p>
                    
                    <!-- If Measurement -->
                    <div *ngIf="item.category === 'measurement'">
                      <p class="text-xs font-semibold text-slate-700">{{ item.title }}</p>
                      <p class="text-2xl font-black text-slate-900 mt-0.5">
                        {{ item.value }} <span class="text-sm font-semibold text-slate-500">{{ item.unit }}</span>
                      </p>
                      <p *ngIf="item.notes" class="text-xs text-slate-600 mt-1 italic">{{ item.notes }}</p>
                    </div>

                    <!-- If Record -->
                    <div *ngIf="item.category === 'record'">
                      <p class="text-sm font-bold text-slate-900">{{ item.title }}</p>
                      <div *ngIf="item.data" class="mt-1 space-y-1">
                        <div *ngFor="let entry of entries(item.data)" class="text-xs flex gap-2">
                          <span class="font-semibold text-slate-600 capitalize">{{ entry.key }}:</span>
                          <span class="text-slate-900">{{ entry.value }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- If Referral -->
                    <div *ngIf="item.category === 'referral'">
                      <p class="text-sm font-bold text-slate-900">{{ item.title }}</p>
                      <p *ngIf="item.notes" class="text-xs text-slate-600 mt-1"><span class="font-semibold">Reason:</span> {{ item.notes }}</p>
                      <span class="inline-block mt-1 text-[11px] font-bold uppercase px-2 py-0.5 rounded"
                            [class]="item.status === 'ACCEPTED' ? 'bg-white text-slate-700 border border-slate-200' : 'bg-white text-slate-700 border border-slate-200'">
                        {{ item.status }}
                      </span>
                    </div>
                  </div>
                </div>

                <div class="mt-3 rounded-xl border border-slate-200 bg-white p-4">
                  <p class="text-sm font-semibold text-slate-900">Record review</p>
                  <p class="mt-1 text-sm text-slate-700">
                    <span *ngIf="item.verified">A record check is available for this entry.</span>
                    <span *ngIf="!item.verified">A record check is not available yet.</span>
                    This can help identify changes to saved information, but it does not confirm medical accuracy.
                  </p>
                </div>
              </div>
            </div>

            <!-- Empty State -->
            <div *ngIf="filteredMedicalHistoryItems.length === 0" class="card py-12 text-center">
              <div class="w-16 h-16 bg-white border border-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-1">No Care Events Found</h3>
              <p class="text-sm text-slate-500 max-w-sm mx-auto">No clinical records match the selected filter. Try selecting "All Events" to view all medical history.</p>
            </div>
          </div>

          <!-- MEASUREMENTS (Clinical Vitals with Record Review) -->
          <div *ngIf="tab === 'measurements'" class="space-y-6 animate-fade-in">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <span>Clinical Measurements & Vitals</span>
                  <span class="text-xs px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 font-semibold border border-teal-200">
                    {{ data?.measurements?.length || 0 }} Readings
                  </span>
                </h1>
                <p class="text-slate-600 text-sm mt-1">
                  Clinical measurements recorded by your care team. Where available, you can review whether the saved record details have been checked.
                </p>
              </div>
            </div>

            <div class="card p-0 overflow-hidden">
              <div class="overflow-x-auto">
                <table *ngIf="data?.measurements?.length" class="w-full text-left text-sm">
                  <thead>
                    <tr class="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <th class="px-5 py-3.5">Date & Time</th>
                      <th class="px-5 py-3.5">Measurement</th>
                      <th class="px-5 py-3.5">Result</th>
                      <th class="px-5 py-3.5">Doctor Responsible</th>
                      <th class="px-5 py-3.5">Hospital</th>
                      <th class="px-5 py-3.5">Record check</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    <tr *ngFor="let m of data.measurements" class="hover:bg-slate-50/70 transition-colors">
                      <td class="px-5 py-4 whitespace-nowrap text-slate-700 font-medium">
                        {{ m.date | date:'short' }}
                      </td>
                      <td class="px-5 py-4 whitespace-nowrap">
                        <span class="font-bold text-slate-900">{{ m.kind }}</span>
                        <p *ngIf="m.notes" class="text-xs text-slate-500 italic mt-0.5 max-w-xs truncate">{{ m.notes }}</p>
                      </td>
                      <td class="px-5 py-4 whitespace-nowrap">
                        <span class="text-base font-extrabold text-slate-900">{{ m.value }}</span>
                        <span class="text-xs font-semibold text-slate-500 ml-1">{{ m.unit }}</span>
                      </td>
                      <td class="px-5 py-4 whitespace-nowrap">
                        <div class="flex items-center gap-1.5">
                          <svg class="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                          <span class="font-semibold text-slate-800">{{ m.doctor || 'Attending Physician' }}</span>
                        </div>
                        <span *ngIf="m.doctor_license" class="text-[11px] text-slate-400 block pl-5">Lic: {{ m.doctor_license }}</span>
                      </td>
                      <td class="px-5 py-4 whitespace-nowrap text-slate-700 capitalize font-medium">
                        {{ m.hospital || 'Hospital Facility' }}
                      </td>
                      <td class="px-5 py-4 whitespace-nowrap">
                        <div class="flex items-center gap-2">
                          <a *ngIf="m.tx_hash && !m.tx_hash.startsWith('PENDING')"
                             [href]="'https://sepolia.etherscan.io/tx/' + m.tx_hash"
                             target="_blank" rel="noopener"
                             class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold hover:bg-emerald-100 transition-colors">
                            <span>Checked</span>
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                          </a>
                          <span *ngIf="!m.tx_hash || m.tx_hash.startsWith('PENDING')" class="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Being checked
                          </span>
                          <button *ngIf="m.record_hash" type="button" (click)="copyHash(m.record_hash)"
                                  class="text-xs text-slate-500 hover:text-slate-800 underline font-mono cursor-pointer" title="Copy record reference">
                            Reference
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div *ngIf="!data.measurements.length" class="p-12 text-center">
                <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg class="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                </div>
                <h3 class="text-lg font-bold text-slate-900 mb-1">No Measurements Yet</h3>
                <p class="text-sm text-slate-500">Measurements recorded by your care team will appear here with their available review status.</p>
              </div>
            </div>
          </div>

          <!-- REFERRALS -->
          <section *ngIf="tab === 'referrals'" class="space-y-6 animate-fade-in" aria-labelledby="referrals-title">
            <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h1 id="referrals-title" class="text-2xl font-bold text-slate-900">My Referrals</h1>
                <p class="mt-1 text-sm text-slate-600">Review referral requests, their destination, and response status.</p>
              </div>
              <button type="button" (click)="referralModal = true" class="btn-primary min-h-11 px-5">Request Referral</button>
            </div>

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <article class="bg-white border border-slate-200 rounded-xl p-4"><p class="text-sm text-slate-600">Total referrals</p><p class="mt-2 text-2xl font-semibold text-slate-900">{{ data.referrals.length }}</p></article>
              <article class="bg-white border border-slate-200 rounded-xl p-4"><p class="text-sm text-slate-600">Accepted</p><p class="mt-2 text-2xl font-semibold text-slate-900">{{ countReferralsByStatus('ACCEPTED') }}</p></article>
              <article class="bg-white border border-slate-200 rounded-xl p-4"><p class="text-sm text-slate-600">Pending</p><p class="mt-2 text-2xl font-semibold text-slate-900">{{ countReferralsByStatus('PENDING') }}</p></article>
              <article class="bg-white border border-slate-200 rounded-xl p-4"><p class="text-sm text-slate-600">Declined</p><p class="mt-2 text-2xl font-semibold text-slate-900">{{ countReferralsByStatus('DECLINED') }}</p></article>
            </div>

            <div *ngIf="data.referrals.length; else noReferrals" class="space-y-3">
              <article *ngFor="let r of data.referrals" class="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
                <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div class="min-w-0">
                    <h2 class="text-base font-semibold text-slate-900 break-words">{{ r.to_hospital }}</h2>
                    <p class="mt-1 text-sm text-slate-600">Referral #{{ r.id }} <span aria-hidden="true">·</span> Sent {{ (r.date || r.created_at) | date:'mediumDate' }}</p>
                  </div>
                  <span class="inline-flex w-fit items-center rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700">{{ r.status }}</span>
                </div>
                <div *ngIf="r.reason" class="mt-4 border-t border-slate-100 pt-3">
                  <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Reason</p>
                  <p class="mt-1 text-sm leading-6 text-slate-800">{{ r.reason }}</p>
                </div>
                <div class="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-slate-100 pt-3 text-sm text-slate-600">
                  <p><span class="font-medium text-slate-700">From:</span> <span *ngIf="r.from_doctor">Dr. {{ r.from_doctor }}</span><span *ngIf="!r.from_doctor && r.from_hospital">{{ r.from_hospital }}</span><span *ngIf="!r.from_doctor && !r.from_hospital">Self-requested</span></p>
                  <p *ngIf="r.responded_at">Responded {{ r.responded_at | date:'mediumDate' }}<span *ngIf="r.responded_by"> by {{ r.responded_by }}</span></p>
                  <p *ngIf="!r.responded_at" class="text-slate-500">Awaiting hospital response</p>
                </div>
              </article>
            </div>
            <ng-template #noReferrals>
              <div class="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center">
                <h2 class="text-lg font-semibold text-slate-900">No referrals yet</h2>
                <p class="mx-auto mt-2 max-w-md text-sm text-slate-600">When a referral is created for you, its destination and status will appear here.</p>
                <button type="button" (click)="referralModal = true" class="btn-primary mt-5 min-h-11 px-5">Request a referral</button>
              </div>
            </ng-template>
          </section>

          <!-- PERMISSIONS -->
          <div *ngIf="tab === 'permissions'" class="space-y-6 animate-fade-in">
            <div>
              <h1 class="text-2xl font-bold text-slate-900 mb-2">Grant Access to a Doctor</h1>
              <p class="text-slate-600">Search for a doctor by name or license number, then choose how long they may view your records.</p>
            </div>

            <!-- LIVE BREAK-GLASS WINDOW (emergency access) -->
            <div *ngIf="walletGrants?.emergency?.length" class="card border-2 border-red-300 bg-red-50">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-lg font-bold text-red-900">Emergency access in progress (break-glass)</h2>
                <span class="rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                  {{ walletGrants?.emergency?.length }} active
                </span>
              </div>
              <p class="mt-2 text-sm text-red-800">
                A doctor opened your record under break-glass because you could not
                communicate or give consent. Each access is recorded in your activity history, and the window
                closes automatically after one hour, and you can end it sooner.
              </p>
              <div *ngFor="let e of walletGrants?.emergency" class="mt-3 rounded-xl border border-red-200 bg-white p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold text-slate-900">Dr. {{ e.doctor_name }}</p>
                    <p class="text-xs text-slate-500">
                      {{ e.facility_id }}<span *ngIf="e.doctor_license"> • {{ e.doctor_license }}</span>
                    </p>
                    <p class="mt-2 text-sm text-slate-700">
                      <span class="font-semibold">Reason:</span> {{ e.reason || 'No reason recorded' }}
                    </p>
                    <p class="mt-1 text-xs text-slate-500">Started {{ e.started_at | date:'medium' }}</p>
                  </div>
                  <div class="text-right">
                    <p class="text-xs text-slate-500 uppercase tracking-wide">Time left</p>
                    <p class="text-xl font-bold text-red-700" aria-live="polite">{{ emergencyCountdown(e) }}</p>
                    <p class="text-[11px] text-slate-500">ends {{ e.expires_at | date:'shortTime' }}</p>
                    <button type="button" (click)="revokeEmergency(e)" [disabled]="emergencyBusy"
                            class="mt-2 cursor-pointer rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
                      {{ emergencyBusy ? 'Ending…' : 'End emergency access' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="grant-access-title">
              <div class="mb-5 border-b border-slate-100 pb-4">
                <h2 id="grant-access-title" class="m-0 text-lg font-semibold text-slate-900">Choose access details</h2>
                <p class="mb-0 mt-1 text-sm text-slate-600">Only the doctor you select can view your records for the time you choose.</p>
              </div>

              <div class="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
                <div class="relative flex flex-col gap-2">
                  <label for="permission-doctor" class="text-sm font-semibold text-slate-800">Find a doctor</label>
                  <input id="permission-doctor" [(ngModel)]="doctorQuery" (ngModelChange)="onDoctorQueryChanged()" (focus)="showSuggestions = true" (blur)="showSuggestions = false"
                         autocomplete="off" aria-describedby="doctor-search-help" [attr.aria-expanded]="showSuggestions && doctors.length > 0" aria-controls="doctor-suggestions"
                         placeholder="Search by name or licence number"
                         class="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary-600 focus:ring-2 focus:ring-primary-600/15" />
                  <p id="doctor-search-help" class="m-0 text-xs text-slate-500">Choose a doctor from the results to confirm their identity.</p>
                  <ul *ngIf="showSuggestions && doctors.length" id="doctor-suggestions" role="listbox" aria-label="Matching doctors" class="absolute top-[calc(100%+3.5rem)] z-50 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    <li *ngFor="let d of doctors" role="option" [attr.aria-selected]="selectedDoctor?.license_no === d.license_no" (mousedown)="selectDoctor(d)" class="cursor-pointer border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50">
                      <p class="m-0 font-semibold text-slate-900">{{ d.full_name }}</p>
                      <p class="m-0 mt-0.5 text-xs text-slate-600">Licence {{ d.license_no }} · {{ d.facility_id }}</p>
                    </li>
                  </ul>
                  <p *ngIf="showSuggestions && !doctorLoading && doctors.length === 0" class="m-0 text-sm text-slate-600" role="status">No doctors found. Check the name or licence number and try again.</p>
                  <p *ngIf="doctorLoading" class="m-0 text-sm text-slate-600" role="status">Searching for doctors…</p>
                </div>

                <div class="flex flex-col gap-2">
                  <label for="permission-days" class="text-sm font-semibold text-slate-800">How many days?</label>
                  <div class="relative">
                    <input id="permission-days" type="number" [(ngModel)]="grant.days" min="1" max="90" aria-describedby="permission-days-help"
                           class="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 pr-14 text-sm text-slate-900 outline-none transition focus:border-primary-600 focus:ring-2 focus:ring-primary-600/15" />
                    <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">days</span>
                  </div>
                  <p id="permission-days-help" class="m-0 text-xs text-slate-500">Choose from 1 to 90 days. You can revoke access sooner.</p>
                </div>
              </div>

              <div class="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div aria-live="polite">
                  <p class="m-0 text-xs font-medium uppercase tracking-wide text-slate-500">Access will be given to</p>
                  <p class="m-0 mt-1 text-sm font-semibold text-slate-900">
                    <ng-container *ngIf="selectedDoctor">{{ selectedDoctor.full_name }} <span class="font-normal text-slate-600">· Licence {{ selectedDoctor.license_no }}</span></ng-container>
                    <span *ngIf="!selectedDoctor" class="font-normal text-slate-600">Select a doctor from the search results</span>
                  </p>
                </div>
                <button type="button" (click)="grantAccess()" [disabled]="busy || !selectedDoctor || grant.days < 1 || grant.days > 90" class="btn-primary min-h-11 w-full sm:w-auto">
                  {{ busy ? 'Granting access…' : 'Confirm access' }}
                </button>
              </div>
            </section>

            <!-- ACTIVE ROUTINE DOCTOR PERMISSIONS -->
            <div *ngIf="walletGrants?.active_grants?.length" class="card border border-primary-200 bg-white">
              <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 class="text-lg font-bold text-slate-900">Active Doctor Access Grants</h2>
                <span class="rounded-full bg-emerald-100 text-emerald-800 px-3 py-1 text-xs font-bold uppercase tracking-wide">
                  {{ walletGrants?.active_grants?.length }} active
                </span>
              </div>
              <p class="text-sm text-slate-600 mb-4">
                These doctors currently have permission to view your medical records. You can remove their access at any time.
              </p>
              <div class="space-y-3">
                <div *ngFor="let g of walletGrants?.active_grants" class="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p class="font-semibold text-slate-900">Dr. {{ g.doctor_name }}</p>
                    <p class="text-xs text-slate-500">
                      {{ g.facility_id }}<span *ngIf="g.doctor_license"> • License: {{ g.doctor_license }}</span>
                    </p>
                    <p class="text-xs text-slate-500 mt-1">
                      Granted: {{ g.created_at | date:'mediumDate' }} • Expires: <span class="font-medium text-slate-700">{{ g.expires_at | date:'medium' }}</span>
                    </p>
                    <details *ngIf="g.tx_hash" class="mt-1"><summary class="min-h-10 cursor-pointer text-xs text-slate-500">Show technical details</summary><code class="block max-w-xs break-all text-[11px] text-slate-500">{{ g.tx_hash }}</code></details>
                  </div>
                  <div>
                    <button type="button" (click)="revokeRoutineAccess(g)" [disabled]="busy"
                            class="cursor-pointer rounded-lg bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50">
                      {{ busy ? 'Revoking…' : 'Revoke Access' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>          <!-- REQUESTS -->
          <div *ngIf="tab === 'requests'" class="space-y-6 animate-fade-in">
            <div>
              <h1 class="text-2xl font-bold text-slate-900 mb-2">Access Requests</h1>
              <p class="text-slate-600">Review doctors requesting access to your medical records. Approving gives access for 7 days.</p>
            </div>
            <div *ngFor="let req of requests" class="card">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="space-y-3">
                  <div>
                    <h3 class="font-bold text-slate-900 text-lg">Dr. {{ req.doctor_name }}</h3>
                    <p class="text-sm text-slate-500">Facility: {{ req.facility_id }}</p>
                  </div>
                  <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <p class="text-sm text-slate-700 italic">"{{ req.reason }}"</p>
                  </div>
                  <p class="text-xs text-slate-500">Requested {{ req.created_at | date:'medium' }}</p>
                </div>
                <div class="flex gap-2">
                  <button (click)="approve(req)" class="btn-accent w-full sm:w-auto">Approve</button>
                  <button (click)="reject(req)" class="btn-secondary !border-red-500 !text-red-600 hover:!bg-red-50 w-full sm:w-auto">Reject</button>
                </div>
              </div>
            </div>
            <div *ngIf="requests.length === 0" class="card">
              <div class="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">No Pending Requests</h3>
              <p class="text-slate-600">You're all caught up!</p>
            </div>
          </div>
          <!-- CUSTODIAL WALLET -->
          <section *ngIf="tab === 'wallet' && walletActivity" class="space-y-6 animate-fade-in" aria-labelledby="wallet-title">
            <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h1 id="wallet-title" class="text-2xl font-bold text-slate-900">Your secure account</h1>
                <p class="mt-1 max-w-2xl text-sm leading-6 text-slate-600">A secure account reference used by the service to keep track of record activity. You can review your activity below.</p>
              </div>
              <details class="text-sm text-slate-600"><summary class="min-h-11 cursor-pointer">Technical account details</summary><p class="mt-1">This account uses a test environment.</p></details>
            </div>

            <section class="rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="wallet-address-title">
              <div class="flex flex-col gap-4">
                <div>
                  <h2 id="wallet-address-title" class="text-base font-semibold text-slate-900">Account details</h2>
                  <p class="mt-1 text-sm text-slate-600">This service-managed account helps associate activity with your health record. It is not your medical record.</p>
                </div>
                <details class="border-t border-slate-100 pt-3">
                  <summary class="min-h-11 cursor-pointer text-sm font-medium text-slate-700">View optional account reference</summary>
                  <div class="flex flex-col gap-3 pt-2 lg:flex-row lg:items-center">
                    <code *ngIf="walletVisible" class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 break-all select-all">{{ walletActivity.wallet_address }}</code>
                    <code *ngIf="!walletVisible" class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 break-all">{{ walletActivity.wallet_address | slice:0:6 }}••••••••••••••••••••••••••••••••{{ walletActivity.wallet_address | slice:-4 }}</code>
                    <div class="flex flex-wrap gap-2">
                      <button type="button" (click)="walletVisible = !walletVisible" class="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700">{{ walletVisible ? 'Hide reference' : 'Show reference' }}</button>
                      <button type="button" (click)="copyWalletAddress()" class="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700">{{ copiedWallet ? 'Copied' : 'Copy reference' }}</button>
                      <a [href]="'https://sepolia.etherscan.io/address/' + walletActivity.wallet_address" target="_blank" rel="noopener noreferrer" class="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700">Open account activity details</a>
                    </div>
                  </div>
                </details>
                <dl class="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
                  <div><dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Account holder</dt><dd class="mt-1 text-sm font-medium text-slate-900">{{ walletActivity.full_name }}</dd></div>
                  <div><dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Health ID</dt><dd class="mt-1 break-all font-mono text-sm text-slate-900">#{{ walletActivity.health_id }}</dd></div>
                  <div><dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Account management</dt><dd class="mt-1 text-sm font-medium text-slate-900">Managed by the service</dd></div>
                </dl>
              </div>
            </section>

            <div class="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <article class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-sm text-slate-600">Recorded events</p><p class="mt-2 text-2xl font-semibold text-slate-900">{{ walletActivity.activityCount }}</p><p class="mt-1 text-xs text-slate-500">Account activity</p></article>
              <article class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-sm text-slate-600">Active grants</p><p class="mt-2 text-2xl font-semibold text-slate-900">{{ walletGrants?.activeCount || 0 }}</p><p class="mt-1 text-xs text-slate-500">Current doctor permissions</p></article>
              <article class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-sm text-slate-600">All-time grants</p><p class="mt-2 text-2xl font-semibold text-slate-900">{{ walletGrants?.totalGrantsEver || 0 }}</p><p class="mt-1 text-xs text-slate-500">Permissions issued</p></article>
              <article class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-sm text-slate-600">Pending requests</p><p class="mt-2 text-2xl font-semibold text-slate-900">{{ walletActivity.pendingOperations }}</p><p class="mt-1 text-xs text-slate-500">Waiting for a response</p></article>
            </div>

            <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <section class="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4" aria-labelledby="wallet-activity-title">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div><h2 id="wallet-activity-title" class="text-base font-semibold text-slate-900">Account activity</h2><p class="mt-1 text-sm text-slate-600">Most recent event and permission updates.</p></div>
                  <button type="button" (click)="loadWalletProfile()" class="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Refresh</button>
                </div>
                <div class="border-t border-slate-100 pt-3"><p class="text-xs font-medium uppercase tracking-wide text-slate-500">Last recorded event</p><p class="mt-1 text-sm text-slate-900">{{ walletActivity.lastActivityAt ? (walletActivity.lastActivityAt * 1000 | date:'medium') : 'No activity recorded yet' }}</p></div>
                <div class="border-t border-slate-100 pt-3"><div class="flex flex-wrap items-center justify-between gap-2"><p class="text-xs font-medium uppercase tracking-wide text-slate-500">Latest activity reference</p></div><details *ngIf="walletActivity.lastTxHash" class="mt-2"><summary class="min-h-11 cursor-pointer text-sm text-slate-600">Show technical reference</summary><code class="block break-all rounded-lg bg-slate-50 p-3 text-xs text-slate-800 select-all">{{ walletActivity.lastTxHash }}</code></details><p *ngIf="!walletActivity.lastTxHash" class="mt-1 text-sm text-slate-600">No confirmation details available.</p></div>
                <div *ngIf="walletGrants" class="border-t border-slate-100 pt-3"><div class="flex flex-wrap items-center justify-between gap-2"><p class="text-xs font-medium uppercase tracking-wide text-slate-500">Most recent access grant</p><span *ngIf="walletGrants.expiringSoon > 0" class="text-sm text-slate-700">{{ walletGrants.expiringSoon }} expiring soon</span></div><p class="mt-1 text-sm font-medium text-slate-900">{{ walletGrants.lastGrantDoctor || 'No grants issued yet' }}</p><p *ngIf="walletGrants.lastGrantAt" class="mt-1 text-sm text-slate-600">Issued {{ walletGrants.lastGrantAt | date:'medium' }}</p></div>
              </section>
              <section class="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="wallet-management-title">
                <h2 id="wallet-management-title" class="text-base font-semibold text-slate-900">How wallet management works</h2>
                <dl class="mt-4 divide-y divide-slate-100">
                  <div class="py-3"><dt class="text-sm font-medium text-slate-900">Custody</dt><dd class="mt-1 text-sm leading-6 text-slate-600">The platform manages the wallet account for this service. You do not need a browser wallet to use it.</dd></div>
                  <div class="py-3"><dt class="text-sm font-medium text-slate-900">Network</dt><dd class="mt-1 text-sm leading-6 text-slate-600">This account uses a test environment. Some technical account details may be visible when you open the external activity page.</dd></div>
                  <div class="py-3"><dt class="text-sm font-medium text-slate-900">Medical record privacy</dt><dd class="mt-1 text-sm leading-6 text-slate-600">The wallet view shows address and activity details. Manage clinician permissions from the Permissions section.</dd></div>
                </dl>
              </section>
            </div>
          </section>

          <!-- PROFILE -->
          <div *ngIf="tab === 'profile' && profileInfo" class="space-y-6 animate-fade-in">
            <div>
              <h1 class="text-2xl font-bold text-slate-900 mb-2">Profile</h1>
              <p class="text-slate-600">
                Your personal account details. Full name and phone are editable.
                Health ID and wallet address are assigned by the platform and cannot be changed.
              </p>
            </div>

            <!-- Read-only identity fields -->
            <div class="card">
              <h2 class="text-lg font-bold text-slate-900 mb-4">Account identity</h2>
              <dl class="grid grid-cols-2 gap-4">
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Full name</p>
                  <p class="text-sm font-semibold text-slate-900">{{ profileInfo.full_name }}</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Health ID</p>
                  <p class="text-sm font-mono font-semibold text-slate-900">{{ profileInfo.health_id }}</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Phone</p>
                  <p class="text-sm text-slate-900">{{ profileInfo.phone || '—' }}</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Account reference</p>
                    <button type="button" (click)="walletVisible = !walletVisible"
                            class="text-xs font-semibold text-primary-700 hover:underline"
                            [attr.aria-expanded]="walletVisible">
                      {{ walletVisible ? 'Hide wallet' : 'View wallet' }}
                    </button>
                  </div>
                  <p *ngIf="walletVisible" class="text-xs font-mono text-slate-900 break-all">{{ profileInfo.wallet_address }}</p>
                  <p *ngIf="!walletVisible" class="text-xs text-slate-500">Hidden</p>
                </div>
              </dl>
            </div>

            <!-- Editable profile form -->
            <div class="card">
              <h2 class="text-lg font-bold text-slate-900 mb-4">Edit profile</h2>
              <p class="mb-4 text-sm text-muted">
                Update your name and phone. These changes take effect immediately.
              </p>

              <div *ngIf="editMsg" class="mb-4 rounded-lg border p-3 text-sm"
                   [class.text-accent-900]="editOk" [class.bg-accent-50]="editOk" [class.border-accent-200]="editOk"
                   [class.text-red-700]="!editOk" [class.bg-red-50]="!editOk" [class.border-red-200]="!editOk">
                {{ editMsg }}
              </div>

              <form (ngSubmit)="saveProfile()" #profileForm="ngForm" class="flex flex-col gap-4">
                <label class="flex flex-col gap-1.5">
                  <span class="text-[13px] font-semibold text-ink">Full name</span>
                  <input
                    type="text"
                    name="full_name"
                    [(ngModel)]="editName"
                    required
                    autocomplete="name"
                    class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </label>

                <label class="flex flex-col gap-1.5">
                  <span class="text-[13px] font-semibold text-ink">Phone (optional)</span>
                  <input
                    type="tel"
                    name="phone"
                    [(ngModel)]="editPhone"
                    autocomplete="tel"
                    class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </label>

                <button
                  type="submit"
                  [disabled]="editBusy || !profileForm.valid"
                  class="mt-2 w-full rounded-lg bg-primary-500 px-3.5 py-3.5 text-base font-semibold text-ink transition-colors hover:bg-primary-400 disabled:opacity-50"
                >
                  {{ editBusy ? 'Saving…' : 'Save profile' }}
                </button>
              </form>
            </div>

            <!-- Grant summary for this profile -->
            <div *ngIf="grantSummary" class="card">
              <h2 class="text-lg font-bold text-slate-900 mb-4">Access you have granted</h2>
              <dl class="grid grid-cols-3 gap-4">
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Active grants</p>
                  <p class="text-2xl font-bold text-accent-700">{{ grantSummary.activeCount }}</p>
                  <p class="text-xs text-muted">doctors with access now</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Pending requests</p>
                  <p class="text-2xl font-bold" [class.text-red-600]="grantSummary.pendingCount > 0">{{ grantSummary.pendingCount }}</p>
                  <p class="text-xs text-muted">waiting for your answer</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Expiring soon</p>
                  <p class="text-2xl font-bold" [class.text-amber-600]="grantSummary.expiringSoon > 0">{{ grantSummary.expiringSoon }}</p>
                  <p class="text-xs text-muted">expire within 7 days</p>
                </div>
              </dl>
            </div>
          </div>

          <!-- REFERRAL SECURITY -->
          <section *ngIf="tab === 'referral-security'" class="space-y-6 animate-fade-in" aria-labelledby="referral-security-title">
            <header>
              <h1 id="referral-security-title" class="text-2xl font-bold text-slate-900">Referral Security</h1>
              <p class="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Review available referral confirmations, record verification details, and receiving-facility access events.</p>
            </header>

            <section class="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="referral-process-title">
              <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div><h2 id="referral-process-title" class="text-base font-semibold text-slate-900">What you can review here</h2><p class="mt-1 text-sm text-slate-600">Each section reflects the information currently available for a referral.</p></div>
                <span class="text-xs text-slate-500">Secure activity records</span>
              </div>
              <ol class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                <li class="rounded-lg border border-slate-200 bg-slate-50 p-4"><span class="text-xs font-semibold uppercase tracking-wide text-slate-500">01 · Referral</span><p class="mt-2 text-sm font-semibold text-slate-900">Sending and receiving facilities</p><p class="mt-1 text-sm leading-5 text-slate-600">See the referral reason, status, and response details.</p></li>
                <li class="rounded-lg border border-slate-200 bg-slate-50 p-4"><span class="text-xs font-semibold uppercase tracking-wide text-slate-500">02 · Record checks</span><p class="mt-2 text-sm font-semibold text-slate-900">Record review details</p><p class="mt-1 text-sm leading-5 text-slate-600">See what information has been checked and when.</p></li>
                <li class="rounded-lg border border-slate-200 bg-slate-50 p-4"><span class="text-xs font-semibold uppercase tracking-wide text-slate-500">03 · Access events</span><p class="mt-2 text-sm font-semibold text-slate-900">Receiving-facility views</p><p class="mt-1 text-sm leading-5 text-slate-600">Review recorded access events and their timestamps.</p></li>
              </ol>
            </section>

            <div *ngIf="referralSecurity?.referrals?.length; else noReferralSecurity" class="space-y-4">
              <article *ngFor="let r of referralSecurity!.referrals" class="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <header class="border-b border-slate-200 p-4 sm:p-5">
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div class="min-w-0"><p class="text-xs font-medium uppercase tracking-wide text-slate-500">Referral #{{ r.id }}</p><h2 class="mt-1 break-words text-lg font-semibold text-slate-900">{{ r.from_hospital }} <span aria-label="to">→</span> {{ r.to_hospital }}</h2><p class="mt-1 text-sm text-slate-600">{{ r.reason || 'No reason recorded' }}</p></div><span class="inline-flex w-fit items-center rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">{{ r.status }}</span></div>
                  <dl class="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3"><div><dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Sent</dt><dd class="mt-1 text-sm text-slate-800">{{ r.created_at | date:'medium' }}</dd></div><div><dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Response</dt><dd class="mt-1 text-sm text-slate-800">{{ r.responded_at ? (r.responded_at | date:'medium') : 'No response recorded' }}</dd></div><div><dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Responded by</dt><dd class="mt-1 text-sm text-slate-800">{{ r.responded_by || 'Not recorded' }}</dd></div></dl>
                </header>
                <div class="grid grid-cols-1 gap-4 p-4 sm:p-5 xl:grid-cols-3">
                  <section class="min-w-0 rounded-lg border border-slate-200 p-4" aria-label="Referral status"><h3 class="text-sm font-semibold text-slate-900">Referral status</h3><p *ngIf="r.on_chain_referral_accepted" class="mt-2 text-sm leading-5 text-slate-700">The receiving facility has recorded its response.</p><p *ngIf="!r.on_chain_referral_accepted && r.tx_hash && r.tx_hash.toLowerCase().startsWith('pending')" class="mt-2 text-sm leading-5 text-slate-700">The referral confirmation is still being processed.</p><p *ngIf="!r.on_chain_referral_accepted && (!r.tx_hash || !r.tx_hash.toLowerCase().startsWith('pending'))" class="mt-2 text-sm leading-5 text-slate-600">No confirmation details are available for this referral yet.</p><div *ngIf="r.on_chain_referral_tx_hash" class="mt-3 border-t border-slate-100 pt-3"><details class="mt-3 border-t border-slate-100 pt-3"><summary class="min-h-11 cursor-pointer text-sm font-medium text-slate-600">Technical details</summary><code class="mt-1 block break-all text-xs text-slate-800">{{ r.on_chain_referral_tx_hash }}</code><a *ngIf="!r.on_chain_referral_tx_hash.toLowerCase().startsWith('pending')" [href]="'https://sepolia.etherscan.io/tx/' + r.on_chain_referral_tx_hash" target="_blank" rel="noopener noreferrer" class="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-slate-700 underline underline-offset-2">Open external activity page</a></details></div></section>

                  <section class="min-w-0 rounded-lg border border-slate-200 p-4" aria-label="Transferred record checks"><h3 class="text-sm font-semibold text-slate-900">Record checks <span class="font-normal text-slate-500">({{ r.from_hospital_records.length }})</span></h3><p *ngIf="!r.from_hospital_records.length" class="mt-2 text-sm text-slate-600">No record checks are available for this referral.</p><div *ngFor="let rec of r.from_hospital_records" class="mt-3 border-t border-slate-100 pt-3 first:border-0 first:pt-0"><div class="flex flex-wrap items-start justify-between gap-2"><div><p class="text-sm font-medium text-slate-900">{{ rec.record_type || 'Clinical record' }}</p><p class="mt-1 text-xs text-slate-600">Recorded {{ rec.on_chain_timestamp ? (rec.on_chain_timestamp * 1000 | date:'medium') : (rec.created_at | date:'medium') }}</p></div><span class="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700">{{ rec.verified ? 'Matches earlier details' : 'Not yet checked' }}</span></div><details class="mt-2"><summary class="min-h-11 cursor-pointer py-2 text-sm font-medium text-slate-700">View optional record reference</summary><code class="block break-all rounded-md bg-slate-50 p-2 text-xs text-slate-800">{{ rec.record_hash }}</code><a *ngIf="rec.metadata_uri" [href]="rec.metadata_uri" target="_blank" rel="noopener noreferrer" class="mt-2 inline-flex min-h-11 items-center text-sm text-slate-700 underline underline-offset-2">Open verification link</a></details></div></section>

                  <section class="min-w-0 rounded-lg border border-slate-200 p-4" aria-label="Receiving facility access events"><h3 class="text-sm font-semibold text-slate-900">Access events <span class="font-normal text-slate-500">({{ r.receiving_hospital_views.length }})</span></h3><p *ngIf="!r.receiving_hospital_views.length" class="mt-2 text-sm text-slate-600">No record views are listed for the receiving facility.</p><div *ngFor="let v of r.receiving_hospital_views" class="mt-3 border-t border-slate-100 pt-3 first:border-0 first:pt-0"><p class="break-all text-sm font-medium text-slate-900">{{ v.accessor }}</p><p class="mt-1 text-sm text-slate-600">{{ v.role }} <span *ngIf="v.facility_id">· {{ v.facility_id }}</span></p><p class="mt-1 text-xs text-slate-500">{{ v.timestamp * 1000 | date:'medium' }}</p></div></section>
                </div>
              </article>
            </div>

            <ng-template #noReferralSecurity><div *ngIf="referralSecurity; else referralSecurityUnavailable" class="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center"><h2 class="text-lg font-semibold text-slate-900">No referral security records yet</h2><p class="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">When referral security details become available, this page will show confirmation status, record proofs, and any recorded access events.</p></div></ng-template>
            <ng-template #referralSecurityUnavailable><div class="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700" role="status">Referral security details could not be loaded. Reopen this section to try again.</div></ng-template>
          </section>

          <!-- HOW IT WORKS -->
          <section *ngIf="tab === 'how-it-works'" class="space-y-5 animate-fade-in" aria-labelledby="how-it-works-title">
            <header class="rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Patient guide</p>
              <h1 id="how-it-works-title" class="mt-1 text-2xl font-bold text-slate-900">How your care information works</h1>
              <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Your dashboard brings together information shared by your care facilities. You can review your history, respond to access requests, and see activity related to your records.</p>
            </header>

            <section class="rounded-xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="guide-steps-title">
              <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div><h2 id="guide-steps-title" class="text-lg font-semibold text-slate-900">A simple guide</h2><p class="mt-1 text-sm text-slate-600">What happens and what you can do at each step.</p></div>
                <button type="button" (click)="setTab('records')" class="btn-secondary w-full sm:w-auto">Open care history</button>
              </div>
              <ol class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <li class="rounded-lg border border-slate-200 bg-white p-4">
                  <span class="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-slate-200 px-2 text-sm font-semibold text-slate-700">1</span>
                  <h3 class="mt-3 text-base font-semibold text-slate-900">Your care team records care</h3>
                  <p class="mt-2 text-sm leading-6 text-slate-600">A participating facility adds visit notes, diagnoses, treatments, or measurements to your history.</p>
                </li>
                <li class="rounded-lg border border-slate-200 bg-white p-4">
                  <span class="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-slate-200 px-2 text-sm font-semibold text-slate-700">2</span>
                  <h3 class="mt-3 text-base font-semibold text-slate-900">A doctor may ask to view records</h3>
                  <p class="mt-2 text-sm leading-6 text-slate-600">Review the doctor's details and request before choosing whether to approve or decline.</p>
                </li>
                <li class="rounded-lg border border-slate-200 bg-white p-4">
                  <span class="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-slate-200 px-2 text-sm font-semibold text-slate-700">3</span>
                  <h3 class="mt-3 text-base font-semibold text-slate-900">You can manage access</h3>
                  <p class="mt-2 text-sm leading-6 text-slate-600">Approved access lasts for the period shown in the request. You can review or remove active access from Permissions.</p>
                </li>
                <li class="rounded-lg border border-slate-200 bg-white p-4">
                  <span class="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-slate-200 px-2 text-sm font-semibold text-slate-700">4</span>
                  <h3 class="mt-3 text-base font-semibold text-slate-900">You can review activity</h3>
                  <p class="mt-2 text-sm leading-6 text-slate-600">The activity page shows recorded visits to your records and changes to permissions when those details are available.</p>
                </li>
              </ol>
            </section>

            <div class="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <section class="rounded-xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="patient-controls-title">
                <h2 id="patient-controls-title" class="text-lg font-semibold text-slate-900">Your controls</h2>
                <p class="mt-1 text-sm text-slate-600">Go directly to the section you need.</p>
                <div class="mt-4 divide-y divide-slate-100">
                  <div class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 class="text-sm font-semibold text-slate-900">Access requests</h3><p class="mt-1 text-sm text-slate-600">Review requests from doctors and choose what to do.</p></div><button type="button" (click)="setTab('requests')" class="btn-secondary w-full sm:w-auto">Review requests</button></div>
                  <div class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 class="text-sm font-semibold text-slate-900">Permissions</h3><p class="mt-1 text-sm text-slate-600">See which doctors currently have access.</p></div><button type="button" (click)="setTab('permissions')" class="btn-secondary w-full sm:w-auto">Manage access</button></div>
                  <div class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 class="text-sm font-semibold text-slate-900">Activity</h3><p class="mt-1 text-sm text-slate-600">Review record views and permission changes.</p></div><button type="button" (click)="setTab('activity')" class="btn-secondary w-full sm:w-auto">View activity</button></div>
                </div>
              </section>

              <section class="rounded-xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="trust-title">
                <h2 id="trust-title" class="text-lg font-semibold text-slate-900">What record checks tell you</h2>
                <p class="mt-2 text-sm leading-6 text-slate-600">When a check is available, it can help show whether saved information differs from an earlier record. A successful check supports confidence that the saved copy has not changed since then.</p>
                <div class="mt-4 border-t border-slate-100 pt-4">
                  <p class="text-sm font-semibold text-slate-900">What a check cannot tell you</p>
                  <p class="mt-1 text-sm leading-6 text-slate-600">It does not confirm whether a diagnosis, measurement, or treatment is medically correct. Ask your care team if you have questions about the information in your history.</p>
                </div>
                <button type="button" (click)="setTab('referral-security')" class="btn-secondary mt-4 w-full sm:w-auto">Review referral details</button>
              </section>
            </div>
          </section>

          <!-- HEALTH SUMMARY -->
          <div *ngIf="tab === 'dashboard'" class="space-y-6 animate-fade-in">
            <header class="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p class="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Patient workspace</p>
                <h1 class="mb-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Your health overview</h1>
                <p class="m-0 max-w-2xl text-sm text-slate-600">Review your care history, measurements, and record access from one place.</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button type="button" (click)="setTab('records')" class="btn-secondary">Medical history</button>
                <button type="button" (click)="setTab('permissions')" class="btn-secondary">Manage access</button>
              </div>
            </header>

            <section aria-label="Health summary" class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article class="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
                <p class="mb-2 text-sm text-slate-500">Care events</p>
                <p class="m-0 text-3xl font-semibold tracking-tight text-slate-900">{{ allMedicalHistoryItemsRaw.length }}</p>
                <p class="mb-0 mt-2 text-xs text-slate-500">Across your medical history</p>
              </article>
              <article class="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
                <p class="mb-2 text-sm text-slate-500">Measurements</p>
                <p class="m-0 text-3xl font-semibold tracking-tight text-slate-900">{{ healthSummary ? healthSummary.total_measurements : '—' }}</p>
                <p class="mb-0 mt-2 text-xs text-slate-500">Clinical readings recorded</p>
              </article>
              <article class="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
                <p class="mb-2 text-sm text-slate-500">Facilities visited</p>
                <p class="m-0 text-3xl font-semibold tracking-tight text-slate-900">{{ totalCareFacilitiesCount }}</p>
                <p class="mb-0 mt-2 text-xs text-slate-500">In your care journey</p>
              </article>
              <article class="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
                <p class="mb-2 text-sm text-slate-500">Requests to review</p>
                <p class="m-0 text-3xl font-semibold tracking-tight text-slate-900">{{ requests.length }}</p>
                <p class="mb-0 mt-2 text-xs text-slate-500">Access requests from clinicians</p>
              </article>
            </section>

            <!-- Emergency (break-glass) alert -->
            <div *ngIf="walletGrants?.emergency?.length"
                 class="rounded-xl border-2 border-red-400 bg-red-50 p-4" role="alert">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="font-bold text-red-900">
                    Emergency access to your records is open right now
                  </p>
                  <p class="mt-1 text-sm text-red-800">
                    <span *ngFor="let e of walletGrants?.emergency; let last = last">
                      Dr. {{ e.doctor_name }} — {{ emergencyCountdown(e) }} left<span *ngIf="!last"> · </span>
                    </span>
                  </p>
                </div>
                <button type="button" (click)="setTab('permissions')" class="btn-secondary shrink-0">
                  Review &amp; end it
                </button>
              </div>
            </div>

            <!-- AUDIT LOGS CALLOUT CARD -->
            <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <h2 class="m-0 text-base font-bold text-slate-900">Audit logs &amp; access activity</h2>
                <button type="button" (click)="setTab('activity')"
                        class="btn-secondary text-xs">
                  View all logs
                </button>
              </div>
              <div class="px-5 py-4">
                <p class="text-sm text-slate-600 mb-3">Review record views, permission changes, and emergency access entries here. Some entries include extra verification details.</p>

                <!-- Quick stats -->
                <div class="grid grid-cols-3 gap-3 mb-4">
                  <div class="rounded-xl border border-slate-200 bg-white p-3 text-center">
                    <p class="text-lg font-semibold text-slate-900">{{ story.length }}</p>
                    <p class="text-xs text-slate-500 mt-0.5">Total events</p>
                  </div>
                  <div class="rounded-xl border border-slate-200 bg-white p-3 text-center">
                    <p class="text-lg font-semibold text-slate-900">{{ accessEvents.length }}</p>
                    <p class="text-xs text-slate-500 mt-0.5">Doctor views</p>
                  </div>
                  <div class="rounded-xl border border-slate-200 bg-white p-3 text-center">
                    <p class="text-lg font-semibold text-slate-900">{{ breakGlassCount }}</p>
                    <p class="text-xs text-slate-500 mt-0.5">Emergency access</p>
                  </div>
                </div>

                <!-- Recent events preview -->
                <p *ngIf="storyLoading && story.length === 0" class="text-sm text-slate-500" role="status">Loading events…</p>
                <div *ngIf="!storyError && story.length > 0" class="divide-y divide-slate-100">
                  <div *ngFor="let event of story | slice:0:4" class="flex items-start gap-3 py-2.5 first:pt-0">
                    <div class="min-w-0 flex-1">
                      <p class="text-sm text-slate-800 font-semibold truncate">{{ event.who || 'Care team member' }}</p>
                      <p class="text-xs text-slate-500 truncate">{{ event.verb }}</p>
                      <p class="text-xs text-slate-400">{{ event.timestamp * 1000 | date:'medium' }}</p>
                    </div>
                    <a *ngIf="event.etherscan_url" [href]="event.etherscan_url" target="_blank" rel="noopener"
                       class="flex-shrink-0 text-xs text-slate-700 hover:underline font-semibold">Additional check details</a>
                  </div>
                </div>
                <p *ngIf="!storyLoading && !storyError && story.length === 0" class="text-sm text-slate-500">
                  No events yet. They appear when a doctor accesses your records.
                </p>
                <div *ngIf="storyError" class="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  {{ storyError }} — <button type="button" (click)="loadStory()" class="underline font-semibold">Retry</button>
                </div>

              </div>
            </section>

            <div *ngIf="healthSummary" class="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div class="lg:col-span-2">
              <app-record-chart
                title="Recorded conditions and record types"
                description="Frequency of entries in your medical history."
                [data]="diagnosisChartData"
                emptyMessage="No diagnosis or record-type entries are available." />
              </div>
              <app-dashboard-gauge
                title="Record checks"
                description="Records with available earlier details to compare against."
                [numerator]="onChainVerifiedEventsCount"
                [denominator]="allMedicalHistoryItemsRaw.length"
                [loading]="loading"
                centerLabel="checked"
                footer="Verification checks record integrity, not clinical accuracy." />
              <app-record-chart
                title="Measurement history"
                description="How often each measurement appears in your records."
                [data]="measurementChartData"
                emptyMessage="No measurements are available." />
              <app-record-chart
                title="Medicine mentions"
                description="Recorded medication entries; this is not a measure of doses taken."
                [data]="medicineChartData"
                emptyMessage="No medicine entries are available." />
              <app-record-chart
                title="Recorded activity by hospital"
                description="Records grouped by the facility that created them."
                [data]="hospitalChartData"
                emptyMessage="No hospital activity is available." />
            </div>

            <div *ngIf="healthSummary" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <!-- Most-used medicines -->
              <div class="card p-5">
                <h3 class="mb-3 text-lg font-bold">Most-used medicines</h3>
                <p class="mb-3 text-sm text-muted">
                  Medicines and medications that appear most often across your records.
                </p>
                <div *ngIf="healthSummary.medicines.length" class="space-y-2">
                  <div *ngFor="let med of healthSummary.medicines" class="flex items-center justify-between gap-2 text-sm rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span class="text-slate-900">{{ med.detail }}</span>
                    <span class="text-xs font-semibold text-muted">{{ med.count }}×</span>
                  </div>
                </div>
                <p *ngIf="!healthSummary.medicines.length" class="text-sm text-muted italic">
                  No medicines recorded yet.
                </p>
              </div>

              <!-- Most frequent measurements -->
              <div class="card p-5">
                <h3 class="mb-3 text-lg font-bold">Most frequent measurements</h3>
                <p class="mb-3 text-sm text-muted">
                  Clinical readings you take most often — with the latest value and where.
                </p>
                <div *ngIf="healthSummary.measurements.length" class="space-y-2">
                  <div *ngFor="let m of healthSummary.measurements" class="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span class="font-semibold text-slate-900">{{ m.kind }}</span>
                      <span class="text-xs text-muted">{{ m.count }}×</span>
                    </div>
                    <p class="text-sm text-slate-700 mt-1">
                      Latest: {{ m.latest_value }} {{ m.latest_unit }}
                      <span class="text-xs text-muted">({{ m.latest_date | date:'medium' }})</span>
                    </p>
                    <p class="text-xs text-muted">
                      by {{ m.latest_doctor || '—' }} · {{ m.latest_hospital || '—' }}
                    </p>
                  </div>
                </div>
                <p *ngIf="!healthSummary.measurements.length" class="text-sm text-muted italic">
                  No measurements recorded yet.
                </p>
              </div>

              <!-- Frequent diagnoses -->
              <div class="card p-5">
                <h3 class="mb-3 text-lg font-bold">Frequent diagnoses / record types</h3>
                <p class="mb-3 text-sm text-muted">
                  The types of records in your history, from most to least frequent.
                </p>
                <div *ngIf="healthSummary.diagnoses.length" class="space-y-2">
                  <div *ngFor="let d of healthSummary.diagnoses" class="flex items-center justify-between gap-2 text-sm rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span class="text-slate-900">{{ d.type }}</span>
                    <span class="text-xs font-semibold text-muted">{{ d.count }}×</span>
                  </div>
                </div>
                <p *ngIf="!healthSummary.diagnoses.length" class="text-sm text-muted italic">
                  No diagnoses recorded yet.
                </p>
              </div>

              <!-- Visit frequency per hospital -->
              <div class="card p-5">
                <h3 class="mb-3 text-lg font-bold">Visit frequency per hospital</h3>
                <p class="mb-3 text-sm text-muted">
                  Which hospitals you visit most, based on your records.
                </p>
                <div *ngIf="healthSummary.hospital_visits.length" class="space-y-2">
                  <div *ngFor="let h of healthSummary.hospital_visits" class="flex items-center justify-between gap-2 text-sm rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span class="text-slate-900">{{ h.facility }}</span>
                    <span class="text-xs font-semibold text-muted">{{ h.count }} visits</span>
                  </div>
                </div>
                <p *ngIf="!healthSummary.hospital_visits.length" class="text-sm text-muted italic">
                  No hospital visits recorded yet.
                </p>
              </div>
            </div>

            <!-- Doctors recorded in the patient's care history -->
            <section *ngIf="healthSummary" class="card p-5">
              <h3 class="mb-2 text-lg font-bold">Doctors in your care history</h3>
              <p class="mb-4 text-sm text-muted">
                Doctors shown here are named on a measurement or a medical record, grouped by hospital.
              </p>
              <div *ngIf="healthSummary.care_team.length" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <article *ngFor="let doctor of healthSummary.care_team" class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h4 class="font-semibold text-slate-900">{{ doctor.name }}</h4>
                  <p class="mt-1 text-sm text-slate-600">{{ doctor.hospital }}</p>
                  <p class="mt-2 text-xs text-muted">
                    <span *ngIf="doctor.measurements">{{ doctor.measurements }} measurement{{ doctor.measurements === 1 ? '' : 's' }}</span>
                    <span *ngIf="doctor.measurements && doctor.treatment_records + doctor.other_records"> · </span>
                    <span *ngIf="doctor.treatment_records">{{ doctor.treatment_records }} treatment record{{ doctor.treatment_records === 1 ? '' : 's' }}</span>
                    <span *ngIf="doctor.treatment_records && doctor.other_records"> · </span>
                    <span *ngIf="doctor.other_records">{{ doctor.other_records }} other medical record{{ doctor.other_records === 1 ? '' : 's' }}</span>
                  </p>
                </article>
              </div>
              <p *ngIf="!healthSummary.care_team.length" class="text-sm text-muted italic">
                No doctors have been named on your measurements or medical records yet.
              </p>
            </section>

            <!-- Overall counts -->
            <div *ngIf="healthSummary" class="card">
              <h3 class="mb-4 text-lg font-bold">Your history at a glance</h3>
              <dl class="grid grid-cols-3 gap-4">
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                  <p class="text-3xl font-bold text-accent-700">{{ healthSummary.total_records }}</p>
                  <p class="text-xs text-muted uppercase tracking-wide">Total records</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                  <p class="text-3xl font-bold text-primary-700">{{ healthSummary.total_measurements }}</p>
                  <p class="text-xs text-muted uppercase tracking-wide">Total measurements</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                  <p class="text-3xl font-bold text-ink">{{ healthSummary.hospital_visits.length }}</p>
                  <p class="text-xs text-muted uppercase tracking-wide">Hospitals visited</p>
                </div>
              </dl>
            </div>

            <div *ngIf="!healthSummary" class="card">
              <p class="text-slate-600">Loading your health summary…</p>
            </div>
          </div>

          <!-- AUDIT LOGS & ACTIVITY -->
          <div *ngIf="tab === 'activity'" class="space-y-6 animate-fade-in">

            <!-- PAGE HEADER -->
            <header class="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <p class="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Privacy and transparency</p>
                  <h1 class="mb-1 text-2xl font-bold tracking-tight text-slate-900">Audit logs &amp; activity</h1>
                  <p class="m-0 max-w-2xl text-sm leading-relaxed text-slate-600">
                    Review who accessed your records and when. Some actions may include additional verification details.
                  </p>
                </div>
                <button type="button" (click)="loadStory()" [disabled]="storyLoading" class="btn-secondary">
                  {{ storyLoading ? 'Refreshing…' : 'Refresh activity' }}
                </button>
            </header>

            <section aria-label="Activity summary" class="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <article class="rounded-2xl border border-slate-200 bg-white p-4">
                  <p class="mb-1 text-xs font-medium text-slate-500">Total events</p>
                  <p class="m-0 text-2xl font-semibold tabular-nums text-slate-900">{{ story.length }}</p>
                </article>
                <article class="rounded-2xl border border-slate-200 bg-white p-4">
                  <p class="mb-1 text-xs font-medium text-slate-500">Doctor views</p>
                  <p class="m-0 text-2xl font-semibold tabular-nums text-slate-900">{{ recordViewedCount }}</p>
                </article>
                <article class="rounded-2xl border border-slate-200 bg-white p-4">
                  <p class="mb-1 text-xs font-medium text-slate-500">Emergency access</p>
                  <p class="m-0 text-2xl font-semibold tabular-nums text-slate-900">{{ breakGlassCount }}</p>
                </article>
                <article class="rounded-2xl border border-slate-200 bg-white p-4">
                  <p class="mb-1 text-xs font-medium text-slate-500">Records with extra checks</p>
                  <p class="m-0 text-2xl font-semibold tabular-nums text-slate-900">{{ onChainCount }}</p>
                </article>
            </section>

            <!-- BLOCKCHAIN INFO BANNER -->
            <div class="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div class="text-sm">
                <p class="m-0 font-semibold text-slate-900">How access is recorded</p>
                <p class="mb-0 mt-1 text-slate-600">Access usually requires your approval. Emergency access is recorded in your activity history.</p>
              </div>
            </div>

            <!-- FILTER PILLS -->
            <div class="flex flex-wrap gap-2">
              <button *ngFor="let f of storyFilterPills"
                (click)="storyFilter = f.id"
                class="min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors"
                [attr.aria-pressed]="storyFilter === f.id"
                [ngClass]="storyFilter === f.id
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'">
                {{ f.label }}
                <span *ngIf="f.id !== 'all'" class="ml-1 text-xs opacity-75">({{ auditCategoryCount(f.id) }})</span>
              </button>
            </div>

            <!-- LOADING SKELETON -->
            <div *ngIf="storyLoading && story.length === 0" class="space-y-4">
              <div *ngFor="let _ of [1,2,3]" class="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
                <div class="flex gap-4">
                  <div class="min-w-0 flex-1 space-y-2">
                    <div class="h-4 bg-slate-200 rounded w-3/4"></div>
                    <div class="h-3 bg-slate-100 rounded w-1/2"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- DB-ONLY MODE NOTICE -->
            <div *ngIf="storySource === 'db' && story.length > 0"
                 role="status" class="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div>
                <p class="text-sm font-semibold text-amber-800">Some verification details are temporarily unavailable</p>
                <p class="text-xs text-amber-700 mt-0.5">You can still review the activity available here. Additional verification details will return when the service reconnects.</p>
              </div>
            </div>

            <!-- PERSISTENT ERROR -->
            <div *ngIf="storyError && story.length === 0"
                 role="alert" class="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
              <p class="text-sm font-semibold text-red-700">{{ storyError }}</p>
              <button type="button" (click)="loadStory()" class="text-sm font-bold text-red-600 underline hover:text-red-800">Try again</button>
            </div>

            <!-- TIMELINE -->
            <section *ngIf="auditFilteredStory.length > 0" aria-label="Filtered audit events" class="space-y-3">
              <article *ngFor="let s of auditFilteredStory" class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="flex-1 min-w-0">
                      <!-- Event type badge -->
                      <div class="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span *ngIf="s.event" class="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">{{ auditEventLabel(s.event) }}</span>
                        <span *ngIf="s.role" class="px-1.5 py-1 text-[11px] font-medium text-slate-500">{{ s.role }}</span>
                        <span *ngIf="('source' in s) && s.source === 'db'" class="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">Database record</span>
                      </div>
                      <p class="mb-0 text-sm leading-relaxed text-slate-900 sm:text-base">
                        <span class="font-bold">{{ s.who || 'Care team member' }}</span>
                        <span> {{ s.verb }}</span>
                      </p>
                      <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span>{{ s.timestamp * 1000 | date:'medium' }}</span>
                        <span *ngIf="s.facility">&bull; {{ s.facility }}</span>
                      </div>
                      <!-- TX hash preview -->
                      <details *ngIf="s.transaction_hash" class="mt-2"><summary class="min-h-11 cursor-pointer text-xs text-slate-500">Show technical reference</summary><code class="block break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-500">{{ s.transaction_hash }}</code></details>
                    </div>
                    <div class="flex shrink-0 flex-col gap-1.5">
                      <a *ngIf="s.etherscan_url" [href]="s.etherscan_url" target="_blank" rel="noopener"
                         class="btn-secondary text-xs">
                        Open optional activity details
                      </a>
                      <span *ngIf="!s.etherscan_url" class="text-xs text-slate-500">Activity recorded</span>
                    </div>
                  </div>
              </article>
            </section>

            <!-- EMPTY AFTER FILTER -->
            <div *ngIf="!storyLoading && !storyError && story.length > 0 && auditFilteredStory.length === 0"
                  class="flex flex-col items-center justify-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
               <p class="text-slate-600 font-semibold">No events in this category</p>
               <button type="button" (click)="storyFilter = 'all'" class="mt-2 text-sm font-semibold text-slate-700 underline hover:text-slate-900">Clear filter</button>
            </div>

            <!-- EMPTY STATE (no events at all) -->
            <div *ngIf="!storyLoading && !storyError && story.length === 0"
                 class="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
              <h3 class="text-lg font-bold text-slate-900 mb-2">No Activity Yet</h3>
              <p class="text-slate-500 text-sm text-center max-w-xs">Audit events will appear here the first time a doctor requests or is granted access to your records.</p>
            </div>

            <!-- ═══════════════════════════════════════════════════════════ -->
            <!-- DATA INTEGRITY VERIFICATION PANEL                          -->
            <!-- ═══════════════════════════════════════════════════════════ -->
            <section class="mt-2 space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
              <!-- SECTION HEADER -->
              <div class="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 class="mb-1 text-lg font-bold text-slate-900">Record review</h2>
                  <p class="m-0 text-sm text-slate-500">Check whether saved records match their earlier verification details.</p>
                </div>
                <button type="button" (click)="runIntegrityCheck()" [disabled]="integrityLoading" class="btn-secondary w-full sm:w-auto">
                  {{ integrityLoading ? 'Reviewing…' : 'Review saved records' }}
                </button>
              </div>

              <details class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <summary class="cursor-pointer text-sm font-semibold text-slate-800">What this record check means</summary>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600">
                  <div class="flex gap-2.5">
                    <div>
                      <p class="font-semibold text-slate-700">Compare saved record details</p>
                      <p class="mt-0.5">The service checks whether the saved record details still match the earlier reference. A difference may mean the information changed and should be reviewed.</p>
                    </div>
                  </div>
                  <div class="flex gap-2.5">
                    <div>
                      <p class="font-semibold text-slate-700">Compare with earlier record</p>
                      <p class="mt-0.5">The current record is compared with the reference saved when it was first recorded.</p>
                    </div>
                  </div>
                  <div class="flex gap-2.5">
                    <div>
                      <p class="font-semibold text-slate-700">Additional record check</p>
                      <p class="mt-0.5">When available, the service also checks the record reference in its independent activity system.</p>
                    </div>
                  </div>
                </div>
                <div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div *ngFor="let badge of [
                    {status:'VERIFIED', label:'Matches earlier details', desc:'No difference found'},
                    {status:'TAMPERED_PAYLOAD', label:'Needs review', desc:'A difference was found'},
                    {status:'CHAIN_MISMATCH', label:'Could not confirm', desc:'Earlier details were unavailable'},
                    {status:'UNANCHORED', label:'Not yet checked', desc:'No earlier reference available'}
                  ]" class="flex items-start gap-1.5 p-2 bg-white rounded-xl border border-slate-200">
                    <div>
                      <p class="text-[11px] font-bold text-slate-700">{{ badge.label }}</p>
                      <p class="text-[10px] text-slate-500">{{ badge.desc }}</p>
                    </div>
                  </div>
                </div>
              </details>

              <!-- LOADING STATE -->
              <div *ngIf="integrityLoading" role="status" aria-live="polite" class="flex flex-col items-center py-12 gap-3">
                <div class="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <p class="text-sm text-slate-600 font-medium">Checking your saved record details…</p>
                <p class="text-xs text-slate-400">This may take a few seconds.</p>
              </div>

              <!-- ERROR -->
              <div *ngIf="integrityError && !integrityLoading" role="alert" class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                {{ integrityError }}
              </div>

              <!-- RESULTS -->
              <div *ngIf="integrityReport && !integrityLoading">

                <!-- TAMPER ALERT BANNER -->
                <div *ngIf="!integrityReport.integrity_ok"
                     class="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
                  <div>
                    <h3 class="font-extrabold text-lg mb-1">A record needs review</h3>
                    <p class="text-sm leading-relaxed text-red-800">
                      <strong>{{ integrityReport.summary.tampered }} record(s)</strong> do not match their earlier saved details.
                      This difference may mean the saved clinical information changed. Please review the affected record with your care provider.
                      The records flagged in red below are the affected items.
                    </p>
                    <p class="mt-2 text-xs text-red-700">Checked at: {{ integrityReport.checked_at | date:'medium' }}</p>
                  </div>
                </div>

                <!-- ALL CLEAR BANNER -->
                <div *ngIf="integrityReport.integrity_ok"
                     class="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-900">
                  <div>
                    <h3 class="font-extrabold text-lg mb-1">Record check complete</h3>
                    <p class="text-sm text-slate-600">
                      <strong>{{ integrityReport.summary.verified }}</strong> of {{ integrityReport.summary.total }} items confirmed intact.
                      The checked records match their earlier saved details. This check does not confirm the clinical accuracy of the information.
                    </p>
                    <p class="mt-2 text-xs text-slate-500">Checked at: {{ integrityReport.checked_at | date:'medium' }}</p>
                  </div>
                </div>

                <!-- SUMMARY STAT CARDS -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  <div class="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
                    <p class="text-2xl font-extrabold text-slate-800">{{ integrityReport.summary.total }}</p>
                    <p class="text-xs text-slate-500 mt-1">Total Checked</p>
                  </div>
                  <div class="rounded-xl border border-slate-200 bg-white p-4 text-center">
                    <p class="text-2xl font-semibold text-slate-900">{{ integrityReport.summary.verified }}</p>
                    <p class="mt-1 text-xs text-slate-500">Matches earlier details</p>
                  </div>
                  <div [ngClass]="integrityReport.summary.tampered > 0 ? 'bg-red-50 border-red-300 animate-pulse' : 'bg-slate-50 border-slate-200'"
                       class="rounded-2xl border p-4 text-center shadow-sm">
                    <p class="text-2xl font-extrabold" [ngClass]="integrityReport.summary.tampered > 0 ? 'text-red-700' : 'text-slate-400'">
                      {{ integrityReport.summary.tampered }}
                    </p>
                    <p class="text-xs mt-1" [ngClass]="integrityReport.summary.tampered > 0 ? 'text-red-600' : 'text-slate-400'">Needs review</p>
                  </div>
                  <div class="rounded-xl border border-slate-200 bg-white p-4 text-center">
                    <p class="text-2xl font-semibold text-slate-900">{{ integrityReport.summary.unanchored }}</p>
                    <p class="mt-1 text-xs text-slate-500">Not yet checked</p>
                  </div>
                </div>

                <!-- CHAIN UNAVAILABLE NOTICE -->
              <div *ngIf="!integrityReport.chain_available" role="status" class="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
                  <p class="text-amber-800">Some additional checks could not be completed right now. The results shown may be limited.</p>
                </div>

                <!-- PER-ITEM LIST (Records + Measurements combined) -->
                <h3 class="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Record check results</h3>
                <div class="space-y-3">
                  <div *ngFor="let item of integrityReport.records.concat(integrityReport.measurements)"
                       class="bg-white rounded-2xl border p-4 shadow-sm"
                       [ngClass]="item.severity === 'critical' ? 'border-red-300 bg-red-50' : item.severity === 'warning' ? 'border-amber-200' : 'border-slate-200'">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="flex-1 min-w-0">
                        <!-- Header row -->
                        <div class="flex items-center gap-2 mb-1.5">
                          <span class="font-bold text-slate-900 text-sm">
                            {{ item.type === 'record' ? (item.record_type || 'Medical Record') : (item.kind + ' ' + item.value + (item.unit || '')) }}
                          </span>
                          <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border"
                                [ngClass]="integrityBadgeClass(item.status)">
                            {{ integrityStatusLabel(item.status) }}
                          </span>
                        </div>

                        <!-- Metadata -->
                        <div class="flex flex-wrap gap-2 text-xs text-slate-500 mb-2">
                          <span>{{ item.facility_name }}</span>
                          <span>·</span>
                          <span>{{ item.type === 'measurement' && item.doctor ? ('Dr. ' + item.doctor) : '' }}</span>
                          <span>·</span>
                          <span>{{ item.created_at | date:'mediumDate' }}</span>
                        </div>

                        <!-- Description -->
                        <p class="text-xs leading-relaxed"
                           [ngClass]="item.severity === 'critical' ? 'text-red-700 font-semibold' : 'text-slate-600'">
                          {{ item.description }}
                        </p>

                        <!-- Reference comparison (only show mismatch or on critical) -->
                        <div *ngIf="item.severity === 'critical' || item.status !== 'VERIFIED'" class="mt-3 space-y-1.5">
                          <div class="flex items-start gap-2">
                            <span class="text-[10px] font-bold text-slate-500 w-24 flex-shrink-0 mt-0.5">EARLIER REFERENCE</span>
                            <code class="text-[10px] font-mono bg-slate-100 px-2 py-1 rounded break-all text-slate-600 flex-1">{{ item.stored_hash || '—' }}</code>
                          </div>
                          <div class="flex items-start gap-2">
                            <span class="text-[10px] font-bold flex-shrink-0 w-24 mt-0.5"
                                  [ngClass]="item.payload_hash_matches ? 'text-emerald-600' : 'text-red-600'">
                              {{ item.payload_hash_matches ? 'MATCH ✓' : 'DIFFERENT ✗' }}
                            </span>
                            <code class="text-[10px] font-mono px-2 py-1 rounded break-all flex-1"
                                  [ngClass]="item.payload_hash_matches ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700 font-bold'">
                              {{ item.recomputed_hash }}
                            </code>
                          </div>
                        </div>
                      </div>

                      <!-- Actions -->
                      <div class="flex flex-col gap-1.5 flex-shrink-0">
                        <a *ngIf="item.etherscan_url" [href]="item.etherscan_url" target="_blank" rel="noopener"
                           class="btn-secondary text-xs">
                          Open optional activity details
                        </a>
                        <span class="text-[10px] text-slate-400 text-center">
                          {{ item.chain_checked ? 'Chain checked' : 'Database only' }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

              </div><!-- /integrityReport -->

            </section>

          </div><!-- /tab === activity -->

        </main>
      </div>
    </div>

    <!-- FOOTER -->

    <!-- ACCESS-REQUEST NOTIFICATIONS -->
    <div class="fixed top-20 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
      <div *ngFor="let n of notifications" class="bg-white rounded-2xl shadow-2xl border-l-4 border-l-primary-500 animate-fade-in overflow-hidden">
        <div class="p-4">
          <div class="flex items-start justify-between mb-3">
            <div>
              <h4 class="font-bold text-slate-900">New Access Request</h4>
              <p class="text-sm text-slate-600 mt-1">Dr. {{ n.doctor_name }} from {{ n.facility_id }}</p>
            </div>
            <button (click)="dismiss(n.id)" class="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            </button>
          </div>
          <div *ngIf="n.reason" class="p-3 bg-slate-50 rounded-xl border border-slate-200 mb-3">
            <p class="text-xs text-slate-600 italic">"{{ n.reason }}"</p>
          </div>
          <div class="flex gap-2">
            <button (click)="approveFromToast(n)" class="btn-accent w-full sm:w-auto">Approve</button>
            <button (click)="rejectFromToast(n)" class="flex-1 px-3 py-2 bg-white border border-red-500 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 transition-colors">Reject</button>
          </div>
          <p class="text-center text-xs text-slate-500 mt-2">Access lasts 7 days</p>
        </div>
      </div>
    </div>

    <!-- REFERRAL REQUEST MODAL (Advanced UI) -->
    <div *ngIf="referralModal"
         class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 backdrop-blur-md animate-fade-in"
         (click)="referralModal = false">
      <div class="w-full sm:max-w-lg bg-white sm:rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-slide-up"
           (click)="$event.stopPropagation()">

        <!-- MODAL HEADER (gradient) -->
        <div class="relative bg-gradient-to-r from-violet-600 to-indigo-700 px-6 py-6">
          <!-- Close -->
          <button (click)="referralModal = false" aria-label="Close referral modal"
                  class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" /></svg>
            </div>
            <div>
              <p class="text-xs font-semibold text-white/70 uppercase tracking-widest">New Request</p>
              <h2 class="text-lg font-extrabold text-white leading-tight">Request a Hospital Referral</h2>
            </div>
          </div>
        </div>

        <!-- MODAL BODY -->
        <div class="px-6 py-6">
          <!-- Info banner -->
          <div class="flex items-start gap-3 p-3.5 rounded-xl bg-indigo-50 border border-indigo-100 mb-5">
            <svg class="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p class="text-xs text-indigo-700 leading-relaxed">
              Choose the hospital and reason. The receiving hospital's staff must <strong>accept</strong> before the referral is active.
              Referral confirmations and record views may appear here when available.
            </p>
          </div>

          <div class="space-y-4">
            <!-- Hospital select -->
            <div>
              <label class="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Target Hospital</label>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 00-1-1h-2a1 1 0 00-1 1v5m4 0H9" /></svg>
                </span>
                <select [(ngModel)]="referralForm.to_hospital"
                        id="referral-hospital-select"
                        class="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition appearance-none">
                  <option value="" disabled>Select a hospital…</option>
                  <option *ngFor="let h of sendHospitals" [value]="h.code">{{ h.name }} ({{ h.code }})</option>
                </select>
                <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </span>
              </div>
            </div>

            <!-- Reason textarea -->
            <div>
              <label class="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Reason <span class="text-slate-400 font-normal normal-case">(optional)</span></label>
              <textarea [(ngModel)]="referralForm.reason"
                        id="referral-reason-textarea"
                        rows="3"
                        placeholder="e.g. specialist cardiac review, post-discharge follow-up, second opinion…"
                        class="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition resize-none"></textarea>
            </div>
          </div>

          <!-- SUCCESS message -->
          <div *ngIf="sendMsg && sendOk"
               class="mt-4 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
            <svg class="w-4 h-4 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
            <p class="text-xs text-emerald-700 font-medium">{{ sendMsg }}</p>
          </div>
          <!-- ERROR message -->
          <div *ngIf="sendMsg && !sendOk"
               class="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
            <svg class="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p class="text-xs text-red-700 font-medium">{{ sendMsg }}</p>
          </div>
        </div>

        <!-- MODAL FOOTER -->
        <div class="px-6 pb-6 flex flex-col sm:flex-row gap-3">
          <button (click)="sendReferral()"
                  [disabled]="sendBusy || !referralForm.to_hospital"
                  id="send-referral-btn"
                  class="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-bold shadow-lg shadow-violet-200 hover:from-violet-600 hover:to-indigo-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none active:scale-95">
            <svg *ngIf="!sendBusy" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            <svg *ngIf="sendBusy" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            {{ sendBusy ? 'Sending…' : 'Send Referral Request' }}
          </button>
          <button (click)="referralModal = false"
                  class="flex-1 sm:flex-none sm:px-6 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  `,

})
export class PatientDashboardComponent implements OnInit, OnDestroy {
  tab: 'dashboard' | 'records' | 'measurements' | 'referrals' | 'permissions' | 'requests' | 'activity' | 'wallet' | 'profile' | 'referral-security' | 'how-it-works' = 'dashboard';
  tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'records', label: 'Medical History' },
    { id: 'measurements', label: 'Measurements' },
    { id: 'referrals', label: 'Referrals' },
    { id: 'permissions', label: 'Permissions' },
    { id: 'requests', label: 'Requests' },
    { id: 'activity', label: 'Audit Logs & Activity' },
    { id: 'wallet', label: 'Secure account' },
    { id: 'profile', label: 'Profile' },
    { id: 'referral-security', label: 'Referral Security' },
    { id: 'how-it-works', label: 'How it works' },
  ] as const;

  get data(): PatientData | null { return this.workspaceState.patientRecords.data; }
  set data(value: PatientData | null) { value ? this.workspaceState.patientRecords.set(value) : this.workspaceState.patientRecords.clear(); }
  get requests(): AccessRequest[] { return this.workspaceState.patientRequests.data ?? []; }
  set requests(value: AccessRequest[]) { this.workspaceState.patientRequests.set(value); }
  get story(): ActivityStoryItem[] { return this.workspaceState.patientActivity.data ?? []; }
  set story(value: ActivityStoryItem[]) { this.workspaceState.patientActivity.set(value); }
  storyLoading = false;
  storyError = '';
  storySource: 'chain' | 'db' | '' = '';
  loading = false;
  busy = false;
  errorMsg = '';
  feedbackMessage = '';
  feedbackError = false;
  private feedbackTimer: any = null;
  historyFilter: 'all' | 'records' | 'measurements' | 'hospitals' = 'all';
  /** Filter pills for Audit Logs & Activity tab */
  storyFilter: 'all' | 'views' | 'permissions' | 'measurements' | 'emergency' = 'all';

  /** Filter pill definitions for the audit logs UI */
  storyFilterPills: { id: 'all' | 'views' | 'permissions' | 'measurements' | 'emergency', label: string }[] = [
    { id: 'all', label: 'All Logs' },
    { id: 'views', label: 'Doctor Views' },
    { id: 'permissions', label: 'Permissions & Grants' },
    { id: 'measurements', label: 'Clinical Measurements' },
    { id: 'emergency', label: 'Emergency Break-Glass' },
  ];

  /** Integrity verification state */
  integrityReport: IntegrityReport | null = null;
  integrityLoading = false;
  integrityError = '';

  /** Most recent on-chain action performed by this patient (grant/approve),
   * surfaced as a banner with a direct external activity page link. */
  lastTx: { label: string; tx_hash: string; pending: boolean } | null = null;
  grant = { doctor_license: '', doctor_name: '', doctor_wallet: '', days: 7 };

  // Doctor picker for the grant-access form (patient-friendly: pick by name).
  doctors: DoctorOption[] = [];
  doctorQuery = '';
  selectedDoctor: DoctorOption | null = null;
  doctorLoading = false;
  showSuggestions = false;
  private doctorSearchTimer: any = null;

  // patient-initiated referral send
  referralModal = false;
  sendHospitals: { code: string; name: string }[] = [];
  referralForm = { to_hospital: '', reason: '' };
  sendBusy = false;
  sendMsg = '';
  sendOk = false;

  // --- Access-request notifications (popup) ---
  notifications: AccessRequest[] = [];
  busyRequest: number | null = null;
  private dismissedIds = new Set<number>();
  private pollTimer: any = null;
  private pollInFlight = false;

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
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

  setTab(id: 'dashboard' | 'records' | 'measurements' | 'referrals' | 'permissions' | 'requests' | 'activity' | 'wallet' | 'profile' | 'referral-security' | 'how-it-works') {
    this.tab = id;
    if (id === 'activity' || id === 'dashboard') {
      void this.loadStory();
    }
    if (id === 'wallet') {
      void this.loadWalletProfile();
    }
    if (id === 'profile') {
      void this.loadProfile();
    }
    if (id === 'referral-security') {
      void this.loadReferralSecurity();
    }
    if (id === 'permissions') {
      void this.loadGrantSummary();
    }
    this.syncView();
  }

  // --- Wallet tab data (wallet-centric chain info) ---
  walletActivity: {
    wallet_address: string;
    health_id: string;
    full_name: string;
    activityCount: number;
    lastTxHash: string | null;
    lastActivityAt: number | null;
    pendingOperations: number;
  } | null = null;
  walletVisible = false;

  get diagnosisChartData(): RecordChartPoint[] {
    return (this.healthSummary?.diagnoses ?? []).map((item) => ({ label: item.type, value: item.count }));
  }

  get measurementChartData(): RecordChartPoint[] {
    return (this.healthSummary?.measurements ?? []).map((item) => ({ label: item.kind, value: item.count }));
  }

  get medicineChartData(): RecordChartPoint[] {
    return (this.healthSummary?.medicines ?? []).map((item) => ({ label: item.detail, value: item.count }));
  }

  get hospitalChartData(): RecordChartPoint[] {
    return (this.healthSummary?.hospital_visits ?? []).map((item) => ({ label: item.facility, value: item.count }));
  }

  // --- Longitudinal Care Journey (From where care started to where it ended) ---
  get careJourneyFacilities(): { name: string; firstVisit: string; count: number; role: string; doctor?: string }[] {
    if (!this.data) return [];
    const facilityMap = new Map<string, { firstVisit: string; count: number; role: string; doctor?: string }>();

    // 1. Registered facility if any
    if (this.data.hospital) {
      facilityMap.set(this.data.hospital, {
        firstVisit: this.data.records && this.data.records.length > 0 ? this.data.records[0]?.date || '' : '',
        count: 1,
        role: 'Origin Facility',
      });
    }

    // 2. Records facilities
    for (const r of this.data.records || []) {
      if (!r.facility) continue;
      const existing = facilityMap.get(r.facility);
      if (existing) {
        existing.count++;
      } else {
        facilityMap.set(r.facility, { firstVisit: r.date || '', count: 1, role: 'Treatment Facility' });
      }
    }

    // 3. Measurements facilities
    for (const m of this.data.measurements || []) {
      if (!m.hospital) continue;
      const existing = facilityMap.get(m.hospital);
      if (existing) {
        existing.count++;
        if (m.doctor && !existing.doctor) existing.doctor = m.doctor;
      } else {
        facilityMap.set(m.hospital, { firstVisit: m.date || '', count: 1, role: 'Clinical Facility', doctor: m.doctor });
      }
    }

    // 4. Referrals
    for (const ref of this.data.referrals || []) {
      if (ref.from_hospital && !facilityMap.has(ref.from_hospital)) {
        facilityMap.set(ref.from_hospital, { firstVisit: ref.date || '', count: 1, role: 'Referring Facility', doctor: ref.from_doctor });
      }
      if (ref.to_hospital && !facilityMap.has(ref.to_hospital)) {
        facilityMap.set(ref.to_hospital, { firstVisit: ref.date || '', count: 1, role: 'Receiving Facility' });
      }
    }

    return Array.from(facilityMap.entries()).map(([name, info]) => ({
      name,
      firstVisit: info.firstVisit,
      count: info.count,
      role: info.role,
      doctor: info.doctor,
    }));
  }

  get totalCareFacilitiesCount(): number {
    return this.careJourneyFacilities.length;
  }

  get totalDoctorsEngagedCount(): number {
    if (!this.data) return 0;
    const docs = new Set<string>();
    for (const m of this.data.measurements || []) {
      if (m.doctor) docs.add(m.doctor.toLowerCase());
    }
    for (const r of this.data.referrals || []) {
      if (r.from_doctor) docs.add(r.from_doctor.toLowerCase());
    }
    return docs.size;
  }

  get onChainVerifiedEventsCount(): number {
    return this.allMedicalHistoryItemsRaw.filter((i) => i.verified).length;
  }

  get allMedicalHistoryItemsRaw(): any[] {
    if (!this.data) return [];
    const items: any[] = [];

    // Records
    for (const r of this.data.records || []) {
      const ts = r.date ? new Date(r.date).getTime() : 0;
      items.push({
        id: `rec-${r.id}`,
        category: 'record',
        categoryLabel: `Clinical Record (${r.type || 'General'})`,
        title: r.type || 'Medical Record',
        facility: r.facility || 'Healthcare Facility',
        doctor: (r.data && (r.data['doctor'] || r.data['doctor_name'] || r.data['attending_physician'])) || 'Attending Physician',
        date: r.date || '',
        timestamp: ts,
        data: r.data,
        hash: r.hash,
        tx_hash: r.tx_hash,
        verified: !!r.verified || (!!r.tx_hash && !r.tx_hash.startsWith('PENDING')),
        sourceUri: r.source_uri,
      });
    }

    // Measurements
    for (const m of this.data.measurements || []) {
      const ts = m.date ? new Date(m.date).getTime() : 0;
      items.push({
        id: `meas-${m.id}`,
        category: 'measurement',
        categoryLabel: `Clinical Measurement`,
        title: m.kind,
        facility: m.hospital || m.facility_id || 'Clinical Facility',
        doctor: m.doctor ? (m.doctor.startsWith('Dr.') ? m.doctor : `Dr. ${m.doctor}`) : 'Attending Clinician',
        doctorLicense: m.doctor_license,
        date: m.date || '',
        timestamp: ts,
        value: m.value,
        unit: m.unit,
        notes: m.notes,
        hash: m.record_hash,
        tx_hash: m.tx_hash,
        verified: !!m.verified || (!!m.tx_hash && !m.tx_hash.startsWith('PENDING')),
      });
    }

    // Referrals
    for (const ref of this.data.referrals || []) {
      const ts = ref.date ? new Date(ref.date).getTime() : 0;
      items.push({
        id: `ref-${ref.id}`,
        category: 'referral',
        categoryLabel: `Transfer of Care (Referral)`,
        title: `Referral to ${ref.to_hospital}`,
        facility: ref.from_hospital || 'Referring Facility',
        doctor: ref.from_doctor ? (ref.from_doctor.startsWith('Dr.') ? ref.from_doctor : `Dr. ${ref.from_doctor}`) : 'Referring Clinician',
        date: ref.date || '',
        timestamp: ts,
        notes: ref.reason,
        status: ref.status,
        tx_hash: ('tx_hash' in ref ? ref.tx_hash : null),
        verified: ('tx_hash' in ref ? typeof ref.tx_hash === 'string' && !!ref.tx_hash && !ref.tx_hash.startsWith('PENDING') : false),
      });
    }

    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
  }

  get filteredMedicalHistoryItems(): any[] {
    const all = this.allMedicalHistoryItemsRaw;
    if (this.historyFilter === 'records') {
      return all.filter((i) => i.category === 'record');
    }
    if (this.historyFilter === 'measurements') {
      return all.filter((i) => i.category === 'measurement');
    }
    if (this.historyFilter === 'hospitals') {
      return all.filter((i) => i.category === 'referral');
    }
    return all;
  }

  copiedHash: string | null = null;
  copyHash(hash: string) {
    if (!hash) return;
    navigator.clipboard.writeText(hash).then(() => {
      this.copiedHash = hash;
      this.syncView();
      setTimeout(() => {
        this.copiedHash = null;
        this.syncView();
      }, 2000);
    }).catch(() => {});
  }

  setHistoryFilter(f: 'all' | 'records' | 'measurements' | 'hospitals') {
    this.historyFilter = f;
    this.syncView();
  }

  allMedicalHistoryItemsCount(type: 'all' | 'records' | 'measurements' | 'hospitals'): number {
    const all = this.allMedicalHistoryItemsRaw;
    if (type === 'records') return all.filter((i) => i.category === 'record').length;
    if (type === 'measurements') return all.filter((i) => i.category === 'measurement').length;
    if (type === 'hospitals') return all.filter((i) => i.category === 'referral').length;
    return all.length;
  }

  walletGrants: {
    activeCount: number;
    pendingCount: number;
    expiringSoon: number;
    lastGrantAt: string | null;
    lastGrantDoctor: string | null;
    emergencyCount?: number;
    emergency?: EmergencyAccessItem[];
    active_grants?: ActiveGrantItem[];
    totalGrantsEver?: number;
  } | null = null;

  /** Seconds until the next emergency window ends (ticked once a second). */
  private emergencyTimer: any = null;
  emergencyBusy = false;

  // --- Profile tab data (user-centric editable info) ---
  profileInfo: { health_id: string; full_name: string; phone: string; wallet_address: string } | null = null;
  grantSummary: {
    activeCount: number;
    pendingCount: number;
    expiringSoon: number;
    lastGrantAt: string | null;
    lastGrantDoctor: string | null;
  } | null = null;

  // profile edit form
  editName = '';
  editPhone = '';
  editBusy = false;
  editMsg = '';
  editOk = false;

  async loadWalletProfile() {
    if (!this.data) {
      this.walletActivity = null;
      return;
    }
    // Prefill walletActivity from the core payload so the wallet tab has
    // an address immediately even before the wallet-activity endpoint responds.
    this.walletActivity = {
      wallet_address: this.data.wallet_address,
      health_id: this.data.health_id,
      full_name: this.data.full_name,
      activityCount: 0,
      lastTxHash: null,
      lastActivityAt: null,
      pendingOperations: 0,
    };
    // Enrich with live wallet-activity + grant-summary data.
    void this.loadWalletActivity();
    void this.loadGrantSummary();
    this.syncView();
  }

  private async loadWalletActivity() {
    try {
      this.walletActivity = await this.api.patientWalletActivity();
    } catch {
      this.walletActivity = null;
    }
    this.syncView();
  }

  private async loadGrantSummary() {
    try {
      this.walletGrants = await this.api.patientGrantAccessStatus();
    } catch {
      this.walletGrants = null;
    }
    this.updateEmergencyTicker();
    this.syncView();
  }

  /** Live countdown while a break-glass window is open on this record. */
  private updateEmergencyTicker() {
    const open = (this.walletGrants?.emergency?.length ?? 0) > 0;
    if (open && !this.emergencyTimer) {
      this.emergencyTimer = setInterval(() => {
        if (this.allEmergencyWindowsClosed()) {
          this.stopEmergencyTicker();
          void this.loadGrantSummary();
        }
        this.syncView();
      }, 1000);
    } else if (!open) {
      this.stopEmergencyTicker();
    }
  }

  private stopEmergencyTicker() {
    if (this.emergencyTimer) {
      clearInterval(this.emergencyTimer);
      this.emergencyTimer = null;
    }
  }

  private allEmergencyWindowsClosed(): boolean {
    return (this.walletGrants?.emergency ?? [])
      .every((e) => new Date(e.expires_at).getTime() <= Date.now());
  }

  /** Seconds left on one emergency window (floored at zero). */
  emergencyRemaining(e: EmergencyAccessItem): number {
    const ms = new Date(e.expires_at).getTime() - Date.now();
    return Math.max(0, Math.floor(ms / 1000));
  }

  /** "42:07" (or "1:02:03") remaining on an emergency window. */
  emergencyCountdown(e: EmergencyAccessItem): string {
    const total = this.emergencyRemaining(e);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return hours > 0
      ? `${hours}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(minutes)}:${pad(seconds)}`;
  }

  /** Patient ends a break-glass window before its one-hour expiry. */
  async revokeEmergency(e: EmergencyAccessItem) {
    if (this.emergencyBusy) return;
    const who = e.doctor_name ? `Dr. ${e.doctor_name}` : 'this doctor';
    if (!confirm(
      `End ${who}'s emergency access now? ` +
      'Access has been removed. This change will appear in your activity history.'
    )) return;
    this.emergencyBusy = true;
    this.syncView();
    try {
      const res: any = await this.api.revokeEmergencyAccess({
        doctor_license: e.doctor_license,
        doctor_wallet: e.doctor_wallet,
      });
      this.notify(res?.message || 'Emergency access ended.');
      await this.loadGrantSummary();
    } catch (err: any) {
      this.notify(err?.error?.error || err?.message || 'Could not end emergency access', true);
    } finally {
      this.emergencyBusy = false;
      this.syncView();
    }
  }

  /** Patient revokes a doctor's routine access. */
  async revokeRoutineAccess(g: ActiveGrantItem) {
    if (this.busy) return;
    const doc = g.doctor_name ? `Dr. ${g.doctor_name}` : 'this doctor';
    if (!confirm(
      `Revoke ${doc}'s access to your medical records? ` +
      'Your request to remove access is being processed.'
    )) return;
    this.busy = true;
    this.syncView();
    try {
      const res: any = await this.api.revokeAccess({
        doctor_license: g.doctor_license,
        doctor_wallet: g.doctor_wallet,
      });
      this.notify(res?.message || 'Access revoked successfully.');
      await this.loadGrantSummary();
      const fresh = await this.api.myRecords();
      this.data = fresh;
    } catch (err: any) {
      this.notify(err?.error?.error || err?.message || 'Could not revoke access', true);
    } finally {
      this.busy = false;
      this.syncView();
    }
  }

  /** Load the profile tab: editable user info + grant summary. */
  private async loadProfile() {
    if (!this.data) {
      this.profileInfo = null;
      this.grantSummary = null;
      return;
    }
    try {
      this.profileInfo = await this.api.patientProfile();
      this.editName = this.profileInfo.full_name;
      this.editPhone = this.profileInfo.phone || '';
    } catch {
      this.profileInfo = {
        health_id: this.data.health_id,
        full_name: this.data.full_name,
        phone: '',
        wallet_address: this.data.wallet_address,
      };
      this.editName = this.profileInfo.full_name;
      this.editPhone = this.profileInfo.phone || '';
    }
    try {
      this.grantSummary = await this.api.patientGrantAccessStatus();
    } catch {
      this.grantSummary = null;
    }
    this.syncView();
  }

  async saveProfile() {
    if (!this.profileInfo) return;
    this.editMsg = '';
    this.editBusy = true;
    try {
      const res: any = await this.api.patchPatientProfile({
        full_name: this.editName.trim(),
        phone: this.editPhone.trim(),
      });
      this.editOk = true;
      this.editMsg = 'Profile updated.';
      this.profileInfo = { ...this.profileInfo, full_name: res.full_name, phone: res.phone };
    } catch (e: any) {
      this.editOk = false;
      this.editMsg = e?.error?.error || e?.message || 'Could not update profile';
    } finally {
      this.editBusy = false;
      this.syncView();
    }
  }

  // --- Referral security tab data ---
  referralSecurity: {
    health_id: string;
    referrals: {
      id: number;
      patient_health_id: string;
      patient_name: string;
      from_hospital: string;
      from_hospital_code: string;
      from_doctor: string;
      to_hospital: string;
      to_hospital_code: string;
      reason: string;
      status: string;
      responded_by: string;
      created_at: string;
      responded_at: string;
      tx_hash: string;
      on_chain_referral_tx: string;
      on_chain_referral_accepted: boolean;
      on_chain_referral_tx_hash: string | null;
      from_hospital_records: {
        record_hash: string;
        facility_id: string;
        facility_name?: string;
        record_type?: string;
        metadata_uri: string | null;
        tx_hash?: string;
        verified?: boolean;
        created_at?: string;
        on_chain_timestamp?: number;
      }[];
      receiving_hospital_views: {
        accessor: string;
        role: string;
        facility_id: string;
        timestamp: number;
      }[];
    }[];
  } | null = null;

  copiedWallet = false;

  copyWalletAddress() {
    const addr = this.walletActivity?.wallet_address
      ?? this.profileInfo?.wallet_address;
    if (!addr) return;
    navigator.clipboard.writeText(addr).then(() => {
      this.copiedWallet = true;
      this.syncView();
      setTimeout(() => {
        this.copiedWallet = false;
        this.syncView();
      }, 2000);
    }).catch(() => {});
  }

  // --- Health summary (computed from records + measurements + referrals) ---
  healthSummary: {
    diagnoses: { type: string; count: number }[];
    medicines: { detail: string; count: number }[];
    measurements: { kind: string; count: number; latest_value: any; latest_unit: string; latest_date: string; latest_doctor: string; latest_hospital: string }[];
    care_team: { name: string; hospital: string; measurements: number; treatment_records: number; other_records: number; latest_date: string }[];
    hospital_visits: { facility: string; count: number; last_date?: string; services?: string }[];
    total_records: number;
    total_measurements: number;
  } | null = null;

  /** Load the referral security tab: secure referral story. */
  private async loadReferralSecurity() {
    try {
      this.referralSecurity = await this.api.patientReferralTimeline();
    } catch {
      this.referralSecurity = null;
    }
    this.syncView();
  }

  /** Compute a comprehensive health summary from all records, measurements, and referrals. */
  private computeHealthSummary() {
    if (!this.data) {
      this.healthSummary = null;
      return;
    }
    const records = this.data.records || [];
    const measurements = this.data.measurements || [];
    const referrals = this.data.referrals || [];

    const careTeam = new Map<string, {
      name: string;
      hospital: string;
      measurements: number;
      treatment_records: number;
      other_records: number;
      latest_date: string;
    }>();

    const addCareEntry = (name: string, hospital: string, type: 'measurement' | 'treatment' | 'record', date: string) => {
      const normalizedName = name.trim();
      if (!normalizedName) return;
      const facility = hospital.trim() || 'Hospital not recorded';
      const key = `${normalizedName.toLocaleLowerCase()}|${facility.toLocaleLowerCase()}`;
      const entry = careTeam.get(key) ?? {
        name: normalizedName,
        hospital: facility,
        measurements: 0,
        treatment_records: 0,
        other_records: 0,
        latest_date: '',
      };
      if (type === 'measurement') entry.measurements += 1;
      else if (type === 'treatment') entry.treatment_records += 1;
      else entry.other_records += 1;
      if (date > entry.latest_date) entry.latest_date = date;
      careTeam.set(key, entry);
    };

    for (const measurement of measurements) {
      addCareEntry(measurement.doctor || '', measurement.hospital || '', 'measurement', measurement.date ?? measurement.created_at ?? '');
    }

    const clinicianKeys = new Set(['doctor', 'doctor_name', 'physician', 'physician_name', 'provider', 'provider_name', 'treated_by']);
    for (const record of records) {
      if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data)) continue;
      for (const [key, value] of Object.entries(record.data)) {
        if (!clinicianKeys.has(key.toLowerCase())) continue;
        const doctorName = typeof value === 'string'
          ? value
          : value && typeof value === 'object' && !Array.isArray(value) && ('full_name' in value || 'name' in value || 'doctor_name' in value)
            ? String(('full_name' in value && value.full_name) || ('name' in value && value.name) || ('doctor_name' in value && value.doctor_name) || '')
            : '';
        const recordType = (record.type || '').toLowerCase();
        const isTreatment = ['treatment', 'prescription', 'medication', 'procedure'].some(term => recordType.includes(term));
        addCareEntry(doctorName, record.facility || '', isTreatment ? 'treatment' : 'record', record.date || '');
      }
    }

    // --- 1. EXTRACT ALL DISEASES, DIAGNOSES & CONDITIONS ---
    const diseaseCounter: Record<string, number> = {};
    const addDisease = (disease: string) => {
      if (!disease) return;
      const clean = disease.trim();
      if (!clean || clean.length < 2) return;
      const lower = clean.toLowerCase();
      // Skip pure boilerplate/boolean values
      if (['positive', 'negative', 'normal', 'abnormal', 'yes', 'no', 'true', 'false', 'none', 'n/a', 'null', 'undefined'].includes(lower)) return;
      // Capitalize first letter of each word
      const formatted = clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      diseaseCounter[formatted] = (diseaseCounter[formatted] || 0) + 1;
    };

    for (const r of records) {
      let foundDiseaseInRecord = false;
      if (r.data && typeof r.data === 'object' && !Array.isArray(r.data)) {
        for (const [key, value] of Object.entries(r.data)) {
          const lk = key.toLowerCase().trim();
          const strVal = typeof value === 'string' ? value.trim() : (Array.isArray(value) ? value.join(', ') : String(value || ''));

          // Case A: Key mentions diagnosis / disease / condition / illness / complaint
          if (['diagnos', 'disease', 'condition', 'illness', 'problem', 'finding', 'pathology', 'infection', 'disorder', 'complaint', 'assessment'].some(term => lk.includes(term))) {
            if (Array.isArray(value)) {
              for (const item of value) {
                if (typeof item === 'string') {
                  item.split(/[,;\n]+/).forEach(d => addDisease(d));
                  foundDiseaseInRecord = true;
                }
              }
            } else if (typeof value === 'string') {
              value.split(/[,;\n]+/).forEach(d => addDisease(d));
              foundDiseaseInRecord = true;
            }
          }
          // Case B: Key IS the disease itself with a positive/confirmed/detected result (e.g., malaria: 'positive')
          else if (['positive', 'confirmed', 'detected', 'present', 'severe', 'mild', 'chronic', 'acute', 'yes'].some(t => strVal.toLowerCase().includes(t))) {
            addDisease(key);
            foundDiseaseInRecord = true;
          }
          // Case C: Test indicates a disease (e.g. test: 'malaria', result: 'positive')
          else if (lk === 'test' || lk === 'lab_test' || lk === 'examination') {
            const resultVal = String((r.data as any)['result'] || (r.data as any)['status'] || '').toLowerCase();
            if (!resultVal.includes('negative')) {
              addDisease(strVal);
              foundDiseaseInRecord = true;
            }
          }
        }
      }

      // If no specific clinical disease found in payload, include record type
      if (!foundDiseaseInRecord && r.type) {
        addDisease(r.type);
      }
    }

    // Also check measurements for disease test kinds (like "MALARIA")
    for (const m of measurements) {
      const mk = (m.kind || '').trim();
      const lowerMk = mk.toLowerCase();
      if (['malaria', 'typhoid', 'cholera', 'tuberculosis', 'tb', 'hiv', 'covid', 'diabetes', 'hypertension', 'asthma', 'pneumonia'].some(d => lowerMk.includes(d))) {
        addDisease(mk);
      }
    }

    const diagnoses = Object.entries(diseaseCounter)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));

    // --- 2. MEDICINES: SCAN RECORD DATA ---
    const medCounter: Record<string, number> = {};
    for (const r of records) {
      if (!r.data || typeof r.data !== 'object') continue;
      for (const [key, value] of Object.entries(r.data)) {
        const lk = key.toLowerCase();
        if (['medicine', 'medication', 'drug', 'prescription', 'rx', 'treatment'].some(t => lk.includes(t))) {
          const detail = typeof value === 'string' && value.length > 0 ? `${key}: ${value}` : `${key}`;
          medCounter[detail] = (medCounter[detail] || 0) + 1;
        }
      }
    }
    const medicines = Object.entries(medCounter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([detail, count]) => ({ detail, count }));

    // --- 3. ALL MEASUREMENTS: GROUP & TRACK ALL KINDS + VITALS IN RECORDS ---
    const measCounter: Record<string, number> = {};
    const measLatest: Record<string, { value: any; unit: string; date: string; doctor: string; hospital: string }> = {};

    for (const m of measurements) {
      const kind = (m.kind || 'Other').trim();
      measCounter[kind] = (measCounter[kind] || 0) + 1;
      const measurementDate = m.date ?? m.created_at ?? '';
      if (!measLatest[kind] || measurementDate > measLatest[kind].date) {
        measLatest[kind] = {
          value: m.value,
          unit: m.unit || '',
          date: measurementDate,
          doctor: m.doctor || '',
          hospital: m.hospital || '',
        };
      }
    }

    // Also check records for vitals embedded in r.data (e.g. temp: '38.5°C', bp: '120/80')
    for (const r of records) {
      if (r.data && typeof r.data === 'object' && !Array.isArray(r.data)) {
        for (const [key, value] of Object.entries(r.data)) {
          const lk = key.toLowerCase().trim();
          if (['temp', 'temperature', 'blood_pressure', 'bp', 'heart_rate', 'pulse', 'weight', 'height', 'bmi', 'spo2', 'glucose', 'sugar'].some(v => lk.includes(v))) {
            const kindName = key.charAt(0).toUpperCase() + key.slice(1);
            if (!measCounter[kindName]) {
              measCounter[kindName] = (measCounter[kindName] || 0) + 1;
              measLatest[kindName] = {
                value: value,
                unit: '',
                date: r.date || '',
                doctor: '',
                hospital: r.facility || '',
              };
            }
          }
        }
      }
    }

    const measurementsSummary = Object.entries(measCounter)
      .sort((a, b) => b[1] - a[1])
      .map(([kind, count]) => {
        const lv = measLatest[kind];
        return {
          kind,
          count,
          latest_value: lv ? lv.value : 0,
          latest_unit: lv?.unit || '',
          latest_date: lv?.date || '',
          latest_doctor: lv?.doctor || '',
          latest_hospital: lv?.hospital || '',
        };
      });

    // --- 4. ALL HOSPITALS WHERE PATIENT HAS BEEN VISITED EARLIER ---
    const hospitalMap: Record<string, { count: number; last_date: string; services: Set<string> }> = {};
    const recordHospital = (name: string, date: string, service: string) => {
      if (!name) return;
      const clean = name.trim();
      if (!clean || clean.toLowerCase() === 'none' || clean.toLowerCase() === 'unknown') return;
      if (!hospitalMap[clean]) {
        hospitalMap[clean] = { count: 0, last_date: date || '', services: new Set() };
      }
      hospitalMap[clean].count += 1;
      if (date && date > hospitalMap[clean].last_date) {
        hospitalMap[clean].last_date = date;
      }
      if (service) hospitalMap[clean].services.add(service);
    };

    // From all records
    for (const r of records) {
      if (r.facility) recordHospital(r.facility, r.date || '', r.type || 'Medical Record');
    }
    // From all measurements
    for (const m of measurements) {
      if (m.hospital) recordHospital(m.hospital, m.date ?? m.created_at ?? '', `Measurement (${m.kind})`);
    }
    // From all referrals (both originating and target hospitals)
    for (const ref of referrals) {
      if (ref.from_hospital) recordHospital(ref.from_hospital, ref.date || '', 'Referral Out');
      if (ref.to_hospital) recordHospital(ref.to_hospital, ref.date || '', 'Referral In');
    }
    // From patient's registered facility
    if (this.data.hospital) {
      recordHospital(this.data.hospital, '', 'Registration Facility');
    }

    const hospitalVisits = Object.entries(hospitalMap)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([facility, info]) => ({
        facility,
        count: info.count,
        last_date: info.last_date,
        services: Array.from(info.services).join(' · '),
      }));

    this.healthSummary = {
      diagnoses,
      medicines,
      measurements: measurementsSummary,
      care_team: [...careTeam.values()].sort((a, b) => b.latest_date.localeCompare(a.latest_date)),
      hospital_visits: hospitalVisits,
      total_records: records.length,
      total_measurements: measurements.length,
    };
    this.syncView();
  }

  /** Record the tx of an on-chain action and surface it in the banner. */
  private showLastTx(label: string, tx_hash?: string, pending = false) {
    const h = (tx_hash || '').trim();
    if (!h) return;
    this.lastTx = { label, tx_hash: h, pending: pending || this.isPendingTx(h) };
    // Keep the on-chain story fresh right after a real transaction.
    if (this.tab === 'activity') void this.loadStory();
  }

  isPendingTx(h: string): boolean {
    return h.startsWith('PENDING');
  }

  etherscanUrl(h: string): string {
    return `https://sepolia.etherscan.io/tx/${h}`;
  }

  async ngOnInit() {
    this.workspaceState.bindSession(this.auth.token);
    if (!this.auth.isPatient) {
      this.router.navigate(['/login']);
      return;
    }
    this.loadSendHospitals();
    // Show the skeleton immediately; the heavy records + blockchain call
    // runs once in the background and swaps the real UI in via reload().
    this.loading = true;
    this.syncView();
    void this.reload();
    this.startPolling();
    // Pre-warm the doctor list so it's available when the patient opens
    // the Grant Access page.
    void this.fetchDoctors();
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    if (this.doctorSearchTimer) clearTimeout(this.doctorSearchTimer);
    this.stopEmergencyTicker();
  }

  /** Load the list of hospitals so the patient can pick where to go. */
  private async loadSendHospitals() {
    try {
      this.sendHospitals = await this.api.hospitals();
    } catch {
      this.sendHospitals = [];
    }
    this.syncView();
  }

  /** Filtered story items for the Audit Logs tab */
  get auditFilteredStory(): typeof this.story {
    switch (this.storyFilter) {
      case 'views':
        return this.story.filter(s => ['RecordViewed', 'PatientDashboardViewed'].includes(s.event));
      case 'permissions':
        return this.story.filter(s => ['AccessGranted', 'AccessRevoked', 'AccessRequested', 'PatientRegistered'].includes(s.event));
      case 'measurements':
        return this.story.filter(s => ['MeasurementRecorded', 'RecordAdded', 'ReferralAccepted'].includes(s.event));
      case 'emergency':
        return this.story.filter(s => ['BreakGlassUsed', 'EmergencyAccessGranted', 'EmergencyAccessRevoked'].includes(s.event));
      default:
        return this.story;
    }
  }

  /** Load the unified on-chain activity story (who did what, when). */
  async loadStory() {
    if (!this.data?.health_id || this.storyLoading) return;
    this.storyLoading = true;
    this.storyError = '';
    this.syncView();
    try {
      await this.workspaceState.patientActivity.load(
        async () => {
          const response = await this.api.patientActivityStory(this.data!.health_id);
          this.storySource = (response as any).source === 'db' ? 'db' : 'chain';
          return response.story;
        },
        true,
      );
      // A PENDING grant just mined? Update the banner to show the live link.
      if (this.lastTx?.pending && this.story.some((s) => s.transaction_hash === this.lastTx!.tx_hash)) {
        this.lastTx.pending = false;
      }
    } catch (e: any) {
      console.error('Failed to load activity story:', e);
      this.storyError = e?.error?.error || e?.message || 'Could not load access history. Please try again.';
    } finally {
      this.storyLoading = false;
      this.syncView();
    }
  }

  integrityStatusLabel(status: string): string {
    const labels: Record<string, string> = { VERIFIED: 'Matches earlier details', TAMPERED_PAYLOAD: 'Needs review', CHAIN_MISMATCH: 'Could not confirm', UNANCHORED: 'Not yet checked' };
    return labels[status] ?? 'Check status unavailable';
  }

  auditEventLabel(event: string): string {
    const labels: Record<string, string> = {
      RecordViewed: 'Medical record viewed',
      PatientDashboardViewed: 'Patient account viewed',
      AccessGranted: 'Access granted',
      AccessRevoked: 'Access removed',
      EmergencyAccessUsed: 'Emergency access used',
      ReferralAccepted: 'Referral accepted',
    };
    return labels[event] ?? event.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  }

  get accessEvents(): ActivityStoryItem[] {
    return this.story.filter((event) => event.event === 'RecordViewed');
  }

  /** Run on-demand tamper detection against the blockchain */
  async runIntegrityCheck() {
    if (this.integrityLoading) return;
    this.integrityLoading = true;
    this.integrityError = '';
    this.integrityReport = null;
    this.syncView();
    try {
      this.integrityReport = await this.api.verifyIntegrity();
    } catch (e: any) {
      this.integrityError = e?.error?.error || e?.message || 'Integrity check failed. Please try again.';
    } finally {
      this.integrityLoading = false;
      this.syncView();
    }
  }

  /** CSS classes for an integrity status badge */
  integrityBadgeClass(status: IntegrityCheckResult['status']): string {
    switch (status) {
      case 'VERIFIED': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'TAMPERED_PAYLOAD': return 'bg-red-100 text-red-800 border-red-300 animate-pulse';
      case 'CHAIN_MISMATCH': return 'bg-red-100 text-red-800 border-red-300';
      case 'UNANCHORED': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'CHAIN_UNAVAILABLE': return 'bg-slate-100 text-slate-600 border-slate-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  }

  get breakGlassCount(): number {
    return this.story.filter(s => s.event === 'BreakGlassUsed' || s.event === 'EmergencyAccessGranted').length;
  }

  get recordViewedCount(): number {
    return this.story.filter(s => s.event === 'RecordViewed').length;
  }

  get onChainCount(): number {
    return this.story.filter(s => !!(s as any).etherscan_url).length;
  }

  /** Count events for each audit filter category */
  auditCategoryCount(filterId: string): number {
    switch (filterId) {
      case 'views':
        return this.story.filter(s => ['RecordViewed', 'PatientDashboardViewed'].includes(s.event)).length;
      case 'permissions':
        return this.story.filter(s => ['AccessGranted', 'AccessRevoked', 'AccessRequested', 'PatientRegistered'].includes(s.event)).length;
      case 'measurements':
        return this.story.filter(s => ['MeasurementRecorded', 'RecordAdded', 'ReferralAccepted'].includes(s.event)).length;
      case 'emergency':
        return this.story.filter(s => ['BreakGlassUsed', 'EmergencyAccessGranted', 'EmergencyAccessRevoked'].includes(s.event)).length;
      default:
        return this.story.length;
    }
  }

  /**
   * Poll every 15s: refresh access requests (popups) AND the core payload
   * (records, measurements, referrals, audit trail) so the dashboard stays
   * live — e.g. a doctor's VIEW event or a new record appears on its own.
   */
  private startPolling() {
    this.pollTimer = setInterval(async () => {
      if (this.pollInFlight) return;
      this.pollInFlight = true;
      // Keep the dashboard access preview and full history fresh.
      if (this.tab === 'activity' || this.tab === 'dashboard') void this.loadStory();
      try {
        const [requests, records] = await Promise.allSettled([
          this.workspaceState.patientRequests.load(() => this.api.myRequests(), true),
          this.workspaceState.patientRecords.load(() => this.api.myRecords(), true),
        ]);
        if (requests.status === 'fulfilled') {
          this.requests = requests.value;
          this.syncNotifications();
        }
        if (records.status === 'fulfilled') {
          this.data = records.value;
          this.computeHealthSummary();
          this.errorMsg = '';
        }
        this.syncView();
      } finally {
        this.pollInFlight = false;
      }
    }, 15000);
  }

  private syncNotifications() {
    this.notifications = this.requests.filter((r) => !this.dismissedIds.has(r.id));
    this.syncView();
  }

  dismiss(id: number) {
    this.dismissedIds.add(id);
    this.syncNotifications();
  }

  async approveFromToast(req: AccessRequest) {
    await this.approve(req);
    this.dismiss(req.id);
  }

  async rejectFromToast(req: AccessRequest) {
    await this.reject(req);
    this.dismiss(req.id);
  }

  async reload() {
    this.loading = true;
    this.errorMsg = '';
    this.syncView();
    try {
      // Records first — render the dashboard as soon as the core payload
      // arrives instead of waiting on the (non-critical) request list.
      const data = await this.workspaceState.patientRecords.load(() => this.api.myRecords());
      this.data = data;
      this.computeHealthSummary();
      void this.loadStory();
      void this.loadGrantSummary();
    } catch (e: any) {
      // 401 = token expired: log the user out so the login page handles it
      if (e?.status === 401) {
        this.auth.logout();
        this.router.navigate(['/login']);
        return;
      }
      this.errorMsg = e?.error?.error || e?.message || 'Could not load your records.';
      this.loading = false;
      this.syncView();
      return;
    } finally {
      this.loading = false;
      this.syncView();
    }

    // Requests are non-blocking: the dashboard is already visible.
    try {
      await this.workspaceState.patientRequests.load(() => this.api.myRequests());
      this.syncNotifications();
    } catch {
      // non-critical — retry happens on the next poll tick
    }
    this.syncView();
  }

  retry() {
    void this.reload();
  }

  entries(data: any): { key: string; value: any }[] {
    if (!data) return [];
    return Object.entries(data).map(([key, value]) => ({ key, value }));
  }

  async grantAccess() {
    if (!this.grant.doctor_license) {
      this.notify('Pick a doctor from the list first.', true);
      return;
    }
    this.busy = true;
    this.syncView();
    try {
      const doctorLabel = this.selectedDoctor?.full_name || this.grant.doctor_name || this.grant.doctor_license;
      const res: any = await this.api.grantAccess(this.grant);
      this.showLastTx(`Access given to Dr. ${doctorLabel}`, res?.tx_hash, res?.pending);
      this.notify(res?.pending ? 'Your request was submitted and is waiting for confirmation.' : 'Doctor access granted.');
      this.grant = { doctor_license: '', doctor_name: '', doctor_wallet: '', days: 7 };
      this.selectedDoctor = null;
      this.doctorQuery = '';
      void this.reload();
    } catch (e: any) {
      this.notify(e?.error?.error || e?.message || 'Could not grant access.', true);
    } finally {
      this.busy = false;
      this.syncView();
    }
  }

  async approve(req: AccessRequest) {
    this.busyRequest = req.id;
    this.syncView();
    try {
      const res: any = await this.api.approveRequest(req.id);
      this.showLastTx(`Access given to Dr. ${req.doctor_name} for 7 days`, res?.tx_hash, res?.pending);
      this.notify(res?.pending ? 'Your approval was submitted and is waiting for confirmation.' : 'Access request approved.');
      void this.reload();
    } catch (e: any) {
      this.notify(e?.error?.error || e?.message || 'Could not approve the request.', true);
    } finally {
      this.busyRequest = null;
      this.syncView();
    }
  }

  async reject(req: AccessRequest) {
    this.busyRequest = req.id;
    this.syncView();
    try {
      await this.api.rejectRequest(req.id);
      this.notify('Access request rejected.');
      await this.reload();
    } catch (e: any) {
      this.notify(e?.error?.error || e?.message || 'Could not reject the request.', true);
    } finally {
      this.busyRequest = null;
      this.syncView();
    }
  }

  /** Patient sends a referral request to another hospital (staff/doctor must accept). */
  async sendReferral() {
    if (!this.referralForm.to_hospital) {
      this.sendMsg = 'Choose a target hospital.';
      this.sendOk = false;
      this.syncView();
      return;
    }
    this.sendBusy = true;
    this.sendMsg = '';
    this.syncView();
    try {
      const res: any = await this.api.sendPatientReferral({
        to_hospital: this.referralForm.to_hospital,
        reason: this.referralForm.reason.trim(),
      });
      this.sendOk = true;
      this.sendMsg = res.message || 'Referral request sent — the receiving hospital must accept it.';
      this.referralForm = { to_hospital: '', reason: '' };
      await this.reload();
    } catch (e: any) {
      this.sendMsg = e?.error?.error || e?.message || 'Failed to send referral';
      this.sendOk = false;
    } finally {
      this.sendBusy = false;
      this.syncView();
    }
  }

  /** Load doctors matching the current query so the picker can suggest them. */
  private async fetchDoctors() {
    this.doctorLoading = true;
    this.syncView();
    try {
      this.doctors = await this.api.listDoctors(this.doctorQuery.trim() || undefined);
    } catch {
      // offline — the picker stays empty but the form still works
      this.doctors = [];
    } finally {
      this.doctorLoading = false;
      this.syncView();
    }
  }

  /** Re-search (debounced) as the patient types a name or license fragment;
   * editing the text after picking a doctor drops the stale selection. */
  onDoctorQueryChanged() {
    if (this.selectedDoctor && this.doctorQuery !== this.selectedDoctor.full_name) {
      this.selectedDoctor = null;
      this.fillGrantFormFromDoctor();
    }
    if (this.doctorSearchTimer) clearTimeout(this.doctorSearchTimer);
    this.doctorSearchTimer = setTimeout(() => void this.fetchDoctors(), 250);
  }

  /** Pick a doctor from the dropdown; autofills the grant payload so the
   * patient only confirms the days instead of retyping identifiers. */
  selectDoctor(d: DoctorOption) {
    this.selectedDoctor = d;
    this.doctorQuery = d.full_name;
    this.showSuggestions = false;
    this.fillGrantFormFromDoctor();
    this.syncView();
  }

  private fillGrantFormFromDoctor() {
    this.grant.doctor_license = this.selectedDoctor?.license_no ?? '';
    this.grant.doctor_name = this.selectedDoctor?.full_name ?? '';
    this.grant.doctor_wallet = this.selectedDoctor?.wallet_address ?? '';
  }

  /** Count referrals matching a specific status string (case-insensitive). */
  countReferralsByStatus(status: string): number {
    if (!this.data?.referrals) return 0;
    return this.data.referrals.filter(
      (r) => (r.status || '').toUpperCase() === status.toUpperCase()
    ).length;
  }

  /** Log out and take the user back to the sign-in page. */
  logoutAndRedirect() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
