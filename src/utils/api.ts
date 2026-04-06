// API Client for PrivacyGuard Backend

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

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
  original_filename: string | null;
  processed_url: string | null;
  processed: boolean;
  description: string | null;
  file_type: string | null;
  file_size: number | null;
  content_type: string | null;
  created_at: string | null;
  updated_at: string | null;
  // 5.1: Новое поле
  bg_removed: boolean | null;
}

export interface PaginatedMediaResponse {
  items: MediaResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface MediaFilterParams {
  search?: string;
  processed?: boolean;
  file_type?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_order?: string;
  page?: number;
  page_size?: number;
}

export interface ChangeRoleRequest {
  role: string;
}

// 5.5: Нормализованный тип для статуса Remove.bg
export interface RemoveBgStatus {
  available: boolean;
  credits_remaining: number | null;
  rate_limit_per_minute: number;
  message: string;
}

// ── Token Storage ──

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

type LogoutCallback = () => void;

// ── API Client ──

class ApiClient {
  private baseURL: string;
  private isRefreshing = false;
  private refreshQueue: Array<{
    resolve: (token: string) => void;
    reject: (err: Error) => void;
  }> = [];

  public onForceLogout: LogoutCallback | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

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

    if (response.status === 401 && !skipAuth && retryCount === 0) {
      const refreshToken = tokenStorage.getRefreshToken();
      if (refreshToken) {
        try {
          await this.doRefresh();
          return this.request<T>(endpoint, options, false, retryCount + 1);
        } catch {
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

  private async doRefresh(): Promise<string> {
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

      this.refreshQueue.forEach(({ resolve }) => resolve(data.access_token));
      this.refreshQueue = [];

      return data.access_token;
    } catch (err) {
      this.refreshQueue.forEach(({ reject }) => reject(err as Error));
      this.refreshQueue = [];
      throw err;
    } finally {
      this.isRefreshing = false;
    }
  }

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
    }, true);
  }

  async login(credentials: LoginRequest): Promise<TokenResponse> {
    const response = await this.request<TokenResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }, true);

    tokenStorage.setToken(response.access_token);
    tokenStorage.setRefreshToken(response.refresh_token);

    const user = await this.getCurrentUser();
    tokenStorage.setUser(user);

    return response;
  }

  async logout(): Promise<void> {
    const refreshToken = tokenStorage.getRefreshToken();
    if (refreshToken) {
      try {
        await this.request<void>('/api/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch {
        // fallback
      }
    }
    tokenStorage.clear();
  }

  // ══════════════════════════════════════
  // Media endpoints
  // ══════════════════════════════════════

  // 5.2: Обновлённый upload с поддержкой remove_bg
  async uploadMedia(
    file: File,
    description?: string,
    removeBg: boolean = false,
  ): Promise<MediaResponse> {
    const token = tokenStorage.getToken();
    if (!token) throw new Error('Not authenticated');

    const formData = new FormData();
    formData.append('file', file);
    if (description) formData.append('description', description);
    formData.append('remove_bg', String(removeBg));

    const response = await fetch(`${this.baseURL}/api/media/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });

    if (response.status === 401) {
      try {
        await this.doRefresh();
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

  async listMedia(params?: MediaFilterParams): Promise<PaginatedMediaResponse> {
    const searchParams = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.set(key, String(value));
        }
      }
    }
    const query = searchParams.toString();
    return this.request<PaginatedMediaResponse>(`/api/media/${query ? `?${query}` : ''}`);
  }

  async getMedia(mediaId: number): Promise<MediaResponse> {
    return this.request<MediaResponse>(`/api/media/${mediaId}`);
  }

  async updateMedia(mediaId: number, data: { description?: string }): Promise<MediaResponse> {
    return this.request<MediaResponse>(`/api/media/${mediaId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async downloadMedia(mediaId: number): Promise<Blob> {
    const token = tokenStorage.getToken();
    if (!token) throw new Error('Not authenticated');

    let response = await fetch(`${this.baseURL}/api/media/${mediaId}/download`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

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
  // 5.2: Remove.bg status endpoint
  // ══════════════════════════════════════

  async getRemoveBgStatus(): Promise<RemoveBgStatus> {
    return this.request<RemoveBgStatus>('/api/media/removebg/status');
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