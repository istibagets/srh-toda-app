import { Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { power, powerOutline } from 'ionicons/icons';
import { DriverService } from '../../services/driver.service';

@Component({
  selector: 'app-duty-button',
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: './duty-button.component.html',
  styleUrls: ['./duty-button.component.scss'],
})
export class DutyButtonComponent {
  driverService = inject(DriverService);
  dutyToggled = output<boolean>();

  constructor() {
    addIcons({ power, powerOutline });
  }

  handleToggle(): void {
    this.dutyToggled.emit(!this.driverService.isOnline());
  }
}
