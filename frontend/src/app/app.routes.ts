import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AuthService } from './services/auth.service';
import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { PatientDashboardComponent } from './pages/patient/patient-dashboard/patient-dashboard.component';
import { DoctorLandingComponent } from './pages/doctor/doctor-landing/doctor-landing.component';
import { HospitalDashboardComponent } from './pages/hospital/hospital-dashboard/hospital-dashboard.component';

/**
 * Single public entry points: /login and /register. Workspace routes are
 * role-guarded; the login page routes each user to the right one. There are
 * no per-role sign-in pages to reveal who the platform serves.
 */
const patientGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isPatient) return true;
  router.navigate(['/login']);
  return false;
};

const doctorGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isDoctor) return true;
  router.navigate(['/login']);
  return false;
};

const staffGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isStaff) return true;
  router.navigate(['/login']);
  return false;
};

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'home', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  {
    path: 'patient',
    component: PatientDashboardComponent,
    canActivate: [patientGuard],
  },
  {
    path: 'doctor',
    component: DoctorLandingComponent,
    canActivate: [doctorGuard],
  },
  {
    path: 'hospital',
    component: HospitalDashboardComponent,
    canActivate: [staffGuard],
  },
  // Old per-role pages no longer exist — quietly send them to the login.
  { path: 'doctor-auth', redirectTo: 'login', pathMatch: 'full' },
  { path: 'staff-login', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: '' },
];
