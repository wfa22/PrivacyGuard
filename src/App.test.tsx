import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import { api, tokenStorage } from './utils/api';

vi.mock('./components/AuthPage', () => ({
  AuthPage: ({ onLogin }: { onLogin: (v: boolean) => void }) => (
    <div>
      <div>Auth Page</div>
      <button onClick={() => onLogin(true)}>Mock Login</button>
    </div>
  ),
}));

vi.mock('./components/CensoringPage', () => ({
  CensoringPage: () => <div>Censoring Page</div>,
}));

vi.mock('./components/DashboardPage', () => ({
  DashboardPage: () => <div>Dashboard Page</div>,
}));

vi.mock('./components/AdminPage', () => ({
  AdminPage: () => <div>Admin Page</div>,
}));

vi.mock('./components/HomePage', () => ({
  HomePage: () => <div>Home Page</div>,
}));

describe('App routing and session behavior', () => {
  it('redirects guest from protected route to auth', async () => {
    vi.spyOn(tokenStorage, 'getToken').mockReturnValue(null);

    renderApp('/censoring');

    expect(await screen.findByText(/auth page/i)).toBeInTheDocument();
  });

  it('allows authenticated user to open protected route', async () => {
    vi.spyOn(tokenStorage, 'getToken').mockReturnValue('token');
    vi.spyOn(api, 'getCurrentUser').mockResolvedValue({
      id: 1,
      username: 'user',
      email: 'user@test.com',
      role: 'user',
    });

    renderApp('/censoring');

    expect(await screen.findByText(/censoring page/i)).toBeInTheDocument();
  });

  it('blocks non-admin from admin route', async () => {
    vi.spyOn(tokenStorage, 'getToken').mockReturnValue('token');
    vi.spyOn(api, 'getCurrentUser').mockResolvedValue({
      id: 1,
      username: 'user',
      email: 'user@test.com',
      role: 'user',
    });

    renderApp('/admin');

    expect(await screen.findByText(/home page/i)).toBeInTheDocument();
  });

  it('allows admin to open admin route', async () => {
    vi.spyOn(tokenStorage, 'getToken').mockReturnValue('token');
    vi.spyOn(api, 'getCurrentUser').mockResolvedValue({
      id: 1,
      username: 'admin',
      email: 'admin@test.com',
      role: 'admin',
    });

    renderApp('/admin');

    expect(await screen.findByText(/admin page/i)).toBeInTheDocument();
  });

  it('force logout handler redirects to auth', async () => {
    vi.spyOn(tokenStorage, 'getToken').mockReturnValue('token');
    vi.spyOn(api, 'getCurrentUser').mockResolvedValue({
      id: 1,
      username: 'user',
      email: 'user@test.com',
      role: 'user',
    });

    renderApp('/dashboard');

    await screen.findByText(/dashboard page/i);

    await act(async () => {
      if (api.onForceLogout) {
        api.onForceLogout();
      }
    });

    await waitFor(() => {
      expect(screen.getByText(/auth page/i)).toBeInTheDocument();
    });
  });
});

function renderApp(route: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </HelmetProvider>
  );
}