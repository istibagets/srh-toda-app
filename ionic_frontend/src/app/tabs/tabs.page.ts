import { Component, EnvironmentInjector, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  home,
  bookmarkOutline,
  bookmark,
  timeOutline,
  time,
  walletOutline,
  wallet,
  statsChartOutline,
  statsChart,
  shieldOutline,
  shield,
  personOutline,
  person,
} from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [CommonModule, RouterModule, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);
  authService = inject(AuthService);

  isAdmin = computed(() => this.authService.currentUser()?.role === 'admin' || this.authService.currentUser()?.role === 'superadmin');
  isPassenger = computed(() => this.authService.currentUser()?.role === 'passenger');
  isDriver = computed(() => this.authService.currentUser()?.role === 'driver');

  constructor() {
    addIcons({
      homeOutline,
      home,
      bookmarkOutline,
      bookmark,
      timeOutline,
      time,
      walletOutline,
      wallet,
      statsChartOutline,
      statsChart,
      shieldOutline,
      shield,
      personOutline,
      person,
    });
  }

}

