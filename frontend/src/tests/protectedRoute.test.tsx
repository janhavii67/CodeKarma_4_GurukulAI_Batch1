import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from '../routes/ProtectedRoute';
import { ForbiddenPage } from '../features/errors/ForbiddenPage';

const authState = vi.hoisted(() => ({
  user: null as null | { role_id: string },
  permissions: [] as string[],
  isAuthenticated: false,
  isLoading: false,
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    ...authState,
    hasRole: (role: string) => authState.user?.role_id === role,
    hasPermission: (permission: string) => authState.permissions.includes(permission),
  }),
}));

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
};

const renderDirectUrl = (permission = 'assistant.use') =>
  render(
    <MemoryRouter initialEntries={['/app/assistant']}>
      <Routes>
        <Route
          path="/app/assistant"
          element={
            <ProtectedRoute requiredPermission={permission}>
              <div>Protected assistant page</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/403" element={<ForbiddenPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );

describe('ProtectedRoute direct URL handling', () => {
  beforeEach(() => {
    authState.user = null;
    authState.permissions = [];
    authState.isAuthenticated = false;
    authState.isLoading = false;
  });

  it('redirects an unauthenticated direct URL to login', () => {
    renderDirectUrl();
    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });

  it('renders no protected content during session and role loading', () => {
    authState.isLoading = true;
    renderDirectUrl();
    expect(screen.queryByText('Protected assistant page')).not.toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
    expect(screen.getByText('Authenticating session...')).toBeInTheDocument();
  });

  it('redirects authenticated users without the required permission to 403', () => {
    authState.user = { role_id: 'TRAINEE' };
    authState.isAuthenticated = true;
    authState.permissions = ['knowledge.view_published', 'procedure.execute'];
    renderDirectUrl();
    expect(screen.getByRole('heading', { name: 'Insufficient Permissions' })).toBeInTheDocument();
    expect(screen.getByText('/app/assistant')).toBeInTheDocument();
    expect(screen.getByText('assistant.use')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/403');
  });

  it.each([
    ['ADMIN', ['assistant.use']],
    ['EXPERT', ['assistant.use']],
    ['OPERATOR', ['assistant.use']],
    ['TRAINEE', ['assistant.use']],
  ])('%s can open a direct URL for a granted permission', (_role, permissions) => {
    authState.user = { role_id: _role };
    authState.isAuthenticated = true;
    authState.permissions = permissions;
    renderDirectUrl();
    expect(screen.getByText('Protected assistant page')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/app/assistant');
  });

  it('allows a route protected by any one of its declared permissions', () => {
    authState.user = { role_id: 'TRAINEE' };
    authState.isAuthenticated = true;
    authState.permissions = ['knowledge.view_published'];
    render(
      <MemoryRouter initialEntries={['/app/assistant']}>
        <Routes>
          <Route
            path="/app/assistant"
            element={
              <ProtectedRoute requiredAnyPermission={['knowledge.create', 'knowledge.view_published']}>
                <div>Published knowledge page</div>
              </ProtectedRoute>
            }
          />
          <Route path="/403" element={<div>Forbidden page</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Published knowledge page')).toBeInTheDocument();
  });
});
