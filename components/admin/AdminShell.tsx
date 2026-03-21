"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import AdminNav from "./AdminNav";

export interface UserInfo {
  id: string;
  nome: string;
  login: string;
  role: "admin" | "estoque";
}

interface AdminContextType {
  password: string;
  user: UserInfo | null;
  logout: () => void;
}

const AdminContext = createContext<AdminContextType>({
  password: "",
  user: null,
  logout: () => {},
});

export function useAdmin() {
  return useContext(AdminContext);
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<UserInfo | null>(null);
  const [inputLogin, setInputLogin] = useState("");
  const [inputSenha, setInputSenha] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const savedPw = localStorage.getItem("admin_pw");
    const savedUser = localStorage.getItem("admin_user");
    if (savedPw && savedUser) {
      try {
        setPassword(savedPw);
        setUser(JSON.parse(savedUser));
      } catch { /* ignore */ }
    }
    setReady(true);
  }, []);

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      // Tentar novo sistema de usuários
      const authRes = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: inputLogin, senha: inputSenha }),
      });

      if (authRes.ok) {
        const json = await authRes.json();
        if (json.ok && json.user) {
          setUser(json.user);
          setPassword(json.apiToken || inputSenha);
          localStorage.setItem("admin_pw", json.apiToken || inputSenha);
          localStorage.setItem("admin_user", JSON.stringify(json.user));
          setLoading(false);
          return;
        }
      }

      // Fallback: tentar senha antiga (compatibilidade)
      const statsRes = await fetch("/api/admin/stats", {
        headers: { "x-admin-password": inputSenha },
      });
      if (statsRes.ok) {
        const fallbackUser: UserInfo = { id: "legacy", nome: inputLogin || "Admin", login: "admin", role: "admin" };
        setUser(fallbackUser);
        setPassword(inputSenha);
        localStorage.setItem("admin_pw", inputSenha);
        localStorage.setItem("admin_user", JSON.stringify(fallbackUser));
        setLoading(false);
        return;
      }

      setError("Login ou senha incorretos");
    } catch {
      setError("Erro ao conectar");
    }
    setLoading(false);
  };

  const logout = () => {
    localStorage.removeItem("admin_pw");
    localStorage.removeItem("admin_user");
    setPassword("");
    setUser(null);
    setInputLogin("");
    setInputSenha("");
  };

  if (!ready) return null;

  // Login screen
  if (!user) {
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
              type="text"
              placeholder="Login"
              value={inputLogin}
              onChange={(e) => setInputLogin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && document.getElementById("senha-input")?.focus()}
              className="w-full px-4 py-3 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#E8740E] transition-colors"
            />
            <input
              id="senha-input"
              type="password"
              placeholder="Senha"
              value={inputSenha}
              onChange={(e) => setInputSenha(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="w-full px-4 py-3 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#E8740E] transition-colors"
            />
            {error && (
              <p className="text-[#E74C3C] text-sm text-center">{error}</p>
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
    <AdminContext.Provider value={{ password, user, logout }}>
      <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] overflow-x-hidden">
        {/* Sidebar Navigation */}
        <AdminNav userRole={user.role} />

        {/* Main content area — offset by sidebar width */}
        <div className="lg:ml-[220px] min-h-screen flex flex-col">
          {/* Top bar */}
          <div className="bg-white border-b border-[#D2D2D7] px-3 sm:px-6 py-2.5 flex items-center justify-end shadow-sm gap-2 sticky top-0 z-30">
            <button
              onClick={async () => {
                const res = await fetch("/api/estoque?action=undo", { headers: { "x-admin-password": password } });
                const json = await res.json();
                if (json.ok) {
                  alert("Desfeito: " + json.undone);
                  window.location.reload();
                } else {
                  alert(json.error || "Nada para desfazer");
                }
              }}
              className="px-2 sm:px-3 py-1.5 rounded-xl text-[10px] sm:text-xs text-[#86868B] border border-[#D2D2D7] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors"
            >
              Desfazer
            </button>
            <span className="text-xs sm:text-sm text-[#86868B] hidden sm:inline">
              {user.nome} <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-[#F5F5F7]">{user.role}</span>
            </span>
            <button
              onClick={logout}
              className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-white border border-[#D2D2D7] text-[#86868B] text-xs sm:text-sm hover:border-[#E74C3C] hover:text-[#E74C3C] transition-colors"
            >
              Sair
            </button>
          </div>

          {/* Content */}
          <div className="p-3 sm:p-6 max-w-[1400px] mx-auto w-full flex-1">
            {children}
          </div>
        </div>
      </div>
    </AdminContext.Provider>
  );
}
