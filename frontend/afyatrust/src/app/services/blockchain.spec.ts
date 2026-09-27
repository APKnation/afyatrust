import { TestBed } from '@angular/core/testing';
import { Blockchain } from './blockchain';

describe('Blockchain', () => {
  let service: Blockchain;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Blockchain);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
