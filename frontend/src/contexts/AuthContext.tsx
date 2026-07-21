// src/contexts/AuthContext.tsx

import React, { createContext, useContext, ReactNode, useState, useMemo } from "react";

/**
 * User definition with permission based model.
 */
export interface User {
  id: string;
  name: string;
  role: "Dean" | "Faculty" | "Secretary" | "Admin";
  assignedSubjects?: string[];
  assignedSections?: string[];
  permissions: string[]; // e.g. "grades.create", "attendance.correct"
}

interface AuthContextValue {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  const login = (newUser: User) => setUser(newUser);
  const logout = () => setUser(null);

  const hasPermission = (perm: string) => {
    if (!user) return false;
    return user.permissions.includes(perm);
  };

  const value = useMemo(
    () => ({ user, login, logout, hasPermission }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/** Hook to consume auth context */
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
};
