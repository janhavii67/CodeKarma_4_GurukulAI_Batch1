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

  const refreshUser = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.get<AuthResponse>('/auth/me');
      setUser(res.user);
      setPermissions(res.permissions);
    } catch (err) {
      setUser(null);
      setPermissions([]);
      if (err instanceof ApiClientError && err.status === 401) {
        // Normal unauthenticated state on first load
      } else if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
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
