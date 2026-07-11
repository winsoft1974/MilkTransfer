import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http'; // Added HttpHeaders
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { StorageService } from './storage';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private storage: StorageService 
  ) {}

  /**
   * Authenticates the user against the API.
   * 
   * UPDATED: Added headers to match Swagger requirements:
   * Content-Type: application/json-patch+json
   */
  login(username: string, password: string): Observable<any> {
    // 1. Define the specific headers required by your Swagger UI
    const headers = new HttpHeaders({
      'accept': '*/*',
      'Content-Type': 'application/json-patch+json'
    });

    const body = { username, password };

    // 2. Ensure URL construction is clean
    // If apiUrl is '/api', this hits 'http://localhost:4200/api/User/login' 
    // which is then caught by your proxy.conf.json
    const url = `${this.apiUrl}/User/login`;

    return this.http.post(url, body, { headers }).pipe(
      tap((res: any) => {
        // Store auth token (JWT)
        if (res && res.authtoken) {
          this.storage.setToken(res.authtoken);
          
          // C# logic: username is the society code
          this.storage.setSocCode(username);

          console.log('Login successful. Token and SocCode stored.');
        }
      })
    );
  }

  /**
   * Returns the stored bearer token.
   * Replaces C# static bearerToken field.
   */
  getToken(): string {
    return this.storage.getToken();
  }

  /**
   * Returns the stored society code.
   * Replaces C# static socCode field.
   */
  getSocCode(): string {
    return this.storage.getSocCode();
  }

  /**
   * Logs out: clears all sessionStorage.
   */
  logout(): void {
    this.storage.clear();
  }

  /**
   * Returns true if the user is currently logged in (token exists).
   */
  isLoggedIn(): boolean {
    return !!this.storage.getToken();
  }
}