import { screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { AdminPage } from './AdminPage';
import { renderWithProviders } from '../test/test-utils';
import { api } from '../utils/api';

describe('AdminPage', () => {
  it('loads and displays users', async () => {
    vi.spyOn(api, 'listUsers').mockResolvedValue([
      { id: 1, username: 'admin', email: 'admin@test.com', role: 'admin' },
      { id: 2, username: 'user', email: 'user@test.com', role: 'user' },
    ]);

    renderWithProviders(
      <AdminPage
        onNavigate={vi.fn()}
        currentUser={{ id: 1, username: 'admin', email: 'admin@test.com', role: 'admin' }}
      />
    );

    expect(screen.getByText(/loading users/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('admin@test.com')).toBeInTheDocument();
      expect(screen.getByText('user@test.com')).toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByText(/total users/i)).toBeInTheDocument();
    });
  });

  it('shows error if user loading fails', async () => {
    vi.spyOn(api, 'listUsers').mockRejectedValue(new Error('Failed to load users'));

    renderWithProviders(
      <AdminPage
        onNavigate={vi.fn()}
        currentUser={{ id: 1, username: 'admin', email: 'admin@test.com', role: 'admin' }}
      />
    );

    expect(await screen.findByText(/failed to load users/i)).toBeInTheDocument();
  });

  it('disables self-demote and self-delete buttons', async () => {
    vi.spyOn(api, 'listUsers').mockResolvedValue([
      { id: 1, username: 'admin', email: 'admin@test.com', role: 'admin' },
    ]);

    renderWithProviders(
      <AdminPage
        onNavigate={vi.fn()}
        currentUser={{ id: 1, username: 'admin', email: 'admin@test.com', role: 'admin' }}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/cannot demote yourself/i)).toBeDisabled();
      expect(screen.getByLabelText(/cannot delete yourself/i)).toBeDisabled();
    });
  });
});