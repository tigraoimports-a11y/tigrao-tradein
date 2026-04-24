"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { UsedDeviceValue, TradeInQuestion } from "@/lib/types";
import { corParaPT } from "@/lib/cor-pt";
import { parseStorageSpec, hasStructuredStorage } from "@/lib/storage-spec";
import { getUniqueUsedModels, getUsedStoragesForModel, getUsedBaseValue } from "@/lib/sheets";
import {
  calculateAnyTradeInValue, getDiscountsForModel, formatBRL,
  type DeviceType, type ConditionData, type AnyConditionData, type ModelDiscounts,
} from "@/lib/calculations";

type MultiDeviceType = DeviceType | "watch";

interface StepUsedDeviceMultiProps {
  usedValues: UsedDeviceValue[];
  excludedModels: string[];
  modelDiscounts?: Record<string, ModelDiscounts>;
  questionsConfig?: TradeInQuestion[] | null;
  deviceType: MultiDeviceType;
  onNext: (data: { usedModel: string; usedStorage: string; usedColor: string; condition: AnyConditionData; tradeInValue: number; deviceType: DeviceType; extraAnswers?: Record<string, unknown> }) => void;
  onTrackQuestion?: (step: number, question: string) => void;
}

// Slugs que ja sao renderizados pela UI hardcoded. Qualquer pergunta do
// questionsConfig cujo slug esteja fora dessa lista entra no bloco dinamico
// "Perguntas adicionais" no final — permite admin adicionar perguntas novas
// (ex: "Ciclos" pra MacBook, "Pulseira" pra Watch) via /admin/simulacoes sem
// precisar mexer no componente.
const HARDCODED_SLUGS = new Set([
  "battery", "hasDamage", "hasOriginalBox", "hasWarranty", "hasWearMarks",
  "partsReplaced", "peeling", "screenScratch", "sideScratch",
  "warrantyMonth", "wearMarks",
]);

// Ordem fallback pros slugs hardcoded quando o admin nao configurou nada no
// qc (config carregando, slug removido, ou qc vazio). Permite que o gate
// `allPriorAnswered` funcione mesmo antes do qc chegar, evitando que a
// pergunta "battery" apareca antes de "hasDamage" ser respondida.
const HARDCODED_DEFAULT_ORDEM: Record<string, number> = {
  hasDamage: 1, battery: 2, hasWearMarks: 3, wearMarks: 4,
  screenScratch: 4.1, sideScratch: 4.2, peeling: 4.3,
  partsReplaced: 5, hasWarranty: 6, warrantyMonth: 7, hasOriginalBox: 8,
};

// Formata uma resposta dinamica pra exibir no resumo/WhatsApp.
function formatExtraAnswer(q: TradeInQuestion, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) {
    const labels = value.map((v) => q.opcoes.find((o) => o.value === v)?.label || String(v));
    return labels.join(", ");
  }
  if (typeof value === "boolean") return value ? "Sim" : "Nao";
  const opt = q.opcoes.find((o) => o.value === value);
  return opt?.label || String(value);
}

// Helper to get question config by slug
function getQ(config: TradeInQuestion[] | null | undefined, slug: string): TradeInQuestion | undefined {
  return config?.find((q) => q.slug === slug && q.ativo !== false);
}
function getQTitle(config: TradeInQuestion[] | null | undefined, slug: string, fallback: string): string {
  return getQ(config, slug)?.titulo || fallback;
}
function getQOptions(config: TradeInQuestion[] | null | undefined, slug: string) {
  return getQ(config, slug)?.opcoes || [];
}
function isQActive(config: TradeInQuestion[] | null | undefined, slug: string): boolean {
  if (!config || config.length === 0) return true; // no config = use all defaults
  const q = config.find((q) => q.slug === slug);
  return q ? q.ativo : true; // not found = active by default
}

const MONTHS = ["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const DEVICE_LABELS: Record<MultiDeviceType, string> = {
  iphone: "iPhone",
  ipad: "iPad",
  macbook: "MacBook",
  watch: "Apple Watch",
};

function filterByDeviceType(values: UsedDeviceValue[], deviceType: MultiDeviceType): UsedDeviceValue[] {
  switch (deviceType) {
    case "iphone": return values.filter((v) => v.modelo.startsWith("iPhone"));
    case "ipad": return values.filter((v) => v.modelo.startsWith("iPad"));
    case "macbook": return values.filter((v) => v.modelo.startsWith("Mac"));
    case "watch": return values.filter((v) => v.modelo.startsWith("Apple Watch"));
    default: return values;
  }
}

function extractLines(models: string[], deviceType: MultiDeviceType): string[] {
  const s = new Set<string>();
  switch (deviceType) {
    case "iphone":
      models.forEach((m) => { const x = m.match(/iPhone (\d+)/); if (x) s.add(x[1]); });
      return [...s].sort((a, b) => Number(a) - Number(b));
    case "ipad":
      models.forEach((m) => {
        if (m.startsWith("iPad Air")) s.add("Air");
        else if (m.startsWith("iPad Pro")) s.add("Pro");
        else if (m.startsWith("iPad mini") || m.startsWith("iPad Mini")) s.add("mini");
        else s.add("iPad");
      });
      return [...s].sort();
    case "macbook":
      models.forEach((m) => {
        if (m.includes("Air")) s.add("Air");
        else if (m.includes("Pro")) s.add("Pro");
      });
      return [...s].sort();
    case "watch":
      // Apenas 3 linhas top-level: SE / Series / Ultra. Modelos que nao casam
      // com nenhum padrao sao ignorados (nao criamos linha "Apple Watch"
      // generica — antes virava despejo de todos os modelos).
      models.forEach((m) => {
        if (/Apple Watch SE/i.test(m)) { s.add("SE"); return; }
        if (/Apple Watch Ultra/i.test(m)) { s.add("Ultra"); return; }
        if (/Apple Watch (?:Series )?\d+/i.test(m)) { s.add("Series"); return; }
      });
      const order = ["SE", "Series", "Ultra"];
      return [...s].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    default:
      return [];
  }
}

function getModelsInLine(allModels: string[], line: string, deviceType: MultiDeviceType): string[] {
  switch (deviceType) {
    case "iphone":
      return allModels.filter((m) => { const x = m.match(/iPhone (\d+)/); return x && x[1] === line; });
    case "ipad":
      if (line === "Air") return allModels.filter((m) => m.startsWith("iPad Air"));
      if (line === "Pro") return allModels.filter((m) => m.startsWith("iPad Pro"));
      if (line === "mini") return allModels.filter((m) => m.startsWith("iPad mini") || m.startsWith("iPad Mini"));
      return allModels.filter((m) => m.startsWith("iPad") && !m.startsWith("iPad Air") && !m.startsWith("iPad Pro") && !m.startsWith("iPad mini") && !m.startsWith("iPad Mini"));
    case "macbook":
      if (line === "Air") return allModels.filter((m) => m.includes("Air"));
      if (line === "Pro") return allModels.filter((m) => m.includes("Pro"));
      return allModels;
    case "watch":
      if (line === "SE") return allModels.filter((m) => /Apple Watch SE/i.test(m));
      if (line === "Ultra") return allModels.filter((m) => /Apple Watch Ultra/i.test(m));
      if (line === "Series") return allModels.filter((m) => /Apple Watch (?:Series )?\d+/i.test(m) && !/Apple Watch SE/i.test(m) && !/Apple Watch Ultra/i.test(m));
      return [];
    default:
      return [];
  }
}

function getLineDisplayName(line: string, deviceType: MultiDeviceType): string {
  switch (deviceType) {
    case "iphone": return `iPhone ${line}`;
    case "ipad": return line === "iPad" ? "iPad" : `iPad ${line}`;
    case "macbook": return `MacBook ${line}`;
    case "watch": return line === "Watch" ? "Apple Watch" : `Apple Watch ${line}`;
    default: return line;
  }
}

// Map MultiDeviceType to actual DeviceType for calculations
function toCalcDeviceType(dt: MultiDeviceType): DeviceType {
  if (dt === "watch") return "iphone"; // fallback until watch type is added
  return dt;
}

export default function StepUsedDeviceMulti({ usedValues, excludedModels, modelDiscounts, questionsConfig, deviceType, onNext, onTrackQuestion }: StepUsedDeviceMultiProps) {
  // Normaliza slugs: alguns cadastros no admin foram criados com sufixo de
  // device_type (ex: `hasDamage_ipad`, `battery_macbook`). O codigo usa os
  // slugs puros (`hasDamage`, `battery`), entao strip do sufixo `_${deviceType}`
  // pra reconhecer como hardcoded e evitar renderizar 2x a mesma pergunta
  // (uma pelo bloco hardcoded com titulo fallback + uma pelo loop dinamico).
  const qc = useMemo(() => {
    if (!questionsConfig) return questionsConfig;
    const suffixes = ["_iphone", "_ipad", "_macbook", "_watch"];
    return questionsConfig.map((q) => {
      let s = q.slug;
      for (const suf of suffixes) {
        if (s.endsWith(suf)) { s = s.slice(0, -suf.length); break; }
      }
      return s === q.slug ? q : { ...q, slug: s };
    });
  }, [questionsConfig]);
  const [line, setLine] = useState("");
  const [model, setModel] = useState("");
  const [storage, setStorage] = useState("");
  const [hasDamage, setHasDamage] = useState<boolean | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [screenScratch, setScreenScratch] = useState<"none"|"one"|"multiple"|null>(null);
  const [sideScratch, setSideScratch] = useState<"none"|"one"|"multiple"|null>(null);
  const [peeling, setPeeling] = useState<"none"|"light"|"heavy"|null>(null);
  const [hasWearMarks, setHasWearMarks] = useState<boolean | null>(null);
  const [wearMarks, setWearMarks] = useState<string[]>([]);
  const [partsReplaced, setPartsReplaced] = useState<"no"|"apple"|"thirdParty"|null>(null);
  const [partsReplacedDetail, setPartsReplacedDetail] = useState("");
  const [hasWarranty, setHasWarranty] = useState<boolean|null>(null);
  const [warrantyMonth, setWarrantyMonth] = useState<number|null>(null);
  const [warrantyYear, setWarrantyYear] = useState<number>(new Date().getFullYear());
  const [hasOriginalBox, setHasOriginalBox] = useState<boolean|null>(null);
  const [cor, setCor] = useState("");
  const [coresDisponiveis, setCoresDisponiveis] = useState<Record<string, string[]>>({});
  // Respostas das perguntas dinamicas (slugs fora do HARDCODED_SLUGS). Chave
  // e o slug, valor depende do `tipo`: string pra selection/yesno,
  // string[] pra multiselect, number pra numeric.
  const [extraAnswers, setExtraAnswers] = useState<Record<string, unknown>>({});

  // Busca cores do catálogo/estoque quando muda o deviceType
  const fetchCores = useCallback(async () => {
    try {
      const dt = deviceType === "watch" ? "watch" : deviceType;
      const res = await fetch(`/api/cores-dispositivo?device_type=${dt}`);
      const j = await res.json();
      setCoresDisponiveis(j.modelos || {});
    } catch { /* ignore */ }
  }, [deviceType]);
  useEffect(() => { fetchCores(); }, [fetchCores]);

  // Cores pro modelo selecionado (traduzidas pra PT, dedup)
  const coresModelo = useMemo(() => {
    if (!model) return [];
    // Tenta match exato primeiro, depois substring
    let cores = coresDisponiveis[model];
    if (!cores) {
      const entry = Object.entries(coresDisponiveis).find(([k]) => model.toUpperCase().includes(k.toUpperCase()) || k.toUpperCase().includes(model.toUpperCase()));
      cores = entry?.[1] ?? [];
    }
    if (!cores || cores.length === 0) return [];
    // Traduz pra PT e dedup
    const ptMap = new Map<string, string>();
    for (const c of cores) {
      const pt = corParaPT(c);
      if (!ptMap.has(pt)) ptMap.set(pt, c);
    }
    return [...ptMap.keys()].sort();
  }, [model, coresDisponiveis]);

  const filtered = useMemo(() => filterByDeviceType(usedValues, deviceType), [usedValues, deviceType]);
  // Excluidos pelo admin em /admin/usados — comparacao case-insensitive mas
  // MATCH EXATO (nao substring). Excluir "iPhone 11" nao pode derrubar "iPhone 11 Pro".
  const excludedSet = useMemo(() => new Set(excludedModels.map(m => m.toLowerCase())), [excludedModels]);
  const allModels = useMemo(() => {
    const all = getUniqueUsedModels(filtered);
    return all.filter(m => !excludedSet.has(m.toLowerCase()));
  }, [filtered, excludedSet]);
  const lines = useMemo(() => extractLines(allModels, deviceType), [allModels, deviceType]);
  const modelsInLine = useMemo(() => getModelsInLine(allModels, line, deviceType), [allModels, line, deviceType]);

  // Subgrupo: pra MacBook/iPad, agrupa por chip (M1,M2...). Pra Apple Watch,
  // agrupa por geracao (Series 9/10/11, SE 1o/2o/3o, Ultra 1/2).
  const [subLine, setSubLine] = useState("");
  const chipGroups = useMemo(() => {
    if (deviceType !== "macbook" && deviceType !== "ipad" && deviceType !== "watch") return null;
    const groups: Record<string, string[]> = {};
    for (const m of modelsInLine) {
      let chip: string;
      if (deviceType === "watch") {
        // Extrai so a geracao (sem o prefixo da linha) pra combinar corretamente
        // com getLineDisplayName no render. Ex:
        //   SE + "Apple Watch SE 3º 44mm" → chip="3º" → display "Apple Watch SE 3º"
        //   Series + "Apple Watch Series 9 45mm" → chip="9" → display "Apple Watch Series 9"
        //   Ultra + "Apple Watch Ultra 1 49mm" → chip="1" → display "Apple Watch Ultra 1"
        //   Ultra + "Apple Watch Ultra 49mm" (sem num) → chip="Outro" (unico — vira null no chipGroups)
        const seGen = m.match(/Apple Watch SE\s*(\d+)[ºo°]?/i);
        const seriesMatch = m.match(/Apple Watch (?:Series )?(\d+)/i);
        const ultraGen = m.match(/Apple Watch Ultra\s*(\d+)/i);
        if (line === "SE") {
          chip = seGen ? `${seGen[1]}º` : "Outro";
        } else if (line === "Ultra") {
          chip = ultraGen ? `${ultraGen[1]}` : "Outro";
        } else if (line === "Series") {
          chip = seriesMatch ? `${seriesMatch[1]}` : "Outro";
        } else {
          chip = "Outro";
        }
      } else {
        // Extrair chip: "MacBook Air M2 15\"" → "M2", "iPad Pro M4 11\"" → "M4"
        const chipMatch = m.match(/\b(M\d+(?:\s+(?:Pro|Max))?)\b/i);
        chip = chipMatch ? chipMatch[1] : "Outro";
      }
      if (!groups[chip]) groups[chip] = [];
      groups[chip].push(m);
    }
    // Se TODOS os modelos caem em "Outro" (ex: iPad linha generica com iPad 10/11
    // sem chip M), nao agrupa por chip — renderiza modelos direto pra nao mostrar
    // aba "iPad Outro" desnecessaria. O mesmo vale pra Watch sem geracao definida.
    if (Object.keys(groups).length === 1 && groups["Outro"]) return null;
    // Se tem outros chips validos + "Outro", descarta o "Outro" pra nao confundir
    // o cliente com uma aba "SE Outro" fantasma quando existe um modelo mal cadastrado.
    if (Object.keys(groups).length > 1 && groups["Outro"]) delete groups["Outro"];
    return Object.keys(groups).length > 0 ? groups : null;
  }, [modelsInLine, deviceType]);

  // Sort numerico quando os chips sao so numeros/geracoes (SE 3o, Series 10,
  // Ultra 2). String sort () colocaria "10" antes de "9"; aqui forcamos
  // ordenacao numerica por primeiro numero que aparecer no chip.
  const chipList = useMemo(() => {
    if (!chipGroups) return [];
    const keys = Object.keys(chipGroups);
    const extractNum = (s: string) => {
      const m = s.match(/(\d+)/);
      return m ? Number(m[1]) : 999;
    };
    return keys.sort((a, b) => extractNum(a) - extractNum(b));
  }, [chipGroups]);
  const modelsForChip = useMemo(() => chipGroups && subLine ? (chipGroups[subLine] || []) : [], [chipGroups, subLine]);

  // Se o chip selecionado tem só 1 modelo, auto-selecionar
  const needsScreenSize = modelsForChip.length > 1;
  const autoModel = modelsForChip.length === 1 ? modelsForChip[0] : null;

  const storages = useMemo(() => (model ? getUsedStoragesForModel(filtered, model) : []), [filtered, model]);
  const baseValue = useMemo(() => (model && storage ? getUsedBaseValue(filtered, model, storage) : null), [filtered, model, storage]);
  // Pra formatos estruturados (ex: "64GB | 11\" | Wifi"), so considera storage
  // "completo" quando o cliente escolheu armaz + tela (se houver opcoes) +
  // conectividade (se houver opcoes). Gate pras proximas perguntas — evita
  // que o cliente pule tela/conectividade sem perceber.
  const storageCompleto = useMemo(() => {
    if (!storage) return false;
    if (!hasStructuredStorage(storage)) return true;
    const specs = storages.map(s => ({ raw: s, ...parseStorageSpec(s) }));
    const cur = parseStorageSpec(storage);
    const afterArmaz = specs.filter(s => s.armazenamento === cur.armazenamento);
    const telaOpts = [...new Set(afterArmaz.map(s => s.tela).filter(Boolean))];
    if (telaOpts.length > 0 && !cur.tela) return false;
    const afterTela = afterArmaz.filter(s => !cur.tela || s.tela === cur.tela);
    const conectOpts = [...new Set(afterTela.map(s => s.conectividade).filter(Boolean))];
    if (conectOpts.length > 0 && !cur.conectividade) return false;
    return true;
  }, [storage, storages]);

  const calcDeviceType = toCalcDeviceType(deviceType);

  // Calculate accumulated wearMarks discount from selected options
  const wearMarksDiscount = useMemo(() => {
    if (!isQActive(qc, "wearMarks") || wearMarks.length === 0) return 0;
    const opts = getQOptions(qc, "wearMarks");
    return wearMarks.reduce((sum, val) => {
      const opt = opts.find((o) => o.value === val);
      return sum + (opt?.discount || 0);
    }, 0);
  }, [wearMarks, qc]);

  const useNewWearMarks = isQActive(qc, "hasWearMarks");

  const cond: ConditionData = {
    screenScratch: screenScratch ?? "none", sideScratch: sideScratch ?? "none", peeling: peeling ?? "none",
    battery: battery ?? 100, hasDamage: hasDamage === true, partsReplaced: partsReplaced ?? "no",
    partsReplacedDetail: partsReplaced === "apple" ? partsReplacedDetail : "",
    hasWarranty: hasWarranty === true, warrantyMonth: hasWarranty ? warrantyMonth : null,
    warrantyYear: hasWarranty ? warrantyYear : null, hasOriginalBox: hasOriginalBox === true,
    ...(useNewWearMarks ? {
      hasWearMarks: hasWearMarks === true,
      wearMarks,
      wearMarksDiscount,
    } : {}),
  };

  const md = useMemo(() => getDiscountsForModel(model, modelDiscounts), [model, modelDiscounts]);
  const tradeInValue = useMemo(() => {
    if (baseValue === null || (isQActive(qc, "hasDamage") && hasDamage !== false) || (isQActive(qc, "partsReplaced") && partsReplaced === "thirdParty")) return 0;
    return calculateAnyTradeInValue(calcDeviceType, baseValue, cond, md);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseValue, screenScratch, sideScratch, peeling, battery, hasDamage, partsReplaced, hasWarranty, warrantyMonth, warrantyYear, md, hasOriginalBox, hasWearMarks, wearMarksDiscount, calcDeviceType]);

  // Perguntas dinamicas ativas: qualquer pergunta do DB com slug fora dos
  // hardcoded. Ordena por `ordem` pra respeitar a sequencia configurada no admin.
  const dynamicQuestions = useMemo(() => {
    if (!qc) return [];
    return qc
      .filter((q) => q.ativo !== false && !HARDCODED_SLUGS.has(q.slug))
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  }, [qc]);

  // Valida: toda pergunta dinamica precisa ter resposta (exceto multiselect,
  // que pode ficar vazio). Pra simplificar, considera "nao respondida" se a
  // chave nao existe em extraAnswers. Multiselect com [] conta como respondida.
  // Perguntas numericas com config.rejectBelow bloqueiam o avanco quando o valor
  // e menor que o threshold (ex: bateria < 80%).
  const dynamicOk = dynamicQuestions.every((q) => {
    const v = extraAnswers[q.slug];
    if (q.tipo === "multiselect") return v !== undefined;
    if (v === undefined || v === null || v === "") return false;
    if (q.tipo === "numeric" && typeof v === "number") {
      const rb = (q.config as Record<string, unknown>)?.rejectBelow;
      if (typeof rb === "number" && v < rb) return false;
    }
    return true;
  });

  const isExcluded = excludedSet.has(model.toLowerCase());
  // MacBook usa ciclos (0..9999), demais usam saude em % (1..100). Sem esse
  // split, digitar >100 ciclos no Mac mantinha batteryFilled=false e travava
  // o fluxo (proximas perguntas nao apareciam).
  const batteryMax = deviceType === "macbook" ? 9999 : 100;
  const batteryMin = deviceType === "macbook" ? 0 : 1;
  const batteryFilled = !isQActive(qc, "battery") || (battery !== null && battery >= batteryMin && battery <= batteryMax);
  // Pergunta hardcoded "battery" tambem suporta rejeicao por valor minimo:
  // admin cadastra config.rejectBelow (ex: 80) + config.rejectMessage. Quando
  // bateria < rejectBelow, bloqueia canProceed e esconde perguntas seguintes.
  // Pra MacBook, como o campo e ciclos (quanto maior, pior), o admin nao deve
  // usar rejectBelow ali — deve criar dynamic question de saude % separada.
  const batteryRejectBelow = (() => {
    const cfg = getQ(qc, "battery")?.config as Record<string, unknown> | undefined;
    const rb = cfg?.rejectBelow;
    return typeof rb === "number" ? rb : undefined;
  })();
  const batteryRejectMessage = (() => {
    const cfg = getQ(qc, "battery")?.config as Record<string, unknown> | undefined;
    const rm = cfg?.rejectMessage;
    return typeof rm === "string" ? rm : "";
  })();
  const batteryRejected = batteryRejectBelow !== undefined && battery !== null && battery < batteryRejectBelow;

  // Reveal progressivo: mostra pergunta N so quando todas as anteriores (na ordem
  // configurada pelo admin) estao respondidas. Sem isso, perguntas apareciam em
  // cascata (todas de uma vez) e a ordem do admin nao era respeitada.
  const isSlugAnswered = (slug: string): boolean => {
    if (!isQActive(qc, slug)) return true; // pergunta inativa = nao bloqueia
    switch (slug) {
      case "hasDamage": return hasDamage !== null;
      case "battery": return batteryFilled;
      case "hasWearMarks": return hasWearMarks !== null;
      case "wearMarks": return hasWearMarks === false || (hasWearMarks === true && wearMarks.length > 0);
      case "screenScratch": return screenScratch !== null;
      case "sideScratch": return sideScratch !== null;
      case "peeling": return peeling !== null;
      case "partsReplaced": return partsReplaced === "no" || partsReplaced === "apple" || partsReplaced === "thirdParty";
      case "hasWarranty": return hasWarranty !== null;
      case "warrantyMonth": return hasWarranty === false || warrantyMonth !== null;
      case "hasOriginalBox": return hasOriginalBox !== null;
      default: {
        // Pergunta dinamica: considera respondida quando tem valor em extraAnswers.
        const v = extraAnswers[slug];
        const q = getQ(qc, slug);
        if (q?.tipo === "multiselect") return v !== undefined;
        return v !== undefined && v !== null && v !== "";
      }
    }
  };
  // qcSorted inclui tanto slugs do admin (ativos) quanto hardcoded que faltam
  // no qc — pros hardcoded missing, usa HARDCODED_DEFAULT_ORDEM como fallback.
  // Isso garante que allPriorAnswered/isPriorRejecting funcionem mesmo quando o
  // admin deletou o slug ou o qc ainda nao chegou (race condition no loading).
  // Exceto: slugs do sistema antigo de marcas (screenScratch/sideScratch/peeling)
  // nao entram no fallback quando useNewWearMarks=true, senao bloqueiam o reveal
  // de partsReplaced/hasWarranty/hasOriginalBox (ficam "nao respondidos" pra sempre
  // porque nao sao renderizados). Antes dessa excecao, o fluxo de iPhone travava
  // apos "marcas de uso: Nao".
  const LEGACY_WEAR_SLUGS = new Set(["screenScratch", "sideScratch", "peeling"]);
  const qcSorted = (() => {
    const list = (qc || []).filter(q => q.ativo !== false);
    const seen = new Set(list.map(q => q.slug));
    for (const slug of Object.keys(HARDCODED_DEFAULT_ORDEM)) {
      if (useNewWearMarks && LEGACY_WEAR_SLUGS.has(slug)) continue;
      if (!seen.has(slug) && isQActive(qc, slug)) {
        list.push({
          id: `hc-${slug}`, device_type: deviceType, slug, titulo: "", tipo: "yesno",
          opcoes: [], ordem: HARDCODED_DEFAULT_ORDEM[slug], ativo: true, config: {},
        } as TradeInQuestion);
      }
    }
    return list.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  })();
  const allPriorAnswered = (slug: string): boolean => {
    const idx = qcSorted.findIndex(q => q.slug === slug);
    if (idx === -1) return true; // nao ordenado = sem bloqueio
    return qcSorted.slice(0, idx).every(q => isSlugAnswered(q.slug));
  };
  // Ordem do slug vinda do admin — usada pelo Section via flex-order pra que a
  // ordem configurada em /admin/simulacoes seja refletida visualmente sem
  // precisar mexer na ordem do JSX.
  const getOrdem = (slug: string): number | undefined => {
    const q = qc?.find(x => x.slug === slug);
    return q?.ordem;
  };
  // Verifica se alguma pergunta anterior (na ordem do admin) tem resposta com
  // `reject: true` selecionada. Se sim, perguntas posteriores nao renderizam —
  // substitui o wrap generico `hasDamage === false` que fixava a ordem no JSX.
  // Suporta tambem perguntas numericas com config.rejectBelow (ex: bateria < 80%).
  const isPriorRejecting = (slug: string): boolean => {
    const myOrd = getOrdem(slug);
    if (myOrd === undefined) return false;
    return qcSorted.filter(p => (p.ordem ?? 0) < myOrd).some(prev => {
      if (prev.slug === "hasDamage" && hasDamage === true) return true;
      if (prev.slug === "partsReplaced" && partsReplaced === "thirdParty") return true;
      if (prev.slug === "battery" && batteryRejected) return true;
      const v = extraAnswers[prev.slug];
      if (prev.tipo === "numeric" && typeof v === "number") {
        const rb = (prev.config as Record<string, unknown>)?.rejectBelow;
        if (typeof rb === "number" && v < rb) return true;
      }
      const opt = v !== undefined ? prev.opcoes.find(o => o.value === v) : undefined;
      return opt?.reject === true;
    });
  };
  // New wear marks system: if hasWearMarks is active, skip old screenScratch/sideScratch/peeling checks
  const wearMarksOk = !isQActive(qc, "hasWearMarks") || hasWearMarks === false || (hasWearMarks === true && (!isQActive(qc, "wearMarks") || wearMarks.length > 0));
  const screenOk = useNewWearMarks || !isQActive(qc, "screenScratch") || screenScratch !== null;
  const sideOk = useNewWearMarks || !isQActive(qc, "sideScratch") || sideScratch !== null;
  const peelingOk = useNewWearMarks || !isQActive(qc, "peeling") || peeling !== null;
  const allCond = screenOk && sideOk && peelingOk && batteryFilled && wearMarksOk;
  const damageOk = !isQActive(qc, "hasDamage") || hasDamage === false;
  const warrantyFilled = !isQActive(qc, "hasWarranty") || hasWarranty === false || (hasWarranty === true && (!isQActive(qc, "warrantyMonth") || warrantyMonth !== null));
  const partsOk = !isQActive(qc, "partsReplaced") || partsReplaced === "no" || partsReplaced === "apple";
  const boxOk = !isQActive(qc, "hasOriginalBox") || hasOriginalBox !== null;
  const canProceed = model && storageCompleto && cor && baseValue !== null && !isExcluded && damageOk && partsOk && allCond && !batteryRejected && warrantyFilled && boxOk && dynamicOk;

  const tq = (q: string) => onTrackQuestion?.(1, q);
  function handleLineChange(l: string) { setLine(l); setSubLine(""); setModel(""); setStorage(""); setHasDamage(null); tq("line"); }
  function handleSubLineChange(sl: string) { setSubLine(sl); setModel(""); setStorage(""); setHasDamage(null); tq("chip"); }
  function handleModelChange(m: string) { setModel(m); setStorage(""); setHasDamage(null); tq("model"); }

  // Auto-select model when chip has only 1 model
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (autoModel && model !== autoModel) {
      setModel(autoModel);
      setStorage("");
      setHasDamage(null);
    }
  }, [autoModel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select storage when there's only 1 option (ex: Apple Watch Ultra — sempre GPS+Celular).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (model && storages.length === 1 && storage !== storages[0]) {
      setStorage(storages[0]);
    }
  }, [model, storages]); // eslint-disable-line react-hooks/exhaustive-deps

  const deviceLabel = DEVICE_LABELS[deviceType];

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h2 className="text-[22px] font-bold" style={{ color: "var(--ti-text)" }}>Qual {deviceLabel} voce tem?</h2>
        <p className="text-[14px] mt-1" style={{ color: "var(--ti-muted)" }}>Selecione a linha pra comecar</p>
      </div>

      <Section title="">
        <div className={`grid gap-3 ${lines.length <= 2 ? "grid-cols-2 max-w-[320px] mx-auto" : lines.length <= 4 ? "grid-cols-2" : "grid-cols-3"}`} style={{ justifyItems: "center" }}>
          {lines.map((l) => {
            const popular = deviceType === "iphone" ? ["15", "16", "17"].includes(l) : false;
            return (
              <Btn key={l} sel={line===l} onClick={() => handleLineChange(l)}
                className={`w-full text-center ${popular ? "ring-2 ring-[var(--ti-accent)]/20" : ""} ${lines.length <= 2 ? "py-5 text-[16px]" : ""}`}>
                {getLineDisplayName(l, deviceType)}
              </Btn>
            );
          })}
        </div>
      </Section>

      {line && modelsInLine.length > 0 && chipGroups && chipList.length > 0 ? (
        <>
          <Section title="Modelo">
            <div className={`grid gap-3 ${chipList.length <= 2 ? "grid-cols-2 max-w-[320px] mx-auto" : chipList.length <= 4 ? "grid-cols-2" : "grid-cols-3"}`}>
              {chipList.map((chip) => (
                <Btn key={chip} sel={subLine === chip} onClick={() => handleSubLineChange(chip)}
                  className={`w-full text-center ${chipList.length <= 4 ? "py-4 text-[15px]" : ""}`}>
                  {getLineDisplayName(line, deviceType)} {chip}
                </Btn>
              ))}
            </div>
          </Section>
          {subLine && needsScreenSize && (
            <Section title="Tamanho da tela">
              <div className="grid grid-cols-2 gap-3 max-w-[320px] mx-auto">
                {modelsForChip.map((m) => {
                  const sizeMatch = m.match(/(\d+)[""]/);
                  const size = sizeMatch ? `${sizeMatch[1]}"` : m;
                  return (
                    <Btn key={m} sel={model === m} onClick={() => handleModelChange(m)}
                      className="w-full text-center py-4 text-[15px]">
                      {size}
                    </Btn>
                  );
                })}
              </div>
            </Section>
          )}
          {isExcluded && <p className="mt-3 text-[13px] font-medium" style={{ color: "var(--ti-error)" }}>Este modelo nao e aceito no programa de trade-in.</p>}
        </>
      ) : line && modelsInLine.length > 0 ? (
        <Section title="Modelo">
          <div className="grid grid-cols-1 gap-2">
            {modelsInLine.map((m) => <Btn key={m} sel={model===m} onClick={() => handleModelChange(m)} className="text-left">{m}</Btn>)}
          </div>
          {isExcluded && <p className="mt-3 text-[13px] font-medium" style={{ color: "var(--ti-error)" }}>Este modelo nao e aceito no programa de trade-in.</p>}
        </Section>
      ) : null}

      {model && !isExcluded && storages.length > 1 && (
        deviceType === "macbook" ? (
          // MacBook: aceitar tanto o formato antigo "256GB/8GB" (ssd/ram) quanto
          // o novo "13\" | 8GB | 256GB" (tela | ram | ssd, vindo de /admin/usados).
          // Renderiza steps sequenciais: tela (se tiver) → RAM → SSD — o cliente
          // escolhe cada dimensao separadamente em vez de um botao por combinacao.
          (() => {
            const parseMac = (raw: string): { raw: string; tela: string; ram: string; ssd: string } => {
              if (raw.includes("|")) {
                // Formato novo do admin: "tela | ram | ssd"
                const [tela = "", ram = "", ssd = ""] = raw.split("|").map(p => p.trim());
                return { raw, tela, ram, ssd };
              }
              if (raw.includes("/")) {
                // Formato antigo: "ssd/ram" (ordem invertida, legado)
                const [ssd = "", ram = ""] = raw.split("/").map(p => p.trim());
                return { raw, tela: "", ram, ssd };
              }
              // Sem separador: storage unico (pode ser so ssd)
              return { raw, tela: "", ram: "", ssd: raw };
            };
            const specs = storages.map(parseMac);
            const current = storage ? parseMac(storage) : { raw: "", tela: "", ram: "", ssd: "" };
            const sortCapacidade = (a: string, b: string) => (parseInt(a) || 0) - (parseInt(b) || 0);
            const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

            const telaOpts = uniq(specs.map(s => s.tela));
            const afterTela = specs.filter(s => !current.tela || s.tela === current.tela);
            const ramOpts = uniq(afterTela.map(s => s.ram)).sort(sortCapacidade);
            const afterRam = afterTela.filter(s => !current.ram || s.ram === current.ram);
            const ssdOpts = uniq(afterRam.map(s => s.ssd)).sort(sortCapacidade);

            const pickMac = (tela: string, ram: string, ssd: string) => {
              const match = specs.find(s =>
                (!tela || s.tela === tela) &&
                (!ram || s.ram === ram) &&
                (!ssd || s.ssd === ssd)
              );
              if (match) { setStorage(match.raw); tq("storage"); }
            };

            return (
              <>
                {telaOpts.length > 0 && (
                  <Section title="Tamanho da tela">
                    <div className={`grid gap-2 ${telaOpts.length <= 2 ? "grid-cols-2 max-w-[320px] mx-auto" : "grid-cols-3"}`}>
                      {telaOpts.map(t => (
                        <Btn key={t} sel={current.tela === t}
                          onClick={() => pickMac(t, "", "")}
                          className="w-full text-center">{t}</Btn>
                      ))}
                    </div>
                  </Section>
                )}
                {(telaOpts.length === 0 || current.tela) && ramOpts.length > 0 && (
                  <Section title="Memoria RAM">
                    <div className={`grid gap-2 ${ramOpts.length <= 2 ? "grid-cols-2 max-w-[320px] mx-auto" : "grid-cols-3"}`}>
                      {ramOpts.map(r => (
                        <Btn key={r} sel={current.ram === r}
                          onClick={() => pickMac(current.tela, r, "")}
                          className="w-full text-center">{r}</Btn>
                      ))}
                    </div>
                  </Section>
                )}
                {(ramOpts.length === 0 || current.ram) && ssdOpts.length > 0 && (
                  <Section title="Armazenamento SSD">
                    <div className={`grid gap-2 ${ssdOpts.length <= 2 ? "grid-cols-2 max-w-[320px] mx-auto" : "grid-cols-3"}`}>
                      {ssdOpts.map(s => (
                        <Btn key={s} sel={current.ssd === s}
                          onClick={() => pickMac(current.tela, current.ram, s)}
                          className="w-full text-center">{s}</Btn>
                      ))}
                    </div>
                  </Section>
                )}
              </>
            );
          })()
        ) : storages.some(hasStructuredStorage) ? (
          // Formato estruturado "armaz | tela | conect" (iPad/Watch com
          // variantes). Renderiza em steps sequenciais ao inves de 1 botao
          // por combinacao — cliente escolhe armaz → tela → conectividade.
          (() => {
            const specs = storages.map(s => ({ raw: s, ...parseStorageSpec(s) }));
            const currentParts = storage ? parseStorageSpec(storage) : { armazenamento: "", tela: "", conectividade: "" };

            const armazOpts = [...new Set(specs.map(s => s.armazenamento).filter(Boolean))];
            const afterArmaz = specs.filter(s => s.armazenamento === currentParts.armazenamento);
            const telaOpts = [...new Set(afterArmaz.map(s => s.tela).filter(Boolean))];
            const afterTela = afterArmaz.filter(s => !currentParts.tela || s.tela === currentParts.tela);
            const conectOpts = [...new Set(afterTela.map(s => s.conectividade).filter(Boolean))];

            // Ao escolher um spec parcial, seta o `storage` pro raw da primeira
            // variante compativel — vai refinando conforme o cliente escolhe.
            const pickStorage = (armaz: string, tela: string, conect: string) => {
              const match = specs.find(s =>
                s.armazenamento === armaz &&
                (!tela || s.tela === tela) &&
                (!conect || s.conectividade === conect)
              );
              if (match) { setStorage(match.raw); tq("storage"); }
            };

            return (
              <>
                {armazOpts.length > 0 && (
                  <Section title="Armazenamento">
                    <div className={`grid gap-2 ${armazOpts.length <= 2 ? "grid-cols-2 max-w-[320px] mx-auto" : armazOpts.length <= 4 ? "grid-cols-2" : "grid-cols-3"}`}>
                      {armazOpts.map(a => (
                        <Btn key={a} sel={currentParts.armazenamento === a}
                          onClick={() => pickStorage(a, "", "")}
                          className="w-full text-center">{a}</Btn>
                      ))}
                    </div>
                  </Section>
                )}
                {currentParts.armazenamento && telaOpts.length > 0 && (
                  <Section title="Tamanho da tela">
                    <div className={`grid gap-2 ${telaOpts.length <= 2 ? "grid-cols-2 max-w-[320px] mx-auto" : "grid-cols-3"}`}>
                      {telaOpts.map(t => (
                        <Btn key={t} sel={currentParts.tela === t}
                          onClick={() => pickStorage(currentParts.armazenamento, t, "")}
                          className="w-full text-center">{t}</Btn>
                      ))}
                    </div>
                  </Section>
                )}
                {currentParts.armazenamento && (telaOpts.length === 0 || currentParts.tela) && conectOpts.length > 0 && (
                  <Section title="Conectividade">
                    <div className={`grid gap-2 ${conectOpts.length <= 2 ? "grid-cols-2 max-w-[320px] mx-auto" : "grid-cols-3"}`}>
                      {conectOpts.map(c => (
                        <Btn key={c} sel={currentParts.conectividade === c}
                          onClick={() => pickStorage(currentParts.armazenamento, currentParts.tela, c)}
                          className="w-full text-center">{c}</Btn>
                      ))}
                    </div>
                  </Section>
                )}
              </>
            );
          })()
        ) : (
          <Section title="Armazenamento">
            <div className="flex gap-2 flex-wrap">
              {storages.map((s) => <Btn key={s} sel={storage===s} onClick={() => { setStorage(s); tq("storage"); }} className="flex-1 min-w-[80px]">{s}</Btn>)}
            </div>
          </Section>
        )
      )}

      {/* Cor do aparelho */}
      {model && storageCompleto && coresModelo.length > 0 && (
        <Section title="Qual a cor do seu aparelho?">
          <div className={`grid gap-2 ${coresModelo.length <= 4 ? "grid-cols-2" : "grid-cols-3"}`}>
            {coresModelo.map(c => (
              <button key={c} type="button" onClick={() => setCor(c)}
                className="py-3 rounded-xl text-[14px] font-semibold transition-all"
                style={cor === c
                  ? { backgroundColor: "var(--ti-success-light)", color: "var(--ti-success)", border: "2px solid var(--ti-success)" }
                  : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-btn-border)" }
                }
              >{c}</button>
            ))}
          </div>
        </Section>
      )}

      {/* Cor manual — quando não tem cores do catálogo */}
      {model && storageCompleto && coresModelo.length === 0 && (
        <Section title="Qual a cor do seu aparelho?">
          <input
            type="text"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            placeholder="Ex: Preto, Prata, Dourado..."
            className="w-full px-4 py-3 rounded-xl text-[14px] text-center"
            style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)", color: "var(--ti-text)" }}
          />
        </Section>
      )}

      {model && storageCompleto && !isExcluded && cor.trim() && isQActive(qc, "hasDamage") && allPriorAnswered("hasDamage") && !isPriorRejecting("hasDamage") && (
        <Section title={getQTitle(qc, "hasDamage", "O aparelho esta trincado, quebrado ou com defeito?")} order={getOrdem("hasDamage")}>
          <div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "hasDamage");
              const noOpt = opts.find(o => o.value === "no");
              const yesOpt = opts.find(o => o.value === "yes");
              return <>
                <Btn sel={hasDamage===false} onClick={() => { setHasDamage(false); tq("damage"); }} className="flex-1" variant="success">{noOpt?.label || "Nao"}</Btn>
                <Btn sel={hasDamage===true} onClick={() => { setHasDamage(true); tq("damage"); }} className="flex-1" variant="error">{yesOpt?.label || "Sim"}</Btn>
              </>;
            })()}
          </div>
          {hasDamage === true && (
            <div className="mt-4 rounded-2xl p-4 text-center" style={{ backgroundColor: "var(--ti-error-light)", border: "1px solid var(--ti-error)" }}>
              <p className="text-[15px] font-semibold" style={{ color: "var(--ti-error)" }}>{getQOptions(qc, "hasDamage").find(o => o.reject)?.rejectMessage || "Infelizmente nao aceitamos aparelhos com tela trincada, quebrada ou com defeito na troca."}</p>
            </div>
          )}
        </Section>
      )}

      {model && storageCompleto && !isExcluded && cor.trim() && (
        <>
          {isQActive(qc, "battery") && allPriorAnswered("battery") && !isPriorRejecting("battery") && (
          <Section title={getQTitle(qc, "battery", deviceType === "macbook" ? "Ciclos de bateria" : "Saude da bateria")} order={getOrdem("battery")}>
            <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)" }}>
              <div className="relative">
                <input type="tel" inputMode="numeric" pattern="[0-9]*" value={battery ?? ""}
                  placeholder={deviceType === "macbook" ? "Ex: 150" : "Ex: 87"}
                  onChange={(e) => {
                    const r = e.target.value.replace(/\D/g, "");
                    if (r === "") { setBattery(null); return; }
                    // MacBook: campo armazena ciclos (0..9999). Demais: saude em % (1..100).
                    const cap = deviceType === "macbook" ? 9999 : 100;
                    setBattery(Math.min(cap, Number(r)));
                    tq("battery");
                  }}
                  className={`w-full px-4 py-3 ${deviceType === "macbook" ? "pr-4" : "pr-10"} rounded-xl text-[20px] font-bold text-center focus:outline-none transition-colors`}
                  style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)", color: "var(--ti-text)" }}
                />
                {deviceType !== "macbook" && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px] font-bold" style={{ color: "var(--ti-muted)" }}>%</span>
                )}
              </div>
              {deviceType === "ipad" && (
                <button
                  type="button"
                  onClick={() => {
                    // iPad as vezes so mostra "Normal" em vez de numero — cliente
                    // clica pra liberar assumindo aparelho saudavel (100%).
                    setBattery(100);
                    tq("battery");
                  }}
                  className="w-full py-2 rounded-xl text-[13px] font-medium transition-colors"
                  style={{
                    backgroundColor: battery === 100 ? "var(--ti-success-light)" : "var(--ti-input-bg)",
                    color: battery === 100 ? "var(--ti-success)" : "var(--ti-muted)",
                    border: `1px solid ${battery === 100 ? "var(--ti-success)" : "var(--ti-card-border)"}`,
                  }}
                >
                  Aparece só &quot;Normal&quot; no meu iPad
                </button>
              )}
              {deviceType === "iphone" && (
                <details className="rounded-xl p-3" style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
                  <summary className="text-[12px] font-semibold cursor-pointer" style={{ color: "var(--ti-accent)" }}>Como descobrir a saude da bateria?</summary>
                  <div className="text-[11px] space-y-1 mt-2" style={{ color: "var(--ti-muted)" }}>
                    <p>1. Abra <strong style={{ color: "var(--ti-text)" }}>Ajustes</strong> no seu iPhone</p>
                    <p>2. Toque em <strong style={{ color: "var(--ti-text)" }}>Bateria</strong></p>
                    <p>3. Toque em <strong style={{ color: "var(--ti-text)" }}>Saude e Carregamento da Bateria</strong></p>
                    <p>4. Veja o valor em <strong style={{ color: "var(--ti-text)" }}>Capacidade Maxima</strong></p>
                  </div>
                </details>
              )}
              {deviceType === "ipad" && (
                <details className="rounded-xl p-3" style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
                  <summary className="text-[12px] font-semibold cursor-pointer" style={{ color: "var(--ti-accent)" }}>Como descobrir a saude da bateria?</summary>
                  <div className="text-[11px] space-y-1 mt-2" style={{ color: "var(--ti-muted)" }}>
                    <p>1. Abra <strong style={{ color: "var(--ti-text)" }}>Ajustes</strong> no seu iPad</p>
                    <p>2. Toque em <strong style={{ color: "var(--ti-text)" }}>Bateria</strong></p>
                    <p>3. Toque em <strong style={{ color: "var(--ti-text)" }}>Saude da Bateria</strong></p>
                    <p>4. Veja o valor em <strong style={{ color: "var(--ti-text)" }}>Capacidade Maxima</strong></p>
                  </div>
                </details>
              )}
              {deviceType === "macbook" && (
                <details className="rounded-xl p-3" style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
                  <summary className="text-[12px] font-semibold cursor-pointer" style={{ color: "var(--ti-accent)" }}>Como descobrir os ciclos de bateria?</summary>
                  <div className="text-[11px] space-y-1 mt-2" style={{ color: "var(--ti-muted)" }}>
                    <p>1. Clique no menu <strong style={{ color: "var(--ti-text)" }}>Apple</strong> {">"} <strong style={{ color: "var(--ti-text)" }}>Sobre Este Mac</strong></p>
                    <p>2. Clique em <strong style={{ color: "var(--ti-text)" }}>Mais Informacoes</strong></p>
                    <p>3. Role ate o final e clique em <strong style={{ color: "var(--ti-text)" }}>Relatorio do Sistema</strong></p>
                    <p>4. Na barra lateral, clique em <strong style={{ color: "var(--ti-text)" }}>Energia</strong></p>
                    <p>5. Veja <strong style={{ color: "var(--ti-text)" }}>Contagem de Ciclos</strong></p>
                  </div>
                </details>
              )}
              {deviceType === "watch" && (
                <details className="rounded-xl p-3" style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
                  <summary className="text-[12px] font-semibold cursor-pointer" style={{ color: "var(--ti-accent)" }}>Como descobrir a saude da bateria?</summary>
                  <div className="text-[11px] space-y-1 mt-2" style={{ color: "var(--ti-muted)" }}>
                    <p>1. No Apple Watch, abra <strong style={{ color: "var(--ti-text)" }}>Ajustes</strong></p>
                    <p>2. Toque em <strong style={{ color: "var(--ti-text)" }}>Bateria</strong></p>
                    <p>3. Toque em <strong style={{ color: "var(--ti-text)" }}>Saude da Bateria</strong></p>
                    <p>4. Veja o valor em <strong style={{ color: "var(--ti-text)" }}>Capacidade Maxima</strong></p>
                  </div>
                </details>
              )}
              {batteryRejected && batteryRejectMessage && (
                <div className="rounded-2xl p-4 text-center" style={{ backgroundColor: "var(--ti-error-light)", border: "1px solid var(--ti-error)" }}>
                  <p className="text-[15px] font-semibold" style={{ color: "var(--ti-error)" }}>{batteryRejectMessage}</p>
                </div>
              )}
            </div>
          </Section>
          )}

          {/* === NEW: Wear marks 2-step flow === */}
          {batteryFilled && isQActive(qc, "hasWearMarks") && allPriorAnswered("hasWearMarks") && !isPriorRejecting("hasWearMarks") && (
            <Section title={getQTitle(qc, "hasWearMarks", "Seu aparelho possui marcas de uso?")} order={getOrdem("hasWearMarks")}>
              <div className="flex gap-2">
                {(() => {
                  const opts = getQOptions(qc, "hasWearMarks");
                  const noOpt = opts.find(o => o.value === "no");
                  const yesOpt = opts.find(o => o.value === "yes");
                  return <>
                    <Btn sel={hasWearMarks===false} onClick={() => { setHasWearMarks(false); setWearMarks([]); tq("hasWearMarks"); }} className="flex-1" variant="success">{noOpt?.label || "Nao"}</Btn>
                    <Btn sel={hasWearMarks===true} onClick={() => { setHasWearMarks(true); tq("hasWearMarks"); }} className="flex-1">{yesOpt?.label || "Sim"}</Btn>
                  </>;
                })()}
              </div>
            </Section>
          )}

          {batteryFilled && isQActive(qc, "hasWearMarks") && hasWearMarks === true && isQActive(qc, "wearMarks") && allPriorAnswered("wearMarks") && !isPriorRejecting("wearMarks") && (
            <Section title={getQTitle(qc, "wearMarks", "Selecione as marcas de uso:")} order={getOrdem("wearMarks")}>
              <div className="grid grid-cols-1 gap-2">
                {(() => {
                  const opts = getQOptions(qc, "wearMarks");
                  const items = opts.length > 0
                    ? opts
                    : [
                        { value: "screen_scratches", label: "Arranhoes na tela", discount: -200 },
                        { value: "side_marks", label: "Marcas nas laterais", discount: -200 },
                        { value: "light_peeling", label: "Descascado leve", discount: -200 },
                        { value: "heavy_peeling", label: "Descascado forte", discount: -300 },
                      ];
                  return items.map((opt) => {
                    const isSelected = wearMarks.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setWearMarks((prev) =>
                            isSelected ? prev.filter((v) => v !== opt.value) : [...prev, opt.value]
                          );
                          tq("wearMarks");
                        }}
                        className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 text-left"
                        style={isSelected
                          ? { backgroundColor: "var(--ti-error-light)", color: "var(--ti-error)", border: "1px solid var(--ti-error)" }
                          : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-btn-border)" }
                        }
                      >
                        <span className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
                          style={isSelected
                            ? { backgroundColor: "var(--ti-error)", color: "white", border: "1px solid var(--ti-error)" }
                            : { backgroundColor: "transparent", border: "2px solid var(--ti-btn-border)" }
                          }
                        >
                          {isSelected ? "\u2713" : ""}
                        </span>
                        <span className="flex-1">{opt.label}</span>
                        {/* Desconto oculto do cliente */}
                      </button>
                    );
                  });
                })()}
              </div>
              {/* Desconto total oculto do cliente */}
            </Section>
          )}

          {/* === LEGACY: Old individual scratch/peeling questions (only if hasWearMarks is NOT active) === */}
          {batteryFilled && !useNewWearMarks && isQActive(qc, "screenScratch") && allPriorAnswered("screenScratch") && !isPriorRejecting("screenScratch") && <Section title={getQTitle(qc, "screenScratch", "Riscos na tela")} order={getOrdem("screenScratch")}><div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "screenScratch");
              const items: [string, string][] = opts.length > 0
                ? opts.map(o => [o.value, o.label])
                : [["none","Nenhum"],["one","1 risco"],["multiple","2 ou mais"]];
              return items.map(([v,l]) => <Btn key={v} sel={screenScratch===v} onClick={() => { setScreenScratch(v as typeof screenScratch); tq("screenScratch"); }} className="flex-1">{l}</Btn>);
            })()}
          </div></Section>}

          {screenScratch !== null && !useNewWearMarks && isQActive(qc, "sideScratch") && allPriorAnswered("sideScratch") && !isPriorRejecting("sideScratch") && <Section title={getQTitle(qc, "sideScratch", "Riscos laterais")} order={getOrdem("sideScratch")}><div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "sideScratch");
              const items: [string, string][] = opts.length > 0
                ? opts.map(o => [o.value, o.label])
                : [["none","Nenhum"],["one","1 risco"],["multiple","2 ou mais"]];
              return items.map(([v,l]) => <Btn key={v} sel={sideScratch===v} onClick={() => { setSideScratch(v as typeof sideScratch); tq("sideScratch"); }} className="flex-1">{l}</Btn>);
            })()}
          </div></Section>}

          {sideScratch !== null && !useNewWearMarks && isQActive(qc, "peeling") && allPriorAnswered("peeling") && !isPriorRejecting("peeling") && <Section title={getQTitle(qc, "peeling", "Descascado / Amassado")} order={getOrdem("peeling")}><div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "peeling");
              const items: [string, string][] = opts.length > 0
                ? opts.map(o => [o.value, o.label])
                : [["none","Nao"],["light","Leve"],["heavy","Forte"]];
              return items.map(([v,l]) => <Btn key={v} sel={peeling===v} onClick={() => { setPeeling(v as typeof peeling); tq("peeling"); }} className="flex-1">{l}</Btn>);
            })()}
          </div></Section>}

          {/* Parts replaced — 2-step flow: first Sim/Nao, then where */}
          {((useNewWearMarks && (hasWearMarks === false || (hasWearMarks === true && wearMarks.length > 0))) || (!useNewWearMarks && peeling !== null)) && isQActive(qc, "partsReplaced") && allPriorAnswered("partsReplaced") && !isPriorRejecting("partsReplaced") && (
          <Section title={getQTitle(qc, "partsReplaced", "O aparelho ja teve alguma peca trocada?")} order={getOrdem("partsReplaced")}>
            {(() => {
              const tpOpt = getQOptions(qc, "partsReplaced").find(o => o.value === "thirdParty");
              const partsConfig = getQ(qc, "partsReplaced")?.config || {};
              const answeredYes = partsReplaced === "apple" || partsReplaced === "thirdParty";
              return <>
                <div className="flex gap-2">
                  <Btn sel={partsReplaced==="no"} onClick={() => { setPartsReplaced("no"); tq("partsReplaced"); }} variant="success" className="flex-1">Nao</Btn>
                  <Btn sel={answeredYes} onClick={() => { if (!answeredYes) setPartsReplaced("apple"); tq("partsReplaced"); }} className="flex-1">Sim</Btn>
                </div>
                {answeredYes && (
                  <div className="mt-4">
                    <p className="text-[13px] font-semibold text-center mb-2" style={{ color: "var(--ti-text)" }}>Onde foi feito o reparo?</p>
                    <div className="grid grid-cols-1 gap-2">
                      <Btn sel={partsReplaced==="apple"} onClick={() => { setPartsReplaced("apple"); tq("partsReplaced"); }} variant="success">Na loja da Apple (autorizada)</Btn>
                      <Btn sel={partsReplaced==="thirdParty"} onClick={() => { setPartsReplaced("thirdParty"); tq("partsReplaced"); }} variant="error">Fora da Apple</Btn>
                    </div>
                    {partsReplaced === "apple" && (
                      <div className="mt-3">
                        <label className="block text-[12px] font-semibold mb-1.5 text-center" style={{ color: "var(--ti-muted)" }}>Qual peca foi trocada?</label>
                        <input type="text" value={partsReplacedDetail} onChange={(e) => setPartsReplacedDetail(e.target.value)}
                          placeholder={(partsConfig.detailPlaceholder as string) || "Ex: Tela, Bateria, Alto-falante..."}
                          className="w-full px-4 py-3 rounded-2xl text-[14px] text-center focus:outline-none"
                          style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-success)", color: "var(--ti-text)" }} />
                      </div>
                    )}
                    {partsReplaced === "thirdParty" && (
                      <div className="mt-4 rounded-2xl p-4 text-center" style={{ backgroundColor: "var(--ti-error-light)", border: "1px solid var(--ti-error)" }}>
                        <p className="text-[15px] font-semibold" style={{ color: "var(--ti-error)" }}>{tpOpt?.rejectMessage || "Infelizmente nao aceitamos aparelhos com pecas trocadas fora da rede autorizada Apple."}</p>
                      </div>
                    )}
                  </div>
                )}
              </>;
            })()}
          </Section>)}

          {partsOk && isQActive(qc, "hasWarranty") && allPriorAnswered("hasWarranty") && !isPriorRejecting("hasWarranty") && (
          <Section title={getQTitle(qc, "hasWarranty", "Ainda esta na garantia Apple de 12 meses?")} order={getOrdem("hasWarranty")}><div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "hasWarranty");
              const yesOpt = opts.find(o => o.value === "yes");
              const noOpt = opts.find(o => o.value === "no");
              return <>
                <Btn sel={hasWarranty===false} onClick={() => { setHasWarranty(false); setWarrantyMonth(null); tq("warranty"); }} className="flex-1">{noOpt?.label || "Nao"}</Btn>
                <Btn sel={hasWarranty===true} onClick={() => { setHasWarranty(true); tq("warranty"); }} className="flex-1" variant="success">{yesOpt?.label || "Sim"}</Btn>
              </>;
            })()}
          </div></Section>)}

          {hasWarranty === true && isQActive(qc, "warrantyMonth") && allPriorAnswered("warrantyMonth") && !isPriorRejecting("warrantyMonth") && (
            <Section title={getQTitle(qc, "warrantyMonth", "Ate qual mes vai a garantia do seu aparelho?")} order={getOrdem("warrantyMonth")}>
              <div className="flex gap-2 mb-3">
                {[new Date().getFullYear(), new Date().getFullYear()+1].map((y) => <Btn key={y} sel={warrantyYear===y} onClick={() => setWarrantyYear(y)} className="flex-1" variant="success">{y}</Btn>)}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MONTHS.map((m, i) => <Btn key={i} sel={warrantyMonth===i+1} onClick={() => setWarrantyMonth(i+1)} variant="success">{m}</Btn>)}
              </div>
            </Section>
          )}

          {warrantyFilled && isQActive(qc, "hasOriginalBox") && allPriorAnswered("hasOriginalBox") && !isPriorRejecting("hasOriginalBox") && (
          <Section title={getQTitle(qc, "hasOriginalBox", "Ainda tem a caixa original do aparelho?")} order={getOrdem("hasOriginalBox")}><div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "hasOriginalBox");
              const yesOpt = opts.find(o => o.value === "yes");
              const noOpt = opts.find(o => o.value === "no");
              return <>
                <Btn sel={hasOriginalBox===true} onClick={() => { setHasOriginalBox(true); tq("originalBox"); }} className="flex-1" variant="success">{yesOpt?.label || "Sim"}</Btn>
                <Btn sel={hasOriginalBox===false} onClick={() => { setHasOriginalBox(false); tq("originalBox"); }} className="flex-1">{noOpt?.label || "Nao"}</Btn>
              </>;
            })()}
          </div></Section>)}
        </>
      )}

      {/* Perguntas adicionais — cadastradas via /admin/simulacoes com slug
          diferente dos hardcoded. Renderizacao generica por `tipo`. Admin
          pode adicionar/editar/remover pra qualquer device_type sem precisar
          mexer no codigo. */}
      {model && !isExcluded && dynamicQuestions.length > 0 && dynamicQuestions.filter(q => allPriorAnswered(q.slug) && !isPriorRejecting(q.slug)).map((q) => {
        const val = extraAnswers[q.slug];
        const setVal = (v: unknown) => setExtraAnswers((prev) => ({ ...prev, [q.slug]: v }));
        return (
          <Section key={q.id || q.slug} title={q.titulo} order={q.ordem}>
            {q.tipo === "yesno" && (
              <div className="flex gap-2">
                {(q.opcoes.length > 0 ? q.opcoes : [{ value: "yes", label: "Sim" }, { value: "no", label: "Nao" }]).map((opt) => (
                  <Btn key={opt.value} sel={val === opt.value} onClick={() => { setVal(opt.value); tq(q.slug); }} className="flex-1">
                    {opt.label}
                  </Btn>
                ))}
              </div>
            )}
            {q.tipo === "selection" && (
              <div className={`grid gap-2 ${q.opcoes.length <= 2 ? "grid-cols-2" : q.opcoes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                {q.opcoes.map((opt) => (
                  <Btn key={opt.value} sel={val === opt.value} onClick={() => { setVal(opt.value); tq(q.slug); }}>
                    {opt.label}
                  </Btn>
                ))}
              </div>
            )}
            {q.tipo === "multiselect" && (
              <div className="grid grid-cols-2 gap-2">
                {q.opcoes.map((opt) => {
                  const arr = Array.isArray(val) ? (val as string[]) : [];
                  const sel = arr.includes(opt.value);
                  return (
                    <Btn key={opt.value} sel={sel} onClick={() => {
                      const next = sel ? arr.filter((v) => v !== opt.value) : [...arr, opt.value];
                      setVal(next); tq(q.slug);
                    }}>
                      {sel ? "✓ " : ""}{opt.label}
                    </Btn>
                  );
                })}
                {/* Inicializa array vazio quando usuario nao marcou nada ainda, pra validacao saber que ja interagiu */}
                {val === undefined && (
                  <button onClick={() => setVal([])} className="col-span-2 text-[11px] text-[#86868B] underline py-1">Nenhum</button>
                )}
              </div>
            )}
            {q.tipo === "numeric" && (() => {
              const cfg = (q.config || {}) as Record<string, unknown>;
              const ph = typeof cfg.placeholder === "string" ? cfg.placeholder : "Ex: 500";
              const help = typeof cfg.helpText === "string" ? cfg.helpText : "";
              const rb = typeof cfg.rejectBelow === "number" ? cfg.rejectBelow : undefined;
              const rm = typeof cfg.rejectMessage === "string" ? cfg.rejectMessage : "";
              const isRejected = typeof val === "number" && rb !== undefined && val < rb;
              return (
                <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)" }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={typeof val === "number" ? String(val) : (typeof val === "string" ? val : "")}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      const num = raw === "" ? undefined : Number(raw);
                      setVal(Number.isFinite(num as number) ? (num as number) : undefined);
                      tq(q.slug);
                    }}
                    className="w-full px-4 py-3 rounded-xl text-[20px] font-bold text-center focus:outline-none transition-colors"
                    style={{ backgroundColor: "var(--ti-input-bg)", color: "var(--ti-text)", border: "1px solid var(--ti-card-border)" }}
                    placeholder={ph}
                  />
                  {help && (
                    <details className="rounded-xl p-3" style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
                      <summary className="text-[12px] font-semibold cursor-pointer" style={{ color: "var(--ti-accent)" }}>Como descobrir?</summary>
                      <p className="text-[11px] mt-2 whitespace-pre-line" style={{ color: "var(--ti-muted)" }}>{help}</p>
                    </details>
                  )}
                  {isRejected && rm && (
                    <div className="rounded-2xl p-4 text-center" style={{ backgroundColor: "var(--ti-error-light)", border: "1px solid var(--ti-error)" }}>
                      <p className="text-[15px] font-semibold" style={{ color: "var(--ti-error)" }}>{rm}</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </Section>
        );
      })}

      {canProceed && (
        <button onClick={() => onNext({
          usedModel: model, usedStorage: storage, usedColor: cor, condition: cond, tradeInValue, deviceType: calcDeviceType,
          extraAnswers: dynamicQuestions.length > 0 ? extraAnswers : undefined,
        })}
          className="w-full py-4 rounded-2xl text-[17px] font-semibold text-white transition-all duration-200 active:scale-[0.98] shadow-lg"
          style={{ backgroundColor: "#22c55e", order: 999 }}>
          Ver minha avaliacao {"\u2192"}
        </button>
      )}
    </div>
  );
}

function Section({ title, children, order }: { title: string; children: React.ReactNode; order?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Auto-scroll para a secao quando ela aparece
    const timer = setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => clearTimeout(timer);
  }, []);
  // `order` (quando definido) reordena a secao via flex-order do container pai —
  // usado pra que a ordem configurada no admin (/admin/simulacoes) seja refletida
  // no simulador cliente, sem precisar mexer na ordem dos blocos JSX.
  return (
    <div className="animate-fadeIn" ref={ref} style={order !== undefined ? { order } : undefined}>
      <label className="block text-[14px] font-bold mb-3 text-center" style={{ color: "var(--ti-text)" }}>{title}</label>
      {children}
    </div>
  );
}

function Btn({ sel, onClick, children, className = "", variant = "default", style: extraStyle }: {
  sel: boolean; onClick: () => void; children: React.ReactNode; className?: string; variant?: "default"|"success"|"error"; style?: React.CSSProperties;
}) {
  const selStyle = variant === "success"
    ? { backgroundColor: "var(--ti-success-light)", color: "var(--ti-success)", border: "1px solid var(--ti-success)" }
    : variant === "error"
    ? { backgroundColor: "var(--ti-error-light)", color: "var(--ti-error)", border: "1px solid var(--ti-error)" }
    : { backgroundColor: "var(--ti-accent-light)", color: "var(--ti-accent-text)", border: "1px solid var(--ti-accent)" };
  const unselStyle = { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-btn-border)" };

  return (
    <button onClick={onClick} className={`px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 ${className}`}
      style={{ ...(sel ? selStyle : unselStyle), ...extraStyle }}>
      {children}
    </button>
  );
}
