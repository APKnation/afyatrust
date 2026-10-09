import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { NgIf, NgFor, SlicePipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, PatientData, AccessRequest, DoctorOption, ActivityStoryItem } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-patient-dashboard',
  imports: [NgIf, NgFor, SlicePipe, DatePipe, FormsModule],
  template: `
    <!-- LOADING -->
    <div *ngIf="loading && !data" class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40">
      <div class="w-16 h-16 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mb-6"></div>
      <p class="text-slate-600 font-medium">Loading your health records...</p>
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

      <!-- Tabs -->
      <div class="mb-6 flex flex-wrap gap-1 border-b border-gray-200">
        <button
          *ngFor="let t of tabs"
          class="cursor-pointer border-none bg-transparent px-4 py-3 text-[15px] transition-colors relative"
          [class]="tab === t.id
            ? 'font-bold text-primary-500 border-b-4 border-primary-500 -mb-[2px]'
            : 'text-muted hover:text-ink'"
          (click)="setTab(t.id)"
        >
          {{ t.label }}
          <span *ngIf="t.id === 'requests' && requests.length > 0"
                class="ml-1.5 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
            {{ requests.length }}
          </span>
        </button>
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
  tab: 'records' | 'measurements' | 'referrals' | 'permissions' | 'requests' | 'activity' = 'records';
  tabs = [
    { id: 'records', label: 'Records' },
    { id: 'measurements', label: 'Measurements' },
    { id: 'referrals', label: 'Referrals' },
    { id: 'permissions', label: 'Permissions' },
    { id: 'requests', label: 'Requests' },
    { id: 'activity', label: 'Activity' },
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

  setTab(id: 'records' | 'measurements' | 'referrals' | 'permissions' | 'requests' | 'activity') {
    this.tab = id;
    if (id === 'activity') {
      void this.loadStory();
    }
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
    await this.reload();
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

  /** Log out and take the user back to the sign-in page. */
  logoutAndRedirect() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
