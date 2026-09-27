import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Web3Service } from './web3.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private web3: Web3Service
  ) {}

  private async getHeaders(extra: any = {}): Promise<HttpHeaders> {
    const wallet = await this.web3.getWalletAddress();
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'X-Wallet-Address': wallet
    });

    Object.keys(extra).forEach(key => {
      headers = headers.set(key, extra[key]);
    });

    return headers;
  }

  // ============ USAJILI ============
  async registerPatient(data: any): Promise<Observable<any>> {
    const headers = await this.getHeaders();
    return this.http.post(`${this.baseUrl}/register/`, data, { headers });
  }

  async addRecord(data: any): Promise<Observable<any>> {
    const headers = await this.getHeaders();
    return this.http.post(`${this.baseUrl}/add-record/`, data, { headers });
  }

  // ============ MGONJWA ============
  async getMyRecords(): Promise<Observable<any>> {
    const headers = await this.getHeaders();
    return this.http.get(`${this.baseUrl}/patient/my-records/`, { headers });
  }

  async grantAccess(data: any): Promise<Observable<any>> {
    const headers = await this.getHeaders();
    return this.http.post(`${this.baseUrl}/patient/grant-access/`, data, { headers });
  }

  async revokeAccess(doctorWallet: string): Promise<Observable<any>> {
    const headers = await this.getHeaders();
    return this.http.post(`${this.baseUrl}/patient/revoke-access/`,
      { doctor_wallet: doctorWallet }, { headers });
  }

  async getPendingRequests(): Promise<Observable<any>> {
    const headers = await this.getHeaders();
    return this.http.get(`${this.baseUrl}/patient/pending-requests/`, { headers });
  }

  async approveRequest(requestId: number): Promise<Observable<any>> {
    const headers = await this.getHeaders();
    return this.http.post(`${this.baseUrl}/patient/approve-request/${requestId}/`, {}, { headers });
  }

  async rejectRequest(requestId: number): Promise<Observable<any>> {
    const headers = await this.getHeaders();
    return this.http.post(`${this.baseUrl}/patient/reject-request/${requestId}/`, {}, { headers });
  }

  // ============ DAKTARI ============
  async requestAccess(data: any): Promise<Observable<any>> {
    const headers = await this.getHeaders();
    return this.http.post(`${this.baseUrl}/doctor/request-access/`, data, { headers });
  }

  async viewPatientRecord(healthID: string, facilityID: string): Promise<Observable<any>> {
    const headers = await this.getHeaders({ 'X-Facility-ID': facilityID });
    return this.http.get(`${this.baseUrl}/doctor/patient/${healthID}/`, { headers });
  }

  async breakGlass(data: any): Promise<Observable<any>> {
    const headers = await this.getHeaders();
    return this.http.post(`${this.baseUrl}/doctor/break-glass/`, data, { headers });
  }

  // ============ PUBLIC ============
  async getPublicPatientInfo(healthID: string): Promise<Observable<any>> {
    return this.http.get(`${this.baseUrl}/patient/public-info/${healthID}/`);
  }
}