import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-register',
  imports: [FormsModule],
  template: `
    <div class="flex min-h-full items-center justify-center p-6">
      <div class="w-full max-w-[440px] rounded-2xl border border-gray-200 bg-slate-50 p-8">
        <h1 class="mb-2 text-2xl font-bold">Register</h1>
        <p class="mb-6 text-gray-600">Fill in your details to register with AfyaTrust and manage your health records.</p>

        <form (ngSubmit)="register()" #form="ngForm" class="flex flex-col gap-4.5">
          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-gray-700">Full Name</span>
            <input
              type="text"
              name="full_name"
              [(ngModel)]="model.full_name"
              required
              class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-blue-800"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-gray-700">Health ID</span>
            <input
              type="text"
              name="health_id"
              [(ngModel)]="model.health_id"
              required
              class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-blue-800"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-gray-700">Wallet Address (0x...)</span>
            <input
              type="text"
              name="wallet_address"
              [(ngModel)]="model.wallet_address"
              required
              class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-blue-800"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-gray-700">Phone (optional)</span>
            <input
              type="text"
              name="phone"
              [(ngModel)]="model.phone"
              class="rounded-lg border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-transparent focus:ring-2 focus:ring-blue-800"
            />
          </label>

          <div class="mt-2">
            <button
              type="submit"
              class="w-full rounded-lg bg-blue-800 px-3.5 py-3.5 text-base font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Register
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
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
    console.log('Registering:', this.model);
    this.router.navigate(['/']);
  }
}
