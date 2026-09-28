import { Injectable } from '@angular/core';

/**
 * Shared doctor session state (wallet + verification status).
 * Written by the verification panel, read by the workspace actions.
 */
@Injectable({ providedIn: 'root' })
export class DoctorSessionService {
  wallet = '';
  status: '' | 'PENDING' | 'APPROVED' | 'REJECTED' = '';
  fullName = '';
  facilityId = '';

  get isApproved(): boolean {
    return this.status === 'APPROVED';
  }
}
