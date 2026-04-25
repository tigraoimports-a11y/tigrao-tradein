"use client";

import { useState } from "react";
import { getAnyConditionEntries, type AnyConditionData, type DeviceType } from "@/lib/calculations";
import type { TradeInQuestion } from "@/lib/types";
import { getHoneypotValue } from "@/lib/honeypot-client";

interface StepManualHandoffProps {
  usedModel: string;
  usedStorage: string;
  usedColor?: string;
  condition: AnyConditionData;
  deviceType: DeviceType;
  // Perguntas dinamicas respondidas no Step 1 (cadastradas via /admin/simulacoes
  // com slug fora dos hardcoded). Usado pra montar a mensagem do WhatsApp e o
  // resumo visual com TODAS as respostas — operador precisa disso pra avaliar.
  extraAnswers?: Record<string, unknown>;
  extraQuestions?: TradeInQuestion[];
  // 2o aparelho opcional
  usedModel2?: string;
  usedStorage2?: string;
  usedColor2?: string;
  condition2?: AnyConditionData;
  deviceType2?: DeviceType;
  extraAnswers2?: Record<string, unknown>;
  extraQuestions2?: TradeInQuestion[];
  // Configuracao completa de perguntas (admin) — usada pra ordenar a mistura de
  // condicoes hardcoded + perguntas dinamicas no resumo, respeitando o `ordem`
  // que o operador definiu. Sem isso, condLines aparecem antes e o admin nao
  // consegue intercalar (ex: bateria entre garantia e arranhoes).
  questionsConfig?: TradeInQuestion[];
  // Produto novo escolhido
  newModel: string;
  newStorage: string;
  newPrice: number;
  // Dados cliente
  clienteNome: string;
  clienteWhatsApp: string;
  clienteInstagram: string;
  clienteOrigem: string;
  // Destino da mensagem
  whatsappNumero: string;
  vendedor?: string | null;
  onReset: () => void;
  onGoToStep?: (step: number) => void;
}

// Ordem fallback dos slugs hardcoded (espelha StepUsedDeviceMulti). Usado
// quando o admin nao definiu ordem pra um slug — ex: hardcoded sem entrada no qc.
const HARDCODED_DEFAULT_ORDEM: Record<string, number> = {
  hasDamage: 1, battery: 2, hasWearMarks: 3, wearMarks: 4,
  screenScratch: 4.1, sideScratch: 4.2, peeling: 4.3,
  bodyScratch: 4.4, keyboardCondition: 4.5,
  partsReplaced: 5, hasCharger: 5.5, hasWarranty: 6, warrantyMonth: 7,
  hasApplePencil: 7.5, hasOriginalBox: 8,
};

const SLUG_SUFFIXES = ["_iphone", "_ipad", "_macbook", "_watch"];
function normalizeSlug(slug: string): string {
  for (const suf of SLUG_SUFFIXES) {
    if (slug.endsWith(suf)) return slug.slice(0, -suf.length);
  }
  return slug;
}

/** Resolve a opcao escolhida pelo cliente. Aceita boolean (yes/no) ou string. */
function findSelectedOption(q: TradeInQuestion, value: unknown) {
  if (typeof value === "boolean") {
    const target = value ? "yes" : "no";
    return q.opcoes.find((o) => o.value === target || o.value === (value ? "sim" : "nao"));
  }
  return q.opcoes.find((o) => o.value === value);
}

/** Heuristica pra construir uma frase completa de yesno. Pega `q.config.summaryLabel`
 *  se setado pelo admin (mais conciso pro resumo); senao usa o titulo da
 *  pergunta sem o "?". Pra resposta negativa, prefixa "Não " com lowercase
 *  do primeiro caractere.
 *  Ex: config.summaryLabel="Possui o carregador completo original" + Sim →
 *      "Possui o carregador completo original".
 *  Ex: titulo="Possui o carregador?" + Não → "Não possui o carregador". */
function buildYesnoSummary(q: TradeInQuestion, value: unknown): string | null {
  if (q.tipo !== "yesno") return null;
  const cfgLabel = (q.config as Record<string, unknown>)?.summaryLabel;
  const source = (typeof cfgLabel === "string" && cfgLabel.trim()) ? cfgLabel : q.titulo || "";
  const base = source.trim().replace(/\?+\s*$/, "").trim();
  if (!base) return null;
  let isPositive: boolean;
  if (typeof value === "boolean") {
    isPositive = value;
  } else if (typeof value === "string") {
    const v = value.toLowerCase().trim();
    if (v === "yes" || v === "sim" || v === "true" || v === "1") isPositive = true;
    else if (v === "no" || v === "nao" || v === "não" || v === "false" || v === "0") isPositive = false;
    else return null;
  } else {
    return null;
  }
  if (isPositive) return base;
  return `Não ${base[0].toLowerCase()}${base.slice(1)}`;
}

/** Pega o titulo "bold" pro resumo (numeric e fallback kv): usa
 *  `q.config.summaryLabel` quando setado, senao o titulo da pergunta. */
function summaryBold(q: TradeInQuestion): string {
  const cfgLabel = (q.config as Record<string, unknown>)?.summaryLabel;
  if (typeof cfgLabel === "string" && cfgLabel.trim()) return cfgLabel.trim();
  return q.titulo || q.slug;
}

// Formata uma resposta dinamica em string human-readable (so o valor, sem o titulo).
function formatExtraAnswer(q: TradeInQuestion, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) {
    const labels = value.map((v) => q.opcoes.find((o) => o.value === v)?.label || String(v));
    return labels.length > 0 ? labels.join(", ") : "—";
  }
  if (typeof value === "boolean") return value ? "Sim" : "Nao";
  // Numeric: anexa unidade cadastrada no q.config.unit (ex: "%", " ciclos").
  // Saude da bateria => "84%". Ciclos => "150 ciclos". Sem unidade, so o numero.
  if (q.tipo === "numeric" && typeof value === "number") {
    const cfg = (q.config || {}) as Record<string, unknown>;
    const unit = typeof cfg.unit === "string" ? cfg.unit : "";
    return unit ? `${value}${unit}` : String(value);
  }
  const opt = q.opcoes.find((o) => o.value === value);
  return opt?.label || String(value);
}

/** Linha unificada do resumo. `bold` (opcional) e o prefixo a destacar (titulo
 *  da pergunta) — quando ausente, a linha inteira renderiza como texto comum
 *  (condicoes hardcoded e respostas com summaryLabel). */
type SummaryLine = { slug: string; ordem: number; bold?: string; text: string };

/** Constroi um lookup slug → ordem a partir do qc do admin (com slugs
 *  normalizados). Ordem do admin sempre vence o HARDCODED_DEFAULT_ORDEM. */
function buildOrdemBySlug(questionsConfig: TradeInQuestion[] | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const q of questionsConfig ?? []) {
    if (q.ativo === false) continue;
    if (typeof q.ordem === "number") map.set(normalizeSlug(q.slug), q.ordem);
  }
  return map;
}

/** Mistura entries hardcoded + perguntas dinamicas em uma lista ordenada pelo
 *  ordem do admin. Se admin moveu uma yesno dynamic pra ordem 2.5, ela aparece
 *  entre `hasDamage` (1) e `wearMarks` (4) no resumo. */
function buildOrderedLines(
  deviceType: DeviceType,
  condition: AnyConditionData,
  extraQuestions: TradeInQuestion[] | undefined,
  extraAnswers: Record<string, unknown> | undefined,
  questionsConfig: TradeInQuestion[] | undefined,
): SummaryLine[] {
  const ordemBySlug = buildOrdemBySlug(questionsConfig);
  const ordemFor = (slug: string): number => {
    const fromAdmin = ordemBySlug.get(slug);
    if (fromAdmin !== undefined) return fromAdmin;
    return HARDCODED_DEFAULT_ORDEM[slug] ?? 999;
  };

  // Hardcoded: cada entry vira linha de texto simples (sem bold prefix).
  const condLines: SummaryLine[] = getAnyConditionEntries(deviceType, condition).map((e) => ({
    slug: e.slug,
    ordem: ordemFor(e.slug),
    text: e.text,
  }));

  // Dinamicas: cada pergunta respondida vira KV (com bold) ou frase completa
  // (sem bold) quando a opcao tem summaryLabel cadastrado.
  const extraLines: SummaryLine[] = (extraQuestions ?? [])
    .map((q): SummaryLine | null => {
      const raw = extraAnswers?.[q.slug];
      if (raw === undefined || raw === null || raw === "") return null;
      const slugN = normalizeSlug(q.slug);
      const ordem = typeof q.ordem === "number" ? q.ordem : ordemFor(slugN);
      if (!Array.isArray(raw)) {
        const opt = findSelectedOption(q, raw);
        if (opt?.summaryLabel) {
          return { slug: slugN, ordem, text: opt.summaryLabel };
        }
        // Fallback heuristico: yesno sem summaryLabel cadastrado vira frase
        // completa baseada no titulo. Evita "Pergunta?: Sim" no resumo —
        // mostra "Possui o carregador completo" / "Não possui o carregador
        // completo" automaticamente.
        const yesno = buildYesnoSummary(q, raw);
        if (yesno) {
          return { slug: slugN, ordem, text: yesno };
        }
        // Numeric com quick-value cadastrado: quando o valor bate exatamente,
        // mostra o rotulo (ex: "Saude da bateria: Normal" em vez de "100").
        if (q.tipo === "numeric" && typeof raw === "number") {
          const cfg = (q.config || {}) as Record<string, unknown>;
          const quickLabel = typeof cfg.quickLabel === "string" && cfg.quickLabel.trim() ? cfg.quickLabel : null;
          const quickValue = typeof cfg.quickValue === "number" ? cfg.quickValue : null;
          if (quickLabel !== null && quickValue !== null && raw === quickValue) {
            return { slug: slugN, ordem, bold: summaryBold(q), text: quickLabel };
          }
        }
      }
      const value = formatExtraAnswer(q, raw);
      if (value === "—") return null;
      return { slug: slugN, ordem, bold: summaryBold(q), text: value };
    })
    .filter((l): l is SummaryLine => l !== null);

  return [...condLines, ...extraLines].sort((a, b) => a.ordem - b.ordem);
}

/**
 * Handoff pra avaliacao manual via WhatsApp. Renderizado em vez do StepQuote
 * quando o modelo usado nao tem preco base cadastrado (ou a categoria esta
 * em modo manual). Ainda salva a simulacao como lead pra equipe ter historico.
 */
export default function StepManualHandoff(p: StepManualHandoffProps) {
  const {
    usedModel, usedStorage, usedColor, condition, deviceType,
    extraAnswers, extraQuestions,
    usedModel2, usedStorage2, usedColor2, condition2, deviceType2,
    extraAnswers2, extraQuestions2,
    questionsConfig,
    newModel, newStorage, newPrice,
    clienteNome, clienteWhatsApp, clienteInstagram, clienteOrigem,
    whatsappNumero, vendedor, onReset, onGoToStep,
  } = p;

  const [enviando, setEnviando] = useState(false);

  const hasSecond = !!(usedModel2 && usedStorage2);
  const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

  // Lista unificada (condicoes hardcoded + perguntas dinamicas) ordenada pela
  // posicao definida no admin. Usado tanto no resumo UI quanto na mensagem
  // WhatsApp e no lead, pra que a ordem visivel pro cliente bata com o que
  // chega pro operador.
  const orderedLines1 = buildOrderedLines(deviceType, condition, extraQuestions, extraAnswers, questionsConfig);
  const orderedLines2 = (hasSecond && condition2 && deviceType2)
    ? buildOrderedLines(deviceType2, condition2, extraQuestions2, extraAnswers2, questionsConfig)
    : [];

  function lineToText(l: SummaryLine): string {
    return l.bold ? `${l.bold}: ${l.text}` : l.text;
  }

  function buildWhatsAppMsg(): string {
    const lines: string[] = [];
    lines.push(`Olá! Fiz a simulação de Trade-In no site e gostaria de receber o orçamento.`);
    lines.push("");
    lines.push(`*DADOS DO CLIENTE:*`);
    lines.push(`Nome: ${clienteNome || "Não informado"}`);
    lines.push(`WhatsApp: ${clienteWhatsApp || "Não informado"}`);
    if (clienteInstagram) lines.push(`Instagram: ${clienteInstagram}`);
    if (clienteOrigem) lines.push(`Origem: ${clienteOrigem}`);

    lines.push("");
    lines.push(`*PRODUTO NOVO DESEJADO:*`);
    lines.push(`${newModel} ${newStorage}${newPrice > 0 ? ` — ${fmt(newPrice)}` : ""}`);

    lines.push("");
    lines.push(hasSecond ? `*APARELHOS NA TROCA (avaliação manual):*` : `*APARELHO NA TROCA (avaliação manual):*`);
    if (hasSecond) lines.push("", `*Aparelho 1:*`);
    lines.push(`Modelo: ${usedModel} ${usedStorage}`);
    if (usedColor) lines.push(`Cor: ${usedColor}`);
    for (const l of orderedLines1) lines.push(lineToText(l));

    if (hasSecond && condition2 && deviceType2) {
      lines.push("", `*Aparelho 2:*`);
      lines.push(`Modelo: ${usedModel2} ${usedStorage2 || ""}`);
      if (usedColor2) lines.push(`Cor: ${usedColor2}`);
      for (const l of orderedLines2) lines.push(lineToText(l));
    }

    lines.push("");
    lines.push("Gostaria de saber o valor da avaliação e condições de pagamento!");
    return lines.join("\n");
  }

  async function handleEnviar() {
    setEnviando(true);
    // Salva lead com status AVALIACAO_MANUAL pra equipe ter historico
    try {
      // condicaoLinhas chega no admin com a mesma ordem que o cliente viu.
      const condicaoLinhas = orderedLines1.map(lineToText);
      const condicaoLinhas2 = orderedLines2.map(lineToText);
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: clienteNome,
          whatsapp: clienteWhatsApp || "",
          instagram: clienteInstagram || "",
          origem: clienteOrigem || "",
          modeloNovo: newModel,
          storageNovo: newStorage,
          precoNovo: newPrice || 0,
          modeloUsado: usedModel,
          storageUsado: usedStorage,
          corUsado: usedColor || "",
          avaliacaoUsado: 0,
          diferenca: 0,
          status: "AVALIACAO_MANUAL",
          formaPagamento: "WhatsApp Avaliacao Manual",
          condicaoLinhas,
          whatsappDestino: whatsappNumero,
          vendedor: vendedor || null,
          ...(hasSecond ? {
            modeloUsado2: usedModel2,
            storageUsado2: usedStorage2,
            corUsado2: usedColor2 || "",
            avaliacaoUsado2: 0,
            condicaoLinhas2: condicaoLinhas2,
          } : {}),
          website: getHoneypotValue(),
        }),
      });
    } catch { /* ignora falha no lead — cliente nao deve ser bloqueado */ }
    const msg = encodeURIComponent(buildWhatsAppMsg());
    window.location.href = `https://wa.me/${whatsappNumero}?text=${msg}`;
  }

  const cardStyle = {
    backgroundColor: "var(--ti-card-bg)",
    border: "1px solid var(--ti-card-border)",
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl p-5 text-center space-y-2" style={cardStyle}>
        <p className="text-[36px]">✅</p>
        <p className="text-[18px] font-bold" style={{ color: "var(--ti-text)" }}>
          Recebemos sua solicitação!
        </p>
        <p className="text-[13px]" style={{ color: "var(--ti-muted)" }}>
          A avaliação do seu aparelho vai ser feita manualmente pela nossa equipe —
          clique abaixo pra falar no WhatsApp e receber o orçamento completo.
        </p>
      </div>

      {/* Resumo */}
      <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--ti-muted)" }}>
            Produto novo desejado
          </p>
          <p className="text-[15px] font-semibold" style={{ color: "var(--ti-text)" }}>
            {newModel} {newStorage}
          </p>
        </div>
        <div className="border-t pt-3" style={{ borderColor: "var(--ti-card-border)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--ti-muted)" }}>
            {hasSecond ? "Aparelhos na troca" : "Aparelho na troca"}
          </p>
          <p className="text-[14px]" style={{ color: "var(--ti-text)" }}>
            {usedModel} {usedStorage}
            {usedColor ? ` · ${usedColor}` : ""}
          </p>
          {orderedLines1.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {orderedLines1.map((l, i) => (
                <p key={`l1-${i}`} className="text-[12px]" style={{ color: "var(--ti-muted)" }}>
                  {l.bold ? (<><span className="font-medium">{l.bold}:</span> {l.text}</>) : l.text}
                </p>
              ))}
            </div>
          )}
          {hasSecond && (
            <>
              <p className="text-[14px] mt-3" style={{ color: "var(--ti-text)" }}>
                {usedModel2} {usedStorage2}
                {usedColor2 ? ` · ${usedColor2}` : ""}
              </p>
              {orderedLines2.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {orderedLines2.map((l, i) => (
                    <p key={`l2-${i}`} className="text-[12px]" style={{ color: "var(--ti-muted)" }}>
                      {l.bold ? (<><span className="font-medium">{l.bold}:</span> {l.text}</>) : l.text}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <button
        onClick={handleEnviar}
        disabled={enviando}
        className="w-full py-4 rounded-2xl text-[15px] font-semibold text-white transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60"
        style={{ backgroundColor: "#25D366" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492l4.612-1.474A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75c-2.115 0-4.07-.662-5.674-1.789l-.407-.264-2.746.878.829-2.676-.281-.427A9.71 9.71 0 012.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75z"/>
        </svg>
        {enviando ? "Abrindo WhatsApp..." : "Receber orçamento no WhatsApp"}
      </button>

      {/* Editar */}
      {onGoToStep && (
        <div className="rounded-2xl p-4 space-y-2" style={cardStyle}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-center mb-2" style={{ color: "var(--ti-muted)" }}>
            Editar informações
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => onGoToStep(1)}
              className="py-2.5 rounded-xl text-[12px] font-medium transition-all"
              style={{ color: "var(--ti-muted)", backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
              Aparelho usado
            </button>
            <button onClick={() => onGoToStep(2)}
              className="py-2.5 rounded-xl text-[12px] font-medium transition-all"
              style={{ color: "var(--ti-muted)", backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
              Aparelho novo
            </button>
            <button onClick={() => onGoToStep(3)}
              className="py-2.5 rounded-xl text-[12px] font-medium transition-all"
              style={{ color: "var(--ti-muted)", backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
              Dados pessoais
            </button>
          </div>
        </div>
      )}

      <button
        onClick={onReset}
        className="w-full py-3 rounded-2xl text-[14px] font-medium transition-all"
        style={{ color: "var(--ti-muted)", backgroundColor: "var(--ti-btn-bg)", border: "1px solid var(--ti-btn-border)" }}
      >
        Começar de novo
      </button>
    </div>
  );
}
