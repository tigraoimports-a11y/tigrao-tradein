"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

interface PrecoProduto {
  id?: string;
  modelo: string;
  armazenamento: string;
  preco_pix: number;
  status: string;
  categoria: string;
  updated_at?: string;
}

const CATEGORIAS = [
  { key: "IPHONE", label: "iPhones", emoji: "📱" },
  { key: "MACBOOK", label: "MacBooks", emoji: "💻" },
  { key: "IPAD", label: "iPads", emoji: "📟" },
  { key: "APPLE_WATCH", label: "Apple Watch", emoji: "⌚" },
  { key: "AIRPODS", label: "AirPods", emoji: "🎧" },
  { key: "ACESSORIOS", label: "Acessórios", emoji: "🔌" },
] as const;

type CategoriaKey = typeof CATEGORIAS[number]["key"];

export default function AdminPrecosPage() {
  const { password } = useAdmin();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PrecoProduto[] | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [tab, setTab] = useState<CategoriaKey>("IPHONE");
  const [showAdd, setShowAdd] = useState(false);
  const [newProd, setNewProd] = useState({ modelo: "", armazenamento: "", preco_pix: "" });
  // Campos extras para MacBook (tela + ram + armazenamento separados)
  const [macFields, setMacFields] = useState({ tela: "", ram: "", armazenamento: "" });

  const fetchData = useCallback(async (pw: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/precos", {
        headers: { "x-admin-password": pw },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json.data ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (password) fetchData(password);
  }, [password, fetchData]);

  // Inferir categoria pelo nome do modelo
  function inferCategoria(modelo: string): CategoriaKey {
    const m = modelo.toUpperCase();
    if (m.includes("IPHONE") || m.includes("PHONE")) return "IPHONE";
    if (m.includes("MACBOOK") || m.includes("MAC MINI") || m.includes("IMAC")) return "MACBOOK";
    if (m.includes("IPAD")) return "IPAD";
    if (m.includes("WATCH")) return "APPLE_WATCH";
    if (m.includes("AIRPOD")) return "AIRPODS";
    return "ACESSORIOS";
  }

  async function handleSave(row: PrecoProduto) {
    const key = `${row.modelo}|${row.armazenamento}`;
    const newPrice = parseFloat((editing[key] ?? String(row.preco_pix)).replace(",", "."));
    if (isNaN(newPrice) || newPrice <= 0) return;

    setSaving(key);
    await fetch("/api/admin/precos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({
        modelo: row.modelo,
        armazenamento: row.armazenamento,
        preco_pix: newPrice,
        status: row.status,
        categoria: row.categoria || inferCategoria(row.modelo),
      }),
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
      body: JSON.stringify({
        modelo: row.modelo,
        armazenamento: row.armazenamento,
        preco_pix: row.preco_pix,
        status: newStatus,
        categoria: row.categoria || inferCategoria(row.modelo),
      }),
    });
    setData((prev) => prev?.map((r) =>
      r.modelo === row.modelo && r.armazenamento === row.armazenamento
        ? { ...r, status: newStatus }
        : r
    ) ?? null);
  }

  async function handleDelete(row: PrecoProduto) {
    if (!confirm(`Remover ${row.modelo} ${row.armazenamento}?`)) return;
    await fetch("/api/admin/precos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ modelo: row.modelo, armazenamento: row.armazenamento }),
    });
    setData((prev) => prev?.filter((r) =>
      !(r.modelo === row.modelo && r.armazenamento === row.armazenamento)
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

  async function handleAddProd() {
    const preco = parseFloat(newProd.preco_pix);
    // Para MacBooks, montar armazenamento a partir dos campos separados
    let armazenamentoFinal = newProd.armazenamento.trim();
    if (tab === "MACBOOK") {
      const t = macFields.tela.trim();
      const r = macFields.ram.trim();
      const a = macFields.armazenamento.trim();
      if (!t || !r || !a) return;
      armazenamentoFinal = `${t} | ${r} RAM | ${a}`;
    }
    if (!newProd.modelo || !armazenamentoFinal || isNaN(preco) || preco <= 0) return;
    setSaving("new");
    await fetch("/api/admin/precos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({
        modelo: newProd.modelo.trim(),
        armazenamento: armazenamentoFinal,
        preco_pix: preco,
        status: "ativo",
        categoria: tab,
      }),
    });
    await fetchData(password);
    setNewProd({ modelo: "", armazenamento: "", preco_pix: "" });
    setMacFields({ tela: "", ram: "", armazenamento: "" });
    setShowAdd(false);
    setSaving(null);
  }

  if (loading && data === null) {
    return <div className="flex items-center justify-center py-20"><p className="text-[#86868B]">Carregando...</p></div>;
  }

  if (!data) return null;

  // Filtrar por categoria da tab
  const filtered = data.filter((r) => {
    const cat = r.categoria || inferCategoria(r.modelo);
    return cat === tab;
  });

  // Agrupar por modelo
  const grouped: Record<string, PrecoProduto[]> = {};
  filtered.forEach((r) => {
    if (!grouped[r.modelo]) grouped[r.modelo] = [];
    grouped[r.modelo].push(r);
  });

  const catInfo = CATEGORIAS.find((c) => c.key === tab)!;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-[#1D1D1F]">Painel de Precos</h2>
          <p className="text-[#86868B] text-xs">Edite os precos diretamente aqui. Alteracoes notificam via Telegram.</p>
        </div>
        <div className="flex gap-2">
          {tab === "IPHONE" && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-2 rounded-xl bg-white border border-[#D2D2D7] text-[#86868B] text-sm hover:border-[#E8740E] hover:text-[#E8740E] transition-colors disabled:opacity-50"
            >
              {importing ? "Importando..." : "Importar do Sheets"}
            </button>
          )}
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors"
          >
            + Adicionar Produto
          </button>
        </div>
      </div>

      {/* Tabs por categoria */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIAS.map((c) => {
          const count = data.filter((r) => (r.categoria || inferCategoria(r.modelo)) === c.key).length;
          return (
            <button
              key={c.key}
              onClick={() => { setTab(c.key); setShowAdd(false); }}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === c.key
                  ? "bg-[#E8740E] text-white"
                  : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"
              }`}
            >
              {c.emoji} {c.label} {count > 0 ? `(${count})` : ""}
            </button>
          );
        })}
      </div>

      {importMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm">
          {importMsg}
        </div>
      )}

      {/* Form adicionar produto */}
      {showAdd && (
        <div className="bg-white border border-[#E8740E] rounded-2xl p-5 space-y-3 shadow-sm">
          <h3 className="font-semibold text-sm text-[#1D1D1F]">Adicionar produto em {catInfo.emoji} {catInfo.label}</h3>
          {tab === "MACBOOK" ? (
            <div className="grid grid-cols-5 gap-3">
              <div>
                <p className="text-[10px] font-bold text-[#86868B] uppercase mb-1">Modelo</p>
                <input
                  value={newProd.modelo}
                  onChange={(e) => setNewProd({ ...newProd, modelo: e.target.value })}
                  placeholder="MacBook Air M4"
                  className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm"
                />
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#86868B] uppercase mb-1">Tela</p>
                <input
                  value={macFields.tela}
                  onChange={(e) => setMacFields({ ...macFields, tela: e.target.value })}
                  placeholder={'13"'}
                  className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm"
                />
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#86868B] uppercase mb-1">RAM</p>
                <input
                  value={macFields.ram}
                  onChange={(e) => setMacFields({ ...macFields, ram: e.target.value })}
                  placeholder="16GB"
                  className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm"
                />
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#86868B] uppercase mb-1">Armazenamento</p>
                <input
                  value={macFields.armazenamento}
                  onChange={(e) => setMacFields({ ...macFields, armazenamento: e.target.value })}
                  placeholder="256GB"
                  className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm"
                />
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#86868B] uppercase mb-1">Preço PIX (R$)</p>
                <input
                  type="number"
                  value={newProd.preco_pix}
                  onChange={(e) => setNewProd({ ...newProd, preco_pix: e.target.value })}
                  placeholder="8.997"
                  className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] font-bold text-[#86868B] uppercase mb-1">Modelo</p>
                <input
                  value={newProd.modelo}
                  onChange={(e) => setNewProd({ ...newProd, modelo: e.target.value })}
                  placeholder={tab === "IPHONE" ? "iPhone 17 Pro" : "Nome do produto"}
                  className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm"
                />
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#86868B] uppercase mb-1">Variação</p>
                <input
                  value={newProd.armazenamento}
                  onChange={(e) => setNewProd({ ...newProd, armazenamento: e.target.value })}
                  placeholder="256GB / Único / etc"
                  className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm"
                />
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#86868B] uppercase mb-1">Preço PIX (R$)</p>
                <input
                  type="number"
                  value={newProd.preco_pix}
                  onChange={(e) => setNewProd({ ...newProd, preco_pix: e.target.value })}
                  placeholder="4.997"
                  className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm"
                />
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleAddProd}
              disabled={saving === "new"}
              className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
            >
              {saving === "new" ? "Salvando..." : "Adicionar"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 rounded-xl border border-[#D2D2D7] text-[#86868B] text-sm hover:bg-[#F5F5F7] transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 && !showAdd ? (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-12 text-center shadow-sm">
          <p className="text-[#86868B] mb-4">Nenhum produto em {catInfo.label}.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="px-6 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors"
          >
            + Adicionar primeiro produto
          </button>
        </div>
      ) : (
        Object.entries(grouped).map(([modelo, rows]) => {
          // Detectar se é MacBook para mostrar colunas separadas
          const isMac = tab === "MACBOOK";
          // Parser: tenta extrair tela|ram|armazenamento do campo combinado
          function parseMacSpec(spec: string) {
            const parts = spec.split("|").map((s) => s.trim());
            if (parts.length >= 3) {
              return { tela: parts[0], ram: parts[1].replace(/\s*RAM$/i, ""), arm: parts[2] };
            }
            return { tela: "-", ram: "-", arm: spec };
          }
          return (
          <div key={modelo} className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-[#F5F5F7] border-b border-[#D2D2D7]">
              <h2 className="font-semibold text-[#1D1D1F]">{modelo}</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F5F5F7]">
                  {isMac ? (
                    <>
                      <th className="px-4 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">Tela</th>
                      <th className="px-4 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">RAM</th>
                      <th className="px-4 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">Armazenamento</th>
                    </>
                  ) : (
                    <th className="px-5 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">Variação</th>
                  )}
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
                  const macSpec = isMac ? parseMacSpec(row.armazenamento) : null;
                  return (
                    <tr key={key} className="border-b border-[#F5F5F7] last:border-0 hover:bg-[#F5F5F7] transition-colors">
                      {isMac && macSpec ? (
                        <>
                          <td className="px-4 py-3 font-medium">{macSpec.tela}</td>
                          <td className="px-4 py-3 font-medium">{macSpec.ram}</td>
                          <td className="px-4 py-3 font-medium">{macSpec.arm}</td>
                        </>
                      ) : (
                        <td className="px-5 py-3 font-medium">{row.armazenamento}</td>
                      )}
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
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => setEditing({ ...editing, [key]: String(row.preco_pix) })}
                              className="px-3 py-1.5 rounded-lg text-xs text-[#86868B] hover:text-[#E8740E] border border-[#D2D2D7] hover:border-[#E8740E] transition-colors"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleDelete(row)}
                              className="px-2 py-1.5 rounded-lg text-xs text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          );
        })
      )}
    </div>
  );
}
