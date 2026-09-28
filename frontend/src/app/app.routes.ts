import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AuthService } from './services/auth.service';
import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { PatientDashboardComponent } from './pages/patient/patient-dashboard/patient-dashboard.component';
import { DoctorAuthComponent } from './pages/doctor/doctor-auth/doctor-auth.component';
import { DoctorLandingComponent } from './pages/doctor/doctor-landing/doctor-landing.component';
import { StaffLoginComponent } from './pages/hospital/staff-login/staff-login.component';
import { HospitalDashboardComponent } from './pages/hospital/hospital-dashboard/hospital-dashboard.component';

/** Requires an authenticated PATIENT session (Health ID + PIN JWT). */
const patientGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isPatient) return true;
  router.navigate(['/login']);
  return false;
};

/** Requires an authenticated DOCTOR session (license + PIN JWT). */
const doctorGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isDoctor) return true;
  router.navigate(['/doctor-auth']);
  return false;
};

/** Requires an authenticated HOSPITAL STAFF session (username + password JWT). */
const staffGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isStaff) return true;
  router.navigate(['/staff-login']);
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
  // Doctor portal: register / sign in with license + PIN (no MetaMask).
  { path: 'doctor-auth', component: DoctorAuthComponent },
  {
    path: 'doctor',
    component: DoctorLandingComponent,
    canActivate: [doctorGuard],
  },
  // Hospital staff portal: respond to incoming referrals.
  { path: 'staff-login', component: StaffLoginComponent },
  {
    path: 'hospital',
    component: HospitalDashboardComponent,
    canActivate: [staffGuard],
  },
  { path: '**', redirectTo: '' },
];
