import React, { createContext, useContext, useState, useCallback } from 'react';
import { findEmployeeByPin } from '../db/repository';

type Employee = { id: string; name: string; role: string; store_id: string };

type AuthContextType = {
  employee: Employee | null;
  loginWithPin: (pin: string) => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(null);

  const loginWithPin = useCallback(async (pin: string) => {
    const emp = await findEmployeeByPin(pin);
    if (emp) {
      setEmployee({ id: emp.id, name: emp.name, role: emp.role, store_id: emp.store_id });
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => setEmployee(null), []);

  return (
    <AuthContext.Provider value={{ employee, loginWithPin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
