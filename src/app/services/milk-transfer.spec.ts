import { TestBed } from '@angular/core/testing';

import { MilkTransfer } from './milk-transfer';

describe('MilkTransfer', () => {
  let service: MilkTransfer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MilkTransfer);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
