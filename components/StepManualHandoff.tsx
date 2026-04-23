"use client";

import { useState } from "react";
import { getAnyConditionLines, type AnyConditionData, type DeviceType } from "@/lib/calculations";
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

// Formata uma resposta dinamica em string human-readable.
function formatExtraAnswer(q: TradeInQuestion, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) {
    const labels = value.map((v) => q.opcoes.find((o) => o.value === v)?.label || String(v));
    return labels.length > 0 ? labels.join(", ") : "—";
  }
  if (typeof value === "boolean") return value ? "Sim" : "Nao";
  const opt = q.opcoes.find((o) => o.value === value);
  return opt?.label || String(value);
}

// Converte respostas dinamicas em pares { label, value } pra renderizar/exibir.
function formatExtraLines(questions: TradeInQuestion[] | undefined, answers: Record<string, unknown> | undefined): { label: string; value: string }[] {
  if (!questions || !answers) return [];
  return questions
    .map((q) => ({ label: q.titulo || q.slug, value: formatExtraAnswer(q, answers[q.slug]) }))
    .filter((l) => l.value !== "—");
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
    newModel, newStorage, newPrice,
    clienteNome, clienteWhatsApp, clienteInstagram, clienteOrigem,
    whatsappNumero, vendedor, onReset, onGoToStep,
  } = p;

  const [enviando, setEnviando] = useState(false);

  const hasSecond = !!(usedModel2 && usedStorage2);
  const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

  // Linhas das perguntas dinamicas pra resumo UI + mensagem WhatsApp
  const extraLines1 = formatExtraLines(extraQuestions, extraAnswers);
  const extraLines2 = formatExtraLines(extraQuestions2, extraAnswers2);

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
    const condLines = getAnyConditionLines(deviceType, condition);
    if (condLines.length > 0) lines.push(`Condição: ${condLines.join(", ")}`);
    // Perguntas dinamicas (cadastradas via /admin/simulacoes)
    for (const l of extraLines1) lines.push(`${l.label}: ${l.value}`);

    if (hasSecond && condition2 && deviceType2) {
      lines.push("", `*Aparelho 2:*`);
      lines.push(`Modelo: ${usedModel2} ${usedStorage2 || ""}`);
      if (usedColor2) lines.push(`Cor: ${usedColor2}`);
      const condLines2 = getAnyConditionLines(deviceType2, condition2);
      if (condLines2.length > 0) lines.push(`Condição: ${condLines2.join(", ")}`);
      for (const l of extraLines2) lines.push(`${l.label}: ${l.value}`);
    }

    lines.push("");
    lines.push("Gostaria de saber o valor da avaliação e condições de pagamento!");
    return lines.join("\n");
  }

  async function handleEnviar() {
    setEnviando(true);
    // Salva lead com status AVALIACAO_MANUAL pra equipe ter historico
    try {
      const condLines = getAnyConditionLines(deviceType, condition);
      const condLines2 = hasSecond && condition2 && deviceType2 ? getAnyConditionLines(deviceType2, condition2) : [];
      // Respostas dinamicas viram linhas "Label: Valor" e entram em condicaoLinhas
      // pra chegar no admin junto com as condicoes hardcoded.
      const extraLinesStr1 = extraLines1.map((l) => `${l.label}: ${l.value}`);
      const extraLinesStr2 = extraLines2.map((l) => `${l.label}: ${l.value}`);
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
          condicaoLinhas: [...condLines, ...extraLinesStr1],
          whatsappDestino: whatsappNumero,
          vendedor: vendedor || null,
          ...(hasSecond ? {
            modeloUsado2: usedModel2,
            storageUsado2: usedStorage2,
            corUsado2: usedColor2 || "",
            avaliacaoUsado2: 0,
            condicaoLinhas2: [...condLines2, ...extraLinesStr2],
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
          {extraLines1.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {extraLines1.map((l, i) => (
                <p key={i} className="text-[12px]" style={{ color: "var(--ti-muted)" }}>
                  <span className="font-medium">{l.label}:</span> {l.value}
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
              {extraLines2.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {extraLines2.map((l, i) => (
                    <p key={i} className="text-[12px]" style={{ color: "var(--ti-muted)" }}>
                      <span className="font-medium">{l.label}:</span> {l.value}
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
