import { Routes } from '@angular/router';
import { Logincomponent } from './pages/logincomponent/logincomponent';
import { HomeComponent } from './pages/home/home';
import { UpdateMasterComponent } from './pages/update-master/update-master';
import { authGuard } from './guards/auth-guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    component: Logincomponent
    
  },
  {
    path: 'home',
    component: HomeComponent,
    canActivate: [authGuard]
  },
  {
    path: 'update-master',
    component: UpdateMasterComponent,
    canActivate: [authGuard]
  },
  {
    path: '**',
    redirectTo: 'login'
  }
];