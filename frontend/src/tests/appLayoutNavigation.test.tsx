import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, Link, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppLayout } from '../layouts/AppLayout';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'expert-1',
      name: 'Test Expert',
      email: 'expert@example.test',
      role_id: 'EXPERT',
    },
    logout: vi.fn(),
    hasRole: (role: string) => role === 'EXPERT',
  }),
}));

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="current-location">{`${location.pathname}${location.search}`}</output>;
};

const renderAppLayout = () =>
  render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<AppLayout />}>
          <Route
            index
            element={<Link to="/app/knowledge-assets?kind=notes">Home Capture Knowledge</Link>}
          />
          <Route path="knowledge-assets" element={<div>Audio/video capture workflow</div>} />
          <Route path="knowledge/new" element={<div>Old procedure details page</div>} />
        </Route>
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );

describe('Capture Knowledge navigation', () => {
  it('opens the audio/video capture workflow from the desktop Navbar, matching Home', () => {
    renderAppLayout();

    expect(screen.getByRole('link', { name: 'Home Capture Knowledge' })).toHaveAttribute(
      'href',
      '/app/knowledge-assets?kind=notes'
    );

    fireEvent.click(screen.getByRole('link', { name: 'Capture Knowledge' }));

    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/app/knowledge-assets?kind=notes'
    );
    expect(screen.getByText('Audio/video capture workflow')).toBeInTheDocument();
    expect(screen.queryByText('Old procedure details page')).not.toBeInTheDocument();
  });

  it('opens the same workflow from the mobile Navbar', () => {
    renderAppLayout();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation menu' }));
    const captureLinks = screen.getAllByRole('link', { name: 'Capture Knowledge' });
    fireEvent.click(captureLinks[captureLinks.length - 1]);

    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/app/knowledge-assets?kind=notes'
    );
    expect(screen.getByText('Audio/video capture workflow')).toBeInTheDocument();
  });
});
