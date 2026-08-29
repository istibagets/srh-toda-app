import { Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DriverService } from '../../services/driver.service';

@Component({
  selector: 'app-drop-off-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './drop-off-card.component.html',
  styleUrls: ['./drop-off-card.component.scss'],
})
export class DropOffCardComponent {
  driverService = inject(DriverService);

  dropOffClick = output<void>();

  onDropOff(): void {
    // Clicking drop off should do nothing yet as requested
    this.dropOffClick.emit();
  }
}
