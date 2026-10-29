import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AuthResponse, User, UserRole } from '../types/auth';
import { api, ApiClientError } from '../lib/api/client';

interface AuthContextType {
  user: User | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: UserRole) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userRef = React.useRef<User | null>(null);
  userRef.current = user;

  const refreshUser = useCallback(async () => {
    try {
      // Only set isLoading to true on the initial session check when user is not yet known.
      // Background revalidations (window focus / visibility change) should not set isLoading to true,
      // preventing protected components from unmounting and losing unsaved input.
      if (!userRef.current) {
        setIsLoading(true);
      }
      setError(null);
      const res = await api.get<AuthResponse>('/auth/me');
      setUser(res.user);
      setPermissions(res.permissions);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        // Only clear the session on genuine 401 Unauthorized
        setUser(null);
        setPermissions([]);
      } else if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();

    // Revalidate the server session whenever the app becomes active again so
    // revoked sessions or changed roles cannot keep using stale client state.
    const revalidateSession = () => {
      if (document.visibilityState === 'visible') {
        void refreshUser();
      }
    };
    window.addEventListener('focus', revalidateSession);
    document.addEventListener('visibilitychange', revalidateSession);
    return () => {
      window.removeEventListener('focus', revalidateSession);
      document.removeEventListener('visibilitychange', revalidateSession);
    };
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<AuthResponse>('/auth/login', { email, password });
      setUser(res.user);
      setPermissions(res.permissions);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Login failed. Please check your credentials.');
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, name: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<AuthResponse>('/auth/register', { email, name, password });
      setUser(res.user);
      setPermissions(res.permissions);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Registration failed.');
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await api.post('/auth/logout');
    } catch {
      // Even if network fails, clear local state
    } finally {
      setUser(null);
      setPermissions([]);
      setIsLoading(false);
    }
  };

  const hasPermission = useCallback(
    (perm: string) => {
      return permissions.includes(perm);
    },
    [permissions]
  );

  const hasRole = useCallback(
    (role: UserRole) => {
      return user?.role_id === role;
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        permissions,
        isAuthenticated: !!user,
        isLoading,
        error,
        login,
        register,
        logout,
        refreshUser,
        hasPermission,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
