import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { NgIf, NgFor, SlicePipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, PatientData, AccessRequest, DoctorOption, ActivityStoryItem } from '../../../services/api.service';
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
          <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 class="text-2xl font-bold text-slate-900 mb-2">Session Expired</h2>
        <p class="text-slate-600 mb-6">Please sign in again to access your records.</p>
        <button (click)="logoutAndRedirect()" class="w-full px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all shadow-md hover:shadow-lg">
          Sign In Again
        </button>
      </div>
    </div>

    <!-- LOAD FAILED -->
    <div *ngIf="errorMsg && !data" class="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40">
      <div class="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
        <div class="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 class="text-2xl font-bold text-slate-900 mb-2">Unable to Load</h2>
        <p class="text-slate-600 mb-6">{{ errorMsg }}</p>
        <button (click)="retry()" class="w-full px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all shadow-md hover:shadow-lg">
          Try Again
        </button>
      </div>
    </div>

    <!-- DASHBOARD WITH SIDEBAR -->
    <div *ngIf="data" class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30">
      <div class="flex flex-col lg:flex-row">
        <!-- SIDEBAR -->
        <aside class="w-full lg:w-72 xl:w-80 bg-white border-r border-slate-200 shadow-sm lg:min-h-screen">
          <div class="p-6">
            <div class="mb-8">
              <h2 class="text-xl font-bold text-slate-900 mb-1">{{ data.full_name }}</h2>
              <p class="text-sm text-slate-500 mb-3">Health ID: <span class="font-semibold text-slate-700">{{ data.health_id }}</span></p>
              <div class="flex items-center gap-2 p-3 bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-slate-200">
                <div class="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-xs text-slate-500">Custodial Wallet</p>
                  <code class="text-xs font-mono text-slate-700 truncate block">{{ data.wallet_address | slice:0:12 }}…</code>
                </div>
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
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-slate-500 group-hover:text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM11 8a4 4 0 11-8 0 4 4 0 018 0zM11 8a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span class="font-medium">View Profile</span>
              </button>
              <button (click)="logoutAndRedirect()"
                      class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 hover:bg-red-50 hover:text-red-600 transition-all duration-200 group">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-slate-500 group-hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
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
                  <svg *ngIf="!lastTx.pending" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <svg *ngIf="lastTx.pending" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
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
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View on Etherscan
                </a>
                <button (click)="lastTx = null" class="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

      <!-- LAST ON-CHAIN ACTION (Etherscan-verifiable) -->
      <div *ngIf="lastTx" class="card mb-6 border-l-4 p-5"
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
                    class="cursor-pointer border-none bg-transparent text-lg leading-none text-muted hover:text-ink">×</button>
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

            <div *ngFor="let rec of data.records" class="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden hover:shadow-xl transition-shadow">
              <div class="p-6">
                <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div class="flex flex-wrap items-center gap-3">
                    <div class="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 class="font-bold text-slate-900 text-lg">{{ rec.facility }}</h3>
                      <p class="text-sm text-slate-500">{{ rec.date | date:'medium' }}</p>
                    </div>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="px-3 py-1 bg-primary-100 text-primary-700 text-xs font-semibold rounded-full">{{ rec.type }}</span>
                    <span *ngIf="rec.verified" class="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      On-chain Verified
                    </span>
                    <span *ngIf="!rec.verified" class="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">Pending</span>
                  </div>
                </div>

                <div *ngIf="rec.source_uri" class="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <p class="text-xs text-slate-500 mb-1">Source Document</p>
                  <a [href]="rec.source_uri" target="_blank" rel="noopener" class="text-sm text-primary-600 hover:text-primary-700 hover:underline break-all inline-flex items-center gap-1">
                    {{ rec.source_uri }}
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
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
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Verify Tx (Etherscan)
                  </a>
                </div>
              </div>
            </div>

            <div *ngIf="data.records.length === 0" class="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
              <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
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
            <div class="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
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
                    <tr *ngFor="let m of data.measurements" class="hover:bg-slate-50 transition-colors">
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
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                </div>
                <h3 class="text-lg font-bold text-slate-900 mb-2">No Measurements Yet</h3>
                <p class="text-slate-600">Measurements will appear when recorded by your provider.</p>
              </div>
            </div>
          </div>

          <!-- REFERRALS -->
          <div *ngIf="tab === 'referrals'" class="space-y-6 animate-fade-in">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 class="text-2xl font-bold text-slate-900 mb-2">My Referrals</h1>
                <p class="text-slate-600">Hospital referrals and their current status.</p>
              </div>
              <button (click)="referralModal = true" class="px-5 py-2.5 bg-white border-2 border-primary-500 text-primary-600 font-semibold rounded-xl hover:bg-primary-50 transition-colors flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                Request Referral
              </button>
            </div>
            <div *ngFor="let r of data.referrals" class="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <div class="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 class="font-bold text-slate-900 text-lg">{{ r.to_hospital }}</h3>
                  <p class="text-sm text-slate-600 mt-1">{{ r.reason || 'No reason recorded' }} • {{ r.date | date:'medium' }}</p>
                  <p *ngIf="r.responded_by" class="text-xs text-slate-500 mt-2">Responded by {{ r.responded_by }}{{ r.responded_at ? (' • ' + (r.responded_at | date:'short')) : '' }}</p>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-semibold" [class]="r.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-700' : r.status === 'DECLINED' ? 'bg-red-100 text-red-700' : r.status === 'CANCELLED' ? 'bg-slate-100 text-slate-700' : 'bg-blue-100 text-blue-700'">{{ r.status }}</span>
              </div>
            </div>
            <div *ngIf="data.referrals.length === 0" class="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
              <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">No Referrals Yet</h3>
              <p class="text-slate-600">Referrals will appear here once initiated.</p>
            </div>
          </div>

          <!-- PERMISSIONS -->
          <div *ngIf="tab === 'permissions'" class="space-y-6 animate-fade-in">
            <div>
              <h1 class="text-2xl font-bold text-slate-900 mb-2">Grant Access to a Doctor</h1>
              <p class="text-slate-600">Search for a doctor by name or license number, then grant time-limited on-chain access.</p>
            </div>

            <div class="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
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
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
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
              <button (click)="grantAccess()" [disabled]="busy" class="mt-6 w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                {{ busy ? 'Granting Access...' : 'Grant Access' }}
              </button>
            </div>
            <div class="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
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
            <div *ngFor="let req of requests" class="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
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
                  <button (click)="approve(req)" class="px-5 py-2.5 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-600 transition-colors shadow-sm">Approve</button>
                  <button (click)="reject(req)" class="px-5 py-2.5 bg-white border-2 border-red-500 text-red-600 font-semibold rounded-xl hover:bg-red-50 transition-colors">Reject</button>
                </div>
              </div>
            </div>
            <div *ngIf="requests.length === 0" class="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
              <div class="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">No Pending Requests</h3>
              <p class="text-slate-600">You're all caught up!</p>
            </div>
          </div>
          <!-- WALLET -->
          <div *ngIf="tab === 'wallet' && walletActivity" class="space-y-6 animate-fade-in">
            <div>
              <h1 class="text-2xl font-bold text-slate-900 mb-2">Wallet</h1>
              <p class="text-slate-600">
                Your custodial wallet is your on-chain identity on the Sepolia network.
                Every grant, record hash, and access log is attributed to this address — no MetaMask required.
              </p>
            </div>

            <!-- Wallet address card -->
            <div class="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <h2 class="text-lg font-bold text-slate-900 mb-4">Custodial Wallet Address</h2>
              <div class="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-slate-200">
                <div class="flex items-center gap-2">
                  <div class="w-9 h-9 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <p class="text-xs text-slate-500">Wallet address (checksummed)</p>
                    <p class="text-sm font-mono font-semibold text-slate-900 break-all">{{ walletActivity.wallet_address }}</p>
                  </div>
                </div>
                <button (click)="copyWalletAddress()"
                        class="flex-shrink-0 self-start px-4 py-2 bg-primary-500 text-white text-sm font-semibold rounded-xl hover:bg-primary-600 transition-colors shadow-sm">
                  Copy address
                </button>
              </div>

              <div class="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p class="text-xs text-slate-500 mb-1">Health ID (this wallet is bound to)</p>
                <p class="text-sm font-mono font-semibold text-slate-900">{{ walletActivity.health_id }}</p>
              </div>
              <div class="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p class="text-xs text-slate-500 mb-1">Account holder</p>
                <p class="text-sm font-semibold text-slate-900">{{ walletActivity.full_name }}</p>
              </div>

              <div class="p-4 bg-amber-50 rounded-xl border border-amber-200 mt-4">
                <p class="text-sm text-amber-800">
                  <span class="font-semibold">Note:</span> This is a custodial wallet managed by the platform. The private key is encrypted and held by the backend so you can sign in with just your Health ID and PIN. You do not need MetaMask for any platform action.
                </p>
              </div>
            </div>

            <!-- Wallet activity summary -->
            <div class="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <h2 class="text-lg font-bold text-slate-900 mb-4">Wallet activity summary</h2>
              <dl class="grid grid-cols-2 gap-4">
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">On-chain events</p>
                  <p class="text-2xl font-bold text-ink">{{ walletActivity.activityCount }}</p>
                  <p class="text-xs text-muted">actions logged on Sepolia for this wallet</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Pending operations</p>
                  <p class="text-2xl font-bold" [class."text-red-600"]="walletActivity.pendingOperations > 0">{{ walletActivity.pendingOperations }}</p>
                  <p class="text-xs text-muted">access requests waiting for your answer</p>
                </div>
              </dl>

              <div class="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p class="text-xs text-slate-500 mb-1">Last on-chain activity</p>
                <p class="text-sm text-slate-900">
                  {{ walletActivity.lastActivityAt ? (walletActivity.lastActivityAt * 1000 | date:'medium') : 'No on-chain activity yet' }}
                </p>
              </div>

              <div *ngIf="walletActivity.lastTxHash" class="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p class="text-xs text-slate-500 mb-1">Last transaction hash</p>
                <div class="flex flex-wrap items-center gap-2">
                  <code class="text-xs font-mono text-slate-900">{{ walletActivity.lastTxHash | slice:0:32 }}…</code>
                  <a *ngIf="!walletActivity.lastTxHash.toLowerCase().startsWith('pending')"
                     [href]="'https://sepolia.etherscan.io/tx/' + walletActivity.lastTxHash"
                     target="_blank" rel="noopener"
                     class="text-xs font-semibold text-accent-700 hover:underline">
                    View on Etherscan
                  </a>
                </div>
              </div>
            </div>

            <!-- Active grants summary -->
            <div *ngIf="walletGrants" class="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <h2 class="text-lg font-bold text-slate-900 mb-4">Active permissions (grants)</h2>
              <dl class="grid grid-cols-3 gap-4">
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Active</p>
                  <p class="text-2xl font-bold text-accent-700">{{ walletGrants.activeCount }}</p>
                  <p class="text-xs text-muted">doctors with access now</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Expiring soon</p>
                  <p class="text-2xl font-bold" [class."text-amber-600"]="walletGrants.expiringSoon > 0">{{ walletGrants.expiringSoon }}</p>
                  <p class="text-xs text-muted">expire within 7 days</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Last grant</p>
                  <p class="text-sm font-semibold text-slate-900 truncate">{{ walletGrants.lastGrantDoctor || '—' }}</p>
                  <p class="text-xs text-muted">
                    {{ walletGrants.lastGrantAt ? (walletGrants.lastGrantAt | date:'short') : 'none yet' }}
                  </p>
                </div>
              </dl>
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
            <div class="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
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
                  <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Wallet address</p>
                  <p class="text-xs font-mono text-slate-900 break-all">{{ profileInfo.wallet_address }}</p>
                </div>
              </dl>
            </div>

            <!-- Editable profile form -->
            <div class="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <h2 class="text-lg font-bold text-slate-900 mb-4">Edit profile</h2>
              <p class="mb-4 text-sm text-muted">
                Update your name and phone. These changes take effect immediately.
              </p>

              <div *ngIf="editMsg" class="mb-4 rounded-lg border p-3 text-sm" [class."text-accent-900 bg-accent-50 border-accent-200"]="editOk" [class."text-red-700 bg-red-50 border-red-200"]="!editOk">
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
            <div *ngIf="grantSummary" class="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <h2 class="text-lg font-bold text-slate-900 mb-4">Access you have granted</h2>
              <dl class="grid grid-cols-3 gap-4">
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Active grants</p>
                  <p class="text-2xl font-bold text-accent-700">{{ grantSummary.activeCount }}</p>
                  <p class="text-xs text-muted">doctors with access now</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Pending requests</p>
                  <p class="text-2xl font-bold" [class."text-red-600"]="grantSummary.pendingCount > 0">{{ grantSummary.pendingCount }}</p>
                  <p class="text-xs text-muted">waiting for your answer</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Expiring soon</p>
                  <p class="text-2xl font-bold" [class."text-amber-600"]="grantSummary.expiringSoon > 0">{{ grantSummary.expiringSoon }}</p>
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
            <div class="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
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

              <div *ngFor="let r of referralSecurity.referrals" class="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
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
                        [class."bg-accent-500 text-white"]="r.status === 'ACCEPTED'"
                        [class."bg-red-500 text-white"]="r.status === 'DECLINED'"
                        [class."bg-primary-300 text-ink"]="r.status === 'PENDING'">
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
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
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
                        <span class="font-semibold" [class."text-accent-700"]="rec.verified"
                              [class."text-muted"]="!rec.verified">
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
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
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

            <div *ngIf="referralSecurity && !referralSecurity.referrals.length" class="bg-white rounded-2xl shadow-lg border border-slate-200 p-10 text-center">
              <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
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

          <!-- HEALTH SUMMARY -->
          <div *ngIf="tab === 'health-summary'" class="space-y-6 animate-fade-in">
            <div>
              <h1 class="text-2xl font-bold text-slate-900 mb-2">Health Summary</h1>
              <p class="text-slate-600">
                A quick overview of your medical history across all hospitals — your most-
                used medicines, most frequent measurements, common diagnoses, and which
                hospitals you visit most.
              </p>
            </div>

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

            <!-- Overall counts -->
            <div *ngIf="healthSummary" class="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
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

            <div *ngIf="!healthSummary" class="bg-white rounded-2xl shadow-lg border border-slate-200 p-10 text-center">
              <p class="text-slate-600">Loading your health summary…</p>
            </div>
          </div>

          <!-- ACTIVITY -->
          <div *ngIf="tab === 'activity'" class="space-y-6 animate-fade-in">
            <div>
              <h1 class="text-2xl font-bold text-slate-900 mb-2">Blockchain Activity</h1>
              <p class="text-slate-600 leading-relaxed">
                Complete, transparent timeline of all actions on your health data — verified on the Sepolia blockchain.
              </p>
              <p class="text-sm text-slate-500 mt-2">{{ story.length }} on-chain event(s) • Newest first</p>
            </div>

            <div class="relative">
              <div class="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-slate-200 via-slate-200 to-transparent"></div>
              <div *ngFor="let s of story; let last = last" class="relative flex gap-4 mb-6">
                <div class="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg shadow-md" [class]="storyDot(s)">
                  {{ s.icon }}
                </div>
                <div class="flex-1 bg-white rounded-2xl shadow-lg border border-slate-200 p-5 hover:shadow-xl transition-all duration-200">
                  <div class="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p class="text-slate-900 leading-relaxed">
                        <span class="font-bold">{{ s.who || s.wallet | slice:0:18 }}</span>
                        <span> {{ s.verb }}</span>
                      </p>
                      <div class="flex flex-wrap items-center gap-2 mt-2 text-sm text-slate-500">
                        <span>{{ s.timestamp * 1000 | date:'medium' }}</span>
                        <span *ngIf="s.facility">• Facility {{ s.facility }}</span>
                        <span *ngIf="s.role">• {{ s.role }}</span>
                      </div>
                    </div>
                    <a *ngIf="s.etherscan_url" [href]="s.etherscan_url" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors shadow-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Verify on Etherscan
                    </a>
                    <span *ngIf="!s.etherscan_url" class="text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">Transaction pending</span>
                  </div>
                </div>
              </div>
            </div>

            <div *ngIf="story.length === 0" class="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
              <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">No Activity Yet</h3>
              <p class="text-slate-600">Blockchain activity will appear here when records are accessed or permissions change.</p>
            </div>
          </div>
        </main>
      </div>
    </div>

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
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div *ngIf="n.reason" class="p-3 bg-slate-50 rounded-xl border border-slate-200 mb-3">
            <p class="text-xs text-slate-600 italic">"{{ n.reason }}"</p>
          </div>
          <div class="flex gap-2">
            <button (click)="approveFromToast(n)" class="flex-1 px-3 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors">Approve</button>
            <button (click)="rejectFromToast(n)" class="flex-1 px-3 py-2 bg-white border border-red-500 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 transition-colors">Reject</button>
          </div>
          <p class="text-center text-xs text-slate-500 mt-2">Grants 7 days of on-chain access</p>
        </div>
      </div>
    </div>

    <!-- REFERRAL REQUEST MODAL (patient) -->
    <div *ngIf="referralModal"
         class="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-fade-in">
      <div class="card w-full max-w-lg p-6 sm:p-8 shadow-2xl border border-gray-200 animate-slide-up bg-surface">
        <div class="mb-4 flex items-start justify-between">
          <div>
            <span class="eyebrow mb-2">Referral</span>
            <h2 class="text-xl font-bold">Request a hospital referral</h2>
          </div>
          <button (click)="referralModal = false" aria-label="Close"
                  class="cursor-pointer rounded-lg p-1 text-2xl leading-none text-muted hover:text-ink">×</button>
        </div>
        <p class="mb-4 text-sm text-muted">
          Choose the hospital you want to be referred to and why. That hospital's staff
          or doctor must accept it before the referral is complete.
        </p>
        <div class="flex flex-col gap-3">
          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-ink">Target hospital</span>
            <select [(ngModel)]="referralForm.to_hospital"
                    class="px-3 py-2.5 text-sm">
               <option value="" disabled>Select hospital…</option>
               <option *ngFor="let h of sendHospitals" [value]="h.code">{{ h.name }} ({{ h.code }})</option>
            </select>
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-ink">Reason</span>
            <textarea [(ngModel)]="referralForm.reason" rows="2"
                      placeholder="e.g. specialist review, follow-up after discharge"
                      class="px-3 py-2.5 text-sm"></textarea>
          </label>
        </div>
        <div class="mt-5 flex gap-2">
          <button (click)="sendReferral()" [disabled]="sendBusy || !referralForm.to_hospital"
                  class="flex-1 btn-primary disabled:opacity-50">
            {{ sendBusy ? 'Sending…' : 'Send request' }}
          </button>
          <button (click)="referralModal = false"
                  class="flex-1 btn-secondary">
            Cancel
          </button>
        </div>
        <p *ngIf="sendMsg" class="mb-0 mt-3 text-sm" [class]="sendOk ? 'text-accent-600' : 'text-red-600'">{{ sendMsg }}</p>
      </div>
    </div>
  `,

})
export class PatientDashboardComponent implements OnInit, OnDestroy {
  tab: 'records' | 'measurements' | 'referrals' | 'permissions' | 'requests' | 'activity' | 'wallet' | 'profile' | 'referral-security' | 'health-summary' = 'records';
  tabs = [
    { id: 'records', label: 'Records' },
    { id: 'measurements', label: 'Measurements' },
    { id: 'referrals', label: 'Referrals' },
    { id: 'permissions', label: 'Permissions' },
    { id: 'requests', label: 'Requests' },
    { id: 'activity', label: 'Activity' },
    { id: 'wallet', label: 'Wallet' },
    { id: 'profile', label: 'Profile' },
    { id: 'referral-security', label: 'Referral Security' },
    { id: 'health-summary', label: 'Health Summary' },
  ] as const;

  data: PatientData | null = null;
  requests: AccessRequest[] = [];
  story: ActivityStoryItem[] = [];
  loading = false;
  busy = false;
  errorMsg = '';

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

  setTab(id: 'records' | 'measurements' | 'referrals' | 'permissions' | 'requests' | 'activity' | 'wallet' | 'profile' | 'referral-security' | 'health-summary') {
    this.tab = id;
    if (id === 'activity') {
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
    if (id === 'health-summary') {
      this.syncView();
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
  } | null = null;

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

  private async loadWalletProfile() {
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
    this.syncView();
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

  copyWalletAddress() {
    const addr = this.walletActivity?.wallet_address
      ?? this.profileInfo?.wallet_address;
    if (!addr) return;
    navigator.clipboard.writeText(addr).catch(() => {});
  }

  // --- Health summary (computed from records + measurements + referrals) ---
  healthSummary: {
    diagnoses: { type: string; count: number }[];
    medicines: { detail: string; count: number }[];
    measurements: { kind: string; count: number; latest_value: number; latest_unit: string; latest_date: string; latest_doctor: string; latest_hospital: string }[];
    hospital_visits: { facility: string; count: number }[];
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

  /** Compute a health summary from the already-loaded patient data. */
  private computeHealthSummary() {
    if (!this.data) {
      this.healthSummary = null;
      return;
    }
    const records = this.data.records || [];
    const measurements = this.data.measurements || [];

    // Diagnoses / record types frequency
    const typeCounter: Record<string, number> = {};
    for (const r of records) {
      typeCounter[r.type] = (typeCounter[r.type] || 0) + 1;
    }
    const diagnoses = Object.entries(typeCounter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([type, count]) => ({ type, count }));

    // Medicines: scan record data for keys containing medicine/medication/drug/prescription/treatment
    const medCounter: Record<string, number> = {};
    for (const r of records) {
      if (!r.data) continue;
      for (const [key, value] of Object.entries(r.data)) {
        const lk = key.toLowerCase();
        if (['medicine', 'medication', 'drug', 'prescription', 'rx', 'treatment'].some(t => lk.includes(t))) {
          const detail = `${key}: ${value}`;
          medCounter[detail] = (medCounter[detail] || 0) + 1;
        }
      }
    }
    const medicines = Object.entries(medCounter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([detail, count]) => ({ detail, count }));

    // Measurements frequency + latest value per kind
    const measCounter: Record<string, number> = {};
    const measLatest: Record<string, { value: number; unit: string; date: string; doctor: string; hospital: string }> = {};
    for (const m of measurements) {
      measCounter[m.kind] = (measCounter[m.kind] || 0) + 1;
      const measurementDate = m.date ?? m.created_at ?? '';
      if (!measLatest[m.kind] || measurementDate > measLatest[m.kind].date) {
        measLatest[m.kind] = {
          value: m.value,
          unit: m.unit,
          date: measurementDate,
          doctor: m.doctor || '',
          hospital: m.hospital || '',
        };
      }
    }
    const measurementsSummary = Object.entries(measCounter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([kind, count]) => {
        const lv = measLatest[kind];
        return {
          kind,
          count,
          latest_value: lv && lv.value != null ? lv.value : 0,
          latest_unit: (lv && lv.unit) || '',
          latest_date: (lv && lv.date) || '',
          latest_doctor: (lv && lv.doctor) || '',
          latest_hospital: (lv && lv.hospital) || '',
        };
      });


    // Hospital visit frequency (from records)
    const hospitalCounter: Record<string, number> = {};
    for (const r of records) {
      hospitalCounter[r.facility] = (hospitalCounter[r.facility] || 0) + 1;
    }
    const hospitalVisits = Object.entries(hospitalCounter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([facility, count]) => ({ facility, count }));

    this.healthSummary = {
      diagnoses,
      medicines,
      measurements: measurementsSummary,
      hospital_visits: hospitalVisits,
      total_records: records.length,
      total_measurements: measurements.length,
    };
    this.syncView();
  }

  /** Record the tx of an on-chain action and surface it in the banner. */
  private showLastTx(label: string, tx_hash?: string) {
    const h = (tx_hash || '').trim();
    if (!h) return;
    this.lastTx = { label, tx_hash: h, pending: this.isPendingTx(h) };
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
        return '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>';
      case 'measurements':
        return '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>';
      case 'referrals':
        return '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>';
      case 'permissions':
        return '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>';
      case 'requests':
        return '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>';
      case 'activity':
        return '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>';
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
  private async loadStory() {
    if (!this.data?.health_id) return;
    try {
      const res = await this.api.patientActivityStory(this.data.health_id);
      this.story = res.story;
      // A PENDING grant just mined? Update the banner to show the live link.
      if (this.lastTx?.pending && this.story.some((s) => s.transaction_hash === this.lastTx!.tx_hash)) {
        this.lastTx.pending = false;
      }
    } catch (e: any) {
      console.error('Failed to load activity story:', e);
      this.story = [];
    }
    this.syncView();
  }

  /**
   * Poll every 15s: refresh access requests (popups) AND the core payload
   * (records, measurements, referrals, audit trail) so the dashboard stays
   * live — e.g. a doctor's VIEW event or a new record appears on its own.
   */
  private startPolling() {
    this.pollTimer = setInterval(async () => {
      let changed = false;
      // Keep the Etherscan story live while the patient watches it.
      if (this.tab === 'activity') void this.loadStory();
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
      this.showLastTx(`Access granted to Dr. ${doctorLabel}`, res?.tx_hash);
      this.grant = { doctor_license: '', doctor_name: '', doctor_wallet: '', days: 7 };
      this.selectedDoctor = null;
      this.doctorQuery = '';
      await this.reload();
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
      this.showLastTx(`Access granted to Dr. ${req.doctor_name} for 7 days`, res?.tx_hash);
      await this.reload();
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

  /** Open the account/profile page (credential rotation, role-aware). */
  viewProfile() {
    this.router.navigate(['/account']);
  }

  /** Log out and take the user back to the sign-in page. */
  logoutAndRedirect() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
