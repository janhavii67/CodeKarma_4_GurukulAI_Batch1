import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
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
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'role-user', name: 'Role User', email: 'role@example.test', role_id: authState.role },
    logout: vi.fn(),
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
  it('shows trainee pages and hides authoring and reviewer actions', () => {
    authState.role = 'TRAINEE';
    authState.permissions = [
      'knowledge.view_published', 'assistant.use', 'procedure.execute',
      'troubleshoot.use', 'simulation.attempt', 'audio.analyze',
    ];
    renderLayout();

    expect(screen.getByRole('link', { name: 'My Knowledge' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Knowledge Assistant' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Guided Workflows' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open profile menu' }));
    expect(screen.getAllByRole('link', { name: 'Troubleshooting (M05)' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Capture Knowledge' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Review & Verify' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Voice-to-Knowledge (M04)' })).not.toBeInTheDocument();
  });

  it('shows the expert authoring and review links only when the permissions are granted', () => {
    authState.role = 'EXPERT';
    authState.permissions = ['knowledge.create', 'knowledge.approve', 'assistant.use', 'procedure.execute'];
    renderLayout();

    expect(screen.getByRole('link', { name: 'Capture Knowledge' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review & Verify' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open profile menu' }));
    expect(screen.getByRole('link', { name: 'Voice-to-Knowledge (M04)' })).toBeInTheDocument();
  });
});
