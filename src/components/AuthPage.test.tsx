import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { AuthPage } from './AuthPage';
import { renderWithProviders } from '../test/test-utils';
import { api } from '../utils/api';

describe('AuthPage', () => {
  it('logs in user via form', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    const onNavigate = vi.fn();

    vi.spyOn(api, 'login').mockResolvedValue({
      access_token: 'a',
      refresh_token: 'r',
      token_type: 'Bearer',
    });

    renderWithProviders(
      <AuthPage onNavigate={onNavigate} onLogin={onLogin} />
    );

    await user.type(screen.getByLabelText(/email/i), 'user@test.com');
    await user.type(screen.getByLabelText(/^password$/i), 'secret');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith({
        email: 'user@test.com',
        password: 'secret',
      });
      expect(onLogin).toHaveBeenCalledWith(true);
    });
  });

  it('shows error when login fails', async () => {
    const user = userEvent.setup();

    vi.spyOn(api, 'login').mockRejectedValue(new Error('Invalid credentials'));

    renderWithProviders(
      <AuthPage onNavigate={vi.fn()} onLogin={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/email/i), 'user@test.com');
    await user.type(screen.getByLabelText(/^password$/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
  });

  it('shows validation error if signup passwords do not match', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <AuthPage onNavigate={vi.fn()} onLogin={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /sign up/i }));
    await user.type(screen.getByLabelText(/username/i), 'alice');
    await user.type(screen.getByLabelText(/email/i), 'alice@test.com');
    await user.type(screen.getByLabelText(/^password$/i), 'secret123');
    await user.type(screen.getByLabelText(/confirm password/i), 'different');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
  });
});