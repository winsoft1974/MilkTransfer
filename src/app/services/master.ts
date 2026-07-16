import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, switchMap, of, forkJoin } from 'rxjs';
import { environment } from '../../environments/environment';
import { StorageService } from './storage';

@Injectable({ providedIn: 'root' })
export class MasterService {

  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  constructor(private storage: StorageService) {}

  // ============================
  // FILE / MDB OPERATIONS
  // ============================

  pickAndOpenMdbFile(): Observable<any> {
    return this.storage.openFilePicker().pipe(
      switchMap(info => of(info))
    );
  }

  readSocCodeFromMdb(): string | null {
    const rows = this.storage.readMembers();
    if (!rows.length) return null;

    const code = rows[0]?.custid;
    this.storage.setSocCode(code);
    return code;
  }

  getExpectedYears() {
    return this.storage.generateYearList();
  }

  // ============================
  // COMMON API HEADERS
  // ============================
  private getHeaders() {
    const token = localStorage.getItem('token');

    return {
      headers: new HttpHeaders({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      })
    };
  }

  // ============================
  // SOCIETY
  // ============================
  getSociety(id: number) {
    return this.http.get(`${this.apiUrl}/society/${id}`);
  }

  // ============================
  // DEVICE
  // ============================
  getDevices(socCode: string) {
    return this.http.get(`${this.apiUrl}/Device/DeviceList?socCode=${socCode}`);
  }

  // ============================
  // YEAR
  // ============================
  getYears(socCode: string) {
    return this.http.get(`${this.apiUrl}/Year/YearList?socCode=${socCode}`);
  }

  getBillPeriods(socCode: string, year: string) {
    return this.http.get(`${this.apiUrl}/billtrans/billperiod`, {
      params: { socCode, year }
    });
  }

  // ============================
  // MEMBERS (FINAL CLEAN VERSION)
  // ============================

  getMembersBySociety(socCode: number): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/member/socmemlist?soccode=${socCode}`,
      this.getHeaders()
    );
  }

  /**
   * Updates a single member's director status.
   * PUT /Member/{socCode}/{membCode}  body: { isDir: number }
   */
  updateMemberDirector(socCode: number, membCode: number, isDir: number): Observable<any> {
    return this.http.put(
      `${this.apiUrl}/Member/${socCode}/${membCode}`,
      { isDir },
      this.getHeaders()
    );
  }

  /**
   * Saves changed director values for multiple members in parallel.
   * Only sends a request for members whose isDir value changed.
   */
  updateSocietyMembers(socCode: number, original: any[], updated: any[]): Observable<any[]> {
    const changed = updated.filter(m => {
      const orig = original.find(o => o.membCode === m.membCode);
      return orig && orig.isDir !== m.isDir;
    });

    if (!changed.length) {
      return of([]);
    }

    const requests = changed.map(m =>
      this.updateMemberDirector(socCode, m.membCode, m.isDir)
    );

    return forkJoin(requests);
  }


  // ============================
  // LATEST DATES DASHBOARD
  // ============================
  getLatestAll(socCode: number): Observable<any> {
    return this.http.get(
      `${this.apiUrl}/Acctrn/latest-all?soccode=${socCode}`,
      this.getHeaders()
    );
  }

  // Add this inside the MasterService class in master.ts
sendZones(payload: any): Observable<any> {
  return this.http.post(`${this.apiUrl}/Zoonmst`, payload, this.getHeaders());
}
}