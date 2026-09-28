/**
 * Optional MetaMask helper for DOCTORS only.
 * Patients never use MetaMask — their wallets are custodial (backend-managed).
 */
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Web3Service {
  /** Returns the connected address, or '' if MetaMask is absent/declined. */
  async connect(): Promise<string> {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return '';
    try {
      const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
      return accounts[0] || '';
    } catch {
      return '';
    }
  }

  /** Read-only: get the current address without prompting. */
  async getAddress(): Promise<string> {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return '';
    try {
      const accounts: string[] = await ethereum.request({ method: 'eth_accounts' });
      return accounts[0] || '';
    } catch {
      return '';
    }
  }
}
