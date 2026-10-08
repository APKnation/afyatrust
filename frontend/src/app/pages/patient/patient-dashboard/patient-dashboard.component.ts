import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { NgIf, NgFor, SlicePipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, PatientData, AccessRequest, DoctorOption, BlockchainEvent } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-patient-dashboard',
  imports: [NgIf, NgFor, SlicePipe, DatePipe, FormsModule],
  template: `
    <!-- LOADING (only when there really is nothing yet) -->
    <div *ngIf="loading && !data" class="py-20 text-center text-muted">
      <span class="eyebrow mx-auto mb-3 w-fit">AfyaTrust</span>
      <h2 class="mb-1 text-xl font-bold text-ink">Loading your records…</h2>
    </div>

    <!-- NOT LOGGED IN (e.g. token expired or server unreachable) -->
    <div *ngIf="!auth.isAuthenticated()" class="py-20 text-center text-muted">
      <span class="eyebrow mx-auto mb-3 w-fit">Session</span>
      <h2 class="mb-2 text-2xl font-bold text-ink">Your session expired</h2>
      <p class="mb-5">Please sign in again to see your records.</p>
      <button
        (click)="logoutAndRedirect()"
        class="btn-primary">
        Sign in again
      </button>
    </div>

    <!-- LOAD FAILED (visible error, never a silent stall) -->
    <div *ngIf="errorMsg && !data" class="mx-auto max-w-2xl py-20 text-center">
      <span class="eyebrow mx-auto mb-3 w-fit">Problem</span>
      <h2 class="mb-2 text-2xl font-bold text-ink">Could not load your records</h2>
      <p class="mb-5 text-muted">{{ errorMsg }}</p>
      <button (click)="retry()"
              class="btn-primary">
        Try again
      </button>
    </div>

    <!-- DASHBOARD -->
    <div *ngIf="data" class="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <!-- Hero header, echoes the landing style -->
      <div class="card mb-6 p-6 sm:p-8">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span class="eyebrow mb-2">My Health Workspace</span>
            <h1 class="mb-1 text-2xl font-bold text-ink sm:text-3xl">{{ data.full_name }}</h1>
            <p class="m-0 text-sm text-muted">
              Health ID <strong class="text-ink">{{ data.health_id }}</strong>
              <span class="mx-2 text-primary-200">|</span>
              Wallet
              <code class="rounded bg-primary-50 px-2 py-1 text-sm font-mono text-primary-900">{{ data.wallet_address | slice:0:10 }}…</code>
              <span class="ml-1 text-xs">(managed for you — no MetaMask needed)</span>
            </p>
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
      <div *ngIf="tab === 'records'" class="animate-fade-in">
        <h2 class="mb-1 text-xl font-bold">My Medical History</h2>
        <p class="mb-4 text-sm text-muted">
          Only the SHA-256 hash of each record lives on-chain; the data itself stays at
          the facility that created it. A record is marked <strong>On-chain</strong> once
          its hash is verifiable on Etherscan.
        </p>
        <div *ngFor="let rec of data.records" class="card mb-4 p-5">
          <div class="mb-3 flex flex-wrap items-center gap-3">
            <span class="font-bold text-accent-700">{{ rec.facility }}</span>
            <span class="text-sm text-muted">{{ rec.date | date:'medium' }}</span>
            <span class="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-bold text-primary-900">{{ rec.type }}</span>
            <span *ngIf="rec.verified"
                  class="rounded-full bg-accent-500 px-2.5 py-0.5 text-xs font-semibold text-white">On-chain</span>
            <span *ngIf="!rec.verified"
                  class="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-800">Pending</span>
          </div>
          <div *ngIf="rec.source_uri" class="mb-3 text-xs text-muted flex items-center gap-1.5">
            <span class="font-semibold">Source:</span>
            <a [href]="rec.source_uri" target="_blank" rel="noopener" class="text-accent-600 hover:underline break-all">{{ rec.source_uri }}</a>
          </div>
          <div class="mb-3 rounded-lg bg-gray-50 border border-gray-100 p-3">
            <div *ngFor="let item of entries(rec.data)"
                 class="flex border-b border-gray-200 py-1.5 last:border-b-0">
              <span class="w-48 shrink-0 font-semibold capitalize text-ink">{{ item.key }}:</span>
              <span class="text-ink">{{ item.value }}</span>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span class="font-semibold">Record hash</span>
            <code class="rounded bg-gray-100 px-2 py-1 font-mono text-gray-800">{{ rec.hash | slice:0:40 }}…</code>
            <span *ngIf="rec.tx_hash && !rec.tx_hash.startsWith('PENDING')" class="font-semibold">Tx</span>
            <a *ngIf="rec.tx_hash && !rec.tx_hash.startsWith('PENDING')"
               [href]="'https://sepolia.etherscan.io/tx/' + rec.tx_hash"
               target="_blank" rel="noopener"
               class="inline-block rounded-full bg-gray-100 border border-gray-200 px-3 py-1 font-mono text-accent-700 hover:bg-gray-200 transition-colors shadow-sm">
              {{ rec.tx_hash | slice:0:12 }}… view on Etherscan
            </a>
          </div>
        </div>
        <div *ngIf="data.records.length === 0" class="card p-10 text-center">
          <h3 class="mb-1 text-lg font-bold">No records yet</h3>
          <p class="m-0 text-muted">They appear here when a facility adds them — hashes first, on-chain.</p>
        </div>
      </div>

      <!-- MEASUREMENTS -->
      <div *ngIf="tab === 'measurements'" class="animate-fade-in">
        <h2 class="mb-1 text-xl font-bold">My Measurements</h2>
        <p class="mb-4 text-sm text-muted">
          Readings a doctor records against your Health ID. Values stay off-chain;
          access is checked on-chain before any write.
        </p>
        <div class="card overflow-hidden">
          <table *ngIf="data?.measurements?.length" class="w-full text-left">
            <thead>
              <tr class="bg-primary-50 text-ink border-b border-gray-200">
                <th class="px-4 py-3 text-sm font-semibold">Date</th>
                <th class="px-4 py-3 text-sm font-semibold">Type</th>
                <th class="px-4 py-3 text-sm font-semibold">Value</th>
                <th class="px-4 py-3 text-sm font-semibold">By</th>
                <th class="px-4 py-3 text-sm font-semibold">Hospital</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let m of data.measurements" class="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3 text-sm">{{ m.date | date:'short' }}</td>
                <td class="px-4 py-3 text-sm font-semibold">{{ m.kind }}</td>
                <td class="px-4 py-3 text-sm">{{ m.value }} {{ m.unit }}</td>
                <td class="px-4 py-3 text-sm">{{ m.doctor || '—' }}</td>
                <td class="px-4 py-3 text-sm">{{ m.hospital || '—' }}</td>
              </tr>
            </tbody>
          </table>
          <div *ngIf="!data.measurements.length" class="p-10 text-center">
            <h3 class="mb-1 text-lg font-bold">No measurements yet</h3>
            <p class="m-0 text-muted">They appear when a doctor records one for you.</p>
          </div>
        </div>
      </div>

      <!-- REFERRALS -->
      <div *ngIf="tab === 'referrals'" class="animate-fade-in">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="mb-1 text-xl font-bold">My Referrals</h2>
            <p class="m-0 text-sm text-muted">Movements between hospitals. The receiving hospital must accept before anything changes.</p>
          </div>
          <button
            (click)="referralModal = true"
            class="btn-secondary text-sm">
            Request a referral
          </button>
        </div>
        <div *ngFor="let r of data.referrals" class="card mb-4 flex flex-wrap items-center justify-between gap-3 p-5 border border-gray-100">
          <div>
            <p class="m-0 font-bold text-ink">{{ r.to_hospital }}</p>
            <p class="m-0 text-sm text-muted">
              {{ r.reason || 'No reason recorded' }} · {{ r.date | date:'medium' }}
              <span *ngIf="r.responded_by" class="ml-2">
                — responded by {{ r.responded_by }}{{ r.responded_at ? (' · ' + (r.responded_at | date:'short')) : '' }}
               </span>
            </p>
          </div>
          <span class="rounded-full px-3 py-1 text-xs font-bold"
                [class]="r.status === 'ACCEPTED' ? 'bg-accent-500 text-white'
                  : r.status === 'DECLINED' ? 'bg-red-500 text-white'
                  : r.status === 'CANCELLED' ? 'bg-gray-200 text-ink'
                  : 'bg-primary-100 text-primary-900'">{{ r.status }}</span>
        </div>
        <div *ngIf="data.referrals.length === 0" class="card p-10 text-center border border-gray-100">
          <h3 class="mb-1 text-lg font-bold">No referrals yet</h3>
          <p class="m-0 text-muted">When your doctor — or you — arrange one, it shows here.</p>
        </div>
      </div>

      <!-- PERMISSIONS -->
      <div *ngIf="tab === 'permissions'" class="animate-fade-in">
        <h2 class="mb-1 text-xl font-bold">Grant Access to a Doctor</h2>
        <p class="mb-4 text-sm text-muted">
          Type the doctor's name or license number. A dropdown of matching
          doctors appears below — pick one to autofill, then confirm the days.
        </p>
        <div class="card mb-4 p-6 border border-gray-100">
          <!-- Doctor lookup (free text + dropdown suggestion) -->
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5 relative">
              <span class="text-[13px] font-semibold text-ink">Doctor</span>
              <input
                [(ngModel)]="doctorQuery"
                (ngModelChange)="onDoctorQueryChanged()"
                (focus)="showSuggestions = true"
                (blur)="showSuggestions = false"
                placeholder="Type a doctor's name or license, or pick from the list…"
                class="px-3 py-2.5 text-sm"
              />
              <!-- Dropdown suggestions (mousedown fires before input blur) -->
              <ul
                *ngIf="showSuggestions && doctors.length"
                class="rounded-lg border border-gray-200 bg-white max-h-48 overflow-auto shadow-sm absolute z-50 w-full top-[105%]"
              >
                <li
                  *ngFor="let d of doctors"
                  (mousedown)="selectDoctor(d)"
                  class="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
                >
                  <div>
                     <p class="m-0 font-semibold text-ink">{{ d.full_name }}</p>
                     <p class="m-0 text-[12px] text-muted">{{ d.license_no }} · {{ d.facility_id }}</p>
                  </div>
                  <span class="text-accent-600">→</span>
                </li>
              </ul>
              <p *ngIf="showSuggestions && !doctorLoading && doctors.length === 0" class="mt-1 text-xs text-muted">
                No doctors found. Ask your doctor for their license number.
              </p>
              <p *ngIf="doctorLoading" class="mt-1 text-xs text-muted">Searching…</p>
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Days of access</span>
              <input type="number" [(ngModel)]="grant.days" min="1" max="90"
                     class="px-3 py-2.5 text-sm" />
            </label>
          </div>
          <!-- Confirmation hint showing which doctor will be granted access. -->
          <p class="mt-3 text-xs text-muted">
             <span class="font-semibold">Granting access to:</span>
             <ng-container *ngIf="selectedDoctor">
               <span class="text-ink">{{ selectedDoctor.full_name }} ({{ selectedDoctor.license_no }})</span>
               <span class="mx-1">·</span>
               <span class="text-muted">{{ selectedDoctor.facility_id }}</span>
             </ng-container>
             <ng-container *ngIf="!selectedDoctor">
               <span class="text-muted">select or type above</span>
             </ng-container>
          </p>
          <button (click)="grantAccess()" [disabled]="busy"
                  class="mt-4 btn-primary disabled:opacity-50">
            {{ busy ? 'Granting…' : 'Grant access' }}
          </button>
          <p *ngIf="busy" class="mb-0 mt-2 text-xs text-muted">
            Signing an on-chain transaction with your custodial wallet — the
            AccessGranted event will be verifiable on Etherscan.
          </p>
        </div>
        <p class="text-sm text-muted">
          Access expires automatically. Revoke any time — the revoke event is logged on-chain too.
        </p>
      </div>

      <!-- REQUESTS -->
      <div *ngIf="tab === 'requests'" class="animate-fade-in">
        <h2 class="mb-1 text-xl font-bold">Access Requests</h2>
        <p class="mb-4 text-sm text-muted">A verified doctor has asked to see your records. Approving grants 7 days of on-chain access.</p>
        <div *ngFor="let req of requests" class="card mb-4 flex flex-wrap items-center justify-between gap-3 p-5 border border-gray-100">
          <div>
            <p class="my-1 font-bold text-ink">{{ req.doctor_name }}</p>
            <p class="my-1 text-sm text-muted">from <strong>{{ req.facility_id }}</strong></p>
            <p class="my-1 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-[13px] italic text-muted">{{ req.reason }}</p>
            <p class="my-1 text-xs text-muted">{{ req.created_at | date:'medium' }}</p>
          </div>
          <div class="flex gap-2.5">
            <button (click)="approve(req)" class="btn-primary px-5 py-2.5">Approve</button>
            <button (click)="reject(req)" class="btn-secondary px-5 py-2.5 !border-red-500 !text-red-500 hover:!bg-red-50">Reject</button>
          </div>
        </div>
        <div *ngIf="requests.length === 0" class="card p-10 text-center border border-gray-100">
          <h3 class="mb-1 text-lg font-bold">No pending requests</h3>
          <p class="m-0 text-muted">You're all caught up.</p>
        </div>
      </div>

      <!-- AUDIT -->
      <div *ngIf="tab === 'audit'" class="animate-fade-in">
        <h2 class="mb-1 text-xl font-bold">Who Accessed My Data</h2>
        <p class="mb-4 text-sm text-muted">
          Every access event is written on-chain — who, what role, which facility, when.
          Emergency break-glass access is logged here too.
        </p>
        <div class="card overflow-hidden">
          <table *ngIf="data.audit_trail.length" class="w-full text-left">
            <thead>
              <tr class="bg-primary-50 text-ink border-b border-gray-200">
                <th class="px-4 py-3 text-sm font-semibold">Date</th>
                <th class="px-4 py-3 text-sm font-semibold">Who</th>
                <th class="px-4 py-3 text-sm font-semibold">Role</th>
                <th class="px-4 py-3 text-sm font-semibold">Action</th>
                <th class="px-4 py-3 text-sm font-semibold">Facility</th>
                <th class="px-4 py-3 text-sm font-semibold">Verify</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let ev of data.audit_trail" class="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3 text-sm">{{ ev.timestamp * 1000 | date:'short' }}</td>
                <td class="px-4 py-3"><code class="text-xs">{{ ev.accessor | slice:0:10 }}…</code></td>
                <td class="px-4 py-3">
                  <span class="rounded-full px-2.5 py-0.5 text-xs font-bold" [class]="roleBadge(ev.role)">{{ ev.role }}</span>
                </td>
                <td class="px-4 py-3">
                  <span class="rounded-full px-2.5 py-0.5 text-xs font-bold" [class]="actionBadge(ev.action)">{{ ev.action }}</span>
                </td>
                <td class="px-4 py-3 text-sm">{{ ev.facility || '—' }}</td>
                <td class="px-4 py-3">
                  <a *ngIf="ev.transaction_hash"
                     [href]="'https://sepolia.etherscan.io/tx/' + ev.transaction_hash"
                     target="_blank" rel="noopener"
                     class="inline-block rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-xs font-mono text-accent-700 hover:bg-gray-200 transition-colors shadow-sm">
                    View TX
                  </a>
                  <span *ngIf="!ev.transaction_hash" class="text-xs text-muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div *ngIf="data.audit_trail.length === 0" class="p-10 text-center">
             <h3 class="mb-1 text-lg font-bold">No access events yet</h3>
             <p class="m-0 text-muted">Every future view of your records appears here, permanently.</p>
          </div>
        </div>
      </div>

      <!-- BLOCKCHAIN TRANSACTIONS -->
      <div *ngIf="tab === 'transactions'" class="animate-fade-in">
        <h2 class="mb-1 text-xl font-bold">Blockchain Transaction History</h2>
        <p class="mb-4 text-sm text-muted">
          Every on-chain transaction related to your health records. All transactions are verifiable on Etherscan.
          Events include: patient registration, record additions, access grants/revokes, record views, and emergency access.
        </p>
        <div class="card overflow-hidden">
          <table *ngIf="transactions.length" class="w-full text-left">
            <thead>
              <tr class="bg-primary-50 text-ink border-b border-gray-200">
                <th class="px-4 py-3 text-sm font-semibold">Date</th>
                <th class="px-4 py-3 text-sm font-semibold">Event Type</th>
                <th class="px-4 py-3 text-sm font-semibold">Transaction Hash</th>
                <th class="px-4 py-3 text-sm font-semibold">Block</th>
                <th class="px-4 py-3 text-sm font-semibold">Details</th>
                <th class="px-4 py-3 text-sm font-semibold">Verify</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let tx of transactions" class="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3 text-sm">{{ tx.timestamp ? (tx.timestamp * 1000 | date:'short') : '—' }}</td>
                <td class="px-4 py-3">
                  <span class="rounded-full px-2.5 py-0.5 text-xs font-bold"
                        [class]="eventBadge(tx.event)">{{ formatEventName(tx.event) }}</span>
                </td>
                <td class="px-4 py-3">
                  <code class="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{{ tx.transaction_hash | slice:0:14 }}…</code>
                </td>
                <td class="px-4 py-3 text-sm font-mono">{{ tx.block_number }}</td>
                <td class="px-4 py-3 text-xs text-muted">
                   <div *ngFor="let arg of eventArgs(tx.args)">{{ arg.key }}: <span class="text-ink">{{ arg.value }}</span></div>
                </td>
                <td class="px-4 py-3">
                  <a [href]="tx.etherscan_url" target="_blank" rel="noopener"
                     class="inline-block rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-xs font-mono text-accent-700 hover:bg-gray-200 transition-colors shadow-sm">
                    View TX
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
          <div *ngIf="transactions.length === 0" class="p-10 text-center">
            <h3 class="mb-1 text-lg font-bold">No blockchain transactions yet</h3>
            <p class="m-0 text-muted">Transactions appear here when records are added, access is granted, or your data is viewed.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ACCESS-REQUEST NOTIFICATIONS (popup, survives tab switches) -->
    <div class="fixed top-20 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
      <div *ngFor="let n of notifications" class="card animate-fade-in border-l-4 border-l-primary-500 p-4 shadow-2xl">
        <div class="mb-1 flex items-center justify-between gap-2">
          <span class="text-sm font-bold text-ink">New access request</span>
          <button (click)="dismiss(n.id)" aria-label="Dismiss"
                  class="cursor-pointer border-none bg-transparent text-lg leading-none text-muted hover:text-ink">×</button>
        </div>
        <p class="m-0 text-sm text-ink">
          <strong>{{ n.doctor_name }}</strong> from <strong>{{ n.facility_id }}</strong>
          wants to view your records.
        </p>
        <p *ngIf="n.reason" class="mb-0 mt-1 rounded-md bg-gray-50 border border-gray-200 px-2 py-1.5 text-[13px] italic text-muted">{{ n.reason }}</p>
        <div class="mt-3 flex gap-2">
          <button (click)="approveFromToast(n)"
                  class="flex-1 btn-primary py-2 text-sm">Approve</button>
          <button (click)="rejectFromToast(n)"
                  class="flex-1 btn-secondary py-2 text-sm !border-red-500 !text-red-500 hover:!bg-red-50">Reject</button>
        </div>
        <p class="mb-0 mt-2 text-center text-[11px] text-muted">Approval grants 7 days of access and is logged on-chain.</p>
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
  tab: 'records' | 'measurements' | 'referrals' | 'permissions' | 'requests' | 'audit' | 'transactions' = 'records';
  tabs = [
    { id: 'records', label: 'Records' },
    { id: 'measurements', label: 'Measurements' },
    { id: 'referrals', label: 'Referrals' },
    { id: 'permissions', label: 'Permissions' },
    { id: 'requests', label: 'Requests' },
    { id: 'audit', label: 'Audit Trail' },
    { id: 'transactions', label: 'Blockchain Transactions' },
  ] as const;

  data: PatientData | null = null;
  requests: AccessRequest[] = [];
  transactions: BlockchainEvent[] = [];
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

  setTab(id: 'records' | 'measurements' | 'referrals' | 'permissions' | 'requests' | 'audit' | 'transactions') {
    this.tab = id;
    if (id === 'transactions') {
      void this.loadTransactions();
    }
    this.syncView();
  }

  /** Record the tx of an on-chain action and surface it in the banner. */
  private showLastTx(label: string, tx_hash?: string) {
    const h = (tx_hash || '').trim();
    if (!h) return;
    this.lastTx = { label, tx_hash: h, pending: this.isPendingTx(h) };
    // Keep the on-chain log fresh right after a real transaction.
    void this.loadTransactions();
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

  /** Load blockchain transaction history for this patient. */
  private  async loadTransactions() {
    if (!this.data?.health_id) return;
    try {
      const res = await this.api.patientBlockchainHistory(this.data.health_id);
      this.transactions = res.events;
      // A PENDING grant just mined? Update the banner to show the live link.
      if (this.lastTx?.pending && this.transactions.some((t) => t.transaction_hash === this.lastTx!.tx_hash)) {
        this.lastTx.pending = false;
      }
    } catch (e: any) {
      console.error('Failed to load transactions:', e);
      this.transactions = [];
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
      // Keep the Etherscan log live while the patient watches it.
      if (this.tab === 'transactions') void this.loadTransactions();
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

  roleBadge(role?: string): string {
    switch ((role || '').toLowerCase()) {
      case 'patient':  return 'bg-primary-100 text-primary-900';
      case 'doctor':   return 'bg-accent-100 text-accent-900';
      case 'facility': return 'bg-primary-200 text-primary-900';
      default:         return 'bg-gray-100 text-ink';
    }
  }

  actionBadge(action?: string): string {
    switch ((action || '').toLowerCase()) {
      case 'view':               return 'bg-accent-100 text-accent-900';
      case 'break_glass':        return 'bg-red-100 text-red-900';
      case 'granted_to_doctor':  return 'bg-accent-200 text-accent-900';
      case 'record_added':       return 'bg-primary-100 text-primary-900';
      case 'patient_registered': return 'bg-primary-200 text-primary-900';
      case 'revoked_doctor':     return 'bg-gray-200 text-ink';
      default:                   return 'bg-gray-100 text-ink';
    }
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
