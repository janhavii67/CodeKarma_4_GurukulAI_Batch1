import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { ForbiddenPage } from '../features/errors/ForbiddenPage';
import { AuthProvider } from '../context/AuthContext';
import { describe, it, expect, vi } from 'vitest';

// Mock API calls
vi.mock('../lib/api/client', () => ({
  api: {
    get: vi.fn().mockRejectedValue(new Error('Unauthenticated')),
    post: vi.fn(),
  },
  ApiClientError: class extends Error {
    code = 'test_error';
    status = 400;
  },
}));

describe('Authentication & Security UI Tests', () => {
  it('renders login page with email, password, and demo credentials', () => {
    render(
      <AuthProvider>
        <BrowserRouter>
          <LoginPage />
        </BrowserRouter>
      </AuthProvider>
    );

    expect(screen.getByText(/Sign in to Gurukul AI/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByText(/Aarav Sharma/i)).toBeInTheDocument();
    expect(screen.getByText(/Bhavna Patel/i)).toBeInTheDocument();
    expect(screen.getByText(/Devendra Verma/i)).toBeInTheDocument();
  });

  it('renders register page with Trainee role disclaimer', () => {
    render(
      <AuthProvider>
        <BrowserRouter>
          <RegisterPage />
        </BrowserRouter>
      </AuthProvider>
    );

    expect(screen.getByText(/Create Trainee Account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    expect(screen.getByText(/Role Invariant:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/TRAINEE/i).length).toBeGreaterThan(0);
  });

  it('renders 403 Forbidden page correctly', () => {
    render(
      <BrowserRouter>
        <ForbiddenPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/Insufficient Permissions/i)).toBeInTheDocument();
    expect(screen.getByText(/HTTP 403 · Access Denied/i)).toBeInTheDocument();
    expect(screen.getByText(/Return to Dashboard/i)).toBeInTheDocument();
  });
});
