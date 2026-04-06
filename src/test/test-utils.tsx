import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

export function renderWithProviders(
  ui: React.ReactElement,
  { route = '/' }: { route?: string } = {},
) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[route]}>
        {ui}
      </MemoryRouter>
    </HelmetProvider>,
  );
}