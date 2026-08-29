import { Component, inject } from '@angular/core';
import { Router, NavigationStart } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { filter } from 'rxjs/operators';
import { RealtimeService } from './services/realtime.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private router = inject(Router);
  private realtimeService = inject(RealtimeService);

  constructor() {
    // Blur focused elements before page transitions to prevent accessibility aria-hidden warnings
    this.router.events
      .pipe(filter((event) => event instanceof NavigationStart))
      .subscribe(() => {
        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });
  }
}
