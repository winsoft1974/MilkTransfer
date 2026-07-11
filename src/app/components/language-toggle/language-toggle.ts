import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LanguageService } from '../../services/language';

@Component({
  selector: 'app-language-toggle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="lang-toggle" role="group" [attr.aria-label]="lang.t('common.language')">
      <button
        type="button"
        class="lang-btn"
        [class.active]="lang.lang() === 'en'"
        (click)="lang.setLanguage('en')">
        EN
      </button>
      <button
        type="button"
        class="lang-btn"
        [class.active]="lang.lang() === 'mr'"
        (click)="lang.setLanguage('mr')">
        मर
      </button>
    </div>
  `,
  styles: [`
    .lang-toggle {
      display: inline-flex;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 8px;
      overflow: hidden;
      background: rgba(0, 0, 0, 0.15);
    }

    :host-context(.login-page) .lang-toggle {
      border-color: #d1d5db;
      background: #f3f4f6;
    }

    .lang-btn {
      border: none;
      background: transparent;
      color: inherit;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      min-width: 40px;
    }

    .lang-btn:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    :host-context(.login-page) .lang-btn {
      color: #374151;
    }

    :host-context(.login-page) .lang-btn:hover {
      background: #e5e7eb;
    }

    .lang-btn.active {
      background: #1e40af;
      color: #fff;
    }

    :host-context(.login-page) .lang-btn.active {
      background: #1e40af;
      color: #fff;
    }
  `],
})
export class LanguageToggleComponent {
  readonly lang = inject(LanguageService);
}
