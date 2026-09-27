import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { WalletConnectComponent } from '../components/shared/wallet-connect/wallet-connect';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, WalletConnectComponent],
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('AfyaTrust');
}
