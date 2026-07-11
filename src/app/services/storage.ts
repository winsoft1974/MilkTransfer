import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { inject, } from '@angular/core';
import { HttpClient } from '@angular/common/http';
export interface MdbFileInfo {
  fileName: string;
  yearKey: string;
  yearDisplay: string;
  file: File;
  lastModified: Date;
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {

  // =========================================================
  // STATE
  // =========================================================
  private _fileInput: HTMLInputElement | null = null;
  private databaseName = '';
  private http = inject(HttpClient);
  // 🔥 In-memory MDB dataset (IMPORTANT FIX)
  private mdbData: Record<string, any[]> = {};
  private tables: any[] = [];
  // =========================================================
  // FILE PICKER
  // =========================================================
  openFilePicker(): Observable<MdbFileInfo> {
    return new Observable(observer => {

      const input = this.getFileInput();
      input.accept = '.mdb';
      input.multiple = false;
      input.value = '';

      const cleanup = () => {
        window.removeEventListener('focus', handleFocus);
        input.onchange = null;
      };

      const handleFocus = () => {
        setTimeout(() => {
          if (!input.files || input.files.length === 0) {
            cleanup();
            observer.complete();
          }
        }, 300);
      };

      input.onchange = (event: Event) => {
        cleanup();

        const files = (event.target as HTMLInputElement).files;

        if (!files || files.length === 0) {
          observer.complete();
          return;
        }

        const file = files[0];
        const info = this.parseMdbFileInfo(file);

        if (!info) {
          observer.error(new Error('Invalid MDB file format'));
          return;
        }

        this.setDatabaseName(info.yearKey);
        this.setYear(info.yearKey);

        observer.next(info);
        observer.complete();
      };

      window.addEventListener('focus', handleFocus);
      input.click();
    });
  }
setTables(tables: any[]) {
  this.tables = tables;
  sessionStorage.setItem('tables', JSON.stringify(tables));
}

getTables(): any[] {
  return this.tables.length
    ? this.tables
    : JSON.parse(sessionStorage.getItem('tables') || '[]');
}
  // =========================================================
  // PARSE FILE NAME
  // =========================================================
  parseMdbFileInfo(file: File): MdbFileInfo | null {

    if (!file.name.toLowerCase().endsWith('.mdb')) return null;

    const nameWithoutExt = file.name.replace(/\.mdb$/i, '');
    const match = nameWithoutExt.match(/(\d{4})$/);

    if (!match) return null;

    const suffix = match[1];

    const start = suffix.slice(0, 2);
    const end = suffix.slice(2, 4);

    return {
      fileName: file.name,
      yearKey: nameWithoutExt,
      yearDisplay: `20${start}-20${end}`,
      file,
      lastModified: new Date(file.lastModified)
    };
  }

  // =========================================================
  // DATABASE NAME
  // =========================================================
  setDatabaseName(name: string): void {
    this.databaseName = name;
    sessionStorage.setItem('mdbFileName', name);
  }

  getDatabaseName(): string {
    return this.databaseName || sessionStorage.getItem('mdbFileName') || '';
  }

  // =========================================================
  // YEAR
  // =========================================================
  setYear(year: string): void {
    sessionStorage.setItem('YearSetting', year);
  }

  getYear(): string {
    return sessionStorage.getItem('YearSetting') || '';
  }

  // =========================================================
  // SOC CODE
  // =========================================================
  setSocCode(code: string): void {
    sessionStorage.setItem('socCode', code);
  }

  getSocCode(): string {
    return sessionStorage.getItem('socCode') || '';
  }

  // =========================================================
  // TOKEN
  // =========================================================
  setToken(token: string): void {
    sessionStorage.setItem('token', token);
  }

  getToken(): string {
    return sessionStorage.getItem('token') || '';
  }

  // =========================================================
  // MDB LOAD (MOCK / API READY)
  // =========================================================
  openMdbFile(file: File): Observable<boolean> {
  const formData = new FormData();
  formData.append('file', file);

  return this.http.post<boolean>(
    `${environment.accessApiUrl}/open`,
    formData
  );
}

  // =========================================================
  // QUERY HELPERS (FIX for all your errors)
  // =========================================================
  queryMdb(sql: string): any[] {
    return [];
  }



  // ─────────────────────────────────────────────
// YEAR LIST GENERATOR (C# replacement)
// ─────────────────────────────────────────────
generateYearList(count: number = 5): { name: string; tvalue: string }[] {

  const years: { name: string; tvalue: string }[] = [];
  const now = new Date();

  const month = now.getMonth() + 1;
  const currentFYStart =
    month >= 4 ? now.getFullYear() : now.getFullYear() - 1;

  for (let i = 0; i < count; i++) {
    const start = currentFYStart - i;
    const end = start + 1;

    const s2 = String(start).slice(-2);
    const e2 = String(end).slice(-2);

    years.push({
      name: `db${s2}${e2}`,
      tvalue: `20${s2}-20${e2}`
    });
  }

  return years;
}
 // =========================================================
  // READ METHODS (STUBS to FIX ERRORS)
  // =========================================================
  readMembers(): any[] { return []; }

  readMilktrn(): any[] { return []; }

  readDedEntry(): any[] { return []; }

  readBilltrans(): any[] { return []; }

  readAcctrn(): any[] { return []; }

  readGlms(): any[] { return []; }

  readMilkSale(): any[] { return []; }

  readMilkSaleParam(): number | null { return null; }

  readUnuploadedMilktrn(): any[] { return []; }

  // =========================================================
  // CHUNK FUNCTION (IMPORTANT FIX)
  // =========================================================
  chunkByField(data: any[], field: string): any[][] {

    if (!Array.isArray(data) || data.length === 0) return [];

    const map = new Map<string, any[]>();

    for (const item of data) {
      const key = item?.[field] ?? 'unknown';

      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key)!.push(item);
    }

    return Array.from(map.values());
  }

  // =========================================================
  // CLEAR
  // =========================================================
  clear(): void {
    sessionStorage.removeItem('YearSetting');
    sessionStorage.removeItem('socCode');
    sessionStorage.removeItem('mdbFileName');
    sessionStorage.removeItem('token');

    this.databaseName = '';
    this.mdbData = {};
  }


// Inside StorageService.ts

readRateChartSummary(rows: any[]): any[] {
  const socCode = this.getSocCode();
  const groups = new Map<number, any[]>();
  
  rows.forEach(r => {
    if (!groups.has(r.rtgrno)) groups.set(r.rtgrno, []);
    groups.get(r.rtgrno)!.push(r);
  });

  const summary: any[] = [];
  groups.forEach((groupRows, rtgrno) => {
    const maxDate = groupRows.reduce((latest, r) => 
      new Date(r.RtDate) > latest ? new Date(r.RtDate) : latest, new Date(0)
    );

    summary.push({
      SocCode: Number(socCode),
      rtgrno: rtgrno,
      rtdates: this.formatDate(maxDate, 'dd / mm / yyyy') // Added spaces to match C#
    });
  });
  return summary;
}

readRateMst(rows: any[], cobf: 'C' | 'B'): any[] {
  const socCode = this.getSocCode();
  const targetType = (cobf === 'C') ? 1 : 2;
  const filtered = rows.filter(r => r.Expr1003 === targetType);

  // Replicating the C# SQL: "where RtDate IN (select max(rtdate) from ratemst group by rtgrno, cobf)"
  const groups = new Map<number, any[]>();
  filtered.forEach(r => {
    if (!groups.has(r.rtgrno)) groups.set(r.rtgrno, []);
    groups.get(r.rtgrno)!.push(r);
  });

  const result: any[] = [];
  groups.forEach(groupRows => {
    const maxDateStr = groupRows.reduce((latest, r) => 
      new Date(r.RtDate) > new Date(latest) ? r.RtDate : latest, groupRows[0].RtDate
    );

    const latestRows = groupRows.filter(r => r.RtDate === maxDateStr);

    latestRows.forEach(r => {
      result.push({
        autorategen: r.rtno,        // EXACT match to C# "rtno as autorategen"
        rtgrno: r.rtgrno,           // EXACT match to lowercase
        rtdate: this.formatDate(new Date(r.RtDate), 'yyyy-mm-dd'), // EXACT match
        socCode: Number(socCode),   // EXACT match
        cobf: cobf,                 // 'C' or 'B'
        fat: r.fat ?? 0,
        rate: r.rate ?? 0,
        degree: r.degree ?? 0
      });
    });
  });
  return result;
}

// Updated format helper to support the spaces in summary date
private formatDate(date: Date, pattern: 'dd / mm / yyyy' | 'yyyy-mm-dd'): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return pattern === 'dd / mm / yyyy' ? `${dd} / ${mm} / ${yyyy}` : `${yyyy}-${mm}-${dd}`;
}


  // =========================================================
  // FILE INPUT
  // =========================================================
  private getFileInput(): HTMLInputElement {
    if (!this._fileInput) {
      this._fileInput = document.createElement('input');
      this._fileInput.type = 'file';
      this._fileInput.style.display = 'none';
      document.body.appendChild(this._fileInput);
    }
    return this._fileInput;
  }
}