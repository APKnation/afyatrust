import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { NgIf, NgFor, SlicePipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, PatientData, AccessRequest, DoctorOption, ActivityStoryItem, EmergencyAccessItem, ActiveGrantItem } from '../../../services/api.service';
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

          <!-- RECORDS -->
          <div *ngIf="tab === 'records'" class="space-y-6 animate-fade-in">
            <div>
              <h1 class="text-2xl font-bold text-slate-900 mb-2">My Medical History</h1>
              <p class="text-slate-600 leading-relaxed">
                SHA-256 hashes are stored on-chain for verifiability. Clinical data remains securely at the originating facility.
              </p>
            </div>

            <div *ngFor="let rec of data.records" class="card">
              <div class="p-6">
                <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div class="flex flex-wrap items-center gap-3">
                    <div class="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center">
                    </div>
                    <div>
                      <h3 class="font-bold text-slate-900 text-lg">{{ rec.facility }}</h3>
                      <p class="text-sm text-slate-500">{{ rec.date | date:'medium' }}</p>
                    </div>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="px-3 py-1 bg-primary-100 text-primary-700 text-xs font-semibold rounded-full">{{ rec.type }}</span>
                    <span *ngIf="rec.verified" class="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full flex items-center gap-1">
                      On-chain Verified
                    </span>
                    <span *ngIf="!rec.verified" class="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">Pending</span>
                  </div>
                </div>

                <div *ngIf="rec.source_uri" class="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <p class="text-xs text-slate-500 mb-1">Source Document</p>
                  <a [href]="rec.source_uri" target="_blank" rel="noopener" class="text-sm text-primary-600 hover:text-primary-700 hover:underline break-all inline-flex items-center gap-1">
                    {{ rec.source_uri }}
                  </a>
                </div>

                <div class="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
                  <div *ngFor="let item of entries(rec.data)" class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2.5 border-b border-slate-200 last:border-b-0">
                    <span class="sm:w-48 text-sm font-semibold text-slate-700 capitalize">{{ item.key }}</span>
                    <span class="text-sm text-slate-900 break-words">{{ item.value }}</span>
                  </div>
                </div>

                <div class="mt-4 flex flex-wrap items-center gap-3 pt-4 border-t border-slate-200">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-semibold text-slate-600">Record Hash:</span>
                    <code class="text-xs font-mono bg-slate-100 px-2 py-1 rounded-lg text-slate-700">{{ rec.hash | slice:0:36 }}…</code>
                  </div>
                  <a *ngIf="rec.tx_hash && !rec.tx_hash.startsWith('PENDING')" [href]="'https://sepolia.etherscan.io/tx/' + rec.tx_hash" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
                    Verify Tx (Etherscan)
                  </a>
                </div>
              </div>
            </div>

            <div *ngIf="data.records.length === 0" class="card">
              <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">No Records Yet</h3>
              <p class="text-slate-600">Records will appear here when a healthcare facility adds them to your profile.</p>
            </div>
          </div>

          <!-- MEASUREMENTS -->
          <div *ngIf="tab === 'measurements'" class="space-y-6 animate-fade-in">
            <div>
              <h1 class="text-2xl font-bold text-slate-900 mb-2">My Measurements</h1>
              <p class="text-slate-600">Clinical readings recorded by your healthcare providers.</p>
            </div>
            <div class="card">
              <div class="overflow-x-auto">
                <table *ngIf="data?.measurements?.length" class="w-full">
                  <thead>
                    <tr class="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                      <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                      <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Type</th>
                      <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Value</th>
                      <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Doctor</th>
                      <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Hospital</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-200">
                    <tr *ngFor="let m of data.measurements" class="hover:bg-slate-50/80 transition-colors group">
                      <td class="px-6 py-4 text-sm text-slate-900">{{ m.date | date:'short' }}</td>
                      <td class="px-6 py-4 text-sm font-semibold text-slate-900">{{ m.kind }}</td>
                      <td class="px-6 py-4 text-sm text-slate-900">{{ m.value }} <span class="text-slate-500">{{ m.unit }}</span></td>
                      <td class="px-6 py-4 text-sm text-slate-600">{{ m.doctor || '—' }}</td>
                      <td class="px-6 py-4 text-sm text-slate-600">{{ m.hospital || '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div *ngIf="!data.measurements.length" class="p-12 text-center">
                <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                </div>
                <h3 class="text-lg font-bold text-slate-900 mb-2">No Measurements Yet</h3>
                <p class="text-slate-600">Measurements will appear when recorded by your provider.</p>
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

            <section class="card p-5" aria-labelledby="access-history-heading">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="access-history-heading" class="text-lg font-bold text-slate-900">Who viewed your records</h2>
                  <p class="mt-1 text-sm text-slate-600">
                    Recent recorded views, with the person, facility, and time. You can see this here without opening a block explorer.
                  </p>
                </div>
                <button type="button" (click)="setTab('activity')" class="btn-secondary shrink-0">
                  Full access history
                </button>
              </div>

              <p *ngIf="storyLoading && story.length === 0" class="mt-4 text-sm text-slate-600" role="status">
                Loading access history…
              </p>
              <div *ngIf="storyError" class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
                <p>{{ storyError }}</p>
                <button type="button" (click)="loadStory()" class="mt-2 font-semibold underline">Try again</button>
              </div>

              <div *ngIf="!storyError && accessEvents.length" class="mt-4 divide-y divide-slate-200">
                <article *ngFor="let event of accessEvents | slice:0:5" class="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p class="font-semibold text-slate-900">{{ event.who || (event.wallet | slice:0:18) }}</p>
                    <p class="text-sm text-slate-600">
                      <span *ngIf="event.facility">Facility {{ event.facility }}</span>
                      <span *ngIf="event.role"> · {{ event.role }}</span>
                    </p>
                  </div>
                  <time class="text-sm text-slate-600">{{ event.timestamp * 1000 | date:'medium' }}</time>
                </article>
              </div>
              <p *ngIf="!storyLoading && !storyError && accessEvents.length === 0" class="mt-4 text-sm text-slate-600">
                No recorded record views are available yet. New views will appear here when they are recorded.
              </p>
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

          <!-- ACTIVITY -->
          <div *ngIf="tab === 'activity'" class="space-y-6 animate-fade-in">
            <!-- HEADER -->
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 class="text-2xl font-bold text-slate-900 mb-2">Access History</h1>
                <p class="text-slate-600 leading-relaxed">
                  Every view, permission change, and security event for your health data.
                </p>
                <p class="text-sm text-slate-500 mt-1">{{ story.length }} event(s) &nbsp;&bull;&nbsp; Newest first</p>
              </div>
              <button (click)="loadStory()" [disabled]="storyLoading"
                      class="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50">
                <svg class="w-4 h-4" [class.animate-spin]="storyLoading" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Refresh
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

            <!-- DB-ONLY MODE NOTICE (blockchain unreachable, but data still shown) -->
            <div *ngIf="storySource === 'db' && story.length > 0"
                 class="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
              <svg class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <div>
                <p class="text-sm font-semibold text-amber-800">Showing database records (blockchain temporarily unreachable)</p>
                <p class="text-xs text-amber-700 mt-0.5">Events with verified on-chain tx hashes still show Etherscan links. Full on-chain history will appear when the node reconnects.</p>
              </div>
            </div>

            <!-- PERSISTENT ERROR (no data at all) -->
            <div *ngIf="storyError && story.length === 0"
                 class="flex flex-col items-center gap-3 p-8 bg-red-50 border border-red-100 rounded-2xl text-center">
              <svg class="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              <p class="text-sm font-semibold text-red-700">{{ storyError }}</p>
              <button type="button" (click)="loadStory()" class="text-sm font-bold text-red-600 underline hover:text-red-800">Try again</button>
            </div>

            <!-- TIMELINE -->
            <div *ngIf="story.length > 0" class="relative">
              <div class="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-slate-200 via-slate-200 to-transparent"></div>
              <div *ngFor="let s of story" class="relative flex gap-4 mb-6">
                <!-- DOT -->
                <div class="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg shadow-md" [class]="storyDot(s)">
                  {{ s.icon }}
                </div>
                <!-- CARD -->
                <div class="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-all duration-200">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="flex-1 min-w-0">
                      <p class="text-slate-900 leading-relaxed">
                        <span class="font-bold">{{ s.who || (s.wallet | slice:0:18) }}</span>
                        <span> {{ s.verb }}</span>
                      </p>
                      <div class="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-500">
                        <span>{{ s.timestamp * 1000 | date:'medium' }}</span>
                        <span *ngIf="s.facility">&bull; {{ s.facility }}</span>
                        <span *ngIf="s.role" class="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-medium">{{ s.role }}</span>
                        <!-- DB source badge -->
                        <span *ngIf="s['source'] === 'db'" class="px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded border border-amber-100 font-medium">DB</span>
                      </div>
                    </div>
                    <!-- ACTION BUTTON -->
                    <a *ngIf="s.etherscan_url" [href]="s.etherscan_url" target="_blank" rel="noopener"
                       class="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-100 transition-colors">
                      <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      Verify on Etherscan
                    </a>
                    <span *ngIf="!s.etherscan_url"
                          class="flex-shrink-0 text-xs text-slate-400 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                      No tx yet
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- EMPTY STATE (no events at all after load) -->
            <div *ngIf="!storyLoading && !storyError && story.length === 0"
                 class="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
              <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">🔐</div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">No Activity Yet</h3>
              <p class="text-slate-500 text-sm text-center max-w-xs">Blockchain activity will appear here when records are accessed or permissions change.</p>
            </div>
          </div>
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
    { id: 'records', label: 'History' },
    { id: 'measurements', label: 'Measurements' },
    { id: 'referrals', label: 'Referrals' },
    { id: 'permissions', label: 'Permissions' },
    { id: 'requests', label: 'Requests' },
    { id: 'activity', label: 'Access History' },
    { id: 'wallet', label: 'Wallet' },
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

  /** Sidebar icons */
  getIcon(tabId: string): string {
    switch (tabId) {
      case 'records':
        return '';
      case 'measurements':
        return '';
      case 'referrals':
        return '';
      case 'permissions':
        return '';
      case 'requests':
        return '';
      case 'activity':
        return '';
      default:
        return '';
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
