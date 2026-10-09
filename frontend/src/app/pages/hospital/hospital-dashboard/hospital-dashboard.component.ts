import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { NgIf, NgFor, DatePipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ApiService, FacilityRecord, ReferralItem, ReferralIntegrityReport, BlockchainEvent,
} from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';

/**
 * Hospital workspace: referral desk + staff record entry.
 * Clean typographic design matching the landing page — no decorative glyphs.
 * Staff of the receiving hospital see incoming referrals and accept or
 * decline them. The Add Record form writes the SHA-256 hash of clinical
 * data to Sepolia (real addRecord transaction) and lists each record's
 * on-chain status with an Etherscan link.
 */
@Component({
  selector: 'app-hospital-dashboard',
  imports: [NgIf, NgFor, DatePipe, SlicePipe, FormsModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30">
      <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <!-- Hero header -->
        <div class="bg-white rounded-2xl shadow-lg border border-slate-200 mb-6 overflow-hidden">
          <div class="bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4">
            <h1 class="text-2xl font-bold text-white sm:text-3xl">Hospital Dashboard</h1>
            <p class="text-primary-100 mt-1">{{ hospitalName || 'Hospital' }} • {{ auth.fullName }}</p>
          </div>
          <div class="p-6">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p class="text-sm text-slate-600">Facility Code: <span class="font-semibold text-slate-900">{{ auth.hospitalCode }}</span></p>
              </div>
              <div class="px-4 py-2 bg-amber-100 text-amber-700 rounded-full text-sm font-semibold">
                {{ pendingIncomingCount }} Pending Incoming Referrals
              </div>
            </div>
          </div>
        </div>

      <!-- Tabs -->
      <div class="mb-6 flex flex-wrap gap-1 border-b border-gray-200">
        <button (click)="setTab('incoming')"
                class="cursor-pointer border-none bg-transparent px-4 py-3 text-[15px] transition-colors"
                [class]="tab === 'incoming' ? 'font-bold text-primary-500 border-b-4 border-primary-500 -mb-[2px]' : 'text-muted hover:text-ink'">
          Incoming Referrals
          <span *ngIf="pendingIncomingCount > 0"
                class="ml-1.5 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{{ pendingIncomingCount }}</span>
        </button>
        <button (click)="setTab('outgoing'); loadOutgoing()"
                class="cursor-pointer border-none bg-transparent px-4 py-3 text-[15px] transition-colors"
                [class]="tab === 'outgoing' ? 'font-bold text-primary-500 border-b-4 border-primary-500 -mb-[2px]' : 'text-muted hover:text-ink'">
          Outgoing Referrals
        </button>
        <button (click)="setTab('exchange'); loadExchangeRecords()"
                class="cursor-pointer border-none bg-transparent px-4 py-3 text-[15px] transition-colors"
                [class]="tab === 'exchange' ? 'font-bold text-primary-500 border-b-4 border-primary-500 -mb-[2px]' : 'text-muted hover:text-ink'">
          Data Exchange
        </button>
        <button (click)="setTab('records'); loadFacilityRecords()"
                class="cursor-pointer border-none bg-transparent px-4 py-3 text-[15px] transition-colors"
                [class]="tab === 'records' ? 'font-bold text-primary-500 border-b-4 border-primary-500 -mb-[2px]' : 'text-muted hover:text-ink'">
          Add Record
        </button>
        <button (click)="setTab('blockchain'); loadBlockchainLogs()"
                class="cursor-pointer border-none bg-transparent px-4 py-3 text-[15px] transition-colors"
                [class]="tab === 'blockchain' ? 'font-bold text-primary-500 border-b-4 border-primary-500 -mb-[2px]' : 'text-muted hover:text-ink'">
          Blockchain Logs
        </button>
      </div>

      <!-- LAST ON-CHAIN ACTION — Etherscan-verifiable -->
      <div *ngIf="lastTx" class="card mb-6 border-l-4 p-5"
           [class]="lastTx.pending ? 'border-l-orange-500' : 'border-l-accent-500'">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="m-0 text-sm font-bold text-ink">{{ lastTx.label }}</h2>
            <p class="m-0 text-xs text-muted">
              {{ lastTx.pending
                ? 'Transaction submitted — the record hash will appear in your Blockchain Logs shortly.'
                : 'Written to Sepolia — verify it on Etherscan.' }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <code class="rounded bg-gray-100 px-2 py-1 font-mono text-xs">{{ lastTx.tx_hash | slice:0:20 }}…</code>
            <a *ngIf="!lastTx.tx_hash.startsWith('PENDING')"
               [href]="'https://sepolia.etherscan.io/tx/' + lastTx.tx_hash" target="_blank" rel="noopener"
               class="btn-secondary text-sm">
              View on Etherscan
            </a>
            <button (click)="lastTx = null" aria-label="Dismiss"
                    class="cursor-pointer border-none bg-transparent text-lg leading-none text-muted hover:text-ink">×</button>
          </div>
        </div>
      </div>

      <!-- ================= INCOMING REFERRALS ================= -->
      <div *ngIf="tab === 'incoming'" class="animate-fade-in">
        <div class="mb-4">
          <h2 class="mb-1 text-xl font-bold">Referrals to this hospital</h2>
          <p class="m-0 text-sm text-muted">
            Patients referred from another hospital — accept or decline each one.
            Every response is audited on-chain.
          </p>
        </div>
        <!-- Filters -->
        <div class="mb-5 flex flex-wrap gap-2">
          <button *ngFor="let f of filters" (click)="setFilter(f.value)"
                  class="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                  [class]="filter === f.value ? 'bg-ink text-white' : 'bg-primary-100 text-ink hover:bg-primary-200'">
            {{ f.label }}
            <span *ngIf="f.value === 'PENDING' && pendingIncomingCount > 0"
                  class="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] text-white">{{ pendingIncomingCount }}</span>
          </button>
        </div>

        <!-- Referral list -->
        <div *ngFor="let r of incomingReferrals" class="card mb-4 p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="m-0 text-lg font-bold text-ink">
                {{ r.patient_name }}
                <span class="text-sm font-normal text-muted">({{ r.patient_health_id }})</span>
              </p>
              <p class="m-0 mt-1 text-sm text-muted">
                From: <strong>{{ r.from_hospital || 'Unknown facility' }}</strong>
                <span *ngIf="r.from_doctor" class="ml-1">· Dr. {{ r.from_doctor }}</span>
              </p>
              <p *ngIf="r.reason" class="mb-0 mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm italic text-ink">
                {{ r.reason }}
              </p>
              <p class="m-0 mt-2 text-xs text-muted">Sent {{ r.created_at | date:'medium' }}</p>
              <p *ngIf="r.responded_by" class="m-0 text-xs text-muted">
                Responded by {{ r.responded_by }} {{ r.responded_at ? ('· ' + (r.responded_at | date:'short')) : '' }}
              </p>
            </div>
            <div class="flex flex-col items-end gap-2.5">
              <span class="rounded-full px-3 py-1 text-xs font-bold" [class]="badge(r.status)">{{ r.status }}</span>
              <div *ngIf="r.status === 'PENDING'" class="flex gap-2">
                <button (click)="respond(r, 'ACCEPTED')" [disabled]="busyId === r.id"
                        class="btn-primary">
                  Accept
                </button>
                <button (click)="respond(r, 'DECLINED')" [disabled]="busyId === r.id"
                        class="cursor-pointer rounded-lg border-2 border-red-500 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500 hover:text-white disabled:opacity-50">
                  Decline
                </button>
              </div>
              <button *ngIf="r.status === 'ACCEPTED'"
                      (click)="verifyReferralRecords(r)"
                      [disabled]="verifyingReferralId === r.id"
                      class="btn-secondary">
                {{ verifyingReferralId === r.id ? 'Checking blockchain…' : 'Verify & receive records' }}
              </button>
            </div>
          </div>
          <div *ngIf="integrityReports[r.id] as report"
               class="mt-4 rounded-xl border p-4"
               [class]="report.mismatch_count ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50'">
            <p class="m-0 font-semibold">
              {{ report.verified_count }} verified record(s), {{ report.mismatch_count }} integrity issue(s)
            </p>
            <p class="mb-3 mt-1 text-xs text-muted">
              Blockchain transfer anchor:
              {{ report.referral_anchored_on_chain ? 'confirmed' : 'not confirmed' }}
              <a *ngIf="report.referral_tx_hash"
                 [href]="'https://sepolia.etherscan.io/tx/' + report.referral_tx_hash"
                 target="_blank" rel="noopener" class="ml-1 underline">View referral transaction</a>
            </p>
            <div *ngFor="let checkedRecord of report.records" class="mb-3 rounded-lg bg-white p-3 last:mb-0">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <strong>{{ checkedRecord.record_type }}</strong>
                <span class="rounded-full px-2 py-1 text-xs font-bold"
                      [class]="checkedRecord.verified ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'">
                  {{ checkedRecord.status }}
                </span>
              </div>
              <p class="mb-1 mt-2 break-all font-mono text-xs">
                Anchored: {{ checkedRecord.record_hash }}
              </p>
              <p class="m-0 break-all font-mono text-xs">
                Recomputed: {{ checkedRecord.computed_hash }}
              </p>
              <p class="mb-0 mt-2 text-xs">
                Payload matches: {{ checkedRecord.payload_matches_hash ? 'Yes' : 'No' }} ·
                Hash found on chain: {{ checkedRecord.anchored_on_chain ? 'Yes' : 'No' }}
              </p>
              <div *ngIf="checkedRecord.verified && checkedRecord.record_data" class="mt-2 border-t pt-2">
                <p class="mb-1 text-xs font-semibold">Verified clinical data received by this hospital</p>
                <p *ngFor="let field of entries(checkedRecord.record_data)"
                   class="m-0 text-xs">
                  <strong>{{ field.key }}:</strong> {{ field.value }}
                </p>
              </div>
              <p *ngIf="!checkedRecord.verified" class="mb-0 mt-2 text-xs font-semibold text-red-700">
                Payload withheld because it does not match the immutable record anchor.
              </p>
              <a *ngIf="checkedRecord.etherscan_url" [href]="checkedRecord.etherscan_url"
                 target="_blank" rel="noopener" class="mt-2 inline-block text-xs text-accent-700 underline">
                View record transaction
              </a>
            </div>
            <p *ngIf="report.records.length === 0" class="mb-0 mt-2 text-sm">
              No pre-referral records from the sending hospital were found.
            </p>
          </div>
        </div>

        <div *ngIf="incomingReferrals.length === 0 && !loading" class="card p-10 text-center">
          <h3 class="mb-1 text-lg font-bold">
            {{ filter === 'PENDING' ? 'All caught up' : 'Nothing here yet' }}
          </h3>
          <p class="m-0 text-muted">
            {{ filter === 'PENDING' ? 'No pending referrals right now.' : 'No referrals match this filter.' }}
          </p>
        </div>
      </div>

      <!-- ================= OUTGOING REFERRALS ================= -->
      <div *ngIf="tab === 'outgoing'" class="animate-fade-in">
        <div class="mb-4">
          <h2 class="mb-1 text-xl font-bold">Referrals from this hospital</h2>
          <p class="m-0 text-sm text-muted">
            Patients this hospital has referred to another facility.
            Track whether the receiving hospital accepted or declined.
          </p>
        </div>
        <!-- Filters -->
        <div class="mb-5 flex flex-wrap gap-2">
          <button *ngFor="let f of filters" (click)="setOutgoingFilter(f.value)"
                  class="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                  [class]="outgoingFilter === f.value ? 'bg-ink text-white' : 'bg-primary-100 text-ink hover:bg-primary-200'">
            {{ f.label }}
          </button>
        </div>

        <div *ngFor="let r of outgoingReferrals" class="card mb-4 p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="m-0 text-lg font-bold text-ink">
                {{ r.patient_name }}
                <span class="text-sm font-normal text-muted">({{ r.patient_health_id }})</span>
              </p>
              <p class="m-0 mt-1 text-sm text-muted">
                To: <strong>{{ r.to_hospital }}</strong>
                <span *ngIf="r.to_hospital_code" class="ml-1">({{ r.to_hospital_code }})</span>
              </p>
              <p *ngIf="r.reason" class="mb-0 mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm italic text-ink">
                {{ r.reason }}
              </p>
              <p class="m-0 mt-2 text-xs text-muted">Sent {{ r.created_at | date:'medium' }}</p>
              <p *ngIf="r.responded_by" class="m-0 text-xs text-muted">
                Responded by {{ r.responded_by }} {{ r.responded_at ? ('· ' + (r.responded_at | date:'short')) : '' }}
              </p>
            </div>
            <span class="rounded-full px-3 py-1 text-xs font-bold" [class]="badge(r.status)">{{ r.status }}</span>
          </div>
        </div>

        <div *ngIf="outgoingReferrals.length === 0 && !loading" class="card p-10 text-center">
          <h3 class="mb-1 text-lg font-bold">No outgoing referrals yet</h3>
          <p class="m-0 text-muted">
            When this hospital refers a patient to another facility, it appears here.
          </p>
        </div>
      </div>

      <!-- ================= DATA EXCHANGE ================= -->
      <div *ngIf="tab === 'exchange'" class="animate-fade-in">
        <div class="mb-4">
          <h2 class="mb-1 text-xl font-bold">Data Exchange — {{ hospitalName }}</h2>
          <p class="m-0 text-sm text-muted">
            Every record added by this hospital is anchored on Sepolia as a hash.
            The receiving hospital can verify the payload against the on-chain
            anchor after accepting a referral. Unverified data is never released.
          </p>
        </div>

        <div *ngIf="exchangeRecords.length" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div *ngFor="let r of exchangeRecords" class="card p-5">
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <span class="font-bold text-ink">{{ r.patient_name }}</span>
              <span class="text-xs text-muted">({{ r.health_id }})</span>
              <span class="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-bold text-primary-900">{{ r.record_type }}</span>
              <span *ngIf="r.verified" class="btn-primary">On-chain</span>
              <span *ngIf="!r.verified" class="rounded-full bg-primary-200 px-2.5 py-0.5 text-xs font-semibold text-primary-900">Pending</span>
            </div>

            <div class="mb-2 text-xs text-muted font-mono break-all">
              record hash:
              <span class="text-ink">{{ r.record_hash | slice:0:26 }}…</span>
            </div>

            <div class="mb-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono break-all">
              <p class="text-slate-500 mb-1">Exchange endpoint (another hospital fetches this)</p>
              <a [href]="r.metadata_uri" target="_blank" rel="noopener"
                 class="text-accent-700 hover:underline">{{ r.metadata_uri }}</a>
            </div>

            <div class="flex flex-wrap items-center gap-3 text-xs">
              <span class="text-muted">{{ r.created_at | date:'medium' }}</span>
              <a *ngIf="r.verified"
                 [href]="'https://sepolia.etherscan.io/tx/' + r.tx_hash"
                 target="_blank" rel="noopener"
                 class="font-mono text-accent-700 underline">
                tx {{ r.tx_hash | slice:0:14 }}…
              </a>
            </div>
          </div>
        </div>

        <div *ngIf="exchangeRecords.length === 0 && !loading" class="card p-10 text-center">
          <h3 class="mb-1 text-lg font-bold">No records exchanged yet</h3>
          <p class="m-0 text-muted">
            When this hospital adds a record, its on-chain hash and exchange
            endpoint appear here. Another hospital can fetch the exchange URL to
            verify the record without accessing the clinical data directly.
          </p>
        </div>
      </div>

      <!-- ================= ADD RECORD ================= -->
      <div *ngIf="tab === 'records'" class="animate-fade-in">
        <div class="card mb-6 p-6">
          <h2 class="mb-1 text-xl font-bold">Add Medical Record</h2>
          <p class="m-0 text-sm text-muted">
            Clinical data stays off-chain. A SHA-256 hash of the content is written to
            Sepolia, so patients and doctors can verify it on Etherscan.
          </p>
        </div>

        <div class="card mb-5 p-6">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Patient Health ID</span>
              <input [(ngModel)]="form.health_id" placeholder="e.g. 1234"
                     class="px-3 py-2.5 text-sm" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Record type</span>
              <select [(ngModel)]="form.record_type"
                      class="px-3 py-2.5 text-sm">
                <option *ngFor="let t of recordTypes" [value]="t">{{ t }}</option>
              </select>
            </label>
            <div class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-ink">Recording facility (from your staff account)</span>
              <span class="rounded-lg border border-gray-200 bg-slate-50 px-3 py-2.5 text-sm">{{ hospitalName }}</span>
            </div>
          </div>

          <!-- key/value rows -->
          <div class="mt-4">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-[13px] font-semibold text-ink">Clinical data (field — value)</span>
              <button (click)="addRow()" type="button"
                      class="btn-secondary">
                Add field
              </button>
            </div>
            <div *ngFor="let row of rows; let i = index" class="mb-2 flex flex-wrap gap-2">
              <input [(ngModel)]="row.key" [placeholder]="'field, e.g. ' + keyHints[i % keyHints.length]"
                     class="min-w-40 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input [(ngModel)]="row.value" placeholder="value"
                     class="min-w-40 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <button *ngIf="rows.length > 1" (click)="removeRow(i)" type="button" aria-label="Remove field"
                      class="cursor-pointer rounded-lg border border-gray-300 px-3.5 text-sm font-semibold text-red-600 transition-colors hover:border-red-500">
                ×
              </button>
            </div>
          </div>

          <button (click)="submitRecord()" [disabled]="busy || !form.health_id"
                  class="btn-primary">
            {{ busy ? 'Writing to Sepolia — this can take about 30 seconds…' : 'Add record to blockchain' }}
          </button>
          <p *ngIf="formMsg" class="mb-0 mt-2 text-sm" [class]="formOk ? 'text-accent-700' : 'text-red-600'">{{ formMsg }}</p>
        </div>

        <!-- Success box with Etherscan link -->
        <div *ngIf="lastResult" class="card mb-5 border-l-4 border-accent-500 p-6">
          <h3 class="mb-2 text-lg font-bold text-accent-900">Record written to Sepolia</h3>
          <div class="flex flex-col gap-1.5 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-ink">Record hash:</span>
              <code class="rounded bg-gray-50 px-2 py-1 font-mono text-xs">{{ lastResult.hash }}</code>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-ink">Transaction:</span>
              <a *ngIf="!lastResult.tx_hash.startsWith('PENDING')"
                 [href]="'https://sepolia.etherscan.io/tx/' + lastResult.tx_hash"
                 target="_blank" rel="noopener"
                 class="rounded bg-gray-50 px-2 py-1 font-mono text-xs text-accent-700 underline">
                {{ lastResult.tx_hash | slice:0:26 }}… view on Etherscan
              </a>
              <code *ngIf="lastResult.tx_hash.startsWith('PENDING')"
                    class="rounded bg-gray-50 px-2 py-1 font-mono text-xs text-red-600">
                {{ lastResult.tx_hash }}
              </code>
            </div>
            <p class="m-0 text-xs text-muted">
              Verify it: Etherscan — contract — Read Contract — getRecords — enter the patient's Health ID.
            </p>
          </div>
        </div>

        <!-- Recent facility records -->
        <div class="card p-6">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 class="m-0 text-lg font-bold">Recent records — {{ hospitalName || 'my hospital' }}</h3>
            <button (click)="loadFacilityRecords()" [disabled]="loadingRecords"
                    class="btn-secondary">
              Refresh
            </button>
          </div>
          <div *ngFor="let r of facilityRecords" class="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div class="mb-2 flex flex-wrap items-center gap-3">
              <span class="font-bold text-ink">{{ r.patient_name }}</span>
              <span class="text-xs text-muted">({{ r.health_id }})</span>
              <span class="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-bold text-primary-900">{{ r.record_type }}</span>
              <span *ngIf="r.verified" class="btn-primary">On-chain</span>
              <span *ngIf="!r.verified" class="rounded-full bg-primary-200 px-2.5 py-0.5 text-xs font-semibold text-primary-900">Pending</span>
              <span class="ml-auto text-xs text-muted">{{ r.created_at | date:'medium' }}</span>
            </div>
            <div class="mb-2 flex flex-wrap gap-3 text-xs text-muted">
              <span *ngFor="let kv of entries(r.record_data)">
                <strong class="text-ink">{{ kv.key }}:</strong> {{ kv.value }}
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <code class="rounded px-1.5 py-0.5 font-mono text-muted">hash: {{ r.record_hash | slice:0:26 }}…</code>
              <a *ngIf="r.verified"
                 [href]="'https://sepolia.etherscan.io/tx/' + r.tx_hash"
                 target="_blank" rel="noopener"
                 class="font-mono text-accent-700 underline">tx {{ r.tx_hash | slice:0:14 }}…</a>
            </div>
          </div>
          <p *ngIf="facilityRecords.length === 0 && !loadingRecords" class="py-6 text-center text-muted italic">
            No records added by your hospital yet.
          </p>
        </div>
      </div>

      <!-- ================= BLOCKCHAIN LOGS ================= -->
      <div *ngIf="tab === 'blockchain'" class="animate-fade-in">
        <h2 class="mb-1 text-xl font-bold">On-Chain Event Log</h2>
        <p class="mb-4 text-sm text-muted">
          Every transaction your hospital has written to Sepolia — record additions,
          break-glass emergency access and more. Each row links to Etherscan for
          independent verification.
        </p>

        <!-- Activity summary -->
        <div *ngIf="chainSummary.total_transactions > 0" class="mb-5 flex flex-wrap gap-3">
          <div *ngFor="let s of summaryItems()" class="card min-w-40 flex-1 p-4">
            <p class="m-0 text-2xl font-bold text-ink">{{ s.count }}</p>
            <p class="m-0 text-xs font-semibold uppercase tracking-wide text-muted">{{ s.label }}</p>
          </div>
        </div>

        <!-- Filters -->
        <div class="card mb-5 p-5">
          <div class="flex flex-wrap gap-3">
            <select [(ngModel)]="txFilterEvent" (ngModelChange)="applyTxFilter()"
                    class="px-3 py-2.5 text-sm">
              <option value="">All Event Types</option>
              <option value="RecordAdded">Record Added</option>
              <option value="BreakGlassUsed">Break-Glass Used</option>
              <option value="AccessGranted">Access Granted</option>
              <option value="AccessRevoked">Access Revoked</option>
              <option value="RecordViewed">Record Viewed</option>
              <option value="PatientRegistered">Patient Registered</option>
            </select>
            <input [(ngModel)]="txFilterHealthId" (ngModelChange)="applyTxFilter()"
                   placeholder="Filter by Health ID (optional)"
                   class="min-w-50 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <button (click)="loadBlockchainLogs()" [disabled]="loadingChain"
                    class="btn-secondary">
              {{ loadingChain ? 'Loading…' : 'Refresh' }}
            </button>
          </div>
        </div>

        <div *ngIf="filteredChainEvents.length" class="space-y-3">
          <div *ngFor="let tx of filteredChainEvents" class="bg-white rounded-2xl shadow-lg border border-slate-200 p-5 hover:shadow-xl transition-shadow">
            <div class="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div class="flex flex-wrap items-center gap-3">
                <span class="rounded-full px-3 py-1 text-xs font-bold" [class]="chainEventBadge(tx.event)">{{ formatEventName(tx.event) }}</span>
                <span class="text-sm text-slate-500">{{ tx.timestamp ? (tx.timestamp * 1000 | date:'medium') : '—' }}</span>
              </div>
              <a [href]="tx.etherscan_url" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
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
          <div *ngIf="filteredChainEvents.length === 0 && chainEvents.length > 0" class="p-10 text-center">
            <h3 class="mb-1 text-lg font-bold">No events match your filters</h3>
            <p class="m-0 text-muted">Try adjusting the filters above.</p>
          </div>
          <div *ngIf="chainEvents.length === 0 && !loadingChain" class="p-10 text-center">
            <h3 class="mb-1 text-lg font-bold">No blockchain events yet</h3>
            <p class="m-0 text-muted">Events appear here as records are added or emergency access is used.</p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class HospitalDashboardComponent implements OnInit {
  tab: 'incoming' | 'outgoing' | 'exchange' | 'records' | 'blockchain' = 'incoming';

  // --- incoming / outgoing referral filters ---
  filter = 'PENDING';
  filters = [
    { label: 'Pending', value: 'PENDING' },
    { label: 'Accepted', value: 'ACCEPTED' },
    { label: 'Declined', value: 'DECLINED' },
    { label: 'All', value: '' },
  ] as const;

  // --- incoming referrals (referrals TO this hospital) ---
  incomingReferrals: ReferralItem[] = [];
  // --- outgoing referrals (referrals FROM this hospital to another) ---
  outgoingReferrals: ReferralItem[] = [];
  integrityReports: Record<number, ReferralIntegrityReport> = {};
  verifyingReferralId: number | null = null;
  // --- records this hospital has anchored on-chain (exchange pointers) ---
  exchangeRecords: any[] = [];

  loading = false;
  busyId: number | null = null;

  // --- Add record form ---
  recordTypes = ['DIAGNOSIS', 'LAB', 'PRESCRIPTION', 'MEDICATION', 'SURGERY', 'IMMUNIZATION', 'GENERAL'];
  keyHints = ['temperature', 'diagnosis', 'disease', 'medicine', 'medication', 'result', 'notes'];
  rows: { key: string; value: string }[] = [{ key: '', value: '' }, { key: '', value: '' }];
  form = { health_id: '', record_type: 'DIAGNOSIS' };
  busy = false;
  formMsg = '';
  formOk = false;
  lastResult: { hash: string; tx_hash: string } | null = null;

  facilityRecords: FacilityRecord[] = [];
  loadingRecords = false;

  // --- Blockchain logs (Etherscan-verified) ---
  chainEvents: BlockchainEvent[] = [];
  filteredChainEvents: BlockchainEvent[] = [];
  loadingChain = false;
  chainSummary: { summary: Record<string, number>; total_transactions: number } = { summary: {}, total_transactions: 0 };
  txFilterEvent = '';
  txFilterHealthId = '';

  /** Most recent on-chain action (add record), surfaced as a banner
   * with a direct Etherscan link. */
  lastTx: { label: string; tx_hash: string; pending: boolean } | null = null;

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  /** Angular 22 is zoneless by default — re-render after async mutations. */
  private syncView() {
    this.cdr.detectChanges();
  }

  setTab(t: 'incoming' | 'outgoing' | 'exchange' | 'records' | 'blockchain') {
    this.tab = t;
    this.syncView();
  }

  get hospitalName(): string {
    return this.auth.hospitalCode;
  }

  get pendingIncomingCount(): number {
    return this.incomingReferrals.filter((r) => r.status === 'PENDING').length;
  }

  /** Outgoing referral filter (separate from incoming). */
  outgoingFilter = 'PENDING';

  async ngOnInit() {
    if (!this.auth.isStaff) {
      this.router.navigate(['/login']);
      return;
    }
    await this.reload();
    void this.loadOutgoing();
    void this.loadExchangeRecords();
  }

  setFilter(value: string) {
    this.filter = value;
    void this.reload();
  }

  setOutgoingFilter(value: string) {
    this.outgoingFilter = value;
    void this.loadOutgoing();
  }

  /** Incoming referrals (to this hospital). */
  async reload() {
    this.loading = true;
    this.syncView();
    try {
      this.incomingReferrals = await this.api.hospitalReferrals(this.filter || undefined);
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed to load referrals'));
    } finally {
      this.loading = false;
      this.syncView();
    }
  }

  /** Outgoing referrals (from this hospital to another). */
  async loadOutgoing() {
    try {
      this.outgoingReferrals = await this.api.hospitalOutgoingReferrals(this.outgoingFilter || undefined);
    } catch {
      this.outgoingReferrals = [];
    }
    this.syncView();
  }

  /** Records this hospital has anchored on-chain (exchange pointers). */
  async loadExchangeRecords() {
    try {
      this.exchangeRecords = await this.api.hospitalRecordsExchange();
    } catch {
      this.exchangeRecords = [];
    }
    this.syncView();
  }

  async respond(r: ReferralItem, action: 'ACCEPTED' | 'DECLINED') {
    this.busyId = r.id;
    this.syncView();
    try {
      await this.api.respondReferral(r.id, action);
      if (action === 'ACCEPTED') this.filter = 'ACCEPTED';
      await this.reload();
      void this.loadOutgoing();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed'));
    } finally {
      this.busyId = null;
      this.syncView();
    }

    async verifyReferralRecords(referral: ReferralItem) {
      this.verifyingReferralId = referral.id;
      this.syncView();
      try {
        this.integrityReports[referral.id] =
          await this.api.verifyReferralRecords(referral.id);
      } catch (e: any) {
        alert(e?.error?.error || e?.message || 'Could not verify referral records');
      } finally {
        this.verifyingReferralId = null;
        this.syncView();
      }
    }
  }

  // ---------- Add record ----------

  addRow() {
    this.rows.push({ key: '', value: '' });
    this.syncView();
  }

  removeRow(i: number) {
    this.rows.splice(i, 1);
    this.syncView();
  }

  async submitRecord() {
    this.formMsg = '';
    this.formOk = false;
    this.lastResult = null;

    const healthId = this.form.health_id.trim();
    if (!healthId) {
      this.formMsg = 'Patient Health ID is required.';
      this.syncView();
      return;
    }
    const data: Record<string, string> = {};
    for (const row of this.rows) {
      if (row.key.trim()) data[row.key.trim()] = row.value.trim();
    }
    if (Object.keys(data).length === 0) {
      this.formMsg = 'Add at least one data field (field + value).';
      this.syncView();
      return;
    }

    this.busy = true;
    this.syncView();
    try {
      const res = await this.api.addRecord({
        health_id: healthId,
        record_type: this.form.record_type,
        record_data: data,
      });
      this.formOk = true;
      this.formMsg = 'Record saved and hash written to Sepolia.';
      const h: string = res.tx_hash || '';
      this.lastTx = {
        label: `Record added for ${healthId}`,
        tx_hash: h,
        pending: h.startsWith('PENDING'),
      };
      this.rows = [{ key: '', value: '' }, { key: '', value: '' }];
      await this.loadFacilityRecords();
      // Reflect the new RecordAdded event in the Blockchain Logs tab.
      void this.loadBlockchainLogs();
    } catch (e: any) {
      this.formMsg = e?.error?.error || e?.message || 'Failed to add record';
    } finally {
      this.busy = false;
      this.syncView();
    }
  }

  async loadFacilityRecords() {
    this.loadingRecords = true;
    this.syncView();
    try {
      this.facilityRecords = await this.api.facilityRecords();
    } catch (e: any) {
      alert('Error: ' + (e?.error?.error || e?.message || 'Failed to load records'));
    } finally {
      this.loadingRecords = false;
      this.syncView();
    }
  }

  badge(status: string): string {
    switch (status) {
      case 'ACCEPTED':  return 'bg-accent-500 text-white';
      case 'DECLINED':  return 'bg-red-500 text-white';
      case 'CANCELLED': return 'bg-gray-200 text-ink';
      default:          return 'bg-primary-300 text-ink';
    }
  }

  // ---------- Blockchain logs ----------

  async loadBlockchainLogs() {
    this.loadingChain = true;
    this.syncView();
    try {
      const [eventsRes, summaryRes] = await Promise.all([
        this.api.blockchainEvents({ limit: 100 }),
        this.api.hospitalBlockchainSummary(),
      ]);
      this.chainEvents = eventsRes.events;
      this.chainSummary = { summary: summaryRes.summary, total_transactions: summaryRes.total_transactions };
      this.applyTxFilter();
      // A pending record just mined? Flip the banner to the live link.
      if (this.lastTx?.pending && this.chainEvents.some((t) => t.transaction_hash === this.lastTx!.tx_hash)) {
        this.lastTx.pending = false;
      }
    } catch (e: any) {
      console.error('Failed to load blockchain logs:', e);
      this.chainEvents = [];
      this.filteredChainEvents = [];
    } finally {
      this.loadingChain = false;
      this.syncView();
    }
  }

  applyTxFilter() {
    this.filteredChainEvents = this.chainEvents.filter((tx) => {
      const eventMatch = !this.txFilterEvent || tx.event === this.txFilterEvent;
      const args = (tx.args || {}) as Record<string, any>;
      const healthIdMatch = !this.txFilterHealthId ||
        [args['healthID'], args['healthId'], args['patientID']]
          .some((v: any) => typeof v === 'string' && v.toLowerCase().includes(this.txFilterHealthId.toLowerCase()));
      return eventMatch && healthIdMatch;
    });
  }

  summaryItems(): { label: string; count: number }[] {
    const labels: Record<string, string> = {
      patientregistered: 'Registered',
      recordadded: 'Records added',
      accessgranted: 'Access granted',
      accessrevoked: 'Access revoked',
      recordviewed: 'Record views',
      breakglassused: 'Break-glass',
      emergencyaccessgranted: 'Emergency access',
    };
    return Object.entries(this.chainSummary.summary || {})
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({ label: labels[key] || key, count }));
  }

  chainEventBadge(event?: string): string {
    switch ((event || '').toLowerCase()) {
      case 'patientregistered':      return 'bg-primary-100 text-primary-900';
      case 'recordadded':            return 'bg-accent-100 text-accent-900';
      case 'accessgranted':          return 'bg-accent-200 text-accent-900';
      case 'accessrevoked':          return 'bg-red-100 text-red-900';
      case 'recordviewed':           return 'bg-primary-200 text-primary-900';
      case 'breakglassused':         return 'bg-red-200 text-red-900';
      case 'emergencyaccessgranted': return 'bg-orange-100 text-orange-900';
      default:                       return 'bg-gray-100 text-ink';
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

  entries(data: Record<string, any>): { key: string; value: any }[] {
    if (!data) return [];
    return Object.entries(data).map(([key, value]) => ({ key, value }));
  }
}
