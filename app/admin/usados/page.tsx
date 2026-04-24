"use client";
import { hojeBR } from "@/lib/date-utils";

import { useEffect, useState, useCallback } from "react";
import { useAutoRefetch } from "@/lib/useAutoRefetch";
import { useAdmin } from "@/components/admin/AdminShell";
import { parseStorageSpec, formatStorageSpec } from "@/lib/storage-spec";

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

// Campos que compoem a string `armazenamento` ao adicionar modelo por categoria.
// Ao salvar, valores sao juntados com " | " (mesmo padrao de /admin/precos).
// Ex: iPad 256GB | 11" | Wifi → armazenamento = "256GB | 11\" | Wifi".
type SpecField = { key: string; label: string; options: string[] };
const SPEC_FIELDS_BY_CAT: Record<string, SpecField[]> = {
  iphone: [
    { key: "armazenamento", label: "Armazenamento", options: ["64GB", "128GB", "256GB", "512GB", "1TB"] },
  ],
  ipad: [
    { key: "armazenamento", label: "Armazenamento", options: ["64GB", "128GB", "256GB", "512GB", "1TB", "2TB"] },
    { key: "tela", label: "Tela", options: ['8.3"', '10.2"', '10.9"', '11"', '12.9"', '13"'] },
    { key: "conectividade", label: "Conectividade", options: ["Wifi", "Wifi + Cel"] },
  ],
  macbook: [
    { key: "tela", label: "Tela", options: ['13"', '14"', '15"', '16"'] },
    { key: "ram", label: "RAM", options: ["8GB", "16GB", "24GB", "32GB", "64GB", "96GB", "128GB"] },
    { key: "ssd", label: "SSD", options: ["256GB", "512GB", "1TB", "2TB", "4TB", "8TB"] },
  ],
  watch: [
    { key: "tamanho", label: "Tamanho", options: ["38mm", "40mm", "41mm", "42mm", "44mm", "45mm", "46mm", "49mm"] },
    { key: "conectividade", label: "Conectividade", options: ["GPS", "GPS + Cel"] },
  ],
};

// Placeholder do campo "Modelo" conforme a categoria aberta.
const MODELO_PLACEHOLDER_BY_CAT: Record<string, string> = {
  iphone: "Ex: 17 Pro Max (sem 'iPhone')",
  ipad: "Ex: Air M3 (sem 'iPad')",
  macbook: "Ex: Air M3 (sem 'MacBook')",
  watch: "Ex: Series 9 (sem 'Apple Watch')",
};

// Linhas pre-definidas por categoria pro select "Linha" do form. A linha
// garante consistencia com o parser do cliente (extractLines) — se o admin
// digitasse errado, o modelo nao apareceria agrupado corretamente.
const LINHAS_BY_CAT: Record<string, string[]> = {
  iphone: ["13", "14", "15", "16", "17"],
  ipad: ["iPad (Entrada)", "Air", "Pro", "mini"],
  macbook: ["Air", "Pro"],
  watch: ["SE", "Series", "Ultra"],
};

// Prefixo padrao da categoria (usado pra montar o nome final do modelo).
const CAT_PREFIX: Record<string, string> = {
  iphone: "iPhone",
  ipad: "iPad",
  macbook: "MacBook",
  watch: "Apple Watch",
};

// Monta o nome final juntando prefixo + linha + modelo. Caso especial do
// iPad Entrada: a linha selecionada aparece como "iPad (Entrada)" no select
// mas no nome final e so "iPad" — evita duplicar "iPad iPad 10o".
//
// Se o admin ja digitou o prefixo ou prefixo+linha no campo "Modelo"
// (ex: "iPad Pro M2" em vez de "M2"), faz strip automatico pra nao virar
// "iPad Pro iPad Pro M2". Comparacao case-insensitive no prefixo.
function buildModeloName(cat: string, linha: string, modelo: string): string {
  const prefix = CAT_PREFIX[cat] || "";
  const linhaFinal = linha === "iPad (Entrada)" ? "" : linha.trim();
  let modeloClean = modelo.trim();

  const stripIfPrefixed = (needle: string) => {
    if (!needle) return;
    const lower = modeloClean.toLowerCase();
    const n = needle.toLowerCase();
    if (lower === n) { modeloClean = ""; return; }
    if (lower.startsWith(n + " ")) { modeloClean = modeloClean.substring(needle.length).trim(); }
  };

  // Tenta primeiro o combo "prefix + linha" (ex: "iPad Pro"), depois so o prefix
  if (prefix && linhaFinal) stripIfPrefixed(`${prefix} ${linhaFinal}`);
  if (prefix) stripIfPrefixed(prefix);

  const parts = [prefix, linhaFinal, modeloClean].filter(Boolean);
  return parts.join(" ");
}

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
  // Edicao inline dos specs por linha. Chave do mapa externo =
  // `${modelo}|${armazenamento_atual}`. Chave interna = f.key de SPEC_FIELDS_BY_CAT
  // (armazenamento/tela/conectividade pra iPad, tamanho/conectividade pra Watch,
  // tela/ram/ssd pra MacBook). Ao salvar, junta valores na ORDEM dos fields.
  const [editingSpecs, setEditingSpecs] = useState<Record<string, Record<string, string>>>({});
  // Form inline pra adicionar nova variante direto no header de cada modelo
  // (sem precisar abrir o form grande no topo e redigitar Linha+Modelo).
  // Chave = nome do modelo. Valor = { specs por campo, valor_base }.
  const [addingVariante, setAddingVariante] = useState<Record<string, { specs: Record<string, string>; valor_base: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [novoExcluido, setNovoExcluido] = useState("");
  const [novoBateria, setNovoBateria] = useState<{ modelo: string; threshold: string; desconto: string } | null>(null);
  const [novoGarantiaModelo, setNovoGarantiaModelo] = useState<{ modelo: string; detalhe: string; valor: string } | null>(null);
  const [showAddModelo, setShowAddModelo] = useState(false);
  // `specs` guarda o valor de cada campo (key do SPEC_FIELDS_BY_CAT). No save
  // junta tudo com " | " pra gravar no campo `armazenamento`. `linha` e o
  // pre-seletor de linha (Air/Pro/mini/Series/etc) que ajuda a garantir que
  // o nome final do modelo case com o parser do cliente.
  const [novoModelo, setNovoModelo] = useState<{ linha: string; modelo: string }>({
    linha: "",
    modelo: "",
  });
  // Cada variante e uma combinacao (armaz/tela/conect/...) + valor_base pro
  // mesmo linha+modelo. O form permite cadastrar varias de uma vez — ao salvar
  // faz 1 upsert por variante valida. Campos vazios sao ignorados com aviso.
  type VarianteNova = { id: string; specs: Record<string, string>; valor_base: string };
  const [variantes, setVariantes] = useState<VarianteNova[]>([
    { id: crypto.randomUUID(), specs: {}, valor_base: "" },
  ]);
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

  const handleSaveNewVariante = async (groupKey: string, modelo: string, cat: string) => {
    const entry = addingVariante[groupKey];
    if (!entry) return;
    const specFields = SPEC_FIELDS_BY_CAT[cat] || [];
    const missing = specFields.find((f) => !entry.specs[f.key]?.trim());
    if (missing) { setMsg(`Selecione ${missing.label.toLowerCase()}`); return; }
    if (!entry.valor_base.trim()) { setMsg("Preencha o valor (use 0 pra sem preco fixo)"); return; }
    const val = parseFloat(entry.valor_base);
    if (isNaN(val) || val < 0) { setMsg("Valor invalido"); return; }
    // Junta na ORDEM dos fields (armaz | tela | conect), campos vazios somem
    const armazenamento = specFields.map((f) => (entry.specs[f.key] || "").trim()).filter(Boolean).join(" | ");
    const savingKey = `new-variante-${modelo}`;
    setSaving(savingKey);
    const res = await apiPost({ action: "upsert_valor", modelo, armazenamento, valor_base: val });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Erro: ${j.error || "falha ao adicionar variante"}`);
      setSaving(null);
      return;
    }
    setValores((prev) => {
      const exists = prev.findIndex((v) => v.modelo === modelo && v.armazenamento === armazenamento);
      if (exists >= 0) {
        const nv = [...prev];
        nv[exists] = { ...nv[exists], valor_base: val };
        return nv;
      }
      return [...prev, { id: crypto.randomUUID(), modelo, armazenamento, valor_base: val, ativo: true }];
    });
    const e = { ...addingVariante }; delete e[groupKey]; setAddingVariante(e);
    setMsg(`${modelo} ${armazenamento} adicionado!`);
    setSaving(null);
  };

  const handleSaveSpecs = async (v: ValorUsado, cat: string) => {
    const key = `${v.modelo}|${v.armazenamento}`;
    const spec = editingSpecs[key];
    if (!spec) return;
    const specFields = SPEC_FIELDS_BY_CAT[cat] || [];
    // Junta na ORDEM dos fields (pra ficar "armaz | tela | conect" e nao
    // embaralhar conforme ordem de digitacao). Campos vazios somem.
    const novoArmaz = specFields.map((f) => (spec[f.key] || "").trim()).filter(Boolean).join(" | ");
    if (!novoArmaz) { alert("Preencha pelo menos um campo."); return; }
    if (novoArmaz === v.armazenamento) {
      const e = { ...editingSpecs }; delete e[key]; setEditingSpecs(e);
      return;
    }
    setSaving(key);
    const res = await apiPost({
      action: "rename_storage",
      modelo: v.modelo,
      armazenamento_antigo: v.armazenamento,
      armazenamento_novo: novoArmaz,
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Erro: ${j.error || "falha ao renomear"}`);
      setSaving(null);
      return;
    }
    setValores((prev) => prev.map((r) => r.modelo === v.modelo && r.armazenamento === v.armazenamento ? { ...r, armazenamento: novoArmaz } : r));
    const e = { ...editingSpecs }; delete e[key]; setEditingSpecs(e);
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
    const { linha, modelo } = novoModelo;
    const specFields = SPEC_FIELDS_BY_CAT[catFilter] || [];
    const linhas = LINHAS_BY_CAT[catFilter] || [];

    if (linhas.length > 0 && !linha) { setMsg("Selecione a linha"); return; }
    if (!modelo.trim()) { setMsg("Preencha o modelo (variante)"); return; }

    // Ignora variantes totalmente vazias (linhas ociosas do form) mas rejeita
    // variantes parciais — se preencheu qualquer coisa, tem que preencher tudo.
    const parsed: { armazenamento: string; valor_base: number }[] = [];
    for (const [idx, v] of variantes.entries()) {
      const hasAnySpec = specFields.some((f) => v.specs[f.key]?.trim());
      const hasValor = v.valor_base.trim();
      if (!hasAnySpec && !hasValor) continue; // linha vazia, pula
      const missing = specFields.find((f) => !v.specs[f.key]?.trim());
      if (missing) { setMsg(`Variante ${idx + 1}: selecione ${missing.label.toLowerCase()}`); return; }
      if (!hasValor) { setMsg(`Variante ${idx + 1}: preencha o valor base`); return; }
      const val = parseFloat(v.valor_base);
      if (isNaN(val) || val < 0) { setMsg(`Variante ${idx + 1}: valor invalido`); return; }
      parsed.push({
        armazenamento: specFields.map((f) => v.specs[f.key].trim()).join(" | "),
        valor_base: val,
      });
    }
    if (parsed.length === 0) { setMsg("Preencha pelo menos 1 variante"); return; }

    const modeloFinal = buildModeloName(catFilter, linha, modelo);
    setSaving("add-modelo");
    for (const p of parsed) {
      await apiPost({ action: "upsert_valor", modelo: modeloFinal, armazenamento: p.armazenamento, valor_base: p.valor_base });
    }
    setValores((prev) => {
      const updated = [...prev];
      for (const p of parsed) {
        const exists = updated.findIndex((v) => v.modelo === modeloFinal && v.armazenamento === p.armazenamento);
        if (exists >= 0) updated[exists] = { ...updated[exists], valor_base: p.valor_base };
        else updated.push({ id: crypto.randomUUID(), modelo: modeloFinal, armazenamento: p.armazenamento, valor_base: p.valor_base, ativo: true });
      }
      return updated;
    });
    setMsg(
      parsed.length === 1
        ? `${modeloFinal} ${parsed[0].armazenamento} adicionado com valor R$ ${parsed[0].valor_base.toLocaleString("pt-BR")}!`
        : `${parsed.length} variantes de ${modeloFinal} adicionadas!`
    );
    // Reseta as variantes pra 1 linha vazia (mantem linha+modelo pra
    // facilitar cadastrar outro modelo da mesma categoria em sequencia).
    setVariantes([{ id: crypto.randomUUID(), specs: {}, valor_base: "" }]);
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

  // Agrupar valores por modelo — filtrado pela categoria e escondendo os que
  // ja estao na aba "Excluidos" (pra nao editar em dois lugares). Match exato
  // case-insensitive — diferente do cliente que usa `includes()` fuzzy.
  //
  // Pra iPad e Watch, particiona tambem por conectividade (Wifi/Wifi+Cel ou
  // GPS/GPS+Cel) — cada card vira "iPad Pro M2 · Wifi" ou "Apple Watch
  // Series 10 · GPS + Cel". Isso tira a coluna Conectividade de cada row e
  // usa uma tag no header. Pra iPhone/MacBook, agrupa so por modelo.
  const excluidosSet = new Set(excluidos.map((m) => m.toLowerCase()));
  const partitionByConect = catFilter === "ipad" || catFilter === "watch";
  const extractConect = (armazenamento: string): string => {
    if (!partitionByConect) return "";
    // Ordem em SPEC_FIELDS_BY_CAT: iPad = [armaz, tela, conect]; Watch = [tamanho, conect]
    const parts = armazenamento.split("|").map((p) => p.trim());
    const specFields = SPEC_FIELDS_BY_CAT[catFilter] || [];
    const idx = specFields.findIndex((f) => f.key === "conectividade");
    return idx >= 0 ? (parts[idx] || "") : "";
  };
  const grouped: Record<string, ValorUsado[]> = {};
  const groupMeta: Record<string, { modelo: string; conectividade: string }> = {};
  valores
    .filter(v => v.modelo.startsWith(catPrefix))
    .filter(v => !excluidosSet.has(v.modelo.toLowerCase()))
    .forEach((v) => {
      const conect = extractConect(v.armazenamento);
      const key = partitionByConect && conect ? `${v.modelo} · ${conect}` : v.modelo;
      if (!grouped[key]) { grouped[key] = []; groupMeta[key] = { modelo: v.modelo, conectividade: conect }; }
      grouped[key].push(v);
    });
  // Ordenar variantes dentro de cada modelo por capacidade crescente
  // (64GB → 128GB → 256GB → 512GB → 1TB). Formatos desconhecidos caem no
  // final. Mesma regra da listagem de seminovos em /admin/precos.
  const storageToGB = (s: string): number => {
    const m = s.match(/(\d+(?:[.,]\d+)?)\s*(TB|GB|MB)?/i);
    if (!m) return Number.POSITIVE_INFINITY;
    const num = parseFloat(m[1].replace(",", "."));
    const unit = (m[2] || "GB").toUpperCase();
    if (unit === "TB") return num * 1000;
    if (unit === "MB") return num / 1000;
    return num;
  };
  for (const gkey of Object.keys(grouped)) {
    grouped[gkey].sort((a, b) => storageToGB(a.armazenamento) - storageToGB(b.armazenamento));
  }

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

      {/* Form adicionar modelo — campos variam conforme a categoria aberta */}
      {showAddModelo && (() => {
        const specFields = SPEC_FIELDS_BY_CAT[catFilter] || [];
        const linhas = LINHAS_BY_CAT[catFilter] || [];
        const placeholder = MODELO_PLACEHOLDER_BY_CAT[catFilter] || "Ex: 17 Pro Max";
        // Preview do nome final que vai ser gravado
        const nomePreview = novoModelo.linha && novoModelo.modelo
          ? buildModeloName(catFilter, novoModelo.linha, novoModelo.modelo)
          : "";
        const varColsClass = specFields.length + 2 <= 3 ? "md:grid-cols-3" : specFields.length + 2 <= 4 ? "md:grid-cols-4" : "md:grid-cols-5";
        const updateVariante = (id: string, patch: Partial<VarianteNova>) => {
          setVariantes((prev) => prev.map((x) => x.id === id ? { ...x, ...patch, specs: { ...x.specs, ...(patch.specs || {}) } } : x));
        };
        return (
        <div className="bg-white border border-[#E8740E]/30 rounded-2xl p-5 shadow-sm space-y-4">
          <p className="text-sm font-bold text-[#1D1D1F]">Adicionar Modelo Seminovo</p>

          {/* Linha + Modelo (topo) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {linhas.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#86868B] uppercase mb-1">Linha</p>
                <select
                  value={novoModelo.linha}
                  onChange={(e) => setNovoModelo({ ...novoModelo, linha: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
                  autoFocus
                >
                  <option value="">— Selecionar —</option>
                  {linhas.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}
            <div className={linhas.length > 0 ? "md:col-span-2" : "md:col-span-3"}>
              <p className="text-[10px] font-semibold text-[#86868B] uppercase mb-1">Modelo (variante)</p>
              <input
                value={novoModelo.modelo}
                onChange={(e) => setNovoModelo({ ...novoModelo, modelo: e.target.value })}
                placeholder={placeholder}
                className="w-full px-3 py-2 rounded-xl border border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
              />
            </div>
          </div>

          {nomePreview && (
            <p className="text-[11px] text-[#86868B]">
              Sera gravado como: <strong className="text-[#1D1D1F]">{nomePreview}</strong>
            </p>
          )}

          {/* Variantes (1+ configs pro mesmo modelo) */}
          <div className="space-y-2 pt-2 border-t border-[#F5F5F7]">
            <p className="text-[10px] font-semibold text-[#86868B] uppercase">Configuracoes ({variantes.length})</p>
            {variantes.map((v, idx) => (
              <div key={v.id} className={`grid grid-cols-1 ${varColsClass} gap-2 items-end bg-[#FAFAFC] rounded-xl p-2`}>
                {specFields.map((f) => (
                  <div key={f.key}>
                    {idx === 0 && <p className="text-[9px] font-semibold text-[#86868B] uppercase mb-0.5">{f.label}</p>}
                    <select
                      value={v.specs[f.key] || ""}
                      onChange={(e) => updateVariante(v.id, { specs: { [f.key]: e.target.value } })}
                      className="w-full px-2 py-1.5 rounded-lg border border-[#D2D2D7] text-xs focus:outline-none focus:border-[#E8740E]"
                    >
                      <option value="">— {f.label} —</option>
                      {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
                <div>
                  {idx === 0 && <p className="text-[9px] font-semibold text-[#86868B] uppercase mb-0.5">Valor (R$)</p>}
                  <input
                    type="number"
                    value={v.valor_base}
                    onChange={(e) => updateVariante(v.id, { valor_base: e.target.value })}
                    placeholder="3500"
                    className="w-full px-2 py-1.5 rounded-lg border border-[#D2D2D7] text-xs focus:outline-none focus:border-[#E8740E]"
                    onKeyDown={(e) => e.key === "Enter" && handleAddModelo()}
                  />
                </div>
                <div className="flex items-center">
                  <button
                    onClick={() => {
                      setVariantes((prev) => prev.length === 1
                        ? [{ id: crypto.randomUUID(), specs: {}, valor_base: "" }]
                        : prev.filter((x) => x.id !== v.id));
                    }}
                    title={variantes.length === 1 ? "Limpar" : "Remover variante"}
                    className="px-2 py-1.5 rounded-lg text-xs text-[#86868B] hover:text-red-600 border border-[#D2D2D7] hover:border-red-300"
                  >
                    {variantes.length === 1 ? "Limpar" : "Remover"}
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={() => setVariantes((prev) => [...prev, { id: crypto.randomUUID(), specs: {}, valor_base: "" }])}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#E8740E] border border-dashed border-[#E8740E] hover:bg-[#FFF7ED] transition-colors"
            >
              + Adicionar outra configuracao
            </button>
          </div>

          {/* Acoes */}
          <div className="flex gap-2 pt-2 border-t border-[#F5F5F7]">
            <button onClick={handleAddModelo} disabled={saving === "add-modelo"} className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] disabled:opacity-50">
              {saving === "add-modelo" ? "Salvando..." : variantes.length > 1 ? `Adicionar ${variantes.length} configuracoes` : "Adicionar"}
            </button>
            <button onClick={() => setShowAddModelo(false)} className="px-4 py-2 rounded-xl border border-[#D2D2D7] text-[#86868B] text-sm hover:border-[#E8740E]">
              Fechar
            </button>
          </div>

          <p className="text-[10px] text-[#86868B]">
            Dica: o <strong>Modelo</strong> e so a variante (ex: &quot;M3&quot;, &quot;10º Geracao&quot;) — o prefixo e a linha sao adicionados automaticamente. Use &quot;+ Adicionar outra configuracao&quot; pra cadastrar varias variantes (armaz/tela/conect/valor) do mesmo modelo de uma vez.
          </p>
        </div>
        );
      })()}

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
        {/* Link pro ambiente de teste — mostra mesmo quando categoria esta
            desativada pro cliente. Quando ja esta ativa, o admin pode testar
            no /troca publico; o botao aqui atalha pro ambiente que NAO respeita
            o filtro de ativo, util pra testar antes de ligar. */}
        <div className="h-5 w-px bg-[#D2D2D7]" />
        <a
          href="/admin/simulador-teste"
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#FFF7ED] text-[#E8740E] border border-[#E8740E]/40 hover:bg-[#FFEFE0] transition-colors whitespace-nowrap"
          title="Abre o simulador em modo teste (admin-only), ignorando o filtro de desativado"
        >
          🧪 Testar como cliente
        </a>
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
            Object.entries(grouped).map(([groupKey, rows]) => {
              const meta = groupMeta[groupKey] || { modelo: groupKey, conectividade: "" };
              const modelo = meta.modelo;
              const conectividade = meta.conectividade;
              // No card particionado por conectividade, a conectividade ja e
              // fixa — ao abrir "+ Variante" pre-preenche pra o admin so
              // preencher armaz/tela.
              const initNewVariante = (): { specs: Record<string, string>; valor_base: string } => ({
                specs: conectividade ? { conectividade } : {},
                valor_base: "",
              });
              return (
              <div key={groupKey} className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 bg-[#F5F5F7] border-b border-[#D2D2D7] flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-[#1D1D1F]">{modelo}</h3>
                    {conectividade && (
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200">
                        {conectividade}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAddingVariante((prev) => ({ ...prev, [groupKey]: prev[groupKey] || initNewVariante() }))}
                      disabled={addingVariante[groupKey] !== undefined}
                      className="px-3 py-1 rounded-lg text-xs font-semibold text-[#E8740E] border border-[#E8740E] bg-white hover:bg-[#FFF7ED] transition-colors whitespace-nowrap disabled:opacity-40"
                      title={conectividade ? `Adiciona uma variante (armaz/tela) pro ${modelo} ${conectividade}` : "Adiciona uma variante para esse modelo"}
                    >
                      ➕ Variante
                    </button>
                    <button
                      onClick={async () => {
                        const novo = prompt(`Renomear "${modelo}" para:`, modelo);
                        if (novo === null) return; // cancelou
                        const trimmed = novo.trim();
                        if (!trimmed || trimmed === modelo) return;
                        if (!confirm(`Renomear "${modelo}" para "${trimmed}"?\n\nIsso atualiza TODAS as variantes (armazenamento), descontos ligados ao modelo, registros de excluidos e de garantia.`)) return;
                        const res = await apiPost({ action: "rename_modelo", modelo_antigo: modelo, modelo_novo: trimmed });
                        const json = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          alert(`Erro ao renomear: ${json.error || res.statusText}`);
                          return;
                        }
                        // Atualiza state local: valores, descontos, excluidos
                        setValores((prev) => prev.map((v) => v.modelo === modelo ? { ...v, modelo: trimmed } : v));
                        setDescontos((prev) => prev.map((d) => d.condicao.startsWith(`${modelo} - `) ? { ...d, condicao: `${trimmed}${d.condicao.substring(modelo.length)}` } : d));
                        setExcluidos((prev) => prev.map((m) => m === modelo ? trimmed : m));
                      }}
                      className="px-3 py-1 rounded-lg text-xs font-semibold text-blue-600 border border-blue-200 bg-white hover:bg-blue-50 transition-colors whitespace-nowrap"
                      title="Muda o nome do modelo (atualiza todas as tabelas relacionadas em cascata)"
                    >
                      ✏️ Renomear
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Excluir "${modelo}" do simulador?\n\nCliente nao vera mais esse modelo na lista de troca. Pra reativar, va na aba "Excluidos" e remova da lista.`)) return;
                        await apiPost({ action: "add_excluido", modelo });
                        setExcluidos((prev) => prev.includes(modelo) ? prev : [...prev, modelo]);
                      }}
                      className="px-3 py-1 rounded-lg text-xs font-semibold text-red-600 border border-red-200 bg-white hover:bg-red-50 transition-colors whitespace-nowrap"
                      title="Move esse modelo pra aba 'Excluidos' — some do simulador do cliente"
                    >
                      🚫 Excluir do simulador
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`APAGAR "${modelo}" DE VEZ?\n\nIsso remove todos os armazenamentos, garantias, descontos por modelo e a entrada em "Excluidos" desse modelo. Nao da pra desfazer — so re-cadastrando.\n\nUse quando o modelo foi cadastrado errado ou saiu de catalogo.`)) return;
                        const res = await apiPost({ action: "delete_modelo_full", modelo });
                        if (!res.ok) { const j = await res.json().catch(() => ({})); alert(`Erro: ${j.error || "falha ao apagar"}`); return; }
                        setValores((prev) => prev.filter((v) => v.modelo !== modelo));
                        setDescontos((prev) => prev.filter((d) => !d.condicao.startsWith(`${modelo} - `)));
                        setExcluidos((prev) => prev.filter((m) => m !== modelo));
                      }}
                      className="px-3 py-1 rounded-lg text-xs font-semibold text-white bg-red-600 border border-red-700 hover:bg-red-700 transition-colors whitespace-nowrap"
                      title="Apaga o modelo completamente do banco (todos os armazenamentos, garantias e descontos). Diferente de 'Excluir do simulador' — nao da pra desfazer."
                    >
                      🗑️ Apagar de vez
                    </button>
                  </div>
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
                      const specKey = key;
                      const isEditSpecs = editingSpecs[specKey] !== undefined;
                      const specFieldsEdit = SPEC_FIELDS_BY_CAT[catFilter] || [];
                      // Ao iniciar edicao: split do `armazenamento` por "|" e mapeia
                      // cada parte pro field.key correspondente (pela ordem). Permite
                      // editar iPad/Watch (formato "|") com selects pre-definidos.
                      const initSpecsEdit = (): Record<string, string> => {
                        const parts = v.armazenamento.split("|").map((p) => p.trim());
                        const out: Record<string, string> = {};
                        specFieldsEdit.forEach((f, idx) => { out[f.key] = parts[idx] || ""; });
                        return out;
                      };
                      const specs = editingSpecs[specKey] || initSpecsEdit();
                      return (
                        <tr key={key} className="border-b border-[#F5F5F7] last:border-0 hover:bg-[#F5F5F7] transition-colors">
                          <td className="px-5 py-3 font-medium">
                            {isEditSpecs && specFieldsEdit.length > 0 ? (
                              <div className="flex items-end gap-2 flex-wrap">
                                {specFieldsEdit.map((f, idx) => {
                                  const curVal = specs[f.key] || "";
                                  const hasInOptions = f.options.includes(curVal);
                                  return (
                                    <div key={f.key} className="flex flex-col">
                                      <label className="text-[9px] uppercase tracking-wider text-[#86868B] font-semibold mb-0.5">{f.label}</label>
                                      <select
                                        value={curVal}
                                        onChange={(e) => setEditingSpecs({ ...editingSpecs, [specKey]: { ...specs, [f.key]: e.target.value } })}
                                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveSpecs(v, catFilter); if (e.key === "Escape") { const x = { ...editingSpecs }; delete x[specKey]; setEditingSpecs(x); } }}
                                        autoFocus={idx === 0}
                                        className={`px-2 py-1 rounded border text-xs focus:outline-none ${idx === 0 ? "border-[#E8740E]" : "border-[#D2D2D7]"}`}
                                      >
                                        <option value="">—</option>
                                        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                                        {curVal && !hasInOptions && <option value={curVal}>{curVal}</option>}
                                      </select>
                                    </div>
                                  );
                                })}
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleSaveSpecs(v, catFilter)}
                                    disabled={saving === specKey}
                                    title="Salvar (Enter)"
                                    className="px-2 py-1 rounded text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#F5A623] disabled:opacity-50"
                                  >
                                    {saving === specKey ? "..." : "OK"}
                                  </button>
                                  <button
                                    onClick={() => { const x = { ...editingSpecs }; delete x[specKey]; setEditingSpecs(x); }}
                                    title="Cancelar (Esc)"
                                    className="px-2 py-1 rounded text-xs text-[#86868B] hover:text-[#1D1D1F] border border-[#D2D2D7]"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ) : (
                              (() => {
                                // Se o card ja tem tag de conectividade no header
                                // (iPad/Watch particionado), tira a conectividade do
                                // display pra nao repetir "64GB | 11" | Wifi" em todas
                                // as rows — mostra so "64GB | 11"".
                                const displayArmaz = conectividade
                                  ? v.armazenamento.split("|").map((p) => p.trim()).filter((p) => p !== conectividade).join(" | ")
                                  : v.armazenamento;
                                return (
                                  <button
                                    type="button"
                                    title="Clique para editar"
                                    onClick={() => setEditingSpecs({ ...editingSpecs, [specKey]: initSpecsEdit() })}
                                    className="text-left text-sm font-medium text-[#1D1D1F] hover:text-[#E8740E] transition-colors group"
                                  >
                                    {displayArmaz || "—"}
                                    <span className="ml-1.5 text-[#C7C7CC] group-hover:text-[#E8740E] text-xs">✏️</span>
                                  </button>
                                );
                              })()
                            )}
                          </td>
                          <td className="px-5 py-3">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[#86868B] text-sm">R$</span>
                                <input
                                  type="number"
                                  value={editing[key]}
                                  onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
                                  onKeyDown={(e) => e.key === "Enter" && handleSaveValor(v)}
                                  placeholder="0 = sem preco fixo"
                                  className={inputCls}
                                  autoFocus
                                />
                              </div>
                            ) : v.valor_base === 0 ? (
                              <button
                                type="button"
                                onClick={() => setEditing({ ...editing, [key]: String(v.valor_base) })}
                                title="Sem preco fixo — cliente vai ser direcionado pro WhatsApp manual pra cotar essa variante. Clique para definir um valor."
                                className="px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 text-xs font-medium border border-orange-200 hover:bg-orange-100 transition-colors"
                              >
                                Sem preco fixo
                              </button>
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
                    {/* Row inline pra adicionar nova variante — aparece quando o admin
                        clica no botao "+ Variante" do header. Se o card ja foi
                        particionado por conectividade (iPad/Watch), o select de
                        conectividade some — ja vem pre-preenchido do groupMeta. */}
                    {addingVariante[groupKey] && (() => {
                      const allSpecFields = SPEC_FIELDS_BY_CAT[catFilter] || [];
                      const specFieldsToShow = conectividade ? allSpecFields.filter((f) => f.key !== "conectividade") : allSpecFields;
                      const entry = addingVariante[groupKey];
                      const savingKey = `new-variante-${modelo}`;
                      const isSavingNew = saving === savingKey;
                      return (
                        <tr className="bg-[#FFF7ED] border-t-2 border-[#E8740E]">
                          <td className="px-5 py-3" colSpan={4}>
                            <div className="flex items-end gap-2 flex-wrap">
                              {specFieldsToShow.map((f) => (
                                <div key={f.key} className="flex flex-col">
                                  <label className="text-[9px] uppercase tracking-wider text-[#86868B] font-semibold mb-0.5">{f.label}</label>
                                  <select
                                    value={entry.specs[f.key] || ""}
                                    onChange={(e) => setAddingVariante({ ...addingVariante, [groupKey]: { ...entry, specs: { ...entry.specs, [f.key]: e.target.value } } })}
                                    className="px-2 py-1 rounded border border-[#D2D2D7] text-xs focus:outline-none focus:border-[#E8740E]"
                                  >
                                    <option value="">—</option>
                                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                </div>
                              ))}
                              <div className="flex flex-col">
                                <label className="text-[9px] uppercase tracking-wider text-[#86868B] font-semibold mb-0.5">Valor (R$)</label>
                                <input
                                  type="number"
                                  value={entry.valor_base}
                                  onChange={(e) => setAddingVariante({ ...addingVariante, [groupKey]: { ...entry, valor_base: e.target.value } })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveNewVariante(groupKey, modelo, catFilter);
                                    if (e.key === "Escape") { const x = { ...addingVariante }; delete x[groupKey]; setAddingVariante(x); }
                                  }}
                                  placeholder="Ex: 3500 (0 = sem preco fixo)"
                                  className="w-48 px-2 py-1 rounded border border-[#D2D2D7] text-xs focus:outline-none focus:border-[#E8740E]"
                                />
                              </div>
                              <div className="flex gap-1 ml-auto">
                                <button
                                  onClick={() => handleSaveNewVariante(groupKey, modelo, catFilter)}
                                  disabled={isSavingNew}
                                  title="Adicionar (Enter)"
                                  className="px-3 py-1 rounded text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#F5A623] disabled:opacity-50"
                                >
                                  {isSavingNew ? "..." : "Adicionar"}
                                </button>
                                <button
                                  onClick={() => { const x = { ...addingVariante }; delete x[groupKey]; setAddingVariante(x); }}
                                  title="Cancelar (Esc)"
                                  className="px-2 py-1 rounded text-xs text-[#86868B] hover:text-[#1D1D1F] border border-[#D2D2D7]"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
              );
            })
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
