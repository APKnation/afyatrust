import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/shared/navbar/navbar';
import { DoctorSessionService } from './pages/doctor/doctor-landing/doctor-session.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavbarComponent],
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('AfyaTrust');

  constructor(doctorSession: DoctorSessionService) {
    // Restore the doctor identity (if any) once at startup so the navbar
    // and every page share the same session state.
    doctorSession.init();
  }
}
