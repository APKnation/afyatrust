import { Injectable, signal } from '@angular/core';

export interface LoginResponse {
  access: string;
  refresh: string;
  role?: 'PATIENT' | 'DOCTOR' | 'STAFF';
  health_id: string;
  full_name: string;
  wallet_address: string;
}

export interface DoctorLoginResponse {
  access: string;
  refresh: string;
  role: 'DOCTOR';
  license_no: string;
  full_name: string;
  hospital_code: string;
  wallet_address: string;
}

export interface StaffLoginResponse {
  access: string;
  refresh: string;
  role: 'STAFF';
  username: string;
  full_name: string;
  hospital_code: string;
  hospital_name: string;
}

/** Whatever /api/login/ returns — the role field decides the session type. */
export type UnifiedLoginResponse = LoginResponse | DoctorLoginResponse | StaffLoginResponse;

const KEY_TOKEN = 'afyatrust_token';
const KEY_REFRESH = 'afyatrust_refresh';
const KEY_HEALTH_ID = 'afyatrust_health_id';
const KEY_NAME = 'afyatrust_name';
const KEY_WALLET = 'afyatrust_wallet';
const KEY_ROLE = 'afyatrust_role';
const KEY_LICENSE = 'afyatrust_license_no';
const KEY_HOSPITAL = 'afyatrust_hospital_code';
const KEY_USERNAME = 'afyatrust_username';

interface AuthSessionState {
  token: string | null;
  healthId: string;
  fullName: string;
  role: string;
}

/**
 * Role-aware session store.
 * PATIENT: Health ID + PIN -> JWT (health_id claim).
 * DOCTOR:  license_no + PIN -> JWT (license_no claim, no MetaMask).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  /** One atomic session snapshot shared by guards, API calls and all workspaces. */
  readonly session = signal<AuthSessionState>({
    token: localStorage.getItem(KEY_TOKEN),
    healthId: localStorage.getItem(KEY_HEALTH_ID) || '',
    fullName: localStorage.getItem(KEY_NAME) || '',
    role: localStorage.getItem(KEY_ROLE) || '',
  });

  /** Store a PATIENT session after Health ID + PIN login. */
  setSession(res: LoginResponse) {
    this.clearStorage();
    localStorage.setItem(KEY_TOKEN, res.access);
    localStorage.setItem(KEY_REFRESH, res.refresh);
    localStorage.setItem(KEY_HEALTH_ID, res.health_id);
    localStorage.setItem(KEY_NAME, res.full_name);
    localStorage.setItem(KEY_WALLET, res.wallet_address);
    localStorage.setItem(KEY_ROLE, 'PATIENT');
    this.session.set({ token: res.access, healthId: res.health_id, fullName: res.full_name, role: 'PATIENT' });
  }

  /** Store a DOCTOR session after license + PIN login. */
  setDoctorSession(res: DoctorLoginResponse) {
    this.clearStorage();
    localStorage.setItem(KEY_TOKEN, res.access);
    localStorage.setItem(KEY_REFRESH, res.refresh);
    localStorage.setItem(KEY_LICENSE, res.license_no);
    localStorage.setItem(KEY_HOSPITAL, res.hospital_code);
    localStorage.setItem(KEY_WALLET, res.wallet_address);
    localStorage.setItem(KEY_NAME, res.full_name);
    localStorage.setItem(KEY_ROLE, 'DOCTOR');
    this.session.set({ token: res.access, healthId: '', fullName: res.full_name, role: 'DOCTOR' });
  }

  /** Store a HOSPITAL STAFF session (admin-created account). */
  setStaffSession(res: StaffLoginResponse) {
    this.clearStorage();
    localStorage.setItem(KEY_TOKEN, res.access);
    localStorage.setItem(KEY_REFRESH, res.refresh);
    localStorage.setItem(KEY_USERNAME, res.username);
    localStorage.setItem(KEY_HOSPITAL, res.hospital_code);
    localStorage.setItem(KEY_NAME, res.full_name);
    localStorage.setItem(KEY_ROLE, 'STAFF');
    this.session.set({ token: res.access, healthId: '', fullName: res.full_name, role: 'STAFF' });
  }

  /** Store a session from the unified login, dispatching on the role claim. */
  setUnifiedSession(res: UnifiedLoginResponse) {
    switch (res.role) {
      case 'DOCTOR':
        this.setDoctorSession(res as DoctorLoginResponse);
        break;
      case 'STAFF':
        this.setStaffSession(res as StaffLoginResponse);
        break;
      default:
        this.setSession(res as LoginResponse);
    }
  }

  logout() {
    this.clearStorage();
    this.session.set({ token: null, healthId: '', fullName: '', role: '' });
  }

  private clearStorage() {
    [KEY_TOKEN, KEY_REFRESH, KEY_HEALTH_ID, KEY_NAME, KEY_WALLET, KEY_ROLE, KEY_LICENSE, KEY_HOSPITAL, KEY_USERNAME]
      .forEach((k) => localStorage.removeItem(k));
  }

  isAuthenticated(): boolean {
    return !!this.session().token;
  }

  get token(): string | null {
    return this.session().token;
  }

  get healthId(): string {
    return this.session().healthId;
  }

  get fullName(): string {
    return this.session().fullName;
  }

  /** 'PATIENT' | 'DOCTOR' | '' */
  get role(): string {
    return this.session().role;
  }

  get licenseNo(): string {
    return localStorage.getItem(KEY_LICENSE) || '';
  }

  get hospitalCode(): string {
    return localStorage.getItem(KEY_HOSPITAL) || '';
  }

  get username(): string {
    return localStorage.getItem(KEY_USERNAME) || '';
  }

  /** True only for an authenticated patient session. */
  get isPatient(): boolean {
    return this.isAuthenticated() && this.role === 'PATIENT';
  }

  /** True only for an authenticated (approved) doctor session. */
  get isDoctor(): boolean {
    return this.isAuthenticated() && this.role === 'DOCTOR';
  }

  /** True only for an authenticated hospital staff session. */
  get isStaff(): boolean {
    return this.isAuthenticated() && this.role === 'STAFF';
  }
}
