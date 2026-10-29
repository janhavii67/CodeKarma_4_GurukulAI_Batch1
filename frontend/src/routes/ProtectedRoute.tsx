import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { UserRole } from '../types/auth';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

export interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  requiredPermission?: string;
  requiredAnyPermission?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
  requiredPermission,
  requiredAnyPermission,
}) => {
  const { user, isAuthenticated, isLoading, hasRole, hasPermission } = useAuth();
  const location = useLocation();

  // Only block with the full-screen spinner on the very first auth check, i.e.
  // when no user is yet known. Background revalidations (triggered by window
  // focus, native file-picker closing, visibility change) also flip isLoading to
  // true while the session is re-checked, but the user is already authenticated.
  // Rendering <LoadingSpinner> during those background checks unmounts the entire
  // child page tree and destroys all unsaved draft state.
  if (isLoading && !user) {
    return (
      <div className="min-h-screen bg-[#F5F8FC] flex items-center justify-center">
        <LoadingSpinner size="lg" message="Authenticating session..." />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return <Navigate to="/403" replace />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/403" replace />;
  }

  if (
    requiredAnyPermission &&
    !requiredAnyPermission.some((permission) => hasPermission(permission))
  ) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
};
