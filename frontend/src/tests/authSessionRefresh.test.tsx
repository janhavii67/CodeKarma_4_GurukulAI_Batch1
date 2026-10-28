import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api/client';
import type { AuthResponse } from '../types/auth';

vi.mock('../lib/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  ApiClientError: class extends Error {
    status = 401;
  },
}));

const expertSession: AuthResponse = {
  user: {
    id: 'user-1',
    email: 'expert@example.test',
    name: 'Expert User',
    role_id: 'EXPERT',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  permissions: ['knowledge.create', 'knowledge.approve'],
};

const traineeSession: AuthResponse = {
  user: { ...expertSession.user, role_id: 'TRAINEE' },
  permissions: ['knowledge.view_published'],
};

const SessionView = () => {
  const { user, permissions } = useAuth();
  return (
    <div>
      <span>{user?.role_id ?? 'SIGNED OUT'}</span>
      <span>{permissions.join(',')}</span>
    </div>
  );
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('authentication session refresh', () => {
  it('replaces stale role permissions with the authenticated profile on window focus', async () => {
    const getProfile = vi.mocked(api.get);
    getProfile.mockResolvedValueOnce(expertSession).mockResolvedValueOnce(traineeSession);

    render(
      <AuthProvider>
        <SessionView />
      </AuthProvider>
    );

    expect(await screen.findByText('EXPERT')).toBeInTheDocument();
    expect(screen.getByText('knowledge.create,knowledge.approve')).toBeInTheDocument();

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => {
      expect(screen.getByText('TRAINEE')).toBeInTheDocument();
      expect(screen.getByText('knowledge.view_published')).toBeInTheDocument();
    });
    expect(getProfile).toHaveBeenCalledTimes(2);
  });
});
