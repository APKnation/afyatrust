import { Injectable } from '@angular/core';
import { ethers } from 'ethers';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';

export interface LoginResult {
  registered: boolean;
  role?: 'PATIENT' | 'DOCTOR';
  wallet_address?: string;
  health_id?: string | null;
  full_name?: string;
}

@Injectable({ providedIn: 'root' })
export class Web3Service {
  private contract: ethers.Contract | null = null;
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.Signer | null = null;

  constructor(
    private auth: AuthService,
    private api: ApiService
  ) {}

  /** Connect MetaMask and return the active wallet address. */
  async connect(): Promise<string> {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      throw new Error('Please install MetaMask to continue');
    }

    this.provider = new ethers.BrowserProvider(ethereum);
    await ethereum.request({ method: 'eth_requestAccounts' });
    this.signer = await this.provider.getSigner();

    const wallet = await this.signer.getAddress();
    this.contract = new ethers.Contract(
      environment.contractAddress,
      environment.contractABI,
      this.signer
    );

    return wallet;
  }

  /** Ask the wallet to sign a plain-text message (no gas, no transaction). */
  async signMessage(message: string): Promise<string> {
    if (!this.signer) {
      await this.connect();
    }
    return await this.signer!.signMessage(message);
  }

  /**
   * Full sign-in flow:
   * 1. Connect MetaMask
   * 2. Fetch a one-time nonce from the backend
   * 3. Ask the user to sign it
   * 4. Backend verifies the signature and returns the role
   */
  async login(): Promise<LoginResult> {
    const wallet = await this.connect();

    const { message } = await this.api.authNonce(wallet);
    const signature = await this.signMessage(message);
    const result = await this.api.authLogin(wallet, signature);

    if (result.registered && result.role) {
      this.auth.setAuthenticated(wallet, result.role, '');
    }
    return result;
  }

  private detectRole(wallet: string): 'PATIENT' | 'DOCTOR' {
    // Role now comes from the backend during login(); kept for fallback use.
    return 'PATIENT';
  }

  async isConnected(): Promise<boolean> {
    return !!(window as any).ethereum && this.signer !== null;
  }

  async getWalletAddress(): Promise<string> {
    if (!this.signer) {
      await this.connect();
    }
    return await this.signer!.getAddress();
  }

  async getNetwork(): Promise<string> {
    if (!this.provider) return 'unknown';
    try {
      const net = await this.provider.getNetwork();
      return net.name === 'unknown' ? `chainId:${net.chainId}` : net.name;
    } catch {
      return 'unknown';
    }
  }

  async getBalance(): Promise<string> {
    if (!this.provider || !this.signer) return '0';
    const address = await this.signer.getAddress();
    const balance = await this.provider.getBalance(address);
    return ethers.formatEther(balance);
  }

  getContract(): ethers.Contract | null {
    return this.contract;
  }
}
