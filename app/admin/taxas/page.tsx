"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

interface TaxaRow {
  id: string;
  banco: string;
  bandeira: string;
  parcelas: string;
  taxa_pct: number;
  updated_at: string;
  updated_by: string;
}

type GroupedData = Record<string, TaxaRow[]>;

const BANCO_LABELS: Record<string, string> = {
  INFINITE: "Infinite",
  ITAU: "Itau",
  MERCADO_PAGO: "Mercado Pago",
};

const BANCO_TABS = ["INFINITE", "ITAU", "MERCADO_PAGO"] as const;

// Order for parcelas display
const PARCELAS_ORDER = [
  "pix", "debito", "1x", "2x", "3x", "4x", "5x", "6x",
  "7x", "8x", "9x", "10x", "11x", "12x", "18x", "21x",
];

function sortParcelas(a: string, b: string) {
  const ia = PARCELAS_ORDER.indexOf(a);
  const ib = PARCELAS_ORDER.indexOf(b);
  if (ia === -1 && ib === -1) return a.localeCompare(b);
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}

function formatParcelas(p: string): string {
  if (p === "pix") return "PIX";
  if (p === "debito") return "Debito";
  return p.toUpperCase();
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
    " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function TaxasPage() {
  const { apiHeaders } = useAdmin();
  const [data, setData] = useState<GroupedData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<string>("INFINITE");
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saveMsg, setSaveMsg] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/taxas", { headers: apiHeaders() });
      const json = await res.json();
      if (json.data) setData(json.data);
    } catch (err) {
      console.error("Erro ao carregar taxas:", err);
    } finally {
      setLoading(false);
    }
  }, [apiHeaders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build edit key
  function editKey(banco: string, bandeira: string, parcelas: string) {
    return `${banco}|${bandeira}|${parcelas}`;
  }

  // Get current value (edited or original)
  function getValue(row: TaxaRow): number {
    const key = editKey(row.banco, row.bandeira, row.parcelas);
    return edits[key] !== undefined ? edits[key] : row.taxa_pct;
  }

  function handleChange(row: TaxaRow, val: string) {
    const key = editKey(row.banco, row.bandeira, row.parcelas);
    const num = parseFloat(val);
    if (isNaN(num)) {
      // Allow clearing
      setEdits((prev) => ({ ...prev, [key]: 0 }));
    } else {
      setEdits((prev) => ({ ...prev, [key]: num }));
    }
  }

  // Check if there are unsaved changes for current tab
  function hasChanges(): boolean {
    const rows = data[tab] ?? [];
    for (const row of rows) {
      const key = editKey(row.banco, row.bandeira, row.parcelas);
      if (edits[key] !== undefined && edits[key] !== row.taxa_pct) return true;
    }
    return false;
  }

  async function handleSave() {
    const rows = data[tab] ?? [];
    const updates: { banco: string; bandeira: string; parcelas: string; taxa_pct: number }[] = [];

    for (const row of rows) {
      const key = editKey(row.banco, row.bandeira, row.parcelas);
      if (edits[key] !== undefined && edits[key] !== row.taxa_pct) {
        updates.push({
          banco: row.banco,
          bandeira: row.bandeira,
          parcelas: row.parcelas,
          taxa_pct: edits[key],
        });
      }
    }

    if (updates.length === 0) return;

    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/admin/taxas", {
        method: "PUT",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const json = await res.json();
      if (json.ok) {
        setSaveMsg(`${json.updated} taxa(s) atualizada(s)`);
        setEdits({});
        await fetchData();
        setTimeout(() => setSaveMsg(""), 3000);
      } else {
        setSaveMsg("Erro: " + (json.error || "falha ao salvar"));
      }
    } catch {
      setSaveMsg("Erro de conexao");
    } finally {
      setSaving(false);
    }
  }

  // For ITAU and INFINITE: group by "Visa/Master" and "Elo/Amex"
  // For MERCADO_PAGO: single "Todas" column
  function getBandeiraGroups(banco: string): { label: string; bandeiras: string[] }[] {
    if (banco === "MERCADO_PAGO") {
      return [{ label: "Todas as bandeiras", bandeiras: ["ALL"] }];
    }
    return [
      { label: "Visa / Master", bandeiras: ["VISA", "MASTERCARD"] },
      { label: "Elo / Amex", bandeiras: ["ELO", "AMEX"] },
    ];
  }

  // Get all unique parcelas for a banco
  function getParcelasForBanco(banco: string): string[] {
    const rows = data[banco] ?? [];
    const set = new Set<string>();
    for (const r of rows) set.add(r.parcelas);
    return Array.from(set).sort(sortParcelas);
  }

  // Find row for a given banco + bandeira + parcelas
  function findRow(banco: string, bandeira: string, parcelas: string): TaxaRow | undefined {
    return (data[banco] ?? []).find(
      (r) => r.bandeira === bandeira && r.parcelas === parcelas
    );
  }

  // Get latest update info for a group
  function getLatestUpdate(banco: string, bandeiras: string[]): { date: string; by: string } | null {
    const rows = (data[banco] ?? []).filter((r) => bandeiras.includes(r.bandeira));
    if (rows.length === 0) return null;
    const latest = rows.reduce((a, b) =>
      new Date(a.updated_at) > new Date(b.updated_at) ? a : b
    );
    return { date: formatDate(latest.updated_at), by: latest.updated_by };
  }

  const bandeiraGroups = getBandeiraGroups(tab);
  const parcelas = getParcelasForBanco(tab);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1D1D1F]">Taxas das Maquinas</h1>
        <p className="text-sm text-[#86868B] mt-1">
          Gerencie as taxas de cada maquininha por bandeira e parcela
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#F5F5F7] rounded-xl p-1 mb-6">
        {BANCO_TABS.map((b) => (
          <button
            key={b}
            onClick={() => setTab(b)}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
              tab === b
                ? "bg-white text-[#E8740E] shadow-sm"
                : "text-[#6E6E73] hover:text-[#1D1D1F]"
            }`}
          >
            {BANCO_LABELS[b]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#86868B]">Carregando taxas...</div>
      ) : parcelas.length === 0 ? (
        <div className="text-center py-12 text-[#86868B]">
          Nenhuma taxa encontrada para {BANCO_LABELS[tab]}.
          <br />
          <span className="text-xs">Execute a migration SQL para popular os dados.</span>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-white rounded-2xl border border-[#E8E8ED] overflow-hidden shadow-sm">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#E8E8ED] bg-[#FAFAFA]">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-[#86868B] uppercase tracking-wider">
                      Parcelas
                    </th>
                    {bandeiraGroups.map((g) => (
                      <th
                        key={g.label}
                        className="text-center py-3 px-4 text-xs font-semibold text-[#86868B] uppercase tracking-wider"
                      >
                        {g.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parcelas.map((p, idx) => (
                    <tr
                      key={p}
                      className={`border-b border-[#F0F0F0] ${idx % 2 === 0 ? "bg-white" : "bg-[#FAFAFA]/50"}`}
                    >
                      <td className="py-2.5 px-4 text-sm font-medium text-[#1D1D1F]">
                        {formatParcelas(p)}
                      </td>
                      {bandeiraGroups.map((g) => {
                        // Use first bandeira in group as representative
                        const row = findRow(tab, g.bandeiras[0], p);
                        if (!row) {
                          return (
                            <td key={g.label} className="py-2.5 px-4 text-center text-[#C7C7CC] text-sm">
                              --
                            </td>
                          );
                        }
                        const key = editKey(row.banco, row.bandeira, row.parcelas);
                        const isEdited = edits[key] !== undefined && edits[key] !== row.taxa_pct;
                        return (
                          <td key={g.label} className="py-2.5 px-4 text-center">
                            <div className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={getValue(row)}
                                onChange={(e) => {
                                  // Update all bandeiras in the group simultaneously
                                  for (const b of g.bandeiras) {
                                    const r = findRow(tab, b, p);
                                    if (r) handleChange(r, e.target.value);
                                  }
                                }}
                                className={`w-20 text-center text-sm py-1.5 px-2 rounded-lg border transition-colors
                                  ${isEdited
                                    ? "border-[#E8740E] bg-[#FFF8F0] text-[#E8740E] font-semibold"
                                    : "border-[#E8E8ED] bg-white text-[#1D1D1F]"
                                  }
                                  focus:outline-none focus:ring-2 focus:ring-[#E8740E]/30 focus:border-[#E8740E]`}
                              />
                              <span className="text-xs text-[#86868B]">%</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-[#F0F0F0]">
              {parcelas.map((p) => (
                <div key={p} className="px-4 py-3">
                  <div className="text-sm font-semibold text-[#1D1D1F] mb-2">
                    {formatParcelas(p)}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {bandeiraGroups.map((g) => {
                      const row = findRow(tab, g.bandeiras[0], p);
                      if (!row) return null;
                      const key = editKey(row.banco, row.bandeira, row.parcelas);
                      const isEdited = edits[key] !== undefined && edits[key] !== row.taxa_pct;
                      return (
                        <div key={g.label} className="flex-1 min-w-[120px]">
                          <label className="text-xs text-[#86868B] mb-1 block">{g.label}</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={getValue(row)}
                              onChange={(e) => {
                                for (const b of g.bandeiras) {
                                  const r = findRow(tab, b, p);
                                  if (r) handleChange(r, e.target.value);
                                }
                              }}
                              className={`w-full text-sm py-2 px-3 rounded-lg border transition-colors
                                ${isEdited
                                  ? "border-[#E8740E] bg-[#FFF8F0] text-[#E8740E] font-semibold"
                                  : "border-[#E8E8ED] bg-white text-[#1D1D1F]"
                                }
                                focus:outline-none focus:ring-2 focus:ring-[#E8740E]/30 focus:border-[#E8740E]`}
                            />
                            <span className="text-xs text-[#86868B]">%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Update info */}
          <div className="mt-4 space-y-1">
            {bandeiraGroups.map((g) => {
              const info = getLatestUpdate(tab, g.bandeiras);
              if (!info) return null;
              return (
                <p key={g.label} className="text-xs text-[#86868B]">
                  {g.label}: ultima atualizacao {info.date} por {info.by}
                </p>
              );
            })}
          </div>

          {/* Save bar */}
          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges()}
              className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                hasChanges()
                  ? "bg-[#E8740E] text-white hover:bg-[#D06A0D] shadow-sm"
                  : "bg-[#F5F5F7] text-[#C7C7CC] cursor-not-allowed"
              }`}
            >
              {saving ? "Salvando..." : "Salvar alteracoes"}
            </button>
            {hasChanges() && (
              <button
                onClick={() => setEdits({})}
                className="text-sm text-[#86868B] hover:text-[#1D1D1F] transition-colors"
              >
                Descartar
              </button>
            )}
            {saveMsg && (
              <span className={`text-sm font-medium ${saveMsg.startsWith("Erro") ? "text-red-500" : "text-green-600"}`}>
                {saveMsg}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
