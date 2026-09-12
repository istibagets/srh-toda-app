import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { MaintenanceService } from '../services/maintenance.service';

export const maintenanceInterceptor: HttpInterceptorFn = (req, next) => {
  const maintenanceService = inject(MaintenanceService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // If 503 is returned and not querying superadmin or maintenance-status, trigger maintenance screen
      if (error.status === 503 && !req.url.includes('/superadmin') && !req.url.includes('/maintenance-status')) {
        maintenanceService.report503();
      }
      return throwError(() => error);
    })
  );
};
