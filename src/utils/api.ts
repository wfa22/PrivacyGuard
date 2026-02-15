// API Client for PrivacyGuard Backend

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Types matching backend schemas
export interface User {
    id: number;
    username: string;
    email: string;
    role: string; // НОВОЕ
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

// Token management
const TOKEN_KEY = 'privacyguard_access_token';
const REFRESH_TOKEN_KEY = 'privacyguard_refresh_token';
const USER_KEY = 'privacyguard_user'; // НОВОЕ — кешируем юзера

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
    getUser: (): User | null => {
        const raw = localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
    },
    setUser: (user: User): void => {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    },
    clear: (): void => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
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
            const error = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(error.detail || `HTTP error! status: ${response.status}`);
        }

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

        tokenStorage.setToken(response.access_token);
        tokenStorage.setRefreshToken(response.refresh_token);

        // Сразу загружаем и кешируем профиль с ролью
        const user = await this.getCurrentUser();
        tokenStorage.setUser(user);

        return response;
    }

    async refreshToken(): Promise<TokenResponse> {
        const refreshToken = tokenStorage.getRefreshToken();
        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        const response = await this.request<TokenResponse>('/api/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refresh_token: refreshToken }),
        });

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
        if (description) {
            formData.append('description', description);
        }

        const response = await fetch(`${this.baseURL}/api/media/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });

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
        const user = await this.request<User>('/api/users/me');
        tokenStorage.setUser(user); // обновляем кеш
        return user;
    }

    // ── Admin endpoints ──
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
        return this.request<void>(`/api/users/${userId}`, {
            method: 'DELETE',
        });
    }
}

export const api = new ApiClient(API_BASE_URL);