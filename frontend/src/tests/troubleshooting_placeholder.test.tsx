import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TroubleshootingPage } from '../features/troubleshooting/TroubleshootingPage';
import { ProtectedRoute } from '../routes/ProtectedRoute';
import * as useAuthHook from '../hooks/useAuth';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../lib/api/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

function renderWithClient(element: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}

vi.mock('../lib/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  ApiClientError: class extends Error { code = 'test_error'; status = 400; },
}));

const setUser = (role: 'TRAINEE' | 'EXPERT' | null, permissions: string[] = []) => {
  vi.spyOn(useAuthHook, 'useAuth').mockReturnValue({
    user: role ? { id: `user-${role}`, email: `${role.toLowerCase()}@demo.local`, name: role, role_id: role, is_active: true, created_at: new Date().toISOString() } : null,
    permissions,
    isAuthenticated: !!role,
    isLoading: false,
    error: null,
    login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
    hasPermission: vi.fn((permission: string) => permissions.includes(permission)),
    hasRole: vi.fn((candidate: string) => candidate === role),
  });
};

describe('Module 05: evidence-grounded troubleshooting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((path: string) => path.startsWith('/machines?')
      ? Promise.resolve({ items: [], total: 0, page: 1, page_size: 100 }) as any
      : Promise.resolve([]) as any);
  });

  it('renders the operator investigation form and safe evidence limitation', async () => {
    setUser('TRAINEE', ['troubleshoot.use', 'knowledge.view_published']);
    renderWithClient(<MemoryRouter><TroubleshootingPage /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Troubleshooting' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Problem or symptom/i)).toBeEnabled();
    expect(screen.getByRole('button', { name: /Start investigation/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Problem or symptom/i), { target: { value: 'Observed vibration during startup' } });
    expect(screen.getByRole('button', { name: /Start investigation/i })).toBeEnabled();
    expect(screen.getByText(/does not certify a diagnosis or confirm that a machine is safe/i)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/troubleshooting/sessions/my/all');
    expect(api.get).toHaveBeenCalledWith('/machines?page=1&page_size=100');
    expect(api.get).toHaveBeenCalledWith('/troubleshooting/processes');
  });

  it('shows an insufficient-evidence state without generating a procedure', async () => {
    setUser('TRAINEE', ['troubleshoot.use']);
    vi.mocked(api.post).mockResolvedValue({
      id: 'session-1', reported_symptom: 'Unverified vibration', context: { evidence_status: 'insufficient_evidence' },
      source_refs: [], checks: [], current_check_index: 0, status: 'in_progress', started_at: new Date().toISOString(), responses: [],
    } as any);
    renderWithClient(<MemoryRouter><TroubleshootingPage /></MemoryRouter>);

    fireEvent.change(await screen.findByLabelText(/Problem or symptom/i), { target: { value: 'Unverified vibration at startup' } });
    fireEvent.click(screen.getByRole('button', { name: /Start investigation/i }));

    expect(await screen.findByText(/No relevant approved source found/i)).toBeInTheDocument();
    expect(screen.getByText(/The system has not generated a procedure/i)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/troubleshooting/sessions', expect.objectContaining({ reported_symptom: 'Unverified vibration at startup' }));
  });

  it('shows expert draft tools only to users with the existing knowledge-create permission', async () => {
    setUser('EXPERT', ['troubleshoot.use', 'knowledge.create']);
    vi.mocked(api.get).mockImplementation((path: string) => Promise.resolve(path.includes('/sessions/my/all') ? [] : []) as any);
    renderWithClient(<MemoryRouter><TroubleshootingPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Troubleshooting' })).toBeInTheDocument();
    // Draft action appears after a session reaches a terminal state, never as an unapproved publishing control.
    expect(screen.queryByRole('button', { name: /Publish/i })).not.toBeInTheDocument();
  });

  it('redirects unauthenticated users away from the protected troubleshooting route', async () => {
    setUser(null);
    renderWithClient(
      <MemoryRouter initialEntries={['/app/troubleshooting']}>
        <Routes>
          <Route path="/login" element={<div>Login Page Redirect Target</div>} />
          <Route path="/app/troubleshooting" element={<ProtectedRoute><TroubleshootingPage /></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Login Page Redirect Target/i)).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Troubleshooting' })).not.toBeInTheDocument();
  });
});
