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
  it('shows all six authorized trainee destinations in desktop and mobile navigation', () => {
    authState.role = 'TRAINEE';
    authState.permissions = [
      'knowledge.view_published', 'assistant.use', 'procedure.execute',
      'troubleshoot.use', 'simulation.attempt', 'audio.analyze',
    ];
    renderLayout();

    const traineeLinks = [
      ['Dashboard', '/app'],
      ['Knowledge Library', '/app/knowledge'],
      ['AI Tutor', '/app/assistant'],
      ['Troubleshooting', '/app/troubleshooting'],
      ['Guided Workflow', '/app/guided-workflows'],
      ['Audio Matching', '/app/sound-analysis'],
    ] as const;
    for (const [name, href] of traineeLinks) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Open profile menu' }));
    expect(screen.getByRole('link', { name: /Knowledge Assistant/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Troubleshooting (M05)' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Capture Knowledge' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Review & Verify/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Voice-to-Knowledge (M04)' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation menu' }));
    for (const [name, href] of traineeLinks) {
      expect(screen.getAllByRole('link', { name }).some((link) => link.getAttribute('href') === href)).toBe(true);
    }
  });

  it('hides trainee destinations when the matching route permission is absent', () => {
    authState.role = 'TRAINEE';
    authState.permissions = ['procedure.execute'];
    renderLayout();

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/app');
    expect(screen.getByRole('link', { name: 'Guided Workflow' })).toHaveAttribute('href', '/app/guided-workflows');
    expect(screen.queryByRole('link', { name: 'Knowledge Library' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'AI Tutor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Troubleshooting' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Audio Matching' })).not.toBeInTheDocument();
  });

  it('shows the expert authoring and review links only when the permissions are granted', () => {
    authState.role = 'EXPERT';
    authState.permissions = ['knowledge.create', 'knowledge.approve', 'assistant.use', 'procedure.execute'];
    renderLayout();

    expect(screen.getByRole('link', { name: 'Capture Knowledge' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open profile menu' }));
    expect(screen.getByRole('link', { name: /Review & Verify/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voice-to-Knowledge (M04)' })).toBeInTheDocument();
  });
});
