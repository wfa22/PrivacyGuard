import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, tokenStorage } from './api';

describe('api client', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('stores tokens on login', async () => {
    const fetchMock = vi.spyOn(global, 'fetch' as any);

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          token_type: 'Bearer',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 1,
          username: 'alice',
          email: 'alice@test.com',
          role: 'user',
        }),
      } as Response);

    await api.login({
      email: 'alice@test.com',
      password: 'secret',
    });

    expect(tokenStorage.getToken()).toBe('access-1');
    expect(tokenStorage.getRefreshToken()).toBe('refresh-1');
    expect(tokenStorage.getUser()?.username).toBe('alice');
  });

  it('refreshes token on 401 and retries request', async () => {
    tokenStorage.setToken('expired-access');
    tokenStorage.setRefreshToken('refresh-1');

    const fetchMock = vi.spyOn(global, 'fetch' as any);

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Unauthorized' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          token_type: 'Bearer',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 1,
          username: 'alice',
          email: 'alice@test.com',
          role: 'user',
        }),
      } as Response);

    const user = await api.getCurrentUser();

    expect(user.username).toBe('alice');
    expect(tokenStorage.getToken()).toBe('new-access');
    expect(tokenStorage.getRefreshToken()).toBe('new-refresh');
  });

  it('forces logout if refresh fails', async () => {
    tokenStorage.setToken('expired-access');
    tokenStorage.setRefreshToken('bad-refresh');

    const onForceLogout = vi.fn();
    api.onForceLogout = onForceLogout;

    const fetchMock = vi.spyOn(global, 'fetch' as any);

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Unauthorized' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Refresh failed' }),
      } as Response);

    await expect(api.getCurrentUser()).rejects.toThrow('Session expired');

    expect(tokenStorage.getToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(onForceLogout).toHaveBeenCalled();
  });
});