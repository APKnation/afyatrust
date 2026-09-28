import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Requires any authenticated wallet. */
export const canActivate: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};

/** Requires an authenticated PATIENT wallet. */
export const patientGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated() && auth.role === 'PATIENT') {
    return true;
  }

  router.navigate(auth.isAuthenticated() ? ['/'] : ['/login']);
  return false;
};

/** Requires an authenticated DOCTOR wallet. */
export const doctorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated() && auth.role === 'DOCTOR') {
    return true;
  }

  router.navigate(auth.isAuthenticated() ? ['/'] : ['/login']);
  return false;
};
