import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface BillPeriodBind {
  id: number;
  name: string;
  fromDate: string | null;
  toDate: string | null;
}

export interface TableInfo {
  tableName: string;
}

export interface Milktrn {
  milksrno: number;
  mltrno: number;
  trndate: string;
  membCode: number;
  cobf: string;
  fat: number;
  rate: number;
  liters: number;
  amount: number;
  me: number;
  zoonCode: number;
  degree: number;
  lineno: number;
  socCode: number;
  flag: number;
}

@Injectable({ providedIn: 'root' })
export class AccessService {

  private http = inject(HttpClient);
  private apiUrl = environment.accessApiUrl; // Points to https://localhost:7267/api/access

 // Helper to slice timestamps from date parameters to protect the Access ODBC parser
private toCleanDate(dateVal: any): string {
  if (!dateVal) return '';

  // Case 1: Handle native JavaScript Date objects (and Zone.js wrapped Dates) directly
  if (dateVal instanceof Date) {
    if (!isNaN(dateVal.getTime())) {
      const yyyy = dateVal.getFullYear();
      const mm = String(dateVal.getMonth() + 1).padStart(2, '0');
      const dd = String(dateVal.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return '';
  }

  // Case 2: Handle custom library date wrappers (e.g. Moment.js) safely
  if (dateVal && typeof dateVal === 'object' && typeof dateVal.toDate === 'function') {
    const nativeDate = dateVal.toDate();
    if (nativeDate instanceof Date && !isNaN(nativeDate.getTime())) {
      const yyyy = nativeDate.getFullYear();
      const mm = String(nativeDate.getMonth() + 1).padStart(2, '0');
      const dd = String(nativeDate.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  // Case 3: Handle date strings safely
  const strVal = String(dateVal).trim();
  const d = new Date(strVal);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // Safe fallback string splitting
  return strVal.split('T')[0] || '';
}

  // =========================================================
  // FILE & TABLE DISCOVERY
  // =========================================================

  getFiles(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/files`);
  }

  // FIXED: Changed Observable<string[]> to Observable<TableInfo[]> to match C# TableInfo payload
  getTables(fileName: string): Observable<TableInfo[]> {
    return this.http.get<TableInfo[]>(`${this.apiUrl}/tables`, {
      params: { fileName }
    });
  }

  // =========================================================
  // GENERIC DATA FETCH
  // =========================================================

  getTableData(fileName: string, tableName: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/table-data`, {
      params: { fileName, tableName }
    });
  }

  getMembers(fileName: string): Observable<any[]> {
    return this.getTableData(fileName, 'member');
  }

  getratechar(fileName: string): Observable<any[]> {
    return this.getTableData(fileName, 'ratemst');
  }

  // =========================================================
  // SPECIALIZED BILL TRANSFER METHODS
  // =========================================================

  getBillPeriods(fileName: string): Observable<BillPeriodBind[]> {
    return this.http.get<BillPeriodBind[]>(`${this.apiUrl}/bill-periods`, {
      params: { fileName }
    });
  }

  getDeductions(fileName: string, fromDate: string, toDate: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/deductions`, {
      params: { 
        fileName, 
        fromDate: this.toCleanDate(fromDate), 
        toDate: this.toCleanDate(toDate) 
      }
    });
  }

  /**
   * Saves deductions into local Access DB.
   * POST /api/access/save-deductions?fileName=...
   * Body: AccessDedentryDto[]
   */
  saveDeductions(fileName: string, records: any[]): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/save-deductions`,
      records,
      { params: { fileName } }
    );
  }

  getBillTransRecords(fileName: string, fromDate: string, toDate: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/billtrans-records`, {
      params: { 
        fileName, 
        fromDate: this.toCleanDate(fromDate), 
        toDate: this.toCleanDate(toDate) 
      }
    });
  }

  // =========================================================
  // COLLECTION & UTILS
  // =========================================================

  getcollection(
    fileName: string,
    fromDate: string,
    toDate: string,
    collectionTime?: number,
    milkType?: number
  ): Observable<any[]> {
    // FIXED: Formatted date arguments strictly before ODBC mapping
    const params: any = {
      fileName,
      tableName: 'MilkTrn',
      fromDate: this.toCleanDate(fromDate),
      toDate: this.toCleanDate(toDate),
      dateColumn: 'trndate',
      collectionTime: collectionTime ?? 0,
      milkType: milkType ?? 0
    };
    return this.http.get<any[]>(`${this.apiUrl}/table-data-by-date`, { params });
  }

  // =========================================================
  // MILK SALE & IDENTITY METHODS
  // =========================================================

  getCustId(fileName: string): Observable<number> {
    return this.http.get<number>(`${this.apiUrl}/cust-id`, {
      params: { fileName }
    });
  }

  getMilkSaleParamId(fileName: string): Observable<number> {
    return this.http.get<number>(`${this.apiUrl}/sync-milksale-id`, {
      params: { fileName }
    });
  }

  getSyncMilkSale(fileName: string, fromDate: string, toDate: string, time: number): Observable<any> {
    const params = new HttpParams()
      .set('fileName', fileName)
      .set('fromDate', this.toCleanDate(fromDate)) 
      .set('toDate', this.toCleanDate(toDate)) 
      .set('collectionTime', time.toString());

    return this.http.get<any>(`${this.apiUrl}/sync-milksale`, { params });
  }

  // =========================================================
  // ACCOUNTING METHODS
  // =========================================================

  getAccountRecords(fileName: string, fromDate: string, toDate: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/account-records`, {
      params: { 
        fileName, 
        fromDate: this.toCleanDate(fromDate), 
        toDate: this.toCleanDate(toDate) 
      }
    });
  }

  getGlmsRecords(fileName: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/glms-records`, {
      params: { fileName }
    });
  }

  saveToLocal(fileName: string, records: any[]) {
    return this.http.post(`${this.apiUrl}/save-local-collection?fileName=${fileName}`, records);
  }

  // FIXED: Used robust HttpParams map to align exactly with [HttpDelete] route bindings
  clearLocal(fileName: string, from: string, to: string, time: number, deviceId: number) {
    const params = new HttpParams()
      .set('fileName', fileName)
      .set('fromDate', this.toCleanDate(from))
      .set('toDate', this.toCleanDate(to))
      .set('time', time.toString())
      .set('deviceId', deviceId.toString());

    return this.http.delete(`${this.apiUrl}/clear-local-collection`, { params });
  }

  getMilkTransactions(
    fileName: string, 
    fromDate: string, 
    toDate: string, 
    time: number, 
    socCode: number
  ): Observable<Milktrn[]> {
    const params = new HttpParams()
      .set('fileName', fileName)
      .set('fromDate', this.toCleanDate(fromDate))
      .set('toDate', this.toCleanDate(toDate))
      .set('time', time.toString())
      .set('socCode', socCode.toString());

    return this.http.get<Milktrn[]>(`${this.apiUrl}/milk-transactions`, { params });
  }

  getConfigPath(): Observable<string> {
    return this.http.get(`${this.apiUrl}/config-path`, { responseType: 'text' });
  }

  updateConfigPath(newPath: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/config-path`, null, {
      params: { newPath }
    });
  }

  // Add this inside the AccessService class in access.ts
getZoonRecords(fileName: string): Observable<any[]> {
  return this.http.get<any[]>(`${this.apiUrl}/zoon-records`, {
    params: { fileName }
  });
}
}