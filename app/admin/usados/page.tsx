"use client";
import { hojeBR } from "@/lib/date-utils";

import { useEffect, useState, useCallback } from "react";
import { useAutoRefetch } from "@/lib/useAutoRefetch";
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

const DEVICE_CATS = [
  { key: "iphone", label: "iPhones", prefix: "iPhone" },
  { key: "ipad", label: "iPads", prefix: "iPad" },
  { key: "macbook", label: "MacBooks", prefix: "Mac" },
  { key: "watch", label: "Apple Watch", prefix: "Apple Watch" },
];

interface CatConfig {
  categoria: string;
  modo: "automatico" | "manual";
  ativo: boolean;
}

interface GarantiaRow {
  id: string;
  modelo: string;
  armazenamento: string;
  valor_garantia: number;
}

export function UsadosContent() {
  const { password, user } = useAdmin();
  const [valores, setValores] = useState<ValorUsado[]>([]);
  const [descontos, setDescontos] = useState<DescontoCondicao[]>([]);
  const [excluidos, setExcluidos] = useState<string[]>([]);
  const [catConfigs, setCatConfigs] = useState<CatConfig[]>([]);
  const [garantias, setGarantias] = useState<GarantiaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [editingDesc, setEditingDesc] = useState<Record<string, string>>({});
  const [editingGarantia, setEditingGarantia] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [novoExcluido, setNovoExcluido] = useState("");
  const [novoBateria, setNovoBateria] = useState<{ modelo: string; threshold: string; desconto: string } | null>(null);
  const [novoGarantiaModelo, setNovoGarantiaModelo] = useState<{ modelo: string; detalhe: string; valor: string } | null>(null);
  const [showAddModelo, setShowAddModelo] = useState(false);
  const [novoModelo, setNovoModelo] = useState({ modelo: "", armazenamento: "", valor_base: "" });
  const [tab, setTab] = useState<"valores" | "descontos" | "excluidos">("valores");
  const [catFilter, setCatFilter] = useState("iphone");
  const [copyFrom, setCopyFrom] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/usados", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } });
      if (res.ok) {
        const json = await res.json();
        setValores(json.valores ?? []);
        setDescontos(json.descontos ?? []);
        setExcluidos((json.excluidos ?? []).map((e: { modelo: string }) => e.modelo));
        setCatConfigs(json.catConfig ?? []);
        setGarantias(json.garantias ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefetch(fetchData);

  const apiPost = async (body: Record<string, unknown>) => {
    return fetch("/api/admin/usados", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
      body: JSON.stringify(body),
    });
  };

  const handleSaveValor = async (v: ValorUsado) => {
    const key = `${v.modelo}|${v.armazenamento}`;
    const raw = (editing[key] ?? String(v.valor_base)).replace(/\./g, "").replace(",", ".");
    const newVal = parseFloat(raw);
    if (isNaN(newVal) || newVal < 0) return;
    setSaving(key);
    await apiPost({ action: "upsert_valor", modelo: v.modelo, armazenamento: v.armazenamento, valor_base: newVal });
    setValores((prev) => prev.map((r) => r.modelo === v.modelo && r.armazenamento === v.armazenamento ? { ...r, valor_base: newVal } : r));
    const e = { ...editing }; delete e[key]; setEditing(e);
    setSaving(null);
  };

  const handleSaveDesconto = async (d: DescontoCondicao) => {
    const key = `${d.condicao}|${d.detalhe}`;
    const raw = (editingDesc[key] ?? String(d.desconto)).replace(/\./g, "").replace(",", ".");
    const newVal = parseFloat(raw);
    if (isNaN(newVal)) return;
    setSaving(key);
    await apiPost({ action: "upsert_desconto", condicao: d.condicao, detalhe: d.detalhe, desconto: newVal });
    setDescontos((prev) => prev.map((r) => r.condicao === d.condicao && r.detalhe === d.detalhe ? { ...r, desconto: newVal } : r));
    const e = { ...editingDesc }; delete e[key]; setEditingDesc(e);
    setSaving(null);
  };

  const handleAddBateriaTier = async () => {
    if (!novoBateria) return;
    const threshold = parseInt(novoBateria.threshold);
    const desconto = parseFloat(novoBateria.desconto);
    if (isNaN(threshold) || threshold < 1 || threshold > 100 || isNaN(desconto)) { setMsg("Preencha threshold (1-100) e valor do desconto"); return; }
    const condicao = novoBateria.modelo ? `${novoBateria.modelo} - Bateria` : "Bateria";
    const detalhe = `Abaixo de ${threshold}%`;
    setSaving("bateria");
    await apiPost({ action: "upsert_desconto", condicao, detalhe, desconto });
    setDescontos((prev) => {
      const exists = prev.findIndex((d) => d.condicao === condicao && d.detalhe === detalhe);
      if (exists >= 0) {
        const nv = [...prev];
        nv[exists] = { ...nv[exists], desconto };
        return nv;
      }
      return [...prev, { id: crypto.randomUUID(), condicao, detalhe, desconto, updated_at: new Date().toISOString() }];
    });
    setNovoBateria(null);
    setSaving(null);
    setMsg(`Nivel de bateria "Abaixo de ${threshold}%" adicionado!`);
  };

  const handleAddGarantiaModelo = async () => {
    if (!novoGarantiaModelo) return;
    const { modelo, detalhe, valor } = novoGarantiaModelo;
    if (!detalhe.trim() || !valor.trim()) { setMsg("Preencha o período e o valor"); return; }
    const desconto = parseFloat(valor);
    if (isNaN(desconto)) { setMsg("Valor inválido"); return; }
    const condicao = modelo ? `${modelo} - Garantia` : "Garantia Apple";
    setSaving("garantia-modelo");
    await apiPost({ action: "upsert_desconto", condicao, detalhe: detalhe.trim(), desconto });
    setDescontos((prev) => {
      const exists = prev.findIndex((d) => d.condicao === condicao && d.detalhe === detalhe.trim());
      if (exists >= 0) {
        const nv = [...prev];
        nv[exists] = { ...nv[exists], desconto };
        return nv;
      }
      return [...prev, { id: crypto.randomUUID(), condicao, detalhe: detalhe.trim(), desconto }];
    });
    setNovoGarantiaModelo(null);
    setSaving(null);
    setMsg(`Garantia "${detalhe.trim()}" = R$ ${desconto} adicionada${modelo ? ` para ${modelo}` : ""}!`);
  };

  const handleRemoveDesconto = async (d: DescontoCondicao) => {
    if (!confirm(`Remover "${d.detalhe}" de "${d.condicao}"?`)) return;
    // Delete via upsert with special value to mark for deletion
    // Actually, we need a delete action in the API. For now, set discount to 0 to effectively disable it.
    // Or better: we can add a delete action
    await apiPost({ action: "delete_desconto", condicao: d.condicao, detalhe: d.detalhe });
    setDescontos((prev) => prev.filter((x) => !(x.condicao === d.condicao && x.detalhe === d.detalhe)));
  };

  const handleAddModelo = async () => {
    const { modelo, armazenamento, valor_base } = novoModelo;
    if (!modelo.trim() || !armazenamento.trim() || !valor_base.trim()) {
      setMsg("Preencha modelo, armazenamento e valor base");
      return;
    }
    const val = parseFloat(valor_base);
    if (isNaN(val) || val < 0) { setMsg("Valor invalido"); return; }
    setSaving("add-modelo");
    await apiPost({ action: "upsert_valor", modelo: modelo.trim(), armazenamento: armazenamento.trim(), valor_base: val });
    setValores((prev) => {
      const exists = prev.findIndex((v) => v.modelo === modelo.trim() && v.armazenamento === armazenamento.trim());
      if (exists >= 0) {
        const nv = [...prev];
        nv[exists] = { ...nv[exists], valor_base: val };
        return nv;
      }
      return [...prev, { id: crypto.randomUUID(), modelo: modelo.trim(), armazenamento: armazenamento.trim(), valor_base: val, ativo: true, updated_at: new Date().toISOString() }];
    });
    setMsg(`${modelo.trim()} ${armazenamento.trim()} adicionado com valor R$ ${val.toLocaleString("pt-BR")}!`);
    setNovoModelo({ modelo: "", armazenamento: "", valor_base: "" });
    setSaving(null);
  };

  const handleExportCSV = () => {
    const rows = [["Modelo", "Armazenamento", "Valor Base"]];
    valores.forEach((v) => rows.push([v.modelo, v.armazenamento, String(v.valor_base)]));
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usados-valores-${hojeBR()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  // Categoria selecionada
  const catPrefix = DEVICE_CATS.find(c => c.key === catFilter)?.prefix || "iPhone";

  // Agrupar valores por modelo — filtrado pela categoria
  const grouped: Record<string, ValorUsado[]> = {};
  valores.filter(v => v.modelo.startsWith(catPrefix)).forEach((v) => {
    if (!grouped[v.modelo]) grouped[v.modelo] = [];
    grouped[v.modelo].push(v);
  });

  // Map de modelos conhecidos (case-insensitive): valores base + modelos extraídos dos descontos
  const modelosMap = new Map<string, string>(); // lowercase → nome canônico
  valores.forEach(v => { if (v.modelo) modelosMap.set(v.modelo.toLowerCase(), v.modelo); });
  // Também extrair modelos dos próprios descontos (podem existir descontos por modelo sem valor base)
  const CONDIÇÕES_GENÉRICAS = new Set(["bateria", "descascado/amassado", "garantia", "garantia apple", "riscos laterais", "riscos na tela"]);
  descontos.forEach((d) => {
    const m = d.condicao.match(/^(.+?) - (.+)$/);
    if (m && CONDIÇÕES_GENÉRICAS.has(m[2].toLowerCase()) && !modelosMap.has(m[1].toLowerCase())) {
      modelosMap.set(m[1].toLowerCase(), m[1]); // usa o nome como veio do banco
    }
  });

  // Agrupar descontos: separar gerais vs por modelo (regex genérica — funciona p/ qualquer categoria)
  const descByModel: Record<string, Record<string, DescontoCondicao[]>> = {};
  const descGerais: Record<string, DescontoCondicao[]> = {};

  descontos.forEach((d) => {
    // Formato: "iPhone 16 Pro - Bateria" ou "IPHONE 17 PRO MAX - Riscos na tela"
    const match = d.condicao.match(/^(.+?) - (.+)$/);
    const modeloOriginal = match ? modelosMap.get(match[1].toLowerCase()) : undefined;
    if (match && modeloOriginal) {
      const cond = match[2];
      if (!descByModel[modeloOriginal]) descByModel[modeloOriginal] = {};
      if (!descByModel[modeloOriginal][cond]) descByModel[modeloOriginal][cond] = [];
      descByModel[modeloOriginal][cond].push(d);
    } else {
      // Bateria e Garantia são sempre por modelo, não aparecem em gerais
      const condLow = d.condicao.toLowerCase();
      if (condLow === "garantia apple" || condLow === "garantia" || condLow === "bateria") return;
      if (!descGerais[d.condicao]) descGerais[d.condicao] = [];
      descGerais[d.condicao].push(d);
    }
  });

  // Filtra descontos por modelo conforme a categoria selecionada
  const descByModelFiltered = Object.fromEntries(
    Object.entries(descByModel).filter(([modelo]) => modelo.startsWith(catPrefix))
  );

  // Modelos na Valores Base que NÃO têm descontos específicos (pra oferecer "Copiar de...")
  const modelosSemDesconto = Object.keys(grouped).filter(m => !descByModel[m]);
  // Modelos COM desconto na mesma categoria (pra servir de origem da cópia)
  const modelosComDesconto = Object.keys(descByModel).filter(m => m.startsWith(catPrefix));

  const handleCopyDescontos = async (destModelo: string, origemModelo: string) => {
    if (!descByModel[origemModelo]) return;
    setSaving("copy-desc");
    const promises: Promise<Response>[] = [];
    for (const [cond, rows] of Object.entries(descByModel[origemModelo])) {
      for (const d of rows) {
        promises.push(apiPost({
          action: "upsert_desconto",
          condicao: `${destModelo} - ${cond}`,
          detalhe: d.detalhe,
          desconto: d.desconto,
        }));
      }
    }
    await Promise.all(promises);
    setSaving(null);
    setMsg(`Descontos de "${origemModelo}" copiados para "${destModelo}"!`);
    setCopyFrom(null);
    fetchData();
  };

  // Config da categoria selecionada
  const catKeyMap: Record<string, string> = { iphone: "IPHONE", ipad: "IPAD", macbook: "MACBOOK", watch: "APPLE_WATCH" };
  const currentCatKey = catKeyMap[catFilter] || "IPHONE";
  const currentCatConfig = catConfigs.find(c => c.categoria === currentCatKey) || { categoria: currentCatKey, modo: "automatico" as const, ativo: true };

  const handleToggleCat = async (field: "modo" | "ativo", value: string | boolean) => {
    setSaving("cat-config");
    await apiPost({ action: "update_cat_config", categoria: currentCatKey, [field]: value });
    setCatConfigs(prev => {
      const exists = prev.findIndex(c => c.categoria === currentCatKey);
      const upd = { ...currentCatConfig, [field]: value };
      if (exists >= 0) { const nv = [...prev]; nv[exists] = upd; return nv; }
      return [...prev, upd];
    });
    setSaving(null);
    setMsg(`${field === "modo" ? "Modo" : "Status"} atualizado!`);
  };

  const handleSaveGarantia = async (modelo: string, armazenamento: string) => {
    const key = `${modelo}|${armazenamento}`;
    const raw = editingGarantia[key];
    if (raw === undefined) return;
    const val = parseFloat(raw) || 0;
    setSaving(key + "-gar");
    await apiPost({ action: "upsert_garantia", modelo, armazenamento, valor_garantia: val });
    setGarantias(prev => {
      const exists = prev.findIndex(g => g.modelo === modelo && g.armazenamento === armazenamento);
      if (exists >= 0) { const nv = [...prev]; nv[exists] = { ...nv[exists], valor_garantia: val }; return nv; }
      return [...prev, { id: crypto.randomUUID(), modelo, armazenamento, valor_garantia: val }];
    });
    const e = { ...editingGarantia }; delete e[key]; setEditingGarantia(e);
    setSaving(null);
  };

  // Lookup garantia por modelo+armazenamento
  const getGarantia = (modelo: string, arm: string) => garantias.find(g => g.modelo === modelo && g.armazenamento === arm)?.valor_garantia ?? 0;

  // Excluidos filtrados por categoria
  const excluidosFiltrados = excluidos.filter(m => m.startsWith(catPrefix));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold text-[#1D1D1F]">Avaliacao de Usados</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddModelo(!showAddModelo)}
            className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors"
          >
            + Adicionar Modelo
          </button>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 rounded-xl bg-white border border-[#D2D2D7] text-[#86868B] text-sm font-semibold hover:border-[#E8740E] hover:text-[#E8740E] transition-colors"
          >
            Exportar CSV
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

      {/* Balanco manual de seminovos */}
      <BalancoSeminovosSection password={password} userNome={user?.nome || "sistema"} onMsg={setMsg} />

      {/* Form adicionar modelo */}
      {showAddModelo && (
        <div className="bg-white border border-[#E8740E]/30 rounded-2xl p-5 shadow-sm space-y-3">
          <p className="text-sm font-bold text-[#1D1D1F]">Adicionar Modelo Seminovo</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] font-semibold text-[#86868B] uppercase mb-1">Modelo</p>
              <input
                value={novoModelo.modelo}
                onChange={(e) => setNovoModelo({ ...novoModelo, modelo: e.target.value })}
                placeholder="Ex: iPhone 17 Pro Max"
                className="w-full px-3 py-2 rounded-xl border border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
                autoFocus
              />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[#86868B] uppercase mb-1">Armazenamento</p>
              <select
                value={novoModelo.armazenamento}
                onChange={(e) => setNovoModelo({ ...novoModelo, armazenamento: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
              >
                <option value="">— Selecionar —</option>
                {["64GB", "128GB", "256GB", "512GB", "1TB", "2TB"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[#86868B] uppercase mb-1">Valor Base (R$)</p>
              <input
                type="number"
                value={novoModelo.valor_base}
                onChange={(e) => setNovoModelo({ ...novoModelo, valor_base: e.target.value })}
                placeholder="Ex: 3500"
                className="w-full px-3 py-2 rounded-xl border border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
                onKeyDown={(e) => e.key === "Enter" && handleAddModelo()}
              />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={handleAddModelo} disabled={saving === "add-modelo"} className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] disabled:opacity-50">
                {saving === "add-modelo" ? "..." : "Adicionar"}
              </button>
              <button onClick={() => setShowAddModelo(false)} className="px-4 py-2 rounded-xl border border-[#D2D2D7] text-[#86868B] text-sm hover:border-[#E8740E]">
                Fechar
              </button>
            </div>
          </div>
          <p className="text-[10px] text-[#86868B]">Dica: para adicionar vários armazenamentos do mesmo modelo, adicione um de cada vez.</p>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        {DEVICE_CATS.map(c => {
          const count = valores.filter(v => v.modelo.startsWith(c.prefix)).length;
          return (
            <button key={c.key} onClick={() => setCatFilter(c.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${catFilter === c.key ? "bg-[#1D1D1F] text-white" : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#1D1D1F]"}`}>
              {c.label} <span className="opacity-60 ml-1">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Config da categoria: Modo + Ativo */}
      <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#86868B] uppercase">Modo:</span>
          <button
            onClick={() => handleToggleCat("modo", currentCatConfig.modo === "automatico" ? "manual" : "automatico")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentCatConfig.modo === "automatico" ? "bg-green-500 text-white" : "bg-amber-500 text-white"}`}
          >
            {currentCatConfig.modo === "automatico" ? "🤖 Automático" : "✋ Manual"}
          </button>
          <span className="text-[10px] text-[#86868B]">
            {currentCatConfig.modo === "automatico" ? "Calcula e mostra valor pro cliente" : "Cliente envia formulário, vocês avaliam"}
          </span>
        </div>
        <div className="h-5 w-px bg-[#D2D2D7]" />
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#86868B] uppercase">Visível:</span>
          <button
            onClick={() => handleToggleCat("ativo", !currentCatConfig.ativo)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentCatConfig.ativo ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}
          >
            {currentCatConfig.ativo ? "✅ Ativo" : "❌ Desativado"}
          </button>
          <span className="text-[10px] text-[#86868B]">
            {currentCatConfig.ativo ? "Aparece no formulário público" : "Escondido do cliente"}
          </span>
        </div>
      </div>

      {/* Sub-tabs: Valores Base / Descontos / Excluidos */}
      <div className="flex gap-2">
        {(["valores", "descontos", "excluidos"] as const).map((t) => {
          const countMap = {
            valores: Object.values(grouped).reduce((s, arr) => s + arr.length, 0),
            descontos: descontos.length,
            excluidos: excluidosFiltrados.length,
          };
          return (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t ? "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"}`}>
              {t === "valores" ? `Valores Base (${countMap.valores})` : t === "descontos" ? `Descontos (${countMap.descontos})` : `Excluidos (${countMap.excluidos})`}
            </button>
          );
        })}
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
                      <th className="px-5 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">Garantia (+R$)</th>
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
                          <td className="px-5 py-3">
                            {(() => {
                              const gKey = `${v.modelo}|${v.armazenamento}`;
                              const isEditGar = editingGarantia[gKey] !== undefined;
                              const garVal = getGarantia(v.modelo, v.armazenamento);
                              return isEditGar ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-[#86868B] text-xs">+R$</span>
                                  <input type="number" value={editingGarantia[gKey]} onChange={(e) => setEditingGarantia({ ...editingGarantia, [gKey]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && handleSaveGarantia(v.modelo, v.armazenamento)} className="w-16 px-1 py-0.5 rounded border border-[#E8740E] text-xs text-right" autoFocus />
                                  <button onClick={() => handleSaveGarantia(v.modelo, v.armazenamento)} className="text-[10px] text-[#E8740E] font-bold">OK</button>
                                  <button onClick={() => { const e = { ...editingGarantia }; delete e[gKey]; setEditingGarantia(e); }} className="text-[10px] text-[#86868B]">✕</button>
                                </div>
                              ) : (
                                <span className={`text-xs font-medium cursor-pointer hover:text-[#E8740E] ${garVal > 0 ? "text-green-600" : "text-[#B0B0B0]"}`} onClick={() => setEditingGarantia({ ...editingGarantia, [gKey]: String(garVal) })}>
                                  {garVal > 0 ? `+${fmt(garVal)}` : "—"}
                                </span>
                              );
                            })()}
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
        /* DESCONTOS — agrupados por modelo */
        <div className="space-y-4">
          {descontos.length === 0 ? (
            <div className="bg-white border border-[#D2D2D7] rounded-2xl p-12 text-center shadow-sm">
              <p className="text-[#86868B]">Nenhum desconto cadastrado. Importe do Sheets primeiro.</p>
            </div>
          ) : (
            <>
              {/* Descontos gerais (sem modelo específico) */}
              {Object.keys(descGerais).length > 0 && (
                <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-5 py-3 bg-[#F5F5F7] border-b border-[#D2D2D7] flex items-center justify-between">
                    <h3 className="font-semibold text-[#1D1D1F]">Descontos Gerais (todos os modelos)</h3>
                    <button
                      onClick={() => setNovoBateria({ modelo: "", threshold: "", desconto: "" })}
                      className="px-3 py-1 rounded-lg text-[10px] font-semibold bg-[#E8740E]/10 text-[#E8740E] hover:bg-[#E8740E]/20 transition-colors"
                    >
                      + Nivel Bateria
                    </button>
                  </div>
                  {novoBateria && novoBateria.modelo === "" && (
                    <div className="px-5 py-3 bg-[#FFF8F0] border-b border-[#E8740E]/20 flex items-center gap-3">
                      <span className="text-xs text-[#86868B]">Abaixo de</span>
                      <input type="number" value={novoBateria.threshold} onChange={(e) => setNovoBateria({ ...novoBateria, threshold: e.target.value })} placeholder="Ex: 83" className="w-16 px-2 py-1 rounded-lg border border-[#E8740E] text-sm text-center" autoFocus />
                      <span className="text-xs text-[#86868B]">% → R$</span>
                      <input type="number" value={novoBateria.desconto} onChange={(e) => setNovoBateria({ ...novoBateria, desconto: e.target.value })} placeholder="-200" className="w-20 px-2 py-1 rounded-lg border border-[#E8740E] text-sm text-right" onKeyDown={(e) => e.key === "Enter" && handleAddBateriaTier()} />
                      <button onClick={handleAddBateriaTier} disabled={saving === "bateria"} className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#F5A623]">Salvar</button>
                      <button onClick={() => setNovoBateria(null)} className="text-xs text-[#86868B]">Cancelar</button>
                    </div>
                  )}
                  <div className="p-4 space-y-4">
                    {Object.entries(descGerais).map(([cond, rows]) => {
                      const isBateriaCond = cond === "Bateria";
                      return (
                        <div key={cond}>
                          <p className="text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-2">{cond}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {rows.map((d) => {
                              const key = `${d.condicao}|${d.detalhe}`;
                              const isEd = editingDesc[key] !== undefined;
                              return (
                                <div key={key} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#F5F5F7] text-sm group">
                                  <span className="text-[#1D1D1F] text-xs">{d.detalhe}</span>
                                  <div className="flex items-center gap-1">
                                    {isEd ? (
                                      <>
                                        <input type="number" value={editingDesc[key]} onChange={(e) => setEditingDesc({ ...editingDesc, [key]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") handleSaveDesconto(d); if (e.key === "Escape") { const ed = { ...editingDesc }; delete ed[key]; setEditingDesc(ed); } }} className="w-16 px-1 py-0.5 rounded border border-[#0071E3] text-xs text-right" autoFocus />
                                        <button onClick={() => handleSaveDesconto(d)} className="text-[10px] text-[#E8740E] font-bold">OK</button>
                                      </>
                                    ) : (
                                      <span className={`font-bold text-xs cursor-pointer hover:text-[#E8740E] ${d.desconto < 0 ? "text-red-500" : d.desconto > 0 ? "text-green-600" : "text-[#86868B]"}`} onClick={() => setEditingDesc({ ...editingDesc, [key]: String(d.desconto) })}>
                                        {d.desconto > 0 ? `+${fmt(d.desconto)}` : d.desconto < 0 ? `${fmt(d.desconto)}` : "R$ 0"}
                                      </span>
                                    )}
                                    {isBateriaCond && !isEd && (
                                      <button onClick={() => handleRemoveDesconto(d)} className="text-red-400 hover:text-red-600 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity ml-1" title="Remover">✕</button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Modelos SEM desconto específico — oferecer "Copiar de..." */}
              {modelosSemDesconto.filter(m => m.startsWith(catPrefix)).length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
                  <p className="text-xs font-bold text-amber-700 uppercase">⚠️ Modelos sem descontos específicos</p>
                  <div className="flex flex-wrap gap-2">
                    {modelosSemDesconto.filter(m => m.startsWith(catPrefix)).map(m => (
                      <div key={m} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-sm">
                        <span className="text-[#1D1D1F] font-medium">{m}</span>
                        {copyFrom === m ? (
                          <select
                            autoFocus
                            onChange={(e) => { if (e.target.value) handleCopyDescontos(m, e.target.value); }}
                            onBlur={() => setCopyFrom(null)}
                            className="text-xs border border-[#E8740E] rounded px-2 py-1"
                          >
                            <option value="">Copiar de...</option>
                            {modelosComDesconto.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <button onClick={() => setCopyFrom(m)} className="text-[10px] text-[#E8740E] font-semibold hover:underline">Copiar descontos</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Descontos por modelo — filtrado pela categoria */}
              {Object.entries(descByModelFiltered).sort(([a], [b]) => a.localeCompare(b)).map(([modelo, condicoes]) => (
                <div key={modelo} className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-5 py-3 bg-[#F5F5F7] border-b border-[#D2D2D7] flex items-center justify-between">
                    <h3 className="font-semibold text-[#1D1D1F]">{modelo}</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setNovoBateria({ modelo, threshold: "", desconto: "" })}
                        className="px-3 py-1 rounded-lg text-[10px] font-semibold bg-[#E8740E]/10 text-[#E8740E] hover:bg-[#E8740E]/20 transition-colors"
                      >
                        + Nivel Bateria
                      </button>
                      <button
                        onClick={() => setNovoGarantiaModelo({ modelo, detalhe: "", valor: "" })}
                        className="px-3 py-1 rounded-lg text-[10px] font-semibold bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors"
                      >
                        + Garantia
                      </button>
                    </div>
                  </div>
                  {/* Form para novo nível de bateria neste modelo */}
                  {novoBateria && novoBateria.modelo === modelo && (
                    <div className="px-5 py-3 bg-[#FFF8F0] border-b border-[#E8740E]/20 flex items-center gap-3">
                      <span className="text-xs text-[#86868B]">Abaixo de</span>
                      <input type="number" value={novoBateria.threshold} onChange={(e) => setNovoBateria({ ...novoBateria, threshold: e.target.value })} placeholder="Ex: 83" className="w-16 px-2 py-1 rounded-lg border border-[#E8740E] text-sm text-center" autoFocus />
                      <span className="text-xs text-[#86868B]">% → R$</span>
                      <input type="number" value={novoBateria.desconto} onChange={(e) => setNovoBateria({ ...novoBateria, desconto: e.target.value })} placeholder="-200" className="w-20 px-2 py-1 rounded-lg border border-[#E8740E] text-sm text-right" onKeyDown={(e) => e.key === "Enter" && handleAddBateriaTier()} />
                      <button onClick={handleAddBateriaTier} disabled={saving === "bateria"} className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#F5A623]">Salvar</button>
                      <button onClick={() => setNovoBateria(null)} className="text-xs text-[#86868B]">Cancelar</button>
                    </div>
                  )}
                  {/* Form para garantia individual neste modelo */}
                  {novoGarantiaModelo && novoGarantiaModelo.modelo === modelo && (
                    <div className="px-5 py-3 bg-green-50 border-b border-green-200 flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-[#86868B]">Período:</span>
                      <select value={novoGarantiaModelo.detalhe} onChange={(e) => setNovoGarantiaModelo({ ...novoGarantiaModelo, detalhe: e.target.value })} className="px-2 py-1 rounded-lg border border-green-400 text-sm">
                        <option value="">— Selecionar —</option>
                        <option value="Ate 3 meses">Até 3 meses</option>
                        <option value="3 a 6 meses">3 a 6 meses</option>
                        <option value="6 meses ou mais">6 meses ou mais</option>
                      </select>
                      <span className="text-xs text-[#86868B]">→ R$</span>
                      <input type="number" value={novoGarantiaModelo.valor} onChange={(e) => setNovoGarantiaModelo({ ...novoGarantiaModelo, valor: e.target.value })} placeholder="200" className="w-20 px-2 py-1 rounded-lg border border-green-400 text-sm text-right" onKeyDown={(e) => e.key === "Enter" && handleAddGarantiaModelo()} />
                      <button onClick={handleAddGarantiaModelo} disabled={saving === "garantia-modelo"} className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-500 text-white hover:bg-green-600">Salvar</button>
                      <button onClick={() => setNovoGarantiaModelo(null)} className="text-xs text-[#86868B]">Cancelar</button>
                    </div>
                  )}
                  <div className="p-4 space-y-4">
                    {Object.entries(condicoes).map(([cond, rows]) => (
                      <div key={cond}>
                        <p className="text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-2">{cond}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {rows.map((d) => {
                            const key = `${d.condicao}|${d.detalhe}`;
                            const isEd = editingDesc[key] !== undefined;
                            const canRemove = cond === "Bateria" || cond === "Garantia";
                            return (
                              <div key={key} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#F5F5F7] text-sm group">
                                <span className="text-[#1D1D1F] text-xs">{d.detalhe}</span>
                                <div className="flex items-center gap-1">
                                {isEd ? (
                                  <>
                                    <input type="number" value={editingDesc[key]} onChange={(e) => setEditingDesc({ ...editingDesc, [key]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") handleSaveDesconto(d); if (e.key === "Escape") { const ed = { ...editingDesc }; delete ed[key]; setEditingDesc(ed); } }} className="w-16 px-1 py-0.5 rounded border border-[#0071E3] text-xs text-right" autoFocus />
                                    <button onClick={() => handleSaveDesconto(d)} className="text-[10px] text-[#E8740E] font-bold">OK</button>
                                  </>
                                ) : (
                                  <span className={`font-bold text-xs cursor-pointer hover:text-[#E8740E] ${d.desconto < 0 ? "text-red-500" : d.desconto > 0 ? "text-green-600" : "text-[#86868B]"}`} onClick={() => setEditingDesc({ ...editingDesc, [key]: String(d.desconto) })}>
                                    {d.desconto > 0 ? `+${fmt(d.desconto)}` : d.desconto < 0 ? `${fmt(d.desconto)}` : "R$ 0"}
                                  </span>
                                )}
                                {canRemove && !isEd && (
                                  <button onClick={() => handleRemoveDesconto(d)} className="text-red-400 hover:text-red-600 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity ml-1" title="Remover">✕</button>
                                )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        /* MODELOS EXCLUÍDOS */
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 shadow-sm space-y-4">
          <p className="text-sm text-[#86868B]">Modelos que NAO sao aceitos no trade-in:</p>

          <div className="flex gap-2 flex-wrap">
            {excluidosFiltrados.map((m) => (
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

export default function UsadosPage() {
  return <UsadosContent />;
}

// ====================================================================
// Balanco manual de seminovos
// ====================================================================

interface BalancoGrupo {
  categoria: string;
  modeloBase: string;
  qnt: number;
  custoTotal: number;
  custoAtual: number;
  balancoCalculado: number;
  precisaAtualizar: boolean;
  qntItens: number;
}

function BalancoSeminovosSection({
  password,
  userNome,
  onMsg,
}: {
  password: string;
  userNome: string;
  onMsg: (m: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [grupos, setGrupos] = useState<BalancoGrupo[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const keyOf = (g: BalancoGrupo) => `${g.categoria}|${g.modeloBase}`;

  const carregar = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/recalc-balancos", {
        headers: { "x-admin-password": password },
        cache: "no-store",
      });
      const j = await res.json();
      setGrupos(Array.isArray(j.data) ? j.data : []);
    } catch { /* silent */ }
    setLoading(false);
  }, [password]);

  useEffect(() => {
    if (aberto) carregar();
  }, [aberto, carregar]);

  const toggleTodos = () => {
    if (selecionados.size === grupos.length) setSelecionados(new Set());
    else setSelecionados(new Set(grupos.map(keyOf)));
  };

  const toggleUm = (g: BalancoGrupo) => {
    const k = keyOf(g);
    const next = new Set(selecionados);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSelecionados(next);
  };

  const abrirConfirmacao = () => {
    if (selecionados.size === 0) { alert("Selecione ao menos 1 modelo."); return; }
    setConfirmOpen(true);
  };

  const aplicarBalanco = async () => {
    const modelos = grupos.filter(g => selecionados.has(keyOf(g))).map(g => ({ categoria: g.categoria, modeloBase: g.modeloBase }));
    const total = modelos.length;
    setConfirmOpen(false);
    setAplicando(true);
    try {
      const res = await fetch("/api/admin/recalc-balancos", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userNome) },
        body: JSON.stringify({ modelos }),
      });
      const j = await res.json();
      if (!j.ok) { alert("Erro: " + (j.error || "falha")); setAplicando(false); return; }
      onMsg(`✓ Balanço aplicado em ${total} modelo(s). ${j.updated} produto(s) atualizado(s).`);
      setSelecionados(new Set());
      await carregar();
    } catch (e) {
      alert("Erro de conexão: " + String(e));
    }
    setAplicando(false);
  };

  const precisam = grupos.filter(g => g.precisaAtualizar).length;

  return (
    <div className="bg-white border border-[#D2D2D7] rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setAberto(!aberto)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-[#F5F5F7] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">📊</span>
          <div className="text-left">
            <p className="text-sm font-bold text-[#1D1D1F]">Balanço Manual (Preço Médio)</p>
            <p className="text-[11px] text-[#86868B]">
              Selecione os modelos de seminovo e aplique o recálculo de preço médio ponderado
              {aberto && precisam > 0 && <span className="ml-2 text-[#E8740E] font-semibold">· {precisam} modelo(s) com balanço desatualizado</span>}
            </p>
          </div>
        </div>
        <span className="text-[#86868B]">{aberto ? "▲" : "▼"}</span>
      </button>

      {aberto && (
        <div className="px-5 py-4 border-t border-[#E5E5EA] bg-[#FAFAFA]">
          {loading && <p className="text-xs text-[#86868B] py-4 text-center">Carregando...</p>}
          {!loading && grupos.length === 0 && (
            <p className="text-xs text-[#86868B] py-4 text-center">Nenhum seminovo em estoque encontrado.</p>
          )}
          {!loading && grupos.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <button
                  onClick={toggleTodos}
                  className="text-xs text-[#E8740E] hover:underline font-medium"
                >
                  {selecionados.size === grupos.length ? "Desmarcar todos" : "Selecionar todos"} ({selecionados.size}/{grupos.length})
                </button>
                <button
                  onClick={abrirConfirmacao}
                  disabled={aplicando || selecionados.size === 0}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-[#E8740E] text-white hover:bg-[#D06A0D] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {aplicando ? "Aplicando..." : `🔄 Fazer balanço dos selecionados (${selecionados.size})`}
                </button>
              </div>
              <div className="overflow-x-auto bg-white rounded-xl border border-[#E5E5EA]">
                <table className="w-full text-sm">
                  <thead className="bg-[#F5F5F7]">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-[#86868B] uppercase"></th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-[#86868B] uppercase">Modelo</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold text-[#86868B] uppercase">Qnt</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold text-[#86868B] uppercase">Custo Atual</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold text-[#86868B] uppercase">Novo Balanço</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold text-[#86868B] uppercase">Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) => {
                      const k = keyOf(g);
                      const sel = selecionados.has(k);
                      const diff = g.balancoCalculado - g.custoAtual;
                      return (
                        <tr
                          key={k}
                          className={`border-t border-[#F5F5F7] hover:bg-[#FAFAFA] cursor-pointer ${sel ? "bg-orange-50" : ""}`}
                          onClick={() => toggleUm(g)}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={sel}
                              onChange={() => toggleUm(g)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 accent-[#E8740E]"
                            />
                          </td>
                          <td className="px-3 py-2 text-[#1D1D1F] font-medium">{g.modeloBase}</td>
                          <td className="px-3 py-2 text-right text-[#1D1D1F] font-mono">{g.qnt}</td>
                          <td className="px-3 py-2 text-right text-[#86868B] font-mono">{fmt(g.custoAtual)}</td>
                          <td className={`px-3 py-2 text-right font-mono font-semibold ${g.precisaAtualizar ? "text-[#E8740E]" : "text-[#86868B]"}`}>{fmt(g.balancoCalculado)}</td>
                          <td className={`px-3 py-2 text-right font-mono ${Math.abs(diff) < 0.01 ? "text-[#86868B]" : diff > 0 ? "text-green-600" : "text-red-600"}`}>
                            {Math.abs(diff) < 0.01 ? "—" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal de confirmacao com preview */}
      {confirmOpen && (
        <ConfirmarBalancoModal
          gruposSelecionados={grupos.filter(g => selecionados.has(keyOf(g)))}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={aplicarBalanco}
          aplicando={aplicando}
        />
      )}
    </div>
  );
}

// Modal de confirmacao com preview dos modelos selecionados
function ConfirmarBalancoModal({
  gruposSelecionados,
  onCancel,
  onConfirm,
  aplicando,
}: {
  gruposSelecionados: BalancoGrupo[];
  onCancel: () => void;
  onConfirm: () => void;
  aplicando: boolean;
}) {
  const qntTotalProdutos = gruposSelecionados.reduce((s, g) => s + g.qnt, 0);
  const valorTotalAtual = gruposSelecionados.reduce((s, g) => s + g.qnt * g.custoAtual, 0);
  const valorTotalNovo = gruposSelecionados.reduce((s, g) => s + g.custoTotal, 0);
  const impactoValor = valorTotalNovo - valorTotalAtual;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#1D1D1F]">🔄 Confirmar Balanço</h2>
          <button onClick={onCancel} className="text-2xl text-[#86868B] hover:text-[#1D1D1F]">×</button>
        </div>

        <p className="text-sm text-[#6E6E73] mb-4">
          Revise os modelos antes de aplicar o balanço. Os valores de <strong>custo_unitario</strong> de cada produto em estoque serão atualizados para o preço médio ponderado.
        </p>

        {/* Resumo geral */}
        <div className="bg-gradient-to-br from-[#F5F5F7] to-white border border-[#D2D2D7] rounded-xl p-4 mb-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-[#86868B] uppercase tracking-wider">Modelos selecionados</p>
            <p className="text-xl font-bold text-[#1D1D1F]">{gruposSelecionados.length}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#86868B] uppercase tracking-wider">Total de produtos</p>
            <p className="text-xl font-bold text-[#1D1D1F]">{qntTotalProdutos}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#86868B] uppercase tracking-wider">Valor atual do estoque</p>
            <p className="text-sm font-mono font-semibold text-[#1D1D1F]">{fmt(valorTotalAtual)}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#86868B] uppercase tracking-wider">Valor após balanço</p>
            <p className="text-sm font-mono font-semibold text-[#1D1D1F]">{fmt(valorTotalNovo)}</p>
          </div>
          <div className="col-span-full pt-2 border-t border-[#E5E5EA]">
            <p className="text-[10px] text-[#86868B] uppercase tracking-wider">Impacto total</p>
            <p className={`text-lg font-mono font-bold ${Math.abs(impactoValor) < 1 ? "text-[#86868B]" : impactoValor > 0 ? "text-green-600" : "text-red-600"}`}>
              {impactoValor > 0 ? "+" : ""}{fmt(impactoValor)}
            </p>
          </div>
        </div>

        {/* Lista dos modelos */}
        <div className="border border-[#E5E5EA] rounded-xl overflow-hidden mb-4">
          <div className="bg-[#F5F5F7] px-4 py-2 border-b border-[#E5E5EA]">
            <p className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Detalhe por modelo</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-[#E5E5EA]">
                  <th className="px-3 py-2 text-left text-[10px] text-[#86868B]">Modelo</th>
                  <th className="px-3 py-2 text-right text-[10px] text-[#86868B]">Qnt</th>
                  <th className="px-3 py-2 text-right text-[10px] text-[#86868B]">Atual</th>
                  <th className="px-3 py-2 text-right text-[10px] text-[#86868B]">Novo</th>
                  <th className="px-3 py-2 text-right text-[10px] text-[#86868B]">Dif</th>
                </tr>
              </thead>
              <tbody>
                {gruposSelecionados.map((g) => {
                  const diff = g.balancoCalculado - g.custoAtual;
                  return (
                    <tr key={`${g.categoria}|${g.modeloBase}`} className="border-b border-[#F5F5F7]">
                      <td className="px-3 py-2 text-[#1D1D1F] font-medium">{g.modeloBase}</td>
                      <td className="px-3 py-2 text-right text-[#1D1D1F] font-mono">{g.qnt}</td>
                      <td className="px-3 py-2 text-right text-[#86868B] font-mono">{fmt(g.custoAtual)}</td>
                      <td className="px-3 py-2 text-right text-[#E8740E] font-mono font-semibold">{fmt(g.balancoCalculado)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${Math.abs(diff) < 0.01 ? "text-[#86868B]" : diff > 0 ? "text-green-600" : "text-red-600"}`}>
                        {Math.abs(diff) < 0.01 ? "—" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#E5E5EA]">
          <button onClick={onCancel} disabled={aplicando} className="px-4 py-2 rounded-lg text-sm text-[#1D1D1F] hover:bg-[#F5F5F7] font-medium">Cancelar</button>
          <button onClick={onConfirm} disabled={aplicando} className="px-4 py-2 rounded-lg text-sm bg-[#E8740E] text-white font-bold hover:bg-[#D06A0D] disabled:opacity-50">
            {aplicando ? "Aplicando..." : "✅ Confirmar balanço"}
          </button>
        </div>
      </div>
    </div>
  );
}
