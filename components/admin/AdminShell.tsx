"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import AdminNav from "./AdminNav";

interface AdminContextType {
  password: string;
  logout: () => void;
}

const AdminContext = createContext<AdminContextType>({
  password: "",
  logout: () => {},
});

export function useAdmin() {
  return useContext(AdminContext);
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const [password, setPassword] = useState("");
  const [inputPw, setInputPw] = useState("");
  const [pwError, setPwError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("admin_pw");
    if (saved) {
      setPassword(saved);
      setReady(true);
    } else {
      setReady(true);
    }
  }, []);

  const handleLogin = async () => {
    setPwError(false);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { "x-admin-password": inputPw },
      });
      if (res.status === 401) {
        setPwError(true);
        setLoading(false);
        return;
      }
      setPassword(inputPw);
      localStorage.setItem("admin_pw", inputPw);
    } catch {
      setPwError(true);
    }
    setLoading(false);
  };

  const logout = () => {
    localStorage.removeItem("admin_pw");
    setPassword("");
    setInputPw("");
  };

  if (!ready) return null;

  // Login screen
  if (!password) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🐯</div>
            <h1 className="text-2xl font-bold text-[#1D1D1F]">TigrãoImports</h1>
            <p className="text-[#86868B] text-sm mt-1">Painel Administrativo</p>
          </div>
          <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 space-y-4 shadow-sm">
            <input
              type="password"
              placeholder="Senha de acesso"
              value={inputPw}
              onChange={(e) => setInputPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="w-full px-4 py-3 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#E8740E] transition-colors"
            />
            {pwError && (
              <p className="text-[#E74C3C] text-sm text-center">Senha incorreta</p>
            )}
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminContext.Provider value={{ password, logout }}>
      <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F]">
        {/* Header */}
        <div className="bg-white border-b border-[#D2D2D7] px-6 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🐯</span>
            <div>
              <h1 className="text-lg font-bold text-[#1D1D1F]">TigrãoImports</h1>
              <p className="text-[#86868B] text-xs">Painel Administrativo</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="px-4 py-2 rounded-xl bg-white border border-[#D2D2D7] text-[#86868B] text-sm hover:border-[#E74C3C] hover:text-[#E74C3C] transition-colors"
          >
            Sair
          </button>
        </div>

        {/* Navigation */}
        <AdminNav />

        {/* Content */}
        <div className="p-6 max-w-[1400px] mx-auto">
          {children}
        </div>
      </div>
    </AdminContext.Provider>
  );
}
