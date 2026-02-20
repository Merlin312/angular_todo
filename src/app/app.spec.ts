import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { App } from './app';
import { AuthService } from './auth.service';

// Mock AuthService — simulates a logged-in user so the main UI renders
const mockAuthService = {
  isLoggedIn: signal(true),
  username: signal('testuser'),
  sessionExpired: signal(false),
  logout: () => {},
  loginWithToken: () => {},
  getAuthHeader: () => 'Bearer test-token',
};

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render title when logged in', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const h1 = fixture.nativeElement.querySelector('h1') as HTMLElement | null;
    expect(h1?.textContent?.trim()).toBe('My Todos');
  });
});
