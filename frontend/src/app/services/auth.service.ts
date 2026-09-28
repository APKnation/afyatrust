import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface LoginResponse {
  access: string;
  refresh: string;
  health_id: string;
  full_name: string;
  wallet_address: string;
}

const KEY_TOKEN = 'afyatrust_token';
const KEY_REFRESH = 'afyatrust_refresh';
const KEY_HEALTH_ID = 'afyatrust_health_id';
const KEY_NAME = 'afyatrust_name';
const KEY_WALLET = 'afyatrust_wallet';
const KEY_ROLE = 'afyatrust_role';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenSubject = new BehaviorSubject<string | null>(localStorage.getItem(KEY_TOKEN));
  private healthIdSubject = new BehaviorSubject<string>(localStorage.getItem(KEY_HEALTH_ID) || '');
  private nameSubject = new BehaviorSubject<string>(localStorage.getItem(KEY_NAME) || '');
  private roleSubject = new BehaviorSubject<string>(localStorage.getItem(KEY_ROLE) || '');

  token$ = this.tokenSubject.asObservable();
  healthId$ = this.healthIdSubject.asObservable();
  fullName$ = this.nameSubject.asObservable();
  role$ = this.roleSubject.asObservable();

  /** Store session after successful login. */
  setSession(res: LoginResponse) {
    localStorage.setItem(KEY_TOKEN, res.access);
    localStorage.setItem(KEY_REFRESH, res.refresh);
    localStorage.setItem(KEY_HEALTH_ID, res.health_id);
    localStorage.setItem(KEY_NAME, res.full_name);
    localStorage.setItem(KEY_WALLET, res.wallet_address);
    localStorage.setItem(KEY_ROLE, 'PATIENT');
    this.tokenSubject.next(res.access);
    this.healthIdSubject.next(res.health_id);
    this.nameSubject.next(res.full_name);
    this.roleSubject.next('PATIENT');
  }

  logout() {
    [KEY_TOKEN, KEY_REFRESH, KEY_HEALTH_ID, KEY_NAME, KEY_WALLET, KEY_ROLE].forEach((k) =>
      localStorage.removeItem(k)
    );
    this.tokenSubject.next(null);
    this.healthIdSubject.next('');
    this.nameSubject.next('');
    this.roleSubject.next('');
  }

  isAuthenticated(): boolean {
    return !!this.tokenSubject.value;
  }

  get token(): string | null {
    return this.tokenSubject.value;
  }

  get healthId(): string {
    return this.healthIdSubject.value;
  }

  get fullName(): string {
    return this.nameSubject.value;
  }

  /** 'PATIENT' when signed in via Health ID + PIN, '' otherwise. */
  get role(): string {
    return this.roleSubject.value;
  }

  /** True only for an authenticated patient session. */
  get isPatient(): boolean {
    return this.isAuthenticated() && this.role === 'PATIENT';
  }
}
