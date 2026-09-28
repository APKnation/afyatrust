import { Routes } from '@angular/router';
import { canActivate } from './guards/auth.guard';
import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { PatientDashboardComponent } from './pages/patient/patient-dashboard/patient-dashboard.component';
import { DoctorLandingComponent } from './pages/doctor/doctor-landing/doctor-landing.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'home', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  {
    path: 'patient',
    component: PatientDashboardComponent,
    canActivate: [canActivate],
  },
  // Doctor page is open: doctors identify via optional MetaMask wallet.
  { path: 'doctor', component: DoctorLandingComponent },
  { path: '**', redirectTo: '' },
];
