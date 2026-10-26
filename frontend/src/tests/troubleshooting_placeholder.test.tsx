import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TroubleshootingPage } from '../features/troubleshooting/TroubleshootingPage';
import { ProtectedRoute } from '../routes/ProtectedRoute';
import * as useAuthHook from '../hooks/useAuth';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../lib/api/client';

// Mock API client to verify no calls are made
vi.mock('../lib/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  ApiClientError: class extends Error {
    code = 'test_error';
    status = 400;
  },
}));

describe('Module 05: Troubleshooting Placeholder Tests (Task A1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders read-only placeholder view for TRAINEE role', () => {
    vi.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_trainee_1',
        email: 'trainee@demo.local',
        name: 'Trainee Operator',
        role_id: 'TRAINEE',
        is_active: true,
        created_at: new Date().toISOString(),
      },
      permissions: ['knowledge.view_published', 'assistant.use'],
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasPermission: vi.fn((perm: string) =>
        ['knowledge.view_published', 'assistant.use'].includes(perm)
      ),
      hasRole: vi.fn((role: string) => role === 'TRAINEE'),
    });

    render(
      <MemoryRouter initialEntries={['/app/troubleshooting']}>
        <TroubleshootingPage />
      </MemoryRouter>
    );

    // 1. Mandatory banner verification
    expect(
      screen.getByText(/Planned feature\. No approved troubleshooting guides exist yet\./i)
    ).toBeInTheDocument();

    // 2. Headings and placeholder tags
    expect(
      screen.getByRole('heading', { name: /Troubleshooting & Decision Trees/i })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/PLACEHOLDER/i).length).toBeGreaterThan(0);

    // 3. Disabled selector and empty states
    expect(screen.getByLabelText(/Target Machine/i)).toBeDisabled();
    expect(screen.getByLabelText(/Observed Symptom/i)).toBeDisabled();
    expect(
      screen.getByText(/No Active Troubleshooting Session/i)
    ).toBeInTheDocument();

    // 4. Disabled Request expert help button
    const requestHelpBtn = screen.getByRole('button', {
      name: /Request Expert Help/i,
    });
    expect(requestHelpBtn).toBeDisabled();

    // 5. Trainee must NOT see the "Create Guide" button
    expect(
      screen.queryByRole('button', { name: /Create Guide/i })
    ).not.toBeInTheDocument();

    // 6. Non-negotiable safety invariant statement
    expect(
      screen.getByText(/No LLM chooses branches or modifies machine states\./i)
    ).toBeInTheDocument();

    // 7. Verify NO network calls were initiated
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('renders placeholder view for EXPERT role with disabled Create Guide button', () => {
    vi.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_expert_1',
        email: 'expert.a@demo.local',
        name: 'Expert Author',
        role_id: 'EXPERT',
        is_active: true,
        created_at: new Date().toISOString(),
      },
      permissions: [
        'knowledge.create',
        'knowledge.edit_own_draft',
        'knowledge.submit_review',
        'knowledge.view_published',
      ],
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasPermission: vi.fn(() => true),
      hasRole: vi.fn((role: string) => role === 'EXPERT'),
    });

    render(
      <MemoryRouter initialEntries={['/app/troubleshooting']}>
        <TroubleshootingPage />
      </MemoryRouter>
    );

    // Expert sees disabled Create Guide button
    const createBtn = screen.getByRole('button', { name: /Create Guide/i });
    expect(createBtn).toBeInTheDocument();
    expect(createBtn).toBeDisabled();

    // Banner and safety rules remain intact
    expect(
      screen.getByText(/Planned feature\. No approved troubleshooting guides exist yet\./i)
    ).toBeInTheDocument();

    // Verify NO network calls
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('demonstrates loading and error states without making network calls', () => {
    vi.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: {
        id: 'usr_trainee_1',
        email: 'trainee@demo.local',
        name: 'Trainee Operator',
        role_id: 'TRAINEE',
        is_active: true,
        created_at: new Date().toISOString(),
      },
      permissions: [],
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasPermission: vi.fn(() => false),
      hasRole: vi.fn(() => false),
    });

    render(
      <MemoryRouter initialEntries={['/app/troubleshooting']}>
        <TroubleshootingPage />
      </MemoryRouter>
    );

    // Switch to Loading State
    const loadingTab = screen.getByRole('button', { name: /Loading State/i });
    fireEvent.click(loadingTab);
    expect(
      screen.getByText(/Loading approved troubleshooting guide version\.\.\./i)
    ).toBeInTheDocument();

    // Switch to Error State
    const errorTab = screen.getByRole('button', { name: /Error State/i });
    fireEvent.click(errorTab);
    expect(screen.getByText(/Guide Retrieval Failed/i)).toBeInTheDocument();

    // Reset back to Empty State
    const resetBtn = screen.getByRole('button', { name: /Reset State/i });
    fireEvent.click(resetBtn);
    expect(
      screen.getByText(/No Active Troubleshooting Session/i)
    ).toBeInTheDocument();

    // Still no network calls
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('redirects unauthenticated user away from protected troubleshooting route', () => {
    vi.spyOn(useAuthHook, 'useAuth').mockReturnValue({
      user: null,
      permissions: [],
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasPermission: vi.fn(() => false),
      hasRole: vi.fn(() => false),
    });

    render(
      <MemoryRouter initialEntries={['/app/troubleshooting']}>
        <Routes>
          <Route path="/login" element={<div>Login Page Redirect Target</div>} />
          <Route
            path="/app/troubleshooting"
            element={
              <ProtectedRoute>
                <TroubleshootingPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/Login Page Redirect Target/i)).toBeInTheDocument();
    expect(screen.queryByText(/Troubleshooting & Decision Trees/i)).not.toBeInTheDocument();
  });
});
