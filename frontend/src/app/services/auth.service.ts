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

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenSubject = new BehaviorSubject<string | null>(localStorage.getItem(KEY_TOKEN));
  private healthIdSubject = new BehaviorSubject<string>(localStorage.getItem(KEY_HEALTH_ID) || '');
  private nameSubject = new BehaviorSubject<string>(localStorage.getItem(KEY_NAME) || '');

  token$ = this.tokenSubject.asObservable();
  healthId$ = this.healthIdSubject.asObservable();
  fullName$ = this.nameSubject.asObservable();

  /** Store session after successful login. */
  setSession(res: LoginResponse) {
    localStorage.setItem(KEY_TOKEN, res.access);
    localStorage.setItem(KEY_REFRESH, res.refresh);
    localStorage.setItem(KEY_HEALTH_ID, res.health_id);
    localStorage.setItem(KEY_NAME, res.full_name);
    localStorage.setItem(KEY_WALLET, res.wallet_address);
    this.tokenSubject.next(res.access);
    this.healthIdSubject.next(res.health_id);
    this.nameSubject.next(res.full_name);
  }

  logout() {
    [KEY_TOKEN, KEY_REFRESH, KEY_HEALTH_ID, KEY_NAME, KEY_WALLET].forEach((k) =>
      localStorage.removeItem(k)
    );
    this.tokenSubject.next(null);
    this.healthIdSubject.next('');
    this.nameSubject.next('');
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
}
