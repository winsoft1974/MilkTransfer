import { TestBed } from '@angular/core/testing';

import { Access } from './access';

describe('Access', () => {
  let service: Access;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Access);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
