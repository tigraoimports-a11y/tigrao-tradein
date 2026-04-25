"use client";

import { useState, useMemo, useEffect } from "react";
import type { NewProduct, TradeInConfig, SeminovoCategoria, SeminovoVariante } from "@/lib/types";
import { SEMINOVO_CATEGORIAS, SEMINOVO_CAT_LABELS, getSeminovoVariantes } from "@/lib/types";
import { getUniqueModels, getStoragesForModel, getProductPrice } from "@/lib/sheets";
import { formatBRL, calculateQuote, getAnyConditionLines, type AnyConditionData, type DeviceType } from "@/lib/calculations";
import { WHATSAPP_SEMINOVO } from "@/lib/whatsapp-config";
import { getHoneypotValue } from "@/lib/honeypot-client";

interface StepNewDeviceProps {
  products: NewProduct[];
  tradeInValue: number;
  onNext: (data: { newModel: string; newStorage: string; newPrice: number }) => void;
  onBack: () => void;
  usedModel?: string;
  usedStorage?: string;
  usedColor?: string;
  whatsappNumber?: string;
  // WhatsApp por categoria de seminovo (iPhone/iPad/MacBook/Watch). Se a
  // categoria selecionada tiver config especifica, ganha do whatsappNumber
  // generico. Sobrescrito por vendedorOverride quando cliente veio via ?ref=.
  whatsappSeminovoByCat?: Record<SeminovoCategoria, string>;
  // true quando o usuario veio via ?ref=<vendedor> — nesse caso whatsappNumber
  // ja foi resolvido pro vendedor e o override por categoria NAO deve valer.
  vendedorOverride?: boolean;
  condition?: AnyConditionData;
  deviceType?: DeviceType;
  tradeinConfig?: TradeInConfig | null;
  // 2º aparelho na troca
  usedModel2?: string;
  usedStorage2?: string;
  usedColor2?: string;
  condition2?: AnyConditionData;
  deviceType2?: DeviceType;
  tradeInValue1?: number;
  tradeInValue2?: number;
}

function getLine(m: string): string { const x = m.match(/iPhone (\d+)/); return x ? x[1] : m; }

// Categorias de produtos
type ProductCategory = "iPhone" | "iPad" | "Mac" | "Apple Watch" | "AirPods" | "Acessorios";
const CATEGORIES: { key: ProductCategory; label: string; icon: string }[] = [
  { key: "iPhone", label: "iPhone", icon: "📱" },
  { key: "iPad", label: "iPad", icon: "📱" },
  { key: "Mac", label: "Mac", icon: "💻" },
  { key: "Apple Watch", label: "Watch", icon: "⌚" },
  { key: "AirPods", label: "AirPods", icon: "🎧" },
];

function getCategory(modelo: string): ProductCategory {
  const m = modelo.toLowerCase();
  if (m.startsWith("iphone")) return "iPhone";
  if (m.startsWith("ipad")) return "iPad";
  if (m.startsWith("mac") || m.includes("macbook")) return "Mac";
  if (m.startsWith("apple watch")) return "Apple Watch";
  if (m.startsWith("airpods") || m.startsWith("airtag")) return "AirPods";
  if (m.includes("pencil") || m.includes("magic") || m.includes("cabo") || m.includes("fonte")) return "Acessorios";
  return "iPhone";
}

// Defaults usados apenas quando o banco não respondeu ainda (todas sem preço
// → fallback para WhatsApp manual, mesmo comportamento pré-refactor).
const SEMINOVOS_DEFAULT: { modelo: string; variantes: SeminovoVariante[]; ativo: boolean; categoria: SeminovoCategoria }[] = [
  { modelo: "iPhone 15 Pro", variantes: [{ storage: "128GB", ativo: true }, { storage: "256GB", ativo: true }], ativo: true, categoria: "iphone" },
  { modelo: "iPhone 15 Pro Max", variantes: [{ storage: "256GB", ativo: true }, { storage: "512GB", ativo: true }], ativo: true, categoria: "iphone" },
  { modelo: "iPhone 16 Pro", variantes: [{ storage: "128GB", ativo: true }, { storage: "256GB", ativo: true }], ativo: true, categoria: "iphone" },
  { modelo: "iPhone 16 Pro Max", variantes: [{ storage: "256GB", ativo: true }], ativo: true, categoria: "iphone" },
];

export default function StepNewDevice({ products, tradeInValue, onNext, onBack, usedModel, usedStorage, usedColor, whatsappNumber, whatsappSeminovoByCat, vendedorOverride, condition, deviceType, tradeinConfig, usedModel2, usedStorage2, usedColor2, condition2, deviceType2, tradeInValue1, tradeInValue2 }: StepNewDeviceProps) {
  const [mode, setMode] = useState<"" | "lacrado" | "seminovo">("");
  const [category, setCategory] = useState<ProductCategory | "">("");
  const [line, setLine] = useState(""); const [model, setModel] = useState(""); const [storage, setStorage] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [lineB, setLineB] = useState(""); const [modelB, setModelB] = useState(""); const [storageB, setStorageB] = useState("");
  const [semiModel, setSemiModel] = useState("");
  const [semiStorage, setSemiStorage] = useState("");
  const [semiNome, setSemiNome] = useState("");
  const [semiWhatsapp, setSemiWhatsapp] = useState("");
  // Categoria escolhida no modo seminovo — separada de `category` (lacrado)
  // porque os dois universos são independentes (mesma divisão do admin).
  const [semiCat, setSemiCat] = useState<SeminovoCategoria | "">("");

  // Seminovos cadastrados em /admin/precos (fonte nova — Painel de Precos).
  // Se retornar vazio, cai no fallback do tradein_config.seminovos (legado).
  type SemiRow = { modelo: string; armazenamento: string; precoPix: number; categoria?: string | null };
  const [seminovosDb, setSeminovosDb] = useState<SemiRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/produtos?tipo=SEMINOVO");
        if (!res.ok) return;
        const json = (await res.json()) as SemiRow[];
        if (!cancelled) setSeminovosDb(Array.isArray(json) ? json : []);
      } catch {
        if (!cancelled) setSeminovosDb([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Mapeia categoria do Painel de Precos ("IPHONE_SEMINOVO"/...) para a chave
  // do SeminovoCategoria usado aqui ("iphone"/"ipad"/"macbook"/"watch").
  function categoriaPrecosToSemi(cat: string | null | undefined): SeminovoCategoria {
    const c = (cat || "").toUpperCase();
    if (c.startsWith("IPAD")) return "ipad";
    if (c.startsWith("MACBOOK")) return "macbook";
    if (c.startsWith("APPLE_WATCH")) return "watch";
    return "iphone";
  }

  // Normaliza a lista vinda do DB (backfill: categoria ausente → iphone) e já
  // converte legado `storages[]` em `variantes[]` via helper. Filtra:
  //  • Modelo inativo → oculto
  //  • Variante inativa → removida
  //  • Modelo sem variante ativa → oculto (sem storage pra escolher)
  //
  // Prioridade: 1) /api/produtos?tipo=SEMINOVO (fonte nova), 2) tradein_config.seminovos
  // (fallback durante transicao), 3) hardcoded default (banco nao respondeu).
  const seminovosAll = useMemo(() => {
    // Fonte 1: Painel de Precos — agrupa rows por modelo.
    if (seminovosDb && seminovosDb.length > 0) {
      const byModel = new Map<string, { modelo: string; variantes: SeminovoVariante[]; categoria: SeminovoCategoria }>();
      for (const row of seminovosDb) {
        const cat = categoriaPrecosToSemi(row.categoria);
        const entry = byModel.get(row.modelo) || { modelo: row.modelo, variantes: [], categoria: cat };
        // preco 0 (sentinela) → variante sem preco → fluxo WhatsApp manual.
        entry.variantes.push({
          storage: row.armazenamento,
          preco: row.precoPix > 0 ? row.precoPix : undefined,
          ativo: true,
        });
        byModel.set(row.modelo, entry);
      }
      return [...byModel.values()].filter((s) => s.variantes.length > 0);
    }
    // Fonte 2: tradein_config.seminovos (legado, sera removido apos migracao completa).
    const raw = tradeinConfig?.seminovos?.filter((s) => s.ativo);
    const src = raw && raw.length > 0 ? raw : SEMINOVOS_DEFAULT;
    return src
      .map((s) => {
        const variantes = getSeminovoVariantes(s).filter((v) => v.ativo !== false && v.storage.trim());
        return {
          modelo: s.modelo,
          variantes,
          categoria: ((s as { categoria?: string }).categoria as SeminovoCategoria) || "iphone",
        };
      })
      .filter((s) => s.variantes.length > 0);
  }, [seminovosDb, tradeinConfig]);

  // Categorias com ao menos 1 seminovo ativo (as únicas abas clicáveis).
  const semiCats = useMemo(() => {
    const set = new Set<SeminovoCategoria>();
    seminovosAll.forEach((s) => set.add(s.categoria));
    return SEMINOVO_CATEGORIAS.filter((c) => set.has(c));
  }, [seminovosAll]);

  // Categoria efetiva: se o user não escolheu e só existe 1 categoria,
  // seleciona automaticamente (evita seletor redundante e tela vazia se o
  // config chega depois do click).
  const semiCatEffective: SeminovoCategoria | "" = semiCat || (semiCats.length === 1 ? semiCats[0] : "");

  // Filtra pela categoria efetiva.
  const seminovos = useMemo(
    () => (semiCatEffective ? seminovosAll.filter((s) => s.categoria === semiCatEffective) : []),
    [seminovosAll, semiCatEffective]
  );

  const lbl = tradeinConfig?.labels || {};

  // Categorias disponíveis (que tenham produtos no catálogo)
  const availableCategories = useMemo(() => {
    const cats = new Set<ProductCategory>();
    products.forEach(p => cats.add(getCategory(p.modelo)));
    return CATEGORIES.filter(c => cats.has(c.key));
  }, [products]);

  // Filtrar produtos pela categoria selecionada
  const categoryProducts = useMemo(() =>
    category ? products.filter(p => getCategory(p.modelo) === category) : products
  , [products, category]);

  const isIPhone = category === "iPhone" || !category;

  // Para iPhones: agrupar por linha (13, 14, 15, 16, 17)
  const allModels = useMemo(() => getUniqueModels(categoryProducts), [categoryProducts]);
  const lines = useMemo(() => {
    if (isIPhone) {
      const s = new Set<string>(); allModels.filter(m => /^iPhone \d/i.test(m)).forEach((m) => s.add(getLine(m)));
      return [...s].sort((a,b) => Number(a)-Number(b));
    }
    return []; // Não-iPhone não usa "linhas"
  }, [allModels, isIPhone]);
  const modelsInLine = useMemo(() => isIPhone ? allModels.filter((m) => getLine(m) === line) : allModels, [allModels, line, isIPhone]);
  const storages_ = useMemo(() => (model ? getStoragesForModel(categoryProducts, model) : []), [categoryProducts, model]);
  const price = useMemo(() => (model && storage ? getProductPrice(categoryProducts, model, storage) : null), [categoryProducts, model, storage]);
  const modelsInLineB = useMemo(() => isIPhone ? allModels.filter((m) => getLine(m) === lineB) : allModels, [allModels, lineB, isIPhone]);
  const storagesB = useMemo(() => (modelB ? getStoragesForModel(categoryProducts, modelB) : []), [categoryProducts, modelB]);
  const priceB = useMemo(() => (modelB && storageB ? getProductPrice(categoryProducts, modelB, storageB) : null), [categoryProducts, modelB, storageB]);

  function hL(l: string) { setLine(l); setModel(""); setStorage(""); }
  function hM(m: string) { setModel(m); setStorage(""); }
  function hLB(l: string) { setLineB(l); setModelB(""); setStorageB(""); }
  function hMB(m: string) { setModelB(m); setStorageB(""); }
  function cancelCmp() { setCompareMode(false); setLineB(""); setModelB(""); setStorageB(""); }

  function selectMode(m: "lacrado" | "seminovo") {
    setMode(m);
    setCategory(""); setLine(""); setModel(""); setStorage(""); cancelCmp();
    setSemiModel(""); setSemiStorage(""); setSemiCat("");
    // Auto-seleção quando só há 1 categoria é derivada em semiCatEffective.
  }

  function selectCategory(c: ProductCategory) {
    setCategory(c);
    setLine(""); setModel(""); setStorage(""); cancelCmp();
  }

  // Build WhatsApp message with full device condition
  function buildWhatsAppMsg(): string {
    const lines: string[] = [];
    lines.push(`Ola! Fiz a simulacao de Trade-In no site e tenho interesse em um *${semiModel} ${semiStorage} SEMINOVO*.`);
    lines.push("");
    lines.push(`*DADOS DO CLIENTE:*`);
    lines.push(`Nome: ${semiNome || "Nao informado"}`);
    lines.push(`WhatsApp: ${semiWhatsapp || "Nao informado"}`);

    const hasSecond = !!(usedModel2 && usedStorage2);
    if (usedModel || tradeInValue > 0) {
      lines.push("");
      lines.push(hasSecond ? `*MEUS APARELHOS NA TROCA:*` : `*MEU APARELHO NA TROCA:*`);
      if (hasSecond) lines.push("", `*Aparelho 1:*`);
      lines.push(`Modelo: ${usedModel || "?"} ${usedStorage || ""}`);
      if (usedColor) lines.push(`Cor: ${usedColor}`);
      const val1 = hasSecond && tradeInValue1 ? tradeInValue1 : tradeInValue;
      if (val1 > 0) lines.push(`Valor avaliado: R$ ${Math.round(val1).toLocaleString("pt-BR")}`);
      if (condition && deviceType) {
        lines.push(`Condicao: ${getAnyConditionLines(deviceType, condition).join(", ")}`);
      }
    }

    if (hasSecond) {
      lines.push("", `*Aparelho 2:*`);
      lines.push(`Modelo: ${usedModel2} ${usedStorage2 || ""}`);
      if (usedColor2) lines.push(`Cor: ${usedColor2}`);
      if (tradeInValue2 && tradeInValue2 > 0) lines.push(`Valor avaliado: R$ ${Math.round(tradeInValue2).toLocaleString("pt-BR")}`);
      if (condition2 && deviceType2) {
        lines.push(`Condicao: ${getAnyConditionLines(deviceType2, condition2).join(", ")}`);
      }
    }

    lines.push("");
    lines.push("Gostaria de saber o valor e condicoes de pagamento!");
    return lines.join("\n");
  }

  const canProceed = model && storage && price !== null;
  const bothSel = canProceed && modelB && storageB && priceB !== null;
  const diffA = price !== null ? Math.max(price - tradeInValue, 0) : null;
  const diffB = priceB !== null ? Math.max(priceB - tradeInValue, 0) : null;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-[22px] font-bold leading-tight" style={{ color: "var(--ti-text)" }}>{lbl.step2_titulo || "Voce deseja comprar um:"}</h2>
      </div>

      {/* Lacrado vs Seminovo */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => selectMode("lacrado")}
          className="py-5 rounded-2xl text-[15px] font-semibold transition-all duration-200 flex flex-col items-center gap-2"
          style={mode === "lacrado"
            ? { backgroundColor: "var(--ti-accent)", color: "#fff", border: "2px solid var(--ti-accent)" }
            : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "2px solid var(--ti-btn-border)" }}>
          <span className="text-[24px]">📦</span>
          {lbl.lacrado_label || "Lacrado"}
          <span className="text-[11px] font-normal opacity-70">{lbl.lacrado_desc || "Novo, na caixa. 1 ano de garantia Apple, nota fiscal"}</span>
        </button>
        <button onClick={() => selectMode("seminovo")}
          className="py-5 rounded-2xl text-[15px] font-semibold transition-all duration-200 flex flex-col items-center gap-2"
          style={mode === "seminovo"
            ? { backgroundColor: "var(--ti-accent)", color: "#fff", border: "2px solid var(--ti-accent)" }
            : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "2px solid var(--ti-btn-border)" }}>
          <span className="text-[24px]">📱</span>
          {lbl.seminovo_label || "Seminovo"}
          <span className="text-[11px] font-normal opacity-70">{lbl.seminovo_desc || "Usado, revisado, com garantia de 3 meses, nota fiscal"}</span>
        </button>
      </div>

      {/* ====== LACRADO ====== */}
      {mode === "lacrado" && (
        <div className="space-y-5 animate-fadeIn">
          {/* Categoria */}
          <Sec title="Categoria"><div className="grid grid-cols-3 gap-2">
            {availableCategories.map((c) => <Btn key={c.key} sel={category===c.key} onClick={() => selectCategory(c.key)}>{c.icon} {c.label}</Btn>)}
          </div></Sec>

          {/* Linha (só pra iPhone) */}
          {category === "iPhone" && lines.length > 0 && (
            <Sec title="Linha do iPhone"><div className="grid grid-cols-3 gap-2">
              {lines.map((l) => <Btn key={l} sel={line===l} onClick={() => hL(l)}>iPhone {l}</Btn>)}
            </div></Sec>
          )}

          {/* Modelo */}
          {((category === "iPhone" && line) || (category && category !== "iPhone")) && modelsInLine.length > 0 && <Sec title="Modelo"><div className="grid grid-cols-1 gap-2">
            {modelsInLine.map((m) => <Btn key={m} sel={model===m} onClick={() => hM(m)} className="text-left">{m}</Btn>)}
          </div></Sec>}

          {model && storages_.length > 0 && <Sec title="Armazenamento"><div className="flex gap-2 flex-wrap">
            {storages_.map((s) => {
              const p = getProductPrice(products, model, s);
              // Preco "com troca aplicada" — antes mostrava so o preco cheio
              // (R$ 8.797), o que dava choque de preco no cliente. Agora mostra
              // tambem quanto ele realmente paga DEPOIS da troca, em verde.
              // Isso ancora o valor final cedo, antes da etapa 5.
              const comTroca = p && tradeInValue > 0 ? Math.max(p - tradeInValue, 0) : null;
              return (
              <button key={s} onClick={() => setStorage(s)}
                className="flex-1 min-w-[80px] px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 flex flex-col items-center gap-1"
                style={storage===s
                  ? { backgroundColor: "var(--ti-accent-light)", color: "var(--ti-accent-text)", border: "1px solid var(--ti-accent)" }
                  : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-btn-border)" }}>
                <span className="font-semibold">{s}</span>
                {p && comTroca !== null ? (
                  <>
                    <span className="text-[10px] line-through" style={{ opacity: 0.45 }}>{formatBRL(p)}</span>
                    <span className="text-[12px] font-semibold" style={{ color: "var(--ti-success)" }}>{formatBRL(comTroca)}</span>
                  </>
                ) : (
                  p && <span className="text-[12px] font-normal" style={{ opacity: 0.7 }}>{formatBRL(p)}</span>
                )}
              </button>);
            })}
          </div></Sec>}

          {canProceed && !compareMode && (
            <button onClick={() => setCompareMode(true)}
              className="w-full py-3 rounded-2xl text-[14px] font-medium transition-all duration-200"
              style={{ color: "var(--ti-accent)", backgroundColor: "var(--ti-accent-light)", border: "1px solid var(--ti-accent)" }}>
              Comparar com outro modelo
            </button>
          )}

          {compareMode && (
            <div className="rounded-2xl p-4 space-y-5 animate-fadeIn" style={{ backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)" }}>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold tracking-wider uppercase" style={{ color: "var(--ti-muted)" }}>Segundo modelo</p>
                <button onClick={cancelCmp} className="text-[12px] transition-colors" style={{ color: "var(--ti-muted)" }}>Cancelar</button>
              </div>
              {isIPhone && lines.length > 0 && <Sec title="Linha"><div className="grid grid-cols-3 gap-2">{lines.map((l) => <Btn key={l} sel={lineB===l} onClick={() => hLB(l)}>iPhone {l}</Btn>)}</div></Sec>}
              {((isIPhone && lineB) || !isIPhone) && modelsInLineB.length > 0 && <Sec title="Modelo"><div className="grid grid-cols-1 gap-2">{modelsInLineB.map((m) => <Btn key={m} sel={modelB===m} onClick={() => hMB(m)} className="text-left">{m}</Btn>)}</div></Sec>}
              {modelB && storagesB.length > 0 && <Sec title="Armazenamento"><div className="flex gap-2 flex-wrap">
                {storagesB.map((s) => {
                  const p = getProductPrice(products, modelB, s);
                  const comTroca = p && tradeInValue > 0 ? Math.max(p - tradeInValue, 0) : null;
                  return (
                  <button key={s} onClick={() => setStorageB(s)}
                    className="flex-1 min-w-[80px] px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all flex flex-col items-center gap-1"
                    style={storageB===s
                      ? { backgroundColor: "var(--ti-accent-light)", color: "var(--ti-accent-text)", border: "1px solid var(--ti-accent)" }
                      : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-btn-border)" }}>
                    <span className="font-semibold">{s}</span>
                    {p && comTroca !== null ? (
                      <>
                        <span className="text-[10px] line-through" style={{ opacity: 0.45 }}>{formatBRL(p)}</span>
                        <span className="text-[12px] font-semibold" style={{ color: "var(--ti-success)" }}>{formatBRL(comTroca)}</span>
                      </>
                    ) : (
                      p && <span className="text-[12px] font-normal" style={{ opacity: 0.7 }}>{formatBRL(p)}</span>
                    )}
                  </button>);
                })}
              </div></Sec>}
            </div>
          )}

          {bothSel && diffA !== null && diffB !== null && (() => {
            const qA = calculateQuote(tradeInValue, price!); const qB = calculateQuote(tradeInValue, priceB!);
            const gi = (q: typeof qA, n: number) => q.installments.find(i => i.parcelas === n);
            return (
            <div className="animate-fadeIn">
              <p className="text-[11px] font-semibold tracking-wider uppercase mb-3" style={{ color: "var(--ti-muted)" }}>Comparacao</p>
              <div className="grid grid-cols-2 gap-3">
                {[[model, storage, price!, diffA, qA], [modelB, storageB, priceB!, diffB, qB]].map(([md, st, pr, df, qt], idx) => (
                  <div key={idx} className="rounded-2xl p-4 flex flex-col gap-2" style={{ backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)" }}>
                    <p className="text-[13px] font-semibold leading-tight" style={{ color: "var(--ti-text)" }}>{md as string}</p>
                    <p className="text-[12px]" style={{ color: "var(--ti-muted)" }}>{st as string}</p>
                    <p className="text-[15px] font-bold" style={{ color: "var(--ti-text)" }}>{formatBRL(pr as number)}</p>
                    <div className="pt-2 mt-1 space-y-1" style={{ borderTop: "1px solid var(--ti-card-border)" }}>
                      <p className="text-[11px]" style={{ color: "var(--ti-muted)" }}>Voce paga:</p>
                      <p className="text-[16px] font-bold" style={{ color: "var(--ti-success)" }}>{formatBRL(df as number)} <span className="text-[11px] font-normal">PIX</span></p>
                      {[6,12,21].map(n => { const inst = gi(qt as ReturnType<typeof calculateQuote>, n); return inst ? (
                        <p key={n} className="text-[11px]" style={{ color: "var(--ti-muted)" }}>{n}x de <span className="font-semibold" style={{ color: "var(--ti-text)" }}>{formatBRL(inst.valorParcela)}</span></p>
                      ) : null; })}
                    </div>
                    <button onClick={() => { cancelCmp(); onNext({ newModel: md as string, newStorage: st as string, newPrice: pr as number }); }}
                      className="mt-1 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all" style={{ backgroundColor: "var(--ti-accent)" }}>
                      Escolher este
                    </button>
                  </div>
                ))}
              </div>
            </div>);
          })()}
        </div>
      )}

      {/* ====== SEMINOVO ====== */}
      {mode === "seminovo" && (
        <div className="space-y-5 animate-fadeIn">
          <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)" }}>
            <p className="text-[13px] font-semibold mb-1" style={{ color: "var(--ti-text)" }}>Seminovos com garantia</p>
            <p className="text-[12px]" style={{ color: "var(--ti-muted)" }}>{lbl.seminovo_info || "Aparelhos revisados e em excelente estado. O valor e condicoes serao informados por WhatsApp."}</p>
          </div>

          {/* Categoria do seminovo — só aparece se houver mais de uma.
              Mesma ergonomia do modo lacrado (Categoria → Modelo → Storage). */}
          {semiCats.length > 1 && (
            <Sec title="Categoria">
              <div className="grid grid-cols-2 gap-2">
                {semiCats.map((c) => (
                  <Btn key={c} sel={semiCat === c} onClick={() => { setSemiCat(c); setSemiModel(""); setSemiStorage(""); }}>
                    {SEMINOVO_CAT_LABELS[c].icon} {SEMINOVO_CAT_LABELS[c].label}
                  </Btn>
                ))}
              </div>
            </Sec>
          )}

          {semiCatEffective && seminovos.length > 0 && (
            <Sec title="Modelo seminovo">
              <div className="grid grid-cols-1 gap-2">
                {seminovos.map((s) => (
                  <Btn key={s.modelo} sel={semiModel === s.modelo} onClick={() => { setSemiModel(s.modelo); setSemiStorage(""); }} className="text-left">
                    {s.modelo}
                  </Btn>
                ))}
              </div>
            </Sec>
          )}

          {semiModel && (() => {
            const variantes = seminovos.find(s => s.modelo === semiModel)?.variantes || [];
            return (
              <Sec title="Armazenamento">
                <div className="flex gap-2 flex-wrap">
                  {variantes.map((v) => (
                    <button key={v.storage} onClick={() => setSemiStorage(v.storage)}
                      className="flex-1 min-w-[80px] px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 flex flex-col items-center gap-1"
                      style={semiStorage === v.storage
                        ? { backgroundColor: "var(--ti-accent-light)", color: "var(--ti-accent-text)", border: "1px solid var(--ti-accent)" }
                        : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-btn-border)" }}>
                      <span className="font-semibold">{v.storage}</span>
                      {typeof v.preco === "number" && (
                        <span className="text-[12px] font-normal" style={{ opacity: 0.7 }}>{formatBRL(v.preco)}</span>
                      )}
                    </button>
                  ))}
                </div>
              </Sec>
            );
          })()}

          {semiModel && semiStorage && (() => {
            // Busca a variante selecionada pra decidir o fluxo: preço definido
            // → orçamento automático (onNext → StepQuote); senão → WhatsApp.
            const selectedVariante = seminovos
              .find((s) => s.modelo === semiModel)?.variantes
              .find((v) => v.storage === semiStorage);
            const precoAuto = typeof selectedVariante?.preco === "number" ? selectedVariante.preco : null;
            if (precoAuto !== null) {
              // Orçamento automático — envia pro StepQuote com preço conhecido.
              // O marker "SEMINOVO" no modelo permite ao StepQuote ajustar a
              // mensagem (garantia 3 meses, sem "lacrado na caixa").
              return (
                <div className="space-y-3 animate-fadeIn">
                  <div className="rounded-2xl p-4 text-center" style={{ backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)" }}>
                    <p className="text-[13px] mb-2" style={{ color: "var(--ti-muted)" }}>Voce selecionou:</p>
                    <p className="text-[18px] font-bold" style={{ color: "var(--ti-text)" }}>{semiModel} {semiStorage}</p>
                    <p className="text-[12px] mt-1" style={{ color: "var(--ti-accent)" }}>SEMINOVO</p>
                    <p className="text-[16px] font-bold mt-2" style={{ color: "var(--ti-text)" }}>{formatBRL(precoAuto)}</p>
                  </div>
                  <button
                    onClick={() => onNext({ newModel: `${semiModel} SEMINOVO`, newStorage: semiStorage, newPrice: precoAuto })}
                    className="w-full py-4 rounded-2xl text-[15px] font-semibold text-white transition-all duration-200 active:scale-[0.98]"
                    style={{ backgroundColor: "var(--ti-accent)" }}>
                    Ver cotação
                  </button>
                </div>
              );
            }
            // Fluxo WhatsApp manual — variante sem preço cadastrado.
            return (
            <div className="space-y-3 animate-fadeIn">
              <div className="rounded-2xl p-4 text-center" style={{ backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)" }}>
                <p className="text-[13px] mb-2" style={{ color: "var(--ti-muted)" }}>Voce selecionou:</p>
                <p className="text-[18px] font-bold" style={{ color: "var(--ti-text)" }}>{semiModel} {semiStorage}</p>
                <p className="text-[12px] mt-1" style={{ color: "var(--ti-accent)" }}>SEMINOVO</p>
                <p className="text-[12px] mt-3" style={{ color: "var(--ti-muted)" }}>A cotacao sera feita por WhatsApp com base nas condicoes do seu aparelho.</p>
              </div>
              <div className="space-y-2">
                <input type="text" placeholder="Seu nome" value={semiNome} onChange={e => setSemiNome(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-[14px]" style={{ backgroundColor: "var(--ti-input-bg)", color: "var(--ti-text)", border: "1px solid var(--ti-input-border)" }} />
                <input type="tel" placeholder="Seu WhatsApp" value={semiWhatsapp} onChange={e => setSemiWhatsapp(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-[14px]" style={{ backgroundColor: "var(--ti-input-bg)", color: "var(--ti-text)", border: "1px solid var(--ti-input-border)" }} />
              </div>
              <button
                onClick={() => {
                  if (!semiNome.trim()) { alert("Informe seu nome"); return; }
                  // Salvar simulação seminovo no banco de dados (com dados completos de condição)
                  const condLines = condition && deviceType ? getAnyConditionLines(deviceType, condition) : [];
                  const condLines2 = condition2 && deviceType2 ? getAnyConditionLines(deviceType2, condition2) : [];
                  // Cascata de roteamento pra seminovos:
                  //  1. vendedor via ?ref= na URL (parent ja resolveu em whatsappNumber
                  //     + marcou vendedorOverride=true) → usa, independente da categoria
                  //  2. whatsapp da categoria selecionada (whatsappSeminovoByCat[semiCat])
                  //     → permite iPhone Seminovo -> Nicolas, iPad Seminovo -> outro
                  //  3. whatsappNumber (fallback geral: whatsapp_formularios_seminovos)
                  //  4. WHATSAPP_SEMINOVO hardcoded (stand-alone use)
                  const cat = semiCatEffective || "iphone";
                  const waFromCat = !vendedorOverride && whatsappSeminovoByCat ? whatsappSeminovoByCat[cat] : "";
                  const waNum = (vendedorOverride && whatsappNumber) || waFromCat || whatsappNumber || WHATSAPP_SEMINOVO;
                  fetch("/api/leads", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      nome: semiNome,
                      whatsapp: semiWhatsapp || "",
                      instagram: "",
                      modeloNovo: `${semiModel} SEMINOVO`,
                      storageNovo: semiStorage,
                      precoNovo: 0,
                      modeloUsado: usedModel || "",
                      storageUsado: usedStorage || "",
                      corUsado: usedColor || "",
                      avaliacaoUsado: (usedModel2 && tradeInValue1) ? tradeInValue1 : (tradeInValue || 0),
                      diferenca: 0,
                      status: "GOSTEI",
                      formaPagamento: "WhatsApp Seminovo",
                      condicaoLinhas: condLines,
                      whatsappDestino: waNum,
                      ...(usedModel2 ? {
                        modeloUsado2: usedModel2,
                        storageUsado2: usedStorage2,
                        corUsado2: usedColor2 || "",
                        avaliacaoUsado2: tradeInValue2 || 0,
                        condicaoLinhas2: condLines2,
                      } : {}),
                      website: getHoneypotValue(),
                    }),
                  }).catch(() => {});
                  const msg = encodeURIComponent(buildWhatsAppMsg());
                  window.location.href = `https://wa.me/${waNum}?text=${msg}`;
                }}
                className="w-full py-4 rounded-2xl text-[15px] font-semibold text-white transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
                style={{ backgroundColor: "#25D366" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492l4.612-1.474A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75c-2.115 0-4.07-.662-5.674-1.789l-.407-.264-2.746.878.829-2.676-.281-.427A9.71 9.71 0 012.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75z"/></svg>
                Consultar no WhatsApp
              </button>
            </div>
            );
          })()}
        </div>
      )}

      {/* Botões de navegação */}
      <div className="flex gap-3">
        <button onClick={() => { if (mode) { setMode(""); } else { onBack(); } }} className="flex-1 py-4 rounded-2xl text-[15px] font-semibold transition-all duration-200"
          style={{ color: "var(--ti-muted)", backgroundColor: "var(--ti-btn-bg)", border: "1px solid var(--ti-btn-border)" }}>
          Voltar
        </button>
        {mode === "lacrado" && canProceed && !compareMode && (
          <button onClick={() => onNext({ newModel: model, newStorage: storage, newPrice: price })}
            className="flex-[2] py-4 rounded-2xl text-[15px] font-semibold text-white transition-all duration-200 active:scale-[0.98]"
            style={{ backgroundColor: "var(--ti-accent)" }}>
            Ver cotação
          </button>
        )}
      </div>
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="animate-fadeIn"><label className="block text-[11px] font-semibold tracking-wider uppercase mb-3" style={{ color: "var(--ti-muted)" }}>{title}</label>{children}</div>;
}

function Btn({ sel, onClick, children, className = "" }: { sel: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button onClick={onClick} className={`px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 ${className}`}
      style={sel
        ? { backgroundColor: "var(--ti-accent-light)", color: "var(--ti-accent-text)", border: "1px solid var(--ti-accent)" }
        : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-btn-border)" }}>
      {children}
    </button>
  );
}
