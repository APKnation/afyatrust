import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Web3Service } from './web3.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private walletAddress = new BehaviorSubject<string>('');
  private userRole = new BehaviorSubject<string>('GUEST');

  wallet$ = this.walletAddress.asObservable();
  role$ = this.userRole.asObservable();

  constructor(private web3: Web3Service) {}

  async connectWallet(): Promise<string> {
    const address = await this.web3.connect();
    this.walletAddress.next(address);
    return address;
  }

  setRole(role: string) {
    this.userRole.next(role);
    localStorage.setItem('user_role', role);
  }

  getRole(): string {
    return this.userRole.value || localStorage.getItem('user_role') || 'GUEST';
  }

  getWallet(): string {
    return this.walletAddress.value;
  }

  logout() {
    this.walletAddress.next('');
    this.userRole.next('GUEST');
    localStorage.removeItem('user_role');
    localStorage.removeItem('doctor_name');
    localStorage.removeItem('facility_id');
  }
}