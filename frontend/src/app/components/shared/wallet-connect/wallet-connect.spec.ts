import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WalletConnectComponent } from './wallet-connect';

describe('WalletConnect', () => {
  let component: WalletConnectComponent;
  let fixture: ComponentFixture<WalletConnectComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WalletConnectComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WalletConnectComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
