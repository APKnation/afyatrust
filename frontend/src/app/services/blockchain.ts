import { Injectable } from '@angular/core';
import { ethers } from 'ethers';
import { environment } from '../../environments/environment';

// Kamili: weka ABI kutoka blockchain/artifacts/contracts/AfyaTrust.sol/AfyaTrust.json
// Kwa sasa tunatumia human-readable ABI kutoka environment.
const ABI = environment.contractABI;

@Injectable({ providedIn: 'root' })
export class BlockchainService {
  provider: ethers.BrowserProvider | null = null;
  signer: ethers.Signer | null = null;
  contract: ethers.Contract | null = null;

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
    return await this.signer!.getAddress();
  }

  async hasAccess(healthID: string, address: string): Promise<boolean> {
    if (!this.contract) await this.connect();
    return await this.contract!['hasAccess'](healthID, address);
  }

  async getMyRecords(): Promise<any[]> {
    if (!this.contract) await this.connect();
    return await this.contract!['getMyRecords']();
  }

  async getMyAuditTrail(): Promise<any[]> {
    if (!this.contract) await this.connect();
    return await this.contract!['getMyAuditTrail']();
  }
}
