import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'home',
        loadComponent: () =>
          import('../pages/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'history',
        loadComponent: () =>
          import('../pages/history/history.page').then((m) => m.HistoryPage),
      },
      {
        path: 'saved',
        loadComponent: () =>
          import('../pages/saved/saved.page').then((m) => m.SavedPage),
      },
      {
        path: 'earnings',
        loadComponent: () =>
          import('../pages/earnings/earnings.page').then((m) => m.EarningsPage),
      },
      {
        path: 'admin',
        loadComponent: () =>
          import('../pages/admin/admin.page').then((m) => m.AdminPage),
      },
      {
        path: 'admin/reports',
        loadComponent: () =>
          import('../pages/admin-reports/admin-reports.page').then((m) => m.AdminReportsPage),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('../pages/profile/profile.page').then((m) => m.ProfilePage),
      },
      {
        path: 'superadmin',
        loadComponent: () =>
          import('../pages/superadmin/superadmin.page').then((m) => m.SuperadminPage),
      },
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full',
      },
    ],
  },
];
