import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CardSelectionModalComponent } from './card-selection-modal.component';
import { createInitialShoeCounts } from '../../utils/blackjack-table.utils';

describe('CardSelectionModalComponent', () => {
  let fixture: ComponentFixture<CardSelectionModalComponent>;
  let component: CardSelectionModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardSelectionModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CardSelectionModalComponent);
    component = fixture.componentInstance;
  });

  it('should render contextual title, values and remaining counts', () => {
    component.isOpen = true;
    component.title = 'Carta comprada no Hit';
    component.shoeCounts = createInitialShoeCounts(1);

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Carta comprada no Hit');
    expect(compiled.textContent).toContain('10/J/Q/K');
    expect(compiled.textContent).toContain('Restantes');
  });

  it('should disable unavailable values and emit selected card', () => {
    component.isOpen = true;
    component.shoeCounts = createInitialShoeCounts(1).map((item) => (
      item.value === 'A' ? { ...item, count: 0 } : item
    ));
    spyOn(component.cardSelected, 'emit');

    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('.card-option')) as HTMLButtonElement[];
    expect(buttons[0].disabled).toBeTrue();

    buttons[1].click();

    expect(component.cardSelected.emit).toHaveBeenCalledWith('10');
  });

  it('should emit close event when backdrop is clicked', () => {
    component.isOpen = true;
    component.shoeCounts = createInitialShoeCounts(1);
    spyOn(component.closed, 'emit');

    fixture.detectChanges();
    const backdrop = fixture.nativeElement.querySelector('.modal-backdrop') as HTMLDivElement;
    backdrop.click();

    expect(component.closed.emit).toHaveBeenCalled();
  });
});
