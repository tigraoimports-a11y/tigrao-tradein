"use client";

import { useState, useMemo } from "react";
import { INSTALLMENT_RATES, formatBRL } from "@/lib/calculations";

export interface PaymentBlock {
  id: string;
  tipo: "PIX" | "DEBITO" | "CREDITO";
  valor: string; // string para input controlado
  parcelas: number; // 1-21, so para CREDITO
}

interface FlexiblePaymentSimulatorProps {
  totalAPagar: number; // valor total da diferenca
  onPaymentChange?: (blocks: PaymentBlock[], resumo: PaymentSummary) => void;
  compact?: boolean; // modo compacto para embedding
}

export interface PaymentSummary {
  totalPago: number;       // soma dos valores de cada bloco
  totalComJuros: number;   // soma dos valores com juros aplicados
  valorLiquido: number;    // quanto a loja recebe de fato
  faltaPagar: number;      // totalAPagar - totalPago
  blocks: { tipo: string; valor: number; parcelas: number; juros: number; totalBloco: number; valorParcela: number }[];
}

let _blockIdCounter = 0;
function newBlockId() { return `pb_${++_blockIdCounter}_${Date.now()}`; }

function getInstallmentRate(parcelas: number): number {
  const entry = INSTALLMENT_RATES.find(([n]) => n === parcelas);
  return entry ? entry[1] : 1;
}

function calcTaxaPct(parcelas: number): number {
  const rate = getInstallmentRate(parcelas);
  return Math.round((rate - 1) * 10000) / 100; // ex: 1.13 -> 13%
}

export function calculatePaymentSummary(blocks: PaymentBlock[], totalAPagar: number): PaymentSummary {
  const result: PaymentSummary = {
    totalPago: 0, totalComJuros: 0, valorLiquido: 0, faltaPagar: totalAPagar, blocks: [],
  };

  for (const b of blocks) {
    const valor = parseFloat(b.valor) || 0;
    if (valor <= 0) continue;

    let juros = 0;
    let totalBloco = valor;
    let valorParcela = valor;

    if (b.tipo === "CREDITO" && b.parcelas >= 1) {
      const rate = getInstallmentRate(b.parcelas);
      totalBloco = Math.round(valor * rate);
      juros = totalBloco - valor;
      valorParcela = Math.round(totalBloco / b.parcelas);
    } else if (b.tipo === "DEBITO") {
      // debito: sem juros pro cliente, taxa absorvida pela loja
      totalBloco = valor;
      valorParcela = valor;
    }

    result.totalPago += valor;
    result.totalComJuros += totalBloco;
    result.valorLiquido += valor; // loja recebe o valor sem juros (juros e pra maquininha)
    result.blocks.push({ tipo: b.tipo, valor, parcelas: b.parcelas, juros, totalBloco, valorParcela });
  }

  result.faltaPagar = Math.max(0, totalAPagar - result.totalPago);
  return result;
}

const PARCELAS_OPCOES = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];

export default function FlexiblePaymentSimulator({ totalAPagar, onPaymentChange, compact }: FlexiblePaymentSimulatorProps) {
  const [blocks, setBlocks] = useState<PaymentBlock[]>([
    { id: newBlockId(), tipo: "PIX", valor: "", parcelas: 1 },
  ]);

  const summary = useMemo(() => calculatePaymentSummary(blocks, totalAPagar), [blocks, totalAPagar]);

  const updateBlocks = (newBlocks: PaymentBlock[]) => {
    setBlocks(newBlocks);
    onPaymentChange?.(newBlocks, calculatePaymentSummary(newBlocks, totalAPagar));
  };

  const addBlock = () => {
    updateBlocks([...blocks, { id: newBlockId(), tipo: "CREDITO", valor: "", parcelas: 12 }]);
  };

  const removeBlock = (id: string) => {
    if (blocks.length <= 1) return;
    updateBlocks(blocks.filter(b => b.id !== id));
  };

  const updateBlock = (id: string, field: keyof PaymentBlock, value: string | number) => {
    updateBlocks(blocks.map(b => {
      if (b.id !== id) return b;
      const updated = { ...b, [field]: value };
      // Reset parcelas quando muda pra PIX ou DEBITO
      if (field === "tipo" && (value === "PIX" || value === "DEBITO")) {
        updated.parcelas = 1;
      }
      return updated;
    }));
  };

  // Auto-preencher valor restante
  const autoFillRemaining = (id: string) => {
    const otherTotal = blocks.reduce((sum, b) => b.id === id ? sum : sum + (parseFloat(b.valor) || 0), 0);
    const remaining = Math.max(0, totalAPagar - otherTotal);
    updateBlock(id, "valor", String(remaining));
  };

  const excedeu = summary.totalPago > totalAPagar;

  return (
    <div className="space-y-4">
      {/* Blocos de pagamento */}
      {blocks.map((block, idx) => {
        const valor = parseFloat(block.valor) || 0;
        const rate = block.tipo === "CREDITO" ? getInstallmentRate(block.parcelas) : 1;
        const totalBloco = Math.round(valor * rate);
        const valorParcela = block.tipo === "CREDITO" && block.parcelas > 1 ? Math.round(totalBloco / block.parcelas) : totalBloco;
        const taxaPct = block.tipo === "CREDITO" ? calcTaxaPct(block.parcelas) : 0;

        return (
          <div key={block.id} className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: "var(--ti-card-bg, #F9F9FB)", border: "1px solid var(--ti-card-border, #E8E8ED)" }}>
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold tracking-wider uppercase" style={{ color: "var(--ti-muted, #86868B)" }}>
                Pagamento {idx + 1}
              </p>
              {blocks.length > 1 && (
                <button onClick={() => removeBlock(block.id)} className="text-[11px] px-2 py-1 rounded-lg" style={{ color: "#EF4444", backgroundColor: "rgba(239,68,68,0.1)" }}>
                  Remover
                </button>
              )}
            </div>

            {/* Tipo */}
            <div className="flex gap-2">
              {(["PIX", "DEBITO", "CREDITO"] as const).map(tipo => (
                <button key={tipo} onClick={() => updateBlock(block.id, "tipo", tipo)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all"
                  style={block.tipo === tipo
                    ? { backgroundColor: tipo === "PIX" ? "#22c55e" : tipo === "DEBITO" ? "#3b82f6" : "var(--ti-accent, #E8740E)", color: "#fff" }
                    : { backgroundColor: "var(--ti-input-bg, #F0F0F5)", color: "var(--ti-text, #1D1D1F)", border: "1px solid var(--ti-card-border, #E8E8ED)" }
                  }>
                  {tipo === "PIX" ? "PIX" : tipo === "DEBITO" ? "Debito" : "Credito"}
                </button>
              ))}
            </div>

            {/* Valor */}
            <div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-medium" style={{ color: "var(--ti-muted, #86868B)" }}>R$</span>
                  <input
                    type="number" inputMode="numeric" min={0} placeholder="0"
                    value={block.valor}
                    onChange={(e) => updateBlock(block.id, "valor", e.target.value)}
                    className="w-full pl-9 pr-3 py-3 rounded-xl text-[15px] transition-colors"
                    style={{ backgroundColor: "var(--ti-input-bg, #F0F0F5)", color: "var(--ti-text, #1D1D1F)", border: "1px solid var(--ti-card-border, #E8E8ED)" }}
                  />
                </div>
                <button onClick={() => autoFillRemaining(block.id)}
                  className="px-3 py-3 rounded-xl text-[11px] font-semibold whitespace-nowrap"
                  style={{ backgroundColor: "var(--ti-accent-light, #FFF3E8)", color: "var(--ti-accent, #E8740E)", border: "1px solid var(--ti-accent, #E8740E)" }}>
                  Restante
                </button>
              </div>
            </div>

            {/* Parcelas (so credito) */}
            {block.tipo === "CREDITO" && (
              <div>
                <p className="text-[11px] font-medium mb-2" style={{ color: "var(--ti-muted, #86868B)" }}>Parcelas</p>
                <div className="grid grid-cols-7 gap-1.5">
                  {PARCELAS_OPCOES.map(n => (
                    <button key={n} onClick={() => updateBlock(block.id, "parcelas", n)}
                      className="py-2 rounded-lg text-[12px] font-semibold transition-all"
                      style={block.parcelas === n
                        ? { backgroundColor: "var(--ti-accent, #E8740E)", color: "#fff" }
                        : { backgroundColor: "var(--ti-input-bg, #F0F0F5)", color: "var(--ti-text, #1D1D1F)" }
                      }>
                      {n}x
                    </button>
                  ))}
                </div>
                {valor > 0 && block.parcelas > 0 && (
                  <div className="mt-2 px-3 py-2 rounded-lg text-[12px]" style={{ backgroundColor: "var(--ti-accent-light, #FFF3E8)" }}>
                    <div className="flex justify-between">
                      <span style={{ color: "var(--ti-muted, #86868B)" }}>{block.parcelas}x de</span>
                      <span className="font-bold" style={{ color: "var(--ti-accent, #E8740E)" }}>{formatBRL(valorParcela)}</span>
                    </div>
                    {taxaPct > 0 && (
                      <div className="flex justify-between mt-0.5">
                        <span style={{ color: "var(--ti-muted, #86868B)" }}>Juros ({taxaPct}%)</span>
                        <span style={{ color: "var(--ti-muted, #86868B)" }}>+ {formatBRL(totalBloco - valor)}</span>
                      </div>
                    )}
                    <div className="flex justify-between mt-0.5">
                      <span style={{ color: "var(--ti-muted, #86868B)" }}>Total cartao</span>
                      <span className="font-semibold" style={{ color: "var(--ti-text, #1D1D1F)" }}>{formatBRL(totalBloco)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Botao adicionar */}
      <button onClick={addBlock}
        className="w-full py-3 rounded-2xl text-[14px] font-medium transition-all flex items-center justify-center gap-2"
        style={{ color: "var(--ti-accent, #E8740E)", backgroundColor: "var(--ti-accent-light, #FFF3E8)", border: "1px dashed var(--ti-accent, #E8740E)" }}>
        <span className="text-[18px]">+</span> Adicionar forma de pagamento
      </button>

      {/* Resumo */}
      <div className="rounded-2xl p-4 space-y-2" style={{ backgroundColor: "var(--ti-card-bg, #F9F9FB)", border: "1px solid var(--ti-card-border, #E8E8ED)" }}>
        <p className="text-[12px] font-semibold tracking-wider uppercase" style={{ color: "var(--ti-muted, #86868B)" }}>Resumo</p>

        <div className="flex justify-between text-[13px]">
          <span style={{ color: "var(--ti-muted, #86868B)" }}>Valor do produto</span>
          <span className="font-semibold" style={{ color: "var(--ti-text, #1D1D1F)" }}>{formatBRL(totalAPagar)}</span>
        </div>

        {summary.blocks.map((sb, i) => (
          <div key={i} className="flex justify-between text-[13px]">
            <span style={{ color: "var(--ti-muted, #86868B)" }}>
              {sb.tipo === "PIX" ? "PIX" : sb.tipo === "DEBITO" ? "Debito" : `Credito ${sb.parcelas}x`}
            </span>
            <span style={{ color: "var(--ti-text, #1D1D1F)" }}>
              {formatBRL(sb.valor)}
              {sb.juros > 0 && <span style={{ color: "var(--ti-muted, #86868B)" }}> (+{formatBRL(sb.juros)} juros)</span>}
            </span>
          </div>
        ))}

        <div className="pt-2 mt-2" style={{ borderTop: "1px solid var(--ti-card-border, #E8E8ED)" }}>
          {summary.faltaPagar > 0 && (
            <div className="flex justify-between text-[13px] mb-1">
              <span className="font-semibold" style={{ color: "#EF4444" }}>Falta pagar</span>
              <span className="font-bold" style={{ color: "#EF4444" }}>{formatBRL(summary.faltaPagar)}</span>
            </div>
          )}
          {excedeu && (
            <div className="flex justify-between text-[13px] mb-1">
              <span className="font-semibold" style={{ color: "#EF4444" }}>Excedeu o valor!</span>
              <span className="font-bold" style={{ color: "#EF4444" }}>+{formatBRL(summary.totalPago - totalAPagar)}</span>
            </div>
          )}
          <div className="flex justify-between text-[13px]">
            <span style={{ color: "var(--ti-muted, #86868B)" }}>Total pago (cliente)</span>
            <span className="font-bold" style={{ color: "var(--ti-text, #1D1D1F)" }}>{formatBRL(summary.totalComJuros)}</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span style={{ color: "var(--ti-muted, #86868B)" }}>Valor liquido (loja recebe)</span>
            <span className="font-bold" style={{ color: "var(--ti-success, #22c55e)" }}>{formatBRL(summary.valorLiquido)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
