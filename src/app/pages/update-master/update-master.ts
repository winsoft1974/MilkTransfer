import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChangeDetectorRef } from '@angular/core';
import { MasterService } from '../../services/master';
import { StorageService } from '../../services/storage';
import { LanguageService } from '../../services/language';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageToggleComponent } from '../../components/language-toggle/language-toggle';

@Component({
  selector: 'app-update-master',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, LanguageToggleComponent],
  templateUrl: './update-master.html',
  styleUrl: './update-master.css'
})
export class UpdateMasterComponent implements OnInit {

  private masterService = inject(MasterService);
  private storage = inject(StorageService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  public lang = inject(LanguageService);

  members: any[] = [];
  originalMembers: any[] = [];   // snapshot of values as loaded from server
  searchQuery: string = '';
  loading = false;
  saving = false;
  
  socCode = 0;
  tableFontClass = '';

  directorOptions = [
    { id: 0, nameKey: 'director.none' },
    { id: 1, nameKey: 'director.directorRole' },
    { id: 2, nameKey: 'director.collection' }
  ];

  ngOnInit(): void {
    this.socCode = Number(this.storage.getSocCode());

    if (!this.socCode) {
      alert(this.lang.t('director.societyNotFound'));
      return;
    }
    this.loadSocietyFont();
    this.loadMembers();
  }

  loadSocietyFont(): void {
    this.masterService.getSociety(this.socCode).subscribe({
      next: (society: any) => {

        switch (society?.langCode) {
          case 2:
            this.tableFontClass = 'font-marathi';
            break;

          case 3:
            this.tableFontClass = 'font-kannada';
            break;

          default:
            this.tableFontClass = '';
            break;
        }
      },
      error: err => {
        console.error('Error loading society', err);
      }
    });
  }

  get filteredMembers(): any[] {
    const list = this.searchQuery
      ? this.members.filter(m => {
          const lowerQuery = this.searchQuery.toLowerCase();
          const nameMatch = (m.membName || '').toLowerCase().includes(lowerQuery);
          const codeMatch = String(m.membCode || '').includes(lowerQuery);
          return nameMatch || codeMatch;
        })
      : [...this.members];

    // Directors/Collection (isDir > 0) first, then by membCode ascending
    return list.sort((a, b) => {
      const aIsDir = (a.isDir ?? 0) > 0 ? 0 : 1;
      const bIsDir = (b.isDir ?? 0) > 0 ? 0 : 1;
      if (aIsDir !== bIsDir) return aIsDir - bIsDir;
      return (a.membCode ?? 0) - (b.membCode ?? 0);
    });
  }

  onSearchChange() {
    this.cdr.detectChanges();
  }

  loadMembers() {
  this.loading = true;

  this.masterService.getMembersBySociety(this.socCode).subscribe({
    next: (res: any[]) => {
      this.members = res.map(m => ({ ...m }));          // editable copy
      this.originalMembers = res.map(m => ({ ...m }));  // immutable snapshot
      this.loading = false;
      this.cdr.detectChanges();
    },
    error: (err) => {
      console.error(err);
      this.loading = false;
      this.cdr.detectChanges();
    }
  });
}
  save(): void {
    this.saving = true;

    this.masterService
      .updateSocietyMembers(this.socCode, this.originalMembers, this.members)
      .subscribe({
        next: () => {
          alert(this.lang.t('director.updatedSuccess'));
          this.saving = false;
          this.loadMembers();
        },
        error: err => {
          console.error(err);
          alert(this.lang.t('director.updateFailed'));
          this.saving = false;
        }
      });
  }

  trackByMember(index: number, member: any): number {
  return member.membCode;
}

  goBack(): void {
    this.router.navigate(['/home']);
  }
}
