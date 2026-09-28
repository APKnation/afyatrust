import { Injectable } from '@angular/core';
import { ApiService } from '../../../services/api.service';

/**
 * Shared doctor session state (wallet + verification status).
 * Restored from localStorage on app start so the navbar, landing page
 * and doctor workspace all see the same identity.
 */
@Injectable({ providedIn: 'root' })
export class DoctorSessionService {
  private static readonly WALLET_KEY = 'afyatrust_doctor_wallet';

  wallet = '';
  status: '' | 'PENDING' | 'APPROVED' | 'REJECTED' = '';
  fullName = '';
  facilityId = '';

  constructor(private api: ApiService) {}

  get isApproved(): boolean {
    return this.status === 'APPROVED';
  }

  /** Restore a saved wallet (survives refresh); status is refreshed silently. */
  init(): void {
    const saved = localStorage.getItem(DoctorSessionService.WALLET_KEY);
    if (!saved) return;
    this.wallet = saved;
    void this.refreshStatus();
  }

  async refreshStatus(): Promise<void> {
    if (!this.wallet) return;
    try {
      const res: any = await this.api.doctorStatus(this.wallet);
      this.status = res.registered ? res.status : '';
      this.fullName = res.full_name || '';
      this.facilityId = res.facility_id || '';
    } catch {
      // offline / server down: keep the last known status
    }
  }

  setWallet(wallet: string): void {
    this.wallet = wallet;
    if (wallet) {
      localStorage.setItem(DoctorSessionService.WALLET_KEY, wallet);
    } else {
      localStorage.removeItem(DoctorSessionService.WALLET_KEY);
    }
    this.status = '';
    this.fullName = '';
    this.facilityId = '';
  }

  disconnect(): void {
    this.setWallet('');
  }
}
