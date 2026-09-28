import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RecordCardComponent } from './record-card';

describe('RecordCard', () => {
  let component: RecordCardComponent;
  let fixture: ComponentFixture<RecordCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecordCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RecordCardComponent);
    component = fixture.componentInstance;
    component.record = {
      facility: 'Test Hospital',
      type: 'Lab',
      data: { result: 'ok' },
      hash: '0xabc',
      date: new Date().toISOString(),
      verified: true,
    };
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
