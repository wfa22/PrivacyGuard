// API Client for PrivacyGuard Backend

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ── Types ──

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
}

export interface UserCreate {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface MediaResponse {
  id: number;
  user_id: number;
  original_url: string;
  processed_url: string | null;
  processed: boolean;
  description: string | null;
}

export interface ChangeRoleRequest {
  role: string;
}

// ── Token Storage (5.2 — централизованное хранение) ──

const TOKEN_KEY = 'privacyguard_access_token';
const REFRESH_TOKEN_KEY = 'privacyguard_refresh_token';
const USER_KEY = 'privacyguard_user';

export const tokenStorage = {
  getToken: (): string | null => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string): void => localStorage.setItem(TOKEN_KEY, token),

  getRefreshToken: (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY),
  setRefreshToken: (token: string): void => localStorage.setItem(REFRESH_TOKEN_KEY, token),

  getUser: (): User | null => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  setUser: (user: User): void => localStorage.setItem(USER_KEY, JSON.stringify(user)),

  clear: (): void => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

// ── Callback для принудительного logout из любого места ──
// App.tsx подписывается на это через api.onForceLogout = ...

type LogoutCallback = () => void;

// ── API Client с interceptor (5.3 + 5.5) ──

class ApiClient {
  private baseURL: string;
  private isRefreshing = false;
  private refreshQueue: Array<{
    resolve: (token: string) => void;
    reject: (err: Error) => void;
  }> = [];

  // 5.5 — колбэк для принудительного logout при невалидной сессии
  public onForceLogout: LogoutCallback | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  // ── Основной метод запросов с auto-refresh interceptor ──

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    skipAuth = false,
    retryCount = 0,
  ): Promise<T> {
    const token = tokenStorage.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (token && !skipAuth) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers,
    });

    // 5.3 — Interceptor: если 401 и есть refresh token — пробуем обновить
    if (response.status === 401 && !skipAuth && retryCount === 0) {
      const refreshToken = tokenStorage.getRefreshToken();
      if (refreshToken) {
        try {
          const newToken = await this.doRefresh();
          // Повторяем исходный запрос с новым токеном
          return this.request<T>(endpoint, options, false, retryCount + 1);
        } catch {
          // 5.5 — refresh не удался → полная очистка и редирект
          this.forceLogout();
          throw new Error('Session expired. Please login again.');
        }
      } else {
        this.forceLogout();
        throw new Error('Session expired. Please login again.');
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || `HTTP error! status: ${response.status}`);
    }

    if (response.status === 204) {
      return null as T;
    }

    return response.json();
  }

  // ── Refresh с очередью (если несколько запросов одновременно получили 401) ──

  private async doRefresh(): Promise<string> {
    // Если уже идёт refresh — ждём его результат
    if (this.isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        this.refreshQueue.push({ resolve, reject });
      });
    }

    this.isRefreshing = true;

    try {
      const refreshToken = tokenStorage.getRefreshToken();
      if (!refreshToken) throw new Error('No refresh token');

      const response = await fetch(`${this.baseURL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Refresh failed');
      }

      const data: TokenResponse = await response.json();
      tokenStorage.setToken(data.access_token);
      tokenStorage.setRefreshToken(data.refresh_token);

      // Разблокируем очередь ожидающих запросов
      this.refreshQueue.forEach(({ resolve }) => resolve(data.access_token));
      this.refreshQueue = [];

      return data.access_token;
    } catch (err) {
      // Все ожидающие запросы тоже получают ошибку
      this.refreshQueue.forEach(({ reject }) => reject(err as Error));
      this.refreshQueue = [];
      throw err;
    } finally {
      this.isRefreshing = false;
    }
  }

  // 5.5 — принудительный logout
  private forceLogout(): void {
    tokenStorage.clear();
    if (this.onForceLogout) {
      this.onForceLogout();
    }
  }

  // ══════════════════════════════════════
  // Auth endpoints
  // ══════════════════════════════════════

  async register(userData: UserCreate): Promise<User> {
    return this.request<User>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    }, true); // skipAuth — регистрация без токена
  }

  async login(credentials: LoginRequest): Promise<TokenResponse> {
    const response = await this.request<TokenResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }, true); // skipAuth — логин без токена

    tokenStorage.setToken(response.access_token);
    tokenStorage.setRefreshToken(response.refresh_token);

    // Кешируем профиль
    const user = await this.getCurrentUser();
    tokenStorage.setUser(user);

    return response;
  }

  // 5.1 — серверный logout: отзываем refresh token на бэкенде
  async logout(): Promise<void> {
    const refreshToken = tokenStorage.getRefreshToken();
    if (refreshToken) {
      try {
        await this.request<void>('/api/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch {
        // Даже если бэкенд недоступен — очищаем локальное состояние
      }
    }
    tokenStorage.clear();
  }

  // ══════════════════════════════════════
  // Media endpoints
  // ══════════════════════════════════════

  async uploadMedia(file: File, description?: string): Promise<MediaResponse> {
    const token = tokenStorage.getToken();
    if (!token) throw new Error('Not authenticated');

    const formData = new FormData();
    formData.append('file', file);
    if (description) formData.append('description', description);

    const response = await fetch(`${this.baseURL}/api/media/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });

    // Interceptor для upload
    if (response.status === 401) {
      try {
        await this.doRefresh();
        // Retry
        const newToken = tokenStorage.getToken();
        const retryResponse = await fetch(`${this.baseURL}/api/media/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${newToken}` },
          body: formData,
        });
        if (!retryResponse.ok) {
          const error = await retryResponse.json().catch(() => ({}));
          throw new Error(error.detail || 'Upload failed');
        }
        return retryResponse.json();
      } catch {
        this.forceLogout();
        throw new Error('Session expired');
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async listMedia(): Promise<MediaResponse[]> {
    return this.request<MediaResponse[]>('/api/media/');
  }

  async getMedia(mediaId: number): Promise<MediaResponse> {
    return this.request<MediaResponse>(`/api/media/${mediaId}`);
  }

  async downloadMedia(mediaId: number): Promise<Blob> {
    const token = tokenStorage.getToken();
    if (!token) throw new Error('Not authenticated');

    let response = await fetch(`${this.baseURL}/api/media/${mediaId}/download`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    // Interceptor для download
    if (response.status === 401) {
      try {
        await this.doRefresh();
        const newToken = tokenStorage.getToken();
        response = await fetch(`${this.baseURL}/api/media/${mediaId}/download`, {
          headers: { 'Authorization': `Bearer ${newToken}` },
        });
      } catch {
        this.forceLogout();
        throw new Error('Session expired');
      }
    }

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    return response.blob();
  }

  async deleteMedia(mediaId: number): Promise<void> {
    return this.request<void>(`/api/media/${mediaId}`, { method: 'DELETE' });
  }

  // ══════════════════════════════════════
  // User endpoints
  // ══════════════════════════════════════

  async getCurrentUser(): Promise<User> {
    const user = await this.request<User>('/api/users/me');
    tokenStorage.setUser(user);
    return user;
  }

  async listUsers(): Promise<User[]> {
    return this.request<User[]>('/api/users/');
  }

  async changeUserRole(userId: number, role: string): Promise<User> {
    return this.request<User>(`/api/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  async deleteUser(userId: number): Promise<void> {
    return this.request<void>(`/api/users/${userId}`, { method: 'DELETE' });
  }
}

export const api = new ApiClient(API_BASE_URL);