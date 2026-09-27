import { Component, OnInit } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
import { Web3Service } from '../../../services/web3.service';

@Component({
  selector: 'app-wallet-connect',  imports: [
    SlicePipe,  template: `  template: `
    <div class="wallet-box">
      <button *ngIf="!wallet" (click)="connect()" class="btn-connect">
        🦊 Unganisha MetaMask
      </button>

      <div *ngIf="wallet" class="wallet-info">
        <span class="wallet-address">
          {{ wallet | slice:0:6 }}...{{ wallet | slice:-4 }}
        </span>
        <span class="network-badge" [class.wrong]="network !== 'sepolia'">
          {{ network }}
        </span>
        <span class="balance">{{ balance }} ETH</span>
        <button (click)="disconnect()" class="btn-disconnect">Ondoa</button>
      </div>
    </div>      `,
  styles: [`
    .wallet-box { display: flex; align-items: center; gap: 10px; }
    .btn-connect {
      background: #f6851b; color: white; padding: 10px 20px;
      border: none; border-radius: 8px; cursor: pointer;
      font-weight: bold;
    }
    .wallet-info {
      display: flex; gap: 10px; align-items: center;
      background: #f0f0f0; padding: 8px 15px; border-radius: 8px;
    }
    .wallet-address { font-family: monospace; font-weight: bold; }
    .network-badge {
      background: #10b981; color: white; padding: 4px 8px;
      border-radius: 4px; font-size: 12px;
    }
    .network-badge.wrong { background: #ef4444; }
    .balance { font-size: 12px; color: #666; }
    .btn-disconnect {
      background: #ef4444; color: white; border: none;
      padding: 5px 10px; border-radius: 4px; cursor: pointer;
    }
  `]
})
export class WalletConnectComponent implements OnInit {
  wallet = '';
  network = '';
  balance = '';

  constructor(
    private auth: AuthService,
    private web3: Web3Service
  ) {}

  async ngOnInit() {
    if (await this.web3.isConnected()) {
      await this.connect();
    }
  }

  async connect() {
    try {
      this.wallet = await this.auth.connectWallet();
      this.network = await this.web3.getNetwork();
      this.balance = await this.web3.getBalance();
    } catch (e: any) {
      alert('Hitilafu: ' + e.message);
    }
  }

  disconnect() {
    this.auth.logout();
    this.wallet = '';
    this.network = '';
    this.balance = '';
  }
}