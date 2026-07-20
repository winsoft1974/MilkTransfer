  import { Injectable, inject } from '@angular/core';
  import { HttpClient, HttpParams, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
  import { Observable, of, throwError, from as rxFrom } from 'rxjs';
  import { switchMap, catchError, mergeMap, toArray, map, timeout, concatMap } from 'rxjs/operators';
  import { environment } from '../../environments/environment';
  import { StorageService } from './storage';

  export interface DateOnly {
  year: number;
  month: number;
  day: number;
  dayOfWeek?: number;
}

  @Injectable({
    providedIn: 'root'
  })
  export class MilkTransferService {

    private http = inject(HttpClient);
    private apiUrl = environment.apiUrl;

    constructor(private storage: StorageService) {}

    // Standardize dates to raw ISO-8601 strings (YYYY-MM-DD)
  private toIsoDateString(dateVal: any): string {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private safeDouble(val: any): number {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : Math.round((n + Number.EPSILON) * 100) / 100;
  }

    // =========================================================
    // MEMBER
    // =========================================================

    sendMembers(data: any[]): Observable<any> {
      return this.http.post(`${this.apiUrl}/member`, data);
    }

    // =========================================================
    // MILK COLLECTION
    // =========================================================

     // src/app/services/milk-transfer.ts

  checkBillGrpId(fromDate: string, toDate: string, time: number, soc: string): Observable<boolean> {
    const params = new HttpParams()
      .set('fromdate', this.toIsoDateString(fromDate))
      .set('todate', this.toIsoDateString(toDate))
      .set('time', time.toString())
      .set('soccode', soc);

    // Matches Url + "milktrn/CheckBillGrpId" (all lowercase root path) from working C# code
    return this.http.get<any>(`${this.apiUrl}/milktrn/CheckBillGrpId`, { params }).pipe(
      map(res => {
        const count = Number(res);
        return count > 0;
      }),
      catchError((err) => {
        console.error('CheckBillGrpId API Error:', err);
        return throwError(() => err);
      })
    );
  }


 // src/app/services/milk-transfer.ts

/** 
 * Matches GET /api/Milktrn/delete 
 * Parameters: cobf, fromDate, toDate, soccode, time, deviceid
 */
/** 
   * Matches GET /api/Milktrn/delete 
   * Parameters: cobf, fromDate, toDate, soccode, time, deviceid
   */
/** 
   * Matches GET /api/Milktrn/delete 
   * Parameters: cobf, fromDate, toDate, soccode, time, deviceid
   */
  deleteCollection(
    fromDate: string, 
    toDate: string, 
    socCode: string, 
    time: string, 
    cobf: string, 
    deviceId: number
  ): Observable<any> {
    
    // 🔥 WORKAROUND: If time is '0' (Both), sequentially execute Morning ('1') 
    // and Evening ('2') deletes. This bypasses the backend 'time == 0' database query bug.
    if (time === '0') {
      return this.deleteCollection(fromDate, toDate, socCode, '1', cobf, deviceId).pipe(
        concatMap(() => this.deleteCollection(fromDate, toDate, socCode, '2', cobf, deviceId))
      );
    }

    let params = new HttpParams()
      .set('fromDate', this.toIsoDateString(fromDate))
      .set('toDate', this.toIsoDateString(toDate))
      .set('soccode', socCode)
      .set('time', time)
      .set('deviceid', deviceId.toString());

    if (cobf && cobf !== 'A' && cobf !== 'null') {
      params = params.set('cobf', cobf);
    }

    return this.http.get(`${this.apiUrl}/Milktrn/delete`, { params });
  }

  /**
   * Queries the general collection endpoint to see if any records exist on the server
   * for the given period, shift, and device.
   */
  checkCollectionExists(
    fromDate: string, 
    toDate: string, 
    time: number, 
    deviceId: number
  ): Observable<boolean> {
    const soc = this.storage.getSocCode();
    const params = new HttpParams()
      .set('fromdate', this.toIsoDateString(fromDate))
      .set('todate', this.toIsoDateString(toDate))
      .set('time', time.toString())
      .set('soccode', soc.toString())
      .set('deviceid', deviceId.toString());

    return this.http.get<any>(`${this.apiUrl}/milktrn`, { params }).pipe(
      map(res => {
        const count = Number(res);
        return count > 0;
      }),
      catchError(() => of(false))
    );
  }

  
 private safeInt(val: any): number {
    const n = parseInt(val, 10);
    return isNaN(n) ? 0 : n;
  }

  // FIX 4: Declare toDateOnly helper method
  private toDateOnly(val: any): DateOnly {
    const d = new Date(val);
    if (isNaN(d.getTime())) return { year: 0, month: 1, day: 1 };
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      dayOfWeek: d.getDay()
    };
  }

  /**
   * REPLICATES C# MilktrnSend logic
   */
  /**
   * REPLICATES C# MilktrnSend logic (GetData.cs)
   * Ensures mapping matches the aliases used in the C# OleDbDataAdapter queries.
   */
sendMilkCollection(
    fromDate: string,
    toDate: string,
    time: number = 0,
    milk: number = 0,
    overwrite: boolean = false,
    rows: any[] = [],
    skipExistenceCheck: boolean = false,
    deviceId: number = 1
  ): Observable<any> {
    const soc = this.storage.getSocCode();

    const uploadFlow = (): Observable<any> => {
      if (!rows || !rows.length) return of({ uploaded: 0 });

      const grouped = new Map<string, any[]>();
      for (const row of rows) {
        const dateStr = (row.TrnDate || row.trndate || row.tdate || '').split('T')[0];
        if (!grouped.has(dateStr)) grouped.set(dateStr, []);
        grouped.get(dateStr)!.push(row);
      }
      const chunks = Array.from(grouped.values());

      return rxFrom(chunks).pipe(
        mergeMap((chunk: any[]) => {
          const mappedItems = chunk.map(r => ({
            milksrno: 0, 
            mltrno:   this.safeInt(r.mltrno || r.Mltrno || r.trno),
            trndate:  this.toIsoDateString(r.TrnDate || r.trndate || r.tdate),
            membCode: this.safeInt(r.MEMB_CODE || r.membCode || r.MembCode || r.mcode), 
            cobf:     (r.Expr1003 === 1 || r.cobf === 'C' || r.cb === 'C') ? 'C' : 'B',
            fat:      this.safeDouble(r.FAT ?? r.fat),
            rate:     this.safeDouble(r.RATE ?? r.rate),
            liters:   this.safeDouble(r.LITERS ?? r.liters ?? r.liter),
            amount:   this.safeDouble(r.AMOUNT ?? r.amount ?? r.amt),
            me:       this.safeInt(r.ME ?? r.me ?? r.shift ?? time),
            zoonCode: this.safeInt(r.Zoon_Code ?? r.zoonCode ?? r.ZoonCode ?? r.zcode),
            degree:   this.safeDouble(r.DEGREE ?? r.degree ?? r.de1),
            lineno:   this.safeInt(r.Lineno ?? r.lineno ?? r.lno),
            degree2:  this.safeDouble(r.degree2 || r.de2 || 0),
            cans:     this.safeInt(r.Cans || r.cans || 1),
            sampleno: this.safeInt(r.SampleNo || r.sampleno || r.samno || 0),
            socCode:  this.safeInt(soc),
            deviceId: this.safeInt(deviceId),
            flag:     0,
            chflag:   0
          }));

          const payload = {
            milktrn: mappedItems,
            me: this.safeInt(time),
            fromDate: this.toIsoDateString(chunk[0].TrnDate || chunk[0].trndate || fromDate),
            toDate:   this.toIsoDateString(chunk[chunk.length - 1].TrnDate || chunk[chunk.length - 1].trndate || toDate)
          };

          const headers = new HttpHeaders({
            'Content-Type': 'application/json', 
            'accept': '*/*',
            'Authorization': `Bearer ${this.storage.getToken()}`
          });

          return this.http.post(`${this.apiUrl}/Milktrn`, payload, { headers }).pipe(
            switchMap((res: any) => {
             
              const notifyPayload = {
                
                  socCode: this.safeInt(soc), 
                  title: "WinPassbook", 
                  body: "Milk Passbook update is available" 
                
              };
              return this.http.post(`${this.apiUrl}/Notifications/sendBulkNotification`, notifyPayload).pipe(
                map(() => res), 
                catchError(() => of(res))
              );
            })
          );
        }, 3),
        toArray(),
        switchMap(() => of({ uploaded: rows.length }))
      );
    };

    if (skipExistenceCheck) return uploadFlow();

   if (overwrite) {
      const cobfStr = milk === 1 ? 'C' : (milk === 2 ? 'B' : 'A');
      return this.deleteCollection(fromDate, toDate, soc.toString(), time.toString(), cobfStr, deviceId).pipe( // <-- Added .toString() to time
        switchMap(() => uploadFlow())
      );
    }
    return this.checkBillGrpId(fromDate, toDate, time, soc.toString()).pipe(
      switchMap(exists => {
        if (!exists) {
          return uploadFlow();
        } else {
          return of({ exists: true, needsConfirm: true });
        }
      })
    );
  }

    // =========================================================
    // BILL TRANSACTIONS
    // =========================================================

  private recordsExist(records: unknown): boolean {
    if (records == null) return false;
    if (Array.isArray(records)) return records.length > 0;
    const list = (records as { data?: unknown[]; items?: unknown[] }).data
      ?? (records as { data?: unknown[]; items?: unknown[] }).items;
    return Array.isArray(list) && list.length > 0;
  }

  checkBillExists(fromDate: string, toDate: string): Observable<boolean> {
    const params = new HttpParams()
      .set('fromdate', this.toIsoDateString(fromDate))
      .set('todate', this.toIsoDateString(toDate))
      .set('soccode', this.storage.getSocCode());

    return this.http.get<unknown>(`${this.apiUrl}/Billtrans`, {
      params,
      observe: 'response'
    }).pipe(
      timeout(20000),
      map(res => !this.recordsExist(res.body)),
      catchError(() => of(true))
    );
  }

  postBillTrans(data: any[]): Observable<any> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json-patch+json' });
    return this.http.post(`${this.apiUrl}/Billtrans`, data, { headers });
  }

  checkDeductions(fromDate: string, toDate: string): Observable<boolean> {
    const params = new HttpParams()
      .set('fromdate', this.toIsoDateString(fromDate))
      .set('todate', this.toIsoDateString(toDate))
      .set('soccode', this.storage.getSocCode());

    return this.http.get<unknown>(`${this.apiUrl}/dedentry`, {
      params,
      observe: 'response'
    }).pipe(
      timeout(20000),
      map(res => !this.recordsExist(res.body)),
      catchError(() => of(true))
    );
  }

  /**
   * Fetches deduction records from live server for download into Access.
   * GET /api/dedentry?fromdate=&todate=&soccode=
   */
  getDeductionsFromLive(fromDate: string, toDate: string): Observable<any[]> {
    const params = new HttpParams()
      .set('fromdate', this.toIsoDateString(fromDate))
      .set('todate', this.toIsoDateString(toDate))
      .set('soccode', this.storage.getSocCode());

    return this.http.get<any>(`${this.apiUrl}/dedentry`, { params }).pipe(
      map(res => {
        if (Array.isArray(res)) return res;
        if (res && Array.isArray(res.data)) return res.data;
        return [];
      }),
      catchError(() => of([]))
    );
  }

  postDeductions(data: any[]): Observable<any> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json-patch+json' });
    return this.http.post(`${this.apiUrl}/dedentry`, data, { headers });
  }

// // postDeductions(data: any[]): Observable<any> {
// //     const soc = this.storage.getSocCode(); // Get society code from storage

// //     if (!data || data.length === 0) {
// //       return of({ skipped: true, message: 'No deduction records to upload' });
// //     }

// //     const mappedDeductions = data.map(r => ({
// //       dedctnDate: this.toIsoDateString(r.Dedctn_date ?? r.Dedctn_Date ?? r.dedctn_date ?? r.dedctnDate),
// //       dedctnTrno: this.safeInt(r.Dedctn_Trno ?? r.Dedctn_TrNo ?? r.dedctn_trno ?? r.dedctnTrno),
// //       dedcode: this.safeInt(r.Dedcode ?? r.dedcode),
// //       membCode: this.safeInt(r.Memb_code ?? r.Memb_Code ?? r.memb_code ?? r.membCode),
// //       dedctnAmt1: this.safeDouble(r.Dedctn_Amt1 ?? r.Dedctn_amt1 ?? r.dedctn_amt1 ?? r.dedctnAmt1),
// //       actdedAmt: this.safeDouble(r.actded_amt ?? r.actdedAmt ?? r.ActdedAmt ?? 0),
// //       cobf: r.cobf ?? r.Cobf ?? 'C',
      
// //       // Ensure trntype is mapped cleanly
// //       trntype: this.safeInt(r.trntype ?? r.Trntype ?? r.trnType ?? 1),
      
// //       mbillno: this.safeInt(r.mBillNo ?? r.mbillno ?? r.mBillno ?? 0),
// //       billno: this.safeInt(r.BillNo ?? r.billno ?? r.billNo ?? 0),
// //       dedName: r.DedName ?? r.dedName ?? '',
// //       dedearn: this.safeInt(r.Dedearn ?? r.dedearn ?? r.ded_earn ?? 0),
      
// //       // Inject the society code so the live server can route to the correct partition
// //       socCode: Number(soc)
// //     }));

//     const headers = new HttpHeaders({ 'Content-Type': 'application/json-patch+json' });
//     return this.http.post(`${this.apiUrl}/dedentry`, mappedDeductions, { headers });
//   }

   

 /**
 * REPLICATES C# setMilkSaleprarm logic
 * Pushes local Access MilkSale records to the Live Server
 */
// src/app/services/milk-transfer.ts

sendMilkSale(msParam: number, time: number, rows: any[]): Observable<any> {
  const soc = this.storage.getSocCode();
  if (!rows || rows.length === 0) return of({ skipped: true });

  const getSafeNum = (val: any): number => {
    const n = Number(val);
    return isNaN(n) ? 0 : Math.round((n + Number.EPSILON) * 100) / 100;
  };

  const chunks: any[][] = [];
  for (let i = 0; i < rows.length; i += 100) {
    chunks.push(rows.slice(i, i + 100));
  }

  return rxFrom(chunks).pipe(
    mergeMap((chunk: any[]) => {
      const mappedSales = chunk.map(r => ({
        trdate:   this.toIsoDateString(r.trdate || r.Trdate || r.TrDate),
        liters:   getSafeNum(r.liters || r.Liters || r.LITERS),
        cobf:     String(r.cobf || r.Cobf || r.COBF || 'C').substring(0, 1).toUpperCase(),
        me:       Number(r.me || time || 1),
        rate:     getSafeNum(r.rate || r.Rate || r.RATE),
        tot:      getSafeNum(r.tot || r.Tot || r.amount || r.AMOUNT),
        crca:     'R',
        membCode: Number(r.MembCode || r.memb_code || 0),
        zoonCode: Number(r.zoon_code || r.zoonCode || 0),
        fat:      getSafeNum(r.fat || r.Fat || r.FAT),
        deviceId: 1,
        socCode:  Number(soc)
      }));

      // FIXED: Swapped toSwaggerDate() out for clean string date mapping
      const payload = {
        milksale: mappedSales,
        me: Number(time),
        fromDate: this.toIsoDateString(mappedSales[0].trdate),
        toDate:   this.toIsoDateString(mappedSales[mappedSales.length - 1].trdate)
      };

      const url = `${this.apiUrl}/MilkSale?MSparam=${msParam}&socCode=${soc}`;

      const headers = new HttpHeaders({
        'Content-Type': 'application/json-patch+json',
        'accept': '*/*'
      });

      return this.http.post(url, payload, { headers }); 
      
    }, 3), 
    toArray(),
    switchMap(() => of({ uploaded: rows.length }))
  );
}

   
  // =========================================================
    // ACCOUNT (acctrn)
    // =========================================================

  // =========================================================
    // ACCOUNT (acctrn)
    // =========================================================

   // =========================================================
    // ACCOUNT (acctrn)
    // =========================================================

    /**
     * Matches C# AccountSend logic:
     * 1. Calls GET Acctrn/delete
     * 2. Chunks the data
     * 3. POSTs to Acctrn with strict lowercase and underscored properties matching your pgAdmin schema
     */
    // sendAccounts(fromDate: string, toDate: string, rows: any[]): Observable<any> {
    //   const soc = this.storage.getSocCode();

    //   if (!rows || rows.length === 0) {
    //     return of({ skipped: true, message: 'No account records to upload' });
    //   }

    //   // 1. Perform the Delete first (GET request)
    //   return this.http.get(`${this.apiUrl}/Acctrn/delete`, {
    //     params: { 
    //       fromDate: this.toIsoDateString(fromDate), 
    //       toDate: this.toIsoDateString(toDate), 
    //       soccode: soc 
    //     }
    //   }).pipe(
    //     switchMap(() => {
    //       // 2. Chunk the data (Groups of 100 like the original C# logic)
    //       const chunks: any[][] = [];
    //       for (let i = 0; i < rows.length; i += 100) {
    //         chunks.push(rows.slice(i, i + 100));
    //       }

    //       // 3. Upload each chunk
    //       return rxFrom(chunks).pipe(
    //         mergeMap((chunk: any[]) => {
    //           // Explicitly map all database keys to lowercase/underscored keys matching pgAdmin columns
    //           const mappedChunk = chunk.map(r => ({
    //             trno:             this.safeInt(r.Trno ?? r.trno),
    //             accno:            this.safeInt(r.Accno ?? r.accno),
    //             daccno:           this.safeInt(r.Daccno ?? r.daccno),
    //             trntype:          r.Trntype ?? r.trntype ?? '',
    //             crdb:             r.Crdb ?? r.crdb ?? '',
    //             docno:            this.safeInt(r.Docno ?? r.docno),
    //             trdates:           this.toIsoDateString(r.Trdates ?? r.Trdate ?? r.trdate),
    //             part:             r.part ?? r.Part ?? '',
    //             amt:              this.safeDouble(r.Amt ?? r.amt),
    //             no:               this.safeInt(r.No ?? r.no),
    //             sbaccno:          this.safeInt(r.SbAccNo ?? r.sbaccno ?? r.sbAccNo), // Maps to sbaccno
    //             chqdate:          this.toIsoDateString(r.ChqDates ?? r.Chqdates ?? r.ChqDate ?? r.chqdates ?? r.chqdate),
    //             bankrecondate:    this.toIsoDateString(r.BankReconDates ?? r.BankReconDate ?? r.bankReconDates ?? r.bankrecondate),
    //             voucher_no:       this.safeInt(r.Voucher_No ?? r.voucher_no ?? r.voucherNo), // Maps to voucher_no
    //             post_flag:        this.safeInt(r.Post_Flag ?? r.post_flag ?? r.postFlag),   // Maps to post_flag
    //             subtypeno:        this.safeInt(r.SubTypeNo ?? r.subtypeno ?? r.subTypeNo),   // Maps to subtypeno
    //             bill_no:          this.safeInt(r.Bill_No ?? r.bill_no ?? r.billNo),          // Maps to bill_no
    //             opind:            this.safeInt(r.OpInd ?? r.opind),                          // Maps to opind
    //             chqno:            String(r.ChqNos ?? r.ChqNo ?? r.chqno ?? '0'),             // Maps to chqno
    //             passind:          this.safeInt(r.PassInd ?? r.passind),                      // Maps to passind
    //             sysdate:          this.toIsoDateString(r.sysdates ?? r.SysDate ?? r.sysdate),
    //             usercode:         this.safeInt(r.UserCode ?? r.usercode ?? r.userCode),      // Maps to usercode
    //             bouncereason:     r.BounceReason ?? r.bouncereason ?? '',
    //             strbillno:        this.safeInt(r.StrBillNos ?? r.strbillno ?? r.strBillNo),  // Maps to strbillno
    //             billdetind:       this.safeInt(r.BillDetInd ?? r.billdetind),                // Maps to billdetind
    //             billtypeno:       this.safeInt(r.BillTypeNo ?? r.billtypeno ?? r.billTypeNo),// Maps to billtypeno
    //             subamt:           this.safeDouble(r.SubAmt ?? r.subamt ?? r.subAmt),
    //             crdays:           this.safeInt(r.CrDays ?? r.crdays ?? r.crDays),
    //             linenos:          this.safeInt(r.LineNos ?? r.linenos ?? r.lineNos),
    //             refaccno:         this.safeInt(r.RefAccNos ?? r.refaccno ?? r.refAccNo),     // Maps to refaccno
    //             refsbaccno:       this.safeInt(r.RefSbAccNos ?? r.refsbaccno ?? r.refSbAccNo),// Maps to refsbaccno
    //             soccode:          Number(soc)
    //           }));

    //           const payload = {
    //             acctrn: mappedChunk,
    //             fromDate: this.toIsoDateString(fromDate),
    //             toDate: this.toIsoDateString(toDate)
    //           };

    //           return this.http.post(`${this.apiUrl}/Acctrn`, payload);
    //         }, 3), 
    //         toArray()
    //       );
    //     })
    //   );
    // }





    // sendAccounts(fromDate: string, toDate: string, rows: any[]): Observable<any> {
    //   const soc = this.storage.getSocCode();

    //   if (!rows || rows.length === 0) {
    //     return of({ skipped: true, message: 'No account records to upload' });
    //   }

    //   // 1. Logic moved to sequential upload to prevent database locks and duplicates
    //   const chunks: any[][] = [];
    //   for (let i = 0; i < rows.length; i += 100) {
    //     chunks.push(rows.slice(i, i + 100));
    //   }

    //   return rxFrom(chunks).pipe(
    //     // 🔥 FIX: Use concatMap (sequential) instead of mergeMap (parallel)
    //     concatMap((chunk: any[]) => {
    //       const mappedChunk = chunk.map(r => ({
    //         trno: this.safeInt(r.Trno ?? r.trno),
    //         accno: this.safeInt(r.Accno ?? r.accno),
    //         daccno: this.safeInt(r.Daccno ?? r.daccno),
    //         trntype: r.Trntype ?? r.trntype ?? '',
    //         crdb: r.Crdb ?? r.crdb ?? '',
    //         docno: this.safeInt(r.Docno ?? r.docno),

    //         // Match C# Model: Trdates
    //         trdates: this.toIsoDateString(r.Trdates ?? r.Trdate ?? r.trdate),

    //         part: r.part ?? r.Part ?? '',
    //         amt: this.safeDouble(r.Amt ?? r.amt),
    //         no: this.safeInt(r.No ?? r.no),
    //         sbaccno: this.safeInt(r.SbAccNo ?? r.sbaccno ?? r.sbAccNo),
    //         chqdates: this.toIsoDateString(r.ChqDates ?? r.Chqdates ?? r.ChqDate ?? r.chqdates ?? r.chqdate),
    //         bankrecondates: this.toIsoDateString(r.BankReconDates ?? r.BankReconDate ?? r.bankReconDates ?? r.bankrecondate),
    //         voucher_no: this.safeInt(r.Voucher_No ?? r.voucher_no ?? r.voucherNo),
    //         post_flag: this.safeInt(r.Post_Flag ?? r.post_flag ?? r.postFlag),
    //         subtypeno: this.safeInt(r.SubTypeNo ?? r.subtypeno ?? r.subTypeNo),
    //         bill_no: this.safeInt(r.Bill_No ?? r.bill_no ?? r.billNo),
    //         opind: this.safeInt(r.OpInd ?? r.opind),
    //         chqno: String(r.ChqNos ?? r.ChqNo ?? r.chqno ?? '0'),
    //         passind: this.safeInt(r.PassInd ?? r.passind),

    //         // Match C# Model: SysDates
    //         sysdates: this.toIsoDateString(r.sysdates ?? r.SysDate ?? r.sysdate),

    //         usercode: this.safeInt(r.UserCode ?? r.usercode ?? r.userCode),
    //         bouncereason: r.BounceReason ?? r.bouncereason ?? '',
    //         strbillno: this.safeInt(r.StrBillNos ?? r.strbillno ?? r.strBillNo),
    //         billdetind: this.safeInt(r.BillDetInd ?? r.billdetind),
    //         billtypeno: this.safeInt(r.BillTypeNo ?? r.billtypeno ?? r.billTypeNo),
    //         subamt: this.safeDouble(r.SubAmt ?? r.subamt ?? r.subAmt),
    //         crdays: this.safeInt(r.CrDays ?? r.crdays ?? r.crDays),
    //         linenos: this.safeInt(r.LineNos ?? r.linenos ?? r.lineNos),
    //         refaccno: this.safeInt(r.RefAccNos ?? r.refaccno ?? r.refAccNo),
    //         refsbaccno: this.safeInt(r.RefSbAccNos ?? r.refsbaccno ?? r.refSbAccNo),
    //         soccode: Number(soc)
    //       }));

    //       const payload = {
    //         acctrn: mappedChunk,
    //         fromDate: this.toIsoDateString(fromDate),
    //         toDate: this.toIsoDateString(toDate)
    //       };

    //       return this.http.post(`${this.apiUrl}/Acctrn`, payload);
    //     }),
    //     toArray()
    //   );
    // }

sendAccounts(fromDate: string, toDate: string, rows: any[]): Observable<any> {
    const soc = this.storage.getSocCode();

    if (!rows || rows.length === 0) {
      return of({ skipped: true, message: 'No account records to upload' });
    }

    // 1. Logic moved to sequential upload to prevent database locks and duplicates
    const chunks: any[][] = [];
    for (let i = 0; i < rows.length; i += 100) {
      chunks.push(rows.slice(i, i + 100));
    }

    return rxFrom(chunks).pipe(
      // sequentially upload chunks
      concatMap((chunk: any[]) => {
        const mappedChunk = chunk.map(r => ({
          trno: this.safeInt(r.Trno ?? r.trno),
          accno: this.safeInt(r.Accno ?? r.accno),
          daccno: this.safeInt(r.Daccno ?? r.daccno),
          trntype: r.Trntype ?? r.trntype ?? '',
          crdb: r.Crdb ?? r.crdb ?? '',
          docno: this.safeInt(r.Docno ?? r.docno),

          // Match C# Model: Trdates
          trdates: this.toIsoDateString(r.Trdates ?? r.Trdate ?? r.trdate),

          part: r.part ?? r.Part ?? '',
          amt: this.safeDouble(r.Amt ?? r.amt),
          no: this.safeInt(r.No ?? r.no),
          sbaccno: this.safeInt(r.SbAccNo ?? r.sbaccno ?? r.sbAccNo),
          chqdates: this.toIsoDateString(r.ChqDates ?? r.Chqdates ?? r.ChqDate ?? r.chqdates ?? r.chqdate),
          bankrecondates: this.toIsoDateString(r.BankReconDates ?? r.BankReconDate ?? r.bankReconDates ?? r.bankrecondate),
          
          // 🔥 FIX: Renamed keys to match C# properties (VoucherNo, PostFlag, BillNo)
          voucherNo: this.safeInt(r.Voucher_No ?? r.voucher_no ?? r.voucherNo),
          postFlag: this.safeInt(r.Post_Flag ?? r.post_flag ?? r.postFlag),
          subtypeno: this.safeInt(r.SubTypeNo ?? r.subtypeno ?? r.subTypeNo),
          billNo: this.safeInt(r.Bill_No ?? r.bill_no ?? r.billNo),
          
          opind: this.safeInt(r.OpInd ?? r.opind),
          chqno: String(r.ChqNos ?? r.ChqNo ?? r.chqno ?? '0'),
          passind: this.safeInt(r.PassInd ?? r.passind),

          // Match C# Model: SysDates
          sysdates: this.toIsoDateString(r.sysdates ?? r.SysDate ?? r.sysdate),

          usercode: this.safeInt(r.UserCode ?? r.usercode ?? r.userCode),
          
          // 🔥 FIX: Renamed key to match C# property BouncerReason
          bouncerreason: r.BounceReason ?? r.bouncereason ?? '',
          
          strbillno: this.safeInt(r.StrBillNos ?? r.strbillno ?? r.strBillNo),
          billdetind: this.safeInt(r.BillDetInd ?? r.billdetind),
          billtypeno: this.safeInt(r.BillTypeNo ?? r.billtypeno ?? r.billTypeNo),
          
          // 🔥 FIX: Mapped using safeInt to align with your pgAdmin "subamt integer" column
          subamt: this.safeInt(r.SubAmt ?? r.subamt ?? r.subAmt),
          
          crdays: this.safeInt(r.CrDays ?? r.crdays ?? r.crDays),
          linenos: this.safeInt(r.LineNos ?? r.linenos ?? r.lineNos),
          refaccno: this.safeInt(r.RefAccNos ?? r.refaccno ?? r.refAccNo),
          refsbaccno: this.safeInt(r.RefSbAccNos ?? r.refsbaccno ?? r.refSbAccNo),
          soccode: Number(soc)
        }));

        const payload = {
          acctrn: mappedChunk,
          fromDate: this.toIsoDateString(fromDate),
          toDate: this.toIsoDateString(toDate)
        };

        return this.http.post(`${this.apiUrl}/Acctrn`, payload);
      }),
      toArray()
    );
  }

    deleteAccounts(fromDate: string, toDate: string, socCode: string): Observable<any> {
      const params = new HttpParams()
        .set('fromDate', this.toIsoDateString(fromDate))
        .set('toDate', this.toIsoDateString(toDate))
        .set('soccode', socCode);

      return this.http.get(`${this.apiUrl}/Acctrn/delete`, { params });
    }

    



    /**
     * Checks if account records exist on live server
     */
    checkAccountServerStatus(from: string, to: string): Observable<any[]> {
      const soc = this.storage.getSocCode();
      const params = new HttpParams()
        .set('fromDate', this.toIsoDateString(from))
        .set('ToDate', this.toIsoDateString(to))
        .set('socitycode', soc);

      return this.http.get<any[]>(`${this.apiUrl}/Acctrn/list`, { params });
    }

/** 




    // =========================================================
    // GLMS (General Ledger Master)
    // =========================================================

    /**
     * Matches C# GlmsSend logic:
     * 1. Maps the entire list with explicit lowercase/underscored types matching pgAdmin
     * 2. POSTs the entire table at once
     */
    // sendGlms(rows: any[]): Observable<any> {
    //   const soc = this.storage.getSocCode();

    //   if (!rows || rows.length === 0) {
    //     return of({ skipped: true, message: 'No GLMS records to upload' });
    //   }

    //   // Explicitly map all database columns to safe lowercase/underscored models matching pgAdmin
    //   const mappedRows = rows.map(r => ({
    //     accno:            this.safeInt(r.Accno ?? r.accno),
    //     accname:          r.AccName ?? r.accname ?? r.Accname ?? '',
    //     actno:            this.safeInt(r.Actnos ?? r.Actno ?? r.actnos ?? r.actno),
    //     opbal:            this.safeDouble(r.Opbal ?? r.opbal),
    //     crtot:            this.safeDouble(r.Crtot ?? r.crtot),
    //     drtot:            this.safeDouble(r.Drtot ?? r.drtot),
    //     clbal:            this.safeDouble(r.Clbal ?? r.clbal),
    //     type:             this.safeInt(r.Type ?? r.type),
    //     dcodeno:          this.safeInt(r.Dcodeno ?? r.dcodeno),
    //     locktype:         r.Locktype ?? r.locktype ?? '',
    //     pltype:           r.Pltype ?? r.pltype ?? '',
    //     dlink:            this.safeInt(r.DLink ?? r.dlink ?? r.Dlink),
    //     accname_eng:      r.accname_Eng ?? r.accname_eng ?? r.accnameEng ?? '', // Maps to accname_eng
    //     subtypeno:        this.safeInt(r.SubTypeNo ?? r.subtypeno ?? r.subTypeNo),
    //     sales_taxno:      r.Sales_TaxNo ?? r.sales_taxno ?? r.salesTaxNo ?? '', // Maps to sales_taxno
    //     address:          r.Address ?? r.address ?? '',
    //     is_supplier:      this.safeInt(r.Is_Supplier ?? r.is_supplier ?? r.isSupplier), // Maps to is_supplier
    //     show_subdetail:   this.safeInt(r.Show_SubDetail ?? r.show_subdetail ?? r.showSubDetail), // Maps to show_subdetail
    //     phoneno:          r.PhoneNo ?? r.phoneno ?? r.phonenumber ?? '',
    //     fax:              r.Fax ?? r.fax ?? '',
    //     email:            r.Email ?? r.email ?? '',
    //     mobile:           r.Mobile ?? r.mobile ?? '',
    //     tinno:            r.Tinno ?? r.tinno ?? '',
    //     cstno:            r.CSTNo ?? r.cstno ?? r.cstNo ?? '',
    //     sysdate:          this.toIsoDateString(r.SysDate ?? r.sysdate ?? r.sysDate),
    //     usercode:         this.safeInt(r.UserCode ?? r.usercode ?? r.userCode),
    //     billdetind:       this.safeInt(r.BillDetInd ?? r.billdetind),
    //     show_deddtl:      this.safeInt(r.Show_DedDtl ?? r.show_deddtl ?? r.showDedDtl), // Maps to show_deddtl
    //     lastyrbal:        this.safeDouble(r.LastYrBal ?? r.lastyrbal ?? r.lastYrBal),
    //     gstno:            r.GSTno ?? r.gstno ?? r.gstNo ?? '',
    //     soccode:          Number(soc) // Standardized to strictly lowercase
    //   }));

    //   return this.http.post(`${this.apiUrl}/Glms`, mappedRows);
    // }

    sendGlms(rows: any[]): Observable<any> {
    const soc = this.storage.getSocCode();

    if (!rows || rows.length === 0) {
      return of({ skipped: true, message: 'No GLMS records to upload' });
    }

    // Explicitly map keys to match C# properties to allow successful JSON deserialization
    const mappedRows = rows.map(r => ({
      accno:            this.safeInt(r.Accno ?? r.accno),
      accname:          r.AccName ?? r.accname ?? r.Accname ?? '',
      
      // 🔥 FIX: Renamed key to match C# property name 'Actnos'
      actnos:           this.safeInt(r.Actnos ?? r.Actno ?? r.actnos ?? r.actno),
      
      opbal:            this.safeDouble(r.Opbal ?? r.opbal),
      crtot:            this.safeDouble(r.Crtot ?? r.crtot),
      drtot:            this.safeDouble(r.Drtot ?? r.drtot),
      clbal:            this.safeDouble(r.Clbal ?? r.clbal),
      type:             this.safeInt(r.Type ?? r.type),
      dcodeno:          this.safeInt(r.Dcodeno ?? r.dcodeno),
      locktype:         r.Locktype ?? r.locktype ?? '',
      pltype:           r.Pltype ?? r.pltype ?? '',
      dlink:            this.safeInt(r.DLink ?? r.dlink ?? r.Dlink),
      accname_eng:      r.accname_Eng ?? r.accname_eng ?? r.accnameEng ?? '', 
      subtypeno:        this.safeInt(r.SubTypeNo ?? r.subtypeno ?? r.subTypeNo),
      
      // 🔥 FIX: Renamed key to match C# property name 'SalesTaxno'
      salesTaxno:       r.Sales_TaxNo ?? r.sales_taxno ?? r.salesTaxNo ?? '', 
      
      address:          r.Address ?? r.address ?? '',
      
      // 🔥 FIX: Renamed key to match C# property name 'IsSupplier'
      isSupplier:       this.safeInt(r.Is_Supplier ?? r.is_supplier ?? r.isSupplier), 
      
      // 🔥 FIX: Renamed key to match C# property name 'ShowSubdetail'
      showSubdetail:    this.safeInt(r.Show_SubDetail ?? r.show_subdetail ?? r.showSubDetail), 
      
      phoneno:          r.PhoneNo ?? r.phoneno ?? r.phonenumber ?? '',
      fax:              r.Fax ?? r.fax ?? '',
      email:            r.Email ?? r.email ?? '',
      mobile:           r.Mobile ?? r.mobile ?? '',
      tinno:            r.Tinno ?? r.tinno ?? '',
      cstno:            r.CSTNo ?? r.cstno ?? r.cstNo ?? '',
      sysdate:          this.toIsoDateString(r.SysDate ?? r.sysdate ?? r.sysDate),
      usercode:         this.safeInt(r.UserCode ?? r.usercode ?? r.userCode),
      billdetind:       this.safeInt(r.BillDetInd ?? r.billdetind),
      
      // 🔥 FIX: Renamed key to match C# property name 'ShowDedDt'
      showDedDt:        this.safeInt(r.Show_DedDtl ?? r.show_deddtl ?? r.showDedDtl), 
      
      lastyrbal:        this.safeDouble(r.LastYrBal ?? r.lastyrbal ?? r.lastYrBal),
      gstno:            r.GSTno ?? r.gstno ?? r.gstNo ?? '',
      soccode:          Number(soc)
    }));

    return this.http.post(`${this.apiUrl}/Glms`, mappedRows);
  }

  // =========================================================
  // DOWNLOAD / SYNC (Fetching FROM Live Server to Local)
  // =========================================================

  /**
   * Matches C# downloadcollection: Fetches records from Live Server
   */
 collectionDownload(fromDate: string, toDate: string, time: number, cobf: string, deviceId: number): Observable<any[]> {
    const params = new HttpParams()
      .set('fromDate', this.toIsoDateString(fromDate))
      .set('toDate',   this.toIsoDateString(toDate))
      .set('time',     time.toString())
      .set('cobf',     cobf)
      .set('soccode',  this.storage.getSocCode())
      .set('deviceid', deviceId.toString());

    return this.http.get<any[]>(`${this.apiUrl}/Milktrn/milkreceive`, { params });
  }

 // =========================================================
// MILK COLLECTION (Check and Upload)
// =========================================================
/**
   * Pushes batched sync data for MilkSale
   */
  /**
 * THE BRIDGE CONNECTOR
 * Takes pre-fetched data from the Bridge API and pushes it to the Live Server.
 * Corrects Date strings into Swagger Objects and ensures strict Query Params.
 */
milkSaleSyncPush(msParam: string, payload: any): Observable<any> {
    const soc = this.storage.getSocCode();

    const mappedSales = (payload.milksale || []).map((s: any) => ({
      trdate:     this.toIsoDateString(s.trdate || s.Trdate || s.TrDate), 
      liters:     this.safeDouble(s.liters || s.Liters),
      cobf:       String(s.cobf || s.Cobf || 'C').substring(0, 1).toUpperCase(),
      me:         this.safeInt(s.me || payload.me || 1),
      rate:       this.safeDouble(s.rate || s.Rate),
      tot:        this.safeDouble(s.tot || s.Tot || s.amount),
      crca:       'R', 
      membCode:   this.safeInt(s.MembCode || s.memb_code || 0),
      zoonCode:   this.safeInt(s.zoon_code || s.zoonCode || 0),
      fat:        this.safeDouble(s.fat || s.Fat),
      deviceId:   this.safeInt(s.deviceId || 1),
      mstCode:    this.safeInt(s.mstcode ?? s.MSTcode ?? s.MSTCode ?? s.mst_code),
      postflag:   String(s.Post_flag ?? s.post_flag ?? s.Postflag ?? s.postflag ?? '').substring(0, 5),
      gavaliCode: this.safeInt(s.Gavali_Code ?? s.gavali_code ?? s.GavaliCode ?? s.gavaliCode),
      prodcode:   this.safeInt(s.prod_code ?? s.prod_Code ?? s.prodcode), 
     custname:   String(s.custname ?? s.CustName ?? s.Custname ?? '').substring(0, 30),                    
      
      // 🔥 FIX: Use safeInt to guarantee a clean number and prevent NaN JSON serialization errors
      socCode:    this.safeInt(soc) 
    }));

    // Ensure fromDate and toDate have a fallback to prevent 400 Bad Request on C# DateOnly properties
    const finalPayload = {
      milksale: mappedSales,
      me:       this.safeInt(payload.me || 1),
      fromDate: this.toIsoDateString(payload.fromDate || new Date()),
      toDate:   this.toIsoDateString(payload.toDate || new Date())
    };

    const headers = new HttpHeaders({
      'Content-Type': 'application/json-patch+json',
      'accept': '*/*'
    });

    const url = `${this.apiUrl}/MilkSale?MSparam=${msParam}&socCode=${this.safeInt(soc)}`;
    return this.http.post(url, finalPayload, { headers });
  }
  // src/app/services/milk-transfer.ts

/**
 * FINAL FIX FOR 400: Strict Type Casting and Case Sensitivity
 * Matches C# GetData.cs Line 335 (Manual Fallback SQL Aliases)
 */
// src/app/services/milk-transfer.ts

/**
 * REPLICATES C# Fallback logic (GetData.cs Line 335 - 360)
 * Used when the server is empty or requires a manual sync of local data.
 * Fixes: Strict Date Objects, 2-Decimal Rounding, and camelCase mapping.
 */
postMilkTrnManual(payload: any, deviceId: number = 1): Observable<any> {
    const soc = this.storage.getSocCode();
    
    const finalPayload = {
      milktrn: payload.milktrn.map((r: any) => ({
        ...r,
        trndate: this.toIsoDateString(r.trndate || r.TrnDate || r.tdate),
        socCode: Number(soc),
        deviceId: Number(deviceId),
        flag:     this.safeInt(r.flag ?? 0),
        chflag:   this.safeInt(r.chflag ?? r.flag ?? 0) // Explicitly maps chflag to prevent 23502
      })),
      me: Number(payload.me),
      fromDate: this.toIsoDateString(payload.fromDate),
      toDate: this.toIsoDateString(payload.toDate)
    };

    const headers = new HttpHeaders({
      'Content-Type': 'application/json', 
      'accept': '*/*'
    });

    return this.http.post(`${this.apiUrl}/Milktrn`, finalPayload, { headers });
  }



/**
 * FINAL FIX FOR GET 400: Match C# Line 72 exactly
 */
checkMilkSaleServerStatus(from: string, to: string, time: number, deviceId: number): Observable<any> {
  const soc = this.storage.getSocCode();
  
  const params = new HttpParams()
    .set('fromdate', this.toIsoDateString(from))
    .set('todate', this.toIsoDateString(to))
    .set('time', time.toString())
    .set('soccode', soc.toString())
    .set('deviceid', deviceId.toString()); // <-- Added deviceid parameter

  return this.http.get<any[]>(`${this.apiUrl}/milktrn`, { params });
}


// Helper for date formatting inside the service
private formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

 getDevices(socCode: string | number): Observable<any[]> {
    const params = new HttpParams().set('socCode', socCode.toString());
    return this.http.get<any[]>(`${this.apiUrl}/Device/DeviceList`, { params });
  }

/** 
 * Matches C# downloadcollection (Line 263)
 * Logic: GET Milktrn/milkreceive 
 */
getCollectionFromLive(fromDate: string, toDate: string, time: number, deviceId: number, cobf: string): Observable<any[]> {
  const soc = this.storage.getSocCode();
  
  // Use specific param names found in C# string fullurl (Line 268)
  const params = new HttpParams()
    .set('cobf', cobf) // C# sends "O", "C", or "B"
    .set('fromDate', fromDate)
    .set('toDate', toDate)
    .set('soccode', soc)
    .set('time', time.toString())
    .set('deviceid', deviceId.toString());

  return this.http.get<any[]>(`${this.apiUrl}/Milktrn/milkreceive`, { params });
}
    // =========================================================
    // AUTO UPLOAD
    // =========================================================

    updateNullUploadFlags(): Observable<any> {
      return this.http.post(`${this.apiUrl}/Milktrn/UpdateNull`, {}).pipe(
        catchError(err => {
          console.error('UpdateNull failed:', err);
          return of(null);
        })
      );
    }

    autoMilkUpload(activeDate: string): Observable<any> {
      return this.http.post(`${this.apiUrl}/Milktrn/SingleUpload`, { activeDate }).pipe(
        catchError(err => {
          console.error('AutoMilkUpload failed:', err);
          throw err;
        })
      );
    }

    runAutoUploadCycle(activeDate: string): Observable<any> {
      return this.updateNullUploadFlags().pipe(
        switchMap(() => this.autoMilkUpload(activeDate))
      );
    }

    // =========================================================
    // RATE CHART
    // =========================================================

    sendRateChart(cobf: 'C' | 'B', rawRows: any[]): Observable<any> {
      const summary = this.storage.readRateChartSummary(rawRows);
      const details = this.storage.readRateMst(rawRows, cobf);

      return this.http.post(`${this.apiUrl}/Rate/ratechart`, summary).pipe(
        switchMap(() => {
          if (!details.length) return of({ uploaded: 0 });

          const chunks = this.storage.chunkByField(details, 'rtgrno');

          return rxFrom(chunks).pipe(
            mergeMap(chunk => this.http.post(`${this.apiUrl}/rate`, chunk), 1),
            toArray()
          );
        })
      );
    }

    // =========================================================
    // NOTIFICATION
    // =========================================================

    sendNotification(payload: any): Observable<any> {
      return this.http.post(`${this.apiUrl}/Notifications/sendBulkNotification`, payload);
    }

  } // ← single closing brace for the class