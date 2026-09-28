import { Injectable } from '@angular/core';
import { AuthService } from '../../../services/auth.service';

/**
 * Doctor session helpers over the role-aware AuthService.
 * Doctors log in with license number + PIN (JWT); no wallet involved.
 */
@Injectable({ providedIn: 'root' })
export class DoctorSessionService {
  constructor(private auth: AuthService) {}

  get licenseNo(): string {
    return this.auth.licenseNo;
  }

  get hospitalCode(): string {
    return this.auth.hospitalCode;
  }

  get fullName(): string {
    return this.auth.fullName;
  }

  get isApproved(): boolean {
    return this.auth.isDoctor;
  }

  init(): void {
    /* Session is restored by AuthService from localStorage; nothing to do. */
  }

  disconnect(): void {
    this.auth.logout();
  }
}
