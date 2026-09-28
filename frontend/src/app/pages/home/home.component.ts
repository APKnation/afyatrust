import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <div class="flex flex-wrap items-center justify-center gap-12 py-10">
      <div class="min-w-80 flex-1">
        <h1 class="mb-4 text-3xl leading-tight font-bold">Digital Health Records</h1>
        <p class="mb-6 text-base leading-relaxed text-gray-600">
          AfyaTrust lets patients own and control their medical records
          digitally. Doctors get instant access to their patients' records —
          with the patient's consent, secured on-chain.
        </p>
        <div class="flex flex-wrap gap-3">
          <a routerLink="/register" class="inline-block rounded-xl bg-blue-800 px-6 py-3 font-semibold text-white no-underline transition-opacity hover:opacity-90">Register</a>
          <a routerLink="/patient" class="inline-block rounded-xl border-2 border-blue-800 bg-transparent px-6 py-3 font-semibold text-blue-800 no-underline transition-colors hover:bg-blue-800/8">Patient</a>
        </div>
      </div>
      <div class="min-w-64 flex-1 text-center">
        <div class="mx-auto h-55 w-55 animate-pulse text-blue-800">
          <svg viewBox="0 0 200 200" fill="none" class="h-full w-full">
            <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="6" />
            <circle cx="100" cy="100" r="62" stroke="currentColor" strokeWidth="4" />
            <circle cx="100" cy="100" r="34" fill="currentColor" opacity="0.25" />
            <path d="M100 44 L100 72 L124 96" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
            <path d="M100 156 L100 128 L76 104" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>

    <section class="mt-12 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-6">
      <div class="rounded-2xl border border-gray-200 bg-slate-50 p-6">
        <h2 class="mb-3 text-lg font-bold">🔐 Digital Records</h2>
        <p class="mb-3 text-gray-600">Every medical record is stored digitally, and only the right person can access it.</p>
        <ul class="list-disc pl-5 [&_li]:mb-1.5">
          <li>Data secured on the blockchain</li>
          <li>Permissions with expiry dates</li>
          <li>Every access is logged</li>
        </ul>
      </div>

      <div class="rounded-2xl border border-gray-200 bg-slate-50 p-6">
        <h2 class="mb-3 text-lg font-bold">👨‍⚕️ For Doctors</h2>
        <p class="mb-3 text-gray-600">Doctors access patient records instantly with the patient's consent.</p>
        <ul class="list-disc pl-5 [&_li]:mb-1.5">
          <li>Request access from patients</li>
          <li>Emergency break-glass access</li>
          <li>Tamper-proof audit log</li>
        </ul>
      </div>

      <div class="rounded-2xl border border-gray-200 bg-slate-50 p-6">
        <h2 class="mb-3 text-lg font-bold">📱 For Patients</h2>
        <p class="mb-3 text-gray-600">As a patient you can register, view your records, and manage who can see them.</p>
        <ul class="list-disc pl-5 [&_li]:mb-1.5">
          <li>Register with name & wallet</li>
          <li>Full digital history</li>
          <li>All your records in one place</li>
        </ul>
      </div>
    </section>
  `,
})
export class HomeComponent {}
