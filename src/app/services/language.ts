import { Injectable, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { en } from '../i18n/en';
import { mr } from '../i18n/mr';

export type AppLanguage = 'en' | 'mr';

type TranslationTree = { [key: string]: string | TranslationTree };

const STORAGE_KEY = 'appLanguage';

const translations: Record<AppLanguage, TranslationTree> = { en, mr };

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private document = inject(DOCUMENT);
  private platformId = inject(PLATFORM_ID);

  readonly lang = signal<AppLanguage>(this.loadSavedLanguage());

  constructor() {
    effect(() => {
      this.applyDocumentLanguage(this.lang());
    });
  }

  t(key: string, params?: Record<string, string | number>): string {
    const text = this.resolve(key, this.lang());
    if (!params) return text;
    return Object.entries(params).reduce(
      (result, [paramKey, value]) =>
        result.replace(new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g'), String(value)),
      text
    );
  }

  setLanguage(language: AppLanguage): void {
    this.lang.set(language);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(STORAGE_KEY, language);
    }
  }

  toggle(): void {
    this.setLanguage(this.lang() === 'en' ? 'mr' : 'en');
  }

  isMarathi(): boolean {
    return this.lang() === 'mr';
  }

  private loadSavedLanguage(): AppLanguage {
    if (!isPlatformBrowser(this.platformId)) return 'en';
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'mr' ? 'mr' : 'en';
  }

  private resolve(key: string, language: AppLanguage): string {
    const parts = key.split('.');
    let current: string | TranslationTree | undefined = translations[language];

    for (const part of parts) {
      if (current == null || typeof current === 'string') return key;
      current = current[part];
    }

    return typeof current === 'string' ? current : key;
  }

  private applyDocumentLanguage(language: AppLanguage): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const html = this.document.documentElement;
    html.lang = language === 'mr' ? 'mr' : 'en';
    html.classList.toggle('lang-mr', language === 'mr');
    html.classList.toggle('lang-en', language === 'en');
  }
}
