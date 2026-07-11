import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const authGuard: CanActivateFn = (route, state) => {

  const router = inject(Router);

  const token = sessionStorage.getItem('token');

  if (!token) {
    return router.createUrlTree(
      ['/login'],
      {
        queryParams: {
          returnUrl: state.url
        }
      }
    );
  }

  try {

    const payload = JSON.parse(atob(token.split('.')[1]));

    if (payload.exp) {

      const currentTime = Math.floor(Date.now() / 1000);

      if (payload.exp < currentTime) {

        sessionStorage.clear();

        return router.createUrlTree(
          ['/login'],
          {
            queryParams: {
              sessionExpired: true
            }
          }
        );
      }
    }

    return true;

  } catch {

    sessionStorage.clear();

    return router.createUrlTree(['/login']);
  }
};