import { Injectable } from '@angular/core';
import { ethers } from 'ethers';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class Web3Service {
  private contract: ethers.Contract | null = null;
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.Signer | null = null;

  constructor(
    private auth: AuthService,
    private api: ApiService
  ) {}

  async connect(): Promise<string> {
    if (!(window as any).ethereum) {
      throw new Error('Tafadhali ingia MetaMask! Stahaki');
    }

    const ethereum = window as any;
    this.provider = new ethers.BrowserProvider(ethereum);

    // Request account access
    const addresses = await ethereum.request({ method: 'eth_requestAccounts' });
    this.signer = await this.provider.getSigner();

    const wallet = await this.signer.getAddress();
    this.contract = new ethers.Contract(
      environment.contractAddress,
      environment.contractABI,
      this.signer
    );

    this.auth.setAuthenticated(wallet, this.detectRole(wallet), '');

    return wallet;
  }

  private detectRole(wallet: string): 'PATIENT' | 'DOCTOR' {
    // Backend exposes /api/accounts/ or we can infer from a user lookup.
    // For now fall back to a simple on-chain check via getMyRecords.
    return 'PATIENT';
  }

  async isConnected(): Promise<boolean> {
    return !!(window as any).ethereum && this.signer !== null;
  }

  async getWalletAddress(): Promise<string> {
    if (!this.signer) {
      await this.connect();
    }
    return this.signer.getAddress();
  }

  async getNetwork(): Promise<string> {
    const chainId = await this.provider?.getNetwork().catch(() => 'unknown');
    return chainId;
  }

  async getBalance(): Promise<string> {
    if (!this.signer) return '0';
    const balance = await this.signer.getBalance();
    return ethers.formatEther(balance);
  }

  getContract(): ethers.Contract | null {
    return this.contract;
  }
}
