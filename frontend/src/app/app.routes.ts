import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AuthService } from './services/auth.service';
import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { PatientDashboardComponent } from './pages/patient/patient-dashboard/patient-dashboard.component';
import { DoctorLandingComponent } from './pages/doctor/doctor-landing/doctor-landing.component';

/** Requires an authenticated PATIENT session (Health ID + PIN JWT). */
const patientGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isPatient) return true;
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
  // Doctor page is open: doctors identify via MetaMask + verification status.
  { path: 'doctor', component: DoctorLandingComponent },
  { path: '**', redirectTo: '' },
];
