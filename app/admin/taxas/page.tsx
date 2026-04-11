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

interface TaxaRepasseRow {
  id: string;
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

// Parcelas by banco
const ITAU_PARCELAS = [
  "debito", "1x", "2x", "3x", "4x", "5x", "6x",
  "7x", "8x", "9x", "10x", "11x", "12x",
  "13x", "14x", "15x", "16x", "17x", "18x",
  "19x", "20x", "21x",
];

const INFINITE_MP_PARCELAS = [
  "debito", "1x", "2x", "3x", "4x", "5x", "6x",
  "7x", "8x", "9x", "10x", "11x", "12x",
];

const REPASSE_PARCELAS_ORDER = [
  "1x", "2x", "3x", "4x", "5x", "6x",
  "7x", "8x", "9x", "10x", "11x", "12x",
  "13x", "14x", "15x", "16x", "17x", "18x",
  "19x", "20x", "21x",
];

// Elo/Amex on Itau — suporta até 21x
const ELO_AMEX_MAX = 21;

function getParcelasForBanco(banco: string): string[] {
  if (banco === "ITAU") return ITAU_PARCELAS;
  return INFINITE_MP_PARCELAS;
}

function sortRepasseParcelas(a: string, b: string) {
  const ia = REPASSE_PARCELAS_ORDER.indexOf(a);
  const ib = REPASSE_PARCELAS_ORDER.indexOf(b);
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

// Check if a parcelas value is 13x-21x (Itau only range)
function isItauOnly(parcelas: string): boolean {
  const match = parcelas.match(/^(\d+)x$/);
  if (!match) return false;
  const num = parseInt(match[1], 10);
  return num >= 13 && num <= 21;
}

// Check if parcelas num exceeds Elo/Amex max
function isAboveEloAmexMax(parcelas: string): boolean {
  const match = parcelas.match(/^(\d+)x$/);
  if (!match) return false;
  const num = parseInt(match[1], 10);
  return num > ELO_AMEX_MAX;
}

type TopTab = "descontadas" | "embutidas";

export default function TaxasPage() {
  const { apiHeaders, darkMode } = useAdmin();
  const [topTab, setTopTab] = useState<TopTab>("descontadas");

  // Machine taxas state
  const [data, setData] = useState<GroupedData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<string>("INFINITE");
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saveMsg, setSaveMsg] = useState("");

  // Repasse taxas state
  const [repasseData, setRepasseData] = useState<TaxaRepasseRow[]>([]);
  const [repasseLoading, setRepasseLoading] = useState(true);
  const [repasseSaving, setRepasseSaving] = useState(false);
  const [repasseEdits, setRepasseEdits] = useState<Record<string, number>>({});
  const [repasseSaveMsg, setRepasseSaveMsg] = useState("");

  // Fetch machine taxas
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

  // Fetch repasse taxas
  const fetchRepasseData = useCallback(async () => {
    setRepasseLoading(true);
    try {
      const res = await fetch("/api/admin/taxas?type=repasse", { headers: apiHeaders() });
      const json = await res.json();
      if (json.data) setRepasseData(json.data);
    } catch (err) {
      console.error("Erro ao carregar taxas de repasse:", err);
    } finally {
      setRepasseLoading(false);
    }
  }, [apiHeaders]);

  useEffect(() => {
    fetchData();
    fetchRepasseData();
  }, [fetchData, fetchRepasseData]);

  // ========== Machine taxas logic ==========

  function editKey(banco: string, bandeira: string, parcelas: string) {
    return `${banco}|${bandeira}|${parcelas}`;
  }

  function getValue(row: TaxaRow): number {
    const key = editKey(row.banco, row.bandeira, row.parcelas);
    return edits[key] !== undefined ? edits[key] : row.taxa_pct;
  }

  function handleChange(row: TaxaRow, val: string) {
    const key = editKey(row.banco, row.bandeira, row.parcelas);
    const num = parseFloat(val);
    if (isNaN(num)) {
      setEdits((prev) => ({ ...prev, [key]: 0 }));
    } else {
      setEdits((prev) => ({ ...prev, [key]: num }));
    }
  }

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

  function getBandeiraGroups(banco: string): { label: string; bandeiras: string[] }[] {
    if (banco === "MERCADO_PAGO") {
      return [{ label: "Todas as bandeiras", bandeiras: ["ALL"] }];
    }
    return [
      { label: "Visa / Master", bandeiras: ["VISA", "MASTERCARD"] },
      { label: "Elo / Amex", bandeiras: ["ELO", "AMEX"] },
    ];
  }

  function findRow(banco: string, bandeira: string, parcelas: string): TaxaRow | undefined {
    return (data[banco] ?? []).find(
      (r) => r.bandeira === bandeira && r.parcelas === parcelas
    );
  }

  function getLatestUpdate(banco: string, bandeiras: string[]): { date: string; by: string } | null {
    const rows = (data[banco] ?? []).filter((r) => bandeiras.includes(r.bandeira));
    if (rows.length === 0) return null;
    const latest = rows.reduce((a, b) =>
      new Date(a.updated_at) > new Date(b.updated_at) ? a : b
    );
    return { date: formatDate(latest.updated_at), by: latest.updated_by };
  }

  // ========== Repasse taxas logic ==========

  function getRepasseValue(row: TaxaRepasseRow): number {
    return repasseEdits[row.parcelas] !== undefined ? repasseEdits[row.parcelas] : row.taxa_pct;
  }

  function handleRepasseChange(parcelas: string, val: string) {
    const num = parseFloat(val);
    if (isNaN(num)) {
      setRepasseEdits((prev) => ({ ...prev, [parcelas]: 0 }));
    } else {
      setRepasseEdits((prev) => ({ ...prev, [parcelas]: num }));
    }
  }

  function hasRepasseChanges(): boolean {
    for (const row of repasseData) {
      if (repasseEdits[row.parcelas] !== undefined && repasseEdits[row.parcelas] !== row.taxa_pct) return true;
    }
    return false;
  }

  async function handleRepasseSave() {
    const updates: { parcelas: string; taxa_pct: number }[] = [];

    for (const row of repasseData) {
      if (repasseEdits[row.parcelas] !== undefined && repasseEdits[row.parcelas] !== row.taxa_pct) {
        updates.push({
          parcelas: row.parcelas,
          taxa_pct: repasseEdits[row.parcelas],
        });
      }
    }

    if (updates.length === 0) return;

    setRepasseSaving(true);
    setRepasseSaveMsg("");
    try {
      const res = await fetch("/api/admin/taxas", {
        method: "PUT",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ type: "repasse", updates }),
      });
      const json = await res.json();
      if (json.ok) {
        setRepasseSaveMsg(`${json.updated} taxa(s) atualizada(s)`);
        setRepasseEdits({});
        await fetchRepasseData();
        setTimeout(() => setRepasseSaveMsg(""), 3000);
      } else {
        setRepasseSaveMsg("Erro: " + (json.error || "falha ao salvar"));
      }
    } catch {
      setRepasseSaveMsg("Erro de conexao");
    } finally {
      setRepasseSaving(false);
    }
  }

  function getRepasseLatestUpdate(): { date: string; by: string } | null {
    if (repasseData.length === 0) return null;
    const latest = repasseData.reduce((a, b) =>
      new Date(a.updated_at) > new Date(b.updated_at) ? a : b
    );
    return { date: formatDate(latest.updated_at), by: latest.updated_by };
  }

  const sortedRepasseData = [...repasseData].sort((a, b) => sortRepasseParcelas(a.parcelas, b.parcelas));

  // Machine tab computed values
  const bandeiraGroups = getBandeiraGroups(tab);
  const parcelas = getParcelasForBanco(tab);

  // Dark mode helper colors
  const dm = darkMode;
  const bgPage = dm ? "#0A0A0A" : "#F5F5F7";
  const bgCard = dm ? "#1C1C1E" : "#FFFFFF";
  const bgCardAlt = dm ? "#1A1A1A" : "#FAFAFA";
  const bgSegmented = dm ? "#2C2C2E" : "#E8E8ED";
  const bgSegmentedSub = dm ? "#2C2C2E" : "#F5F5F7";
  const bgSegmentedActive = dm ? "#3A3A3C" : "#FFFFFF";
  const textPrimary = dm ? "#F5F5F7" : "#1D1D1F";
  const textSecondary = dm ? "#98989D" : "#86868B";
  const textMuted = dm ? "#6E6E73" : "#6E6E73";
  const textDisabled = dm ? "#48484A" : "#C7C7CC";
  const borderMain = dm ? "#3A3A3C" : "#E8E8ED";
  const borderRow = dm ? "#2C2C2E" : "#F0F0F0";
  const bgInput = dm ? "#2C2C2E" : "#FFFFFF";
  const bgInputEdited = dm ? "#3D2A0E" : "#FFF8F0";
  const bgDisabledBtn = dm ? "#2C2C2E" : "#F5F5F7";
  const bgTableHead = dm ? "#1A1A1A" : "#FAFAFA";

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: textPrimary }}>Gerenciamento de Taxas</h1>
        <p className="text-sm mt-1" style={{ color: textSecondary }}>
          Gerencie as taxas das maquininhas e taxas de repasse
        </p>
      </div>

      {/* Top-level tabs: Taxas Descontadas vs Taxas Embutidas */}
      <div
        className="flex gap-1 rounded-xl p-1 mb-6"
        style={{ background: bgSegmented }}
      >
        <button
          onClick={() => setTopTab("descontadas")}
          className="flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all"
          style={{
            background: topTab === "descontadas" ? bgSegmentedActive : "transparent",
            color: topTab === "descontadas" ? textPrimary : textMuted,
            boxShadow: topTab === "descontadas" ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
          }}
        >
          Taxas Descontadas
        </button>
        <button
          onClick={() => setTopTab("embutidas")}
          className="flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all"
          style={{
            background: topTab === "embutidas" ? bgSegmentedActive : "transparent",
            color: topTab === "embutidas" ? textPrimary : textMuted,
            boxShadow: topTab === "embutidas" ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
          }}
        >
          Taxas Embutidas
        </button>
      </div>

      {/* ========== TAXAS DESCONTADAS (MACHINE) TAB ========== */}
      {topTab === "descontadas" && (
        <>
          {/* Banco sub-tabs */}
          <div
            className="flex gap-1 rounded-xl p-1 mb-6"
            style={{ background: bgSegmentedSub }}
          >
            {BANCO_TABS.map((b) => (
              <button
                key={b}
                onClick={() => setTab(b)}
                className="flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: tab === b ? bgSegmentedActive : "transparent",
                  color: tab === b ? "#E8740E" : textMuted,
                  boxShadow: tab === b ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                {BANCO_LABELS[b]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12" style={{ color: textSecondary }}>Carregando taxas...</div>
          ) : parcelas.length === 0 ? (
            <div className="text-center py-12" style={{ color: textSecondary }}>
              Nenhuma taxa encontrada para {BANCO_LABELS[tab]}.
              <br />
              <span className="text-xs">Execute a migration SQL para popular os dados.</span>
            </div>
          ) : (
            <>
              {/* Table */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: bgCard, border: `1px solid ${borderMain}` }}
              >
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${borderMain}`, background: bgTableHead }}>
                        <th
                          className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider"
                          style={{ color: textSecondary }}
                        >
                          Parcelas
                        </th>
                        {bandeiraGroups.map((g) => (
                          <th
                            key={g.label}
                            className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wider"
                            style={{ color: textSecondary }}
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
                          style={{
                            borderBottom: `1px solid ${borderRow}`,
                            background: idx % 2 === 0 ? bgCard : bgCardAlt,
                          }}
                        >
                          <td className="py-2.5 px-4 text-sm font-medium" style={{ color: textPrimary }}>
                            {formatParcelas(p)}
                          </td>
                          {bandeiraGroups.map((g) => {
                            // Check if Elo/Amex and above max
                            const isEloAmex = g.bandeiras.includes("ELO") || g.bandeiras.includes("AMEX");
                            if (isEloAmex && tab === "ITAU" && isAboveEloAmexMax(p)) {
                              return (
                                <td key={g.label} className="py-2.5 px-4 text-center text-sm" style={{ color: textDisabled }}>
                                  --
                                </td>
                              );
                            }
                            const row = findRow(tab, g.bandeiras[0], p);
                            if (!row) {
                              return (
                                <td key={g.label} className="py-2.5 px-4 text-center text-sm" style={{ color: textDisabled }}>
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
                                      for (const b of g.bandeiras) {
                                        const r = findRow(tab, b, p);
                                        if (r) handleChange(r, e.target.value);
                                      }
                                    }}
                                    className="w-20 text-center text-sm py-1.5 px-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#E8740E]/30 focus:border-[#E8740E]"
                                    style={{
                                      border: `1px solid ${isEdited ? "#E8740E" : borderMain}`,
                                      background: isEdited ? bgInputEdited : bgInput,
                                      color: isEdited ? "#E8740E" : textPrimary,
                                      fontWeight: isEdited ? 600 : 400,
                                    }}
                                  />
                                  <span className="text-xs" style={{ color: textSecondary }}>%</span>
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
                <div className="md:hidden">
                  {parcelas.map((p, idx) => (
                    <div
                      key={p}
                      className="px-4 py-3"
                      style={{
                        borderBottom: idx < parcelas.length - 1 ? `1px solid ${borderRow}` : "none",
                      }}
                    >
                      <div className="text-sm font-semibold mb-2" style={{ color: textPrimary }}>
                        {formatParcelas(p)}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {bandeiraGroups.map((g) => {
                          const isEloAmex = g.bandeiras.includes("ELO") || g.bandeiras.includes("AMEX");
                          if (isEloAmex && tab === "ITAU" && isAboveEloAmexMax(p)) {
                            return (
                              <div key={g.label} className="flex-1 min-w-[120px]">
                                <label className="text-xs mb-1 block" style={{ color: textSecondary }}>{g.label}</label>
                                <div className="text-sm py-2 px-3" style={{ color: textDisabled }}>--</div>
                              </div>
                            );
                          }
                          const row = findRow(tab, g.bandeiras[0], p);
                          if (!row) return null;
                          const key = editKey(row.banco, row.bandeira, row.parcelas);
                          const isEdited = edits[key] !== undefined && edits[key] !== row.taxa_pct;
                          return (
                            <div key={g.label} className="flex-1 min-w-[120px]">
                              <label className="text-xs mb-1 block" style={{ color: textSecondary }}>{g.label}</label>
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
                                  className="w-full text-sm py-2 px-3 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#E8740E]/30 focus:border-[#E8740E]"
                                  style={{
                                    border: `1px solid ${isEdited ? "#E8740E" : borderMain}`,
                                    background: isEdited ? bgInputEdited : bgInput,
                                    color: isEdited ? "#E8740E" : textPrimary,
                                    fontWeight: isEdited ? 600 : 400,
                                  }}
                                />
                                <span className="text-xs" style={{ color: textSecondary }}>%</span>
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
                    <p key={g.label} className="text-xs" style={{ color: textSecondary }}>
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
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: hasChanges() ? "#E8740E" : bgDisabledBtn,
                    color: hasChanges() ? "#FFFFFF" : textDisabled,
                    cursor: hasChanges() ? "pointer" : "not-allowed",
                    boxShadow: hasChanges() ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
                  }}
                >
                  {saving ? "Salvando..." : "Salvar alteracoes"}
                </button>
                {hasChanges() && (
                  <button
                    onClick={() => setEdits({})}
                    className="text-sm transition-colors"
                    style={{ color: textSecondary }}
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
        </>
      )}

      {/* ========== TAXAS EMBUTIDAS (REPASSE) TAB ========== */}
      {topTab === "embutidas" && (
        <>
          {repasseLoading ? (
            <div className="text-center py-12" style={{ color: textSecondary }}>Carregando taxas de repasse...</div>
          ) : sortedRepasseData.length === 0 ? (
            <div className="text-center py-12" style={{ color: textSecondary }}>
              Nenhuma taxa de repasse encontrada.
              <br />
              <span className="text-xs">Execute a migration SQL para popular a tabela taxas_repasse.</span>
            </div>
          ) : (
            <>
              {/* Table */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: bgCard, border: `1px solid ${borderMain}` }}
              >
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${borderMain}`, background: bgTableHead }}>
                        <th
                          className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider"
                          style={{ color: textSecondary }}
                        >
                          Parcelas
                        </th>
                        <th
                          className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wider"
                          style={{ color: textSecondary }}
                        >
                          Taxa %
                        </th>
                        <th
                          className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider"
                          style={{ color: textSecondary }}
                        >
                          Maquininha
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRepasseData.map((row, idx) => {
                        const itauOnly = isItauOnly(row.parcelas);
                        const isEdited = repasseEdits[row.parcelas] !== undefined && repasseEdits[row.parcelas] !== row.taxa_pct;
                        return (
                          <tr
                            key={row.parcelas}
                            style={{
                              borderBottom: `1px solid ${borderRow}`,
                              background: idx % 2 === 0 ? bgCard : bgCardAlt,
                            }}
                          >
                            <td className="py-2.5 px-4 text-sm font-medium" style={{ color: textPrimary }}>
                              {row.parcelas.toUpperCase()}
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              <div className="inline-flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="100"
                                  value={getRepasseValue(row)}
                                  onChange={(e) => handleRepasseChange(row.parcelas, e.target.value)}
                                  className="w-20 text-center text-sm py-1.5 px-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#E8740E]/30 focus:border-[#E8740E]"
                                  style={{
                                    border: `1px solid ${isEdited ? "#E8740E" : borderMain}`,
                                    background: isEdited ? bgInputEdited : bgInput,
                                    color: isEdited ? "#E8740E" : textPrimary,
                                    fontWeight: isEdited ? 600 : 400,
                                  }}
                                />
                                <span className="text-xs" style={{ color: textSecondary }}>%</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-sm">
                              {itauOnly ? (
                                <span className="inline-flex items-center gap-1.5 text-[#E8740E] font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#E8740E]"></span>
                                  Apenas Itau
                                </span>
                              ) : (
                                <span style={{ color: textSecondary }}>
                                  Infinite, Itau ou Mercado Pago
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden">
                  {sortedRepasseData.map((row, idx) => {
                    const itauOnly = isItauOnly(row.parcelas);
                    const isEdited = repasseEdits[row.parcelas] !== undefined && repasseEdits[row.parcelas] !== row.taxa_pct;
                    return (
                      <div
                        key={row.parcelas}
                        className="px-4 py-3"
                        style={{
                          borderBottom: idx < sortedRepasseData.length - 1 ? `1px solid ${borderRow}` : "none",
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold" style={{ color: textPrimary }}>
                            {row.parcelas.toUpperCase()}
                          </span>
                          {itauOnly ? (
                            <span
                              className="text-xs font-medium px-2 py-0.5 rounded-full"
                              style={{ color: "#E8740E", background: bgInputEdited }}
                            >
                              Apenas Itau
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: textSecondary }}>
                              Infinite, Itau ou MP
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={getRepasseValue(row)}
                            onChange={(e) => handleRepasseChange(row.parcelas, e.target.value)}
                            className="w-full text-sm py-2 px-3 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#E8740E]/30 focus:border-[#E8740E]"
                            style={{
                              border: `1px solid ${isEdited ? "#E8740E" : borderMain}`,
                              background: isEdited ? bgInputEdited : bgInput,
                              color: isEdited ? "#E8740E" : textPrimary,
                              fontWeight: isEdited ? 600 : 400,
                            }}
                          />
                          <span className="text-xs" style={{ color: textSecondary }}>%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Update info */}
              {(() => {
                const info = getRepasseLatestUpdate();
                if (!info) return null;
                return (
                  <p className="mt-4 text-xs" style={{ color: textSecondary }}>
                    Ultima atualizacao {info.date} por {info.by}
                  </p>
                );
              })()}

              {/* Save bar */}
              <div className="mt-6 flex items-center gap-4">
                <button
                  onClick={handleRepasseSave}
                  disabled={repasseSaving || !hasRepasseChanges()}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: hasRepasseChanges() ? "#E8740E" : bgDisabledBtn,
                    color: hasRepasseChanges() ? "#FFFFFF" : textDisabled,
                    cursor: hasRepasseChanges() ? "pointer" : "not-allowed",
                    boxShadow: hasRepasseChanges() ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
                  }}
                >
                  {repasseSaving ? "Salvando..." : "Salvar alteracoes"}
                </button>
                {hasRepasseChanges() && (
                  <button
                    onClick={() => setRepasseEdits({})}
                    className="text-sm transition-colors"
                    style={{ color: textSecondary }}
                  >
                    Descartar
                  </button>
                )}
                {repasseSaveMsg && (
                  <span className={`text-sm font-medium ${repasseSaveMsg.startsWith("Erro") ? "text-red-500" : "text-green-600"}`}>
                    {repasseSaveMsg}
                  </span>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
