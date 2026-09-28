import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-register',
  imports: [FormsModule],
  template: `
    <div class="register">
      <div class="card">
        <h1>Register</h1>
        <p>Fill in your details to register with AfyaTrust and manage your health records.</p>

        <form (ngSubmit)="register()" #form="ngForm" class="form">
          <label class="field">
            <span>Full Name</span>
            <input type="text" name="full_name" [(ngModel)]="model.full_name" required />
          </label>

          <label class="field">
            <span>Health ID</span>
            <input type="text" name="health_id" [(ngModel)]="model.health_id" required />
          </label>

          <label class="field">
            <span>Wallet Address (0x...)</span>
            <input type="text" name="wallet_address" [(ngModel)]="model.wallet_address" required />
          </label>

          <label class="field">
            <span>Phone (optional)</span>
            <input type="text" name="phone" [(ngModel)]="model.phone" />
          </label>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Register</button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .register {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100%;
      padding: 24px;
    }

    .card {
      width: 100%;
      max-width: 440px;
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      padding: 32px;
    }

    .card h1 {
      margin: 0 0 8px;
      font-size: 26px;
    }

    .card p {
      margin: 0 0 24px;
      color: #4b5563;
    }

    .form {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .field span {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
    }

    .field input {
      padding: 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 15px;
      box-sizing: border-box;
    }

    .field input:focus {
      outline: 2px solid #1e40af;
      border-color: transparent;
    }

    .form-actions {
      margin-top: 8px;
    }

    .btn {
      padding: 14px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: opacity 0.2s;
      width: 100%;
    }

    .btn-primary {
      background: #1e40af;
      color: white;
    }

    .btn-primary:hover {
      background: #1d4ed8;
    }
  `],
})
export class RegisterComponent {
  model = {
    full_name: '',
    health_id: '',
    wallet_address: '',
    phone: '',
  };

  constructor(private router: Router) {}

  register() {
    // Submit to the backend; the form posts to /api/register on the API.
    // (Olunyongo: this model is bound to the form and posts directly to the API endpoint.)
    console.log('Registering:', this.model);
    this.router.navigate(['/']);
  }
}
