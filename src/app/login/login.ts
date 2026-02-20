import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../auth.service';

type Mode = 'login' | 'register';

interface AuthResponse {
  token: string;
  username: string;
}

@Component({
  selector: 'app-login',
  imports: [],
  templateUrl: './login.html',
  styleUrl: './login.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly mode = signal<Mode>('login');
  readonly sessionExpired = computed(() => this.auth.sessionExpired());
  readonly username = signal('');
  readonly password = signal('');
  readonly confirmPassword = signal('');
  readonly error = signal('');
  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  switchMode(m: Mode): void {
    this.mode.set(m);
    this.error.set('');
    this.password.set('');
    this.confirmPassword.set('');
    this.showPassword.set(false);
    this.showConfirmPassword.set(false);
  }

  toggleShowPassword(): void {
    this.showPassword.update((v) => !v);
  }

  toggleShowConfirmPassword(): void {
    this.showConfirmPassword.update((v) => !v);
  }

  onUsernameInput(e: Event): void {
    this.username.set((e.target as HTMLInputElement).value);
  }

  onPasswordInput(e: Event): void {
    this.password.set((e.target as HTMLInputElement).value);
  }

  onConfirmInput(e: Event): void {
    this.confirmPassword.set((e.target as HTMLInputElement).value);
  }

  submit(): void {
    if (this.mode() === 'login') {
      this._login();
    } else {
      this._register();
    }
  }

  private _login(): void {
    const u = this.username().trim();
    const p = this.password();
    if (!u || !p) {
      this.error.set('Please enter username and password');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.http
      .post<AuthResponse>('/api/auth/login', { username: u, password: p })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.auth.loginWithToken(res.token, res.username);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          if (err.status === 401) {
            this.error.set('Invalid username or password');
          } else if (err.status === 429) {
            this.error.set('Too many attempts, please wait');
          } else {
            this.error.set('Cannot connect to server');
          }
        },
      });
  }

  private _register(): void {
    const u = this.username().trim();
    const p = this.password();
    const cp = this.confirmPassword();
    if (!u || !p) {
      this.error.set('Please fill in all fields');
      return;
    }
    if (p !== cp) {
      this.error.set('Passwords do not match');
      return;
    }
    if (p.length < 6) {
      this.error.set('Password must be at least 6 characters');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.http
      .post<AuthResponse>('/api/auth/register', { username: u, password: p })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.auth.loginWithToken(res.token, res.username);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          if (err.status === 409) {
            this.error.set('Username already taken');
          } else if (err.status === 400) {
            this.error.set(err.error?.error ?? 'Invalid input');
          } else if (err.status === 429) {
            this.error.set('Too many attempts, please wait');
          } else {
            this.error.set('Cannot connect to server');
          }
        },
      });
  }
}
