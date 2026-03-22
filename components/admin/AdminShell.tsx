"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import AdminNav from "./AdminNav";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

export interface UserInfo {
  id: string;
  nome: string;
  login: string;
  role: "admin" | "estoque" | "vendedor" | "visualizador";
}

interface AdminContextType {
  password: string;
  user: UserInfo | null;
  logout: () => void;
  darkMode: boolean;
  toggleDark: () => void;
  /** Returns headers object with auth + user info for API calls */
  apiHeaders: (extra?: Record<string, string>) => Record<string, string>;
}

const AdminContext = createContext<AdminContextType>({
  password: "",
  user: null,
  logout: () => {},
  darkMode: false,
  toggleDark: () => {},
  apiHeaders: () => ({}),
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
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    try {
      const savedPw = localStorage.getItem("admin_pw");
      const savedUser = localStorage.getItem("admin_user");
      const savedDark = localStorage.getItem("admin_dark");
      if (savedPw && savedUser) {
        const parsed = JSON.parse(savedUser);
        // Validar que o user tem os campos necessários
        if (parsed && parsed.id && parsed.nome && parsed.login && parsed.role) {
          setPassword(savedPw);
          setUser(parsed);
        } else {
          // Dados corrompidos — limpar
          localStorage.removeItem("admin_pw");
          localStorage.removeItem("admin_user");
        }
      }
      if (savedDark === "true") setDarkMode(true);
    } catch {
      // Qualquer erro ao ler localStorage — limpar tudo e começar fresh
      localStorage.removeItem("admin_pw");
      localStorage.removeItem("admin_user");
    }
    setReady(true);
  }, []);

  const toggleDark = () => {
    setDarkMode(prev => {
      const next = !prev;
      localStorage.setItem("admin_dark", String(next));
      return next;
    });
  };

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

  const { isOnline } = useOnlineStatus();

  // Dark mode CSS variables
  const darkStyles = darkMode ? {
    "--admin-bg": "#0A0A0A",
    "--admin-bg2": "#141414",
    "--admin-border": "#2A2A2A",
    "--admin-text": "#F5F5F5",
    "--admin-text2": "#999",
    "--admin-card": "#1A1A1A",
    "--admin-input-bg": "#1A1A1A",
    "--admin-accent": "#E8740E",
  } as React.CSSProperties : {};

  return (
    <AdminContext.Provider value={{
      password,
      user,
      logout,
      darkMode,
      toggleDark,
      apiHeaders: (extra?: Record<string, string>) => ({
        "x-admin-password": password,
        "x-admin-user": user?.nome || "sistema",
        "x-admin-role": user?.role || "admin",
        ...extra,
      }),
    }}>
      <div
        className={`min-h-screen overflow-x-hidden transition-colors duration-300 ${darkMode ? "admin-dark" : ""}`}
        style={{
          background: darkMode ? "#0A0A0A" : "#F5F5F7",
          color: darkMode ? "#F5F5F5" : "#1D1D1F",
          ...darkStyles,
        }}
      >
        {/* Sidebar Navigation */}
        <AdminNav userRole={user.role} />

        {/* Main content area — offset by sidebar width */}
        <div className="lg:ml-[220px] print:ml-0 min-h-screen flex flex-col">
          {/* Top bar */}
          <div
            className="px-3 sm:px-6 py-2.5 flex items-center justify-end shadow-sm gap-2 sticky top-0 z-30 border-b transition-colors duration-300 print:hidden"
            style={{
              background: darkMode ? "#141414" : "white",
              borderColor: darkMode ? "#2A2A2A" : "#D2D2D7",
            }}
          >
            {/* Online/Offline indicator */}
            <div className="flex items-center gap-1.5 px-2 py-1.5" title={isOnline ? "Online" : "Sem conexão"}>
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: isOnline ? "#2ECC71" : "#E74C3C" }}
              />
              {!isOnline && (
                <span className="text-[10px] sm:text-xs font-medium" style={{ color: "#E74C3C" }}>
                  Offline
                </span>
              )}
            </div>

            {/* Dark mode toggle */}
            <button
              onClick={toggleDark}
              className="px-2 sm:px-3 py-1.5 rounded-xl text-[10px] sm:text-xs border transition-colors"
              style={{
                color: darkMode ? "#F5A623" : "#86868B",
                borderColor: darkMode ? "#2A2A2A" : "#D2D2D7",
              }}
              title={darkMode ? "Modo claro" : "Modo escuro"}
            >
              {darkMode ? "☀️ Claro" : "🌙 Escuro"}
            </button>
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
              className="px-2 sm:px-3 py-1.5 rounded-xl text-[10px] sm:text-xs border transition-colors"
              style={{
                color: darkMode ? "#999" : "#86868B",
                borderColor: darkMode ? "#2A2A2A" : "#D2D2D7",
              }}
            >
              Desfazer
            </button>
            <span className="text-xs sm:text-sm hidden sm:inline" style={{ color: darkMode ? "#999" : "#86868B" }}>
              {user.nome} <span className="text-[10px] px-1.5 py-0.5 rounded-lg" style={{ background: darkMode ? "#2A2A2A" : "#F5F5F7" }}>{user.role}</span>
            </span>
            <button
              onClick={logout}
              className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl border text-xs sm:text-sm transition-colors"
              style={{
                background: darkMode ? "#1A1A1A" : "white",
                borderColor: darkMode ? "#2A2A2A" : "#D2D2D7",
                color: darkMode ? "#999" : "#86868B",
              }}
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

      {/* Global dark mode styles for child components */}
      {darkMode && (
        <style dangerouslySetInnerHTML={{ __html: `
          .admin-dark .bg-white { background: #1A1A1A !important; }
          .admin-dark .bg-\\[\\#F5F5F7\\] { background: #0A0A0A !important; }
          .admin-dark .bg-\\[\\#FAFAFA\\] { background: #141414 !important; }
          .admin-dark .border-\\[\\#D2D2D7\\] { border-color: #2A2A2A !important; }
          .admin-dark .border-\\[\\#E5E5EA\\] { border-color: #2A2A2A !important; }
          .admin-dark .border-\\[\\#E8E8ED\\] { border-color: #2A2A2A !important; }
          .admin-dark .bg-\\[\\#FFF5EB\\] { background: #2A1A08 !important; }
          .admin-dark .bg-\\[\\#FFF5EB\\]\\/50 { background: rgba(42,26,8,0.5) !important; }
          .admin-dark .hover\\:bg-\\[\\#F5F5F7\\]:hover { background: #1E1E1E !important; }
          .admin-dark .hover\\:text-\\[\\#1D1D1F\\]:hover { color: #F5F5F5 !important; }
          .admin-dark .text-\\[\\#1D1D1F\\] { color: #F5F5F5 !important; }
          .admin-dark .text-\\[\\#86868B\\] { color: #999 !important; }
          .admin-dark .text-\\[\\#6E6E73\\] { color: #888 !important; }
          .admin-dark input, .admin-dark select, .admin-dark textarea {
            background: #1A1A1A !important;
            color: #F5F5F5 !important;
            border-color: #2A2A2A !important;
          }
          .admin-dark input::placeholder, .admin-dark textarea::placeholder {
            color: #666 !important;
          }
          .admin-dark .shadow-sm { box-shadow: 0 1px 2px rgba(0,0,0,0.3) !important; }
          .admin-dark table th { background: #141414 !important; color: #999 !important; border-color: #2A2A2A !important; }
          .admin-dark table td { border-color: #2A2A2A !important; color: #DDD !important; }
          .admin-dark table tr:hover td { background: #1E1E1E !important; }
          .admin-dark .rounded-2xl, .admin-dark .rounded-xl { border-color: #2A2A2A; }
          .admin-dark h1, .admin-dark h2, .admin-dark h3, .admin-dark h4 { color: #F5F5F5 !important; }
          .admin-dark p { color: #CCC; }
        ` }} />
      )}
    </AdminContext.Provider>
  );
}
