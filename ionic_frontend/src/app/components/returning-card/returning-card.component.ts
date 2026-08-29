import { Component, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-returning-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './returning-card.component.html',
  styleUrls: ['./returning-card.component.scss'],
})
export class ReturningCardComponent {
  addWaysideClick = output<void>();

  onAddWayside(): void {
    this.addWaysideClick.emit();
  }
}
