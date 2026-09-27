import { Injectable } from '@angular/core';
import { ethers } from 'ethers';
import { environment } from '../../environments/environment';

const ABI = [ /* paste ABI yako hapa */ ];

@Injectable({ providedIn: 'root' })
export class BlockchainService {
  provider: any;
  signer: any;
  contract: any;

  async connect(): Promise<string> {
    if (!(window as any).ethereum) {
      throw new Error('Tafadhali install MetaMask!');
    }
    
    this.provider = new ethers.BrowserProvider((window as any).ethereum);
    await this.provider.send("eth_requestAccounts", []);
    this.signer = await this.provider.getSigner();
    
    this.contract = new ethers.Contract(
      environment.contractAddress,
      ABI,
      this.signer
    );
    
    return await this.signer.getAddress();
  }

  async getWalletAddress(): Promise<string> {
    if (!this.signer) await this.connect();
    return await this.signer.getAddress();
  }

  async hasAccess(healthID: string, address: string): Promise<boolean> {
    return await this.contract['hasAccess'](healthID, address);
  }

  async getMyRecords(): Promise<any[]> {
    return await this.contract['getMyRecords']();
  }

  async getMyAuditTrail(): Promise<any[]> {
    return await this.contract['