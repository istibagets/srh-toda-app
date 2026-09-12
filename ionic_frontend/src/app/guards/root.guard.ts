import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const rootGuard: CanActivateFn = (): boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // 1. If user is authenticated, ALWAYS go straight to the main app dashboard
  if (authService.isAuthenticated()) {
    return router.createUrlTree(['/tabs/home']);
  }

  // 2. Check if running in PWA standalone mode or launched via PWA shortcut
  const isPwa =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://') ||
      window.location.search.includes('source=pwa'));

  // If installed PWA or returning user, redirect to login (never landing page on PWA)
  if (isPwa || (typeof localStorage !== 'undefined' && localStorage.getItem('srh_has_visited') === 'true')) {
    return router.createUrlTree(['/login']);
  }

  // 3. For first-time web visitors, show the landing page
  return router.createUrlTree(['/landing']);
};
