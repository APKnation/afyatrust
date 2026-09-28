import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <div class="hero">
      <div class="hero-copy">
        <h1>Digital Health Records</h1>
        <p>
          AfyaTrust lets patients own and control their medical records
          digitally. Doctors get instant access to their patients' records —
          with the patient's consent, secured on-chain.
        </p>
        <div class="hero-buttons">
          <a routerLink="/register" class="btn btn-primary">Register</a>
          <a routerLink="/patient" class="btn btn-ghost">Patient</a>
        </div>
      </div>
      <div class="hero-visual">
        <div class="shield">
          <svg viewBox="0 0 200 200" fill="none">
            <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="6" />
            <circle cx="100" cy="100" r="62" stroke="currentColor" strokeWidth="4" />
            <circle cx="100" cy="100" r="34" fill="currentColor" opacity="0.25" />
            <path d="M100 44 L100 72 L124 96" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
            <path d="M100 156 L100 128 L76 104" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>

    <section class="features">
      <div class="card">
        <h2>🔐 Digital Records</h2>
        <p>Every medical record is stored digitally, and only the right person can access it.</p>
        <ul>
          <li>Data secured on the blockchain</li>
          <li>Permissions with expiry dates</li>
          <li>Every access is logged</li>
        </ul>
      </div>

      <div class="card">
        <h2>👨‍⚕️ For Doctors</h2>
        <p>Doctors access patient records instantly with the patient's consent.</p>
        <ul>
          <li>Request access from patients</li>
          <li>Emergency break-glass access</li>
          <li>Tamper-proof audit log</li>
        </ul>
      </div>

      <div class="card">
        <h2>📱 For Patients</h2>
        <p>As a patient you can register, view your records, and manage who can see them.</p>
        <ul>
          <li>Register with name & wallet</li>
          <li>Full digital history</li>
          <li>All your records in one place</li>
        </ul>
      </div>
    </section>
  `,
  styles: [`
    .hero {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 48px;
      padding: 40px 0;
      flex-wrap: wrap;
    }

    .hero-copy {
      flex: 1 1 320px;
    }

    .hero h1 {
      font-size: 32px;
      line-height: 1.2;
      margin: 0 0 16px;
    }

    .hero p {
      font-size: 16px;
      color: #4b5563;
      line-height: 1.6;
      margin: 0 0 24px;
    }

    .hero-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .btn {
      display: inline-block;
      padding: 12px 24px;
      border-radius: 10px;
      font-weight: 600;
      text-decoration: none;
      border: none;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .btn-primary {
      background: #1e40af;
      color: white;
    }

    .btn-primary:hover {
      background: #1d4ed8;
    }

    .btn-ghost {
      background: transparent;
      color: #1e40af;
      border: 2px solid #1e40af;
    }

    .btn-ghost:hover {
      background: rgba(30, 64, 175, 0.08);
    }

    .hero-visual {
      flex: 1 1 260px;
      text-align: center;
    }

    .shield {
      width: 220px;
      height: 220px;
      margin: 0 auto;
      color: #1e40af;
      animation: pulse 2.4s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 0.9; }
      50% { transform: scale(1.05); opacity: 1; }
    }

    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 24px;
      margin-top: 48px;
    }

    .card {
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      padding: 24px;
    }

    .card h2 {
      margin: 0 0 12px;
      font-size: 18px;
    }

    .card p {
      margin: 0 0 12px;
      color: #4b5563;
    }

    .card ul {
      margin: 0;
      padding-left: 20px;
    }

    .card li {
      margin-bottom: 6px;
    }
  `],
})
export class HomeComponent {}
