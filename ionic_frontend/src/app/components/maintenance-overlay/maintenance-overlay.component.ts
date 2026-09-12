import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  constructOutline,
  refreshOutline,
  shieldCheckmarkOutline,
  timeOutline,
  lockClosedOutline,
  arrowForwardOutline,
  radioOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';
import { MaintenanceService } from '../../services/maintenance.service';

@Component({
  selector: 'app-maintenance-overlay',
  templateUrl: './maintenance-overlay.component.html',
  styleUrls: ['./maintenance-overlay.component.scss'],
  standalone: true,
  imports: [CommonModule, IonIcon, IonSpinner],
})
export class MaintenanceOverlayComponent {
  maintenanceService = inject(MaintenanceService);
  private router = inject(Router);

  constructor() {
    addIcons({
      constructOutline,
      refreshOutline,
      shieldCheckmarkOutline,
      timeOutline,
      lockClosedOutline,
      arrowForwardOutline,
      radioOutline,
      checkmarkCircleOutline,
    });
  }

  onRetry(): void {
    this.maintenanceService.checkStatus();
  }

  onGoToSuperAdmin(): void {
    this.router.navigate(['/superadmin']);
  }
}
