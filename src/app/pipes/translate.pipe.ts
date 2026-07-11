import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../services/language';

@Pipe({
  name: 'translate',
  standalone: true,
  pure: false,
})
export class TranslatePipe implements PipeTransform {
  private language = inject(LanguageService);

  transform(key: string, params?: Record<string, string | number>): string {
    this.language.lang();
    return this.language.t(key, params);
  }
}
