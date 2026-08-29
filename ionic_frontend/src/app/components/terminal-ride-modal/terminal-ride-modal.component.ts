import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TerminalTripDetails {
  destination: string;
  passengerCount: number;
  fare: number;
}

@Component({
  selector: 'app-terminal-ride-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './terminal-ride-modal.component.html',
  styleUrls: ['./terminal-ride-modal.component.scss'],
})
export class TerminalRideModalComponent {
  isOpen = input<boolean>(false);
  isWayside = input<boolean>(false);
  closeModal = output<void>();
  confirmRide = output<TerminalTripDetails>();

  destinations = [
    { name: 'Brgy. Poblacion Sur (Central)', shortName: 'Poblacion Sur', fare: 40, distance: '1.2 km' },
    { name: 'Brgy. Cojuangco (Elementary School)', shortName: 'Cojuangco', fare: 50, distance: '2.5 km' },
    { name: 'Santa Rosa Public Market', shortName: 'Public Market', fare: 30, distance: '0.8 km' },
    { name: 'Town Plaza / Municipal Hall', shortName: 'Town Plaza', fare: 35, distance: '1.0 km' },
    { name: 'SM Cabanatuan Bypass Boundary', shortName: 'Bypass Boundary', fare: 70, distance: '4.8 km' },
  ];

  selectedDestination = signal<string>(this.destinations[0].name);
  passengerCount = signal<number>(1);
  calculatedFare = signal<number>(40);

  onDestinationChange(destName: string): void {
    this.selectedDestination.set(destName);
    const match = this.destinations.find((d) => d.name === destName);
    if (match) {
      const multiplier = this.passengerCount() > 2 ? 1.5 : 1;
      this.calculatedFare.set(match.fare * multiplier);
    }
  }

  setPassengerCount(count: number): void {
    this.passengerCount.set(count);
    this.onDestinationChange(this.selectedDestination());
  }

  onConfirm(): void {
    this.confirmRide.emit({
      destination: this.selectedDestination(),
      passengerCount: this.passengerCount(),
      fare: this.calculatedFare(),
    });
    this.closeModal.emit();
  }

  onClose(): void {
    this.closeModal.emit();
  }
}
