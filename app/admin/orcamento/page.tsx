"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { corParaPT } from "@/lib/cor-pt";
import { getModeloBase } from "@/lib/produto-display";

// Mapeia a categoria da tabela `precos` (IPHONE, IPAD, ...) para a
// categoria do estoque (IPHONES, IPADS, ...) — `getModeloBase` usa a
// variante do estoque.
const PRECOS_CAT_TO_ESTOQUE_CAT: Record<string, string> = {
  IPHONE: "IPHONES",
  IPAD: "IPADS",
  MACBOOK: "MACBOOK",
  MAC_MINI: "MAC_MINI",
  APPLE_WATCH: "APPLE_WATCH",
  AIRPODS: "AIRPODS",
  ACESSORIOS: "ACESSORIOS",
};

function normKey(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Taxas para orçamento cliente (embutir no preço parcelado)
const TAXAS_PARCELA: Record<number, number> = {
  1: 4, 2: 5, 3: 5.5, 4: 6, 5: 7, 6: 7.5,
  7: 8, 8: 9.1, 9: 10, 10: 11, 11: 12, 12: 13,
  13: 14, 14: 15, 15: 16, 16: 17, 17: 18, 18: 19,
  19: 20, 20: 21, 21: 22,
};

function getTaxaOrcamento(parcelas: number): number {
  if (TAXAS_PARCELA[parcelas] !== undefined) return TAXAS_PARCELA[parcelas];
  // Interpolar
  const keys = Object.keys(TAXAS_PARCELA).map(Number).sort((a, b) => a - b);
  let lo = keys[0], hi = keys[keys.length - 1];
  for (const k of keys) { if (k <= parcelas) lo = k; if (k >= parcelas) { hi = k; break; } }
  if (lo === hi) return TAXAS_PARCELA[lo];
  const ratio = (parcelas - lo) / (hi - lo);
  return TAXAS_PARCELA[lo] + (TAXAS_PARCELA[hi] - TAXAS_PARCELA[lo]) * ratio;
}

interface Produto {
  id: string;
  modelo: string;
  armazenamento: string;
  categoria: string;
  preco_pix: number;
  status: string;
  nome: string; // computed: modelo + armazenamento
}

const CATEGORIAS_LABEL: Record<string, string> = {
  IPHONE: "📱 iPhones",
  IPAD: "📱 iPads",
  MACBOOK: "💻 MacBooks",
  MAC_MINI: "🖥️ Mac Mini",
  APPLE_WATCH: "⌚ Apple Watch",
  AIRPODS: "🎧 AirPods",
  ACESSORIOS: "🔌 Acessórios",
};

export default function OrcamentoPage() {
  const { password, user, darkMode: dm } = useAdmin();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);

  // Seminovos do estoque
  interface SeminovoEstoque {
    id: string;
    produto: string;
    cor: string | null;
    bateria: number | null;
    observacao: string | null;
    custo_unitario: number;
    qnt: number;
    preco_sugerido: number | null;
  }
  const [seminovosEstoque, setSeminovosEstoque] = useState<SeminovoEstoque[]>([]);
  const [semiSel, setSemiSel] = useState<SeminovoEstoque | null>(null);

  // Form
  const [tipoOrc, setTipoOrc] = useState<"lacrado" | "seminovo">("lacrado");
  const [catSel, setCatSel] = useState("");
  const [prodSel, setProdSel] = useState("");
  const [semiPreco, setSemiPreco] = useState("");
  const [semiObs, setSemiObs] = useState("");
  const [entrada, setEntrada] = useState("");
  const [parcelasSel, setParcelasSel] = useState<number[]>([12]);
  const [textoGerado, setTextoGerado] = useState("");
  const [copiado, setCopiado] = useState(false);
  // Cliente — opcionais, usados pra (a) botao "Enviar WhatsApp" direto pro
  // numero do cliente e (b) salvar no historico de orcamentos
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  // Aba do orcamento (Novo vs Historico)
  const [aba, setAba] = useState<"novo" | "historico">("novo");
  // Historico carregado do backend
  interface OrcamentoHistorico {
    id: string;
    created_at: string;
    vendedor: string | null;
    tipo: "lacrado" | "seminovo";
    cliente_nome: string | null;
    cliente_telefone: string | null;
    itens: Array<{ nome: string; preco: number; qnt?: number; categoria?: string }>;
    trocas: Array<{ produto: string; valor: string }>;
    valor_total: number;
    desconto: number;
    entrada: number;
    parcelas_selecionadas: number[];
    texto_gerado: string;
    status: "ATIVO" | "VIROU_VENDA" | "PERDIDO" | "ARQUIVADO";
    venda_id: string | null;
    marcado_em: string | null;
    observacao: string | null;
  }
  const [historico, setHistorico] = useState<OrcamentoHistorico[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histFiltroStatus, setHistFiltroStatus] = useState<"ATIVO" | "VIROU_VENDA" | "PERDIDO" | "ARQUIVADO" | "">("");
  const [histFiltroVendedor, setHistFiltroVendedor] = useState("");
  const [histBusca, setHistBusca] = useState("");
  const [carrinho, setCarrinho] = useState<{ key: string; id: string; nome: string; preco: number; categoria: string; qnt: number }[]>([]);
  // Array dinamico de produtos na troca — sem limite de quantidade.
  // Primeiro item sempre visivel (vazio se nao preenchido). Novos itens
  // adicionados via botao "+ Adicionar outro produto usado na troca".
  const [trocas, setTrocas] = useState<{ produto: string; valor: string }[]>([{ produto: "", valor: "" }]);
  const [desconto, setDesconto] = useState("");

  useEffect(() => {
    if (!password) return;
    (async () => {
      setLoading(true);
      try {
        const [resPrecos, resEstoque] = await Promise.all([
          fetch("/api/admin/precos", { headers: { "x-admin-password": password } }),
          fetch("/api/estoque", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "admin") } }),
        ]);
        if (resPrecos.ok) {
          const json = await resPrecos.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setProdutos((json.data ?? []).filter((p: any) => p.status === "ativo" && p.preco_pix > 0).map((p: any) => ({
            ...p,
            nome: `${p.modelo}${p.armazenamento ? " " + p.armazenamento : ""}`,
          })));
        }
        if (resEstoque.ok) {
          const json = await resEstoque.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setSeminovosEstoque((json.data ?? []).filter((p: any) => p.tipo === "SEMINOVO" && p.status === "EM ESTOQUE" && p.qnt > 0));
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [password, user]);

  // Acessorios do estoque (nao estao na tabela de precos) + custoMap (pra margem)
  // + stockMap (pra validar disponibilidade em tempo real)
  const [acessoriosEstoque, setAcessoriosEstoque] = useState<Produto[]>([]);
  const [custoMap, setCustoMap] = useState<Map<string, number>>(new Map());
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!password) return;
    fetch("/api/estoque", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "admin") } })
      .then(r => r.json())
      .then(j => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const all = (j.data ?? []) as any[];

        // Acessórios — lista pra cadastro no carrinho
        const acess = all.filter(p => p.categoria === "ACESSORIOS" && p.tipo === "NOVO" && p.status === "EM ESTOQUE" && p.qnt > 0);
        const seen = new Set<string>();
        const mapped: Produto[] = [];
        for (const p of acess) {
          if (!seen.has(p.produto)) {
            seen.add(p.produto);
            mapped.push({ id: p.id, modelo: p.produto, armazenamento: "", categoria: "ACESSORIOS", preco_pix: p.custo_unitario || 0, status: "ativo", nome: p.produto });
          }
        }
        setAcessoriosEstoque(mapped);

        // custoMap — média do custo_unitario por (modeloBase normalizado)
        // stockMap — soma de qnt EM ESTOQUE por (modeloBase normalizado)
        // Considera tipo=NOVO (lacrados). Status A CAMINHO/PENDENTE/ESGOTADO
        // não contam como disponível agora, mas custos podem entrar.
        const custoBuckets = new Map<string, number[]>();
        const stock = new Map<string, number>();
        for (const p of all) {
          if (p.tipo !== "NOVO") continue;
          const modeloBase = getModeloBase(p.produto || "", p.categoria || "", p.observacao);
          const key = normKey(modeloBase);

          const custo = Number(p.custo_unitario || 0);
          if (custo > 0) {
            const list = custoBuckets.get(key) || [];
            list.push(custo);
            custoBuckets.set(key, list);
          }

          const qnt = Number(p.qnt || 0);
          if (qnt > 0 && (p.status || "").toUpperCase() === "EM ESTOQUE") {
            stock.set(key, (stock.get(key) || 0) + qnt);
          } else if (!stock.has(key)) {
            // Marca chave como conhecida (mesmo zerada), pra distinguir de
            // "não cadastrado" (que deixamos sem entrada no map).
            stock.set(key, 0);
          }
        }
        const custos = new Map<string, number>();
        for (const [k, vals] of custoBuckets) {
          custos.set(k, vals.reduce((a, b) => a + b, 0) / vals.length);
        }
        setCustoMap(custos);
        setStockMap(stock);
      }).catch(() => {});
  }, [password, user]);

  // Dado um produto do carrinho, estima o custo unitario via custoMap
  const getCustoUnitario = (item: { categoria: string; nome: string }): number => {
    if (item.categoria === "ACESSORIOS") {
      // Pra acessórios, preço = custo na base atual (já é cadastrado pelo custo).
      // Retorna o próprio preço pra margem sair zero — não temos markup separado.
      return 0;
    }
    const baseCat = PRECOS_CAT_TO_ESTOQUE_CAT[item.categoria] || item.categoria;
    const modeloBase = getModeloBase(item.nome, baseCat);
    return custoMap.get(normKey(modeloBase)) || 0;
  };

  // Estoque disponivel pro SKU. Retorna:
  //   - undefined → SKU nao cadastrado no estoque (nao validar)
  //   - 0 → confirmado esgotado
  //   - n>0 → n unidades EM ESTOQUE
  // Acessorios sao filtrados upstream (so entram com qnt>0), entao retorna
  // sempre undefined pra eles — nao precisa avisar.
  const getStockDisponivel = (item: { categoria: string; nome: string }): number | undefined => {
    if (item.categoria === "ACESSORIOS") return undefined;
    const baseCat = PRECOS_CAT_TO_ESTOQUE_CAT[item.categoria] || item.categoria;
    const modeloBase = getModeloBase(item.nome, baseCat);
    return stockMap.get(normKey(modeloBase));
  };

  // Combinar produtos da tabela preços + acessórios do estoque
  const todosProdutos = useMemo(() => [...produtos, ...acessoriosEstoque], [produtos, acessoriosEstoque]);

  const categorias = useMemo(() => {
    const cats = [...new Set(todosProdutos.map(p => p.categoria))].sort();
    return cats;
  }, [todosProdutos]);

  const produtosFiltrados = useMemo(() => {
    if (!catSel) return todosProdutos;
    return todosProdutos.filter(p => p.categoria === catSel);
  }, [todosProdutos, catSel]);

  const produtoSelecionado = useMemo(() => {
    return todosProdutos.find(p => p.id === prodSel);
  }, [todosProdutos, prodSel]);

  // Categorias de seminovos (derivar do nome do produto)
  const getSemiCategoria = (produto: string): string => {
    const p = produto.toUpperCase();
    if (p.includes("IPHONE")) return "IPHONE";
    if (p.includes("IPAD")) return "IPAD";
    if (p.includes("MACBOOK") || p.includes("MAC MINI") || p.includes("IMAC")) return "MACBOOK";
    if (p.includes("WATCH")) return "APPLE_WATCH";
    if (p.includes("AIRPODS")) return "AIRPODS";
    return "OUTROS";
  };

  const [semiCat, setSemiCat] = useState("");
  const semiCategorias = useMemo(() => {
    const cats = [...new Set(seminovosEstoque.map(s => getSemiCategoria(s.produto)))].sort();
    return cats;
  }, [seminovosEstoque]);

  const seminovosFiltrados = useMemo(() => {
    if (!semiCat) return [];
    return seminovosEstoque.filter(s => getSemiCategoria(s.produto) === semiCat);
  }, [seminovosEstoque, semiCat]);

  // Limpar nome do seminovo: remover origem (LL, BE, BR), chip info (E-SIM, Chip Físico)
  const cleanSemiNome = (nome: string): string => {
    return nome
      .replace(/\s*(LL|BE|BR)\s*\([^)]*\)/gi, "")       // LL (EUA), BE (BR), BR (BR)
      .replace(/[-–]\s*E-?SIM/gi, "")                     // - E-SIM, -E-SIM
      .replace(/[-–]\s*CHIP\s+F[ÍI]SICO\s*\+?\s*E-?SIM/gi, "") // - CHIP FÍSICO + E-SIM
      .replace(/[-–]\s*CHIP\s+F[ÍI]SICO/gi, "")          // - CHIP FÍSICO
      .replace(/\s{2,}/g, " ")                             // double spaces
      .trim();
  };

  // Extrair info relevante do obs: garantia apple
  const cleanSemiDetails = (item: SeminovoEstoque): string => {
    const parts: string[] = [];
    if (item.cor) parts.push(corParaPT(item.cor));
    if (item.bateria) parts.push(`🔋${item.bateria}%`);
    // Extrair garantia do obs
    if (item.observacao) {
      const obsUp = item.observacao.toUpperCase();
      if (obsUp.includes("GARANTIA APPLE") || obsUp.includes("GARANTIA AGOSTO")) {
        const match = item.observacao.match(/GARANTIA\s+(?:APPLE\s+)?(\w+)/i);
        if (match) parts.push(`Garantia ${match[1]}`);
      }
      // Condição do aparelho
      if (obsUp.includes("MARCAS")) parts.push("Marcas de uso");
      if (obsUp.includes("ARRANHA")) parts.push("Arranhões");
      if (obsUp.includes("PERFEITO") || obsUp.includes("EXCELENTE")) parts.push("Excelente estado");
    }
    return parts.join(" · ");
  };

  // Produto virtual para seminovo (usado no mesmo fluxo)
  const semiNome = semiSel ? semiSel.produto : "";
  const semiProduto = tipoOrc === "seminovo" && semiSel && parseFloat(semiPreco) > 0
    ? { id: semiSel.id, nome: semiSel.produto.toUpperCase(), preco: parseFloat(semiPreco), categoria: "IPHONE" }
    : null;

  const gerarOrcamento = () => {
    if (tipoOrc === "seminovo") {
      if (!semiProduto && carrinho.length === 0) return;
    } else {
      if (carrinho.length === 0) return;
    }

    // Itens do orçamento: sempre usa o carrinho (produtos são adicionados automaticamente)
    const itensOrcamento = carrinho.length > 0 ? carrinho
      : tipoOrc === "seminovo" && semiProduto ? [{ ...semiProduto, qnt: 1 }]
      : [];
    const totalBruto = itensOrcamento.reduce((s, p) => s + p.preco * (p.qnt || 1), 0);
    const trocasValidas = trocas.filter(t => t.produto.trim() && (parseFloat(t.valor) || 0) > 0);
    const trocaTotal = trocasValidas.reduce((s, t) => s + (parseFloat(t.valor) || 0), 0);
    const descontoVal = parseFloat(desconto) || 0;
    const precoPix = totalBruto - trocaTotal - descontoVal;
    const entradaVal = parseFloat(entrada) || 0;
    const restante = precoPix - entradaVal;

    const catEmojis: Record<string, string> = { IPHONE: "📱", IPAD: "📱", MACBOOK: "💻", MAC_MINI: "🖥️", APPLE_WATCH: "⌚", AIRPODS: "🎧", ACESSORIOS: "🔌" };

    if (restante <= 0) {
      const linhasSimples = itensOrcamento.map(p => `${catEmojis[p.categoria] || "📦"} *${p.nome}*${(p.qnt || 1) > 1 ? ` (x${p.qnt})` : ""}`);
      const isSemi = tipoOrc === "seminovo";
      const texto = [
        ...linhasSimples,
        ``,
        isSemi ? `📱 Seminovo — Revisado` : `📦 Novo / Lacrado`,
        isSemi ? `✅ 3 meses de garantia` : `✅ 1 ano de garantia`,
        ...(isSemi && semiObs ? [`ℹ️ ${semiObs}`] : []),
        `📄 Nota fiscal em seu nome`,
        ``,
        `💰 *R$ ${precoPix.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}* à vista no PIX`,
        ``,
        `⏰ Orçamento válido por 24 horas. Após esse período refaça o orçamento.`,
      ].join("\n");
      setTextoGerado(texto);
      return;
    }

    const sorted = [...parcelasSel].sort((a, b) => a - b);

    const linhas: string[] = [];
    if (itensOrcamento.length > 1) {
      linhas.push(`*ORÇAMENTO -- TigraoImports*`, ``);
      for (const p of itensOrcamento) {
        linhas.push(`${catEmojis[p.categoria] || "📦"} *${p.nome}*${(p.qnt || 1) > 1 ? ` (x${p.qnt})` : ""} — R$ ${(p.preco * (p.qnt || 1)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
      }
      linhas.push(``, `💰 *Total: R$ ${precoPix.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}*`, ``);
    } else {
      const emoji = catEmojis[itensOrcamento[0]?.categoria] || "📦";
      linhas.push(`${emoji} *${itensOrcamento[0]?.nome}*`, ``);
    }
    const isSemi = tipoOrc === "seminovo";
    linhas.push(
      isSemi ? `📱 Seminovo — Revisado` : `📦 Novo / Lacrado`,
      isSemi ? `✅ 3 meses de garantia` : `✅ 1 ano de garantia`,
      ...(isSemi && semiObs ? [`ℹ️ ${semiObs}`] : []),
      `📄 Nota fiscal em seu nome`,
      ``,
    );

    if (trocasValidas.length > 0) {
      const temVarios = trocasValidas.length > 1;
      linhas.push(
        temVarios ? `🔄 *Seus aparelhos na troca:*` : `🔄 *Seu aparelho na troca:*`,
        ``,
      );
      trocasValidas.forEach((t, idx) => {
        const val = parseFloat(t.valor) || 0;
        if (temVarios) linhas.push(`*PRODUTO USADO ${idx + 1}*`);
        linhas.push(
          `${t.produto}`,
          `Avaliação: R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        );
        if (temVarios && idx < trocasValidas.length - 1) linhas.push(``);
      });
      linhas.push(
        ``,
        temVarios
          ? `*Com a troca dos seus produtos você pagará a diferença de:*`
          : `*Com a troca do seu produto você pagará a diferença de:*`,
        ``,
      );
    }

    if (descontoVal > 0) {
      linhas.push(`🏷️ *Desconto especial:* - R$ ${descontoVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, ``);
    }

    if (entradaVal > 0) {
      linhas.push(`💰 R$ ${entradaVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} à vista no PIX de entrada`);
      if (sorted.length === 1) {
        const taxa = getTaxaOrcamento(sorted[0]);
        const vp = restante * (1 + taxa / 100) / sorted[0];
        linhas.push(`💳 O restante parcelado ficaria ${sorted[0]}x R$ ${vp.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} no cartão`);
      } else {
        linhas.push(`💳 O restante parcelado ficaria:`);
        for (const n of sorted) {
          const taxa = getTaxaOrcamento(n);
          const vp = restante * (1 + taxa / 100) / n;
          linhas.push(`     • ${n}x de R$ ${vp.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        }
      }
    } else {
      if (sorted.length === 1) {
        const taxa = getTaxaOrcamento(sorted[0]);
        const vp = precoPix * (1 + taxa / 100) / sorted[0];
        linhas.push(`💳 ${sorted[0]}x R$ ${vp.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} no cartão`);
      } else {
        linhas.push(`💳 Parcelado no cartão:`);
        for (const n of sorted) {
          const taxa = getTaxaOrcamento(n);
          const vp = precoPix * (1 + taxa / 100) / n;
          linhas.push(`     • ${n}x de R$ ${vp.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        }
      }
      linhas.push(`💰 Ou R$ ${precoPix.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} à vista no PIX`);
    }

    linhas.push(``);
    linhas.push(`⏰ Orçamento válido por 24 horas. Após esse período refaça o orçamento.`);

    setTextoGerado(linhas.join("\n"));
    setCopiado(false);
  };

  // Helper: persiste o orcamento atual no historico (usado em copiar/enviar)
  const salvarNoHistorico = async () => {
    if (!password || !textoGerado) return;
    try {
      const totalVenda = carrinho.reduce((s, c) => s + c.preco * c.qnt, 0);
      const semiPrecoNum = parseFloat(semiPreco) || 0;
      const valorBase = carrinho.length > 0 ? totalVenda : semiPrecoNum;
      const trocaTotal = trocas.reduce((s, t) => s + (parseFloat(t.valor) || 0), 0);
      const descontoVal = parseFloat(desconto) || 0;
      const valorTotal = Math.max(valorBase - trocaTotal - descontoVal, 0);

      await fetch("/api/admin/orcamentos", {
        method: "POST",
        headers: {
          "x-admin-password": password,
          "x-admin-user": encodeURIComponent(user?.nome || "admin"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tipo: tipoOrc,
          cliente_nome: clienteNome.trim() || null,
          cliente_telefone: clienteTelefone.replace(/\D/g, "") || null,
          itens: carrinho.length > 0
            ? carrinho.map(c => ({ nome: c.nome, preco: c.preco, qnt: c.qnt, categoria: c.categoria }))
            : (semiSel ? [{ nome: semiSel.produto, preco: semiPrecoNum, qnt: 1, categoria: "SEMINOVO" }] : []),
          trocas: trocas.filter(t => t.produto.trim() && parseFloat(t.valor) > 0),
          desconto: descontoVal,
          entrada: parseFloat(entrada) || 0,
          parcelas_selecionadas: parcelasSel,
          valor_total: valorTotal,
          texto_gerado: textoGerado,
        }),
      });
    } catch { /* nao bloqueia o copiar/enviar */ }
  };

  const copiar = async () => {
    navigator.clipboard.writeText(textoGerado);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 3000);
    await salvarNoHistorico();
  };

  // #14 — Envia direto pelo WhatsApp do cliente (se telefone preenchido)
  // ou abre wa.me sem destinatario pra escolher contato
  const enviarWhatsApp = async () => {
    if (!textoGerado) return;
    const telDigits = clienteTelefone.replace(/\D/g, "");
    const target = telDigits.length >= 10
      ? (telDigits.startsWith("55") ? telDigits : `55${telDigits}`)
      : "";
    const url = `https://wa.me/${target}?text=${encodeURIComponent(textoGerado)}`;
    window.open(url, "_blank");
    await salvarNoHistorico();
  };

  // Busca o historico (com filtros)
  const fetchHistorico = useCallback(async () => {
    if (!password) return;
    setHistLoading(true);
    try {
      const params = new URLSearchParams();
      if (histFiltroStatus) params.set("status", histFiltroStatus);
      if (histFiltroVendedor) params.set("vendedor", histFiltroVendedor);
      if (histBusca.trim()) params.set("q", histBusca.trim());
      const res = await fetch(`/api/admin/orcamentos?${params}`, {
        headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "admin") },
      });
      if (res.ok) {
        const j = await res.json();
        setHistorico(j.data || []);
      }
    } catch { /* ignore */ }
    setHistLoading(false);
  }, [password, user, histFiltroStatus, histFiltroVendedor, histBusca]);

  useEffect(() => {
    if (aba === "historico") fetchHistorico();
  }, [aba, fetchHistorico]);

  // Helper pra atualizar status do orcamento (Virou venda / Perdido / Arquivar)
  const updateOrcamentoStatus = async (id: string, status: OrcamentoHistorico["status"]) => {
    if (!password) return;
    await fetch("/api/admin/orcamentos", {
      method: "PATCH",
      headers: {
        "x-admin-password": password,
        "x-admin-user": encodeURIComponent(user?.nome || "admin"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, status }),
    });
    fetchHistorico();
  };

  // Lista unica de vendedores no historico (pro filtro)
  const vendedoresNoHistorico = useMemo(() => {
    const set = new Set<string>();
    historico.forEach(h => { if (h.vendedor) set.add(h.vendedor); });
    return Array.from(set).sort();
  }, [historico]);

  // Auto gerar quando muda qualquer campo — cálculo reativo
  useEffect(() => {
    if (carrinho.length > 0 || semiProduto) gerarOrcamento();
    else setTextoGerado("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrada, parcelasSel, carrinho, trocas, desconto, tipoOrc, semiSel, semiPreco, semiObs]);

  const cardCls = `rounded-2xl border p-5 shadow-sm ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`;
  const inputCls = `w-full px-3 py-2.5 rounded-xl border text-sm ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`;
  const labelCls = `text-xs font-bold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className={`text-xl font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Calculadora de Orçamento</h1>
      <p className={`text-sm ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Gera texto pronto pra enviar pro cliente no WhatsApp</p>

      {/* Abas — Novo orçamento / Histórico */}
      <div className="flex gap-1 border-b border-[#D2D2D7]">
        <button
          onClick={() => setAba("novo")}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${aba === "novo" ? "text-[#E8740E] border-b-2 border-[#E8740E]" : dm ? "text-[#98989D] hover:text-[#F5F5F7]" : "text-[#86868B] hover:text-[#1D1D1F]"}`}
        >
          ➕ Novo orçamento
        </button>
        <button
          onClick={() => setAba("historico")}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${aba === "historico" ? "text-[#E8740E] border-b-2 border-[#E8740E]" : dm ? "text-[#98989D] hover:text-[#F5F5F7]" : "text-[#86868B] hover:text-[#1D1D1F]"}`}
        >
          📚 Histórico
        </button>
      </div>

      {aba === "novo" && (<>
      <div className={cardCls}>
        <div className="space-y-4">
          {/* Tipo: Lacrado / Seminovo */}
          <div>
            <p className={labelCls}>Tipo</p>
            <div className="flex gap-2">
              <button onClick={() => { setTipoOrc("lacrado"); setSemiSel(null); setSemiPreco(""); setSemiObs(""); setTextoGerado(""); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${tipoOrc === "lacrado" ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                📦 Lacrado
              </button>
              <button onClick={() => { setTipoOrc("seminovo"); setProdSel(""); setCatSel(""); setSemiCat(""); setSemiSel(null); setSemiPreco(""); setTextoGerado(""); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${tipoOrc === "seminovo" ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                📱 Seminovo
              </button>
            </div>
          </div>

          {/* ==== LACRADO ==== */}
          {tipoOrc === "lacrado" && (
          <>
          {/* Categoria */}
          <div>
            <p className={labelCls}>Categoria</p>
            <div className="flex flex-wrap gap-2">
              {categorias.map(c => (
                <button key={c} onClick={() => { setCatSel(catSel === c ? "" : c); setProdSel(""); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${catSel === c ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                  {CATEGORIAS_LABEL[c] || c}
                </button>
              ))}
            </div>
          </div>

          {/* Produto — só mostra após selecionar categoria */}
          {catSel && (
            <div>
              <p className={labelCls}>Produto</p>
              {loading ? (
                <p className="text-sm text-[#86868B]">Carregando...</p>
              ) : (
                <select value="" onChange={e => {
                  const p = todosProdutos.find(pr => pr.id === e.target.value);
                  if (p) {
                    setCarrinho(prev => [...prev, { key: crypto.randomUUID(), id: p.id, nome: p.nome, preco: p.preco_pix, categoria: p.categoria, qnt: 1 }]);
                  }
                }} className={inputCls}>
                  <option value="">— Selecionar produto —</option>
                  {produtosFiltrados.map(p => {
                    const stock = getStockDisponivel({ categoria: p.categoria, nome: p.nome });
                    let suffix = "";
                    if (stock === 0) suffix = " — ESGOTADO";
                    else if (stock !== undefined && stock <= 2) suffix = ` — últimas ${stock}`;
                    else if (stock !== undefined) suffix = ` (${stock} em estoque)`;
                    return (
                      <option key={p.id} value={p.id}>{p.nome} — R$ {p.preco_pix.toLocaleString("pt-BR")}{suffix}</option>
                    );
                  })}
                </select>
              )}
            </div>
          )}
          </>
          )}

          {/* ==== SEMINOVO ==== */}
          {tipoOrc === "seminovo" && (
          <div className="space-y-4 animate-fadeIn">
            {seminovosEstoque.length === 0 ? (
              <div className={`rounded-xl p-4 text-center ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                <p className={`text-sm ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Nenhum seminovo em estoque no momento.</p>
              </div>
            ) : (
              <>
              {/* Categoria */}
              <div>
                <p className={labelCls}>Categoria</p>
                <div className="flex flex-wrap gap-2">
                  {semiCategorias.map(c => (
                    <button key={c} onClick={() => { setSemiCat(semiCat === c ? "" : c); setSemiSel(null); setSemiPreco(""); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${semiCat === c ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                      {CATEGORIAS_LABEL[c] || c} ({seminovosEstoque.filter(s => getSemiCategoria(s.produto) === c).length})
                    </button>
                  ))}
                </div>
              </div>

              {/* Produto select */}
              {semiCat && (
              <div>
                <p className={labelCls}>Produto ({seminovosFiltrados.length} disponíveis)</p>
                <select value={semiSel?.id || ""} onChange={e => {
                  const item = seminovosFiltrados.find(s => s.id === e.target.value);
                  setSemiSel(item || null);
                  setSemiPreco(item?.preco_sugerido ? String(item.preco_sugerido) : "");
                  setSemiObs(item?.observacao || "");
                }} className={inputCls}>
                  <option value="">— Selecionar seminovo —</option>
                  {seminovosFiltrados.map(item => {
                    const nome = cleanSemiNome(item.produto).toUpperCase();
                    const details = cleanSemiDetails(item);
                    return (
                      <option key={item.id} value={item.id}>
                        {nome}{details ? ` (${details})` : ""} — Custo R$ {item.custo_unitario?.toLocaleString("pt-BR") || "—"}{item.preco_sugerido ? ` → Sugerido R$ ${item.preco_sugerido.toLocaleString("pt-BR")}` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
              )}

              {/* Detalhes + Preço */}
              {semiSel && (
                <>
                <div className={`px-4 py-3 rounded-xl ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                  <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Selecionado</p>
                  <p className={`text-sm font-bold mt-0.5 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{cleanSemiNome(semiSel.produto)}</p>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs">
                    {semiSel.cor && <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Cor: {corParaPT(semiSel.cor)}</span>}
                    {semiSel.bateria && <span className="text-green-500">🔋 {semiSel.bateria}%</span>}
                    {cleanSemiDetails(semiSel) && <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>{cleanSemiDetails(semiSel)}</span>}
                    <span className="text-[#E8740E] font-semibold">Custo: R$ {semiSel.custo_unitario?.toLocaleString("pt-BR")}</span>
                  </div>
                </div>
                <div>
                  <p className={labelCls}>Preco de venda PIX (R$)</p>
                  <input type="text" inputMode="numeric" placeholder="Ex: 6500" value={semiPreco} onChange={e => setSemiPreco(e.target.value.replace(/\D/g, ""))} className={inputCls} />
                  {semiPreco && semiSel.custo_unitario > 0 && (
                    <p className={`text-xs mt-1 font-semibold ${parseFloat(semiPreco) > semiSel.custo_unitario ? "text-green-500" : "text-red-500"}`}>
                      Lucro: R$ {(parseFloat(semiPreco) - semiSel.custo_unitario).toLocaleString("pt-BR")} ({((parseFloat(semiPreco) - semiSel.custo_unitario) / parseFloat(semiPreco) * 100).toFixed(1)}%)
                    </p>
                  )}
                </div>
                <div>
                  <p className={labelCls}>Observacao no orcamento (opcional)</p>
                  <input type="text" placeholder="Ex: Garantia Apple ate agosto, Grade A" value={semiObs} onChange={e => setSemiObs(e.target.value)} className={inputCls} />
                </div>
                </>
              )}
              </>
            )}
          </div>
          )}

          {(carrinho.length > 0 || semiProduto) && (
            <>

              {/* Carrinho */}
              {carrinho.length > 0 && (() => {
                const totalVenda = carrinho.reduce((s, c) => s + c.preco * c.qnt, 0);
                const totalCusto = carrinho.reduce((s, c) => s + getCustoUnitario({ categoria: c.categoria, nome: c.nome }) * c.qnt, 0);
                const descontoVal = parseFloat(desconto) || 0;
                const lucroEstimado = totalVenda - totalCusto - descontoVal;
                const margemPct = totalVenda > 0 ? (lucroEstimado / totalVenda) * 100 : 0;
                const algumSemCusto = carrinho.some(c => c.categoria !== "ACESSORIOS" && getCustoUnitario({ categoria: c.categoria, nome: c.nome }) === 0);

                return (
                <div className={`rounded-xl p-3 space-y-2 ${dm ? "bg-[#2C2C2E] border border-[#3A3A3C]" : "bg-green-50 border border-green-200"}`}>
                  <p className={`text-xs font-bold uppercase tracking-wider ${dm ? "text-green-400" : "text-green-700"}`}>Produtos no orcamento ({carrinho.reduce((s, c) => s + c.qnt, 0)} itens)</p>
                  {carrinho.map((item, i) => {
                    const custo = getCustoUnitario({ categoria: item.categoria, nome: item.nome });
                    const lucroItem = (item.preco - custo) * item.qnt;
                    const margemItem = item.preco > 0 ? ((item.preco - custo) / item.preco) * 100 : 0;
                    const temCusto = custo > 0 && item.categoria !== "ACESSORIOS";
                    return (
                    <div key={item.key} className="flex flex-col gap-0.5">
                      <div className="flex items-center justify-between text-sm gap-2">
                        <span className={`flex-1 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{i + 1}. {item.nome}</span>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setCarrinho(prev => prev.map(c => c.key === item.key ? { ...c, qnt: Math.max(1, c.qnt - 1) } : c))} className={`w-6 h-6 rounded text-xs font-bold ${dm ? "bg-[#3A3A3C] text-[#98989D]" : "bg-[#E5E5EA] text-[#86868B]"}`}>−</button>
                          <span className={`w-6 text-center text-xs font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{item.qnt}</span>
                          <button onClick={() => setCarrinho(prev => prev.map(c => c.key === item.key ? { ...c, qnt: c.qnt + 1 } : c))} className={`w-6 h-6 rounded text-xs font-bold ${dm ? "bg-[#3A3A3C] text-[#98989D]" : "bg-[#E5E5EA] text-[#86868B]"}`}>+</button>
                          <span className="font-semibold text-green-600 ml-1">R$ {(item.preco * item.qnt).toLocaleString("pt-BR")}</span>
                          <button onClick={() => setCarrinho(prev => prev.filter(c => c.key !== item.key))} className="text-red-400 hover:text-red-600 text-xs font-bold ml-1">✕</button>
                        </div>
                      </div>
                      {temCusto && (
                        <div className={`text-[11px] pl-4 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                          Custo R$ {custo.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                          {" · "}
                          <span className={lucroItem > 0 ? "text-green-600 font-semibold" : "text-red-500 font-semibold"}>
                            Lucro R$ {lucroItem.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ({margemItem.toFixed(1)}%)
                          </span>
                        </div>
                      )}
                      {(() => {
                        const stock = getStockDisponivel({ categoria: item.categoria, nome: item.nome });
                        if (stock === undefined) return null;
                        if (stock === 0) {
                          return (
                            <div className="text-[11px] pl-4 text-red-500 font-semibold">
                              ⚠ Esgotado no estoque
                            </div>
                          );
                        }
                        if (item.qnt > stock) {
                          return (
                            <div className="text-[11px] pl-4 text-amber-600 font-semibold">
                              ⚠ Só {stock} em estoque (cliente quer {item.qnt})
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    );
                  })}
                  <div className={`pt-2 border-t flex justify-between font-bold ${dm ? "border-[#3A3A3C] text-[#F5F5F7]" : "border-green-300 text-[#1D1D1F]"}`}>
                    <span>Total</span>
                    <span className="text-green-600">R$ {totalVenda.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className={`flex items-center justify-between text-xs pt-1 ${dm ? "border-t border-[#3A3A3C]" : "border-t border-green-300"}`}>
                    <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>
                      💼 Lucro estimado{descontoVal > 0 ? " (com desconto)" : ""}
                    </span>
                    <span className={`font-bold ${lucroEstimado > 0 ? "text-green-600" : "text-red-500"}`}>
                      R$ {lucroEstimado.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ({margemPct.toFixed(1)}%)
                    </span>
                  </div>
                  {algumSemCusto && (
                    <p className={`text-[11px] italic ${dm ? "text-[#86868B]" : "text-[#86868B]"}`}>
                      ⚠️ Algum produto sem custo no estoque — margem pode estar subestimada
                    </p>
                  )}
                  {trocas.some(t => t.produto.trim() && parseFloat(t.valor) > 0) && (
                    <p className={`text-[11px] italic ${dm ? "text-[#86868B]" : "text-[#86868B]"}`}>
                      ℹ️ Trocas não entram na margem (viram receita futura ao revender)
                    </p>
                  )}
                </div>
                );
              })()}

              {/* Botões adicionar mais + limpar */}
              <div className="flex gap-2">
                <button onClick={() => { setCatSel(""); }} className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors border-2 border-dashed ${dm ? "border-[#3A3A3C] text-[#98989D] hover:border-[#E8740E] hover:text-[#E8740E]" : "border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E]"}`}>
                  + Outro produto
                </button>
                <button onClick={() => { setCatSel("ACESSORIOS"); }} className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors border-2 border-dashed ${dm ? "border-[#3A3A3C] text-[#98989D] hover:border-[#E8740E] hover:text-[#E8740E]" : "border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E]"}`}>
                  + Acessórios
                </button>
              </div>
              {carrinho.length > 0 && (
                <button onClick={() => {
                  setCarrinho([]);
                  setProdSel(""); setCatSel("");
                  setEntrada(""); setDesconto("");
                  setTrocas([{ produto: "", valor: "" }]);
                  setTextoGerado("");
                  setSemiSel(null); setSemiPreco(""); setSemiObs("");
                }} className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${dm ? "bg-red-900/30 text-red-300 hover:bg-red-900/50" : "bg-red-50 text-red-500 border border-red-200 hover:bg-red-100"}`}>
                  🗑️ Limpar orçamento
                </button>
              )}

              {/* Troca — array dinamico (quantos produtos usados o cliente quiser) */}
              <div className={`rounded-xl p-3 space-y-2 ${dm ? "bg-[#2C2C2E] border border-[#3A3A3C]" : "bg-blue-50 border border-blue-200"}`}>
                <p className={`text-xs font-bold uppercase tracking-wider ${dm ? "text-blue-400" : "text-blue-700"}`}>Produto na troca?</p>
                {trocas.map((t, idx) => {
                  const isFirst = idx === 0;
                  const atualizar = (campo: "produto" | "valor", val: string) => {
                    setTrocas(prev => prev.map((item, i) => i === idx ? { ...item, [campo]: val } : item));
                  };
                  const remover = () => {
                    setTrocas(prev => {
                      if (prev.length === 1) return [{ produto: "", valor: "" }];
                      return prev.filter((_, i) => i !== idx);
                    });
                  };
                  return (
                    <div key={idx} className={isFirst ? "space-y-2" : `mt-2 pt-2 space-y-2 ${dm ? "border-t border-[#3A3A3C]" : "border-t border-blue-200"}`}>
                      {!isFirst && (
                        <div className="flex items-center justify-between">
                          <p className={`text-xs font-bold uppercase tracking-wider ${dm ? "text-blue-400" : "text-blue-700"}`}>Produto usado {idx + 1}</p>
                          <button onClick={remover} className="text-xs text-red-400 hover:text-red-600">Remover</button>
                        </div>
                      )}
                      <input type="text" placeholder={isFirst ? "Ex: iPhone 15 Pro Max 256GB - marcas de uso - bateria 89% - com caixa" : "Ex: iPhone 12 Pro Max 256GB - sem marcas - bateria 89% - sem caixa"} value={t.produto} onChange={e => atualizar("produto", e.target.value)} className={inputCls} />
                      {t.produto && (
                        <div>
                          <p className={labelCls}>Valor da avaliacao (R$)</p>
                          <input type="text" inputMode="decimal" placeholder={isFirst ? "Ex: 3500" : "Ex: 2000"} value={t.valor} onChange={e => atualizar("valor", e.target.value.replace(/\D/g, ""))} className={inputCls} />
                        </div>
                      )}
                    </div>
                  );
                })}
                {trocas[trocas.length - 1]?.produto && (
                  <button onClick={() => setTrocas(prev => [...prev, { produto: "", valor: "" }])} className={`text-xs font-semibold ${dm ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-800"} transition-colors`}>
                    + Adicionar outro produto usado na troca
                  </button>
                )}
              </div>

              {/* Desconto */}
              <div className={`rounded-xl p-3 space-y-2 ${dm ? "bg-[#2C2C2E] border border-[#3A3A3C]" : "bg-purple-50 border border-purple-200"}`}>
                <p className={`text-xs font-bold uppercase tracking-wider ${dm ? "text-purple-400" : "text-purple-700"}`}>Desconto</p>
                <input type="text" inputMode="decimal" placeholder="Ex: 200" value={desconto} onChange={e => setDesconto(e.target.value)} className={inputCls} />
              </div>

              {/* Entrada */}
              <div>
                <p className={labelCls}>Entrada PIX (R$)</p>
                <input type="text" inputMode="decimal" placeholder="0" value={entrada} onChange={e => setEntrada(e.target.value)} className={inputCls} />
              </div>

              {/* Parcelas — multi-select */}
              <div>
                <p className={labelCls}>Parcelas (selecione uma ou mais)</p>
                <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
                  {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21].map(n => {
                    const selected = parcelasSel.includes(n);
                    return (
                      <button key={n} onClick={() => {
                        setParcelasSel(prev => selected ? prev.filter(x => x !== n) : [...prev, n]);
                      }} className={`py-2 rounded-lg text-xs font-bold transition-colors ${selected ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#98989D] hover:bg-[#3A3A3C]" : "bg-[#F5F5F7] text-[#86868B] hover:bg-[#E8E8ED]"}`}>
                        {n}x
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Texto gerado */}
      {textoGerado && (
        <div className={cardCls}>
          <div className="flex items-center justify-between mb-3">
            <p className={`text-sm font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Texto pronto:</p>
          </div>

          {/* Cliente — opcional, usado pra WhatsApp direto + historico */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <input
              type="text"
              value={clienteNome}
              onChange={e => setClienteNome(e.target.value)}
              placeholder="Nome do cliente (opcional)"
              className={inputCls}
            />
            <input
              type="tel"
              value={clienteTelefone}
              onChange={e => setClienteTelefone(e.target.value)}
              placeholder="(21) 99999-9999"
              className={inputCls}
            />
          </div>

          <pre className={`whitespace-pre-wrap text-sm leading-relaxed p-4 rounded-xl ${dm ? "bg-[#2C2C2E] text-[#F5F5F7]" : "bg-[#F5F5F7] text-[#1D1D1F]"}`}>
            {textoGerado}
          </pre>

          {/* Acoes — Copiar + Enviar WhatsApp */}
          <div className="flex gap-2 mt-3">
            <button onClick={copiar} className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${copiado ? "bg-green-500 text-white" : "bg-[#E8740E] text-white hover:bg-[#F5A623]"}`}>
              {copiado ? "✅ Copiado!" : "📋 Copiar texto"}
            </button>
            <button
              onClick={enviarWhatsApp}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#25D366] text-white hover:bg-[#20BD5A] transition-colors flex items-center justify-center gap-1.5"
              title={clienteTelefone ? `Abre WhatsApp do cliente (${clienteTelefone})` : "Abre WhatsApp pra escolher contato"}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
              </svg>
              Enviar WhatsApp
            </button>
          </div>
          {!clienteTelefone && (
            <p className="text-[10px] text-[#86868B] mt-2 text-center">
              💡 Preencha o telefone pra enviar direto pro cliente. Sem telefone, abre o WhatsApp pra escolher.
            </p>
          )}
        </div>
      )}

      {/* Tabela rápida de parcelas */}
      {(produtoSelecionado || semiProduto) && (
        <div className={cardCls}>
          <p className={`text-sm font-bold mb-3 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Tabela de parcelas (clique pra adicionar/remover)</p>
          <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
            {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21].map(n => {
              const precoPix = semiProduto ? semiProduto.preco : (produtoSelecionado?.preco_pix || 0);
              const entradaVal = parseFloat(entrada) || 0;
              const restante = precoPix - entradaVal;
              if (restante <= 0) return null;
              const taxa = getTaxaOrcamento(n);
              const valorComTaxa = restante * (1 + taxa / 100);
              const valorParcela = Math.ceil(valorComTaxa / n);
              const selected = parcelasSel.includes(n);
              return (
                <button key={n} onClick={() => setParcelasSel(prev => selected ? prev.filter(x => x !== n) : [...prev, n])}
                  className={`p-2 rounded-lg text-center transition-colors ${selected ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#F5F5F7] hover:bg-[#3A3A3C]" : "bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]"}`}>
                  <p className="text-xs font-bold">{n}x</p>
                  <p className="text-sm font-semibold">R$ {valorParcela.toLocaleString("pt-BR")}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
      </>)}

      {/* ═══════ Aba Histórico ═══════ */}
      {aba === "historico" && (
        <div className={cardCls}>
          {/* Filtros */}
          <div className="flex flex-wrap gap-2 mb-4">
            <input
              type="text"
              value={histBusca}
              onChange={e => setHistBusca(e.target.value)}
              placeholder="🔍 Nome, telefone, produto..."
              className={`${inputCls} flex-1 min-w-[200px]`}
            />
            <select
              value={histFiltroStatus}
              onChange={e => setHistFiltroStatus(e.target.value as "" | "ATIVO" | "VIROU_VENDA" | "PERDIDO" | "ARQUIVADO")}
              className={inputCls}
              style={{ maxWidth: 180 }}
            >
              <option value="">Todos status</option>
              <option value="ATIVO">⏳ Ativo</option>
              <option value="VIROU_VENDA">✅ Virou venda</option>
              <option value="PERDIDO">❌ Perdido</option>
              <option value="ARQUIVADO">📦 Arquivado</option>
            </select>
            <select
              value={histFiltroVendedor}
              onChange={e => setHistFiltroVendedor(e.target.value)}
              className={inputCls}
              style={{ maxWidth: 180 }}
            >
              <option value="">Todos vendedores</option>
              {vendedoresNoHistorico.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <button
              onClick={fetchHistorico}
              className="px-3 py-2 rounded-xl text-sm bg-[#E8740E]/10 text-[#E8740E] hover:bg-[#E8740E]/20"
            >🔄</button>
          </div>

          {/* KPIs rapidas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            {(() => {
              const total = historico.length;
              const virouVenda = historico.filter(h => h.status === "VIROU_VENDA").length;
              const perdido = historico.filter(h => h.status === "PERDIDO").length;
              const taxa = total > 0 ? (virouVenda / total) * 100 : 0;
              return (
                <>
                  <div className={`rounded-xl p-3 ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                    <p className="text-[10px] uppercase tracking-wider text-[#86868B]">Total</p>
                    <p className={`text-xl font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{total}</p>
                  </div>
                  <div className={`rounded-xl p-3 ${dm ? "bg-green-900/30" : "bg-green-50"}`}>
                    <p className="text-[10px] uppercase tracking-wider text-green-600">Virou venda</p>
                    <p className="text-xl font-bold text-green-600">{virouVenda}</p>
                  </div>
                  <div className={`rounded-xl p-3 ${dm ? "bg-red-900/30" : "bg-red-50"}`}>
                    <p className="text-[10px] uppercase tracking-wider text-red-500">Perdido</p>
                    <p className="text-xl font-bold text-red-500">{perdido}</p>
                  </div>
                  <div className={`rounded-xl p-3 ${dm ? "bg-[#2C2C2E]" : "bg-[#FFF5EB]"}`}>
                    <p className="text-[10px] uppercase tracking-wider text-[#E8740E]">Conversão</p>
                    <p className="text-xl font-bold text-[#E8740E]">{taxa.toFixed(1)}%</p>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Lista */}
          {histLoading && <p className="text-xs text-center py-6 text-[#86868B]">Carregando...</p>}
          {!histLoading && historico.length === 0 && (
            <p className="text-xs text-center py-8 text-[#86868B]">
              Nenhum orçamento ainda. Gere um na aba &ldquo;Novo orçamento&rdquo;.
            </p>
          )}

          <div className="space-y-2">
            {historico.map(o => {
              const statusBg = o.status === "VIROU_VENDA" ? "bg-green-50 border-green-300" :
                o.status === "PERDIDO" ? "bg-red-50 border-red-300" :
                o.status === "ARQUIVADO" ? "bg-gray-50 border-gray-300" :
                "bg-white border-[#E5E5EA]";
              const telefoneLink = (o.cliente_telefone || "").replace(/\D/g, "");
              const waHref = telefoneLink.length >= 10
                ? `https://wa.me/${telefoneLink.startsWith("55") ? telefoneLink : "55" + telefoneLink}?text=${encodeURIComponent(o.texto_gerado || "")}`
                : null;
              return (
                <div key={o.id} className={`border rounded-xl p-3 ${statusBg} ${dm ? "!bg-[#2C2C2E] !border-[#3A3A3C]" : ""}`}>
                  <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        o.status === "VIROU_VENDA" ? "bg-green-200 text-green-800" :
                        o.status === "PERDIDO" ? "bg-red-200 text-red-800" :
                        o.status === "ARQUIVADO" ? "bg-gray-200 text-gray-700" :
                        "bg-[#FFF5EB] text-[#E8740E]"
                      }`}>
                        {o.status === "VIROU_VENDA" ? "✅ VIROU VENDA" :
                         o.status === "PERDIDO" ? "❌ PERDIDO" :
                         o.status === "ARQUIVADO" ? "📦 ARQUIVADO" :
                         "⏳ ATIVO"}
                      </span>
                      <span className={`text-xs font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>
                        {o.cliente_nome || <span className="text-[#86868B] italic">(sem cliente)</span>}
                      </span>
                      {o.cliente_telefone && (
                        <span className="text-[10px] text-[#86868B]">· {o.cliente_telefone}</span>
                      )}
                      <span className="text-[10px] text-[#86868B]">
                        · {new Date(o.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-[#E8740E]">R$ {Number(o.valor_total).toLocaleString("pt-BR")}</span>
                  </div>

                  <p className="text-xs text-[#86868B] mb-2">
                    {o.vendedor && <>Por <strong>{o.vendedor}</strong> · </>}
                    {(o.itens || []).map(i => i.nome).join(" + ") || "(sem itens)"}
                    {o.trocas && o.trocas.length > 0 && <> · troca: {o.trocas.length}</>}
                  </p>

                  <details>
                    <summary className="text-[10px] font-semibold text-[#86868B] cursor-pointer hover:text-[#1D1D1F]">ver texto do orçamento</summary>
                    <pre className={`whitespace-pre-wrap text-[11px] mt-2 p-2 rounded-lg max-h-48 overflow-auto ${dm ? "bg-[#1C1C1E] text-[#98989D]" : "bg-white text-[#1D1D1F]"}`}>
                      {o.texto_gerado}
                    </pre>
                  </details>

                  <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-[#E5E5EA]">
                    {waHref && (
                      <a href={waHref} target="_blank" rel="noopener noreferrer" className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#25D366] text-white hover:bg-[#20BD5A]">
                        💬 Reenviar WhatsApp
                      </a>
                    )}
                    <button
                      onClick={() => navigator.clipboard.writeText(o.texto_gerado || "")}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F]"
                    >📋 Copiar texto</button>
                    {o.status !== "VIROU_VENDA" && (
                      <button onClick={() => updateOrcamentoStatus(o.id, "VIROU_VENDA")}
                        className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-green-500 text-white hover:bg-green-600">
                        ✅ Virou venda
                      </button>
                    )}
                    {o.status !== "PERDIDO" && (
                      <button onClick={() => updateOrcamentoStatus(o.id, "PERDIDO")}
                        className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-red-500 text-white hover:bg-red-600">
                        ❌ Perdido
                      </button>
                    )}
                    {o.status !== "ARQUIVADO" && (
                      <button onClick={() => updateOrcamentoStatus(o.id, "ARQUIVADO")}
                        className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-gray-400 text-white hover:bg-gray-500">
                        📦 Arquivar
                      </button>
                    )}
                    {o.status !== "ATIVO" && (
                      <button onClick={() => updateOrcamentoStatus(o.id, "ATIVO")}
                        className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#E8740E]/20 text-[#E8740E] hover:bg-[#E8740E]/30">
                        ⏳ Reabrir
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
