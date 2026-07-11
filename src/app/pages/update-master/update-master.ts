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
  private lang = inject(LanguageService);

  members: any[] = [];
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

  loadMembers() {
  this.loading = true;

  this.masterService.getMembersBySociety(this.socCode).subscribe({
    next: (res: any[]) => {
      this.members = [...res];
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
      .updateSocietyMembers(this.socCode, this.members)
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
