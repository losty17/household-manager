import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { authApi } from "@/lib/api";

interface AuthContextValue {
  isAuthenticated: boolean;
  loading: boolean;
  login: (password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .verify()
      .then(() => setIsAuthenticated(true))
      .catch((err) => {
        console.error("Failed to restore session:", err);
        localStorage.removeItem("access_token");
        setIsAuthenticated(false);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (password: string) => {
    const { access_token } = await authApi.login(password);
    localStorage.setItem("access_token", access_token);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
