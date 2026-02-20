import { computed, Injectable, signal } from '@angular/core';

const SESSION_KEY = 'ng-todos-auth';

interface Session {
  token: string;
  username: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _session = signal<Session | null>(this._restore());

  readonly isLoggedIn = computed(() => this._session() !== null);
  readonly username = computed(() => this._session()?.username ?? '');
  readonly sessionExpired = signal(false);

  loginWithToken(token: string, username: string): void {
    this.sessionExpired.set(false);
    const session: Session = { token, username };
    this._session.set(session);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  logout(expired = false): void {
    if (expired && this._session() !== null) {
      this.sessionExpired.set(true);
    }
    this._session.set(null);
    sessionStorage.removeItem(SESSION_KEY);
  }

  getAuthHeader(): string | null {
    const s = this._session();
    return s ? `Bearer ${s.token}` : null;
  }

  private _restore(): Session | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session?.token || !session?.username) return null;
      return session as Session;
    } catch {
      return null;
    }
  }
}
