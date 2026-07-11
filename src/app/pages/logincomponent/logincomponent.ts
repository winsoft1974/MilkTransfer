import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth';
import { LanguageService } from '../../services/language';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageToggleComponent } from '../../components/language-toggle/language-toggle';

@Component({
  selector: 'app-logincomponent',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, LanguageToggleComponent],
  templateUrl: './logincomponent.html',
  styleUrls: ['./logincomponent.css']
})
export class Logincomponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private lang = inject(LanguageService);

  loginForm: FormGroup;
  loading = false;
  errorMessage = '';
  returnUrl = '/home';

  constructor() {
    this.loginForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required]
    });

    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/home';

    if (this.authService.isLoggedIn()) {
      this.router.navigateByUrl(this.returnUrl);
    }
  }

  login(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      this.errorMessage = this.lang.t('login.required');
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const username = this.loginForm.get('username')?.value;
    const password = this.loginForm.get('password')?.value;

    this.authService.login(username, password).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigateByUrl(this.returnUrl);
      },
      error: (err: any) => {
        this.loading = false;
        console.error('Login Error:', err);
        this.errorMessage =
          err?.error?.message ||
          err?.error?.title ||
          this.lang.t('login.invalidCredentials');
      }
    });
  }

  clearForm(): void {
    this.loginForm.reset();
    this.errorMessage = '';
  }

  get f() {
    return this.loginForm.controls;
  }
}
