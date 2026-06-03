import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { CardValue, ShoeValueCount } from '../../models/blackjack-table.models';

@Component({
  selector: 'app-card-selection-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './card-selection-modal.component.html',
  styleUrl: './card-selection-modal.component.scss',
})
export class CardSelectionModalComponent {
  @Input() isOpen = false;
  @Input() title = 'Selecionar carta';
  @Input() shoeCounts: ShoeValueCount[] = [];

  @Output() cardSelected = new EventEmitter<CardValue>();
  @Output() closed = new EventEmitter<void>();

  selectCard(item: ShoeValueCount): void {
    if (item.count <= 0) {
      return;
    }

    this.cardSelected.emit(item.value);
  }

  close(): void {
    this.closed.emit();
  }
}
