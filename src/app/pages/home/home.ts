import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, NgZone } from '@angular/core';
import { firstValueFrom, timeout, catchError, of, defaultIfEmpty, Observable } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { AccessService, BillPeriodBind  } from '../../services/access';
import { StorageService } from '../../services/storage';
import { MilkTransferService } from '../../services/milk-transfer';
import { MasterService } from '../../services/master';
import { LanguageService } from '../../services/language';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageToggleComponent } from '../../components/language-toggle/language-toggle';
import { HttpErrorResponse } from '@angular/common/http';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { CustomDateAdapter, CUSTOM_DATE_FORMATS } from '../../shared/date-format';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, LanguageToggleComponent, MatDatepickerModule,
    MatNativeDateModule,
    MatFormFieldModule,
    MatInputModule],
   providers: [
    { provide: DateAdapter, useClass: CustomDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: CUSTOM_DATE_FORMATS }
  ],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomeComponent implements OnInit, OnDestroy {

  storage = inject(StorageService);
  milkService = inject(MilkTransferService);
  masterService = inject(MasterService);
  accessService = inject(AccessService);
  lang = inject(LanguageService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  private t(key: string, params?: Record<string, string | number>): string {
    return this.lang.t(key, params);
  }

  translateStepStatus(status: string): string {
    const key = `home.progress.${status}`;
    const translated = this.t(key);
    return translated === key ? status : translated;
  }
  
   selectedDevice: any = "";
  activeTab = 'upload';
  statusMsg = '';
  private statusClearTimer: ReturnType<typeof setTimeout> | null = null;

  transferCollection = true;
  transferMilkSale = false;
  transferAccount = false;

  showTransferProgress = false;
  transferPercent = 0;
  transferStepLabel = '';
  transferFinished = false;
  transferRecordsDone = 0;
  transferRecordsTotal = 0;
  activeTransferKind: 'upload' | 'master' | 'bill' | 'download-col' | 'download-sale' | 'download-ded' | null = null;
  transferSteps: {
    name: string;
    status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
    totalRecords: number;
    doneRecords: number;
    detail: string;
  }[] = [];

  isMasterUploading = false;

  // ── Toast notifications ──
  toasts: { id: number; type: 'info' | 'success' | 'warning' | 'error'; message: string }[] = [];
  private toastCounter = 0;

  // ── Transfer elapsed timer ──
  transferElapsedSeconds = 0;
  private elapsedInterval: any = null;
  private slowStepInterval: any = null;

  years: { name: string; tvalue: string }[] = [];

  selectedYear = '';
 dbFiles: string[] = [];
  selectedBillPeriod = '';

  fromDate = '';
  toDate = '';
  collectionTime = 0;
  milkType = 0;
cobf = '';
  downloadFromDate = '';
  downloadToDate = '';
  downloadTime = 0;
  downloadMilkType = 0;

  autoUpload = false;
  private autoTimer: any;

  devices: any[] = [];

  society: any = null;
  hasCollectionApp = false;
  hasMilkSale = false;
  hasLedger = false;

  latestDates: {
    milkCollection: string; milkCollectionMe: number | null; milkCollectionCobf: string;
    milkSale:       string; milkSaleMe:       number | null; milkSaleCobf:       string;
    account:        string;
    billTransfer:   string;
  } = {
    milkCollection: '--', milkCollectionMe: null, milkCollectionCobf: '',
    milkSale:       '--', milkSaleMe:       null, milkSaleCobf:       '',
    account:        '--',
    billTransfer:   '--',
  };
  latestDatesLoading = false;

  members: any[] = [];
  private cobfMap: Record<number, string> = { 0: '', 1: 'C', 2: 'B' };
  isRateChartSending = false;
  isUploading = false;

  get submitButtonLabel(): string {
    this.lang.lang();
    if (this.transferFinished && this.activeTransferKind === 'upload') return this.t('common.allFinished');
    if (this.isUploading && this.activeTransferKind === 'upload') return this.t('common.uploading', { percent: this.transferPercent });
    return this.t('common.transfer');
  }

  get masterButtonLabel(): string {
    this.lang.lang();
    if (this.transferFinished && this.activeTransferKind === 'master') return this.t('common.allFinished');
    if (this.isMasterUploading) return this.t('common.uploading', { percent: this.transferPercent });
    return this.t('home.uploadMasterData');
  }

  get billSubmitLabel(): string {
    this.lang.lang();
    if (this.transferFinished && this.activeTransferKind === 'bill') return this.t('common.allFinished');
    if (this.isUploading && this.activeTransferKind === 'bill') return this.t('common.uploading', { percent: this.transferPercent });
    return this.t('common.transfer');
  }

  get downloadCollectionLabel(): string {
    this.lang.lang();
    if (this.transferFinished && this.activeTransferKind === 'download-col') return this.t('common.finished');
    if (this.isUploading && this.activeTransferKind === 'download-col') return this.t('common.downloading', { percent: this.transferPercent });
    return this.t('home.downloadCollection');
  }

  get downloadMilkSaleLabel(): string {
    this.lang.lang();
    if (this.transferFinished && this.activeTransferKind === 'download-sale') return this.t('common.finished');
    if (this.isUploading && this.activeTransferKind === 'download-sale') return this.t('common.syncing', { percent: this.transferPercent });
    return this.t('home.downloadMilkSale');
  }

  get downloadDeductionsLabel(): string {
    this.lang.lang();
    if (this.transferFinished && this.activeTransferKind === 'download-ded') return this.t('common.finished');
    if (this.isUploading && this.activeTransferKind === 'download-ded') return this.t('common.downloading', { percent: this.transferPercent });
    return this.t('home.downloadDeductions');
  }

  get recordProgressSummary(): string {
    this.lang.lang();
    if (this.transferRecordsTotal <= 0) return '';
    const remaining = Math.max(0, this.transferRecordsTotal - this.transferRecordsDone);
    const pct = Math.round((this.transferRecordsDone / this.transferRecordsTotal) * 100);
    return this.t('common.recordProgress', {
      done: this.transferRecordsDone,
      remaining,
      percent: pct,
    });
  }


   billPeriods: BillPeriodBind[] = [];
  selectedPeriod: BillPeriodBind | null = null;
  selectedPeriodId: number | null = null;
  billPeriodsLoading = false;
  private billPeriodsLoadedFor = '';
  
  statusMessage    = '';

  // ── Modal state ──
  showDbModal = false;
  availableFiles: string[] = [];
  selectedFile = '';

ngOnInit(): void {
  const today = new Date().toISOString().split('T')[0];

  this.fromDate = this.toDate = this.downloadFromDate = this.downloadToDate = today;

  this.buildYearList(this.dbFiles);

  if (!this.storage.getToken()) {
    this.router.navigate(['/login']);
    return;
  }

  // Load latest transfer dates immediately — socCode is available right after login
  const socId = Number(this.storage.getSocCode());
  if (socId) {
    this.loadLatestDates(socId);
  }

  // Bridge API keeps the folder path — just load available MDB files after login.
  this.loadAvailableDatabases();
}

get hasTransferSelection(): boolean {
  return this.transferCollection
    || (this.hasMilkSale && this.transferMilkSale)
    || (this.hasLedger && this.transferAccount);
}


  private static readonly YEAR_MDB_PATTERN = /^da(\d{2})(\d{2})\.mdb$/i;

  /** Only exact fiscal-year files: da2526.mdb / DA2526.mdb — not logmd, da256_old, etc. */
  isValidYearMdbFile(fileName: string): boolean {
    return HomeComponent.YEAR_MDB_PATTERN.test(fileName.trim());
  }

  filterYearMdbFiles(files: string[]): string[] {
    return files
      .filter(f => this.isValidYearMdbFile(f))
      .sort((a, b) => this.extractYearSortKey(b).localeCompare(this.extractYearSortKey(a)));
  }

  private extractYearSortKey(fileName: string): string {
    const match = fileName.trim().match(HomeComponent.YEAR_MDB_PATTERN);
    return match ? `${match[1]}${match[2]}` : '';
  }

  private findYearFile(files: string[], name: string): string | undefined {
    const target = name.trim().toLowerCase();
    return files.find(f => f.toLowerCase() === target);
  }

loadAvailableDatabases(): void {
  this.setStatus(this.t('home.status.scanningDb'));
  this.accessService.getFiles().subscribe({
    next: (files: string[]) => {
      if (!files || files.length === 0) {
        this.setStatus(this.t('home.status.noMdbUseChangeDir'));
        this.dbFiles = [];
        return;
      }

      const yearFiles = this.filterYearMdbFiles(files);

      if (!yearFiles.length) {
        this.setStatus(this.t('home.status.noMdbUseChangeDir'));
        this.dbFiles = [];
        this.selectedFile = '';
        return;
      }

      this.dbFiles = yearFiles;
      this.buildYearList(yearFiles);

      const persistedDb = this.storage.getDatabaseName();
      const matched = persistedDb ? this.findYearFile(yearFiles, persistedDb) : undefined;

      if (matched) {
        this.selectedFile = matched;
      } else {
        this.selectedFile = yearFiles[0];
        this.storage.setDatabaseName(this.selectedFile);
      }

      this.verifyAndInitializeDatabase();
    },
    error: err => {
      console.error('Failed to load MDB file list:', err);
      this.setStatus(this.t('home.status.bridgeUnreachable'));
    }
  });
}

/**
 * Formats fiscal-year MDB names (e.g. da2526.mdb) as 25-26
 */
formatYearDisplay(fileName: string): string {
  if (!fileName) return '';
  const match = fileName.trim().match(HomeComponent.YEAR_MDB_PATTERN);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }
  return fileName;
}

/**
 * Handles dropdown changes by resetting the storage state and validating
 */
async onYearDropdownChange(event: Event): Promise<void> {
  const file = (event.target as HTMLSelectElement).value;
  if (!file) return;

  this.selectedFile = file;
  this.storage.setDatabaseName(file);
  await this.verifyAndInitializeDatabase();
}

/**
 * Replicates the database identity validation checks and cascades dependent lookups
 */
async verifyAndInitializeDatabase(): Promise<void> {
  const loginSocCode = this.storage.getSocCode();
  if (!this.selectedFile) return;

  this.setStatus(this.t('home.status.verifyingDb'));

  try {
    const dbSocId = await firstValueFrom(this.accessService.getCustId(this.selectedFile));

    if (dbSocId > 0) {
      if (dbSocId.toString() !== loginSocCode) {
        Swal.fire({
          title: this.t('home.swal.dbMismatchTitle'),
          text: this.t('home.swal.dbMismatchRevert', { login: loginSocCode, db: dbSocId }),
          icon: 'error'
        });
        
        this.selectedFile = '';
        this.storage.setDatabaseName('');
        this.society = null;
        this.devices = [];
        return;
      }

      const tables = await firstValueFrom(this.accessService.getTables(this.selectedFile));
      this.storage.setTables(tables);

      this.loadSociety(); 
      this.loadBillPeriods();
      this.resetBillPeriodSelection();
      
      this.setStatus(this.t('home.status.dbYearLoaded'));
    } else {
      Swal.fire(this.t('common.error'), this.t('home.swal.parseSocIdFailed'), 'error');
    }
  } catch (err) {
    console.error(err);
    this.setStatus(this.t('home.status.dbValidationFailed'));
  }
}
loadSociety(): void {
  const socId = Number(this.storage.getSocCode());
  if (!socId) return;

  this.masterService.getSociety(socId).subscribe({
    next: (res: any) => {
      this.society = res;
      
      // Mapping Permissions based on appString logic
      const parts = (res?.appString ?? '').split(',');
      this.hasCollectionApp = parts[2] === '3';
      this.hasMilkSale      = parts[3] === '4';
      this.hasLedger        = parts[4] === '5';

      // Load devices ONLY after society is confirmed
      this.loadDevices();

      // Load latest transfer dates for the dashboard
      this.loadLatestDates(socId);
    },
    error: err => {
      console.error('Failed to load society profile:', err);
      this.setStatus(this.t('home.status.errorLoadingSociety'));
    }
  });
}

loadLatestDates(socId: number): void {
  this.latestDatesLoading = true;
  this.masterService.getLatestAll(socId).subscribe({
    next: (res: any) => {
      const fmt = (dateStr: string | null | undefined) => {
        if (!dateStr) return '--';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '--';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
      };

      this.latestDates = {
        milkCollection:    fmt(res?.milktrn?.trndate),
        milkCollectionMe:  res?.milktrn?.me ?? null,
        milkCollectionCobf: (res?.milktrn?.cobf ?? '').toUpperCase(),
        milkSale:          fmt(res?.milksale?.trdate),
        milkSaleMe:        res?.milksale?.me ?? null,
        milkSaleCobf:      (res?.milksale?.cobf ?? '').toUpperCase(),
        account:           fmt(res?.acctrn?.trdates),
        billTransfer:      fmt(res?.billtran?.billdate),
      };
      this.latestDatesLoading = false;
      this.cdr.detectChanges();
    },
    error: err => {
      console.error('Failed to load latest dates:', err);
      this.latestDatesLoading = false;
    }
  });
}

loadDevices() {
  const soc = this.storage.getSocCode();
  if (!soc) return;

  this.milkService.getDevices(soc).subscribe({
    next: (data: any[]) => {
      if (!data) return;

      // 1. Filter for active status and valid names
      // 2. DEDUPLICATE: Handle Soc 2029 sending 'DeviceId: 2' twice
      const deviceMap = new Map();

      data.forEach(d => {
        const id = d.deviceId || d.DeviceId;
        const name = d.name || d.Name;
        const isActive = d.status === 0 || d.Status === 0;

        // Only add if it's a valid ID, has a name, is active, AND we haven't seen this ID yet
        if (id >= 1 && !!name && isActive && !deviceMap.has(id)) {
          deviceMap.set(id, d);
        }
      });

      // Convert Map back to array
      this.devices = Array.from(deviceMap.values());

      // 3. Auto-select the first device if nothing is currently selected
      if (this.devices.length > 0) {
        const firstDeviceId = this.devices[0].deviceId || this.devices[0].DeviceId;
        
        // Only set default if selectedDevice is empty or no longer exists in the new list
        if (!this.selectedDevice || !deviceMap.has(Number(this.selectedDevice))) {
          this.selectedDevice = firstDeviceId;
        }
      }
      
      console.log(`Successfully loaded ${this.devices.length} unique devices for Society ${soc}`);
    },
    error: (err) => {
      console.error('Error fetching device list:', err);
    }
  });
}

  ngOnDestroy(): void {
    this.stopAutoUploadTimer();
    this.stopTransferTimers();
  }

  // =====================================================
  // TOAST SYSTEM
  // =====================================================
  showToast(type: 'info' | 'success' | 'warning' | 'error', message: string, duration = 4000): void {
    const id = ++this.toastCounter;
    this.toasts.push({ id, type, message });
    this.cdr.detectChanges();
    if (duration > 0) {
      setTimeout(() => this.dismissToast(id), duration);
    }
  }

  dismissToast(id: number): void {
    this.toasts = this.toasts.filter(t => t.id !== id);
    this.cdr.detectChanges();
  }

  // =====================================================
  // TRANSFER TIMERS
  // =====================================================
  stopTransferTimers(): void {
    if (this.elapsedInterval) { clearInterval(this.elapsedInterval); this.elapsedInterval = null; }
    if (this.slowStepInterval) { clearInterval(this.slowStepInterval); this.slowStepInterval = null; }
  }

  // =====================================================
  // NETWORK CHECK
  // =====================================================
  checkNetworkBeforeTransfer(): boolean {
    if (!navigator.onLine) {
      this.showToast('error', this.t('home.status.noInternet'), 0);
      return false;
    }
    const conn = (navigator as any).connection;
    if (conn?.effectiveType && ['slow-2g', '2g'].includes(conn.effectiveType)) {
      this.showToast('warning', this.t('home.status.slowNetwork'), 8000);
    }
    return true;
  }

  formatElapsed(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  // =====================================================
  // YEAR
  // =====================================================
buildYearList(fileNames: string[]): void {
  this.years = [];

  fileNames
    .filter(fileName => this.isValidYearMdbFile(fileName))
    .forEach(fileName => {
      const match = fileName.trim().match(HomeComponent.YEAR_MDB_PATTERN);
      if (!match) return;

      const s2 = match[1];
      const e2 = match[2];
      this.years.push({
        name: fileName.replace(/\.mdb$/i, ''),
        tvalue: `${s2}-${e2}`
      });
    });
}

  changeYear(): void {
    this.storage.setYear(this.selectedYear);
    this.setStatus(this.t('home.status.yearChanged'));
  }

  // =====================================================
  // DATABASE MODAL
  // =====================================================
  async selectDatabase(): Promise<void> {
    try {
      this.setStatus(this.t('home.status.loadingMdb'));
      const files = await firstValueFrom(this.accessService.getFiles());

      if (!files || files.length === 0) {
        this.setStatus(this.t('home.status.noMdbOnServer'));
        return;
      }

      const yearFiles = this.filterYearMdbFiles(files);

      if (!yearFiles.length) {
        this.setStatus(this.t('home.status.noMdbOnServer'));
        return;
      }

      this.availableFiles = yearFiles;
      this.selectedFile = yearFiles[0];
      this.showDbModal = true;
      this.statusMsg = '';

    } catch (err: any) {
      console.error('❌ Error fetching files:', err);
      if (err?.status === 0) {
        this.setStatus(this.t('home.status.backendUnreachable'));
      } else {
        this.setStatus(this.t('home.status.failedFileList'));
      }
    }
  }

  // Inside HomeComponent class in home.ts

async changeNetworkPath(): Promise<void> {
  const { value: password } = await Swal.fire({
    title: 'Authentication Required',
    input: 'password',
    inputPlaceholder: 'Enter password',
    inputAttributes: {
      autocapitalize: 'off',
      autocorrect: 'off'
    },
    showCancelButton: true
  });

  if (password !== '123') {
    if (password !== undefined && password !== '') {
      Swal.fire('Error', 'Incorrect password', 'error');
    }
    return;
  }

  let currentPath = '';
  try {
    currentPath = (await firstValueFrom(this.accessService.getConfigPath())).trim();
  } catch {
    // GET may not be supported on older bridge builds — still allow editing.
  }

  const { value: newPath } = await Swal.fire({
    title: this.t('home.swal.changeDbDirTitle'),
    html: currentPath
      ? this.t('home.swal.changeDbDirHtml', { path: currentPath })
      : this.t('home.swal.changeDbDirHtmlEmpty'),
    input: 'text',
    inputValue: currentPath,
    showCancelButton: true,
    confirmButtonText: this.t('common.updatePath'),
    cancelButtonText: this.t('common.cancel'),
    inputPlaceholder: this.t('home.swal.changeDbDirPlaceholder')
  });

  if (newPath) {
    this.setStatus(this.t('home.status.updatingConfig'));
    this.accessService.updateConfigPath(newPath).subscribe({
      next: () => {
        Swal.fire({
          title: this.t('common.success'),
          text: this.t('home.swal.dbDirUpdated'),
          icon: 'success'
        });
        this.loadAvailableDatabases(); 
      },
      error: err => {
        console.error('Failed to save config path:', err);
        Swal.fire(this.t('common.error'), this.t('home.swal.dbDirUpdateFailed'), 'error');
      }
    });
  }
}

  closeDbModal(): void {
    this.showDbModal = false;
    this.availableFiles = [];
    this.selectedFile = '';
  }

  async confirmDatabase(): Promise<void> {
  if (!this.selectedFile) {
    this.setStatus(this.t('home.status.selectFile'));
    return;
  }

  const loginSocCode = this.storage.getSocCode(); 

  this.showDbModal = false;
  this.storage.setDatabaseName(this.selectedFile);

  try {
    this.setStatus(this.t('home.status.identifyingSociety'));
    
    const dbSocId = await firstValueFrom(this.accessService.getCustId(this.selectedFile));
    
    if (dbSocId > 0) {
      if (dbSocId.toString() !== loginSocCode) {
        Swal.fire({
          title: this.t('home.swal.dbMismatchTitle'),
          text: this.t('home.swal.dbMismatchSelect', { login: loginSocCode, db: dbSocId }),
          icon: 'error'
        });
        
        this.storage.setDatabaseName(''); 
        return; 
      }

      const tables = await firstValueFrom(this.accessService.getTables(this.selectedFile));
      this.storage.setTables(tables);
      
      await this.loadSociety(); 
      this.setStatus(this.t('home.status.dbVerified'));
    } else {
      Swal.fire(this.t('common.error'), this.t('home.swal.readSocIdFailed'), 'error');
    }
  } catch (err) {
    this.setStatus(this.t('home.status.bridgeFailed'));
  }
}


  // =====================================================
  // BUTTON ACTIONS
  // =====================================================
  goToUpdateMaster(): void {
    this.router.navigate(['/update-master']);
  }

async submitUnifiedTransfer(): Promise<void> {
  if (!this.hasTransferSelection) {
    Swal.fire(this.t('common.warning'), this.t('home.swal.selectTransferType'), 'warning');
    return;
  }

  if (!this.fromDate || !this.toDate) {
    Swal.fire(this.t('common.warning'), this.t('home.swal.selectDates'), 'warning');
    return;
  }

  const stepNames: string[] = [];
  if (this.transferCollection) stepNames.push(this.t('home.milkCollection'));
  if (this.transferMilkSale && this.hasMilkSale) stepNames.push(this.t('home.milkSale'));
  if (this.transferAccount && this.hasLedger) stepNames.push(this.t('home.account'));

  this.isUploading = true;
  this.transferFinished = false;
  this.activeTransferKind = 'upload';
  this.beginProgress(stepNames);

  const succeeded: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];
  let stepIndex = 0;

  try {
    if (this.transferCollection) {
      const result = await this.runProgressStep(stepIndex++, (idx) => this.doUploadCollection(true, idx));
      this.recordStepOutcome(this.t('home.milkCollection'), result, succeeded, failed, skipped);
    }

    if (this.transferMilkSale && this.hasMilkSale) {
      const result = await this.runProgressStep(stepIndex++, (idx) => this.doUploadMilkSale(true, idx));
      this.recordStepOutcome(this.t('home.milkSale'), result, succeeded, failed, skipped);
    }

    if (this.transferAccount && this.hasLedger) {
      const result = await this.runProgressStep(stepIndex++, (idx) => this.doUploadAccount(true, idx));
      this.recordStepOutcome(this.t('home.account'), result, succeeded, failed, skipped);
    }

    this.syncGlobalRecordTotals();
    await this.completeProgress(succeeded, failed, skipped);
  } catch (err) {
    console.error('Unified transfer error:', err);
    await this.failProgress(this.t('home.status.transferStopped'));
  } finally {
    this.isUploading = false;
    if (!this.transferFinished) this.activeTransferKind = null;
    this.touchProgress();
    if (this.transferFinished) this.scheduleProgressHide();
  }
}

// async uploadMasterData(): Promise<void> {
//   const fileName = this.storage.getDatabaseName();
//   const socCode = this.storage.getSocCode();

//   if (!fileName || !socCode) {
//     Swal.fire(this.t('common.warning'), this.t('home.swal.selectDbLogin'), 'warning');
//     return;
//   }

//   if (!navigator.onLine) {
//     Swal.fire(this.t('common.warning'), this.t('home.swal.checkInternet'), 'warning');
//     return;
//   }

//   const confirm = await Swal.fire({
//     title: this.t('home.swal.uploadMasterTitle'),
//     html: this.t('home.swal.uploadMasterHtml', { file: fileName }),
//     icon: 'question',
//     showCancelButton: true,
//     confirmButtonText: this.t('common.yesUploadAll'),
//     cancelButtonText: this.t('common.cancel')
//   });

//   if (!confirm.isConfirmed) return;

//   const overwriteConfirm = await Swal.fire({
//     title: this.t('home.swal.overwriteRateTitle'),
//     text: this.t('home.swal.overwriteRateText'),
//     icon: 'warning',
//     showCancelButton: true,
//     confirmButtonText: this.t('common.yesContinue'),
//     cancelButtonText: this.t('common.cancel')
//   });

//   if (!overwriteConfirm.isConfirmed) return;

//   const stepNames = [
//     this.t('home.progress.members'),
//     this.t('home.progress.rateChartCow'),
//     this.t('home.progress.rateChartBuffalo'),
//   ];
//   this.isMasterUploading = true;
//   this.transferFinished = false;
//   this.activeTransferKind = 'master';
//   this.beginProgress(stepNames);

//   const succeeded: string[] = [];
//   const failed: string[] = [];
//   const skipped: string[] = [];

//   try {
//     const membersResult = await this.runProgressStep(0, (idx) => this.doUploadMembers(true, idx));
//     this.recordStepOutcome(this.t('home.progress.members'), membersResult, succeeded, failed, skipped);

//     let rawRows: any[];
//     try {
//       this.setStepRunning(1, this.t('home.progress.readingRateChart'));
//       rawRows = await firstValueFrom(this.accessService.getratechar(fileName));
//     } catch {
//       this.setStepFailed(1);
//       failed.push(this.t('home.progress.rateChartCow'));
//       await this.completeProgress(succeeded, failed, skipped);
//       return;
//     }

//     if (!rawRows?.length) {
//       this.setStepSkipped(1);
//       this.setStepSkipped(2);
//       skipped.push(this.t('home.progress.rateChartCow'), this.t('home.progress.rateChartBuffalo'));
//     } else {
//       const cowResult = await this.runProgressStep(1, (idx) => this.doUploadRateChartHalf('C', rawRows, true, idx));
//       this.recordStepOutcome(this.t('home.progress.rateChartCow'), cowResult, succeeded, failed, skipped);

//       const buffResult = await this.runProgressStep(2, (idx) => this.doUploadRateChartHalf('B', rawRows, true, idx));
//       this.recordStepOutcome(this.t('home.progress.rateChartBuffalo'), buffResult, succeeded, failed, skipped);
//     }

//     await this.completeProgress(succeeded, failed, skipped);
//   } catch (err) {
//     console.error('Master data upload error:', err);
//     await this.failProgress(this.t('home.status.masterUploadStopped'));
//   } finally {
//     this.isMasterUploading = false;
//     this.isRateChartSending = false;
//     if (!this.transferFinished) this.activeTransferKind = null;
//     this.touchProgress();
//     if (this.transferFinished) this.scheduleProgressHide();
//   }
// }


async uploadMasterData(): Promise<void> {
  const fileName = this.storage.getDatabaseName();
  const socCode = this.storage.getSocCode();

  if (!fileName || !socCode) {
    Swal.fire(this.t('common.warning'), this.t('home.swal.selectDbLogin'), 'warning');
    return;
  }

  if (!navigator.onLine) {
    Swal.fire(this.t('common.warning'), this.t('home.swal.checkInternet'), 'warning');
    return;
  }

  const confirm = await Swal.fire({
    title: this.t('home.swal.uploadMasterTitle'),
    html: this.t('home.swal.uploadMasterHtml', { file: fileName }),
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: this.t('common.yesUploadAll'),
    cancelButtonText: this.t('common.cancel')
  });

  if (!confirm.isConfirmed) return;

  const overwriteConfirm = await Swal.fire({
    title: this.t('home.swal.overwriteRateTitle'),
    text: this.t('home.swal.overwriteRateText'),
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: this.t('common.yesContinue'),
    cancelButtonText: this.t('common.cancel')
  });

  if (!overwriteConfirm.isConfirmed) return;

  // Added Zones to step names
  const stepNames = [
    this.t('home.progress.zones'), // Step 0
    this.t('home.progress.members'), // Step 1
    this.t('home.progress.rateChartCow'), // Step 2
    this.t('home.progress.rateChartBuffalo'), // Step 3
  ];

  this.isMasterUploading = true;
  this.transferFinished = false;
  this.activeTransferKind = 'master';
  this.beginProgress(stepNames);

  const succeeded: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];

  try {
    // --- NEW: STEP 0 - ZONES ---
    const zonesResult = await this.runProgressStep(0, (idx) => this.doUploadZones(true, idx));
    this.recordStepOutcome(this.t('home.progress.zones'), zonesResult, succeeded, failed, skipped);

    // --- STEP 1 - MEMBERS (Shifted index from 0 to 1) ---
    const membersResult = await this.runProgressStep(1, (idx) => this.doUploadMembers(true, idx));
    this.recordStepOutcome(this.t('home.progress.members'), membersResult, succeeded, failed, skipped);

    let rawRows: any[];
    try {
      // Shifted index from 1 to 2
      this.setStepRunning(2, this.t('home.progress.readingRateChart')); 
      rawRows = await firstValueFrom(this.accessService.getratechar(fileName));
    } catch {
      this.setStepFailed(2);
      failed.push(this.t('home.progress.rateChartCow'));
      await this.completeProgress(succeeded, failed, skipped);
      return;
    }

    if (!rawRows?.length) {
      this.setStepSkipped(2);
      this.setStepSkipped(3);
      skipped.push(this.t('home.progress.rateChartCow'), this.t('home.progress.rateChartBuffalo'));
    } else {
      // Shifted index from 1 to 2
      const cowResult = await this.runProgressStep(2, (idx) => this.doUploadRateChartHalf('C', rawRows, true, idx));
      this.recordStepOutcome(this.t('home.progress.rateChartCow'), cowResult, succeeded, failed, skipped);

      // Shifted index from 2 to 3
      const buffResult = await this.runProgressStep(3, (idx) => this.doUploadRateChartHalf('B', rawRows, true, idx));
      this.recordStepOutcome(this.t('home.progress.rateChartBuffalo'), buffResult, succeeded, failed, skipped);
    }

    await this.completeProgress(succeeded, failed, skipped);
  } catch (err) {
    console.error('Master data upload error:', err);
    await this.failProgress(this.t('home.status.masterUploadStopped'));
  } finally {
    this.isMasterUploading = false;
    this.isRateChartSending = false;
    if (!this.transferFinished) this.activeTransferKind = null;
    this.touchProgress();
    if (this.transferFinished) this.scheduleProgressHide();
  }
}

private beginProgress(stepNames: string[]): void {
  this.showTransferProgress = true;
  this.transferPercent = 0;
  this.transferRecordsDone = 0;
  this.transferRecordsTotal = 0;
  this.transferStepLabel = this.t('home.status.preparingTransfer');
  this.transferFinished = false;
  this.transferSteps = stepNames.map(name => ({
    name,
    status: 'pending' as const,
    totalRecords: 0,
    doneRecords: 0,
    detail: ''
  }));
  this.setStatus(this.transferStepLabel, true);

  // Start elapsed timer
  this.transferElapsedSeconds = 0;
  if (this.elapsedInterval) clearInterval(this.elapsedInterval);
  this.elapsedInterval = setInterval(() => {
    this.transferElapsedSeconds++;
    this.cdr.detectChanges();
  }, 1000);

  // Slow-step watcher: warn after 12s, repeat every 30s
  if (this.slowStepInterval) clearInterval(this.slowStepInterval);
  this.slowStepInterval = setInterval(() => {
    if (!this.transferFinished) {
      this.showToast('warning', this.t('home.status.stillTransferring'), 8000);
    }
  }, 12000);

  this.cdr.detectChanges();
}

private async runProgressStep(
  index: number,
  action: (stepIndex: number) => Promise<'success' | 'failed' | 'skipped' | 'cancelled'>
): Promise<'success' | 'failed' | 'skipped' | 'cancelled'> {
  const stepName = this.transferSteps[index]?.name ?? this.t('home.dataTransfer');
  this.setStepRunning(index, this.t('home.progress.processing', { name: stepName }));
  const result = await action(index);

  if (result === 'success') this.setStepDone(index);
  else if (result === 'skipped') this.setStepSkipped(index);
  else if (result === 'cancelled') this.setStepSkipped(index);
  else this.setStepFailed(index);

  this.syncGlobalRecordTotals();
  this.refreshProgressPercent();
  this.touchProgress();
  return result;
}

private setStepRecordProgress(index: number, done: number, total: number, detail = ''): void {
  const step = this.transferSteps[index];
  if (!step) return;

  step.totalRecords = total;
  step.doneRecords = done;
  step.detail = detail;

  const recPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const remaining = Math.max(0, total - done);
  this.transferStepLabel = total > 0
    ? this.t('home.progress.recordsProgress', {
        name: step.name,
        done,
        total,
        percent: recPct,
        remaining,
      })
    : this.t('home.progress.recordsProgressShort', {
        name: step.name,
        detail: detail || this.t('home.progress.processing', { name: step.name }),
      });

  this.syncGlobalRecordTotals();
  this.refreshProgressPercent();
  this.setStatus(this.transferStepLabel, true);
  this.touchProgress();
}

private syncGlobalRecordTotals(): void {
  this.transferRecordsTotal = this.transferSteps.reduce((sum, s) => sum + (s.totalRecords || 0), 0);
  this.transferRecordsDone = this.transferSteps.reduce((sum, s) => {
    if (s.status === 'done') return sum + (s.totalRecords || 0);
    if (s.status === 'running') return sum + (s.doneRecords || 0);
    return sum;
  }, 0);
}

private setStepRunning(index: number, label: string): void {
  if (this.transferSteps[index]) this.transferSteps[index].status = 'running';
  this.transferStepLabel = label;
  this.setStatus(label, true);
  this.refreshProgressPercent();
  this.touchProgress();
}

private setStepDone(index: number): void {
  const step = this.transferSteps[index];
  if (!step) return;
  step.status = 'done';
  if (step.totalRecords > 0) step.doneRecords = step.totalRecords;
  this.refreshProgressPercent();
  this.touchProgress();
}

private setStepFailed(index: number): void {
  if (this.transferSteps[index]) this.transferSteps[index].status = 'failed';
}

private setStepSkipped(index: number): void {
  if (this.transferSteps[index]) this.transferSteps[index].status = 'skipped';
}

private refreshProgressPercent(): void {
  if (!this.transferSteps.length) {
    this.transferPercent = 0;
    return;
  }

  const total = this.transferSteps.length;
  let completed = 0;

  for (const step of this.transferSteps) {
    if (step.status === 'done' || step.status === 'failed' || step.status === 'skipped') {
      completed += 1;
    } else if (step.status === 'running') {
      if (step.totalRecords > 0) {
        completed += step.doneRecords / step.totalRecords;
      } else {
        completed += 0.15;
      }
    }
  }

  this.transferPercent = Math.min(100, Math.round((completed / total) * 100));
}

private recordStepOutcome(
  label: string,
  result: 'success' | 'failed' | 'skipped' | 'cancelled',
  succeeded: string[],
  failed: string[],
  skipped: string[]
): void {
  if (result === 'success') succeeded.push(label);
  else if (result === 'skipped' || result === 'cancelled') skipped.push(label);
  else failed.push(label);
}

private touchProgress(): void {
  this.ngZone.run(() => this.cdr.detectChanges());
}

private bumpStepPhase(index: number, label: string, phases = 4): void {
  const step = this.transferSteps[index];
  if (!step) return;

  step.status = 'running';
  if (step.totalRecords < phases) {
    step.totalRecords = phases;
  }
  step.doneRecords = Math.min(step.doneRecords + 1, step.totalRecords);
  step.detail = label;

  const recPct = Math.round((step.doneRecords / step.totalRecords) * 100);
  this.transferStepLabel = this.t('home.progress.stepPhase', {
    name: step.name,
    done: step.doneRecords,
    total: step.totalRecords,
    percent: recPct,
    label,
  });

  this.syncGlobalRecordTotals();
  this.refreshProgressPercent();
  this.setStatus(this.transferStepLabel, true);
  this.touchProgress();
}

private async awaitHttp<T>(obs: Observable<T>, timeoutMs = 120000): Promise<T> {
  return firstValueFrom(
    obs.pipe(
      timeout(timeoutMs),
      defaultIfEmpty(null as T)
    )
  );
}

private async completeProgress(succeeded: string[], failed: string[], skipped: string[]): Promise<void> {
  this.transferPercent = 100;
  this.transferFinished = true;

  for (const step of this.transferSteps) {
    if (step.status === 'running') {
      step.status = succeeded.length ? 'done' : 'failed';
      if (step.totalRecords > 0) step.doneRecords = step.totalRecords;
    }
  }

  const parts: string[] = [];
  if (succeeded.length) parts.push(this.t('home.progress.completed', { items: succeeded.join(', ') }));
  if (skipped.length) parts.push(this.t('home.progress.skippedItems', { items: skipped.join(', ') }));
  if (failed.length) parts.push(this.t('home.progress.failedItems', { items: failed.join(', ') }));
  if (this.transferRecordsTotal > 0) {
    parts.push(this.t('home.progress.totalRecords', {
      done: this.transferRecordsDone,
      total: this.transferRecordsTotal,
    }));
  }

  if (!failed.length && succeeded.length) {
    this.transferStepLabel = this.t('home.status.allTransfersSuccess');
    this.setStatus(this.transferStepLabel, true);
    await Swal.fire({
      title: this.t('home.progress.allFinishedTitle'),
      html: parts.join('<br>'),
      icon: 'success'
    });
  } else if (succeeded.length) {
    this.transferStepLabel = this.t('home.status.transferPartial');
    this.setStatus(this.transferStepLabel, true);
    await Swal.fire({
      title: this.t('home.progress.partiallyFinished'),
      html: parts.join('<br>'),
      icon: 'warning'
    });
  } else if (failed.length) {
    this.transferStepLabel = this.t('home.status.transferFailed');
    this.setStatus(this.transferStepLabel, true);
    await Swal.fire({
      title: this.t('home.progress.transferFailedTitle'),
      html: parts.join('<br>') || this.t('home.progress.noDataUploaded'),
      icon: 'error'
    });
  } else {
    this.transferStepLabel = this.t('home.status.transferFinished');
    this.setStatus(this.transferStepLabel, true);
    await Swal.fire({
      title: this.t('common.finished'),
      html: parts.join('<br>') || this.t('home.progress.noChanges'),
      icon: 'info'
    });
  }

  this.stopTransferTimers();
  this.showToast(
    !failed.length && succeeded.length ? 'success' : failed.length && !succeeded.length ? 'error' : 'warning',
    !failed.length && succeeded.length
      ? this.t('home.status.allTransfersSuccess')
      : failed.length && !succeeded.length
        ? this.t('home.status.transferFailed')
        : this.t('home.status.transferPartial'),
    6000
  );
  this.touchProgress();
}

private async failProgress(message: string): Promise<void> {
  this.transferPercent = 100;
  this.transferFinished = true;
  this.transferStepLabel = message;
  this.setStatus(message, true);

  for (const step of this.transferSteps) {
    if (step.status === 'running') step.status = 'failed';
  }

  this.stopTransferTimers();
  this.showToast('error', message, 6000);
  await Swal.fire(this.t('common.error'), message, 'error');
  this.touchProgress();
}

private scheduleProgressHide(): void {
  setTimeout(() => {
    this.showTransferProgress = false;
    this.transferSteps = [];
    this.transferPercent = 0;
    this.transferStepLabel = '';
    this.transferFinished = false;
    this.transferRecordsDone = 0;
    this.transferRecordsTotal = 0;
    this.activeTransferKind = null;
    this.cdr.detectChanges();
  }, 5000);
}

async doUploadCollection(
  quiet = false,
  stepIndex?: number
): Promise<'success' | 'failed' | 'skipped' | 'cancelled'> {
  const fileName = this.storage.getDatabaseName();
  const soc = this.storage.getSocCode();
  const deviceId = this.selectedDevice ? Number(this.selectedDevice) : 1;
  const cobf = this.milkType === 1 ? 'C' : (this.milkType === 2 ? 'B' : 'A');

  try {
    // 1. Check if ANY raw collection data already exists on the server
    const exists = await firstValueFrom(
      this.milkService.checkCollectionExists(this.fromDate, this.toDate, this.collectionTime, deviceId)
    );

    // 2. Separately check if the bill is locked/calculated
    const billLocked = await firstValueFrom(
      this.milkService.checkBillGrpId(this.fromDate, this.toDate, this.collectionTime, soc)
    );

    if (billLocked) {
      const lockAlert = await Swal.fire({
        title: this.t('home.swal.billLockedTitle') || 'Bill Already Generated',
        text: this.t('home.swal.billLockedText') || 'A finalized bill group has already been calculated for this period. Modifying collections may lead to discrepancies. Do you still want to continue?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: this.t('common.yesContinue') || 'Yes, Proceed',
        cancelButtonText: this.t('common.cancel') || 'Cancel'
      });
      if (!lockAlert.isConfirmed) return 'cancelled';
    }

    const rows = await firstValueFrom(
      this.accessService.getcollection(fileName, this.fromDate, this.toDate, this.collectionTime, this.milkType)
    );

    if (!rows?.length) {
      if (!quiet) Swal.fire(this.t('common.info'), this.t('home.swal.noCollectionData'), 'info');
      return 'skipped';
    }

    if (stepIndex !== undefined) {
      this.setStepRecordProgress(stepIndex, 0, rows.length, this.t('home.progress.checkingServer'));
    }

    // 3. Trigger the separate get/delete endpoint first if collection records are detected
    if (exists) {
      const swalRes = await Swal.fire({
        title: this.t('home.swal.overwriteCollectionTitle'),
        text: this.t('home.swal.overwriteCollectionText'),
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: this.t('common.yesOverwrite'),
        cancelButtonText: this.t('common.cancel'),
      });

      if (!swalRes.isConfirmed) return 'cancelled';

      this.setStatus(this.t('home.status.deletingOldCollection'), true);
      
      // 🔥 FIX 1: Passed parameters in the correct order mapped by your service signature
      // 🔥 FIX 2: Appended .toString() to prevent TypeScript compiler errors
      await firstValueFrom(
        this.milkService.deleteCollection(
          this.fromDate, 
          this.toDate, 
          soc.toString(), 
          this.collectionTime.toString(), 
          cobf, 
          deviceId
        )
      );
    }

    if (stepIndex !== undefined) {
      this.setStepRecordProgress(stepIndex, 0, rows.length, this.t('home.progress.uploadingToServer'));
    }

    await firstValueFrom(
      this.milkService.sendMilkCollection(
        this.fromDate,
        this.toDate,
        this.collectionTime,
        this.milkType,
        false, // overwrite flag handled locally above
        rows,
        true,  // skip internal checks in sendMilkCollection
        deviceId
      )
    );

    if (stepIndex !== undefined) {
      this.setStepRecordProgress(stepIndex, rows.length, rows.length, this.t('home.progress.uploadComplete'));
    }

    return 'success';
  } catch (err: any) {
    if (!quiet) this.handleError(err, this.t('home.swal.collectionUploadFailed'));
    else console.error('Milk collection upload failed:', err);
    return 'failed';
  }
}

/**
 * Robust Error Handler
 */
private handleError(err: HttpErrorResponse, customMsg: string, resetUploading = true): void {
  console.error('Bridge/Live Error:', err);
  if (resetUploading) {
    this.isUploading = false;
  }
  this.setStatus(this.t('home.status.errorOccurred'));
  
  const detail = err.error?.title || err.error?.message || err.message || this.t('home.status.bridgeFailed');
  Swal.fire(
    this.t('common.error'),
    this.t('home.swal.errorDetail', { msg: customMsg, detail }),
    'error'
  );
}

//==========================================
// Milk Bill
//==========================================

loadBillPeriods(): void {
  const fileName = this.storage.getDatabaseName();

  if (!fileName) {
    return;
  }

  if (this.billPeriodsLoading) {
    return;
  }

  if (this.billPeriodsLoadedFor === fileName && this.billPeriods.length > 0) {
    return;
  }

  this.billPeriodsLoading = true;

  this.accessService.getBillPeriods(fileName).subscribe({
    next: (periods: BillPeriodBind[]) => {
      this.billPeriodsLoading = false;
      this.billPeriodsLoadedFor = fileName;

      if (!periods || periods.length === 0) {
        this.billPeriods = [{ id: 0, name: this.t('home.noPeriodsFound'), fromDate: null, toDate: null }];
        return;
      }

      this.billPeriods = periods;
      this.cdr.detectChanges();
    },
    error: (err) => {
      this.billPeriodsLoading = false;
      console.error('Error loading bill periods:', err);
      Swal.fire(this.t('common.error'), this.t('home.swal.failedBillPeriods'), 'error');
    }
  });
}

openBillTab(): void {
  this.activeTab = 'bill';
  this.loadBillPeriods();
}

private resetBillPeriodSelection(): void {
  this.selectedPeriodId = null;
  this.selectedPeriod = null;
  this.billPeriodsLoadedFor = '';
  this.billPeriods = [];
}

onPeriodIdChange(id: number | null): void {
  if (id == null || id === 0) {
    this.selectedPeriod = null;
    return;
  }

  const period = this.billPeriods.find(p => Number(p.id) === Number(id));

  if (period?.fromDate && period?.toDate) {
    this.selectedPeriod = period;
    this.fromDate = this.normalizeDateForInput(period.fromDate);
    this.toDate = this.normalizeDateForInput(period.toDate);
  } else {
    this.selectedPeriod = null;
    this.selectedPeriodId = null;
    if (period?.id === 0) {
      Swal.fire(this.t('common.info'), this.t('home.swal.noBillPeriods'), 'info');
    }
  }
}

/** Ensures API date strings work in date inputs */
private normalizeDateForInput(dateVal: string): string {
  if (!dateVal) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal;
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return dateVal.split('T')[0] ?? dateVal;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

private formatDate(dateVal: any): string {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return dateVal;
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async uploadBill(): Promise<void> {
  if (!this.selectedPeriod || !this.fromDate || !this.toDate) {
    Swal.fire(this.t('common.error'), this.t('home.swal.selectValidBillPeriod'), 'error');
    return;
  }

  if (!this.society) {
    Swal.fire(this.t('common.error'), this.t('home.swal.societyNotLoaded'), 'error');
    return;
  }

  const fileName = this.storage.getDatabaseName();
  const socCode = Number(this.storage.getSocCode());
  const billType = Number(this.society.billType || this.society.billtype || 0);

  const stepNames: string[] = [];
  if (billType > 1) stepNames.push(this.t('home.progress.deductions'));
  if (billType > 0) stepNames.push(this.t('home.progress.billTransactions'));

  if (!stepNames.length) {
    Swal.fire(this.t('common.info'), this.t('home.swal.billNotEnabled'), 'info');
    return;
  }

  this.isUploading = true;
  this.transferFinished = false;
  this.activeTransferKind = 'bill';
  this.beginProgress(stepNames);

  const succeeded: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];
  let stepIdx = 0;

  try {
    if (billType > 1) {
      const dedIdx = stepIdx++;
      this.setStepRunning(dedIdx, this.t('home.progress.loadingDeductions'));

      const rawDed = await this.awaitHttp(
        this.accessService.getDeductions(fileName, this.fromDate, this.toDate)
      );

      if (!rawDed?.length) {
        this.setStepSkipped(dedIdx);
        skipped.push(this.t('home.progress.deductions') + ' (' + this.t('home.progress.skipped') + ')');
      } else {
        this.setStepRecordProgress(dedIdx, 0, rawDed.length, this.t('home.progress.checkingDeductions'));
        this.bumpStepPhase(dedIdx, this.t('home.progress.checkingServer'), 3);

        const canUploadDed = await this.awaitHttp(
          this.milkService.checkDeductions(this.fromDate, this.toDate),
          25000
        );
        let proceedWithDeductions = true;

        if (!canUploadDed) {
          const confirm = await Swal.fire({
            title: this.t('home.swal.overwriteDeductionsTitle'),
            text: this.t('home.swal.overwriteDeductionsText'),
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: this.t('common.yesOverwrite'),
            cancelButtonText: this.t('common.skipDeductions')
          });
          proceedWithDeductions = confirm.isConfirmed;
        }

        if (proceedWithDeductions) {
          this.bumpStepPhase(dedIdx, this.t('home.progress.uploadingDeductions'), 3);
          const payload = rawDed.map(r => ({ ...r, socCode }));
          await this.awaitHttp(this.milkService.postDeductions(payload), 300000);
          this.setStepRecordProgress(dedIdx, rawDed.length, rawDed.length, this.t('home.progress.deductionsUploaded'));
          this.setStepDone(dedIdx);
          succeeded.push(`${this.t('home.progress.deductions')} (${rawDed.length})`);
        } else {
          this.setStepSkipped(dedIdx);
          skipped.push(this.t('home.progress.deductions'));
        }
      }

      this.refreshProgressPercent();
      this.touchProgress();
    }

    if (billType > 0) {
      const billIdx = stepIdx++;
      this.setStepRunning(billIdx, this.t('home.progress.loadingBills'));

      const rawBill = await this.awaitHttp(
        this.accessService.getBillTransRecords(fileName, this.fromDate, this.toDate)
      );

      if (!rawBill?.length) {
        this.setStepSkipped(billIdx);
        skipped.push(this.t('home.progress.billTransactions') + ' (' + this.t('home.progress.skipped') + ')');
      } else {
        this.setStepRecordProgress(billIdx, 0, rawBill.length, this.t('home.progress.checkingBill'));
        this.bumpStepPhase(billIdx, this.t('home.progress.checkingServer'), 3);

        const canUploadBill = await this.awaitHttp(
          this.milkService.checkBillExists(this.fromDate, this.toDate),
          25000
        );
        let proceedWithBill = true;

        if (!canUploadBill) {
          const confirm = await Swal.fire({
            title: this.t('home.swal.overwriteBillTitle'),
            text: this.t('home.swal.overwriteBillText'),
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: this.t('common.yesOverwrite'),
            cancelButtonText: this.t('common.cancel')
          });
          proceedWithBill = confirm.isConfirmed;
        }

        if (!proceedWithBill) {
          this.setStepSkipped(billIdx);
          skipped.push(this.t('home.progress.billTransactions'));
        } else {
          this.bumpStepPhase(billIdx, this.t('home.progress.uploadingBills'), 3);
          const payload = rawBill.map(r => ({ ...r, socCode }));
          await this.awaitHttp(this.milkService.postBillTrans(payload), 300000);
          this.setStepRecordProgress(billIdx, rawBill.length, rawBill.length, this.t('home.progress.billUploaded'));
          this.setStepDone(billIdx);
          succeeded.push(`${this.t('home.progress.billTransactions')} (${rawBill.length})`);
        }
      }

      this.refreshProgressPercent();
      this.touchProgress();
    }

    this.syncGlobalRecordTotals();
    await this.completeProgress(succeeded, failed, skipped);
  } catch (err: any) {
    console.error('Bill Transfer Error:', err);
    const errorMsg = err.error?.text || err.error?.message || err.message || this.t('home.swal.uploadFailedBridge');
    await this.failProgress(this.t('home.swal.billTransferFailed', {
      detail: errorMsg,
    }));
  } finally {
    const stepsSettled = this.transferSteps.length > 0
      && this.transferSteps.every(s => s.status !== 'running' && s.status !== 'pending');
    if (!this.transferFinished && stepsSettled) {
      await this.completeProgress(succeeded, failed, skipped);
    }
    this.isUploading = false;
    this.touchProgress();
    if (this.transferFinished) this.scheduleProgressHide();
  }
}


//  async doUploadMilkSale(quiet = false, stepIndex?: number): Promise<'success' | 'failed' | 'skipped' | 'cancelled'> {
//   const fileName = this.storage.getDatabaseName();

//   if (!this.society || !this.hasMilkSale) {
//     if (!quiet) Swal.fire(this.t('common.denied'), this.t('home.swal.milkSaleDenied'), 'error');
//     return 'failed';
//   }

//   const selDate = new Date(this.fromDate);
//   const activeDate = new Date(this.society.activeDate);
//   if (selDate < activeDate) {
//     if (!quiet) Swal.fire(this.t('common.warning'), this.t('home.swal.cannotTransferBefore', { date: this.society.activeDate }), 'warning');
//     return 'failed';
//   }

//   try {
//     const bridgeRes: any = await firstValueFrom(
//       this.accessService.getSyncMilkSale(fileName, this.fromDate, this.toDate, this.collectionTime)
//     );

//     if (!bridgeRes.milksale || bridgeRes.milksale.length === 0) {
//       if (!quiet) Swal.fire(this.t('common.info'), this.t('home.swal.noMilkSaleLocal'), 'info');
//       return 'skipped';
//     }

//     const count = bridgeRes.milksale.length;
//     if (stepIndex !== undefined) {
//       this.setStepRecordProgress(stepIndex, 0, count, this.t('home.progress.uploadingMilkSale'));
//     }

//     await firstValueFrom(
//       this.milkService.milkSaleSyncPush(bridgeRes.msParam.toString(), bridgeRes)
//     );

//     if (stepIndex !== undefined) {
//       this.setStepRecordProgress(stepIndex, count, count, this.t('home.progress.uploadComplete'));
//     }

//     return 'success';
//   } catch (err: any) {
//     console.error('Milk Sale Sync Error:', err);
//     if (!quiet) Swal.fire(this.t('common.error'), this.t('home.swal.milkSaleSyncFailed'), 'error');
//     return 'failed';
//   }
// }

  // async doUploadAccount(quiet = false, stepIndex?: number): Promise<'success' | 'failed' | 'skipped' | 'cancelled'> {
  //   if (!this.hasLedger) {
  //     if (!quiet) Swal.fire(this.t('common.denied'), this.t('home.swal.accountingDenied'), 'warning');
  //     return 'failed';
  //   }

  //   const fileName = this.storage.getDatabaseName();

  //   if (!fileName) {
  //     if (!quiet) Swal.fire(this.t('common.info'), this.t('home.swal.selectDatabaseFirst'), 'info');
  //     return 'failed';
  //   }

  //   if (this.society?.activeDate) {
  //     const activeDate = new Date(this.society.activeDate);
  //     const fromDate = new Date(this.fromDate);

  //     if (fromDate < activeDate) {
  //       if (!quiet) Swal.fire(this.t('common.warning'), this.t('home.swal.cantTransferBefore', { date: this.society.activeDate }), 'warning');
  //       this.fromDate = this.society.activeDate;
  //       return 'failed';
  //     }
  //   }

  //   try {
  //     const accRows = await firstValueFrom(
  //       this.accessService.getAccountRecords(fileName, this.fromDate, this.toDate)
  //     );
  //     const glmsRows = await firstValueFrom(this.accessService.getGlmsRecords(fileName));

  //     const totalRecords = (accRows?.length ?? 0) + (glmsRows?.length ?? 0);
  //     if (stepIndex !== undefined && totalRecords > 0) {
  //       this.setStepRecordProgress(stepIndex, 0, totalRecords, this.t('home.progress.startingAccountUpload'));
  //     }

  //     let done = 0;

  //     if (accRows && accRows.length > 0) {
  //       await firstValueFrom(this.milkService.sendAccounts(this.fromDate, this.toDate, accRows));
  //       done += accRows.length;
  //       if (stepIndex !== undefined) {
  //         this.setStepRecordProgress(stepIndex, done, totalRecords, this.t('home.progress.accountUploaded'));
  //       }
  //     }

  //     if (glmsRows && glmsRows.length > 0) {
  //       await firstValueFrom(this.milkService.sendGlms(glmsRows));
  //       done += glmsRows.length;
  //       if (stepIndex !== undefined) {
  //         this.setStepRecordProgress(stepIndex, done, totalRecords, this.t('home.progress.ledgerSynced'));
  //       }
  //     }

  //     if ((!accRows || !accRows.length) && (!glmsRows || !glmsRows.length)) {
  //       if (!quiet) Swal.fire(this.t('common.info'), this.t('home.swal.noAccountRecords'), 'info');
  //       return 'skipped';
  //     }

  //     return 'success';
  //   } catch (err: any) {
  //     console.error('Account Sync Error:', err);
  //     if (!quiet) {
  //       let errorDetail = this.t('home.swal.uploadFailedDetail');
  //       if (err.status === 0) errorDetail = this.t('home.swal.uploadFailedBridge');
  //       if (err.status === 500) errorDetail = this.t('home.swal.uploadFailedServer');
  //       Swal.fire(this.t('common.error'), errorDetail, 'error');
  //     }
  //     return 'failed';
  //   }
  // }


  // Add this helper method inside your HomeComponent class to normalize dates
private getLocalMidnight(dateVal: any): Date {
  if (!dateVal) return new Date(NaN);
  
  let d: Date;
  // If it's a standard YYYY-MM-DD string, parse it manually to guarantee local midnight
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
    const [yyyy, mm, dd] = dateVal.split('-').map(Number);
    d = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
  } else {
    d = new Date(dateVal);
    d.setHours(0, 0, 0, 0);
  }
  return d;
}


  async doUploadMilkSale(quiet = false, stepIndex?: number): Promise<'success' | 'failed' | 'skipped' | 'cancelled'> {
  const fileName = this.storage.getDatabaseName();

  console.log('[MilkSale] Initializing transfer checks...', {
    fileName,
    society: this.society,
    hasMilkSale: this.hasMilkSale,
    fromDate: this.fromDate,
    toDate: this.toDate
  });

  if (!this.society) {
    const errorMsg = 'Society profile is not loaded. Cannot sync milk sales.';
    console.error(`[MilkSale] ${errorMsg}`);
    this.setStatus(errorMsg, true);
    Swal.fire(this.t('common.error'), errorMsg, 'error');
    return 'failed';
  }

  if (!this.hasMilkSale) {
    const errorMsg = 'Milk sale permissions are not enabled for this society.';
    console.error(`[MilkSale] ${errorMsg}`);
    this.setStatus(errorMsg, true);
    Swal.fire(this.t('common.denied'), errorMsg, 'warning');
    return 'failed';
  }

// Handle case-insensitive Postgres/C# properties gracefully (activeDate vs activedate vs ActiveDate)
  const rawActiveDate = this.society.activeDate ?? this.society.activedate ?? this.society.ActiveDate;
  if (rawActiveDate) {
    const selDate = this.getLocalMidnight(this.fromDate); // Normalized to local midnight
    const activeDate = this.getLocalMidnight(rawActiveDate); // Normalized to local midnight

    if (!isNaN(selDate.getTime()) && !isNaN(activeDate.getTime())) {
      // This blocks the transfer ONLY if the selected date is strictly prior to (less than) the active date.
      // If the selected date is equal to or greater than the active date, it bypasses the block and transfers successfully.
      if (selDate < activeDate) {
        const warnMsg = `Cannot transfer data before the active date (${rawActiveDate}).`;
        console.warn(`[MilkSale] ${warnMsg}`);
        this.setStatus(warnMsg, true);
        
        // Force display of the warning so the user is not left blind
        await Swal.fire({
          title: this.t('common.warning'),
          text: warnMsg,
          icon: 'warning'
        });
        return 'failed';
      }
    }
  }

  try {
    console.log('[MilkSale] Querying local database for transfer rows...');
    
    const bridgeRes: any = await firstValueFrom(
      this.accessService.getSyncMilkSale(
        fileName || '', 
        this.fromDate, 
        this.toDate, 
        this.collectionTime ?? 0
      )
    );

    console.log('[MilkSale] Local database response received:', bridgeRes);

    if (!bridgeRes || !bridgeRes.milksale || bridgeRes.milksale.length === 0) {
      console.warn('[MilkSale] No local records found for the selected date range.');
      if (!quiet) {
        Swal.fire(this.t('common.info'), this.t('home.swal.noMilkSaleLocal'), 'info');
      } else {
        this.setStatus(this.t('home.swal.noMilkSaleLocal'), true);
      }
      return 'skipped';
    }

    const count = bridgeRes.milksale.length;
    if (stepIndex !== undefined) {
      this.setStepRecordProgress(stepIndex, 0, count, this.t('home.progress.uploadingMilkSale'));
    }

    console.log(`[MilkSale] Uploading ${count} records to server...`);
    
    await firstValueFrom(
      this.milkService.milkSaleSyncPush((bridgeRes.msParam ?? '').toString(), bridgeRes)
    );

    console.log('[MilkSale] Upload completed successfully.');

    if (stepIndex !== undefined) {
      this.setStepRecordProgress(stepIndex, count, count, this.t('home.progress.uploadComplete'));
    }

    return 'success';
  } catch (err: any) {
    console.error('[MilkSale] Sync Exception Caught:', err);
    
    const errorDetail = err?.message || JSON.stringify(err) || 'Unknown error';
    this.setStatus(`Milk Sale Sync Error: ${errorDetail}`, true);
    
    // Always trigger an alert for unexpected script/network exceptions
    await Swal.fire(
      this.t('common.error'),
      `Milk Sale Sync failed: ${errorDetail}`,
      'error'
    );
    
    return 'failed';
  }
}

  async doUploadAccount(quiet = false, stepIndex?: number): Promise<'success' | 'failed' | 'skipped' | 'cancelled'> {
    if (!this.hasLedger) {
      if (!quiet) Swal.fire('Access Denied', 'Accounting module is not enabled for this society.', 'warning');
      return 'failed';
    }

    const fileName = this.storage.getDatabaseName();
    const soc = this.storage.getSocCode();

    try {
      // 1. Load records from Access
      const accRows = await firstValueFrom(this.accessService.getAccountRecords(fileName, this.fromDate, this.toDate));
      const glmsRows = await firstValueFrom(this.accessService.getGlmsRecords(fileName));

      const totalRecords = (accRows?.length ?? 0) + (glmsRows?.length ?? 0);
      if (!totalRecords) {
        if (!quiet) Swal.fire('Info', 'No account records found to transfer.', 'info');
        return 'skipped';
      }

      // 2. CHECK: Does data already exist on the server?
      const serverAccData = await firstValueFrom(this.milkService.checkAccountServerStatus(this.fromDate, this.toDate));

      if (serverAccData && serverAccData.length > 0) {
        const swalRes = await Swal.fire({
          title: 'Overwrite Account Data?',
          text: `Server already has ${serverAccData.length} account records for this period. Replace them?`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Yes, Overwrite'
        });
        if (!swalRes.isConfirmed) return 'cancelled';

        // 3. THE CLEANUP: Explicitly delete first
        this.setStatus('Cleaning old account records...', true);
        await firstValueFrom(this.milkService.deleteAccounts(this.fromDate, this.toDate, soc));
      }

      // 4. THE UPLOAD
      if (stepIndex !== undefined) {
        this.setStepRecordProgress(stepIndex, 0, totalRecords, 'Uploading account data...');
      }

      let done = 0;

      // Upload Account Transactions
      if (accRows && accRows.length > 0) {
        await firstValueFrom(this.milkService.sendAccounts(this.fromDate, this.toDate, accRows));
        done += accRows.length;
        if (stepIndex !== undefined) {
          this.setStepRecordProgress(stepIndex, done, totalRecords, 'Account transactions synced');
        }
      }

      // Upload Ledger Masters
      if (glmsRows && glmsRows.length > 0) {
        await firstValueFrom(this.milkService.sendGlms(glmsRows));
        done += glmsRows.length;
        if (stepIndex !== undefined) {
          this.setStepRecordProgress(stepIndex, done, totalRecords, 'Ledger master synced');
        }
      }

      return 'success';
    } catch (err: any) {
      if (!quiet) this.handleError(err, 'Account sync failed.');
      else console.error('Account Sync Error:', err);
      return 'failed';
    }
  }


  private async doUploadMembers(quiet = false, stepIndex?: number): Promise<'success' | 'failed' | 'skipped' | 'cancelled'> {
    const fileName = this.storage.getDatabaseName();
    const socCode = this.storage.getSocCode();

    if (!fileName || !socCode) {
      if (!quiet) this.setStatus(this.t('home.status.missingFileOrUser'));
      return 'failed';
    }

    try {
      const rawMembers = await firstValueFrom(this.accessService.getMembers(fileName));

      if (!rawMembers || rawMembers.length === 0) {
        if (!quiet) Swal.fire(this.t('common.info'), this.t('home.swal.noMemberData'), 'info');
        return 'skipped';
      }

      const member = rawMembers.map((row: any) => ({
        membCode: row.memb_code,
        membName: row.memb_name,
        zoonCode: row.zoon_code,
        cobfType: row.Cobf_type,
        rategrno: row.rategrno,
        membnamEng: row.membNam_Eng,
        mobno: row.MobNo,
        socCode: Number(socCode),
        isDir: 0,
        accno: row.accno
      }));

      if (stepIndex !== undefined) {
        this.setStepRecordProgress(stepIndex, 0, member.length, this.t('home.progress.uploadingMembers'));
      }

      await firstValueFrom(this.milkService.sendMembers(member));

      if (stepIndex !== undefined) {
        this.setStepRecordProgress(stepIndex, member.length, member.length, this.t('home.progress.membersUploaded'));
      }

      return 'success';
    } catch (err) {
      console.error(err);
      if (!quiet) Swal.fire(this.t('common.error'), this.t('home.swal.memberUploadFailed'), 'error');
      return 'failed';
    }
  }

  private async doUploadRateChartHalf(
    cobf: 'C' | 'B',
    rawRows: any[],
    quiet = false,
    stepIndex?: number
  ): Promise<'success' | 'failed' | 'skipped' | 'cancelled'> {
    try {
      this.isRateChartSending = true;
      const rateType = cobf === 'C' ? this.t('home.progress.cow') : this.t('home.progress.buffalo');
      if (stepIndex !== undefined) {
        this.setStepRecordProgress(stepIndex, 0, rawRows.length, this.t('home.progress.sendingRates', { type: rateType }));
      }
      await firstValueFrom(this.milkService.sendRateChart(cobf, rawRows));
      if (stepIndex !== undefined) {
        this.setStepRecordProgress(stepIndex, rawRows.length, rawRows.length, this.t('home.progress.rateChartSent'));
      }
      return 'success';
    } catch (err: any) {
      console.error(`[RateChart] ${cobf} transfer failed:`, err);
      if (!quiet) {
        let errorDetail = this.t('home.swal.rateChartFailed');
        if (err.status === 400) errorDetail = this.t('home.swal.rateChartValidation');
        if (err.status === 401) errorDetail = this.t('home.swal.rateChartUnauthorized');
        if (err.status === 500) errorDetail = this.t('home.swal.rateChartServer');
        if (err.status === 0) errorDetail = this.t('home.swal.rateChartNetwork');
        Swal.fire(this.t('common.error'), errorDetail, 'error');
      }
      return 'failed';
    } finally {
      this.isRateChartSending = false;
    }
  }


// =========================================================
// DOWNLOAD / SYNC SECTION (Matches C# GetData logic)
// =========================================================

/**
 * Matches C# CollectionDownload + downloadcollection
 * Flow: Confirm -> Clear Local -> Fetch Live -> Deduplicate -> BATCHED Save Local
 */
async downloadCollection(): Promise<void> {
  const fileName = this.storage.getDatabaseName();

  if (!this.selectedDevice || !this.downloadFromDate || !this.downloadToDate) {
    Swal.fire(this.t('common.error'), this.t('home.swal.selectDeviceDates'), 'error');
    return;
  }

  const confirm = await Swal.fire({
    title: this.t('home.swal.overwriteDownloadTitle'),
    text: this.t('home.swal.overwriteDownloadText'),
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: this.t('common.yesOverwrite'),
    cancelButtonText: this.t('common.cancel'),
  });

  if (!confirm.isConfirmed) return;

  const cobf = this.downloadMilkType === 1 ? 'C' : (this.downloadMilkType === 2 ? 'B' : '0');
  const stepNames = [
    this.t('home.progress.clearLocal'),
    this.t('home.progress.downloadFromServer'),
    this.t('home.progress.saveToDatabase'),
  ];

  this.isUploading = true;
  this.transferFinished = false;
  this.activeTransferKind = 'download-col';
  this.beginProgress(stepNames);

  const succeeded: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];

  try {
    this.setStepRunning(0, this.t('home.progress.clearingLocal'));
    await firstValueFrom(this.accessService.clearLocal(
      fileName, this.downloadFromDate, this.downloadToDate, +this.downloadTime, +this.selectedDevice
    ));
    this.setStepDone(0);
    this.refreshProgressPercent();

    this.setStepRunning(1, this.t('home.progress.fetchingLive'));
    const remoteData = await firstValueFrom(
      this.milkService.collectionDownload(
        this.downloadFromDate, this.downloadToDate, +this.downloadTime, cobf, +this.selectedDevice
      )
    ) as any[];

    if (!remoteData?.length) {
      this.setStepSkipped(1);
      this.setStepSkipped(2);
      skipped.push(this.t('home.progress.downloadFromServer') + ' (' + this.t('home.progress.skipped') + ')');
      await this.completeProgress(succeeded, failed, skipped);
      return;
    }

    const uniqueData = this.deduplicateMilkData(remoteData);
    this.setStepRecordProgress(1, uniqueData.length, uniqueData.length, this.t('home.progress.downloaded'));
    this.setStepDone(1);
    this.refreshProgressPercent();

    this.setStepRunning(2, this.t('home.progress.savingLocal'));
    const batchSize = 100;
    let totalSaved = 0;

    for (let i = 0; i < uniqueData.length; i += batchSize) {
      const chunk = uniqueData.slice(i, i + batchSize);
      await firstValueFrom(this.accessService.saveToLocal(fileName, chunk));
      totalSaved += chunk.length;
      this.setStepRecordProgress(2, totalSaved, uniqueData.length, this.t('home.progress.savingBatch', { batch: Math.ceil(totalSaved / batchSize) }));
    }

    this.setStepDone(2);
    succeeded.push(`${this.t('home.downloadCollection')} (${totalSaved})`);
    this.syncGlobalRecordTotals();
    await this.completeProgress(succeeded, failed, skipped);
  } catch (err: any) {
    console.error(err);
    await this.failProgress(this.t('home.swal.downloadFailed', { detail: err.message || this.t('home.swal.uploadFailedServer') }));
    failed.push(this.t('home.downloadCollection'));
  } finally {
    this.isUploading = false;
    this.touchProgress();
    if (this.transferFinished) this.scheduleProgressHide();
  }
}

async downloadMilkSale(): Promise<void> {
  const fileName = this.storage.getDatabaseName();
  const shift = +this.downloadTime;
  const devId = this.selectedDevice ? Number(this.selectedDevice) : 1;

  const dateChunks = this.getDateChunks(this.downloadFromDate, this.downloadToDate, 30);
  const stepNames = dateChunks.map(c => this.t('home.progress.syncChunk', { from: c.from, to: c.to }));

  this.isUploading = true;
  this.transferFinished = false;
  this.activeTransferKind = 'download-sale';
  this.beginProgress(stepNames.length ? stepNames : [this.t('home.downloadMilkSale')]);

  const succeeded: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];

  try {
    for (let i = 0; i < dateChunks.length; i++) {
      const chunk = dateChunks[i];
      this.setStepRunning(i, this.t('home.progress.checkingServerDate', { date: chunk.from }));

      let serverHasData = false;
      try {
        const res = await firstValueFrom(this.milkService.checkMilkSaleServerStatus(chunk.from, chunk.to, shift, devId));
        serverHasData = res && res.length > 0;
      } catch {
        serverHasData = false;
      }

      if (serverHasData) {
        try {
          const bridgeRes: any = await firstValueFrom(
            this.accessService.getSyncMilkSale(fileName, chunk.from, chunk.to, shift)
          );

          if (bridgeRes?.milksale?.length) {
            this.setStepRecordProgress(i, 0, bridgeRes.milksale.length, this.t('home.progress.uploadingSales'));
            await firstValueFrom(
              this.milkService.milkSaleSyncPush(bridgeRes.msParam.toString(), bridgeRes)
            );
            this.setStepRecordProgress(i, bridgeRes.milksale.length, bridgeRes.milksale.length, this.t('home.progress.synced'));
            this.setStepDone(i);
            succeeded.push(`${chunk.from}: ${bridgeRes.milksale.length}`);
          } else {
            this.setStepSkipped(i);
            skipped.push(`${chunk.from} (${this.t('home.progress.skipped')})`);
          }
        } catch (err) {
          console.error(`Local sales sync failed for chunk: ${chunk.from}`, err);
          this.setStepFailed(i);
          failed.push(`${chunk.from}`);
        }
      } else {
        const confirm = await Swal.fire({
          title: this.t('home.swal.serverEmptyTitle'),
          text: this.t('home.swal.serverEmptyText', { date: chunk.from }),
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: this.t('common.yes'),
          cancelButtonText: this.t('common.cancel'),
        });

        if (confirm.isConfirmed) {
          const localColl = await firstValueFrom(
            this.accessService.getcollection(fileName, chunk.from, chunk.to, shift)
          ) as any[];

          if (localColl?.length) {
            this.setStepRecordProgress(i, 0, localColl.length, this.t('home.progress.uploadingCollection'));
            await firstValueFrom(this.milkService.postMilkTrnManual({
              milktrn: localColl,
              me: shift,
              fromDate: chunk.from,
              toDate: chunk.to
            }, devId));
            this.setStepRecordProgress(i, localColl.length, localColl.length, this.t('home.progress.collectionSynced'));
            this.setStepDone(i);
            succeeded.push(`${chunk.from}: ${localColl.length}`);
          } else {
            this.setStepSkipped(i);
            skipped.push(`${chunk.from} (${this.t('home.progress.skipped')})`);
          }
        } else {
          this.setStepSkipped(i);
          skipped.push(`${chunk.from} (${this.t('common.cancel')})`);
        }
      }

      this.refreshProgressPercent();
    }

    this.syncGlobalRecordTotals();
    await this.completeProgress(succeeded, failed, skipped);
  } catch (err: any) {
    console.error(err);
    await this.failProgress(this.t('home.swal.milkSaleSyncStopped'));
    failed.push(this.t('home.downloadMilkSale'));
  } finally {
    this.isUploading = false;
    this.touchProgress();
    if (this.transferFinished) this.scheduleProgressHide();
  }
}

/**
 * Download deductions from live server into local Access DB.
 * Uses download date range only.
 * Flow: Fetch live /dedentry -> POST localhost /save-deductions
 */
async downloadDeductions(): Promise<void> {
  const fileName = this.storage.getDatabaseName();

  if (!this.downloadFromDate || !this.downloadToDate) {
    Swal.fire(this.t('common.error'), this.t('home.swal.selectDates'), 'error');
    return;
  }

  const confirm = await Swal.fire({
    title: this.t('home.swal.overwriteDeductionsTitle'),
    text: this.t('home.swal.overwriteDownloadText'),
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: this.t('common.yesOverwrite'),
    cancelButtonText: this.t('common.cancel'),
  });

  if (!confirm.isConfirmed) return;

  const stepNames = [
    this.t('home.progress.downloadFromServer'),
    this.t('home.progress.saveToDatabase'),
  ];

  this.isUploading = true;
  this.transferFinished = false;
  this.activeTransferKind = 'download-ded';
  this.beginProgress(stepNames);

  const succeeded: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];

  try {
    this.setStepRunning(0, this.t('home.progress.fetchingLive'));
    const remoteData = await firstValueFrom(
      this.milkService.getDeductionsFromLive(this.downloadFromDate, this.downloadToDate)
    ) as any[];

    if (!remoteData?.length) {
      this.setStepSkipped(0);
      this.setStepSkipped(1);
      skipped.push(this.t('home.progress.downloadFromServer') + ' (' + this.t('home.progress.skipped') + ')');
      await this.completeProgress(succeeded, failed, skipped);
      return;
    }

    // Map live records to AccessDedentryDto shape expected by save-deductions
    const payload = remoteData.map((r: any) => ({
      dedctnDate: this.toAccessDate(r.dedctnDate ?? r.DedctnDate ?? r.dedctndate),
      dedctnTrno: Number(r.dedctnTrno ?? r.DedctnTrno ?? r.dedctntrno ?? 0),
      dedcode: Number(r.dedcode ?? r.Dedcode ?? r.dedCode ?? 0),
      membCode: Number(r.membCode ?? r.MembCode ?? r.memb_code ?? 0),
      dedctnAmt1: Number(r.dedctnAmt1 ?? r.DedctnAmt1 ?? r.dedctnamt1 ?? 0),
      actdedAmt: Number(r.actdedAmt ?? r.ActdedAmt ?? r.actdedamt ?? 0),
      cobf: String(r.cobf ?? r.Cobf ?? 'C').substring(0, 1).toUpperCase(),
      trntype: Number(r.trntype ?? r.Trntype ?? r.trnType ?? 0),
      mbillno: Number(r.mbillno ?? r.Mbillno ?? r.mBillNo ?? 0),
      billno: Number(r.billno ?? r.Billno ?? r.billNo ?? 0),
    }));

    this.setStepRecordProgress(0, payload.length, payload.length, this.t('home.progress.downloaded'));
    this.setStepDone(0);
    this.refreshProgressPercent();

    this.setStepRunning(1, this.t('home.progress.savingLocal'));
    await firstValueFrom(this.accessService.saveDeductions(fileName, payload));
    this.setStepRecordProgress(1, payload.length, payload.length, this.t('home.progress.deductionsUploaded'));
    this.setStepDone(1);

    succeeded.push(`${this.t('home.downloadDeductions')} (${payload.length})`);
    this.syncGlobalRecordTotals();
    await this.completeProgress(succeeded, failed, skipped);
  } catch (err: any) {
    console.error(err);
    await this.failProgress(this.t('home.swal.downloadFailed', { detail: err.message || this.t('home.swal.uploadFailedServer') }));
    failed.push(this.t('home.downloadDeductions'));
  } finally {
    this.isUploading = false;
    this.touchProgress();
    if (this.transferFinished) this.scheduleProgressHide();
  }
}

/** Format date for Access DedctnDate field (yyyy-MM-dd) */
private toAccessDate(val: any): string {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const dd = String(val.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  const str = String(val).trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return str.split('T')[0] || '';
}

/**
 * FIXED: Uses UTC-based Date calculations to eliminate system timezone shifts
 */
private getDateChunks(start: string, end: string, daysPerChunk: number) {
  const chunks = [];
  
  // Parse with strict UTC midnight bounds
  let currentStart = new Date(start + 'T00:00:00Z');
  const finalEnd = new Date(end + 'T00:00:00Z');

  while (currentStart <= finalEnd) {
    let currentEnd = new Date(currentStart);
    currentEnd.setUTCDate(currentEnd.getUTCDate() + daysPerChunk);
    
    if (currentEnd > finalEnd) currentEnd = new Date(finalEnd);

    chunks.push({
      from: currentStart.toISOString().split('T')[0],
      to: currentEnd.toISOString().split('T')[0]
    });

    currentStart = new Date(currentEnd);
    currentStart.setUTCDate(currentStart.getUTCDate() + 1);
  }
  return chunks;
}

/**
 * Replicates C# GroupBy logic to ensure unique primary keys in .mdb
 */
private deduplicateMilkData(data: any[]): any[] {
  const seen = new Set();
  return data.filter(item => {
    const key = `${item.trndate}_${item.me}_${item.cobf}_${item.membCode}_${item.lineno}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
} 


// =====================================================
// AUTO UPLOAD
// =====================================================
  autoUploadOn(): void {
  if (this.autoUpload) return;

  Swal.fire(this.t('common.info'), this.t('home.swal.autoUploadEnable'), 'info');

  this.autoUpload = true;
  this.setStatus(this.t('home.status.autoUploadOn'));

  this.autoTimer = setInterval(() => {
    const activeDate = this.society?.activeDate ?? '';
    this.milkService.runAutoUploadCycle(activeDate).subscribe({
      next: () => console.log('Auto upload cycle completed'),
      error: (err) => console.error('Auto upload cycle failed:', err)
    });
  }, 60000);
}

autoUploadOff(): void {
  this.stopAutoUploadTimer();
  this.setStatus(this.t('home.status.autoUploadOff'));
}

private stopAutoUploadTimer(): void {
    if (this.autoTimer) clearInterval(this.autoTimer);
    this.autoTimer = null;
    this.autoUpload = false;
  }

  private async doUploadZones(quiet = false, stepIndex?: number): Promise<'success' | 'failed' | 'skipped' | 'cancelled'> {
  const fileName = this.storage.getDatabaseName();
  const socCode = Number(this.storage.getSocCode());

  try {
    const rawZones = await firstValueFrom(this.accessService.getZoonRecords(fileName));

    if (!rawZones || rawZones.length === 0) {
      if (!quiet) this.setStatus('No zone records found.');
      return 'skipped';
    }

    // Format the payload to match ZoonmstViewModel in C#
    const payload = {
      soccode: socCode,
      zones: rawZones // The bridge already formatted keys to branchId, branchName, etc.
    };

    if (stepIndex !== undefined) {
      this.setStepRecordProgress(stepIndex, 0, rawZones.length, 'Uploading zones...');
    }

    await firstValueFrom(this.masterService.sendZones(payload));

    if (stepIndex !== undefined) {
      this.setStepRecordProgress(stepIndex, rawZones.length, rawZones.length, 'Zones uploaded');
    }

    return 'success';
  } catch (err) {
    console.error('Zone upload error:', err);
    return 'failed';
  }
}

  // =====================================================
  // UTILS
  // =====================================================
private setStatus(msg: string, persistent = false): void {
  // Defer state mutation to next tick to completely eliminate NG0100 error
  setTimeout(() => {
    this.statusMsg = msg;
    this.cdr.markForCheck();
  });

  if (this.statusClearTimer) {
    clearTimeout(this.statusClearTimer);
    this.statusClearTimer = null;
  }
  if (!persistent && !this.isUploading && !this.isMasterUploading) {
    this.statusClearTimer = setTimeout(() => {
      setTimeout(() => {
        this.statusMsg = '';
        this.cdr.markForCheck();
      });
    }, 5000);
  }
}

  logout(): void {
    this.stopAutoUploadTimer();
    this.storage.clear();
    this.router.navigate(['/login']);
  }
}