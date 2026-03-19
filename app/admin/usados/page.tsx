"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

interface ValorUsado {
  id: string;
  modelo: string;
  armazenamento: string;
  valor_base: number;
  ativo: boolean;
}

interface DescontoCondicao {
  id: string;
  condicao: string;
  detalhe: string;
  desconto: number;
}

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

// Valores padrão para importação inicial
const DEFAULTS = [
  { modelo: "iPhone 11", armazenamento: "64GB", valor_base: 900 },
  { modelo: "iPhone 11", armazenamento: "128GB", valor_base: 1050 },
  { modelo: "iPhone 11 Pro", armazenamento: "64GB", valor_base: 1050 },
  { modelo: "iPhone 11 Pro", armazenamento: "128GB", valor_base: 1150 },
  { modelo: "iPhone 11 Pro", armazenamento: "256GB", valor_base: 1300 },
  { modelo: "iPhone 11 Pro Max", armazenamento: "64GB", valor_base: 1200 },
  { modelo: "iPhone 11 Pro Max", armazenamento: "128GB", valor_base: 1350 },
  { modelo: "iPhone 11 Pro Max", armazenamento: "256GB", valor_base: 1500 },
  { modelo: "iPhone 12", armazenamento: "64GB", valor_base: 1200 },
  { modelo: "iPhone 12", armazenamento: "128GB", valor_base: 1400 },
  { modelo: "iPhone 12", armazenamento: "256GB", valor_base: 1550 },
  { modelo: "iPhone 12 Pro", armazenamento: "128GB", valor_base: 1600 },
  { modelo: "iPhone 12 Pro", armazenamento: "256GB", valor_base: 1750 },
  { modelo: "iPhone 12 Pro Max", armazenamento: "128GB", valor_base: 1750 },
  { modelo: "iPhone 12 Pro Max", armazenamento: "256GB", valor_base: 1900 },
  { modelo: "iPhone 12 Pro Max", armazenamento: "512GB", valor_base: 2100 },
  { modelo: "iPhone 13", armazenamento: "128GB", valor_base: 1700 },
  { modelo: "iPhone 13", armazenamento: "256GB", valor_base: 1900 },
  { modelo: "iPhone 13", armazenamento: "512GB", valor_base: 2100 },
  { modelo: "iPhone 13 Pro", armazenamento: "128GB", valor_base: 2000 },
  { modelo: "iPhone 13 Pro", armazenamento: "256GB", valor_base: 2200 },
  { modelo: "iPhone 13 Pro", armazenamento: "512GB", valor_base: 2400 },
  { modelo: "iPhone 13 Pro", armazenamento: "1TB", valor_base: 2600 },
  { modelo: "iPhone 13 Pro Max", armazenamento: "128GB", valor_base: 2300 },
  { modelo: "iPhone 13 Pro Max", armazenamento: "256GB", valor_base: 2500 },
  { modelo: "iPhone 13 Pro Max", armazenamento: "512GB", valor_base: 2700 },
  { modelo: "iPhone 13 Pro Max", armazenamento: "1TB", valor_base: 2900 },
  { modelo: "iPhone 14", armazenamento: "128GB", valor_base: 2300 },
  { modelo: "iPhone 14", armazenamento: "256GB", valor_base: 2550 },
  { modelo: "iPhone 14", armazenamento: "512GB", valor_base: 2800 },
  { modelo: "iPhone 14 Plus", armazenamento: "128GB", valor_base: 2500 },
  { modelo: "iPhone 14 Plus", armazenamento: "256GB", valor_base: 2750 },
  { modelo: "iPhone 14 Plus", armazenamento: "512GB", valor_base: 3000 },
  { modelo: "iPhone 14 Pro", armazenamento: "128GB", valor_base: 2800 },
  { modelo: "iPhone 14 Pro", armazenamento: "256GB", valor_base: 3050 },
  { modelo: "iPhone 14 Pro", armazenamento: "512GB", valor_base: 3300 },
  { modelo: "iPhone 14 Pro", armazenamento: "1TB", valor_base: 3550 },
  { modelo: "iPhone 14 Pro Max", armazenamento: "128GB", valor_base: 3100 },
  { modelo: "iPhone 14 Pro Max", armazenamento: "256GB", valor_base: 3350 },
  { modelo: "iPhone 14 Pro Max", armazenamento: "512GB", valor_base: 3600 },
  { modelo: "iPhone 14 Pro Max", armazenamento: "1TB", valor_base: 3850 },
  { modelo: "iPhone 15", armazenamento: "128GB", valor_base: 3000 },
  { modelo: "iPhone 15", armazenamento: "256GB", valor_base: 3250 },
  { modelo: "iPhone 15", armazenamento: "512GB", valor_base: 3500 },
  { modelo: "iPhone 15 Plus", armazenamento: "128GB", valor_base: 3300 },
  { modelo: "iPhone 15 Plus", armazenamento: "256GB", valor_base: 3550 },
  { modelo: "iPhone 15 Plus", armazenamento: "512GB", valor_base: 3800 },
  { modelo: "iPhone 15 Pro", armazenamento: "128GB", valor_base: 3600 },
  { modelo: "iPhone 15 Pro", armazenamento: "256GB", valor_base: 3900 },
  { modelo: "iPhone 15 Pro", armazenamento: "512GB", valor_base: 4200 },
  { modelo: "iPhone 15 Pro", armazenamento: "1TB", valor_base: 4500 },
  { modelo: "iPhone 15 Pro Max", armazenamento: "256GB", valor_base: 4500 },
  { modelo: "iPhone 15 Pro Max", armazenamento: "512GB", valor_base: 4800 },
  { modelo: "iPhone 15 Pro Max", armazenamento: "1TB", valor_base: 5100 },
  { modelo: "iPhone 16", armazenamento: "128GB", valor_base: 3800 },
  { modelo: "iPhone 16", armazenamento: "256GB", valor_base: 4100 },
  { modelo: "iPhone 16", armazenamento: "512GB", valor_base: 4400 },
  { modelo: "iPhone 16 Plus", armazenamento: "128GB", valor_base: 4200 },
  { modelo: "iPhone 16 Plus", armazenamento: "256GB", valor_base: 4500 },
  { modelo: "iPhone 16 Plus", armazenamento: "512GB", valor_base: 4800 },
  { modelo: "iPhone 16 Pro", armazenamento: "128GB", valor_base: 4600 },
  { modelo: "iPhone 16 Pro", armazenamento: "256GB", valor_base: 4900 },
  { modelo: "iPhone 16 Pro", armazenamento: "512GB", valor_base: 5300 },
  { modelo: "iPhone 16 Pro", armazenamento: "1TB", valor_base: 5700 },
  { modelo: "iPhone 16 Pro Max", armazenamento: "256GB", valor_base: 5500 },
  { modelo: "iPhone 16 Pro Max", armazenamento: "512GB", valor_base: 5900 },
  { modelo: "iPhone 16 Pro Max", armazenamento: "1TB", valor_base: 6300 },
];

const DEFAULT_DESCONTOS = [
  { condicao: "Riscos na tela", detalhe: "Nenhum", desconto: 0 },
  { condicao: "Riscos na tela", detalhe: "1 risco", desconto: -100 },
  { condicao: "Riscos na tela", detalhe: "2 ou mais", desconto: -250 },
  { condicao: "Riscos laterais", detalhe: "Nenhum", desconto: 0 },
  { condicao: "Riscos laterais", detalhe: "1 risco", desconto: -100 },
  { condicao: "Riscos laterais", detalhe: "2 ou mais", desconto: -250 },
  { condicao: "Descascado/Amassado", detalhe: "Nao", desconto: 0 },
  { condicao: "Descascado/Amassado", detalhe: "Leve", desconto: -200 },
  { condicao: "Descascado/Amassado", detalhe: "Forte", desconto: -300 },
  { condicao: "Bateria", detalhe: "85% ou mais", desconto: 0 },
  { condicao: "Bateria", detalhe: "Abaixo de 85%", desconto: -200 },
  { condicao: "Garantia Apple", detalhe: "Sem garantia", desconto: 0 },
  { condicao: "Garantia Apple", detalhe: "Com garantia ativa", desconto: 300 },
];

const DEFAULT_EXCLUIDOS = [
  "iPhone 7", "iPhone 8", "iPhone X", "iPhone XS", "iPhone XR",
  "iPhone 12 Mini", "iPhone 13 Mini", "iPhone SE",
];

export default function UsadosPage() {
  const { password } = useAdmin();
  const [valores, setValores] = useState<ValorUsado[]>([]);
  const [descontos, setDescontos] = useState<DescontoCondicao[]>([]);
  const [excluidos, setExcluidos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [editingDesc, setEditingDesc] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [novoExcluido, setNovoExcluido] = useState("");
  const [tab, setTab] = useState<"valores" | "descontos" | "excluidos">("valores");
  const [importingSheets, setImportingSheets] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/usados", { headers: { "x-admin-password": password } });
      if (res.ok) {
        const json = await res.json();
        setValores(json.valores ?? []);
        setDescontos(json.descontos ?? []);
        setExcluidos((json.excluidos ?? []).map((e: { modelo: string }) => e.modelo));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const apiPost = async (body: Record<string, unknown>) => {
    return fetch("/api/admin/usados", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify(body),
    });
  };

  const handleSaveValor = async (v: ValorUsado) => {
    const key = `${v.modelo}|${v.armazenamento}`;
    const newVal = parseFloat((editing[key] ?? String(v.valor_base)).replace(",", "."));
    if (isNaN(newVal) || newVal < 0) return;
    setSaving(key);
    await apiPost({ action: "upsert_valor", modelo: v.modelo, armazenamento: v.armazenamento, valor_base: newVal });
    setValores((prev) => prev.map((r) => r.modelo === v.modelo && r.armazenamento === v.armazenamento ? { ...r, valor_base: newVal } : r));
    const e = { ...editing }; delete e[key]; setEditing(e);
    setSaving(null);
  };

  const handleSaveDesconto = async (d: DescontoCondicao) => {
    const key = `${d.condicao}|${d.detalhe}`;
    const newVal = parseFloat((editingDesc[key] ?? String(d.desconto)).replace(",", "."));
    if (isNaN(newVal)) return;
    setSaving(key);
    await apiPost({ action: "upsert_desconto", condicao: d.condicao, detalhe: d.detalhe, desconto: newVal });
    setDescontos((prev) => prev.map((r) => r.condicao === d.condicao && r.detalhe === d.detalhe ? { ...r, desconto: newVal } : r));
    const e = { ...editingDesc }; delete e[key]; setEditingDesc(e);
    setSaving(null);
  };

  const handleImportDefaults = async () => {
    setMsg("");
    setSaving("import");
    await apiPost({ action: "import_defaults", valores: DEFAULTS });
    // Import descontos
    for (const d of DEFAULT_DESCONTOS) {
      await apiPost({ action: "upsert_desconto", ...d });
    }
    // Import excluidos
    for (const m of DEFAULT_EXCLUIDOS) {
      await apiPost({ action: "add_excluido", modelo: m });
    }
    setMsg("Valores padrao importados!");
    setSaving(null);
    fetchData();
  };

  const inputCls = "w-24 px-2 py-1.5 rounded-lg border border-[#0071E3] bg-white text-[#1D1D1F] text-sm focus:outline-none";

  // Agrupar valores por modelo
  const grouped: Record<string, ValorUsado[]> = {};
  valores.forEach((v) => {
    if (!grouped[v.modelo]) grouped[v.modelo] = [];
    grouped[v.modelo].push(v);
  });

  // Agrupar descontos por condição
  const descGrouped: Record<string, DescontoCondicao[]> = {};
  descontos.forEach((d) => {
    if (!descGrouped[d.condicao]) descGrouped[d.condicao] = [];
    descGrouped[d.condicao].push(d);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold text-[#1D1D1F]">Avaliacao de Usados</h2>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              setImportingSheets(true);
              setMsg("");
              try {
                const res = await fetch("/api/admin/usados", {
                  method: "PUT",
                  headers: { "x-admin-password": password },
                });
                const json = await res.json();
                if (json.ok) {
                  setMsg(`Importado do Sheets: ${json.importedValores} valores, ${json.importedDescontos + json.importedDescontosModelo} descontos, ${json.importedExcluidos} excluidos`);
                  fetchData();
                } else {
                  setMsg("Erro: " + json.error);
                }
              } catch (err) {
                setMsg("Erro ao importar: " + String(err));
              }
              setImportingSheets(false);
            }}
            disabled={importingSheets}
            className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
          >
            {importingSheets ? "Importando..." : "Importar do Sheets"}
          </button>
          {valores.length === 0 && (
            <button
              onClick={handleImportDefaults}
              disabled={saving === "import"}
              className="px-4 py-2 rounded-xl bg-white border border-[#D2D2D7] text-[#86868B] text-sm font-semibold hover:border-[#E8740E] hover:text-[#E8740E] transition-colors disabled:opacity-50"
            >
              {saving === "import" ? "..." : "Usar valores padrao"}
            </button>
          )}
        </div>
      </div>

      {msg && <div className="px-4 py-3 rounded-xl text-sm bg-green-50 text-green-700">{msg}</div>}

      {/* Tabs */}
      <div className="flex gap-2">
        {(["valores", "descontos", "excluidos"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t ? "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"}`}>
            {t === "valores" ? `Valores Base (${valores.length})` : t === "descontos" ? `Descontos (${descontos.length})` : `Excluidos (${excluidos.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-[#86868B]">Carregando...</div>
      ) : tab === "valores" ? (
        /* VALORES BASE */
        <div className="space-y-4">
          {Object.keys(grouped).length === 0 ? (
            <div className="bg-white border border-[#D2D2D7] rounded-2xl p-12 text-center shadow-sm">
              <p className="text-[#86868B] mb-4">Nenhum valor cadastrado. Clique em "Importar valores padrao" para carregar.</p>
              <button onClick={handleImportDefaults} disabled={saving === "import"} className="px-6 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50">
                {saving === "import" ? "Importando..." : "Importar valores padrao"}
              </button>
            </div>
          ) : (
            Object.entries(grouped).map(([modelo, rows]) => (
              <div key={modelo} className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 bg-[#F5F5F7] border-b border-[#D2D2D7]">
                  <h3 className="font-semibold text-[#1D1D1F]">{modelo}</h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#F5F5F7]">
                      <th className="px-5 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">Armazenamento</th>
                      <th className="px-5 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">Valor Base</th>
                      <th className="px-5 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((v) => {
                      const key = `${v.modelo}|${v.armazenamento}`;
                      const isEditing = editing[key] !== undefined;
                      const isSaving = saving === key;
                      return (
                        <tr key={key} className="border-b border-[#F5F5F7] last:border-0 hover:bg-[#F5F5F7] transition-colors">
                          <td className="px-5 py-3 font-medium">{v.armazenamento}</td>
                          <td className="px-5 py-3">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[#86868B] text-sm">R$</span>
                                <input type="number" value={editing[key]} onChange={(e) => setEditing({ ...editing, [key]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && handleSaveValor(v)} className={inputCls} autoFocus />
                              </div>
                            ) : (
                              <span className="cursor-pointer hover:text-[#E8740E] transition-colors font-medium" onClick={() => setEditing({ ...editing, [key]: String(v.valor_base) })}>
                                {fmt(v.valor_base)}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {isEditing ? (
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => { const e = { ...editing }; delete e[key]; setEditing(e); }} className="px-3 py-1.5 rounded-lg text-xs text-[#86868B]">Cancelar</button>
                                <button onClick={() => handleSaveValor(v)} disabled={isSaving} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#F5A623] disabled:opacity-50">{isSaving ? "..." : "Salvar"}</button>
                              </div>
                            ) : (
                              <button onClick={() => setEditing({ ...editing, [key]: String(v.valor_base) })} className="px-3 py-1.5 rounded-lg text-xs text-[#86868B] hover:text-[#E8740E] border border-[#D2D2D7] hover:border-[#E8740E] transition-colors">Editar</button>
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
      ) : tab === "descontos" ? (
        /* DESCONTOS POR CONDIÇÃO */
        <div className="space-y-4">
          {Object.keys(descGrouped).length === 0 ? (
            <div className="bg-white border border-[#D2D2D7] rounded-2xl p-12 text-center shadow-sm">
              <p className="text-[#86868B]">Nenhum desconto cadastrado. Importe os valores padrao primeiro.</p>
            </div>
          ) : (
            Object.entries(descGrouped).map(([cond, rows]) => (
              <div key={cond} className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 bg-[#F5F5F7] border-b border-[#D2D2D7]">
                  <h3 className="font-semibold text-[#1D1D1F]">{cond}</h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#F5F5F7]">
                      <th className="px-5 py-2 text-left text-[#86868B] text-xs uppercase font-medium">Detalhe</th>
                      <th className="px-5 py-2 text-left text-[#86868B] text-xs uppercase font-medium">Desconto</th>
                      <th className="px-5 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => {
                      const key = `${d.condicao}|${d.detalhe}`;
                      const isEditing = editingDesc[key] !== undefined;
                      const isSaving = saving === key;
                      return (
                        <tr key={key} className="border-b border-[#F5F5F7] last:border-0 hover:bg-[#F5F5F7]">
                          <td className="px-5 py-3">{d.detalhe}</td>
                          <td className="px-5 py-3">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[#86868B] text-sm">R$</span>
                                <input type="number" value={editingDesc[key]} onChange={(e) => setEditingDesc({ ...editingDesc, [key]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && handleSaveDesconto(d)} className={inputCls} autoFocus />
                              </div>
                            ) : (
                              <span className={`cursor-pointer hover:text-[#E8740E] font-medium ${d.desconto < 0 ? "text-red-500" : d.desconto > 0 ? "text-green-600" : "text-[#86868B]"}`} onClick={() => setEditingDesc({ ...editingDesc, [key]: String(d.desconto) })}>
                                {d.desconto > 0 ? `+${fmt(d.desconto)}` : d.desconto < 0 ? `-${fmt(Math.abs(d.desconto))}` : "R$ 0"}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {isEditing ? (
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => { const e = { ...editingDesc }; delete e[key]; setEditingDesc(e); }} className="px-3 py-1.5 rounded-lg text-xs text-[#86868B]">Cancelar</button>
                                <button onClick={() => handleSaveDesconto(d)} disabled={isSaving} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white disabled:opacity-50">{isSaving ? "..." : "Salvar"}</button>
                              </div>
                            ) : (
                              <button onClick={() => setEditingDesc({ ...editingDesc, [key]: String(d.desconto) })} className="px-3 py-1.5 rounded-lg text-xs text-[#86868B] hover:text-[#E8740E] border border-[#D2D2D7] hover:border-[#E8740E] transition-colors">Editar</button>
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
      ) : (
        /* MODELOS EXCLUÍDOS */
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 shadow-sm space-y-4">
          <p className="text-sm text-[#86868B]">Modelos que NAO sao aceitos no trade-in:</p>

          <div className="flex gap-2 flex-wrap">
            {excluidos.map((m) => (
              <span key={m} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                {m}
                <button onClick={async () => {
                  await apiPost({ action: "remove_excluido", modelo: m });
                  setExcluidos((prev) => prev.filter((e) => e !== m));
                }} className="text-red-400 hover:text-red-600 text-xs font-bold">X</button>
              </span>
            ))}
          </div>

          <div className="flex gap-2 items-center">
            <input value={novoExcluido} onChange={(e) => setNovoExcluido(e.target.value)} placeholder="Ex: iPhone SE" className="px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-sm text-[#1D1D1F] focus:outline-none focus:border-[#E8740E]" onKeyDown={(e) => {
              if (e.key === "Enter" && novoExcluido.trim()) {
                apiPost({ action: "add_excluido", modelo: novoExcluido.trim() });
                setExcluidos((prev) => [...prev, novoExcluido.trim()]);
                setNovoExcluido("");
              }
            }} />
            <button onClick={async () => {
              if (!novoExcluido.trim()) return;
              await apiPost({ action: "add_excluido", modelo: novoExcluido.trim() });
              setExcluidos((prev) => [...prev, novoExcluido.trim()]);
              setNovoExcluido("");
            }} className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623]">Adicionar</button>
          </div>
        </div>
      )}
    </div>
  );
}
