"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface PrecoProduto {
  id?: string;
  modelo: string;
  armazenamento: string;
  preco_pix: number;
  status: string;
  updated_at?: string;
}

export default function AdminPrecosPage() {
  const [password, setPassword] = useState("");
  const [inputPw, setInputPw] = useState("");
  const [pwError, setPwError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PrecoProduto[] | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("admin_pw");
    if (saved) setPassword(saved);
  }, []);

  const fetchData = useCallback(async (pw: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/precos", {
        headers: { "x-admin-password": pw },
      });
      if (res.status === 401) { setPwError(true); setLoading(false); return false; }
      const json = await res.json();
      setData(json.data ?? []);
      setLoading(false);
      return true;
    } catch {
      setLoading(false);
      return false;
    }
  }, []);

  const handleLogin = async () => {
    setPwError(false);
    const ok = await fetchData(inputPw);
    if (ok) {
      setPassword(inputPw);
      localStorage.setItem("admin_pw", inputPw);
    }
  };

  useEffect(() => {
    if (password) fetchData(password);
  }, [password, fetchData]);

  async function handleSave(row: PrecoProduto) {
    const key = `${row.modelo}|${row.armazenamento}`;
    const newPrice = parseFloat((editing[key] ?? String(row.preco_pix)).replace(",", "."));
    if (isNaN(newPrice) || newPrice <= 0) return;

    setSaving(key);
    await fetch("/api/admin/precos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ modelo: row.modelo, armazenamento: row.armazenamento, preco_pix: newPrice, status: row.status }),
    });
    setData((prev) => prev?.map((r) =>
      r.modelo === row.modelo && r.armazenamento === row.armazenamento
        ? { ...r, preco_pix: newPrice }
        : r
    ) ?? null);
    const newEditing = { ...editing };
    delete newEditing[key];
    setEditing(newEditing);
    setSaving(null);
  }

  async function handleToggleStatus(row: PrecoProduto) {
    const newStatus = row.status === "esgotado" ? "ativo" : "esgotado";
    await fetch("/api/admin/precos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ modelo: row.modelo, armazenamento: row.armazenamento, preco_pix: row.preco_pix, status: newStatus }),
    });
    setData((prev) => prev?.map((r) =>
      r.modelo === row.modelo && r.armazenamento === row.armazenamento
        ? { ...r, status: newStatus }
        : r
    ) ?? null);
  }

  async function handleImport() {
    setImporting(true);
    setImportMsg("");
    const res = await fetch("/api/admin/precos", {
      method: "PUT",
      headers: { "x-admin-password": password },
    });
    const json = await res.json();
    if (json.ok) {
      setImportMsg(`${json.imported} produtos importados do Google Sheets`);
      await fetchData(password);
    } else {
      setImportMsg("Erro ao importar: " + json.error);
    }
    setImporting(false);
  }

  // LOGIN
  if (!password || data === null) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🐯</div>
            <h1 className="text-2xl font-bold text-[#1D1D1F]">Painel de Preços</h1>
            <p className="text-[#86868B] text-sm mt-1">TigrãoImports</p>
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
            {pwError && <p className="text-[#E74C3C] text-sm text-center">Senha incorreta</p>}
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

  // Agrupar por modelo
  const grouped: Record<string, PrecoProduto[]> = {};
  (data ?? []).forEach((r) => {
    if (!grouped[r.modelo]) grouped[r.modelo] = [];
    grouped[r.modelo].push(r);
  });

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F]">
      {/* Header */}
      <div className="bg-white border-b border-[#D2D2D7] px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🐯</span>
          <div>
            <h1 className="text-lg font-bold text-[#1D1D1F]">Painel de Preços</h1>
            <p className="text-[#86868B] text-xs">Edite os preços diretamente aqui</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-4 py-2 rounded-xl bg-white border border-[#D2D2D7] text-[#86868B] text-sm hover:border-[#E8740E] hover:text-[#E8740E] transition-colors disabled:opacity-50"
          >
            {importing ? "Importando..." : "Importar do Sheets"}
          </button>
          <Link
            href="/admin"
            className="px-4 py-2 rounded-xl bg-white border border-[#D2D2D7] text-[#86868B] text-sm hover:border-[#E8740E] hover:text-[#E8740E] transition-colors"
          >
            Dashboard
          </Link>
          <button
            onClick={() => { localStorage.removeItem("admin_pw"); setPassword(""); setData(null); }}
            className="px-4 py-2 rounded-xl bg-white border border-[#D2D2D7] text-[#86868B] text-sm hover:border-[#E74C3C] hover:text-[#E74C3C] transition-colors"
          >
            Sair
          </button>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-4">
        {importMsg && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm">
            {importMsg}
          </div>
        )}

        {data.length === 0 ? (
          <div className="bg-white border border-[#D2D2D7] rounded-2xl p-12 text-center shadow-sm">
            <p className="text-[#86868B] mb-4">Nenhum produto cadastrado ainda.</p>
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-6 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
            >
              {importing ? "Importando..." : "Importar preços do Google Sheets"}
            </button>
          </div>
        ) : (
          Object.entries(grouped).map(([modelo, rows]) => (
            <div key={modelo} className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 bg-[#F5F5F7] border-b border-[#D2D2D7]">
                <h2 className="font-semibold text-[#1D1D1F]">{modelo}</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F5F5F7]">
                    <th className="px-5 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">Armazenamento</th>
                    <th className="px-5 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">Preço PIX</th>
                    <th className="px-5 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">Status</th>
                    <th className="px-5 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const key = `${row.modelo}|${row.armazenamento}`;
                    const isEditing = editing[key] !== undefined;
                    const isSaving = saving === key;
                    return (
                      <tr key={key} className="border-b border-[#F5F5F7] last:border-0 hover:bg-[#F5F5F7] transition-colors">
                        <td className="px-5 py-3 font-medium">{row.armazenamento}</td>
                        <td className="px-5 py-3">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <span className="text-[#86868B] text-sm">R$</span>
                              <input
                                type="number"
                                value={editing[key]}
                                onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
                                onKeyDown={(e) => e.key === "Enter" && handleSave(row)}
                                className="w-32 px-3 py-1.5 rounded-lg border border-[#0071E3] bg-white text-[#1D1D1F] text-sm focus:outline-none"
                                autoFocus
                              />
                            </div>
                          ) : (
                            <span
                              className="cursor-pointer hover:text-[#E8740E] transition-colors font-medium"
                              onClick={() => setEditing({ ...editing, [key]: String(row.preco_pix) })}
                            >
                              R$ {row.preco_pix.toLocaleString("pt-BR")}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => handleToggleStatus(row)}
                            className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                              row.status === "esgotado"
                                ? "bg-red-100 text-red-600 hover:bg-red-200"
                                : "bg-green-100 text-green-700 hover:bg-green-200"
                            }`}
                          >
                            {row.status === "esgotado" ? "Esgotado" : "Ativo"}
                          </button>
                        </td>
                        <td className="px-5 py-3 text-right">
                          {isEditing ? (
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => { const e = { ...editing }; delete e[key]; setEditing(e); }}
                                className="px-3 py-1.5 rounded-lg text-xs text-[#86868B] hover:text-[#1D1D1F] transition-colors"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleSave(row)}
                                disabled={isSaving}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#F5A623] transition-colors disabled:opacity-50"
                              >
                                {isSaving ? "Salvando..." : "Salvar"}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setEditing({ ...editing, [key]: String(row.preco_pix) })}
                              className="px-3 py-1.5 rounded-lg text-xs text-[#86868B] hover:text-[#E8740E] border border-[#D2D2D7] hover:border-[#E8740E] transition-colors"
                            >
                              Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
