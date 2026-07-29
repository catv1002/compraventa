import { createContext, useContext, useState, ReactNode } from 'react';
import { api } from './api-client';

interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  homeBranchId: string;
  mfaEnabled: boolean;
}

interface LoginResult {
  mfaSetupRequired: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string, mfaCode?: string) => Promise<LoginResult>;
  logout: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  async function login(email: string, password: string, mfaCode?: string) {
    const response = await api.post<{ accessToken: string; user: AuthUser; mfaSetupRequired: boolean }>(
      '/auth/login',
      { email, password, mfaCode },
    );
    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('user', JSON.stringify(response.user));
    setUser(response.user);
    return { mfaSetupRequired: response.mfaSetupRequired };
  }

  function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    setUser(null);
  }

  function refreshUser() {
    const stored = localStorage.getItem('user');
    setUser(stored ? JSON.parse(stored) : null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return ctx;
}
