import { Injectable } from '@angular/core';
import { ethers } from 'ethers';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class Web3Service {
  provider: any;
  signer: any;
  contract: any;
  private ABI: any[] = []; // Itawekwa kutoka environment

  async connect(): Promise<string> {
    if (!(window as any).ethereum) {
      throw new Error('Tafadhali install MetaMask!');
    }

    this.provider = new ethers.BrowserProvider((window as any).ethereum);
    await this.provider.send('eth_requestAccounts', []);
    this.signer = await this.provider.getSigner();

    this.contract = new ethers.Contract(
      environment.contractAddress,
      environment.contractABI,
      this.signer
    );

    return await this.signer.getAddress();
  }

  async getWalletAddress(): Promise<string> {
    if (!this.signer) await this.connect();
    return await this.signer.getAddress();
  }

  async isConnected(): Promise<boolean> {
    if (!(window as any).ethereum) return false;
    const accounts = await (window as any).ethereum.request({
      method: 'eth_accounts'
    });
    return accounts.length > 0;
  }

  async hasAccess(healthID: string, address: string): Promise<boolean> {
    if (!this.contract) await this.connect();
    return await this.contract['hasAccess'](healthID, address);
  }

  async getMyRecords(): Promise<any[]> {
    return await this.contract['getMyRecords']();
  }

  async getMyAuditTrail(): Promise<any[]> {
    return await this.contract['getMyAuditTrail']();
  }

  async getRecords(healthID: string): Promise<any[]> {
    return await this.contract['getRecords'](healthID);
  }

  async getAuditTrail(healthID: string): Promise<any[]> {
    return await this.contract['getAuditTrail'](healthID);
  }

  async getPermissions(healthID: string): Promise<any[]> {
    return await this.contract['getPermissions'](healthID);
  }

  async getNetwork(): Promise<string> {
    const network = await this.provider.getNetwork();
    return network.name;
  }

  async getBalance(): Promise<string> {
    const address = await this.getWalletAddress();
    const balance = await this.provider.getBalance(address);
    return ethers.formatEther(balance);
  }
}