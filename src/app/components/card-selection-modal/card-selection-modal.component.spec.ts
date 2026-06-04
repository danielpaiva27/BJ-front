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

  it('should show live counting metrics when enabled', () => {
    component.isOpen = true;
    component.title = 'Registrar cartas vistas';
    component.helperText = 'Selecione quantas cartas quiser. Clique em Concluir quando terminar.';
    component.shoeCounts = createInitialShoeCounts(1);
    component.showLiveCounting = true;
    component.runningCount = 1;
    component.trueCount = 1.02;
    component.cardsRemaining = 51;
    component.decksRemaining = 0.9808;

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Registrar cartas vistas');
    expect(compiled.textContent).toContain('Selecione quantas cartas quiser');
    expect(compiled.textContent).toContain('Running Count');
    expect(compiled.textContent).toContain('True Count');
    expect(compiled.textContent).toContain('Cartas restantes');
    expect(compiled.textContent).toContain('Decks restantes');
    expect(compiled.textContent).toContain('51');
  });

  it('should emit undo event from the seen-cards footer button', () => {
    component.isOpen = true;
    component.shoeCounts = createInitialShoeCounts(1);
    component.showUndoButton = true;
    component.undoDisabled = false;
    spyOn(component.undoLast, 'emit');

    fixture.detectChanges();
    const undoButton = fixture.nativeElement.querySelector('.secondary-button') as HTMLButtonElement;
    undoButton.click();

    expect(component.undoLast.emit).toHaveBeenCalled();
  });

  it('should emit close event from the conclude button', () => {
    component.isOpen = true;
    component.shoeCounts = createInitialShoeCounts(1);
    spyOn(component.closed, 'emit');

    fixture.detectChanges();
    const doneButton = fixture.nativeElement.querySelector('.done-button') as HTMLButtonElement;
    doneButton.click();

    expect(component.closed.emit).toHaveBeenCalled();
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
