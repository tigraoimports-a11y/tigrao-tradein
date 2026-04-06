"use client";

import { useEffect, useState, useCallback } from "react";
import { useAutoRefetch } from "@/lib/useAutoRefetch";
import { useAdmin } from "@/components/admin/AdminShell";
import { PAGE_GROUPS } from "@/lib/permissions";

interface Usuario {
  id: string;
  nome: string;
  login: string;
  role: string;
  ativo: boolean;
  permissoes: string[];
  created_at: string;
}

const ROLES = ["admin", "equipe"];

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  equipe: "Equipe",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-[#FFF5EB] text-[#E8740E] border-[#E8740E]/20",
  equipe: "bg-[#EBF5FF] text-[#3B82F6] border-[#3B82F6]/20",
};

export default function UsuariosPage() {
  const { password, user } = useAdmin();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // New user form
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ nome: "", login: "", senha: "", role: "equipe" });
  const [creating, setCreating] = useState(false);

  const headers = useCallback(() => ({
    "Content-Type": "application/json",
    "x-admin-password": password,
    "x-admin-user": encodeURIComponent(user?.nome || "sistema"),
    "x-admin-role": user?.role || "admin",
  }), [password, user]);

  const fetchUsuarios = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/usuarios", { headers: headers() });
      if (res.ok) {
        const json = await res.json();
        setUsuarios((json.data ?? []).map((u: Record<string, unknown>) => ({
          ...u,
          permissoes: Array.isArray(u.permissoes) ? u.permissoes : [],
        })));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [headers]);

  useEffect(() => { fetchUsuarios(); }, [fetchUsuarios]);
  useAutoRefetch(fetchUsuarios);

  const handleRoleChange = async (id: string, newRole: string) => {
    setSaving(id);
    setMsg("");
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ id, role: newRole }),
      });
      const json = await res.json();
      if (json.ok) {
        setMsg("Role atualizado!");
        fetchUsuarios();
      } else {
        setMsg("Erro: " + json.error);
      }
    } catch {
      setMsg("Erro de conexao");
    }
    setSaving(null);
  };

  const handleToggleAtivo = async (u: Usuario) => {
    setSaving(u.id);
    setMsg("");
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ id: u.id, ativo: !u.ativo }),
      });
      const json = await res.json();
      if (json.ok) {
        setMsg(u.ativo ? "Usuario desativado" : "Usuario ativado");
        fetchUsuarios();
      } else {
        setMsg("Erro: " + json.error);
      }
    } catch {
      setMsg("Erro de conexao");
    }
    setSaving(null);
  };

  const handlePermissaoToggle = async (u: Usuario, pageKey: string) => {
    const current = u.permissoes ?? [];
    const next = current.includes(pageKey)
      ? current.filter((k) => k !== pageKey)
      : [...current, pageKey];

    // Optimistic update
    setUsuarios((prev) =>
      prev.map((usr) => usr.id === u.id ? { ...usr, permissoes: next } : usr)
    );

    setSaving(u.id);
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ id: u.id, permissoes: next }),
      });
      const json = await res.json();
      if (!json.ok) {
        // Revert on error
        setUsuarios((prev) =>
          prev.map((usr) => usr.id === u.id ? { ...usr, permissoes: current } : usr)
        );
        setMsg("Erro: " + json.error);
      }
    } catch {
      setUsuarios((prev) =>
        prev.map((usr) => usr.id === u.id ? { ...usr, permissoes: current } : usr)
      );
      setMsg("Erro de conexao");
    }
    setSaving(null);
  };

  const handleToggleAllGroup = async (u: Usuario, groupPages: string[]) => {
    const current = u.permissoes ?? [];
    const allChecked = groupPages.every((k) => current.includes(k));
    const next = allChecked
      ? current.filter((k) => !groupPages.includes(k))
      : [...new Set([...current, ...groupPages])];

    setUsuarios((prev) =>
      prev.map((usr) => usr.id === u.id ? { ...usr, permissoes: next } : usr)
    );

    setSaving(u.id);
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ id: u.id, permissoes: next }),
      });
      const json = await res.json();
      if (!json.ok) {
        setUsuarios((prev) =>
          prev.map((usr) => usr.id === u.id ? { ...usr, permissoes: current } : usr)
        );
        setMsg("Erro: " + json.error);
      }
    } catch {
      setUsuarios((prev) =>
        prev.map((usr) => usr.id === u.id ? { ...usr, permissoes: current } : usr)
      );
      setMsg("Erro de conexao");
    }
    setSaving(null);
  };

  const handleCreate = async () => {
    if (!newForm.nome || !newForm.login || !newForm.senha) {
      setMsg("Preencha todos os campos");
      return;
    }
    setCreating(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(newForm),
      });
      const json = await res.json();
      if (json.ok) {
        setMsg("Usuario criado!");
        setNewForm({ nome: "", login: "", senha: "", role: "equipe" });
        setShowNew(false);
        fetchUsuarios();
      } else {
        setMsg("Erro: " + json.error);
      }
    } catch {
      setMsg("Erro de conexao");
    }
    setCreating(false);
  };

  if (user?.role !== "admin") {
    return (
      <div className="text-center py-12 text-[#86868B]">
        Apenas administradores podem acessar esta pagina.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1D1D1F]">Usuarios</h1>
        <button
          onClick={() => setShowNew(!showNew)}
          className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors"
        >
          {showNew ? "Cancelar" : "Novo Usuario"}
        </button>
      </div>

      {msg && (
        <div className={`px-4 py-2 rounded-xl text-sm ${msg.includes("Erro") ? "bg-[#FEF2F2] text-[#E74C3C]" : "bg-[#F0FFF4] text-[#2ECC71]"}`}>
          {msg}
        </div>
      )}

      {/* New user form */}
      {showNew && (
        <div className="bg-white rounded-2xl border border-[#E8E8ED] p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[#1D1D1F]">Novo Usuario</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-[#86868B] uppercase tracking-wider font-medium">Nome</label>
              <input
                type="text"
                value={newForm.nome}
                onChange={(e) => setNewForm((f) => ({ ...f, nome: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#E8E8ED] text-sm text-[#1D1D1F] focus:outline-none focus:border-[#E8740E]"
                placeholder="Nome completo"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#86868B] uppercase tracking-wider font-medium">Login</label>
              <input
                type="text"
                value={newForm.login}
                onChange={(e) => setNewForm((f) => ({ ...f, login: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#E8E8ED] text-sm text-[#1D1D1F] focus:outline-none focus:border-[#E8740E]"
                placeholder="login"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#86868B] uppercase tracking-wider font-medium">Senha</label>
              <input
                type="text"
                value={newForm.senha}
                onChange={(e) => setNewForm((f) => ({ ...f, senha: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#E8E8ED] text-sm text-[#1D1D1F] focus:outline-none focus:border-[#E8740E]"
                placeholder="Senha"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#86868B] uppercase tracking-wider font-medium">Role</label>
              <select
                value={newForm.role}
                onChange={(e) => setNewForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#E8E8ED] text-sm text-[#1D1D1F] focus:outline-none focus:border-[#E8740E]"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
          >
            {creating ? "Criando..." : "Criar Usuario"}
          </button>
        </div>
      )}

      {/* Users list */}
      {loading ? (
        <div className="text-center py-12 text-[#86868B] text-sm">Carregando...</div>
      ) : (
        <div className="space-y-3">
          {usuarios.map((u) => (
            <div key={u.id} className={`bg-white rounded-2xl border border-[#E8E8ED] ${!u.ativo ? "opacity-50" : ""}`}>
              {/* User header row */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-[#F5F5F7] flex items-center justify-center text-base shrink-0">
                  {u.nome.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#1D1D1F]">{u.nome}</span>
                    {!u.ativo && (
                      <span className="px-1.5 py-0.5 rounded-md text-[9px] bg-[#FEF2F2] text-[#E74C3C] font-medium">INATIVO</span>
                    )}
                  </div>
                  <p className="text-xs text-[#86868B]">@{u.login}</p>
                </div>

                {/* Role selector */}
                <select
                  value={u.role}
                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                  disabled={saving === u.id || u.id === user?.id}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold border ${ROLE_COLORS[u.role] || "bg-[#F0F0F5] text-[#6E6E73]"} focus:outline-none focus:ring-1 focus:ring-[#E8740E] disabled:cursor-not-allowed`}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                  ))}
                </select>

                {/* Permissoes toggle button (not for admin users or self) */}
                {u.role !== "admin" && u.id !== user?.id && (
                  <button
                    onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                    className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                      expandedUser === u.id
                        ? "text-[#E8740E] border-[#E8740E]/30 bg-[#FFF5EB]"
                        : "text-[#86868B] border-[#E8E8ED] hover:bg-[#F5F5F7]"
                    }`}
                  >
                    Permissoes {expandedUser === u.id ? "\u25B2" : "\u25BC"}
                  </button>
                )}

                {/* Admin badge */}
                {u.role === "admin" && u.id !== user?.id && (
                  <span className="px-2 py-1 rounded-lg text-[10px] text-[#86868B] border border-[#E8E8ED]">
                    Acesso total
                  </span>
                )}

                {/* Toggle ativo */}
                {u.id !== user?.id && (
                  <button
                    onClick={() => handleToggleAtivo(u)}
                    disabled={saving === u.id}
                    className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                      u.ativo
                        ? "text-[#E74C3C] border-[#E74C3C]/20 hover:bg-[#FEF2F2]"
                        : "text-[#2ECC71] border-[#2ECC71]/20 hover:bg-[#F0FFF4]"
                    } disabled:opacity-30`}
                  >
                    {u.ativo ? "Desativar" : "Ativar"}
                  </button>
                )}
              </div>

              {/* Permissions panel */}
              {expandedUser === u.id && u.role !== "admin" && (
                <div className="px-4 pb-4 border-t border-[#F0F0F5] pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {PAGE_GROUPS.map((group) => {
                      const groupKeys = group.pages.map((p) => p.key);
                      const allChecked = groupKeys.every((k) => (u.permissoes ?? []).includes(k));
                      const someChecked = !allChecked && groupKeys.some((k) => (u.permissoes ?? []).includes(k));

                      return (
                        <div key={group.label} className="bg-[#FAFAFA] rounded-xl p-3 border border-[#F0F0F5]">
                          {/* Group header with toggle-all */}
                          <label className="flex items-center gap-2 mb-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allChecked}
                              ref={(el) => { if (el) el.indeterminate = someChecked; }}
                              onChange={() => handleToggleAllGroup(u, groupKeys)}
                              className="w-4 h-4 rounded accent-[#E8740E]"
                            />
                            <span className="text-xs font-bold text-[#1D1D1F] uppercase tracking-wider">
                              {group.label}
                            </span>
                          </label>
                          <div className="space-y-1.5 ml-1">
                            {group.pages.map((page) => (
                              <label key={page.key} className="flex items-center gap-2 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={(u.permissoes ?? []).includes(page.key)}
                                  onChange={() => handlePermissaoToggle(u, page.key)}
                                  className="w-3.5 h-3.5 rounded accent-[#E8740E]"
                                />
                                <span className="text-xs text-[#6E6E73] group-hover:text-[#1D1D1F] transition-colors">
                                  {page.label}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-[#86868B] mt-3">
                    {(u.permissoes ?? []).length} permissao(oes) ativa(s) de {PAGE_GROUPS.flatMap(g => g.pages).length} total
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
