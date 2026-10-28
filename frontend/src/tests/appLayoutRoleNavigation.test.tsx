import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '../layouts/AppLayout';

const authState = vi.hoisted(() => ({
  role: 'TRAINEE',
  permissions: [
    'knowledge.view_published',
    'assistant.use',
    'procedure.execute',
    'troubleshoot.use',
    'simulation.attempt',
    'audio.analyze',
  ] as string[],
  logout: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'role-user', name: 'Role User', email: 'role@example.test', role_id: authState.role },
    logout: authState.logout,
    hasPermission: (permission: string) => authState.permissions.includes(permission),
    hasRole: (role: string) => authState.role === role,
  }),
}));

const renderLayout = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<div>Dashboard content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('AppLayout role navigation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows trainee pages and hides authoring and reviewer actions', () => {
    authState.role = 'TRAINEE';
    authState.permissions = [
      'knowledge.view_published', 'assistant.use', 'procedure.execute',
      'troubleshoot.use', 'simulation.attempt', 'audio.analyze',
    ];
    renderLayout();

    expect(screen.getByRole('link', { name: 'My Knowledge' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Guided Workflows' })).toBeInTheDocument();
    expect(screen.queryByText(/PLANT FLOOR LINE/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open profile menu' }));
    const menu = screen.getByRole('menu', { name: 'Profile menu' });
    expect(within(menu).getByText('Role User')).toBeInTheDocument();
    expect(within(menu).getByText('role@example.test')).toBeInTheDocument();
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
    expect(within(menu).getByRole('menuitem', { name: 'Sign Out' })).toBeInTheDocument();
    expect(within(menu).queryByRole('link')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation menu' }));
    expect(screen.getByRole('link', { name: 'Troubleshooting (M05)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Learning Portal (M10)' })).toBeInTheDocument();
  });

  it('shows the expert authoring and review links only when the permissions are granted', () => {
    authState.role = 'EXPERT';
    authState.permissions = ['knowledge.create', 'knowledge.approve', 'assistant.use', 'procedure.execute'];
    renderLayout();

    expect(screen.getByRole('link', { name: 'Capture Knowledge' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open profile menu' }));
    const menu = screen.getByRole('menu', { name: 'Profile menu' });
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
    expect(within(menu).getByRole('menuitem', { name: 'Sign Out' })).toBeInTheDocument();
    expect(within(menu).queryByRole('link')).not.toBeInTheDocument();
    expect(within(menu).queryByText(/Review & Verify|Voice-to-Knowledge|Machine Assets/i)).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Sign Out' }));
    expect(authState.logout).toHaveBeenCalledTimes(1);
  });
});
