import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RecordCard } from './record-card';

describe('RecordCard', () => {
  let component: RecordCard;
  let fixture: ComponentFixture<RecordCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecordCard],
    }).compileComponents();

    fixture = TestBed.createComponent(RecordCard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
