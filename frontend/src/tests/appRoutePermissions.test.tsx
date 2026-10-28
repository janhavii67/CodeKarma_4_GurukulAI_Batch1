import { cleanup, render, screen } from '@testing-library/react';
import { Outlet } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';

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

vi.mock('../context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../layouts/AppLayout', () => ({ AppLayout: () => <Outlet /> }));
vi.mock('../features/auth/LoginPage', () => ({ LoginPage: () => <div>Login page</div> }));
vi.mock('../features/errors/ForbiddenPage', () => ({ ForbiddenPage: () => <div>Forbidden page</div> }));
vi.mock('../features/reviews/ReviewsPage', () => ({ ReviewsPage: () => <div>Review queue</div> }));
vi.mock('../features/knowledge/ProcedureCreatePage', () => ({ ProcedureCreatePage: () => <div>Procedure authoring</div> }));
vi.mock('../features/simulations/FailureSimulatorPage', () => ({ FailureSimulatorPage: () => <div>Failure simulator</div> }));
vi.mock('../features/assistant/AssistantPage', () => ({ AssistantPage: () => <div>Assistant page</div> }));
vi.mock('../features/workflows/GuidedWorkflowsPage', () => ({ GuidedWorkflowsPage: () => <div>Workflow page</div> }));

afterEach(() => {
  cleanup();
});

const directOpen = (role: string, permissions: string[], path: string) => {
  authState.user = { role_id: role };
  authState.permissions = permissions;
  authState.isAuthenticated = true;
  authState.isLoading = false;
  window.history.replaceState({}, '', path);
  return render(<App />);
};

describe('actual application route permission matrix', () => {
  it.each([
    ['ADMIN', ['knowledge.approve'], '/app/reviews', 'Review queue'],
    ['EXPERT', ['knowledge.approve'], '/app/reviews', 'Review queue'],
    ['OPERATOR', ['procedure.execute'], '/app/guided-workflows', 'Workflow page'],
    ['TRAINEE', ['assistant.use'], '/app/assistant', 'Assistant page'],
    ['TRAINEE', ['simulation.attempt'], '/app/failure-simulator', 'Failure simulator'],
    ['ADMIN', ['procedure.create'], '/app/procedures/new', 'Procedure authoring'],
  ])('%s can directly open %s when its permission is present', (role, permissions, path, page) => {
    directOpen(role, permissions, path);
    expect(screen.getByText(page)).toBeInTheDocument();
  });

  it.each([
    ['TRAINEE', ['knowledge.view_published'], '/app/reviews'],
    ['OPERATOR', ['assistant.use', 'procedure.execute'], '/app/reviews'],
    ['TRAINEE', ['knowledge.view_published'], '/app/procedures/new'],
    ['OPERATOR', ['procedure.execute'], '/app/failure-simulator'],
  ])('%s is denied direct access to %s without its required permission', (role, permissions, path) => {
    directOpen(role, permissions, path);
    expect(screen.getByText('Forbidden page')).toBeInTheDocument();
  });

  it('redirects direct page loads to login before rendering protected pages', () => {
    authState.user = null;
    authState.permissions = [];
    authState.isAuthenticated = false;
    authState.isLoading = false;
    window.history.replaceState({}, '', '/app/reviews');
    render(<App />);
    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Review queue')).not.toBeInTheDocument();
  });
});
