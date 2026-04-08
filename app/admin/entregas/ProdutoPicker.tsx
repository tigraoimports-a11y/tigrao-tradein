"use client";
import React, { useMemo } from "react";

export interface EstoquePickerItem {
  id: string;
  produto: string;
  categoria: string;
  tipo: string;
  qnt: number;
  custo_unitario: number;
  cor: string | null;
  fornecedor: string | null;
  status: string;
  serial_no: string | null;
  imei: string | null;
}

interface Props {
  titulo: string;
  categorias: [string, string][];
  estoque: EstoquePickerItem[];
  catSel: string;
  setCatSel: (v: string) => void;
  modeloSel: string;
  setModeloSel: (modelo: string, preco: number) => void;
  corSel: string;
  setCorSel: (cor: string) => void;
  lookupPrecoVenda: (modelStr: string) => number;
  inputCls: string;
  labelCls: string;
}

/**
 * Componente compartilhado para seleção de produto pelo catálogo do estoque.
 * Fluxo: Categoria → Modelo (agrupado sem cor/origem) → Cor (das unidades disponíveis).
 * Usado no form de Nova Entrega para produto 1 e produto 2.
 */
export default function ProdutoPicker({
  categorias,
  estoque,
  catSel,
  setCatSel,
  modeloSel,
  setModeloSel,
  corSel,
  setCorSel,
  lookupPrecoVenda,
  inputCls,
  labelCls,
}: Props) {
  // Remove variações de origem e cor do nome do modelo
  const stripDetails = (nome: string) => nome
    .replace(/\s+(VC|LL|J|BE|BR|HN|IN|ZA|BZ|ZD|ZP|CH|AA|E|LZ|QL|N)\s*(\([^)]*\))?/gi, "")
    .replace(/[-–]?\s*(IP\s+)?-?\s*(CHIP\s+)?(F[ÍI]SICO\s*\+?\s*)?E-?SIM/gi, "")
    .replace(/-\s*E-?SIM/gi, "")
    .replace(/\s+(PRETO|BRANCO|PRATA|DOURADO|AZUL|VERDE|ROSA|ROXO|VERMELHO|AMARELO|ESTELAR|MEIA-NOITE|TEAL|ULTRAMARINO|LAVANDA|SAGE|MIDNIGHT|TITANIO\s*\w*|LARANJA\s*\w*|AZUL\s*\w*|PRETO\s*\w*|CINZA\s*\w*|DOURADO\s*\w*|BRANCO\s*\w*)\s*$/gi, "")
    .replace(/\s*-\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Produtos filtrados pela categoria selecionada (ignora seminovo por padrão)
  const produtosFiltrados = useMemo(() => {
    if (!catSel) return [];
    const isSemi = catSel.endsWith("_SEMI");
    const baseCat = isSemi ? catSel.replace("_SEMI", "") : catSel;
    return estoque.filter(
      (p) => p.categoria === baseCat && (isSemi ? p.tipo === "SEMINOVO" : p.tipo !== "SEMINOVO")
    );
  }, [estoque, catSel]);

  // Agrupa por modelo
  const byModel = useMemo(() => {
    const map: Record<
      string,
      { totalQnt: number; avgCost: number; precoVenda: number; items: EstoquePickerItem[] }
    > = {};
    produtosFiltrados.forEach((p) => {
      const model = stripDetails(p.produto);
      if (!map[model]) map[model] = { totalQnt: 0, avgCost: 0, precoVenda: 0, items: [] };
      map[model].totalQnt += p.qnt;
      map[model].items.push(p);
    });
    Object.entries(map).forEach(([model, g]) => {
      const totalVal = g.items.reduce((s, p) => s + p.qnt * (p.custo_unitario || 0), 0);
      g.avgCost = g.totalQnt > 0 ? Math.round(totalVal / g.totalQnt) : 0;
      g.precoVenda = lookupPrecoVenda(model);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtosFiltrados]);

  const modelEntries = Object.entries(byModel).sort(([a], [b]) => a.localeCompare(b));

  // Cores disponíveis para o modelo selecionado (únicas, não vazias)
  const coresDoModelo = useMemo(() => {
    if (!modeloSel || !byModel[modeloSel]) return [];
    const cores = new Set<string>();
    byModel[modeloSel].items.forEach((p) => {
      const c = (p.cor || "").trim();
      if (c) cores.add(c);
    });
    return Array.from(cores).sort();
  }, [modeloSel, byModel]);

  return (
    <div className="space-y-3">
      <div>
        <p className={labelCls}>Categoria</p>
        <select
          value={catSel}
          onChange={(e) => setCatSel(e.target.value)}
          className={inputCls}
        >
          <option value="">-- Selecionar --</option>
          {categorias
            .filter(([k]) => !k.endsWith("_SEMI"))
            .map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
        </select>
      </div>

      {catSel && (
        <div className="max-h-[280px] overflow-y-auto rounded-xl border border-[#D2D2D7] divide-y divide-[#E5E5EA]">
          {modelEntries.length === 0 && (
            <p className="text-xs text-center text-[#86868B] py-4">Nenhum produto disponível</p>
          )}
          {modelEntries.map(([model, { totalQnt, avgCost, precoVenda }]) => {
            const sel = modeloSel === model;
            const precoBase = precoVenda > 0 ? precoVenda : avgCost;
            return (
              <button
                key={model}
                type="button"
                onClick={() => {
                  if (sel) {
                    setModeloSel("", 0);
                    return;
                  }
                  setModeloSel(model, precoBase);
                }}
                className={`w-full px-4 py-3 flex items-center justify-between text-left transition-all ${
                  sel ? "bg-[#FFF5EB] border-l-4 border-[#E8740E]" : "hover:bg-[#F9F9FB]"
                }`}
              >
                <div>
                  <p className={`text-sm font-semibold ${sel ? "text-[#E8740E]" : "text-[#1D1D1F]"}`}>
                    {model}
                  </p>
                  <p className="text-[10px] text-[#86868B]">
                    {totalQnt} un. disponíveis · custo R$ {avgCost.toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${sel ? "text-[#E8740E]" : "text-[#1D1D1F]"}`}>
                    R$ {precoBase.toLocaleString("pt-BR")}
                  </p>
                  <p className="text-[9px] text-[#86868B]">
                    {precoVenda > 0 ? "tabela de venda" : "preço custo"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {modeloSel && coresDoModelo.length > 0 && (
        <div>
          <p className={labelCls}>Cor</p>
          <select value={corSel} onChange={(e) => setCorSel(e.target.value)} className={inputCls}>
            <option value="">-- Selecionar cor --</option>
            {coresDoModelo.map((cor) => {
              // Conta quantas unidades dessa cor existem no modelo
              const qnt = byModel[modeloSel].items
                .filter((p) => (p.cor || "").trim() === cor)
                .reduce((s, p) => s + p.qnt, 0);
              return (
                <option key={cor} value={cor}>
                  {cor} ({qnt} un.)
                </option>
              );
            })}
          </select>
        </div>
      )}

      {modeloSel && coresDoModelo.length === 0 && (
        <p className="text-[10px] text-[#86868B] italic">Esse modelo não tem cor específica no estoque.</p>
      )}
    </div>
  );
}
