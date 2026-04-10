"use client";

import React, { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import {
  CATEGORIAS,
  CAT_LABELS,
  STRUCTURED_CATS,
  IPHONE_ORIGENS,
  WATCH_PULSEIRAS,
  WATCH_BAND_MODELS,
  MACBOOK_RAMS,
  MACBOOK_STORAGES,
  MACBOOK_NUCLEOS,
  MAC_MINI_CHIPS,
  MAC_MINI_NUCLEOS,
  MAC_MINI_RAMS,
  MAC_MINI_STORAGES,
  MAC_STUDIO_CHIPS,
  MAC_STUDIO_NUCLEOS,
  MAC_STUDIO_RAMS,
  MAC_STUDIO_STORAGES,
  CORES_POR_CATEGORIA,
  COR_OBRIGATORIA,
  getIphoneCores,
  getIphoneStorages,
  type ProdutoSpec,
  DEFAULT_SPEC,
  buildProdutoName,
} from "@/lib/produto-specs";

// ─── Catalog types ────────────────────────────────────────────────────────────

interface CatalogoModelo {
  id: string;
  categoria_key: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

// ─── Category → catalog keys ──────────────────────────────────────────────────

const CAT_TO_CATALOG: Record<string, string[]> = {
  IPHONES: ["IPHONES"],
  MACBOOK: ["MACBOOK_AIR", "MACBOOK_PRO", "MACBOOK_NEO"],
  MAC_MINI: ["MAC_MINI"],
  IMAC: ["IMAC"],
  MAC_STUDIO: ["MAC_STUDIO"],
  IPADS: ["IPADS"],
  APPLE_WATCH: ["APPLE_WATCH"],
  AIRPODS: ["AIRPODS"],
  ACESSORIOS: ["ACESSORIOS"],
};

// ─── Module-level catalog cache ───────────────────────────────────────────────

let _catalogCache: CatalogoModelo[] | null = null;
let _catalogPromise: Promise<CatalogoModelo[]> | null = null;

async function fetchAllModelos(password: string): Promise<CatalogoModelo[]> {
  if (_catalogCache) return _catalogCache;
  if (_catalogPromise) return _catalogPromise;
  _catalogPromise = fetch("/api/admin/catalogo", {
    headers: { "x-admin-password": password },
  })
    .then((r) => r.json())
    .then((d) => {
      _catalogCache = (d.modelos || []).filter((m: CatalogoModelo) => m.ativo);
      _catalogPromise = null;
      return _catalogCache!;
    })
    .catch(() => {
      _catalogPromise = null;
      return [];
    });
  return _catalogPromise;
}

// ─── Infer ProdutoSpec fields from catalog model name ─────────────────────────

function inferSpecFromCatalogModel(nome: string, categoria: string): Partial<ProdutoSpec> {
  const s: Partial<ProdutoSpec> = {};
  if (categoria === "IPHONES") {
    s.ip_modelo = nome.replace(/^iPhone\s+/i, "").toUpperCase();
  } else if (categoria === "IPADS") {
    const n = nome.toLowerCase();
    // Mini
    if (/mini/.test(n)) {
      if (/mini\s*7/.test(n)) s.ipad_modelo = "MINI 7";
      else if (/mini\s*6/.test(n)) s.ipad_modelo = "MINI 6";
      else s.ipad_modelo = "MINI 6";
    }
    // Pro — checar M4 primeiro
    else if (/pro/.test(n)) {
      const is13 = /13|12\.9/.test(n);
      if (/m4/.test(n)) s.ipad_modelo = is13 ? "PRO M4 13" : "PRO M4 11";
      else s.ipad_modelo = is13 ? "PRO 12.9" : "PRO 11";
    }
    // Air
    else if (/air/.test(n)) {
      if (/m4/.test(n)) s.ipad_modelo = "AIR M4";
      else if (/m3/.test(n)) s.ipad_modelo = "AIR M3";
      else if (/m2/.test(n)) s.ipad_modelo = "AIR M2";
      else if (/\b5\b/.test(n)) s.ipad_modelo = "AIR 5";
      else if (/\b4\b/.test(n)) s.ipad_modelo = "AIR 4";
      else s.ipad_modelo = "AIR M4";
    }
    else s.ipad_modelo = "IPAD";
    // Chip separado — só preenche se NÃO estiver já embutido no ipad_modelo
    const modeloStr = (s.ipad_modelo || "").toUpperCase();
    const chip = nome.match(/\b(M\d+(\s+(PRO|MAX))?|A\d+)\b/i);
    const chipStr = chip ? chip[1].toUpperCase() : "";
    s.ipad_chip = chipStr && !modeloStr.includes(chipStr) ? chipStr : "";
  } else if (categoria === "MACBOOK") {
    if (/air/i.test(nome)) s.mb_modelo = "AIR";
    else if (/neo/i.test(nome)) s.mb_modelo = "NEO";
    else s.mb_modelo = "PRO";
    // MacBook Neo sempre usa A18 PRO (chip fixo)
    if (s.mb_modelo === "NEO") {
      s.mb_chip = "A18 PRO";
    } else {
      const chip = nome.match(/\b(M\d+(\s+(PRO|MAX))?)\b/i);
      s.mb_chip = chip ? chip[1].toUpperCase() : "";
    }
    s.mb_nucleos = ""; // hide nucleos when using catalog model
  } else if (categoria === "MAC_MINI") {
    const chip = nome.match(/\b(M\d+(\s+(PRO|MAX))?)\b/i);
    s.mm_chip = chip ? chip[1].toUpperCase() : "";
    s.mm_nucleos = ""; // user selects nucleos manually
  } else if (categoria === "APPLE_WATCH") {
    const part = nome.replace(/^Apple Watch\s+/i, "");
    if (/SE.*2|2.*SE/i.test(part)) { s.aw_modelo = "SE 2"; s.aw_tamanho = "40mm"; }
    else if (/SE.*3|3.*SE/i.test(part)) { s.aw_modelo = "SE 3"; s.aw_tamanho = "40mm"; }
    else if (/SE/i.test(part)) { s.aw_modelo = "SE"; s.aw_tamanho = "40mm"; }
    else {
      const ultra = part.match(/ultra\s*(\d+)/i);
      const series = part.match(/series\s*(\d+)/i);
      if (ultra) { s.aw_modelo = `ULTRA ${ultra[1]}`; s.aw_tamanho = "49mm"; }
      else if (series) {
        s.aw_modelo = `SERIES ${series[1]}`;
        s.aw_tamanho = Number(series[1]) >= 10 ? "42mm" : "41mm";
      } else {
        s.aw_modelo = part.toUpperCase().replace(/[°º]/g, "").trim();
        s.aw_tamanho = "42mm";
      }
    }
  } else if (categoria === "AIRPODS") {
    s.air_modelo = nome.toUpperCase().replace(/[°º]/g, "").replace(/\s+/g, " ").trim();
  }
  return s;
}

// ─── Fallback model lists ─────────────────────────────────────────────────────

const IPHONE_MODELOS_FULL = [
  "11", "11 PRO", "11 PRO MAX", "12", "12 PRO", "12 PRO MAX",
  "13", "13 PRO", "13 PRO MAX", "14", "14 PLUS", "14 PRO", "14 PRO MAX",
  "15", "15 PLUS", "15 PRO", "15 PRO MAX",
  "16", "16 PLUS", "16E", "16 PRO", "16 PRO MAX",
  "17", "17 AIR", "17 PRO", "17 PRO MAX",
];
const AIRPODS_MODELOS_FULL = ["AIRPODS 4", "AIRPODS 4 ANC", "AIRPODS PRO 2", "AIRPODS PRO 3", "AIRPODS MAX 2024 USB-C"];
const WATCH_TAMANHOS_FULL = ["40mm", "42mm", "44mm", "45mm", "46mm", "49mm"];

// ─── Row state ────────────────────────────────────────────────────────────────

export interface ProdutoRowState {
  categoria: string;
  catalogo_modelo_id: string;
  catalogo_modelo_nome: string;
  spec: ProdutoSpec;
  produto: string;
  cor: string;
  qnt: string;
  custo_unitario: string;
  fornecedor: string;
  cliente: string; // quando comprado de um cliente registrado (sobrescreve fornecedor)
  imei: string;
  serial_no: string;
  condicao: string; // "NOVO" | "NAO_ATIVADO" | "SEMINOVO"
  caixa: boolean;   // tem caixa original?
  grade: string;    // grade de qualidade: "A+" | "A" | "AB" | "B" | ""
}

export function createEmptyProdutoRow(): ProdutoRowState {
  return {
    categoria: "IPHONES",
    catalogo_modelo_id: "",
    catalogo_modelo_nome: "",
    spec: { ...DEFAULT_SPEC },
    produto: "",
    cor: "",
    qnt: "1",
    custo_unitario: "",
    fornecedor: "",
    cliente: "",
    imei: "",
    serial_no: "",
    condicao: "NOVO",
    caixa: false,
    grade: "",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ProdutoSpecFieldsProps {
  row: ProdutoRowState;
  onChange: (updated: ProdutoRowState) => void;
  onRemove: () => void;
  onDuplicate?: () => void;
  fornecedores: { id: string; nome: string }[];
  inputCls: string;
  labelCls: string;
  darkMode: boolean;
  index: number;
  compactMode?: boolean; // oculta fornecedor, grade/caixa, qtd/custo/imei/serial — para seção de troca
}

export default function ProdutoSpecFields({
  row,
  onChange,
  onRemove,
  onDuplicate,
  fornecedores,
  inputCls,
  labelCls,
  darkMode: dm,
  index,
  compactMode = false,
}: ProdutoSpecFieldsProps) {
  const { password } = useAdmin();
  const bgSection = dm ? "bg-[#2C2C2E]" : "bg-[#F9F9FB]";

  const [allModelos, setAllModelos] = useState<CatalogoModelo[]>([]);
  const [modeloConfigs, setModeloConfigs] = useState<Record<string, string[]>>({});

  // Client search state
  const [clienteQuery, setClienteQuery] = useState(row.cliente || "");
  const [clienteSuggestions, setClienteSuggestions] = useState<string[]>([]);
  const [clienteLoading, setClienteLoading] = useState(false);
  const [showClienteSugg, setShowClienteSugg] = useState(false);
  const [linhaFiltro, setLinhaFiltro] = useState<string>("");
  const clienteDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch all catalog models once
  useEffect(() => {
    if (!password) return;
    fetchAllModelos(password).then(setAllModelos);
  }, [password]);

  // Auto-match produto to catalog model when models load OR when produto/categoria changes and catalogo_modelo_id is still empty
  useEffect(() => {
    if (!allModelos.length || row.catalogo_modelo_id || !row.produto) return;
    const catalogKeys = CAT_TO_CATALOG[row.categoria] || [];
    const catModelos = allModelos.filter((m) => catalogKeys.includes(m.categoria_key));
    if (!catModelos.length) return;
    const prodUpper = row.produto.toUpperCase();
    // Find the longest catalog model name that appears in the product name
    const match = catModelos
      .map((m) => ({ m, nome: m.nome.replace(/^iPhone\s+/i, "").toUpperCase() }))
      .filter(({ nome }) => prodUpper.includes(nome))
      .sort((a, b) => b.nome.length - a.nome.length)[0];
    if (match) {
      const specFromCatalog = inferSpecFromCatalogModel(match.m.nome, row.categoria);
      onChange({
        ...row,
        catalogo_modelo_id: match.m.id,
        catalogo_modelo_nome: match.m.nome,
        spec: { ...row.spec, ...specFromCatalog },
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allModelos, row.produto, row.categoria]);

  // Fetch configs when catalog model changes
  useEffect(() => {
    const modeloId = row.catalogo_modelo_id;
    if (!modeloId || !password) { setModeloConfigs({}); return; }
    fetch(`/api/admin/catalogo?modelo_id=${modeloId}`, {
      headers: { "x-admin-password": password },
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.configs) return;
        const grouped: Record<string, string[]> = {};
        d.configs.forEach((c: { tipo_chave: string; valor: string }) => {
          if (!grouped[c.tipo_chave]) grouped[c.tipo_chave] = [];
          grouped[c.tipo_chave].push(c.valor);
        });
        setModeloConfigs(grouped);
      });
  }, [row.catalogo_modelo_id, password]);

  // Models filtered for current category
  const catalogKeys = CAT_TO_CATALOG[row.categoria] || [];
  const categoryModelos = allModelos
    .filter((m) => catalogKeys.includes(m.categoria_key))
    .sort((a, b) => a.ordem - b.ordem);

  const hasCatalogModel = !!row.catalogo_modelo_id;

  // Spec options: usa configs do catálogo se existem, senão fallback hardcoded
  // Isso garante que mesmo se o modelo foi cadastrado no catálogo sem configurar
  // cores/ram/ssd, o dropdown ainda mostra as opções do fallback
  const cfgOr = (key: string, fallback?: string[]): string[] | undefined =>
    (modeloConfigs[key]?.length ? modeloConfigs[key] : fallback);

  const coresKey = row.categoria === "APPLE_WATCH" ? "cores_aw" : "cores";
  const coresFallback = row.categoria === "IPHONES" ? getIphoneCores(row.spec.ip_modelo) : CORES_POR_CATEGORIA[row.categoria];
  const coresOptions: string[] | undefined = cfgOr(coresKey, coresFallback);

  const capacidadeOptions = cfgOr("capacidade", getIphoneStorages(row.spec.ip_modelo));
  const telasOptions = cfgOr("telas", ['8.3"', '10.9"', '11"', '12.9"', '13"', '14"', '15"', '16"']);
  const conectividadeOptions = cfgOr("conectividade", ["Wi-Fi", "Wi-Fi + Cel"]);
  const origemOptions = cfgOr("origem", IPHONE_ORIGENS);
  const ramOptions = cfgOr("ram", MACBOOK_RAMS);
  const ssdOptionsFinal = cfgOr("ssd", MACBOOK_STORAGES);
  const macMiniRamOptions = cfgOr("ram", MAC_MINI_RAMS);
  const macMiniSsdOptions = cfgOr("ssd", MAC_MINI_STORAGES);
  const macStudioRamOptions = cfgOr("ram", MAC_STUDIO_RAMS);
  const macStudioSsdOptions = cfgOr("ssd", MAC_STUDIO_STORAGES);
  // Núcleos: detecta QUALQUER spec type que comece com "chip" no catálogo
  // (chips_air, chips_pro_max, chip_neo, etc.)
  // Se tem modelo do catálogo selecionado, mostra APENAS o que está configurado
  // Se não tem modelo do catálogo, usa fallback hardcoded
  const macNucleosCatalog = Object.entries(modeloConfigs)
    .filter(([key]) => key.startsWith("chip"))
    .flatMap(([, values]) => values);
  const mbNucleosOptions = hasCatalogModel
    ? macNucleosCatalog  // só o que está no catálogo (pode ser vazio = sem dropdown)
    : MACBOOK_NUCLEOS.map(n => `(${n})`);
  const mmNucleosOptions = hasCatalogModel
    ? macNucleosCatalog
    : MAC_MINI_NUCLEOS.map(n => `(${n})`);
  const msNucleosOptions = hasCatalogModel
    ? macNucleosCatalog
    : MAC_STUDIO_NUCLEOS.map(n => `(${n})`);
  const awTamanhoOptions = cfgOr("tamanho_aw", WATCH_TAMANHOS_FULL);
  const awConnOptions = cfgOr("conectividade_aw", ["GPS", "GPS + CEL"]);
  const awBandOptions = cfgOr("pulseiras", WATCH_BAND_MODELS);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const set = (field: keyof ProdutoRowState, value: string | boolean) => {
    const updated = { ...row, [field]: value };
    if (field === "categoria") {
      updated.spec = { ...DEFAULT_SPEC };
      updated.produto = "";
      updated.cor = "";
      updated.catalogo_modelo_id = "";
      updated.catalogo_modelo_nome = "";
    }
    if (field === "cor" && STRUCTURED_CATS.includes(row.categoria)) {
      updated.produto = buildProdutoName(row.categoria, row.spec, value as string);
    }
    onChange(updated);
  };

  const setSpec = (field: keyof ProdutoSpec, value: string) => {
    const newSpec = { ...row.spec, [field]: value };
    const updated = { ...row, spec: newSpec };
    if (field === "ip_modelo") updated.cor = "";
    if (STRUCTURED_CATS.includes(row.categoria)) {
      updated.produto = buildProdutoName(row.categoria, newSpec, field === "ip_modelo" ? "" : row.cor);
    }
    onChange(updated);
  };

  const selectCatalogoModelo = (modelo: CatalogoModelo) => {
    const inferred = inferSpecFromCatalogModel(modelo.nome, row.categoria);
    const newSpec = { ...row.spec, ...inferred };
    const updated: ProdutoRowState = {
      ...row,
      catalogo_modelo_id: modelo.id,
      catalogo_modelo_nome: modelo.nome,
      spec: newSpec,
      cor: "",
      produto: STRUCTURED_CATS.includes(row.categoria)
        ? buildProdutoName(row.categoria, newSpec, "")
        : (modelo.nome || "").toUpperCase(),
    };
    onChange(updated);
  };

  const hasStructured = STRUCTURED_CATS.includes(row.categoria);

  // Client search handler
  const handleClienteChange = (q: string) => {
    setClienteQuery(q);
    set("cliente", q);
    setShowClienteSugg(true);
    if (clienteDebounceRef.current) clearTimeout(clienteDebounceRef.current);
    if (q.length < 2) { setClienteSuggestions([]); return; }
    clienteDebounceRef.current = setTimeout(async () => {
      setClienteLoading(true);
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, {
          headers: { "x-admin-password": password },
        });
        if (res.ok) {
          const json = await res.json();
          const names: string[] = (json.contatos || []).map((c: { nome: string }) => c.nome);
          setClienteSuggestions(names.slice(0, 8));
        }
      } catch { /* ignore */ }
      setClienteLoading(false);
    }, 350);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={`${compactMode ? "" : `p-4 rounded-xl border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-white border-[#E8E8ED]"}`} space-y-3`}>
      {/* Header */}
      {!compactMode && <div className="flex items-center justify-between">
        <span className={`text-xs font-bold ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
          Produto {index + 1}
        </span>
        <div className="flex items-center gap-2">
          {onDuplicate && (
            <button
              onClick={onDuplicate}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
              Duplicar
            </button>
          )}
          <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-sm font-bold transition-colors">✕</button>
        </div>
      </div>}

      {/* Linha 1: Categoria + Modelo + Condição */}
      <div className={`grid gap-3 ${compactMode ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}>
        <div>
          <p className={labelCls}>Categoria</p>
          <select value={row.categoria} onChange={(e) => set("categoria", e.target.value)} className={inputCls}>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
          </select>
        </div>
        {/* Linha (só iPhones) — filtro para reduzir lista de modelos.
            Base é o número (ou SE), variantes "e"/"Plus"/"Pro"/"Pro Max" pertencem à mesma linha. */}
        {row.categoria === "IPHONES" && categoryModelos.length > 0 && (() => {
          const linhaOf = (nome: string): string | null => {
            const m = nome.match(/iPhone\s*(SE|\d+)/i);
            if (!m) return null;
            return m[1].toUpperCase();
          };
          const linhas = Array.from(new Set(
            categoryModelos.map((m) => linhaOf(m.nome)).filter((x): x is string => !!x)
          )).sort((a, b) => {
            if (a === "SE") return 1; if (b === "SE") return -1;
            return parseInt(a) - parseInt(b);
          });
          return (
            <div>
              <p className={labelCls}>Linha</p>
              <select value={linhaFiltro} onChange={(e) => setLinhaFiltro(e.target.value)} className={inputCls}>
                <option value="">— Todas —</option>
                {linhas.map((l) => <option key={l} value={l}>{l === "SE" ? "iPhone SE" : `iPhone ${l}`}</option>)}
              </select>
            </div>
          );
        })()}
        {/* Modelo — vem logo após categoria */}
        {categoryModelos.length > 0 && (() => {
          const linhaOf = (nome: string): string | null => {
            const m = nome.match(/iPhone\s*(SE|\d+)/i);
            return m ? m[1].toUpperCase() : null;
          };
          const modelosFiltrados = row.categoria === "IPHONES" && linhaFiltro
            ? categoryModelos.filter((m) => linhaOf(m.nome) === linhaFiltro)
            : categoryModelos;
          return (
          <div>
            <p className={labelCls}>
              Modelo
              {hasCatalogModel && <span className="ml-1 text-green-500 text-[10px]">✓</span>}
            </p>
            <select
              value={row.catalogo_modelo_id}
              onChange={(e) => {
                const m = categoryModelos.find((m) => m.id === e.target.value);
                if (m) selectCatalogoModelo(m);
              }}
              className={inputCls}
            >
              <option value="">— Selecionar modelo —</option>
              {modelosFiltrados.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
          );
        })()}
        {!compactMode && <div>
          <p className={labelCls}>Condição</p>
          <select value={row.condicao || "NOVO"} onChange={(e) => set("condicao", e.target.value)} className={inputCls}>
            <option value="NOVO">Lacrado</option>
            <option value="NAO_ATIVADO">Não Ativado</option>
            <option value="SEMINOVO">Seminovo</option>
          </select>
        </div>}
      </div>

      {/* Caixa + Grade — só aparece quando não é Lacrado e não é modo compacto */}
      {!compactMode && row.condicao !== "NOVO" && (
        <div className="flex items-center gap-3">
          {/* Caixa toggle */}
          <button
            type="button"
            onClick={() => set("caixa", !row.caixa)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              row.caixa
                ? "bg-green-500/15 border-green-500/40 text-green-600"
                : dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#98989D]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#86868B]"
            }`}
          >
            📦 {row.caixa ? "Com caixa" : "Sem caixa"}
          </button>
          {/* Grade select */}
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-semibold ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Grade</span>
            {(["A+", "A", "AB", "B"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => set("grade", row.grade === g ? "" : g)}
                className={`px-2 h-7 min-w-[28px] rounded-lg text-xs font-bold border transition-colors ${
                  row.grade === g
                    ? g === "A+" ? "bg-amber-500/15 border-amber-500/40 text-amber-600"
                      : g === "A" ? "bg-green-500/15 border-green-500/40 text-green-600"
                      : g === "AB" ? "bg-yellow-500/15 border-yellow-500/40 text-yellow-600"
                      : "bg-orange-500/15 border-orange-500/40 text-orange-600"
                    : dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#98989D]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#86868B]"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Origem da compra: Fornecedor OU Cliente cadastrado — oculto em modo compacto */}
      {!compactMode && <div className={`p-3 rounded-xl border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E8E8ED]"} space-y-2`}>
        <div className="flex items-center justify-between">
          <p className={`${labelCls} mb-0`}>Origem da compra</p>
          <div className={`flex rounded-lg overflow-hidden border text-[11px] font-semibold ${dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"}`}>
            <button
              type="button"
              onClick={() => { set("cliente", ""); setClienteQuery(""); }}
              className={`px-3 py-1 transition-colors ${!row.cliente ? "bg-[#E8740E] text-white" : dm ? "text-[#98989D] hover:text-[#F5F5F7]" : "text-[#86868B] hover:text-[#1D1D1F]"}`}
            >
              Fornecedor
            </button>
            <button
              type="button"
              onClick={() => { set("fornecedor", ""); }}
              className={`px-3 py-1 transition-colors ${row.cliente ? "bg-[#0071E3] text-white" : dm ? "text-[#98989D] hover:text-[#F5F5F7]" : "text-[#86868B] hover:text-[#1D1D1F]"}`}
            >
              Cliente
            </button>
          </div>
        </div>

        {!row.cliente ? (
          /* Modo Fornecedor */
          <select value={row.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} className={inputCls}>
            <option value="">— Selecionar fornecedor —</option>
            {fornecedores.map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}
          </select>
        ) : (
          /* Modo Cliente — mostra cliente selecionado com botão de limpar */
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${dm ? "bg-[#0071E3]/20 border border-[#0071E3]/40" : "bg-blue-50 border border-blue-200"}`}>
            <span className="text-blue-500 text-sm">👤</span>
            <span className={`flex-1 text-sm font-semibold ${dm ? "text-blue-300" : "text-blue-700"}`}>{row.cliente}</span>
            <button
              type="button"
              onClick={() => { set("cliente", ""); setClienteQuery(""); }}
              className="text-[10px] text-red-400 hover:text-red-600 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Busca de cliente (aparece sempre que não há cliente selecionado e modo = cliente) */}
        {!row.cliente && (
          <div className="relative">
            <input
              value={clienteQuery}
              onChange={(e) => handleClienteChange(e.target.value)}
              onFocus={() => clienteQuery.length >= 2 && setShowClienteSugg(true)}
              onBlur={() => setTimeout(() => setShowClienteSugg(false), 200)}
              placeholder="🔍 Buscar cliente cadastrado pelo nome..."
              className={`${inputCls} text-xs`}
              autoComplete="off"
            />
            {showClienteSugg && (clienteSuggestions.length > 0 || clienteLoading) && (
              <div className={`absolute z-20 left-0 right-0 mt-1 rounded-lg border shadow-lg overflow-hidden ${dm ? "bg-[#2C2C2E] border-[#4A4A4C]" : "bg-white border-[#D2D2D7]"}`}>
                {clienteLoading && (
                  <p className={`px-3 py-2 text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Buscando...</p>
                )}
                {clienteSuggestions.map((nome) => (
                  <button
                    key={nome}
                    type="button"
                    onMouseDown={() => {
                      setClienteQuery(nome);
                      set("cliente", nome);
                      setShowClienteSugg(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${dm ? "hover:bg-[#3A3A3C] text-[#F5F5F7]" : "hover:bg-[#F5F5F7] text-[#1D1D1F]"}`}
                  >
                    👤 {nome}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>}

      {/* Modelo selecionado já está na Linha 1 acima */}

      {/* iPhone specs */}
      {row.categoria === "IPHONES" && (
        <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 p-3 ${bgSection} rounded-lg`}>
          {!categoryModelos.length && (
            <div>
              <p className={labelCls}>Modelo</p>
              <select value={row.spec.ip_modelo} onChange={(e) => setSpec("ip_modelo", e.target.value)} className={inputCls}>
                {IPHONE_MODELOS_FULL.map((m) => <option key={m} value={m}>{`iPhone ${m}`}</option>)}
              </select>
            </div>
          )}
          <div>
            <p className={labelCls}>Armazenamento</p>
            <select value={row.spec.ip_storage} onChange={(e) => setSpec("ip_storage", e.target.value)} className={inputCls}>
              <option value="">— Não informar —</option>
              {capacidadeOptions?.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Origem</p>
            <select value={row.spec.ip_origem} onChange={(e) => setSpec("ip_origem", e.target.value)} className={inputCls}>
              <option value="">— Não informar —</option>
              {origemOptions?.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* MacBook specs */}
      {row.categoria === "MACBOOK" && (
        <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 p-3 ${bgSection} rounded-lg`}>
          {!categoryModelos.length && (
            <>
              <div>
                <p className={labelCls}>Modelo</p>
                <select value={row.spec.mb_modelo} onChange={(e) => setSpec("mb_modelo", e.target.value)} className={inputCls}>
                  <option value="AIR">MacBook Air</option>
                  <option value="PRO">MacBook Pro</option>
                  <option value="NEO">MacBook Neo</option>
                </select>
              </div>
              <div>
                <p className={labelCls}>Chip</p>
                <select value={row.spec.mb_chip} onChange={(e) => setSpec("mb_chip", e.target.value)} className={inputCls}>
                  {["A18","A18 PRO","M1","M2","M2 PRO","M3","M3 PRO","M3 MAX","M4","M4 PRO","M4 MAX","M5","M5 PRO","M5 MAX"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </>
          )}
          <div>
            <p className={labelCls}>Núcleos (CPU/GPU)</p>
            <select value={row.spec.mb_nucleos} onChange={(e) => setSpec("mb_nucleos", e.target.value)} className={inputCls}>
              <option value="">— Não informar —</option>
              {(mbNucleosOptions.length > 0
                ? mbNucleosOptions.map((n) => n.replace(/^\(|\)$/g, "").trim())
                : MACBOOK_NUCLEOS
              ).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Tela</p>
            <select value={row.spec.mb_tela} onChange={(e) => setSpec("mb_tela", e.target.value)} className={inputCls}>
              <option value="">— Não informar —</option>
              {telasOptions?.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>RAM</p>
            <select value={row.spec.mb_ram} onChange={(e) => setSpec("mb_ram", e.target.value)} className={inputCls}>
              <option value="">— Não informar —</option>
              {ramOptions?.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Armazenamento</p>
            <select value={row.spec.mb_storage} onChange={(e) => setSpec("mb_storage", e.target.value)} className={inputCls}>
              <option value="">— Não informar —</option>
              {ssdOptionsFinal?.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Mac Mini specs */}
      {row.categoria === "MAC_MINI" && (
        <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 p-3 ${bgSection} rounded-lg`}>
          {!categoryModelos.length && (
            <div>
              <p className={labelCls}>Chip</p>
              <select value={row.spec.mm_chip} onChange={(e) => setSpec("mm_chip", e.target.value)} className={inputCls}>
                {MAC_MINI_CHIPS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}
          {mmNucleosOptions.length > 0 && (
            <div>
              <p className={labelCls}>Núcleos</p>
              <select value={row.spec.mm_nucleos} onChange={(e) => setSpec("mm_nucleos", e.target.value)} className={inputCls}>
                <option value="">— Selecionar —</option>
                {mmNucleosOptions.map((n) => {
                  const clean = n.replace(/^\(|\)$/g, "").trim();
                  return <option key={clean} value={clean}>{clean}</option>;
                })}
              </select>
            </div>
          )}
          <div>
            <p className={labelCls}>RAM</p>
            <select value={row.spec.mm_ram} onChange={(e) => setSpec("mm_ram", e.target.value)} className={inputCls}>
              {macMiniRamOptions?.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Armazenamento</p>
            <select value={row.spec.mm_storage} onChange={(e) => setSpec("mm_storage", e.target.value)} className={inputCls}>
              {macMiniSsdOptions?.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Mac Studio specs */}
      {row.categoria === "MAC_STUDIO" && (
        <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 p-3 ${bgSection} rounded-lg`}>
          {!categoryModelos.length && (
            <div>
              <p className={labelCls}>Chip</p>
              <select value={row.spec.ms_chip} onChange={(e) => setSpec("ms_chip", e.target.value)} className={inputCls}>
                {MAC_STUDIO_CHIPS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}
          {msNucleosOptions.length > 0 && (
            <div>
              <p className={labelCls}>Núcleos</p>
              <select value={row.spec.ms_nucleos} onChange={(e) => setSpec("ms_nucleos", e.target.value)} className={inputCls}>
                <option value="">— Selecionar —</option>
                {msNucleosOptions.map((n) => {
                  const clean = n.replace(/^\(|\)$/g, "").trim();
                  return <option key={clean} value={clean}>{clean}</option>;
                })}
              </select>
            </div>
          )}
          <div>
            <p className={labelCls}>RAM</p>
            <select value={row.spec.ms_ram} onChange={(e) => setSpec("ms_ram", e.target.value)} className={inputCls}>
              {macStudioRamOptions?.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Armazenamento</p>
            <select value={row.spec.ms_storage} onChange={(e) => setSpec("ms_storage", e.target.value)} className={inputCls}>
              {macStudioSsdOptions?.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* iPad specs */}
      {row.categoria === "IPADS" && (
        <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 p-3 ${bgSection} rounded-lg`}>
          {!row.catalogo_modelo_id && (
            <div>
              <p className={labelCls}>Modelo</p>
              <select value={row.spec.ipad_modelo} onChange={(e) => setSpec("ipad_modelo", e.target.value)} className={inputCls}>
                <option value="IPAD">iPad</option>
                <option value="MINI 6">iPad Mini 6</option>
                <option value="MINI 7">iPad Mini 7</option>
                <option value="AIR 4">iPad Air 4</option>
                <option value="AIR 5">iPad Air 5</option>
                <option value="AIR 6">iPad Air 6</option>
                <option value="AIR 7">iPad Air 7</option>
                <option value="PRO 11">iPad Pro 11"</option>
                <option value="PRO 12.9">iPad Pro 12.9"</option>
                <option value="PRO M4 11">iPad Pro M4 11"</option>
                <option value="PRO M4 13">iPad Pro M4 13"</option>
              </select>
            </div>
          )}
          <div>
            <p className={labelCls}>Tela</p>
            <select value={row.spec.ipad_tela} onChange={(e) => setSpec("ipad_tela", e.target.value)} className={inputCls}>
              <option value="">— Não informar —</option>
              {telasOptions?.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Armazenamento</p>
            <select value={row.spec.ipad_storage} onChange={(e) => setSpec("ipad_storage", e.target.value)} className={inputCls}>
              <option value="">— Não informar —</option>
              {capacidadeOptions?.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Conectividade</p>
            <select value={row.spec.ipad_conn} onChange={(e) => setSpec("ipad_conn", e.target.value)} className={inputCls}>
              <option value="">— Não informar —</option>
              {conectividadeOptions?.map((c) => (
                <option key={c} value={c.includes("+") ? "WIFI+CELL" : "WIFI"}>
                  {c.includes("+") ? "Wi-Fi + Cellular" : "Wi-Fi"}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Apple Watch specs */}
      {row.categoria === "APPLE_WATCH" && (
        <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 p-3 ${bgSection} rounded-lg`}>
          <div>
            <p className={labelCls}>Tamanho</p>
            <select value={row.spec.aw_tamanho} onChange={(e) => setSpec("aw_tamanho", e.target.value)} className={inputCls}>
              <option value="">— Não informar —</option>
              {awTamanhoOptions?.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Conectividade</p>
            <select value={row.spec.aw_conn} onChange={(e) => setSpec("aw_conn", e.target.value)} className={inputCls}>
              <option value="">— Não informar —</option>
              {awConnOptions?.map((c) => (
                <option key={c} value={c.includes("+") ? "GPS+CELL" : "GPS"}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className={labelCls}>Tamanho Pulseira</p>
            <select value={row.spec.aw_pulseira} onChange={(e) => setSpec("aw_pulseira", e.target.value)} className={inputCls}>
              <option value="">— Não informar —</option>
              {WATCH_PULSEIRAS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Modelo Pulseira</p>
            <select value={row.spec.aw_band} onChange={(e) => setSpec("aw_band", e.target.value)} className={inputCls}>
              <option value="">— Não informar —</option>
              {awBandOptions?.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* AirPods specs */}
      {row.categoria === "AIRPODS" && (
        <div className={`grid grid-cols-2 gap-3 p-3 ${bgSection} rounded-lg`}>
          {!categoryModelos.length && (
            <div>
              <p className={labelCls}>Modelo</p>
              <select value={row.spec.air_modelo} onChange={(e) => setSpec("air_modelo", e.target.value)} className={inputCls}>
                {AIRPODS_MODELOS_FULL.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Cor — após specs específicos da categoria */}
      {(hasCatalogModel || !categoryModelos.length) && (
        <div className={`grid gap-3 ${compactMode ? "grid-cols-1" : "grid-cols-2 md:grid-cols-3"}`}>
          {coresOptions && row.categoria !== "MAC_MINI" && (
            <div>
              <p className={labelCls}>Cor</p>
              <select value={row.cor} onChange={(e) => set("cor", e.target.value)} className={inputCls}>
                {COR_OBRIGATORIA.includes(row.categoria)
                  ? <option value="" disabled>— Selecionar —</option>
                  : <option value="">— Opcional —</option>}
                {coresOptions.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}
          {!coresOptions && row.categoria !== "MAC_MINI" && (
            <div>
              <p className={labelCls}>Cor</p>
              <input value={row.cor} onChange={(e) => set("cor", e.target.value)} placeholder="Ex: Silver, Space Black..." className={inputCls} />
            </div>
          )}
        </div>
      )}

      {/* Nome do produto */}
      <div>
        <p className={labelCls}>Nome do Produto</p>
        {hasStructured ? (
          <p className={`${inputCls} bg-opacity-50 font-mono text-xs`} style={{ minHeight: "2.5rem", display: "flex", alignItems: "center" }}>
            {buildProdutoName(row.categoria, row.spec, row.cor) || "← Selecione os specs acima"}
          </p>
        ) : (
          <input
            value={row.produto}
            onChange={(e) => set("produto", e.target.value)}
            placeholder="Ex: Cabo USB-C Lightning 1m"
            className={inputCls}
          />
        )}
      </div>

      {/* Qtd + Custo + Serial + IMEI — oculto em modo compacto */}
      {!compactMode && <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <p className={labelCls}>Quantidade</p>
          <input type="number" value={row.qnt} onChange={(e) => set("qnt", e.target.value)} min="1" className={inputCls} />
        </div>
        <div>
          <p className={labelCls}>Custo unitário (R$)</p>
          <input type="number" value={row.custo_unitario} onChange={(e) => set("custo_unitario", e.target.value)} className={inputCls} />
        </div>
        <div>
          <p className={labelCls}>Serial</p>
          <input value={row.serial_no} onChange={(e) => set("serial_no", e.target.value)} placeholder="Obrigatório" className={inputCls} />
        </div>
        {["IPHONES", "IPADS", "APPLE_WATCH"].includes(row.categoria) && (
          <div>
            <p className={labelCls}>IMEI</p>
            <input value={row.imei} onChange={(e) => set("imei", e.target.value)} placeholder="Opcional" className={inputCls} />
          </div>
        )}
      </div>}
    </div>
  );
}
