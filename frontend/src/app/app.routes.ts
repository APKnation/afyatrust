import { Routes } from '@angular/router';
import { canActivate } from './guards/auth.guard';
import { HomeComponent } from './pages/home/home.component';
import { RegisterComponent } from './pages/register/register.component';
import { PatientDashboardComponent } from './pages/patient/patient-dashboard/patient-dashboard.component';
import { DoctorLandingComponent } from './pages/doctor/doctor-landing/doctor-landing.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'home', component: HomeComponent },
  { path: 'register', component: RegisterComponent },
  {
    path: 'patient',
    component: PatientDashboardComponent,
    canActivate: [canActivate],
  },
  {
    path: 'doctor',
    component: DoctorLandingComponent,
    canActivate: [canActivate],
  },
  { path: '**', redirectTo: '' },
];
