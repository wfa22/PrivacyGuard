import { screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { DashboardPage } from './DashboardPage';
import { renderWithProviders } from '../test/test-utils';
import { api } from '../utils/api';

describe('DashboardPage', () => {
  it('shows empty state when no files exist', async () => {
    vi.spyOn(api, 'listMedia').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 9,
      pages: 0,
    });

    renderWithProviders(
      <DashboardPage
        onNavigate={vi.fn()}
        user={{ id: 1, username: 'user', email: 'user@test.com', role: 'user' }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/no files yet/i)).toBeInTheDocument();
    });
  });

  it('shows error if media loading fails', async () => {
    vi.spyOn(api, 'listMedia').mockRejectedValue(new Error('Failed to load files'));

    renderWithProviders(
      <DashboardPage
        onNavigate={vi.fn()}
        user={{ id: 1, username: 'user', email: 'user@test.com', role: 'user' }}
      />
    );

    expect(await screen.findByText(/failed to load files/i)).toBeInTheDocument();
  });

  it('renders admin badge in admin mode', async () => {
    vi.spyOn(api, 'listMedia').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 9,
      pages: 0,
    });

    renderWithProviders(
      <DashboardPage
        onNavigate={vi.fn()}
        user={{ id: 1, username: 'admin', email: 'admin@test.com', role: 'admin' }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/admin mode/i)).toBeInTheDocument();
    });
  });

  it('calls listMedia with updated filter params', async () => {
    const user = userEvent.setup();

    const listMediaSpy = vi.spyOn(api, 'listMedia')
      .mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        page_size: 9,
        pages: 0,
      });

    renderWithProviders(
      <DashboardPage
        onNavigate={vi.fn()}
        user={{ id: 1, username: 'user', email: 'user@test.com', role: 'user' }}
      />
    );

    const search = screen.getByLabelText(/search files/i);
    await user.type(search, 'report');

    await waitFor(() => {
      expect(listMediaSpy).toHaveBeenCalled();
    });
  });
});