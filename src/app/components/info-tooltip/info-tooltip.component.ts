import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

import { GLOSSARY, GlossaryEntry, GlossaryTermKey } from '../../content/glossary';

@Component({
  selector: 'app-info-tooltip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './info-tooltip.component.html',
  styleUrl: './info-tooltip.component.scss',
})
export class InfoTooltipComponent {
  @Input({ required: true }) termKey!: GlossaryTermKey;

  isOpen = false;

  get entry(): GlossaryEntry {
    return GLOSSARY[this.termKey];
  }

  get tooltipId(): string {
    return `tooltip-${this.termKey}`;
  }

  show(): void {
    this.isOpen = true;
  }

  hide(): void {
    this.isOpen = false;
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
  }
}
