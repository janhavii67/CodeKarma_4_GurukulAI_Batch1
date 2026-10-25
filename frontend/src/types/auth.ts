export type UserRole = 'ADMIN' | 'EXPERT' | 'OPERATOR' | 'TRAINEE';


export interface User {
  id: string;
  email: string;
  name: string;
  role_id: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface AuthResponse {
  user: User;
  permissions: string[];
}

export interface AuthState {
  user: User | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}
