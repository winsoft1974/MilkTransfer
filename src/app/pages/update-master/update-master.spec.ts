import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdateMaster } from './update-master';

describe('UpdateMaster', () => {
  let component: UpdateMaster;
  let fixture: ComponentFixture<UpdateMaster>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdateMaster],
    }).compileComponents();

    fixture = TestBed.createComponent(UpdateMaster);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
