import { Component, OnInit } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { NgIf } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
import { Web3Service } from '../../../services/web3.service';

@Component({
  selector: 'app-wallet-connect',
  imports: [SlicePipe, NgIf],
  template: `
    <div class="flex items-center gap-2.5">
      <button
        *ngIf="!wallet"
        (click)="connect()"
        class="rounded-lg bg-amber-500 px-5 py-2.5 font-bold text-white cursor-pointer transition-colors hover:bg-amber-600"
      >
        🦊 Connect MetaMask
      </button>

      <div
        *ngIf="wallet"
        class="flex flex-wrap items-center gap-2.5 rounded-lg bg-gray-100 px-4 py-2"
      >
        <span class="font-mono font-bold text-sm">
          {{ wallet | slice:0:6 }}...{{ wallet | slice:-4 }}
        </span>
        <span
          class="rounded px-2 py-1 text-xs font-semibold text-white"
          [class.bg-emerald-500]="network === 'sepolia'"
          [class.bg-red-500]="network !== 'sepolia'"
        >
          {{ network }}
        </span>
        <span class="text-xs text-gray-500">{{ balance }} ETH</span>
        <button
          (click)="disconnect()"
          class="rounded cursor-pointer border-none bg-red-500 px-2.5 py-1.5 text-white transition-colors hover:bg-red-600"
        >
          Disconnect
        </button>
      </div>
    </div>
  `,
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
      this.wallet = await this.web3.connect();
      this.network = await this.web3.getNetwork();
      this.balance = await this.web3.getBalance();
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  }

  disconnect() {
    this.auth.logout();
    this.wallet = '';
    this.network = '';
    this.balance = '';
  }
}
