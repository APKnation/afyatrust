import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface LoginResponse {
  token: string;
  role: 'PATIENT' | 'DOCTOR';
  wallet_address: string;
  health_id?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private walletSubject = new BehaviorSubject<string>(this.getStoredWallet());
  private roleSubject = new BehaviorSubject<'PATIENT' | 'DOCTOR' | ''>(this.getStoredRole());
  private tokenSubject = new BehaviorSubject<string | null>(this.getStoredToken());

  wallet$ = this.walletSubject.asObservable();
  role$ = this.roleSubject.asObservable();
  token$ = this.tokenSubject.asObservable();

  private getStoredWallet(): string {
    return localStorage.getItem('afyatrust_wallet') || '';
  }

  private getStoredRole(): 'PATIENT' | 'DOCTOR' | '' {
    return localStorage.getItem('afyatrust_role') as 'PATIENT' | 'DOCTOR' | '' || '';
  }

  private getStoredToken(): string | null {
    return localStorage.getItem('afyatrust_token');
  }

  setAuthenticated(wallet: string, role: 'PATIENT' | 'DOCTOR', token: string) {
    this.walletSubject.next(wallet);
    this.roleSubject.next(role);
    this.tokenSubject.next(token);
    localStorage.setItem('afyatrust_wallet', wallet);
    localStorage.setItem('afyatrust_role', role);
    localStorage.setItem('afyatrust_token', token);
  }

  logout() {
    this.walletSubject.next('');
    this.roleSubject.next('');
    this.tokenSubject.next(null);
    localStorage.removeItem('afyatrust_wallet');
    localStorage.removeItem('afyatrust_role');
    localStorage.removeItem('afyatrust_token');
  }

  isAuthenticated(): boolean {
    return this.walletSubject.value.length > 0 && !!this.tokenSubject.value;
  }

  get wallet(): string {
    return this.walletSubject.value;
  }

  get role(): 'PATIENT' | 'DOCTOR' | '' {
    return this.roleSubject.value;
  }

  get token(): string | null {
    return this.tokenSubject.value;
  }
}
