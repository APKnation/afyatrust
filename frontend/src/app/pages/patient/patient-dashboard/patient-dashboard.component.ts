import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { NgIf, NgFor, SlicePipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, PatientData, AccessRequest, DoctorOption, ActivityStoryItem, EmergencyAccessItem, ActiveGrantItem, IntegrityCheckResult, IntegrityReport } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';
import { RecordChartComponent, RecordChartPoint } from '../../../components/shared/record-chart/record-chart.component';

@Component({
  selector: 'app-patient-dashboard',
  imports: [NgIf, NgFor, SlicePipe, DatePipe, FormsModule, RecordChartComponent],
  template: `
    <!-- LOADING (instant — skeleton, disappears as soon as first bytes arrive) -->
    <div *ngIf="loading && !data" class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40">
      <div class="w-14 h-14 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mb-4"></div>
      <p class="text-slate-600 text-sm font-medium">Loading your health records…</p>
    </div>

    <!-- NOT LOGGED IN -->
    <div *ngIf="!auth.isAuthenticated()" class="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40">
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
    <div *ngIf="errorMsg && !data" class="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40">
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
        <aside class="w-full lg:w-64 xl:w-72 bg-white border-r border-slate-100 lg:min-h-screen">
          <div class="p-6">
            <div class="mb-8">
              <h2 class="text-xl font-bold text-slate-900 mb-1">{{ data.full_name }}</h2>
              <p class="text-sm text-slate-500 mb-3">Health ID: <span class="font-semibold text-slate-700">{{ data.health_id }}</span></p>
              <div class="flex items-center gap-2 p-3 bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-slate-200">
                <div class="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center">
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-xs text-slate-500">Custodial Wallet</p>
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
            <nav class="space-y-2">
              <button *ngFor="let t of tabs"
                      (click)="setTab(t.id)"
                      class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group"
                      [class]="tab === t.id ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-100'">
                <span [class]="tab === t.id ? 'text-white' : 'text-slate-500 group-hover:text-primary-500'" [innerHTML]="getIcon(t.id)"></span>
                <span class="font-medium">{{ t.label }}</span>
                <span *ngIf="t.id === 'requests' && requests.length > 0" class="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{{ requests.length }}</span>
              </button>
            </nav>

            <!-- BOTTOM ACTIONS -->
            <div class="mt-6 pt-4 border-t border-slate-200 space-y-2">
              <button (click)="viewProfile()"
                      class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 hover:bg-slate-100 transition-all duration-200 group">
                <span class="font-medium">View Profile</span>
              </button>
              <button (click)="logoutAndRedirect()"
                      class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 hover:bg-red-50 hover:text-red-600 transition-all duration-200 group">
                <span class="font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </aside>

        <!-- MAIN CONTENT -->
        <main class="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <!-- LAST TX BANNER -->
          <div *ngIf="lastTx" class="mb-6 bg-white rounded-2xl border-l-4 shadow-lg overflow-hidden"
               [class]="lastTx.pending ? 'border-l-amber-500' : 'border-l-emerald-500'">
            <div class="p-5 flex flex-wrap items-center justify-between gap-4">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center"
                     [class]="lastTx.pending ? 'bg-amber-100' : 'bg-emerald-100'">
                </div>
                <div>
                  <h3 class="font-semibold text-slate-900 mb-1">{{ lastTx.label }}</h3>
                  <p class="text-sm text-slate-600">
                    {{ lastTx.pending ? 'Transaction submitted — confirmation pending' : 'Written to Sepolia blockchain' }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <code class="text-xs font-mono bg-slate-100 px-3 py-1.5 rounded-lg text-slate-700">{{ lastTx.tx_hash | slice:0:16 }}…</code>
                <a *ngIf="!isPendingTx(lastTx.tx_hash)" [href]="etherscanUrl(lastTx.tx_hash)" target="_blank" rel="noopener" class="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2">
                  View on Etherscan
                </a>
                <button (click)="lastTx = null" class="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                </button>
              </div>
            </div>
          </div>

      <!-- LAST ON-CHAIN ACTION (Etherscan-verifiable) -->
      <div *ngIf="lastTx" class="mb-6 rounded-2xl border-l-4 p-5 bg-white shadow-sm border border-slate-100"
           [class]="lastTx.pending ? 'border-l-orange-500' : 'border-l-accent-500'">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="m-0 text-sm font-bold text-ink">{{ lastTx.label }}</h2>
            <p class="m-0 text-xs text-muted">
              {{ lastTx.pending
                ? 'Transaction submitted — the confirmation will appear in your Blockchain Transactions tab shortly.'
                : 'Written to Sepolia — verify it on Etherscan.' }}
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

      <!-- PENDING REQUESTS BANNER (visible on every tab) -->
      <div *ngIf="requests.length > 0" class="card mb-6 border-l-4 border-l-accent-500 p-5">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="m-0 text-lg font-bold">Doctor waiting for your answer</h2>
            <p class="m-0 text-sm text-muted">Approving grants 7 days of on-chain access. Rejecting blocks the doctor from your records.</p>
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
                  <span>Longitudinal Medical History & Care Journey</span>
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    <span class="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    Multi-Hospital Chain
                  </span>
                </h1>
                <p class="text-sm text-slate-500 mt-1 max-w-3xl leading-relaxed">
                  Your complete healthcare story from where you began to where you were referred. Track every clinical measurement, diagnosis, and treatment with the responsible doctor, measured results, and the cryptographic proof anchored on Ethereum Sepolia.
                </p>
              </div>
            </div>

            <!-- HOSPITAL CARE JOURNEY (Where care started to where it ended) -->
            <div *ngIf="careJourneyFacilities.length > 0" class="card bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-xl border border-indigo-900/50">
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2.5">
                  <div class="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                  </div>
                  <div>
                    <h2 class="text-sm font-bold text-white uppercase tracking-wider">Hospital Care Progression (Origin &rarr; Transfers)</h2>
                    <p class="text-xs text-indigo-300">Continuous inter-hospital health record anchored across facilities</p>
                  </div>
                </div>
                <span class="text-xs font-mono font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  {{ careJourneyFacilities.length }} Facility Stops
                </span>
              </div>

              <!-- Stepper Chain -->
              <div class="flex flex-col sm:flex-row sm:items-center gap-3 overflow-x-auto pb-2 pt-1">
                <div *ngFor="let fac of careJourneyFacilities; let i = index; let last = last" class="flex items-center gap-3 flex-shrink-0">
                  <div class="flex items-center gap-3 bg-slate-900/90 border border-indigo-500/30 rounded-xl px-4 py-3 min-w-[200px]">
                    <div class="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {{ i + 1 }}
                    </div>
                    <div>
                      <p class="text-xs text-indigo-300 font-medium">
                        {{ i === 0 ? 'Initial Facility' : (last ? 'Current / Latest' : 'Transfer Facility') }}
                      </p>
                      <p class="text-sm font-bold text-white capitalize truncate max-w-[160px]">{{ fac.name }}</p>
                      <p *ngIf="fac.doctor" class="text-[11px] text-slate-400 truncate max-w-[160px]">Dr. {{ fac.doctor }}</p>
                    </div>
                  </div>
                  <svg *ngIf="!last" class="w-5 h-5 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                  </svg>
                </div>
              </div>
            </div>

            <!-- 4 Summary Stat Cards -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Care Events</p>
                <p class="text-2xl font-extrabold text-slate-900">{{ allMedicalHistoryItemsRaw.length }}</p>
                <p class="text-xs text-slate-500 mt-0.5">Clinical encounters recorded</p>
              </div>
              <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Facilities Visited</p>
                <p class="text-2xl font-extrabold text-indigo-600">{{ totalCareFacilitiesCount }}</p>
                <p class="text-xs text-slate-500 mt-0.5">Hospitals in your care journey</p>
              </div>
              <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Doctors Engaged</p>
                <p class="text-2xl font-extrabold text-teal-600">{{ totalDoctorsEngagedCount }}</p>
                <p class="text-xs text-slate-500 mt-0.5">Attending physicians & staff</p>
              </div>
              <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Blockchain Anchors</p>
                <p class="text-2xl font-extrabold text-emerald-600">{{ onChainVerifiedEventsCount }}</p>
                <p class="text-xs text-slate-500 mt-0.5">Sealed on Ethereum Sepolia</p>
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
                          [class]="item.category === 'measurement' ? 'bg-teal-50 text-teal-700 border border-teal-200' : (item.category === 'record' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-violet-50 text-violet-700 border border-violet-200')">
                      {{ item.categoryLabel }}
                    </span>
                    <span class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 capitalize">
                      <svg class="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
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
                  <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-3">
                    <div class="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                      </svg>
                    </div>
                    <div class="min-w-0">
                      <p class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Responsible Clinician</p>
                      <p class="text-sm font-bold text-slate-900 truncate">{{ item.doctor }}</p>
                      <p *ngIf="item.doctorLicense" class="text-xs text-slate-500">License: {{ item.doctorLicense }}</p>
                      <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 mt-1">
                        <svg class="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                        Consent Authorized
                      </span>
                    </div>
                  </div>

                  <!-- What Was Done & Result Box -->
                  <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
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
                            [class]="item.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'">
                        {{ item.status }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Bottom Web3 Security Bar: HOW BLOCKCHAIN APPLIES HERE -->
                <div class="mt-3 p-4 bg-slate-900 text-white rounded-xl border border-indigo-500/20">
                  <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div class="flex items-center gap-2">
                      <svg class="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                      </svg>
                      <span class="text-xs font-bold uppercase tracking-wider text-emerald-400">How Blockchain Applies Here</span>
                    </div>
                    <span class="text-[11px] font-mono text-indigo-300">Ethereum Sepolia Proof</span>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">SHA-256 Record Hash (Integrity Fingerprint)</p>
                      <div class="flex items-center gap-1.5">
                        <code *ngIf="item.hash" class="font-mono text-emerald-300 bg-slate-950 px-2 py-1 rounded border border-slate-800 text-[11px] truncate select-all flex-1">
                          {{ item.hash }}
                        </code>
                        <span *ngIf="!item.hash" class="text-slate-500 italic text-[11px]">Anchoring pending</span>
                        <button *ngIf="item.hash" type="button" (click)="copyHash(item.hash)"
                                class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold border border-slate-700 flex-shrink-0 cursor-pointer">
                          {{ copiedHash === item.hash ? 'Copied!' : 'Copy' }}
                        </button>
                      </div>
                    </div>

                    <div>
                      <p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">On-Chain Transaction & Verification</p>
                      <div class="flex items-center gap-2">
                        <a *ngIf="item.tx_hash && !item.tx_hash.startsWith('PENDING')"
                           [href]="'https://sepolia.etherscan.io/tx/' + item.tx_hash"
                           target="_blank" rel="noopener"
                           class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[11px] transition-colors">
                          <span>Verify Tx on Etherscan</span>
                          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                        </a>
                        <span *ngIf="!item.tx_hash || item.tx_hash.startsWith('PENDING')" class="text-amber-400 text-[11px] italic">
                          Tx confirmation queued
                        </span>
                      </div>
                    </div>
                  </div>

                  <p class="text-[11px] text-slate-400 mt-2.5 pt-2 border-t border-slate-800/80 leading-relaxed">
                    <span class="text-slate-300 font-semibold">Decentralized Trust:</span> Clinical notes stay securely in the hospital database off-chain. Only this cryptographic SHA-256 hash lives on Ethereum Sepolia. If any party modifies this reading in the hospital database, the hash check fails immediately.
                  </p>
                </div>
              </div>
            </div>

            <!-- Empty State -->
            <div *ngIf="filteredMedicalHistoryItems.length === 0" class="card py-12 text-center">
              <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-1">No Care Events Found</h3>
              <p class="text-sm text-slate-500 max-w-sm mx-auto">No clinical records match the selected filter. Try selecting "All Events" to view all medical history.</p>
            </div>
          </div>

          <!-- MEASUREMENTS (Clinical Vitals with Blockchain Verification) -->
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
                  Clinical vital signs recorded by authorized attending doctors. Every reading is cryptographically anchored on Ethereum Sepolia.
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
                      <th class="px-5 py-3.5">Blockchain Proof</th>
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
                            <span>Verified Tx</span>
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                          </a>
                          <span *ngIf="!m.tx_hash || m.tx_hash.startsWith('PENDING')" class="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Queued
                          </span>
                          <button *ngIf="m.record_hash" type="button" (click)="copyHash(m.record_hash)"
                                  class="text-xs text-slate-500 hover:text-slate-800 underline font-mono cursor-pointer" title="Copy SHA-256 Hash">
                            Hash
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
                <p class="text-sm text-slate-500">Clinical measurements recorded by doctors will appear here with cryptographic integrity proofs.</p>
              </div>
            </div>
          </div>

          <!-- REFERRALS (Advanced UI) -->
          <div *ngIf="tab === 'referrals'" class="space-y-6 animate-fade-in">

            <!-- PAGE HEADER -->
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div class="flex items-center gap-2 mb-2">
                  <span class="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" /></svg>
                  </span>
                  <h1 class="text-2xl font-extrabold text-slate-900 tracking-tight">My Referrals</h1>
                </div>
                <p class="text-slate-500 text-sm leading-relaxed">Track every hospital referral — on-chain secured and tamper-proof.</p>
              </div>
              <button (click)="referralModal = true"
                      class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold shadow-lg shadow-violet-200 hover:shadow-violet-300 hover:from-violet-600 hover:to-indigo-700 transition-all duration-200 active:scale-95">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                Request Referral
              </button>
            </div>

            <!-- STATS BAR -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div class="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total</p>
                <p class="text-2xl font-black text-slate-900">{{ data.referrals.length }}</p>
              </div>
              <div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 shadow-sm">
                <p class="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">Accepted</p>
                <p class="text-2xl font-black text-emerald-700">{{ countReferralsByStatus('ACCEPTED') }}</p>
              </div>
              <div class="bg-amber-50 border border-amber-100 rounded-2xl p-4 shadow-sm">
                <p class="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">Pending</p>
                <p class="text-2xl font-black text-amber-700">{{ countReferralsByStatus('PENDING') }}</p>
              </div>
              <div class="bg-red-50 border border-red-100 rounded-2xl p-4 shadow-sm">
                <p class="text-xs font-semibold text-red-500 uppercase tracking-wider mb-1">Declined</p>
                <p class="text-2xl font-black text-red-600">{{ countReferralsByStatus('DECLINED') }}</p>
              </div>
            </div>

            <!-- REFERRAL CARDS -->
            <div *ngIf="data.referrals.length > 0" class="space-y-4">
              <div *ngFor="let r of data.referrals; let i = index"
                   class="group relative bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-violet-100 transition-all duration-300 overflow-hidden">

                <!-- LEFT ACCENT STRIPE -->
                <div class="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
                     [class]="r.status === 'ACCEPTED' ? 'bg-emerald-500' : r.status === 'DECLINED' ? 'bg-red-400' : r.status === 'CANCELLED' ? 'bg-slate-400' : 'bg-amber-400'"></div>

                <div class="pl-5 pr-5 pt-5 pb-4">
                  <!-- TOP ROW -->
                  <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div class="flex items-start gap-3">
                      <!-- Hospital icon -->
                      <div class="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-md"
                           [class]="r.status === 'ACCEPTED' ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : r.status === 'DECLINED' ? 'bg-gradient-to-br from-red-400 to-red-600' : r.status === 'CANCELLED' ? 'bg-gradient-to-br from-slate-400 to-slate-600' : 'bg-gradient-to-br from-amber-400 to-orange-500'">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 00-1-1h-2a1 1 0 00-1 1v5m4 0H9" /></svg>
                      </div>
                      <div>
                        <h3 class="font-bold text-slate-900 text-base leading-tight">{{ r.to_hospital }}</h3>
                        <p class="text-xs text-slate-400 mt-0.5">Referral #{{ r.id }}  ·  {{ (r.date || r.created_at) | date:'MMM d, y' }}</p>
                      </div>
                    </div>

                    <!-- STATUS PILL -->
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide"
                          [class]="r.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' : r.status === 'DECLINED' ? 'bg-red-100 text-red-700 ring-1 ring-red-200' : r.status === 'CANCELLED' ? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' : 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'">
                      <span class="w-1.5 h-1.5 rounded-full"
                            [class]="r.status === 'ACCEPTED' ? 'bg-emerald-500' : r.status === 'DECLINED' ? 'bg-red-500' : r.status === 'CANCELLED' ? 'bg-slate-400' : 'bg-amber-500'"></span>
                      {{ r.status }}
                    </span>
                  </div>

                  <!-- REASON -->
                  <div *ngIf="r.reason" class="mb-4 px-4 py-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Reason</p>
                    <p class="text-sm text-slate-800 leading-relaxed">{{ r.reason }}</p>
                  </div>

                  <!-- TIMELINE MINI -->
                  <div class="flex items-center gap-2 flex-wrap">
                    <!-- Sent -->
                    <div class="flex items-center gap-1.5 text-xs text-slate-500">
                      <span class="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center">
                        <svg class="w-3 h-3 text-indigo-600" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                      </span>
                      Sent {{ (r.date || r.created_at) | date:'shortDate' }}
                    </div>
                    <!-- Arrow -->
                    <svg class="w-3 h-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
                    <!-- Response -->
                    <div *ngIf="r.responded_at" class="flex items-center gap-1.5 text-xs text-slate-500">
                      <span class="w-5 h-5 rounded-full flex items-center justify-center"
                            [class]="r.status === 'ACCEPTED' ? 'bg-emerald-100' : 'bg-red-100'">
                        <svg class="w-3 h-3" [class]="r.status === 'ACCEPTED' ? 'text-emerald-600' : 'text-red-500'" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
                      </span>
                      Responded {{ r.responded_at | date:'shortDate' }}
                      <span *ngIf="r.responded_by" class="text-slate-400">by {{ r.responded_by }}</span>
                    </div>
                    <div *ngIf="!r.responded_at" class="flex items-center gap-1.5 text-xs text-amber-600">
                      <span class="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                        <svg class="w-3 h-3 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </span>
                      Awaiting response…
                    </div>
                  </div>

                  <!-- BOTTOM: FROM DOCTOR + ON-CHAIN BADGE -->
                  <div class="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <div class="text-xs text-slate-400 flex items-center gap-1">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      <span *ngIf="r.from_doctor">Referred by Dr. {{ r.from_doctor }}</span>
                      <span *ngIf="!r.from_doctor && r.from_hospital">From {{ r.from_hospital }}</span>
                      <span *ngIf="!r.from_doctor && !r.from_hospital">Self-requested</span>
                    </div>
                    <!-- On-chain badge placeholder -->
                    <span class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                      <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                      Blockchain-secured
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- EMPTY STATE -->
            <div *ngIf="data.referrals.length === 0"
                 class="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-200 shadow-sm">
              <div class="w-20 h-20 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mb-5 shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-9 h-9 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" /></svg>
              </div>
              <h3 class="text-lg font-bold text-slate-800 mb-1">No Referrals Yet</h3>
              <p class="text-sm text-slate-400 text-center max-w-xs mb-6">When a doctor or hospital refers you to another facility, it will appear here — secured on-chain.</p>
              <button (click)="referralModal = true"
                      class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-semibold shadow-lg shadow-violet-200 hover:shadow-violet-300 transition-all duration-200 active:scale-95">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                Request your first referral
              </button>
            </div>
          </div>

          <!-- PERMISSIONS -->
          <div *ngIf="tab === 'permissions'" class="space-y-6 animate-fade-in">
            <div>
              <h1 class="text-2xl font-bold text-slate-900 mb-2">Grant Access to a Doctor</h1>
              <p class="text-slate-600">Search for a doctor by name or license number, then grant time-limited on-chain access.</p>
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
                communicate or give consent. Every view is logged on-chain, the window
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

            <div class="card">
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label class="flex flex-col gap-2 relative">
                  <span class="text-sm font-semibold text-slate-700">Doctor</span>
                  <input [(ngModel)]="doctorQuery" (ngModelChange)="onDoctorQueryChanged()" (focus)="showSuggestions = true" (blur)="showSuggestions = false" placeholder="Type doctor's name or license..." class="px-4 py-3 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow" />
                  <ul *ngIf="showSuggestions && doctors.length" class="rounded-xl border border-slate-200 bg-white max-h-56 overflow-auto shadow-xl absolute z-50 w-full top-[105%]">
                    <li *ngFor="let d of doctors" (mousedown)="selectDoctor(d)" class="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                      <div>
                        <p class="font-semibold text-slate-900">{{ d.full_name }}</p>
                        <p class="text-xs text-slate-500">{{ d.license_no }} • {{ d.facility_id }}</p>
                      </div>
                    </li>
                  </ul>
                  <p *ngIf="showSuggestions && !doctorLoading && doctors.length === 0" class="text-xs text-slate-500">No doctors found</p>
                  <p *ngIf="doctorLoading" class="text-xs text-slate-500">Searching...</p>
                </label>
                <label class="flex flex-col gap-2">
                  <span class="text-sm font-semibold text-slate-700">Access Duration (Days)</span>
                  <input type="number" [(ngModel)]="grant.days" min="1" max="90" class="px-4 py-3 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow" />
                </label>
              </div>
              <div class="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p class="text-sm text-slate-600">
                  <span class="font-semibold text-slate-700">Granting access to:</span>
                  <ng-container *ngIf="selectedDoctor">{{ selectedDoctor.full_name }} ({{ selectedDoctor.license_no }})</ng-container>
                  <ng-container *ngIf="!selectedDoctor">Select a doctor above</ng-container>
                </p>
              </div>
              <div class="mt-5 flex justify-end">
                <button type="button" (click)="grantAccess()" [disabled]="busy" class="btn-primary w-full sm:w-auto">
                  {{ busy ? 'Granting Access...' : 'Grant Access' }}
                </button>
              </div>
            </div>

            <!-- ACTIVE ROUTINE DOCTOR PERMISSIONS -->
            <div *ngIf="walletGrants?.active_grants?.length" class="card border border-primary-200 bg-white">
              <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 class="text-lg font-bold text-slate-900">Active Doctor Access Grants</h2>
                <span class="rounded-full bg-emerald-100 text-emerald-800 px-3 py-1 text-xs font-bold uppercase tracking-wide">
                  {{ walletGrants?.active_grants?.length }} active
                </span>
              </div>
              <p class="text-sm text-slate-600 mb-4">
                These doctors currently hold authorized on-chain permissions to view your medical records. You can revoke access at any time.
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
                    <p *ngIf="g.tx_hash" class="text-[11px] font-mono text-slate-400 mt-0.5 truncate max-w-xs">
                      Tx: {{ g.tx_hash }}
                    </p>
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

            <div class="card">
              <p class="text-sm text-slate-600">
                <span class="font-semibold text-slate-700">Note:</span> Access expires automatically after the granted duration. Revocations are permanently logged on the blockchain.
              </p>
            </div>
          </div>          <!-- REQUESTS -->
          <div *ngIf="tab === 'requests'" class="space-y-6 animate-fade-in">
            <div>
              <h1 class="text-2xl font-bold text-slate-900 mb-2">Access Requests</h1>
              <p class="text-slate-600">Doctors requesting access to your medical records. Approval grants 7 days of on-chain access.</p>
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
          <!-- WALLET -->
          <div *ngIf="tab === 'wallet' && walletActivity" class="space-y-6 animate-fade-in">
            <!-- Header with Network Badge -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
                  <span>Custodial Blockchain Wallet</span>
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Sepolia Live
                  </span>
                </h1>
                <p class="text-sm text-slate-500 mt-1 max-w-2xl">
                  Your self-sovereign on-chain identity on Ethereum Sepolia. All clinical hashes, access grants, and audit events are cryptographically bound to this address without requiring MetaMask.
                </p>
              </div>
              <div class="flex items-center gap-2 self-start sm:self-auto">
                <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  <svg class="w-3.5 h-3.5 text-indigo-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clip-rule="evenodd"/></svg>
                  Gasless (Sponsored)
                </span>
              </div>
            </div>

            <!-- Hero Web3 Custodial Card -->
            <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white p-6 sm:p-8 shadow-2xl border border-indigo-900/40">
              <!-- Decorative background glows -->
              <div class="absolute -right-16 -top-16 w-64 h-64 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none"></div>
              <div class="absolute -left-16 -bottom-16 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>

              <div class="relative z-10 flex flex-col justify-between min-h-[190px]">
                <!-- Card Header -->
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 p-0.5 shadow-lg shadow-indigo-500/20">
                      <div class="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                        <svg class="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                        </svg>
                      </div>
                    </div>
                    <div>
                      <p class="text-xs font-semibold uppercase tracking-wider text-indigo-300/80">AfyaTrust Sovereign Identity</p>
                      <p class="text-xs text-slate-400">Sepolia Network (Chain ID 11155111)</p>
                    </div>
                  </div>
                  <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                    <svg class="w-3 h-3 text-indigo-400" fill="currentColor" viewBox="0 0 320 512"><path d="M311.9 260.8L160 353.6 8 260.8 160 0l151.9 260.8zM160 383.4L8 290.6 160 512l152-221.4-152 92.8z"/></svg>
                    Ethereum Custodial
                  </span>
                </div>

                <!-- Card Body: Wallet Address Display -->
                <div class="my-6">
                  <p class="text-xs text-slate-400 uppercase tracking-widest mb-1.5 font-medium">Custodial Wallet Address</p>
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 backdrop-blur-md rounded-2xl p-4 border border-indigo-500/20">
                    <div class="min-w-0 flex-1">
                      <p *ngIf="walletVisible" class="font-mono text-sm sm:text-base text-emerald-400 tracking-wider break-all font-medium select-all">
                        {{ walletActivity.wallet_address }}
                      </p>
                      <p *ngIf="!walletVisible" class="font-mono text-sm sm:text-base text-slate-400 tracking-widest">
                        {{ walletActivity.wallet_address | slice:0:6 }}••••••••••••••••••••••••••••••••{{ walletActivity.wallet_address | slice:-4 }}
                      </p>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <button type="button" (click)="walletVisible = !walletVisible"
                              class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path *ngIf="!walletVisible" stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                          <path *ngIf="walletVisible" stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/>
                        </svg>
                        {{ walletVisible ? 'Hide' : 'Reveal' }}
                      </button>
                      <button type="button" (click)="copyWalletAddress()"
                              class="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer">
                        <svg *ngIf="!copiedWallet" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                        </svg>
                        <svg *ngIf="copiedWallet" class="w-3.5 h-3.5 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                        {{ copiedWallet ? 'Copied!' : 'Copy' }}
                      </button>
                      <a [href]="'https://sepolia.etherscan.io/address/' + walletActivity.wallet_address"
                         target="_blank" rel="noopener"
                         class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-indigo-300 border border-slate-700 transition-colors flex items-center gap-1">
                        <span>Explorer</span>
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                      </a>
                    </div>
                  </div>
                </div>

                <!-- Card Footer -->
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800/80 text-xs">
                  <div>
                    <span class="text-slate-500 uppercase tracking-wider block text-[10px]">Account Holder</span>
                    <span class="font-semibold text-slate-200 capitalize text-sm">{{ walletActivity.full_name }}</span>
                  </div>
                  <div>
                    <span class="text-slate-500 uppercase tracking-wider block text-[10px]">Health ID</span>
                    <span class="font-mono font-semibold text-indigo-300 text-sm">#{{ walletActivity.health_id }}</span>
                  </div>
                  <div class="col-span-2 sm:col-span-1">
                    <span class="text-slate-500 uppercase tracking-wider block text-[10px]">Key Encryption</span>
                    <span class="font-semibold text-emerald-400 text-sm flex items-center gap-1">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                      AES-256-GCM Vault
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 4 Stat Metric Cards -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <!-- Stat 1: On-Chain & Ledger Events -->
              <div class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Events Logged</span>
                  <div class="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                    </svg>
                  </div>
                </div>
                <p class="text-3xl font-extrabold text-slate-900">{{ walletActivity.activityCount }}</p>
                <p class="text-xs text-slate-500 mt-1">Actions on Sepolia & ledger</p>
              </div>

              <!-- Stat 2: Active Access Grants -->
              <div class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Grants</span>
                  <div class="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </div>
                </div>
                <p class="text-3xl font-extrabold text-emerald-600">{{ walletGrants?.activeCount || 0 }}</p>
                <p class="text-xs text-slate-500 mt-1">Doctors with active access</p>
              </div>

              <!-- Stat 3: Total Grants Ever -->
              <div class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">All-Time Grants</span>
                  <div class="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
                    </svg>
                  </div>
                </div>
                <p class="text-3xl font-extrabold text-blue-600">{{ walletGrants?.totalGrantsEver || 0 }}</p>
                <p class="text-xs text-slate-500 mt-1">Authorizations issued</p>
              </div>

              <!-- Stat 4: Pending Operations -->
              <div class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                   [class.ring-2]="walletActivity.pendingOperations > 0"
                   [class.ring-amber-400]="walletActivity.pendingOperations > 0">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Requests</span>
                  <div class="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </div>
                </div>
                <p class="text-3xl font-extrabold" [class.text-amber-600]="walletActivity.pendingOperations > 0" [class.text-slate-900]="walletActivity.pendingOperations === 0">
                  {{ walletActivity.pendingOperations }}
                </p>
                <p class="text-xs text-slate-500 mt-1">Requests waiting for response</p>
              </div>
            </div>

            <!-- Two-Column Information Section -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <!-- Left: Live Activity & On-Chain Audit Details -->
              <div class="card space-y-4">
                <div class="flex items-center justify-between">
                  <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
                    <svg class="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                    Recent On-Chain Activity
                  </h2>
                  <button type="button" (click)="loadWalletProfile()" class="text-xs text-primary-700 hover:underline font-semibold cursor-pointer">
                    Refresh
                  </button>
                </div>

                <div class="space-y-3">
                  <!-- Last Activity Timestamp -->
                  <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <p class="text-xs text-slate-500 mb-0.5">Last On-Chain Event</p>
                    <p class="text-sm font-semibold text-slate-900">
                      {{ walletActivity.lastActivityAt ? (walletActivity.lastActivityAt * 1000 | date:'medium') : 'No activity recorded yet' }}
                    </p>
                  </div>

                  <!-- Last Tx Hash -->
                  <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div class="flex items-center justify-between mb-1">
                      <p class="text-xs text-slate-500">Latest Transaction Hash</p>
                      <a *ngIf="walletActivity.lastTxHash && !walletActivity.lastTxHash.toLowerCase().startsWith('pending')"
                         [href]="'https://sepolia.etherscan.io/tx/' + walletActivity.lastTxHash"
                         target="_blank" rel="noopener"
                         class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                        <span>Sepolia Etherscan</span>
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                      </a>
                    </div>
                    <code *ngIf="walletActivity.lastTxHash" class="text-xs font-mono text-slate-800 break-all select-all block bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                      {{ walletActivity.lastTxHash }}
                    </code>
                    <p *ngIf="!walletActivity.lastTxHash" class="text-xs text-slate-500 italic">
                      None recorded yet
                    </p>
                  </div>

                  <!-- Most Recent Access Grant -->
                  <div *ngIf="walletGrants" class="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div class="flex items-center justify-between mb-1">
                      <p class="text-xs text-slate-500">Most Recent Grant</p>
                      <span *ngIf="walletGrants.expiringSoon > 0" class="text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        {{ walletGrants.expiringSoon }} expiring soon
                      </span>
                    </div>
                    <p class="text-sm font-semibold text-slate-900">
                      {{ walletGrants.lastGrantDoctor || 'No grants issued yet' }}
                    </p>
                    <p *ngIf="walletGrants.lastGrantAt" class="text-xs text-slate-500 mt-0.5">
                      Issued on {{ walletGrants.lastGrantAt | date:'medium' }}
                    </p>
                  </div>
                </div>
              </div>

              <!-- Right: Custodial Security & Architecture -->
              <div class="card space-y-4">
                <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
                  <svg class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                  </svg>
                  Custodial Security Architecture
                </h2>

                <div class="space-y-3 text-sm">
                  <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex gap-3">
                    <div class="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                    </div>
                    <div>
                      <p class="font-semibold text-slate-900 text-xs">Zero MetaMask Requirement</p>
                      <p class="text-xs text-slate-600 mt-0.5">
                        Your private key is protected by encrypted hardware-grade vaulting. You sign in with your Health ID and 4-digit PIN while retaining full blockchain guarantees.
                      </p>
                    </div>
                  </div>

                  <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex gap-3">
                    <div class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    </div>
                    <div>
                      <p class="font-semibold text-slate-900 text-xs">Gasless Relayed Execution</p>
                      <p class="text-xs text-slate-600 mt-0.5">
                        All on-chain gas costs on Ethereum Sepolia are sponsored by the hospital network relayer. You never have to purchase or hold ETH.
                      </p>
                    </div>
                  </div>

                  <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex gap-3">
                    <div class="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    </div>
                    <div>
                      <p class="font-semibold text-slate-900 text-xs">Immediate Access Revocation</p>
                      <p class="text-xs text-slate-600 mt-0.5">
                        You maintain full custody over who views your medical data. You can grant or revoke doctor permissions instantly from the Permissions tab.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

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
                    <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Wallet address</p>
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

          <!-- REFERRAL SECURITY (blockchain-secured cross-hospital flow) -->
          <div *ngIf="tab === 'referral-security'" class="space-y-6 animate-fade-in">
            <div>
              <h1 class="text-2xl font-bold text-slate-900 mb-2">Referral Security</h1>
              <p class="text-slate-600 leading-relaxed">
                When you are referred from one hospital to another, the blockchain
                secures your data every step of the way — so no one can change your
                records in between. Each record's hash is anchored on Sepolia by the
                sending hospital, the referral acceptance is immutably timestamped,
                and every view by the receiving hospital is logged forever.
              </p>
            </div>

            <!-- How it works -->
            <div class="card">
              <h2 class="text-lg font-bold text-slate-900 mb-4">How the blockchain protects your data during a referral</h2>
              <div class="space-y-4">
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-sm font-semibold text-slate-900 mb-1">1. Hospital A anchors your record hashes on Sepolia</p>
                  <p class="text-sm text-slate-600">
                    Before you leave, Hospital A writes the SHA-256 hash of each of
                    your records to the blockchain. The actual clinical data stays at
                    Hospital A — only the hash and a verification pointer go on-chain.
                    Once written, no one (not even Hospital A) can change that hash.
                  </p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-sm font-semibold text-slate-900 mb-1">2. You are referred to Hospital B</p>
                  <p class="text-sm text-slate-600">
                    When Hospital B accepts your referral, the acceptance is logged
                    on-chain with the exact block timestamp, the clinician who accepted,
                    and both hospitals' IDs. This is immutable proof of the transfer of
                    care — it cannot be rewritten later.
                  </p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-sm font-semibold text-slate-900 mb-1">3. Hospital B verifies your records by hash</p>
                  <p class="text-sm text-slate-600">
                    Hospital B does not trust Hospital A's word — it verifies each
                    record by recomputing the hash of the off-chain data and comparing
                    it to the on-chain anchor. If anyone had changed even one byte of
                    your data in between, the hash would not match and the tampering
                    would be detected.
                  </p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-sm font-semibold text-slate-900 mb-1">4. Every view by Hospital B is logged on-chain</p>
                  <p class="text-sm text-slate-600">
                    When a doctor at Hospital B views your records, a
                    <code>RecordViewed</code> event is written on-chain with the viewer,
                    the facility, and the timestamp. This creates a permanent,
                    transparent audit trail of who accessed your data and when — across
                    hospitals.
                  </p>
                </div>
              </div>
            </div>

            <!-- Your referral story -->
            <div *ngIf="referralSecurity && referralSecurity.referrals.length" class="space-y-6">
              <h2 class="text-lg font-bold text-slate-900">Your referral story on-chain</h2>

              <div *ngFor="let r of referralSecurity.referrals" class="card">
                <!-- Referral header -->
                <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="text-sm text-muted mb-1">Referral</p>
                    <h3 class="text-xl font-bold text-slate-900">
                      {{ r.from_hospital }} → {{ r.to_hospital }}
                      <span class="text-sm font-normal text-muted">({{ r.patient_name }})</span>
                    </h3>
                    <p class="text-sm text-slate-600 mt-1">
                      {{ r.reason || 'No reason recorded' }}
                    </p>
                    <div class="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted">
                      <span>Sent {{ r.created_at | date:'medium' }}</span>
                      <span *ngIf="r.responded_at">· Responded {{ r.responded_at | date:'medium' }}</span>
                      <span>· {{ r.status }}</span>
                      <span *ngIf="r.responded_by">· by {{ r.responded_by }}</span>
                    </div>
                  </div>
                  <span class="rounded-full px-3 py-1 text-xs font-bold"
                        [class.bg-accent-500]="r.status === 'ACCEPTED'" [class.text-white]="r.status === 'ACCEPTED'"
                        [class.bg-red-500]="r.status === 'DECLINED'" [class.text-white]="r.status === 'DECLINED'"
                        [class.bg-primary-300]="r.status === 'PENDING'" [class.text-ink]="r.status === 'PENDING'">
                    {{ r.status }}
                  </span>
                </div>

                <!-- On-chain referral acceptance proof -->
                <div class="mb-5 p-4 bg-indigo-50 rounded-xl border border-indigo-200">
                  <p class="text-xs font-semibold text-indigo-800 uppercase tracking-wide mb-2">
                    Transfer of care — on-chain proof
                  </p>
                  <div *ngIf="r.on_chain_referral_accepted" class="space-y-2">
                    <p class="text-sm text-indigo-900">
                      This referral was accepted and immutably recorded on Sepolia.
                      No one can change this later.
                    </p>
                    <div class="flex flex-wrap items-center gap-2 text-xs">
                      <span class="font-semibold text-indigo-900">Transaction:</span>
                      <code class="rounded bg-white/60 px-1.5 py-0.5 font-mono text-indigo-900">
                        {{ r.on_chain_referral_tx_hash | slice:0:24 }}…
                      </code>
                      <a *ngIf="r.on_chain_referral_tx_hash && !r.on_chain_referral_tx_hash.toLowerCase().startsWith('pending')"
                         [href]="'https://sepolia.etherscan.io/tx/' + r.on_chain_referral_tx_hash"
                         target="_blank" rel="noopener"
                         class="text-indigo-700 hover:underline">
                        View on Etherscan
                      </a>
                    </div>
                  </div>
                  <p *ngIf="!r.on_chain_referral_accepted && r.tx_hash && r.tx_hash.toLowerCase().startsWith('pending')"
                     class="text-sm text-amber-800">
                    The on-chain referral acceptance is pending confirmation on Sepolia.
                  </p>
                  <p *ngIf="!r.on_chain_referral_accepted && (!r.tx_hash || !r.tx_hash.toLowerCase().startsWith('pending'))"
                     class="text-sm text-slate-600">
                    This referral was accepted in the system but has not yet been anchored
                    on-chain (or the chain is unreachable in this demo).
                  </p>
                </div>

                <!-- Records anchored by the sending hospital -->
                <div *ngIf="r.from_hospital_records.length" class="mb-5">
                  <div class="flex items-center gap-2 mb-3">
                    <p class="text-sm font-semibold text-slate-900">
                      Records anchored by {{ r.from_hospital }}
                      <span class="text-xs font-normal text-muted">(before your referral)</span>
                    </p>
                  </div>
                  <p class="text-xs text-slate-500 mb-3">
                    These are the SHA-256 hashes Hospital A wrote to Sepolia. Hospital B
                    will verify each record by recomputing the hash — if the data was
                    changed in between, the hash would not match.
                  </p>
                  <div class="space-y-2">
                    <div *ngFor="let rec of r.from_hospital_records" class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div>
                          <span class="text-xs text-muted uppercase tracking-wide">Type</span>
                          <p class="text-sm font-semibold text-slate-900">{{ rec.record_type || '—' }}</p>
                        </div>
                        <div class="text-right">
                          <span class="text-xs text-muted uppercase tracking-wide">Anchored</span>
                          <p class="text-xs text-slate-900">
                            {{ rec.on_chain_timestamp ? (rec.on_chain_timestamp * 1000 | date:'medium') : (rec.created_at | date:'medium') }}
                          </p>
                        </div>
                      </div>
                      <div class="p-2 bg-white rounded-lg border border-slate-200 font-mono text-xs break-all">
                        <span class="text-slate-500">hash:</span>
                        <span class="text-slate-900">{{ rec.record_hash | slice:0:32 }}…</span>
                      </div>
                      <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span class="font-semibold" [class.text-accent-700]="rec.verified"
                              [class.text-muted]="!rec.verified">
                          {{ rec.verified ? 'On-chain verified ✓' : 'Pending' }}
                        </span>
                        <span *ngIf="rec.metadata_uri" class="text-muted">
                          ·
                          <a [href]="rec.metadata_uri" target="_blank" rel="noopener" class="text-accent-700 hover:underline break-all">
                            verify ↗
                          </a>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Views by the receiving hospital (immutable audit) -->
                <div *ngIf="r.receiving_hospital_views.length" class="mb-5">
                  <div class="flex items-center gap-2 mb-3">
                    <p class="text-sm font-semibold text-slate-900">
                      Views by {{ r.to_hospital }} (on-chain audit)
                    </p>
                  </div>
                  <p class="text-xs text-slate-500 mb-3">
                    Every time a clinician at {{ r.to_hospital }} viewed your records,
                    it was logged on-chain. This is permanent — it cannot be deleted or
                    changed.
                  </p>
                  <div class="space-y-2">
                    <div *ngFor="let v of r.receiving_hospital_views" class="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div>
                          <span class="text-muted uppercase tracking-wide">Accessor</span>
                          <p class="text-sm font-semibold text-slate-900">
                            {{ v.accessor | slice:0:16 }}…
                          </p>
                        </div>
                        <div class="text-right">
                          <span class="text-muted uppercase tracking-wide">Viewed at</span>
                          <p class="text-sm text-slate-900">
                            {{ v.timestamp * 1000 | date:'medium' }}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Verification summary -->
                <div class="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                  <p class="text-sm font-semibold text-emerald-900 mb-1">
                    Why this means your data was not tampered with
                  </p>
                  <p class="text-sm text-emerald-800">
                    The hash Hospital A wrote on-chain is a cryptographic fingerprint
                    of your exact records. Hospital B verifies each record by recomputing
                    the hash of the data it receives and comparing it to the on-chain
                    anchor. If anyone — including Hospital A, Hospital B, or a third
                    party — had changed even a single byte of your clinical data in
                    between the referral, the hash would not match and the tampering
                    would be immediately detected. The on-chain referral-acceptance
                    timestamp and the view events give you a permanent, immutable record
                    of exactly when your care was transferred and who accessed your
                    records.
                  </p>
                </div>
              </div>
            </div>

            <div *ngIf="referralSecurity && !referralSecurity.referrals.length" class="card">
              <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">No referrals yet</h3>
              <p class="text-slate-600">
                When you are referred from one hospital to another, this page will show
                the blockchain-secured proof of your transfer of care — the records
                anchored by the sending hospital, the on-chain referral acceptance, and
                every view by the receiving hospital.
              </p>
            </div>
          </div>

          <!-- HOW IT WORKS -->
          <div *ngIf="tab === 'how-it-works'" class="space-y-6 animate-fade-in">
            <div class="card p-6">
              <h1 class="text-2xl font-bold text-slate-900 mb-2">How it works</h1>
              <p class="text-slate-600">
                You stay in control of who can access your medical records.
              </p>
            </div>

            <div class="card">
              <h2 class="text-lg font-bold text-slate-900 mb-4">For Patients</h2>
              <div class="space-y-4">
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-sm font-semibold text-slate-900 mb-1">1. Secure Registration</p>
                  <p class="text-sm text-slate-600">
                    Register at any participating hospital. You'll receive a Health ID and a secure custodial wallet.
                    Set up your 4-digit PIN — no cryptocurrency or MetaMask needed.
                  </p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-sm font-semibold text-slate-900 mb-1">2. Manage Access</p>
                  <p class="text-sm text-slate-600">
                    When doctors request access to your records, you'll get notified. Approve or deny from your dashboard.
                    Access automatically expires after 7 days, and you can revoke it anytime.
                  </p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-sm font-semibold text-slate-900 mb-1">3. Track Everything</p>
                  <p class="text-sm text-slate-600">
                    See a complete audit trail of who accessed your records, when, and why. All access events
                    are permanently logged on the blockchain for transparency.
                  </p>
                </div>
              </div>
            </div>

            <div class="card">
              <h2 class="text-lg font-bold text-slate-900 mb-4">For Doctors</h2>
              <div class="space-y-4">
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-sm font-semibold text-slate-900 mb-1">1. Verified Access</p>
                  <p class="text-sm text-slate-600">
                    Only licensed, verified doctors can request access. Each request requires patient consent
                    unless it's a documented medical emergency (break-glass).
                  </p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-sm font-semibold text-slate-900 mb-1">2. Cross-Hospital Collaboration</p>
                  <p class="text-sm text-slate-600">
                    Refer patients to other hospitals and share verified medical histories. Every referral
                    and access is tracked on-chain for accountability.
                  </p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-sm font-semibold text-slate-900 mb-1">3. Data Integrity</p>
                  <p class="text-sm text-slate-600">
                    Record hashes are stored on the blockchain. This ensures medical data hasn't been
                    tampered with when transferring between facilities.
                  </p>
                </div>
              </div>
            </div>

            <div class="card">
              <h2 class="text-lg font-bold text-slate-900 mb-4">Security & Privacy</h2>
              <div class="space-y-4">
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-sm font-semibold text-slate-900 mb-1">Blockchain Technology</p>
                  <p class="text-sm text-slate-600">
                    Built on Ethereum Sepolia testnet. Only cryptographic hashes and audit events are stored on-chain.
                    Actual medical records remain securely at the originating facilities.
                  </p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-sm font-semibold text-slate-900 mb-1">Patient-Controlled Access</p>
                  <p class="text-sm text-slate-600">
                    You decide who sees your data. No one can access your records without explicit consent
                    or a properly documented emergency break-glass event.
                  </p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-sm font-semibold text-slate-900 mb-1">Full Transparency</p>
                  <p class="text-sm text-slate-600">
                    Every access, grant, revoke, and view is permanently recorded. You can verify all
                    transactions on Etherscan for complete peace of mind.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- HEALTH SUMMARY -->
          <div *ngIf="tab === 'dashboard'" class="space-y-6 animate-fade-in">
            <div>
              <h1 class="text-2xl font-bold text-slate-900 mb-2">Dashboard</h1>
              <p class="text-slate-600">
                A quick overview of your medical history across all hospitals — your most-
                used medicines, most frequent measurements, common diagnoses, and which
                hospitals you visit most.
              </p>
            </div>

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
            <section class="rounded-2xl overflow-hidden border border-indigo-100 shadow-md">
              <!-- Gradient header -->
              <div class="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-xl">📋</span>
                  <h2 class="text-white font-bold text-base">Audit Logs &amp; Access Activity</h2>
                </div>
                <button type="button" (click)="setTab('activity')"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-indigo-700 text-xs font-bold hover:bg-indigo-50 transition-colors shadow-sm">
                  View all logs
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
              <div class="bg-white px-5 py-4">
                <p class="text-sm text-slate-600 mb-3">Every doctor who views your records, every permission grant or revocation, and every emergency break-glass event is permanently recorded here with blockchain proof.</p>

                <!-- Quick stats -->
                <div class="grid grid-cols-3 gap-3 mb-4">
                  <div class="bg-indigo-50 rounded-xl p-3 text-center">
                    <p class="text-lg font-extrabold text-indigo-700">{{ story.length }}</p>
                    <p class="text-xs text-indigo-500 mt-0.5">Total Events</p>
                  </div>
                  <div class="bg-blue-50 rounded-xl p-3 text-center">
                    <p class="text-lg font-extrabold text-blue-700">{{ accessEvents.length }}</p>
                    <p class="text-xs text-blue-500 mt-0.5">Doctor Views</p>
                  </div>
                  <div class="bg-red-50 rounded-xl p-3 text-center">
                    <p class="text-lg font-extrabold text-red-600">{{ breakGlassCount }}</p>
                    <p class="text-xs text-red-400 mt-0.5">Break-Glass</p>
                  </div>
                </div>

                <!-- Recent events preview -->
                <p *ngIf="storyLoading && story.length === 0" class="text-sm text-slate-500" role="status">Loading events…</p>
                <div *ngIf="!storyError && story.length > 0" class="divide-y divide-slate-100">
                  <div *ngFor="let event of story | slice:0:4" class="flex items-start gap-3 py-2.5 first:pt-0">
                    <div class="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 mt-0.5" [class]="storyDot(event)">{{ event.icon }}</div>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm text-slate-800 font-semibold truncate">{{ event.who || (event.wallet | slice:0:20) }}</p>
                      <p class="text-xs text-slate-500 truncate">{{ event.verb }}</p>
                      <p class="text-xs text-slate-400">{{ event.timestamp * 1000 | date:'medium' }}</p>
                    </div>
                    <a *ngIf="event.etherscan_url" [href]="event.etherscan_url" target="_blank" rel="noopener"
                       class="flex-shrink-0 text-xs text-indigo-600 hover:underline font-semibold">⛓ Proof</a>
                  </div>
                </div>
                <p *ngIf="!storyLoading && !storyError && story.length === 0" class="text-sm text-slate-500">
                  No events yet. They appear when a doctor accesses your records.
                </p>
                <div *ngIf="storyError" class="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  {{ storyError }} — <button type="button" (click)="loadStory()" class="underline font-semibold">Retry</button>
                </div>

                <button type="button" (click)="setTab('activity')"
                        class="mt-4 w-full py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors">
                  Open Audit Logs &amp; Activity →
                </button>
              </div>
            </section>

            <div *ngIf="healthSummary" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <app-record-chart
                title="Recorded conditions and record types"
                description="Frequency of entries in your medical history."
                [data]="diagnosisChartData"
                emptyMessage="No diagnosis or record-type entries are available." />
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
            <div class="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white shadow-xl">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-2xl">📋</span>
                    <h1 class="text-2xl font-extrabold tracking-tight">Audit Logs &amp; Access Activity</h1>
                  </div>
                  <p class="text-indigo-100 leading-relaxed max-w-xl">
                    Every doctor view, permission grant or revocation, clinical measurement, and emergency break-glass event is permanently recorded here — with immutable blockchain proof on the Sepolia network.
                  </p>
                  <p class="text-indigo-200 text-sm mt-2">{{ story.length }} event(s) logged &nbsp;&bull;&nbsp; Newest first</p>
                </div>
                <button (click)="loadStory()" [disabled]="storyLoading"
                        class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-semibold transition-colors disabled:opacity-50 border border-white/30">
                  <svg class="w-4 h-4" [class.animate-spin]="storyLoading" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  Refresh
                </button>
              </div>

              <!-- STAT PILLS -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                <div class="bg-white/15 rounded-xl p-3 text-center">
                  <p class="text-xl font-extrabold">{{ story.length }}</p>
                  <p class="text-xs text-indigo-200 mt-0.5">Total Events</p>
                </div>
                <div class="bg-white/15 rounded-xl p-3 text-center">
                  <p class="text-xl font-extrabold">{{ recordViewedCount }}</p>
                  <p class="text-xs text-indigo-200 mt-0.5">Doctor Views</p>
                </div>
                <div class="bg-white/15 rounded-xl p-3 text-center">
                  <p class="text-xl font-extrabold">{{ breakGlassCount }}</p>
                  <p class="text-xs text-indigo-200 mt-0.5">Break-Glass</p>
                </div>
                <div class="bg-white/15 rounded-xl p-3 text-center">
                  <p class="text-xl font-extrabold">{{ onChainCount }}</p>
                  <p class="text-xs text-indigo-200 mt-0.5">On-Chain Proofs</p>
                </div>
              </div>
            </div>

            <!-- BLOCKCHAIN INFO BANNER -->
            <div class="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-start gap-3">
              <svg class="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              <div class="text-sm">
                <p class="font-semibold text-indigo-800">How Blockchain Applies Here</p>
                <p class="text-indigo-700 mt-1">Doctors cannot read your data without your explicit approval or an emergency break-glass declaration. Every access is hashed and anchored on the <span class="font-semibold">Sepolia</span> testnet — making tampering cryptographically detectable. Click <em>Verify on Etherscan</em> on any event to inspect the raw transaction.</p>
              </div>
            </div>

            <!-- FILTER PILLS -->
            <div class="flex flex-wrap gap-2">
              <button *ngFor="let f of [
                {id:'all', label:'All Logs', icon:'🗂'},
                {id:'views', label:'Doctor Views', icon:'👁'},
                {id:'permissions', label:'Permissions & Grants', icon:'🔐'},
                {id:'measurements', label:'Clinical Measurements', icon:'📊'},
                {id:'emergency', label:'Emergency Break-Glass', icon:'🚨'}
              ]"
                (click)="storyFilter = f.id"
                class="px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 border"
                [ngClass]="storyFilter === f.id
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'">
                {{ f.icon }} {{ f.label }}
                <span *ngIf="f.id !== 'all'" class="ml-1 text-xs opacity-75">({{ auditCategoryCount(f.id) }})</span>
              </button>
            </div>

            <!-- LOADING SKELETON -->
            <div *ngIf="storyLoading && story.length === 0" class="space-y-4">
              <div *ngFor="let _ of [1,2,3]" class="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
                <div class="flex gap-4">
                  <div class="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0"></div>
                  <div class="flex-1 space-y-2">
                    <div class="h-4 bg-slate-200 rounded w-3/4"></div>
                    <div class="h-3 bg-slate-100 rounded w-1/2"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- DB-ONLY MODE NOTICE -->
            <div *ngIf="storySource === 'db' && story.length > 0"
                 class="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
              <svg class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <div>
                <p class="text-sm font-semibold text-amber-800">Showing database records (blockchain temporarily unreachable)</p>
                <p class="text-xs text-amber-700 mt-0.5">Events with verified on-chain tx hashes still show Etherscan links. Full on-chain history will appear when the node reconnects.</p>
              </div>
            </div>

            <!-- PERSISTENT ERROR -->
            <div *ngIf="storyError && story.length === 0"
                 class="flex flex-col items-center gap-3 p-8 bg-red-50 border border-red-100 rounded-2xl text-center">
              <svg class="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              <p class="text-sm font-semibold text-red-700">{{ storyError }}</p>
              <button type="button" (click)="loadStory()" class="text-sm font-bold text-red-600 underline hover:text-red-800">Try again</button>
            </div>

            <!-- TIMELINE -->
            <div *ngIf="auditFilteredStory.length > 0" class="relative">
              <div class="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-indigo-200 via-slate-200 to-transparent"></div>
              <div *ngFor="let s of auditFilteredStory" class="relative flex gap-4 mb-5">
                <!-- DOT -->
                <div class="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg shadow-md" [class]="storyDot(s)">
                  {{ s.icon }}
                </div>
                <!-- CARD -->
                <div class="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-all duration-200">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="flex-1 min-w-0">
                      <!-- Event type badge -->
                      <div class="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                              [ngClass]="{
                                'bg-red-50 text-red-700 border-red-200': s.event === 'BreakGlassUsed' || s.event === 'EmergencyAccessGranted',
                                'bg-emerald-50 text-emerald-700 border-emerald-200': s.event === 'AccessGranted',
                                'bg-orange-50 text-orange-700 border-orange-200': s.event === 'AccessRevoked',
                                'bg-blue-50 text-blue-700 border-blue-200': s.event === 'RecordViewed',
                                'bg-violet-50 text-violet-700 border-violet-200': s.event === 'MeasurementRecorded',
                                'bg-indigo-50 text-indigo-700 border-indigo-200': s.event === 'ReferralAccepted',
                                'bg-slate-50 text-slate-600 border-slate-200': !['BreakGlassUsed','EmergencyAccessGranted','AccessGranted','AccessRevoked','RecordViewed','MeasurementRecorded','ReferralAccepted'].includes(s.event)
                              }">{{ s.event }}</span>
                        <span *ngIf="s.role" class="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{{ s.role }}</span>
                        <span *ngIf="s['source'] === 'db'" class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">DB-backed</span>
                      </div>
                      <p class="text-slate-900 leading-relaxed">
                        <span class="font-bold">{{ s.who || (s.wallet | slice:0:18) }}</span>
                        <span> {{ s.verb }}</span>
                      </p>
                      <div class="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-500">
                        <span>{{ s.timestamp * 1000 | date:'medium' }}</span>
                        <span *ngIf="s.facility">&bull; {{ s.facility }}</span>
                      </div>
                      <!-- TX hash preview -->
                      <p *ngIf="s.transaction_hash" class="mt-2 font-mono text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded-lg break-all">
                        Tx: {{ s.transaction_hash }}
                      </p>
                    </div>
                    <!-- ACTION BUTTON -->
                    <div class="flex flex-col gap-1.5">
                      <a *ngIf="s.etherscan_url" [href]="s.etherscan_url" target="_blank" rel="noopener"
                         class="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        Verify on Etherscan
                      </a>
                      <span *ngIf="!s.etherscan_url"
                            class="flex-shrink-0 text-xs text-slate-400 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 text-center">
                        Pending on-chain
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- EMPTY AFTER FILTER -->
            <div *ngIf="!storyLoading && !storyError && story.length > 0 && auditFilteredStory.length === 0"
                 class="flex flex-col items-center justify-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
              <div class="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-2xl mb-3">🔍</div>
              <p class="text-slate-600 font-semibold">No events in this category</p>
              <button (click)="storyFilter = 'all'" class="mt-2 text-sm text-indigo-600 hover:underline">Clear filter</button>
            </div>

            <!-- EMPTY STATE (no events at all) -->
            <div *ngIf="!storyLoading && !storyError && story.length === 0"
                 class="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
              <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">🔐</div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">No Activity Yet</h3>
              <p class="text-slate-500 text-sm text-center max-w-xs">Audit events will appear here the first time a doctor requests or is granted access to your records.</p>
            </div>

            <!-- ═══════════════════════════════════════════════════════════ -->
            <!-- DATA INTEGRITY VERIFICATION PANEL                          -->
            <!-- ═══════════════════════════════════════════════════════════ -->
            <div class="mt-4">
              <!-- SECTION HEADER -->
              <div class="flex items-center justify-between mb-4">
                <div>
                  <h2 class="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    <span class="text-xl">🔬</span> Data Integrity Verification
                  </h2>
                  <p class="text-sm text-slate-500 mt-0.5">Prove your medical data has never been silently altered</p>
                </div>
                <button (click)="runIntegrityCheck()" [disabled]="integrityLoading"
                        class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-60 shadow-md">
                  <svg class="w-4 h-4" [class.animate-spin]="integrityLoading" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                  {{ integrityLoading ? 'Checking…' : 'Run Integrity Check' }}
                </button>
              </div>

              <!-- HOW IT WORKS EXPLAINER (always visible) -->
              <div class="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-5">
                <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2 mb-3">
                  <svg class="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  How tamper detection works
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600">
                  <div class="flex gap-2.5">
                    <div class="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center flex-shrink-0 text-xs">1</div>
                    <div>
                      <p class="font-semibold text-slate-700">Payload Re-hash</p>
                      <p class="mt-0.5">Re-computes <code class="bg-white px-1 rounded border border-slate-200 text-indigo-600">SHA-256</code> of the current database record. If the data was silently edited, this hash will differ from the original.</p>
                    </div>
                  </div>
                  <div class="flex gap-2.5">
                    <div class="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center flex-shrink-0 text-xs">2</div>
                    <div>
                      <p class="font-semibold text-slate-700">DB Hash Comparison</p>
                      <p class="mt-0.5">Compares re-computed hash against the <code class="bg-white px-1 rounded border border-slate-200 text-indigo-600">record_hash</code> field stored in the database at the time of anchoring.</p>
                    </div>
                  </div>
                  <div class="flex gap-2.5">
                    <div class="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center flex-shrink-0 text-xs">3</div>
                    <div>
                      <p class="font-semibold text-slate-700">On-chain Cross-check</p>
                      <p class="mt-0.5">Queries the <code class="bg-white px-1 rounded border border-slate-200 text-indigo-600">getRecords()</code> function on Sepolia to confirm the stored hash also exists in the immutable blockchain registry.</p>
                    </div>
                  </div>
                </div>
                <div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div *ngFor="let badge of [
                    {status:'VERIFIED', icon:'✅', label:'Verified', desc:'Payload + chain match'},
                    {status:'TAMPERED_PAYLOAD', icon:'🔴', label:'Tampered', desc:'DB data was altered'},
                    {status:'CHAIN_MISMATCH', icon:'⚠️', label:'Chain Mismatch', desc:'Hash not found on-chain'},
                    {status:'UNANCHORED', icon:'⏳', label:'Unanchored', desc:'Not yet on-chain'}
                  ]" class="flex items-start gap-1.5 p-2 bg-white rounded-xl border border-slate-200">
                    <span class="text-base flex-shrink-0">{{ badge.icon }}</span>
                    <div>
                      <p class="text-[11px] font-bold text-slate-700">{{ badge.label }}</p>
                      <p class="text-[10px] text-slate-500">{{ badge.desc }}</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- LOADING STATE -->
              <div *ngIf="integrityLoading" class="flex flex-col items-center py-12 gap-3">
                <div class="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <p class="text-sm text-slate-600 font-medium">Re-hashing records and cross-checking blockchain…</p>
                <p class="text-xs text-slate-400">This may take a few seconds while we query the Sepolia network.</p>
              </div>

              <!-- ERROR -->
              <div *ngIf="integrityError && !integrityLoading" class="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 flex items-center gap-3">
                <svg class="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"/></svg>
                {{ integrityError }}
              </div>

              <!-- RESULTS -->
              <div *ngIf="integrityReport && !integrityLoading">

                <!-- TAMPER ALERT BANNER -->
                <div *ngIf="!integrityReport.integrity_ok"
                     class="mb-5 p-5 bg-red-600 text-white rounded-2xl shadow-xl flex items-start gap-4 animate-pulse">
                  <div class="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-2xl flex-shrink-0">🚨</div>
                  <div>
                    <h3 class="font-extrabold text-lg mb-1">DATA INTEGRITY VIOLATION DETECTED</h3>
                    <p class="text-red-100 text-sm leading-relaxed">
                      <strong>{{ integrityReport.summary.tampered }} record(s)</strong> no longer match their original blockchain hash.
                      This means someone modified the clinical data in the database AFTER it was anchored on Sepolia.
                      The records flagged in red below are the affected items.
                    </p>
                    <p class="text-red-200 text-xs mt-2">Checked at: {{ integrityReport.checked_at | date:'medium' }}</p>
                  </div>
                </div>

                <!-- ALL CLEAR BANNER -->
                <div *ngIf="integrityReport.integrity_ok"
                     class="mb-5 p-5 bg-emerald-600 text-white rounded-2xl shadow-md flex items-start gap-4">
                  <div class="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-2xl flex-shrink-0">✅</div>
                  <div>
                    <h3 class="font-extrabold text-lg mb-1">All Records Verified — No Tampering Detected</h3>
                    <p class="text-emerald-100 text-sm">
                      <strong>{{ integrityReport.summary.verified }}</strong> of {{ integrityReport.summary.total }} items confirmed intact.
                      Every clinical record and measurement matches its original SHA-256 hash anchored on Sepolia.
                    </p>
                    <p class="text-emerald-200 text-xs mt-2">Checked at: {{ integrityReport.checked_at | date:'medium' }}</p>
                  </div>
                </div>

                <!-- SUMMARY STAT CARDS -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  <div class="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
                    <p class="text-2xl font-extrabold text-slate-800">{{ integrityReport.summary.total }}</p>
                    <p class="text-xs text-slate-500 mt-1">Total Checked</p>
                  </div>
                  <div class="bg-emerald-50 rounded-2xl border border-emerald-200 p-4 text-center shadow-sm">
                    <p class="text-2xl font-extrabold text-emerald-700">{{ integrityReport.summary.verified }}</p>
                    <p class="text-xs text-emerald-600 mt-1">✅ Verified</p>
                  </div>
                  <div [ngClass]="integrityReport.summary.tampered > 0 ? 'bg-red-50 border-red-300 animate-pulse' : 'bg-slate-50 border-slate-200'"
                       class="rounded-2xl border p-4 text-center shadow-sm">
                    <p class="text-2xl font-extrabold" [ngClass]="integrityReport.summary.tampered > 0 ? 'text-red-700' : 'text-slate-400'">
                      {{ integrityReport.summary.tampered }}
                    </p>
                    <p class="text-xs mt-1" [ngClass]="integrityReport.summary.tampered > 0 ? 'text-red-600' : 'text-slate-400'">🔴 Tampered</p>
                  </div>
                  <div class="bg-amber-50 rounded-2xl border border-amber-200 p-4 text-center shadow-sm">
                    <p class="text-2xl font-extrabold text-amber-700">{{ integrityReport.summary.unanchored }}</p>
                    <p class="text-xs text-amber-600 mt-1">⏳ Unanchored</p>
                  </div>
                </div>

                <!-- CHAIN UNAVAILABLE NOTICE -->
                <div *ngIf="!integrityReport.chain_available" class="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-sm">
                  <svg class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <p class="text-amber-800">Blockchain node unreachable. Only DB-level payload checks were performed. On-chain cross-verification skipped.</p>
                </div>

                <!-- PER-ITEM LIST (Records + Measurements combined) -->
                <h3 class="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Per-record Detail</h3>
                <div class="space-y-3">
                  <div *ngFor="let item of integrityReport.records.concat(integrityReport.measurements)"
                       class="bg-white rounded-2xl border p-4 shadow-sm"
                       [ngClass]="item.severity === 'critical' ? 'border-red-300 bg-red-50' : item.severity === 'warning' ? 'border-amber-200' : 'border-slate-200'">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="flex-1 min-w-0">
                        <!-- Header row -->
                        <div class="flex items-center gap-2 mb-1.5">
                          <span class="text-base">{{ integrityBadgeIcon(item.status) }}</span>
                          <span class="font-bold text-slate-900 text-sm">
                            {{ item.type === 'record' ? (item.record_type || 'Medical Record') : (item.kind + ' ' + item.value + (item.unit || '')) }}
                          </span>
                          <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border"
                                [ngClass]="integrityBadgeClass(item.status)">
                            {{ item.status.replace('_', ' ') }}
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

                        <!-- Hash comparison (only show mismatch or on critical) -->
                        <div *ngIf="item.severity === 'critical' || item.status !== 'VERIFIED'" class="mt-3 space-y-1.5">
                          <div class="flex items-start gap-2">
                            <span class="text-[10px] font-bold text-slate-500 w-24 flex-shrink-0 mt-0.5">STORED HASH</span>
                            <code class="text-[10px] font-mono bg-slate-100 px-2 py-1 rounded break-all text-slate-600 flex-1">{{ item.stored_hash || '—' }}</code>
                          </div>
                          <div class="flex items-start gap-2">
                            <span class="text-[10px] font-bold flex-shrink-0 w-24 mt-0.5"
                                  [ngClass]="item.payload_hash_matches ? 'text-emerald-600' : 'text-red-600'">
                              {{ item.payload_hash_matches ? 'RE-HASH ✓' : 'RE-HASH ✗' }}
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
                           class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                          Verify on Etherscan
                        </a>
                        <span class="text-[10px] text-slate-400 text-center">
                          {{ item.chain_checked ? '⛓ Chain checked' : '⚡ DB only' }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

              </div><!-- /integrityReport -->

            </div><!-- /integrity panel -->

          </div><!-- /tab === activity -->

        </main>
      </div>
    </div>

    <!-- FOOTER -->
    <footer class="border-t border-gray-200 mt-12 bg-white">
      <div class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
        <p class="m-0 text-center">UDOM · PoC by Atanasi Patrick Kafuka · Sepolia testnet</p>
        <div class="flex gap-5">
          <span class="text-muted">&copy; 2024</span>
        </div>
      </div>
    </footer>

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
          <p class="text-center text-xs text-slate-500 mt-2">Grants 7 days of on-chain access</p>
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
              Every acceptance is anchored on-chain for immutable proof.
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
    { id: 'wallet', label: 'Custodial Wallet' },
    { id: 'profile', label: 'Profile' },
    { id: 'referral-security', label: 'Referral Security' },
    { id: 'how-it-works', label: 'How it works' },
  ] as const;

  data: PatientData | null = null;
  requests: AccessRequest[] = [];
  story: ActivityStoryItem[] = [];
  storyLoading = false;
  storyError = '';
  storySource: 'chain' | 'db' | '' = '';
  loading = false;
  busy = false;
  errorMsg = '';
  historyFilter: 'all' | 'records' | 'measurements' | 'hospitals' = 'all';
  /** Filter pills for Audit Logs & Activity tab */
  storyFilter: 'all' | 'views' | 'permissions' | 'measurements' | 'emergency' = 'all';

  /** Integrity verification state */
  integrityReport: IntegrityReport | null = null;
  integrityLoading = false;
  integrityError = '';

  /** Most recent on-chain action performed by this patient (grant/approve),
   * surfaced as a banner with a direct Etherscan link. */
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

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  /** Angular 22 is zoneless by default — re-render after async mutations. */
  private syncView() {
    this.cdr.detectChanges();
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
        firstVisit: this.data.records[0]?.date || (this.data['created_at'] || ''),
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
        tx_hash: ref['tx_hash'],
        verified: !!ref['tx_hash'] && !ref['tx_hash'].startsWith('PENDING'),
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
      'The revocation is logged on-chain and they lose access immediately.'
    )) return;
    this.emergencyBusy = true;
    this.syncView();
    try {
      const res: any = await this.api.revokeEmergencyAccess({
        doctor_license: e.doctor_license,
        doctor_wallet: e.doctor_wallet,
      });
      alert(res?.message || 'Emergency access ended.');
      await this.loadGrantSummary();
    } catch (err: any) {
      alert('Error: ' + (err?.error?.error || err?.message || 'Could not end emergency access'));
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
      'The revocation will be confirmed and logged on-chain.'
    )) return;
    this.busy = true;
    this.syncView();
    try {
      const res: any = await this.api.revokeAccess({
        doctor_license: g.doctor_license,
        doctor_wallet: g.doctor_wallet,
      });
      alert(res?.message || 'Access revoked successfully.');
      await this.loadGrantSummary();
      const fresh = await this.api.myRecords();
      this.data = fresh;
    } catch (err: any) {
      alert('Error: ' + (err?.error?.error || err?.message || 'Could not revoke access'));
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

  /** Load the referral security tab: blockchain-secured referral story. */
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

  /** Sidebar icons (inline SVG, 20×20) */
  getIcon(tabId: string): string {
    const s = 'width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    switch (tabId) {
      case 'dashboard':
        return `<svg ${s}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
      case 'records':
        return `<svg ${s}><path d="M9 12h6m-6 4h6M7 8h.01M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"/></svg>`;
      case 'measurements':
        return `<svg ${s}><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-8"/></svg>`;
      case 'referrals':
        return `<svg ${s}><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4 20-7z"/></svg>`;
      case 'permissions':
        return `<svg ${s}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`;
      case 'requests':
        return `<svg ${s}><path d="M18 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586"/><path d="M14 4H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l4-4h5a2 2 0 002-2V6a2 2 0 00-2-2z"/></svg>`;
      case 'activity':
        return `<svg ${s}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>`;
      case 'wallet':
        return `<svg ${s}><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><path d="M1 10h22"/></svg>`;
      case 'profile':
        return `<svg ${s}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
      case 'referral-security':
        return `<svg ${s}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
      case 'how-it-works':
        return `<svg ${s}><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>`;
      default:
        return '';
    }
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

  /** Color + style of the timeline dot per event type. */
  storyDot(s: ActivityStoryItem): string {
    switch ((s.event || '').toLowerCase()) {
      case 'breakglassused':
      case 'accessrevoked':
        return 'bg-red-100 text-red-700 ring-4 ring-red-50';
      case 'accessgranted':
        return 'bg-emerald-100 text-emerald-700 ring-4 ring-emerald-50';
      case 'recordviewed':
        return 'bg-blue-100 text-blue-700 ring-4 ring-blue-50';
      case 'recordadded':
        return 'bg-indigo-100 text-indigo-700 ring-4 ring-indigo-50';
      case 'patientregistered':
        return 'bg-purple-100 text-purple-700 ring-4 ring-purple-50';
      default:
        return 'bg-slate-100 text-slate-700 ring-4 ring-slate-50';
    }
  }

  /** Load the unified on-chain activity story (who did what, when). */
  async loadStory() {
    if (!this.data?.health_id || this.storyLoading) return;
    this.storyLoading = true;
    this.storyError = '';
    this.syncView();
    try {
      const res = await this.api.patientActivityStory(this.data.health_id);
      this.story = res.story;
      this.storySource = (res as any).source === 'db' ? 'db' : 'chain';
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

  integrityBadgeIcon(status: IntegrityCheckResult['status']): string {
    switch (status) {
      case 'VERIFIED': return '✅';
      case 'TAMPERED_PAYLOAD': return '🔴';
      case 'CHAIN_MISMATCH': return '⚠️';
      case 'UNANCHORED': return '⏳';
      case 'CHAIN_UNAVAILABLE': return '🔌';
      default: return '❓';
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
      let changed = false;
      // Keep the dashboard access preview and full history fresh.
      if (this.tab === 'activity' || this.tab === 'dashboard') void this.loadStory();
      try {
        this.requests = await this.api.myRequests();
        this.syncNotifications();
        changed = true;
      } catch {
        // offline tick — retry on the next cycle
      }
      // Silent background refresh: never toggles the loading spinner.
      try {
        const fresh = await this.api.myRecords();
        this.data = fresh;
        this.computeHealthSummary();
        this.errorMsg = '';
        changed = true;
      } catch {
        // offline tick — the current data stays on screen
      }
      if (changed) this.syncView();
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
      const data = await this.api.myRecords();
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
      this.requests = await this.api.myRequests();
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
      alert('Pick a doctor from the list first.');
      return;
    }
    this.busy = true;
    this.syncView();
    try {
      const doctorLabel = this.selectedDoctor?.full_name || this.grant.doctor_name || this.grant.doctor_license;
      const res: any = await this.api.grantAccess(this.grant);
      this.showLastTx(`Access granted to Dr. ${doctorLabel}`, res?.tx_hash, res?.pending);
      this.grant = { doctor_license: '', doctor_name: '', doctor_wallet: '', days: 7 };
      this.selectedDoctor = null;
      this.doctorQuery = '';
      void this.reload();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
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
      this.showLastTx(`Access granted to Dr. ${req.doctor_name} for 7 days`, res?.tx_hash, res?.pending);
      void this.reload();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
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
      await this.reload();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
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

  /** Switch to profile tab within the dashboard. */
  viewProfile() {
    this.setTab('profile');
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
