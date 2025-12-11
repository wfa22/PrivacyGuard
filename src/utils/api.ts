// API Client for PrivacyGuard Backend

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Types matching backend schemas
export interface User {
    id: number;
    username: string;
    email: string;
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

// Token management
const TOKEN_KEY = 'privacyguard_access_token';
const REFRESH_TOKEN_KEY = 'privacyguard_refresh_token';

export const tokenStorage = {
    getToken: (): string | null => {
        return localStorage.getItem(TOKEN_KEY);
    },
    setToken: (token: string): void => {
        localStorage.setItem(TOKEN_KEY, token);
    },
    getRefreshToken: (): string | null => {
        return localStorage.getItem(REFRESH_TOKEN_KEY);
    },
    setRefreshToken: (token: string): void => {
        localStorage.setItem(REFRESH_TOKEN_KEY, token);
    },
    clear: (): void => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
    },
};

// API Client
class ApiClient {
    private baseURL: string;

    constructor(baseURL: string) {
        this.baseURL = baseURL;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const token = tokenStorage.getToken();
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${this.baseURL}${endpoint}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({detail: response.statusText}));
            throw new Error(error.detail || `HTTP error! status: ${response.status}`);
        }

        // Handle 204 No Content
        if (response.status === 204) {
            return null as T;
        }

        return response.json();
    }

    // Auth endpoints
    async register(userData: UserCreate): Promise<User> {
        return this.request<User>('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData),
        });
    }

    async login(credentials: LoginRequest): Promise<TokenResponse> {
        const response = await this.request<TokenResponse>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials),
        });

        // Store tokens
        tokenStorage.setToken(response.access_token);
        tokenStorage.setRefreshToken(response.refresh_token);

        return response;
    }

    async refreshToken(): Promise<TokenResponse> {
        const refreshToken = tokenStorage.getRefreshToken();
        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        const response = await this.request<TokenResponse>('/api/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({refresh_token: refreshToken}),
        });

        // Update tokens
        tokenStorage.setToken(response.access_token);
        tokenStorage.setRefreshToken(response.refresh_token);

        return response;
    }

    // Media endpoints
    async uploadMedia(file: File, description?: string): Promise<MediaResponse> {
        const token = tokenStorage.getToken();
        if (!token) {
            throw new Error('Not authenticated');
        }

        const formData = new FormData();
        formData.append('file', file);
        // Note: description is sent as a query parameter in the backend, but we'll send it in FormData
        // The backend accepts it as an optional parameter
        if (description) {
            formData.append('description', description);
        }

        const response = await fetch(`${this.baseURL}/api/media/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                // Don't set Content-Type header - browser will set it automatically with boundary for FormData
            },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({detail: response.statusText}));
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

    async getMediaDownloadUrl(mediaId: number): Promise<string> {
        const res = await this.request<{ url: string }>(`/api/media/${mediaId}/download`);
        return res.url;
    }
    async downloadMedia(mediaId: number): Promise<Blob> {
        const token = tokenStorage.getToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        const response = await fetch(`${this.baseURL}/api/media/${mediaId}/download`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(`Download failed: ${response.status} ${response.statusText} ${text}`);
        }

        return await response.blob();
      }

    async deleteMedia(mediaId: number): Promise<void> {
        return this.request<void>(`/api/media/${mediaId}`, {
            method: 'DELETE',
        });
    }

    // User endpoints
    async getCurrentUser(): Promise<User> {
        return this.request<User>('/api/users/me');
    }
}

export const api = new ApiClient(API_BASE_URL);

