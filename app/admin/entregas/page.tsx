"use client";
import { hojeBR } from "@/lib/date-utils";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { getTaxa, calcularLiquido } from "@/lib/taxas";

interface EstoqueItem { id: string; produto: string; categoria: string; tipo: string; qnt: number; custo_unitario: number; cor: string | null; fornecedor: string | null; status: string; serial_no: string | null; imei: string | null; }

interface Entrega {
  id: string;
  created_at: string;
  venda_id: string | null;
  cliente: string;
  telefone: string | null;
  endereco: string | null;
  bairro: string | null;
  data_entrega: string;
  horario: string | null;
  status: "PENDENTE" | "SAIU" | "ENTREGUE" | "CANCELADA";
  entregador: string | null;
  observacao: string | null;
  updated_at: string | null;
  produto: string | null;
  tipo: string | null;
  detalhes_upgrade: string | null;
  forma_pagamento: string | null;
  valor: number | null;
  vendedor: string | null;
  regiao: string | null;
  finalizada?: boolean | null;
  comprovante_lancado?: boolean | null;
}

type EntregaStatus = Entrega["status"];

const STATUS_CONFIG: Record<EntregaStatus, { label: string; color: string; colorDark: string; bg: string; bgDark: string; border: string; borderDark: string; icon: string }> = {
  PENDENTE: { label: "Pendente", color: "text-yellow-700", colorDark: "text-yellow-300", bg: "bg-yellow-100", bgDark: "bg-yellow-900/30", border: "border-yellow-300", borderDark: "border-yellow-600", icon: "🟡" },
  SAIU: { label: "Saiu p/ Entrega", color: "text-blue-700", colorDark: "text-blue-300", bg: "bg-blue-100", bgDark: "bg-blue-900/30", border: "border-blue-300", borderDark: "border-blue-600", icon: "🔵" },
  ENTREGUE: { label: "Entregue", color: "text-green-700", colorDark: "text-green-300", bg: "bg-green-100", bgDark: "bg-green-900/30", border: "border-green-300", borderDark: "border-green-600", icon: "🟢" },
  CANCELADA: { label: "Cancelada", color: "text-red-600", colorDark: "text-red-400", bg: "bg-red-100", bgDark: "bg-red-900/30", border: "border-red-300", borderDark: "border-red-600", icon: "🔴" },
};

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function getWeekRange(offset: number) {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ...
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  for (let i = 0; i < 6; i++) { // Mon-Sat
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }

  const from = days[0].toISOString().split("T")[0];
  const to = days[days.length - 1].toISOString().split("T")[0];
  return { days, from, to };
}

function formatDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function formatDateBR(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

function formatPagamentoDisplay(formaPagamento: string | null, valor: number | null): string {
  if (!formaPagamento) return "—";
  const valorStr = valor != null ? `R$ ${Number(valor).toLocaleString("pt-BR")}` : "";
  // Já vem formatado (ex: "10x no Cartão (ITAU)"), só anexa valor
  const fp = formaPagamento.trim();
  // Casos comuns normalizados
  if (/^pix/i.test(fp) && !/\bR\$/.test(fp)) {
    return `${fp} ${valorStr}`.trim();
  }
  if (/cart[aã]o/i.test(fp) || /\d+x/i.test(fp)) {
    return valor != null ? `${fp} — Total ${valorStr}` : fp;
  }
  return `${fp}${valorStr ? " " + valorStr : ""}`;
}

export default function EntregasPage() {
  const { password, apiHeaders, darkMode: dm } = useAdmin();
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  // Visualização: "dia" (default) mostra um único dia com divisão por motoboy;
  // "semana" mostra o calendário semanal completo (visão geral).
  const [viewMode, setViewMode] = useState<"dia" | "semana">("dia");
  // Data que estamos visualizando no modo "dia" — começa em hoje.
  const [viewDate, setViewDate] = useState<string>(() => hojeBR());
  const [filtroBia, setFiltroBia] = useState<"todas" | "finalizada" | "pendentes_final" | "comprovante" | "sem_comprovante">("todas");
  const [showForm, setShowForm] = useState(false);
  const [modoSimples, setModoSimples] = useState(false);
  const [rastreio, setRastreio] = useState("");

  // Autocomplete de clientes — busca em entregas + vendas, retorna última compra
  type ClienteSug = {
    cliente: string;
    telefone: string | null;
    endereco: string | null;
    bairro: string | null;
    regiao: string | null;
    ultima_compra: { produto: string | null; data: string | null; valor: number | null } | null;
  };
  const [clienteSugs, setClienteSugs] = useState<ClienteSug[]>([]);
  const [showSugs, setShowSugs] = useState(false);
  const [clienteUltimaCompra, setClienteUltimaCompra] = useState<ClienteSug["ultima_compra"]>(null);

  // Seleção em massa para finalizar várias entregas
  const [modoSelecao, setModoSelecao] = useState(false);
  const [entregasSelecionadas, setEntregasSelecionadas] = useState<Set<string>>(new Set());
  const [selectedEntrega, setSelectedEntrega] = useState<Entrega | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const { days, from, to } = getWeekRange(weekOffset);

  const [copied, setCopied] = useState(false);
  const [editingEntregaId, setEditingEntregaId] = useState<string | null>(null);

  const emptyForm = {
    cliente: "",
    telefone: "",
    endereco: "",              // endereço cadastro do cliente
    endereco_entrega: "",      // onde vai ser entregue (default = endereco)
    local_detalhes: "",        // complemento/loja do local (shopping/residencia/outro)
    bairro: "",
    data_entrega: hojeBR(),
    horario: "",
    entregador: "",
    observacao: "",
    tipo: "",
    forma_pagamento: "",
    valor: "",
    parcelas: "",
    maquina: "",
    forma_pagamento_2: "",
    valor_2: "",
    vendedor: "",
    regiao: "",
    local_entrega: "",
    shopping_nome: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [produtos, setProdutos] = useState<string[]>([""]);
  const [trocas, setTrocas] = useState<string[]>([]);
  const [showPagAlt, setShowPagAlt] = useState(false);

  // Estoque picker states — linha 1 do produto
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [catSel, setCatSel] = useState("");
  const [cor1, setCor1] = useState(""); // cor do produto 1
  const [preco1, setPreco1] = useState(0); // preço do produto 1 (tabela ou custo)
  const [serialBusca, setSerialBusca] = useState("");
  const [estoqueId, setEstoqueId] = useState("");
  const [produtoManual, setProdutoManual] = useState(false);
  const [corSel, setCorSel] = useState("");
  const [precosVenda, setPrecosVenda] = useState<{ modelo: string; armazenamento: string; preco_pix: number; categoria: string }[]>([]);
  // Linha 2 do produto (opcional — aparece ao clicar "+ Adicionar 2º produto")
  const [showProduto2, setShowProduto2] = useState(false);
  const [catSel2, setCatSel2] = useState("");
  const [modelo2, setModelo2] = useState("");
  const [cor2, setCor2] = useState("");
  const [preco2, setPreco2] = useState(0);
  const [desconto, setDesconto] = useState("");
  const [trocaAtiva, setTrocaAtiva] = useState(false);
  const [trocaValor, setTrocaValor] = useState("");
  const [trocaProduto, setTrocaProduto] = useState("");
  const [trocaCor, setTrocaCor] = useState("");
  const [trocaBateria, setTrocaBateria] = useState("");
  const [trocaObs, setTrocaObs] = useState("");
  // Override manual do valor do pagamento 1 (quando vazio, assume valor a pagar - pagamento 2)
  const [valorPag1Override, setValorPag1Override] = useState("");

  const [precos, setPrecos] = useState<{ modelo: string; armazenamento: string; preco_pix: number }[]>([]);

  // Fetch estoque + preços
  useEffect(() => {
    if (!password) return;
    fetch("/api/estoque", { headers: apiHeaders() })
      .then(r => r.json())
      .then(j => setEstoque(j.data?.filter((p: EstoqueItem) => p.qnt > 0 && p.status === "EM ESTOQUE") || []))
      .catch(() => {});
    fetch("/api/admin/precos", { headers: apiHeaders() })
      .then(r => r.json())
      .then(j => setPrecos(j.data ?? []))
      .catch(() => {});
  }, [password]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch preços de venda pra novo picker estilo gerar-link (Nicolas)
  useEffect(() => {
    if (!password) return;
    fetch("/api/admin/precos", { headers: apiHeaders() })
      .then(r => r.json())
      .then(j => {
        if (j.data && Array.isArray(j.data)) {
          setPrecosVenda(j.data.filter((p: { status?: string; preco_pix: number }) => p.status !== "esgotado" && p.preco_pix > 0).map((p: { modelo: string; armazenamento: string; preco_pix: number; categoria: string }) => ({
            modelo: p.modelo, armazenamento: p.armazenamento, preco_pix: p.preco_pix, categoria: p.categoria || "OUTROS"
          })));
        }
      })
      .catch(() => {});
  }, [password]); // eslint-disable-line react-hooks/exhaustive-deps

  // Normaliza string pra matching: remove pontuação, colchetes, pipes, "RAM",
  // colapsa espaços, uppercase. Usado tanto pro nome do estoque quanto pro preço.
  const normalizeForMatch = (s: string): string => {
    return s
      .toUpperCase()
      // Remove parenteses e conteúdo: "(10C CPU/10C GPU)" vira " "
      .replace(/\([^)]*\)/g, " ")
      // Remove separadores comuns
      .replace(/[|\\/]/g, " ")
      // Remove aspas
      .replace(/["']/g, " ")
      // Remove "RAM" (opcional na nomenclatura)
      .replace(/\bRAM\b/g, " ")
      // Normaliza espaços
      .replace(/\s+/g, " ")
      .trim();
  };

  // Lista de preços com tokens pré-computados pra matching por tokens (fix bug MacBook)
  const precosTokens = useMemo(() => {
    return precos.map((p) => {
      const combined = `${p.modelo || ""} ${p.armazenamento || ""}`;
      const norm = normalizeForMatch(combined);
      const tokens = norm.split(" ").filter(Boolean);
      return { preco: Number(p.preco_pix) || 0, tokens, norm };
    });
  }, [precos]);

  const lookupPrecoVenda = (modelStr: string): number => {
    const norm = normalizeForMatch(modelStr);
    if (!norm) return 0;
    const nameTokens = new Set(norm.split(" ").filter(Boolean));

    // Busca o preço cujos tokens TODOS aparecem no nome do estoque.
    // Entre os que batem, prefere o mais específico (maior número de tokens).
    let melhor = { preco: 0, score: 0 };
    for (const p of precosTokens) {
      if (p.tokens.length === 0) continue;
      const todos = p.tokens.every((t) => nameTokens.has(t));
      if (todos && p.tokens.length > melhor.score) {
        melhor = { preco: p.preco, score: p.tokens.length };
      }
    }
    return melhor.preco;
  };

  // Categorias dinâmicas do estoque
  const categorias = useMemo(() => {
    const cats = new Map<string, string>();
    estoque.forEach(p => {
      const key = p.tipo === "SEMINOVO" ? `${p.categoria}_SEMI` : p.categoria;
      const label = p.tipo === "SEMINOVO" ? `${p.categoria} (Seminovo)` : p.categoria;
      if (!cats.has(key)) cats.set(key, label);
    });
    return [...cats.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [estoque]);

  // Categorias dos preços com labels amigáveis
  const CAT_LABELS: Record<string, string> = { IPHONE: "iPhones", IPAD: "iPads", MACBOOK: "MacBooks", APPLE_WATCH: "Apple Watch", AIRPODS: "AirPods", ACESSORIOS: "Acessórios", MAC_MINI: "Mac Mini", OUTROS: "Outros" };
  const categoriaPrecos = useMemo(() => {
    const cats = [...new Set(precosVenda.map(p => p.categoria))].sort();
    return cats;
  }, [precosVenda]);

  // Produtos filtrados por categoria
  const produtosFiltradosPreco = useMemo(() => {
    if (!catSel) return [];
    return precosVenda
      .filter(p => p.categoria === catSel)
      .map(p => ({ nome: `${p.modelo} ${p.armazenamento}`.trim(), preco: p.preco_pix }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [precosVenda, catSel]);

  // Produto 2 — mesma fonte (precosVenda) pra garantir nomes formatados igual ao produto 1
  const produtosFiltradosPreco2 = useMemo(() => {
    if (!catSel2) return [];
    return precosVenda
      .filter(p => p.categoria === catSel2)
      .map(p => ({ nome: `${p.modelo} ${p.armazenamento}`.trim(), preco: p.preco_pix }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [precosVenda, catSel2]);

  // Cores reais do estoque para produto 2 (mesma lógica de coresDisponiveis)
  const coresDisponiveis2 = useMemo(() => {
    if (!modelo2) return [];
    const prodSel = modelo2.toLowerCase().replace(/[º°""]/g, "").replace(/\s+/g, " ").trim();
    const keywords = prodSel.split(" ").filter(w => w.length >= 2);
    const cores = new Set<string>();
    for (const item of estoque) {
      const prodEstoque = item.produto.toLowerCase().replace(/[º°""]/g, "").replace(/\s+/g, " ").trim();
      if (prodEstoque.includes(prodSel) || prodSel.includes(prodEstoque)) {
        if (item.cor) cores.add(item.cor.toUpperCase());
        continue;
      }
      const matchCount = keywords.filter(kw => prodEstoque.includes(kw)).length;
      if (matchCount >= Math.min(3, keywords.length - 1)) {
        if (item.cor) cores.add(item.cor.toUpperCase());
      }
    }
    return [...cores].sort();
  }, [modelo2, estoque]);

  // Cores reais do estoque para o produto selecionado
  const coresDisponiveis = useMemo(() => {
    if (!produtos[0]) return [];
    const prodSel = produtos[0].toLowerCase().replace(/[º°""]/g, "").replace(/\s+/g, " ").trim();
    const keywords = prodSel.split(" ").filter(w => w.length >= 2);
    const cores = new Set<string>();
    for (const item of estoque) {
      const prodEstoque = item.produto.toLowerCase().replace(/[º°""]/g, "").replace(/\s+/g, " ").trim();
      if (prodEstoque.includes(prodSel) || prodSel.includes(prodEstoque)) {
        if (item.cor) cores.add(item.cor.toUpperCase());
        continue;
      }
      const matchCount = keywords.filter(kw => prodEstoque.includes(kw)).length;
      if (matchCount >= Math.min(3, keywords.length - 1)) {
        if (item.cor) cores.add(item.cor.toUpperCase());
      }
    }
    return [...cores].sort();
  }, [produtos, estoque]);

  // Valor base e final
  // Se tiver preco1/preco2 (seleção do catálogo), usa a soma. Senão usa o campo manual form.valor.
  const somaProdutos = preco1 + preco2;
  const valorBase = somaProdutos > 0 ? somaProdutos : (parseFloat(form.valor) || 0);
  const descontoNum = parseFloat(desconto) || 0;
  const trocaNum = parseFloat(trocaValor) || 0;
  const valorFinal = Math.max(0, valorBase - descontoNum);
  const valorAPagar = Math.max(0, valorFinal - trocaNum);

  // Sincroniza form.valor com a soma dos produtos selecionados (catálogo)
  useEffect(() => {
    if (somaProdutos > 0) {
      setForm(f => f.valor === String(somaProdutos) ? f : { ...f, valor: String(somaProdutos) });
    }
  }, [somaProdutos]);

  // Valor do pagamento 1 = o que sobra depois do pagamento 2 (ou override manual)
  const valorPag2 = parseFloat(form.valor_2) || 0;
  const valorPag1 = valorPag1Override
    ? parseFloat(valorPag1Override) || 0
    : Math.max(0, valorAPagar - valorPag2);

  // Cálculo de parcelas com taxa embutida (mesma tabela do /gerar-link e Nova Venda)
  const TAXAS_PARCELAS: Record<number, number> = {
    1: 4, 2: 5, 3: 5.5, 4: 6, 5: 7, 6: 7.5,
    7: 8, 8: 9.1, 9: 10, 10: 11, 11: 12, 12: 13,
    13: 14, 14: 15, 15: 16, 16: 17, 17: 18, 18: 19,
    19: 20, 20: 21, 21: 22,
  };
  const isCartaoCredito = form.forma_pagamento === "Cartao Credito" || form.forma_pagamento === "Link de Pagamento";
  const nParcelas = parseInt(form.parcelas) || 0;
  const taxaAtual = isCartaoCredito && nParcelas > 0 ? (TAXAS_PARCELAS[nParcelas] || 0) : 0;
  // Taxa aplicada sobre o valor do PAGAMENTO 1 (não o total a pagar) — importante quando há split
  const totalComTaxa = taxaAtual > 0 ? Math.ceil(valorPag1 * (1 + taxaAtual / 100)) : valorPag1;
  const valorParcela = nParcelas > 0 ? Math.ceil(totalComTaxa / nParcelas) : 0;

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const fetchEntregas = useCallback(async () => {
    setLoading(true);
    try {
      // No modo "dia", busca apenas essa data; no modo "semana", busca a semana inteira.
      const params = viewMode === "dia"
        ? new URLSearchParams({ from: viewDate, to: viewDate })
        : new URLSearchParams({ from, to });
      const res = await fetch(`/api/admin/entregas?${params}`, {
        headers: apiHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setEntregas(json.data ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password, from, to, viewMode, viewDate]);

  useEffect(() => {
    if (password) fetchEntregas();
  }, [password, fetchEntregas]);

  // Prefill via query params (vindo de /admin/simulacoes, etc)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const qp = new URLSearchParams(window.location.search);
    if (!qp.toString()) return;
    const clienteNome = qp.get("cliente_nome") || "";
    const clienteTel = qp.get("cliente_telefone") || "";
    const endereco = qp.get("endereco") || "";
    const bairro = qp.get("bairro") || "";
    const produto = qp.get("produto") || "";
    const cor = qp.get("cor") || "";
    const valor = qp.get("valor") || "";
    const trocaProd = qp.get("troca_produto") || "";
    const trocaVal = qp.get("troca_valor") || "";
    const trocaCorQp = qp.get("troca_cor") || "";
    const trocaBatQp = qp.get("troca_bateria") || "";
    const trocaMarcas = qp.get("troca_marcas_uso") || "";
    const trocaPecas = qp.get("troca_pecas_trocadas") || "";
    const trocaCaixa = qp.get("troca_caixa_original") || "";
    const trocaObsQp = qp.get("troca_observacao") || "";
    const diferencaPix = qp.get("diferenca_pix") || "";
    const obs = diferencaPix ? `Diferença PIX: R$ ${diferencaPix}` : "";
    // Monta observação consolidada da troca caso o param explícito não venha
    const trocaObsParts: string[] = [];
    if (trocaObsQp) trocaObsParts.push(trocaObsQp);
    else {
      if (trocaMarcas === "nao") trocaObsParts.push("Sem marcas de uso");
      else if (trocaMarcas) trocaObsParts.push(`Marcas: ${trocaMarcas}`);
      if (trocaPecas) trocaObsParts.push(trocaPecas);
      if (trocaCaixa === "sim") trocaObsParts.push("Com caixa original");
      else if (trocaCaixa === "nao") trocaObsParts.push("Sem caixa original");
    }
    const trocaObsFinal = trocaObsParts.join(" | ");

    setForm(f => ({
      ...f,
      cliente: clienteNome || f.cliente,
      telefone: clienteTel || f.telefone,
      endereco: endereco || f.endereco,
      bairro: bairro || f.bairro,
      valor: valor ? String(Math.round(parseFloat(valor))) : f.valor,
      observacao: obs || f.observacao,
    }));
    if (produto) {
      setProdutos([cor ? `${produto} ${cor}`.trim() : produto]);
      setProdutoManual(true);
    }
    if (trocaProd) {
      setTrocaAtiva(true);
      setTrocaProduto(trocaProd);
      if (trocaVal) setTrocaValor(String(Math.round(parseFloat(trocaVal))));
      if (trocaCorQp) setTrocaCor(trocaCorQp);
      if (trocaBatQp) setTrocaBateria(trocaBatQp);
      if (trocaObsFinal) setTrocaObs(trocaObsFinal);
    }
    if (clienteNome || produto) setShowForm(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!form.cliente || !form.data_entrega) {
      setMsg("Preencha cliente e data da entrega");
      return;
    }
    setSaving(true);
    setMsg("");

    const produtosFilled = produtos.filter(Boolean);
    if (corSel && produtosFilled[0]) produtosFilled[0] = `${produtosFilled[0]} ${corSel}`;
    // Se tiver Produto 2 selecionado, adiciona ao final
    if (showProduto2 && modelo2) {
      produtosFilled.push(cor2 ? `${modelo2} ${cor2}` : modelo2);
    }
    const produtosStr = produtosFilled.join(" | ");
    const trocasStr = trocaAtiva ? [trocaProduto, trocaCor ? `Cor: ${trocaCor}` : "", trocaBateria ? `Bateria: ${trocaBateria}%` : "", trocaObs, trocaValor ? `Avaliação: R$ ${trocaValor}` : ""].filter(Boolean).join("\n") : "";
    const isEdit = !!editingEntregaId;
    // Endereço de entrega final: Shopping → shopping_nome; Outro → local_detalhes; senão endereco_entrega; fallback endereco cadastro
    const enderecoEntregaFinal =
      form.local_entrega === "SHOPPING" && form.shopping_nome?.trim()
        ? form.shopping_nome.trim()
        : form.local_entrega === "OUTRO" && form.local_detalhes?.trim()
        ? form.local_detalhes.trim()
        : (form.endereco_entrega?.trim() || form.endereco?.trim() || "");
    // Forma de pagamento detalhada
    let formaPagDetalhada = form.forma_pagamento || "";
    if ((form.forma_pagamento === "Cartao Credito" || form.forma_pagamento === "Cartao Debito") && form.parcelas) {
      formaPagDetalhada = `${form.parcelas}x no Cartão${form.maquina ? ` (${form.maquina})` : ""}`;
    } else if (form.forma_pagamento === "Pix" && form.maquina) {
      formaPagDetalhada = `PIX (${form.maquina})`;
    }
    if (form.forma_pagamento_2 && form.valor_2) {
      formaPagDetalhada += ` + ${form.forma_pagamento_2} R$${form.valor_2}`;
    }
    // Observação com endereço de cadastro do cliente (se diferente do de entrega)
    const obsExtras: string[] = [];
    if (form.observacao) obsExtras.push(form.observacao);
    if (descontoNum > 0) obsExtras.push(`Desconto: R$ ${descontoNum}`);
    if (form.endereco && form.endereco.trim() !== enderecoEntregaFinal.trim()) {
      obsExtras.push(`Endereço cadastro: ${form.endereco}`);
    }
    const res = await fetch("/api/admin/entregas", {
      method: isEdit ? "PATCH" : "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        ...(isEdit ? { id: editingEntregaId } : {}),
        cliente: form.cliente,
        data_entrega: form.data_entrega,
        telefone: form.telefone || null,
        endereco: enderecoEntregaFinal || null,
        bairro: form.bairro || null,
        horario: form.horario || null,
        entregador: form.entregador || null,
        observacao: (() => {
          const parts = [...obsExtras];
          if (modoSimples && rastreio) parts.push(`Rastreio: ${rastreio}`);
          return parts.length ? parts.join(" | ") : null;
        })(),
        produto: produtosStr || null,
        tipo: trocaAtiva ? "UPGRADE" : (form.tipo || null),
        detalhes_upgrade: trocasStr || null,
        forma_pagamento: formaPagDetalhada || null,
        valor: valorAPagar > 0 ? valorAPagar : (form.valor ? parseFloat(form.valor) : null),
        vendedor: form.vendedor || null,
        regiao: form.regiao || null,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      setMsg(isEdit ? "Entrega atualizada!" : "Entrega agendada!");
      setForm({ ...emptyForm, data_entrega: hojeBR() });
      setClienteUltimaCompra(null);
      setProdutos([""]); setTrocas([]); setShowPagAlt(false);
      setCatSel(""); setEstoqueId(""); setCorSel(""); setCor1(""); setPreco1(0);
      setShowProduto2(false); setCatSel2(""); setModelo2(""); setCor2(""); setPreco2(0);
      setValorPag1Override("");
      setDesconto(""); setTrocaAtiva(false); setTrocaValor(""); setTrocaProduto(""); setTrocaCor(""); setTrocaBateria(""); setTrocaObs(""); setProdutoManual(false); setSerialBusca("");
      setEditingEntregaId(null);
      setRastreio("");
      setModoSimples(false);
      setShowForm(false);
      fetchEntregas();
    } else {
      setMsg("Erro: " + json.error);
    }
    setSaving(false);
  };

  const handleStatusChange = async (entrega: Entrega, newStatus: EntregaStatus) => {
    try {
      const res = await fetch("/api/admin/entregas", {
        method: "PATCH",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: entrega.id, status: newStatus }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok !== false) {
        setEntregas((prev) => prev.map((e) => (e.id === entrega.id ? { ...e, status: newStatus } : e)));
        setSelectedEntrega(null);
        setMsg(`Status atualizado: ${newStatus}`);
      } else {
        setMsg(`Erro ao atualizar: ${json.error || res.statusText}`);
      }
    } catch (err) {
      setMsg(`Erro de rede: ${err instanceof Error ? err.message : "desconhecido"}`);
    }
  };

  // Quick patch — usado pela edição inline de horário/data no modal de detalhes.
  // Liberado pra qualquer usuário que tenha acesso à página de entregas (não exige admin).
  const quickPatchEntrega = async (id: string, patch: Partial<Entrega>) => {
    const res = await fetch("/api/admin/entregas", {
      method: "PATCH",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id, ...patch }),
    });
    if (res.ok) {
      setEntregas((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      setSelectedEntrega((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
    }
  };

  const buildWhatsAppText = () => {
    const prods = produtos.filter(Boolean);
    const produtoText = prods.length > 1
      ? prods.map((p, i) => `${i + 1}. ${p}`).join("\n   ")
      : prods[0] || "—";

    // Pagamento principal — quando é cartão crédito/link com parcelas, mostra breakdown calculado
    let pagText = `${form.forma_pagamento || "—"}`;
    if (form.forma_pagamento === "Cartao Credito" || form.forma_pagamento === "Cartao Debito" || form.forma_pagamento === "Link de Pagamento") {
      if (form.parcelas) pagText += ` ${form.parcelas}x`;
      if (form.maquina) pagText += ` (${form.maquina})`;
    }
    if (isCartaoCredito && nParcelas > 0 && valorAPagar > 0) {
      pagText += ` — ${nParcelas}x de R$${valorParcela.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (total c/ taxa R$${totalComTaxa.toLocaleString("pt-BR")} | base R$${valorAPagar.toLocaleString("pt-BR")} + ${taxaAtual}%)`;
    } else {
      pagText += ` R$${form.valor || "0"}`;
    }

    // Pagamento alternativo
    let pagAlt = "";
    if (form.forma_pagamento_2 && form.valor_2) {
      pagAlt = `\n💵 *Pagamento 2:* ${form.forma_pagamento_2} R$${form.valor_2}`;
    }

    const tipoLabel = form.tipo === "UPGRADE" ? "UPGRADE (Troca)" : form.tipo || "Compra";

    // Trocas formatadas
    const trocasText = trocas.filter(Boolean).map((t, i) => {
      return trocas.length > 1 ? `${i + 1}. ${t.replace(/\n/g, " / ")}` : t.replace(/\n/g, " / ");
    }).join("\n   ");

    const lines = [
      `🛵 *ENTREGA ${(form.bairro || "—").toUpperCase()}* 🛵`,
      `🛵`,
      `⏰ *HORÁRIO:* ${form.horario || "—"}`,
      `📍 *LOCAL:* ${form.endereco || "—"} - ${form.bairro || ""}`,
      `🍎 *PRODUTO:* ${produtoText}`,
      `‼️ *TIPO:* ${tipoLabel}`,
      ...(form.tipo === "UPGRADE" && trocas.filter(Boolean).length > 0 ? [`🔄 *PRODUTO NA TROCA:*\n   ${trocasText}`] : []),
      `💵 *PAGAMENTO:* ${pagText}${pagAlt}`,
      ...(form.local_entrega === "RESIDÊNCIA" ? [`⚠️ PAGAMENTO ANTECIPADO`] : form.local_entrega === "SHOPPING" ? [`✅ PAGAR NA ENTREGA`] : []),
      `🧑 *CLIENTE:* ${form.cliente || "—"}`,
      `📞 *CONTATO:* ${form.telefone || "—"}`,
      form.observacao ? `OBS: ${form.observacao}` : "",
      `💼 Vendedor: ${form.vendedor || "—"}`,
    ].filter(Boolean);
    return lines.join("\n");
  };

  const handleCopyWhatsApp = async () => {
    try {
      await navigator.clipboard.writeText(buildWhatsAppText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = buildWhatsAppText();
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover esta entrega?")) return;
    const res = await fetch("/api/admin/entregas", {
      method: "DELETE",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setEntregas((prev) => prev.filter((e) => e.id !== id));
      setSelectedEntrega(null);
    }
  };

  const today = hojeBR();

  const inputCls = "w-full px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] text-sm focus:outline-none focus:border-[#E8740E] transition-colors";
  const labelCls = "text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-1";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-bold text-[#1D1D1F]">Agenda de Entregas</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowForm(!showForm || modoSimples); setModoSimples(false); setMsg(""); }}
            className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors"
          >
            {showForm && !modoSimples ? "Fechar" : "+ Nova Entrega"}
          </button>
          <button
            onClick={() => {
              const willOpen = !(showForm && modoSimples);
              setShowForm(willOpen);
              setModoSimples(willOpen);
              if (willOpen && !form.tipo) set("tipo", "CORREIOS");
              setMsg("");
            }}
            className="px-4 py-2 rounded-xl border-2 border-[#E8740E] text-[#E8740E] text-sm font-semibold hover:bg-[#FFF5EB] transition-colors"
          >
            {showForm && modoSimples ? "Fechar" : "📮 Entrega Simplificada"}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {msg}
        </div>
      )}

      {/* Formulário Nova Entrega */}
      {showForm && (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold text-[#1D1D1F]">{editingEntregaId ? "✏️ Editar Entrega" : modoSimples ? "📮 Nova Entrega Simplificada (Correios / externa)" : "Agendar Nova Entrega"}</h2>
              {editingEntregaId && <button onClick={() => { setEditingEntregaId(null); setForm({ ...emptyForm, data_entrega: hojeBR() }); setProdutos([""]); setTrocaAtiva(false); setTrocaValor(""); setTrocaProduto(""); setDesconto(""); }} className="text-xs text-red-500 hover:underline">Cancelar edição</button>}
              <button
                type="button"
                onClick={() => {
                  if (!confirm("Limpar todos os dados do formulário?")) return;
                  setEditingEntregaId(null);
                  setForm({ ...emptyForm, data_entrega: hojeBR() });
                  setProdutos([""]);
                  setTrocaAtiva(false);
                  setTrocaValor("");
                  setTrocaProduto("");
                  setDesconto("");
                  setMsg("");
                }}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
              >
                🗑️ Limpar formulário
              </button>
            </div>
            <button
              onClick={async () => {
                try {
                  let text = "";
                  try {
                    text = await navigator.clipboard.readText();
                  } catch {
                    const manual = window.prompt("Cole aqui os dados do cliente (Ctrl+V / Cmd+V):", "");
                    text = manual || "";
                  }
                  if (!text || text.length < 10) { setMsg("Nada no clipboard. Copie a mensagem do WhatsApp primeiro."); return; }
                  const lines = text.split("\n").map(l => l.trim());
                  const extract = (line: string) => line.replace(/^[✅⚠️📌🤔🔄💰📋🏷️🎯]*\s*/g, "").replace(/^[^:：]+[:：]\s*/, "").trim();
                  const r: Record<string, string> = {};
                  const produtos: string[] = [];
                  const trocas: string[] = [];
                  let section = ""; // track current section
                  let currentTroca = "";

                  for (let i = 0; i < lines.length; i++) {
                    // Limpa asteriscos e emojis pra versão "clean" mas mantém original pra extract
                    const lineClean = lines[i].replace(/\*/g, "").trim();
                    const low = lineClean.toLowerCase().replace(/[✅⚠️📌🤔🎯🔄💰📋🏷️🖥️💳📦🍎📱💻⌚🎧·•]/g, "").trim();
                    if (!low || low.length < 2) continue;

                    // Extract: pega valor depois do primeiro ":"
                    const extr = (l: string) => { const idx = l.indexOf(":"); return idx >= 0 ? l.slice(idx + 1).trim() : l.trim(); };

                    // Detect sections (multi-product format)
                    if (low.includes("modelo escolhido")) { section = "produtos"; continue; }
                    if (low.includes("trocas inclu")) { section = "trocas"; continue; }
                    if (low.includes("desconto adicional")) { section = "desconto"; continue; }
                    if (low.match(/^valor\s*[:：]/) || low.includes("valor total")) { section = "valor"; }
                    if (low.includes("dados da compra")) { continue; } // skip header

                    // "Produto:" inline — captura o valor na mesma linha
                    if ((low.match(/^produto\s*[:：]/) || (low.includes("produto:") && !low.includes("troca"))) && !low.includes("na troca")) {
                      let val = extr(lineClean);
                      const precoMatch = val.match(/\s*[—–-]\s*R?\$?\s*([\d.,]+)\s*$/);
                      if (precoMatch) {
                        if (!r.valor) r.valor = precoMatch[1].replace(/\./g, "").replace(",", ".");
                        val = val.replace(/\s*[—–-]\s*R?\$?\s*[\d.,]+\s*$/, "").trim();
                      }
                      if (val && val.length > 2) { produtos.push(val); section = ""; }
                      continue;
                    }

                    // Produto sem label — detectar por nome de produto Apple (com emoji 🖥️📱 etc)
                    if (!produtos.length && (
                      low.match(/^(iphone|ipad|mac|macbook|apple watch|airpods|air tag)/i) ||
                      low.match(/^(mac mini|mac pro)/i) ||
                      lineClean.match(/^[🖥️📱💻⌚🎧📦]\s*.{3,}/u)
                    )) {
                      const val = lineClean.replace(/^[🖥️📱💻⌚🎧📦]\s*/u, "").trim();
                      if (val.length > 3 && !val.includes("vista") && !val.includes("restante")) {
                        produtos.push(val);
                        continue;
                      }
                    }

                    // "Produto na troca:" — entra seção trocas
                    if (low.includes("produto na troca") || low.includes("aparelho na troca")) {
                      section = "trocas";
                      const val = extr(lineClean).replace(/seu aparelho na troca\s*[:：]?\s*/i, "").trim();
                      if (val && val.length > 3) currentTroca = val + "\n";
                      continue;
                    }

                    // === Campos com label ===
                    if (low.includes("nome completo") || low.match(/^nome\s*[:：]/)) { r.cliente = extr(lineClean); section = ""; }
                    else if (low.includes("telefone") || low.includes("celular") || low.match(/^whatsapp\s*[:：]/)) {
                      const m = lineClean.match(/\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}/);
                      if (m) r.telefone = m[0]; section = "";
                    }
                    else if (low.match(/^bairro\s*[:：]/)) { r.bairro = extr(lineClean); section = ""; }
                    else if (low.includes("endereco") || low.includes("endereço") || low.match(/^end[\s.:]/)) { r.endereco = extr(lineClean); section = ""; }
                    else if (low.match(/^cep\s*[:：]/)) { const m = lineClean.match(/\d{5}[-.\s]?\d{3}/); if (m) r.cep = m[0]; section = ""; }

                    // Forma de pagamento (com label)
                    else if (low.includes("forma de pagamento") || low.includes("forma pagamento")) {
                      r.forma_pagamento = extr(lineClean); section = "";
                    }

                    // Valor: "💰 R$ 8.000,00 à vista no PIX de entrada" (sem label "Valor:")
                    else if (low.includes("vista") && low.includes("pix")) {
                      const m = lineClean.match(/R?\$?\s*([\d.,]+)/);
                      if (m) { r.entrada_pix = m[1].replace(/\./g, "").replace(",", "."); section = "pagamento"; }
                    }
                    // Parcelas: "• 10x de R$ 178,00"
                    else if (low.match(/^\d+x\s+de\s+r/) || low.match(/•\s*\d+x/)) {
                      const m = lineClean.match(/(\d+)x\s+de\s+R?\$?\s*([\d.,]+)/);
                      if (m) { r.parcelas = `${m[1]}x de R$${m[2]}`; }
                      section = "";
                    }
                    // "O restante parcelado ficaria:" — skip
                    else if (low.includes("restante parcelado")) { section = "pagamento"; }

                    else if (low.match(/^horario\s*[:：]/) || low.includes("horário") || low.includes("horario:")) { r.horario = extr(lineClean); section = ""; }
                    else if (low.match(/^vendedor\s*[:：]/)) { r.vendedor = extr(lineClean); section = ""; }
                    else if (low.includes("como conheceu")) { section = ""; }

                    // Local: "Local: Entrega - Shopping: VillageMall" ou "Local: Entrega - Av. das Americas..."
                    else if (low.match(/^local\s*[:：]/)) {
                      const val = extr(lineClean);
                      const lowVal = val.toLowerCase();
                      if (lowVal.includes("entrega")) { r.local_entrega = "OUTRO"; } // default entrega
                      if (lowVal.includes("shopping") || lowVal.includes("village") || lowVal.includes("mall") || lowVal.includes("barra")) { r.local_entrega = "SHOPPING"; }
                      else if (lowVal.includes("residencia") || lowVal.includes("residência")) { r.local_entrega = "RESIDÊNCIA"; }
                      else if (lowVal.includes("loja") || lowVal.includes("retirada")) { r.local_entrega = ""; }
                      section = "";
                    }

                    else if (low.includes("antecipado")) { r.tipo_pagamento = "ANTECIPADO"; }
                    else if (low.includes("pagar na entrega")) { r.tipo_pagamento = "NA ENTREGA"; }

                    // Valor section
                    else if (section === "valor") {
                      const m = lineClean.match(/R?\$?\s*([\d.,]+)/);
                      if (m) { r.valor = m[1].replace(/\./g, "").replace(",", "."); section = ""; }
                    }
                    // Desconto
                    else if (section === "desconto") {
                      const m = lineClean.match(/R?\$?\s*([\d.,]+)/);
                      if (m) { r.desconto = m[1].replace(/\./g, "").replace(",", "."); section = ""; }
                    }
                    // Products section — each line is a product (multi-product format)
                    else if (section === "produtos" && low.length > 3) {
                      produtos.push(lineClean.replace(/^[✅⚠️📌🤔·•]\s*/g, "").trim());
                    }
                    // Trocas section
                    else if (section === "trocas") {
                      if (low.match(/^iphone|^apple|^ipad|^macbook|^airpods/) || lineClean.startsWith("·") || lineClean.startsWith("•")) {
                        if (currentTroca) trocas.push(currentTroca.trim());
                        currentTroca = lineClean.replace(/^[·•]\s*/, "") + "\n";
                      } else if (low.includes("avaliado")) {
                        currentTroca += lineClean + "\n";
                        trocas.push(currentTroca.trim());
                        currentTroca = "";
                      } else if (low.match(/caixa original\s*[:：]/)) {
                        const val = extr(lineClean).toLowerCase();
                        currentTroca += `Caixa original: ${val.includes("sim") ? "Sim" : "Nao"}\n`;
                      } else if (low.includes("seu aparelho")) {
                        // skip header
                      } else if (currentTroca || low.length > 3) {
                        currentTroca += lineClean + "\n";
                      }
                    }
                  }
                  if (currentTroca) trocas.push(currentTroca.trim());

                  // Montar forma_pagamento e valor quando veio entrada PIX + parcelas (formato sem label)
                  if (r.entrada_pix && !r.forma_pagamento) {
                    r.forma_pagamento = r.parcelas
                      ? `Entrada PIX R$${Number(r.entrada_pix).toLocaleString("pt-BR")} + ${r.parcelas} no cartao`
                      : `PIX R$${Number(r.entrada_pix).toLocaleString("pt-BR")}`;
                  }
                  if (r.entrada_pix && !r.valor) {
                    r.valor = r.entrada_pix;
                  }

                  // Apply to form
                  if (r.cliente) set("cliente", r.cliente);
                  if (r.telefone) set("telefone", r.telefone);
                  if (r.bairro) set("bairro", r.bairro);
                  if (r.endereco) { set("endereco", r.endereco); set("endereco_entrega", r.endereco); }
                  if (r.horario) set("horario", r.horario);
                  if (r.vendedor) set("vendedor", r.vendedor);
                  if (r.local_entrega) set("local_entrega", r.local_entrega);

                  // Products — populate dynamic array
                  if (produtos.length > 0) {
                    setProdutos(produtos);
                  }

                  // Trocas → tipo UPGRADE + array de trocas
                  if (trocas.length > 0) {
                    set("tipo", "UPGRADE");
                    setTrocas(trocas);
                  }

                  // Payment
                  if (r.forma_pagamento) set("forma_pagamento", r.forma_pagamento);
                  if (r.valor) set("valor", r.valor);

                  const totalFields = Object.keys(r).length + produtos.length + trocas.length;
                  setMsg(`✅ Dados colados! ${totalFields} campos preenchidos. ${produtos.length} produto(s), ${trocas.length} troca(s).`);
                } catch { setMsg("Erro ao ler clipboard. Permita o acesso."); }
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold border-2 border-dashed border-[#E8740E] text-[#E8740E] hover:bg-[#FFF5EB] transition-colors"
            >
              📋 Colar dados do cliente
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className={labelCls}>Cliente</p>
              <div className="relative">
                <input
                  value={form.cliente}
                  onChange={async (e) => {
                    const v = e.target.value;
                    set("cliente", v);
                    if (v.trim().length >= 2) {
                      try {
                        const res = await fetch(`/api/admin/entregas?search_clientes=${encodeURIComponent(v.trim())}`, { headers: apiHeaders() });
                        const j = await res.json();
                        setClienteSugs(j.clientes || []);
                        setShowSugs(true);
                      } catch { /* ignore */ }
                    } else {
                      setClienteSugs([]);
                      setShowSugs(false);
                    }
                  }}
                  onFocus={() => { if (clienteSugs.length > 0) setShowSugs(true); }}
                  onBlur={() => setTimeout(() => setShowSugs(false), 200)}
                  placeholder="Nome do cliente (digite 2+ letras p/ buscar)"
                  className={inputCls}
                />
                {showSugs && clienteSugs.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-[#D2D2D7] rounded-xl shadow-lg max-h-[320px] overflow-y-auto">
                    {clienteSugs.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          set("cliente", s.cliente);
                          if (s.telefone) set("telefone", s.telefone);
                          // Preenche endereco cadastro como referência (readonly).
                          // O endereco_entrega é preenchido em branco — usuário decide.
                          if (s.endereco) set("endereco", s.endereco);
                          if (s.bairro) set("bairro", s.bairro);
                          if (s.regiao) set("regiao", s.regiao);
                          setClienteUltimaCompra(s.ultima_compra);
                          setShowSugs(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-[#FFF5EB] border-b border-[#F5F5F7] last:border-b-0"
                      >
                        <p className="text-sm font-semibold text-[#1D1D1F]">{s.cliente}</p>
                        <p className="text-[10px] text-[#86868B]">
                          {s.telefone || "—"}{s.bairro ? ` · ${s.bairro}` : ""}{s.endereco ? ` · ${s.endereco.slice(0, 40)}${s.endereco.length > 40 ? "..." : ""}` : ""}
                        </p>
                        {s.ultima_compra?.produto && (
                          <p className="text-[10px] text-[#E8740E] font-semibold mt-0.5">
                            🛒 {s.ultima_compra.produto.slice(0, 48)}{s.ultima_compra.produto.length > 48 ? "..." : ""}
                            {s.ultima_compra.data ? ` · ${formatDateBR(s.ultima_compra.data)}` : ""}
                            {s.ultima_compra.valor ? ` · R$ ${s.ultima_compra.valor.toLocaleString("pt-BR")}` : ""}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {clienteUltimaCompra?.produto && (
                  <p className="text-[10px] text-[#E8740E] font-semibold mt-1">
                    🛒 Última compra: {clienteUltimaCompra.produto}
                    {clienteUltimaCompra.data ? ` · ${formatDateBR(clienteUltimaCompra.data)}` : ""}
                    {clienteUltimaCompra.valor ? ` · R$ ${clienteUltimaCompra.valor.toLocaleString("pt-BR")}` : ""}
                  </p>
                )}
              </div>
            </div>
            <div>
              <p className={labelCls}>Telefone</p>
              <input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(21) 99999-9999" className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Bairro</p>
              <input value={form.bairro} onChange={(e) => set("bairro", e.target.value)} placeholder="Ex: Barra da Tijuca" className={inputCls} />
            </div>
            <div className="col-span-2 md:col-span-3 p-3 rounded-xl border border-[#E5E5EA] bg-[#FAFAFA] space-y-3">
              <p className="text-xs font-bold text-[#86868B] uppercase tracking-wider">Endereços</p>
              <div>
                <p className={labelCls}>Endereço do cliente (cadastro)</p>
                <input value={form.endereco} readOnly placeholder="Preenchido ao colar dados do cliente" className={`${inputCls} opacity-70 cursor-not-allowed`} />
              </div>
              <div>
                <p className={labelCls}>Endereço de entrega</p>
                <input value={form.endereco_entrega} onChange={(e) => set("endereco_entrega", e.target.value)} placeholder="Onde será entregue (default = cadastro)" className={inputCls} />
              </div>
            </div>
            <div>
              <p className={labelCls}>Local de Entrega</p>
              <select value={form.local_entrega} onChange={(e) => {
                const v = e.target.value;
                set("local_entrega", v);
                if (v !== "SHOPPING") set("shopping_nome", "");
                if (v !== "OUTRO") set("local_detalhes", "");
              }} className={inputCls}>
                <option value="">-- Selecionar --</option>
                <option value="RETIRADA">Retirada em Loja</option>
                <option value="RESIDÊNCIA">Residência</option>
                <option value="SHOPPING">Shopping</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>
            {form.local_entrega === "SHOPPING" && (
              <div className="col-span-2">
                <p className={labelCls}>Shopping (nome + loja)</p>
                <input value={form.shopping_nome} onChange={(e) => set("shopping_nome", e.target.value)} placeholder="Ex: Carioca Shopping - Loja 234" className={inputCls} />
              </div>
            )}
            {form.local_entrega === "OUTRO" && (
              <div className="col-span-2">
                <p className={labelCls}>Detalhes do local</p>
                <input value={form.local_detalhes} onChange={(e) => set("local_detalhes", e.target.value)} placeholder="Ex: Escritório, recepção do prédio..." className={inputCls} />
              </div>
            )}
            {modoSimples && (
              <div className="col-span-2 md:col-span-3 space-y-3 border-t border-[#E5E5EA] pt-3 mt-1">
                <p className={labelCls}>Produto (texto livre)</p>
                <input value={produtos[0] || ""} onChange={(e) => setProdutos([e.target.value])} placeholder="Ex: iPhone 15 128GB Preto" className={inputCls} />
                <p className={labelCls}>Transportadora / Tipo</p>
                <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)} className={inputCls}>
                  <option value="CORREIOS">Correios</option>
                  <option value="TRANSPORTADORA">Transportadora</option>
                  <option value="MOTOBOY">Motoboy externo</option>
                  <option value="OUTRO">Outro</option>
                </select>
                <p className={labelCls}>Código de rastreio (opcional)</p>
                <input value={rastreio} onChange={(e) => setRastreio(e.target.value)} placeholder="Ex: BR123456789BR" className={inputCls} />
              </div>
            )}
            {!modoSimples && (<>
            {/* Produto — seleção do estoque ou manual */}
            <div className="col-span-2 md:col-span-3 space-y-3 border-t border-[#E5E5EA] pt-3 mt-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Produto</p>
                <button onClick={() => { setProdutoManual(!produtoManual); if (!produtoManual) { setCatSel(""); setEstoqueId(""); } }} className="text-xs text-[#E8740E] font-medium hover:underline">
                  {produtoManual ? "📋 Selecionar do estoque" : "✏️ Digitar manual"}
                </button>
              </div>

              {produtoManual ? (
                /* Modo manual — texto livre */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {produtos.map((prod, idx) => (
                    <div key={idx} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <input value={prod} onChange={(e) => { const np = [...produtos]; np[idx] = e.target.value; setProdutos(np); }} placeholder="Ex: iPhone 17 256GB Lavanda" className={inputCls} />
                      </div>
                      {idx > 0 && <button onClick={() => setProdutos(produtos.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 text-lg">✕</button>}
                    </div>
                  ))}
                  <button onClick={() => setProdutos([...produtos, ""])} className="text-xs text-[#E8740E] font-medium hover:underline">+ Adicionar produto</button>
                </div>
              ) : (
                /* Picker igual ao gerar-link — categoria + lista de preços + cor */
                <div className="space-y-3">
                  <select value={catSel} onChange={(e) => { setCatSel(e.target.value); setProdutos([""]); set("valor", ""); setCorSel(""); }} className={inputCls}>
                    <option value="">-- Categoria --</option>
                    {categoriaPrecos.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
                  </select>
                  {catSel && (
                    <div className="max-h-[300px] overflow-y-auto rounded-xl border border-[#D2D2D7] divide-y divide-[#E5E5EA]">
                      {produtosFiltradosPreco.length === 0 && <p className="text-xs text-center text-[#86868B] py-4">Nenhum produto</p>}
                      {produtosFiltradosPreco.map((m) => {
                        const sel = produtos[0] === m.nome;
                        return (
                          <div key={m.nome}>
                            <button onClick={() => {
                              if (sel) { setProdutos([""]); set("valor", ""); setCorSel(""); return; }
                              setProdutos([m.nome]);
                              set("valor", String(m.preco));
                              setCorSel("");
                            }} className={`w-full px-4 py-3 flex items-center justify-between text-left transition-all ${sel ? "bg-[#FFF5EB] border-l-4 border-[#E8740E]" : "hover:bg-[#F9F9FB]"}`}>
                              <p className={`text-sm font-semibold ${sel ? "text-[#E8740E]" : "text-[#1D1D1F]"}`}>{m.nome}</p>
                              <p className={`text-sm font-bold ${sel ? "text-[#E8740E]" : "text-[#1D1D1F]"}`}>R$ {m.preco.toLocaleString("pt-BR")}</p>
                            </button>
                            {sel && coresDisponiveis.length > 0 && (
                              <div className="px-4 py-3 bg-[#FAFAFA] border-t border-[#E5E5EA]">
                                <p className="text-xs font-medium mb-2 text-[#86868B]">Selecione a cor:</p>
                                <div className="flex flex-wrap gap-2">
                                  {coresDisponiveis.map(cor => (
                                    <button key={cor} onClick={() => setCorSel(corSel === cor ? "" : cor)}
                                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${corSel === cor ? "bg-[#E8740E] text-white border-[#E8740E]" : "bg-white text-[#1D1D1F] border-[#D2D2D7] hover:border-[#E8740E]"}`}
                                    >{cor}</button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Produto 2 — opcional (add-on do origin/main) */}
                  {!showProduto2 && produtos[0] && (
                    <button
                      type="button"
                      onClick={() => setShowProduto2(true)}
                      className="w-full mt-2 px-4 py-2 rounded-xl border-2 border-dashed border-[#E8740E] text-[#E8740E] text-sm font-semibold hover:bg-[#FFF5EB] transition-colors"
                    >
                      + Adicionar 2º produto
                    </button>
                  )}
                  {showProduto2 && (
                    <div className="mt-3 p-3 rounded-xl bg-[#F9F9FB] border border-[#D2D2D7] space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Produto 2</p>
                        <button
                          type="button"
                          onClick={() => {
                            setShowProduto2(false);
                            setCatSel2("");
                            setModelo2("");
                            setCor2("");
                            setPreco2(0);
                          }}
                          className="text-xs text-red-400 hover:text-red-600 font-semibold"
                        >
                          ✕ Remover
                        </button>
                      </div>
                      <select value={catSel2} onChange={(e) => { setCatSel2(e.target.value); setModelo2(""); setPreco2(0); setCor2(""); }} className={inputCls}>
                        <option value="">-- Categoria --</option>
                        {categoriaPrecos.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
                      </select>
                      {catSel2 && (
                        <div className="max-h-[280px] overflow-y-auto rounded-xl border border-[#D2D2D7] divide-y divide-[#E5E5EA]">
                          {produtosFiltradosPreco2.length === 0 && <p className="text-xs text-center text-[#86868B] py-4">Nenhum produto</p>}
                          {produtosFiltradosPreco2.map((m) => {
                            const sel = modelo2 === m.nome;
                            return (
                              <div key={m.nome}>
                                <button type="button" onClick={() => {
                                  if (sel) { setModelo2(""); setPreco2(0); setCor2(""); return; }
                                  setModelo2(m.nome);
                                  setPreco2(m.preco);
                                  setCor2("");
                                }} className={`w-full px-4 py-3 flex items-center justify-between text-left transition-all ${sel ? "bg-[#FFF5EB] border-l-4 border-[#E8740E]" : "hover:bg-[#F9F9FB]"}`}>
                                  <p className={`text-sm font-semibold ${sel ? "text-[#E8740E]" : "text-[#1D1D1F]"}`}>{m.nome}</p>
                                  <p className={`text-sm font-bold ${sel ? "text-[#E8740E]" : "text-[#1D1D1F]"}`}>R$ {m.preco.toLocaleString("pt-BR")}</p>
                                </button>
                                {sel && coresDisponiveis2.length > 0 && (
                                  <div className="px-4 py-3 bg-[#FAFAFA] border-t border-[#E5E5EA]">
                                    <p className="text-xs font-medium mb-2 text-[#86868B]">Selecione a cor:</p>
                                    <div className="flex flex-wrap gap-2">
                                      {coresDisponiveis2.map(cor => (
                                        <button key={cor} type="button" onClick={() => setCor2(cor2 === cor ? "" : cor)}
                                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${cor2 === cor ? "bg-[#E8740E] text-white border-[#E8740E]" : "bg-white text-[#1D1D1F] border-[#D2D2D7] hover:border-[#E8740E]"}`}
                                        >{cor}</button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Desconto */}
            <div>
              <p className={labelCls}>Desconto (R$)</p>
              <input type="number" value={desconto} onChange={(e) => setDesconto(e.target.value)} placeholder="0" className={inputCls} />
            </div>
            {(descontoNum > 0 || trocaNum > 0) && valorBase > 0 && (
              <div className="col-span-2 md:col-span-3 p-3 rounded-xl bg-[#FFF8F0] border border-[#F5D5B0]">
                <div className="flex flex-wrap gap-4 text-sm">
                  <span>Valor Base: <b>R$ {valorBase.toLocaleString("pt-BR")}</b></span>
                  {descontoNum > 0 && <span className="text-red-500">Desconto: <b>-R$ {descontoNum.toLocaleString("pt-BR")}</b></span>}
                  {trocaNum > 0 && <span className="text-green-600">Troca: <b>-R$ {trocaNum.toLocaleString("pt-BR")}</b></span>}
                  <span className="text-[#E8740E] font-bold">A pagar: R$ {valorAPagar.toLocaleString("pt-BR")}</span>
                </div>
              </div>
            )}
            <div>
              <p className={labelCls}>Tipo</p>
              <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)} className={inputCls}>
                <option value="">-- Selecionar --</option>
                <option value="VENDA NORMAL">Venda Normal</option>
                <option value="UPGRADE">Upgrade</option>
              </select>
            </div>
            {/* Produto na Troca */}
            <div className="col-span-2 md:col-span-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={trocaAtiva} onChange={(e) => { setTrocaAtiva(e.target.checked); if (!e.target.checked) { setTrocaValor(""); setTrocaProduto(""); setTrocaCor(""); setTrocaBateria(""); setTrocaObs(""); set("tipo", "VENDA NORMAL"); } else { set("tipo", "UPGRADE"); } }} className="w-4 h-4 accent-[#E8740E]" />
                <span className="text-sm font-semibold">🔄 Produto na troca?</span>
              </label>
            </div>
            {trocaAtiva && (
              <div className="col-span-2 md:col-span-3 p-3 rounded-xl border border-green-200 bg-green-50 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <p className={labelCls}>Produto do cliente</p>
                    <input value={trocaProduto} onChange={(e) => setTrocaProduto(e.target.value)} placeholder="Ex: iPhone 15 Pro Max 256GB" className={inputCls} />
                  </div>
                  <div>
                    <p className={labelCls}>Valor Avaliação (R$)</p>
                    <input type="number" value={trocaValor} onChange={(e) => setTrocaValor(e.target.value)} placeholder="0" className={inputCls} />
                  </div>
                  <div>
                    <p className={labelCls}>Cor</p>
                    <input value={trocaCor} onChange={(e) => setTrocaCor(e.target.value)} placeholder="Ex: Preto" className={inputCls} />
                  </div>
                  <div>
                    <p className={labelCls}>Bateria (%)</p>
                    <input type="number" value={trocaBateria} onChange={(e) => setTrocaBateria(e.target.value)} placeholder="Ex: 92" className={inputCls} />
                  </div>
                  <div>
                    <p className={labelCls}>Observação</p>
                    <input value={trocaObs} onChange={(e) => setTrocaObs(e.target.value)} placeholder="Ex: Sem marcas, com caixa" className={inputCls} />
                  </div>
                </div>
                {trocaNum > 0 && valorBase > 0 && (
                  <p className="text-sm font-bold text-[#E8740E]">Diferença a pagar: R$ {valorAPagar.toLocaleString("pt-BR")}</p>
                )}
              </div>
            )}
            {/* Valor a pagar (CONGELADO — base - desconto - troca) */}
            <div className="col-span-2 md:col-span-3 rounded-xl border-2 border-[#E8740E] bg-[#FFF7ED] px-4 py-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#E8740E]">💰 Valor a Pagar (congelado)</p>
                  <p className="text-2xl font-bold text-[#1D1D1F]">R$ {valorAPagar.toLocaleString("pt-BR")}</p>
                  {(descontoNum > 0 || trocaNum > 0) && (
                    <p className="text-[10px] text-[#86868B] mt-1">
                      Base R$ {valorBase.toLocaleString("pt-BR")}
                      {descontoNum > 0 && <> − Desc R$ {descontoNum.toLocaleString("pt-BR")}</>}
                      {trocaNum > 0 && <> − Troca R$ {trocaNum.toLocaleString("pt-BR")}</>}
                    </p>
                  )}
                </div>
                <p className="text-[10px] text-[#86868B] max-w-[260px] text-right">
                  Esse é o valor que o cliente vai pagar. Abaixo, divida em Pagamento 1 e Pagamento 2.
                </p>
              </div>
            </div>

            {/* PAGAMENTO 1 */}
            <div className="col-span-2 md:col-span-3 rounded-xl border border-[#D2D2D7] bg-white px-4 py-3 space-y-3">
              <p className="text-sm font-bold text-[#1D1D1F]">💳 Pagamento 1</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <p className={labelCls}>Forma</p>
                  <select value={form.forma_pagamento} onChange={(e) => set("forma_pagamento", e.target.value)} className={inputCls}>
                    <option value="">-- Selecionar --</option>
                    <option value="Pix">Pix</option>
                    <option value="Cartao Credito">Cartão Crédito</option>
                    <option value="Cartao Debito">Cartão Débito</option>
                    <option value="Especie">Espécie</option>
                    <option value="Link de Pagamento">Link de Pagamento</option>
                    <option value="Transferencia">Transferência</option>
                    <option value="Definir depois">Definir depois</option>
                  </select>
                </div>
                <div>
                  <p className={labelCls}>Valor R$</p>
                  <input
                    type="number"
                    value={valorPag1Override || (valorPag1 > 0 ? String(valorPag1) : "")}
                    onChange={(e) => setValorPag1Override(e.target.value)}
                    placeholder={valorAPagar > 0 ? String(valorAPagar) : "0"}
                    className={inputCls}
                  />
                  {valorPag1Override && (
                    <button
                      type="button"
                      onClick={() => setValorPag1Override("")}
                      className="text-[10px] text-[#E8740E] hover:underline mt-1"
                    >
                      ↺ Voltar pro automático
                    </button>
                  )}
                </div>
                {(form.forma_pagamento === "Cartao Credito" || form.forma_pagamento === "Cartao Debito" || form.forma_pagamento === "Link de Pagamento") && (
                  <>
                    <div>
                      <p className={labelCls}>Parcelas {form.forma_pagamento === "Link de Pagamento" && <span className="text-[10px] text-[#86868B]">(máx. 12x)</span>}</p>
                      <select value={form.parcelas} onChange={(e) => set("parcelas", e.target.value)} className={inputCls}>
                        <option value="">—</option>
                        {(form.forma_pagamento === "Link de Pagamento" ? [1,2,3,4,5,6,7,8,9,10,11,12] : [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]).map(n => <option key={n} value={String(n)}>{n}x</option>)}
                      </select>
                    </div>
                    <div>
                      <p className={labelCls}>Máquina</p>
                      <select value={form.maquina} onChange={(e) => set("maquina", e.target.value)} className={inputCls}>
                        <option value="">-- Selecionar --</option>
                        <option value="ITAU">Itaú</option>
                        <option value="INFINITE">Infinite</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
              {/* Breakdown automático da parcela — aplica ao valor do pagamento 1 */}
              {isCartaoCredito && nParcelas > 0 && valorPag1 > 0 && (
                <div className="bg-[#FFF8F0] border border-[#E8740E]/30 rounded-lg px-3 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-[#86868B]">Valor a parcelar: <b className="text-[#1D1D1F]">R$ {valorPag1.toLocaleString("pt-BR")}</b></span>
                    <span className="text-red-500">Taxa {form.forma_pagamento === "Link de Pagamento" ? "link" : "cartão"} ({taxaAtual}%): <b>+R$ {(totalComTaxa - valorPag1).toLocaleString("pt-BR")}</b></span>
                    <span className="text-[#86868B]">Total c/ taxa: <b className="text-[#1D1D1F]">R$ {totalComTaxa.toLocaleString("pt-BR")}</b></span>
                    <span className="text-[#E8740E] font-bold">{nParcelas}x de R$ {valorParcela.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}
            </div>

            {/* PAGAMENTO 2 (opcional) */}
            {!showPagAlt && (
              <div className="col-span-2 md:col-span-3">
                <button
                  type="button"
                  onClick={() => setShowPagAlt(true)}
                  className="w-full px-4 py-2 rounded-xl border-2 border-dashed border-[#86868B] text-[#86868B] text-sm font-semibold hover:border-[#E8740E] hover:text-[#E8740E] transition-colors"
                >
                  + Adicionar Pagamento 2 (dividir pagamento)
                </button>
              </div>
            )}
            {showPagAlt && (
              <div className="col-span-2 md:col-span-3 rounded-xl border border-[#D2D2D7] bg-white px-4 py-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-[#1D1D1F]">💵 Pagamento 2</p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPagAlt(false);
                      set("forma_pagamento_2", "");
                      set("valor_2", "");
                    }}
                    className="text-xs text-red-400 hover:text-red-600 font-semibold"
                  >
                    ✕ Remover
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className={labelCls}>Forma</p>
                    <select value={form.forma_pagamento_2} onChange={(e) => set("forma_pagamento_2", e.target.value)} className={inputCls}>
                      <option value="">-- Selecionar --</option>
                      <option value="Pix">Pix</option>
                      <option value="Cartao Credito">Cartão Crédito</option>
                      <option value="Especie">Espécie</option>
                      <option value="Link de Pagamento">Link</option>
                      <option value="Transferencia">Transferência</option>
                    </select>
                  </div>
                  <div>
                    <p className={labelCls}>Valor R$</p>
                    <input type="number" value={form.valor_2} onChange={(e) => set("valor_2", e.target.value)} placeholder="0" className={inputCls} />
                  </div>
                </div>
              </div>
            )}

            {/* Validador da soma dos pagamentos */}
            {(valorPag1 > 0 || valorPag2 > 0) && valorAPagar > 0 && (() => {
              const soma = valorPag1 + valorPag2;
              const diff = soma - valorAPagar;
              const ok = Math.abs(diff) < 1;
              return (
                <div className={`col-span-2 md:col-span-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
                  <span>{ok ? "✅" : "⚠️"}</span>
                  <span>
                    Pagamento 1: <b>R$ {valorPag1.toLocaleString("pt-BR")}</b>
                    {valorPag2 > 0 && <> + Pagamento 2: <b>R$ {valorPag2.toLocaleString("pt-BR")}</b></>}
                    {" = "}<b>R$ {soma.toLocaleString("pt-BR")}</b>
                    {" · "}Valor a pagar: <b>R$ {valorAPagar.toLocaleString("pt-BR")}</b>
                    {!ok && <> · <b>Divergência R$ {Math.abs(diff).toLocaleString("pt-BR")}</b> {diff > 0 ? "a mais" : "a menos"}</>}
                  </span>
                </div>
              );
            })()}
            <div>
              <p className={labelCls}>Vendedor</p>
              <select value={form.vendedor} onChange={(e) => set("vendedor", e.target.value)} className={inputCls}>
                <option value="">-- Selecionar --</option>
                <option value="Andre">Andre</option>
                <option value="Bianca">Bianca</option>
              </select>
            </div>
            </>)}
            <div>
              <p className={labelCls}>Data da Entrega</p>
              <input type="date" value={form.data_entrega} onChange={(e) => set("data_entrega", e.target.value)} className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Horario</p>
              <select value={form.horario} onChange={(e) => set("horario", e.target.value)} className={inputCls}>
                <option value="">-- Definir --</option>
                <option value="MANHA">Manha (ate 12h)</option>
                <option value="TARDE">Tarde (12h-18h)</option>
                <option value="NOITE">Noite (apos 18h)</option>
                <option value="09:00">09:00</option>
                <option value="10:00">10:00</option>
                <option value="11:00">11:00</option>
                <option value="12:00">12:00</option>
                <option value="13:00">13:00</option>
                <option value="14:00">14:00</option>
                <option value="15:00">15:00</option>
                <option value="16:00">16:00</option>
                <option value="17:00">17:00</option>
                <option value="18:00">18:00</option>
                <option value="19:00">19:00</option>
                <option value="20:00">20:00</option>
              </select>
            </div>
            <div>
              <p className={labelCls}>Motoboy / Entregador</p>
              <select
                value={
                  form.entregador === "IGOR" || form.entregador === "LEANDRO" ||
                  form.entregador === "RETIRADA" || form.entregador === "CORREIOS" ||
                  form.entregador === "" ? form.entregador : "OUTRO"
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "OUTRO") {
                    // mantém o texto livre caso já exista, senão limpa para o usuário digitar
                    if (["IGOR","LEANDRO","RETIRADA","CORREIOS",""].includes(form.entregador)) {
                      set("entregador", " ");
                    }
                  } else {
                    set("entregador", v);
                  }
                }}
                className={inputCls}
              >
                <option value="">-- Selecionar --</option>
                <option value="IGOR">🛵 Igor</option>
                <option value="LEANDRO">🛵 Leandro</option>
                <option value="RETIRADA">🏬 Retirada em loja</option>
                <option value="CORREIOS">📦 Correios</option>
                <option value="OUTRO">✏️ Outro (digitar)</option>
              </select>
              {!["IGOR","LEANDRO","RETIRADA","CORREIOS",""].includes(form.entregador) && (
                <input
                  value={form.entregador}
                  onChange={(e) => set("entregador", e.target.value)}
                  placeholder="Nome do entregador"
                  className={`${inputCls} mt-1`}
                />
              )}
            </div>
            <div className="col-span-2 md:col-span-3">
              <p className={labelCls}>Observacao</p>
              <input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} placeholder="Detalhes, instrucoes..." className={inputCls} />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCopyWhatsApp}
              className="flex-1 py-3 rounded-xl bg-green-500 text-white font-semibold hover:bg-green-600 transition-colors text-sm"
            >
              {copied ? "Copiado!" : "📋 Copiar para WhatsApp"}
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
            >
              {saving ? "Salvando..." : editingEntregaId ? "Salvar Alterações" : "Agendar Entrega"}
            </button>
          </div>
        </div>
      )}

      {/* Navegacao de semana */}
      <div className="flex items-center justify-between bg-white border border-[#D2D2D7] rounded-xl px-4 py-3">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#86868B] border border-[#D2D2D7] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors"
        >
          ← Anterior
        </button>
        <div className="text-center">
          <button
            onClick={() => setWeekOffset(0)}
            className={`text-sm font-bold transition-colors ${weekOffset === 0 ? "text-[#E8740E]" : "text-[#1D1D1F] hover:text-[#E8740E] cursor-pointer"}`}
          >
            {weekOffset === 0 ? "Semana Atual" : `Semana ${weekOffset > 0 ? "+" : ""}${weekOffset}`}
          </button>
          <p className="text-[10px] text-[#86868B]">
            {formatDateBR(from)} a {formatDateBR(to)}
          </p>
        </div>
        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#86868B] border border-[#D2D2D7] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors"
        >
          Proxima →
        </button>
      </div>

      {/* Filtros Bia */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wider">Filtro:</span>
        {([
          { key: "todas", label: "Todas" },
          { key: "pendentes_final", label: "⏳ Pendentes de finalizar" },
          { key: "finalizada", label: "✅ Finalizadas" },
          { key: "sem_comprovante", label: "📄 Sem comprovante" },
          { key: "comprovante", label: "🧾 Com comprovante" },
        ] as const).map((f) => (
          <button key={f.key} onClick={() => setFiltroBia(f.key)}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${filtroBia === f.key ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#98989D] hover:bg-[#3A3A3C]" : "bg-[#F5F5F7] text-[#86868B] hover:bg-[#E5E5EA]"}`}>
            {f.label}
          </button>
        ))}
        <button
          onClick={() => { setModoSelecao(!modoSelecao); setEntregasSelecionadas(new Set()); }}
          className={`ml-auto px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${modoSelecao ? "bg-blue-500 text-white" : "bg-white border border-[#D2D2D7] text-[#1D1D1F] hover:border-blue-400"}`}
        >
          {modoSelecao ? "✖️ Sair da seleção" : "☑️ Selecionar várias"}
        </button>
      </div>

      {modoSelecao && entregasSelecionadas.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200">
          <span className="text-sm font-semibold text-blue-700">{entregasSelecionadas.size} selecionada{entregasSelecionadas.size > 1 ? "s" : ""}</span>
          <button
            onClick={async () => {
              if (!confirm(`Finalizar ${entregasSelecionadas.size} entregas?`)) return;
              const ids = Array.from(entregasSelecionadas);
              for (const id of ids) {
                await fetch("/api/admin/entregas", {
                  method: "PATCH",
                  headers: apiHeaders({ "Content-Type": "application/json" }),
                  body: JSON.stringify({ id, finalizada: true, status: "ENTREGUE" }),
                });
              }
              setEntregasSelecionadas(new Set());
              setModoSelecao(false);
              fetchEntregas();
            }}
            className="px-3 py-1 rounded-lg bg-green-500 text-white text-xs font-bold hover:bg-green-600"
          >
            ✅ Finalizar selecionadas
          </button>
          <button
            onClick={async () => {
              if (!confirm(`Marcar comprovante lançado em ${entregasSelecionadas.size} entregas?`)) return;
              const ids = Array.from(entregasSelecionadas);
              for (const id of ids) {
                await fetch("/api/admin/entregas", {
                  method: "PATCH",
                  headers: apiHeaders({ "Content-Type": "application/json" }),
                  body: JSON.stringify({ id, comprovante_lancado: true }),
                });
              }
              setEntregasSelecionadas(new Set());
              setModoSelecao(false);
              fetchEntregas();
            }}
            className="px-3 py-1 rounded-lg bg-blue-500 text-white text-xs font-bold hover:bg-blue-600"
          >
            🧾 Marcar comprovante
          </button>
          <button
            onClick={() => setEntregasSelecionadas(new Set())}
            className="ml-auto text-xs text-blue-700 hover:underline"
          >
            Limpar seleção
          </button>
        </div>
      )}

      {/* Navegação de modo (Dia / Semana) */}
      {!loading && (
        <div className="bg-white border border-[#D2D2D7] rounded-xl p-3 flex flex-wrap items-center gap-2">
          {/* Toggle modo */}
          <div className="flex gap-1 bg-[#F5F5F7] rounded-lg p-1">
            <button
              onClick={() => { setViewMode("dia"); setViewDate(hojeBR()); }}
              className={`px-3 py-1 rounded-md text-xs font-bold transition ${viewMode === "dia" ? "bg-[#E8740E] text-white" : "text-[#86868B] hover:text-[#1D1D1F]"}`}
            >
              📅 Dia
            </button>
            <button
              onClick={() => setViewMode("semana")}
              className={`px-3 py-1 rounded-md text-xs font-bold transition ${viewMode === "semana" ? "bg-[#E8740E] text-white" : "text-[#86868B] hover:text-[#1D1D1F]"}`}
            >
              🗓️ Semana
            </button>
          </div>

          {viewMode === "dia" && (
            <>
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => {
                    const d = new Date(viewDate + "T12:00:00");
                    d.setDate(d.getDate() - 1);
                    setViewDate(d.toISOString().split("T")[0]);
                  }}
                  className="px-2 py-1 rounded-md text-xs font-bold bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#1D1D1F]"
                >
                  ← Ontem
                </button>
                <button
                  onClick={() => setViewDate(hojeBR())}
                  className={`px-3 py-1 rounded-md text-xs font-bold ${viewDate === hojeBR() ? "bg-[#E8740E] text-white" : "bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#1D1D1F]"}`}
                >
                  Hoje
                </button>
                <button
                  onClick={() => {
                    const d = new Date(viewDate + "T12:00:00");
                    d.setDate(d.getDate() + 1);
                    setViewDate(d.toISOString().split("T")[0]);
                  }}
                  className="px-2 py-1 rounded-md text-xs font-bold bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#1D1D1F]"
                >
                  Amanhã →
                </button>
              </div>
              <input
                type="date"
                value={viewDate}
                onChange={(e) => setViewDate(e.target.value)}
                className="ml-2 px-2 py-1 rounded-md text-xs border border-[#D2D2D7] bg-white"
              />
              <span className="ml-auto text-xs text-[#86868B]">
                {(() => {
                  const d = new Date(viewDate + "T12:00:00");
                  const weekday = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"][d.getDay()];
                  return `${weekday}, ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
                })()}
              </span>
            </>
          )}
        </div>
      )}

      {/* VIEW: DIA (com swimlanes por motoboy) */}
      {!loading && viewMode === "dia" && (() => {
        const filtered = entregas.filter((e) => e.data_entrega === viewDate).filter((e) => {
          if (filtroBia === "finalizada") return e.finalizada === true;
          if (filtroBia === "pendentes_final") return e.finalizada !== true;
          if (filtroBia === "comprovante") return e.comprovante_lancado === true;
          if (filtroBia === "sem_comprovante") return e.comprovante_lancado !== true;
          return true;
        });
        filtered.sort((a, b) => (a.horario || "ZZZ").localeCompare(b.horario || "ZZZ"));

        const isFutureOrPast = viewDate !== hojeBR();

        // Agrupa por motoboy
        const aguardando = filtered.filter((e) => !e.entregador || e.entregador.trim() === "");
        const igor = filtered.filter((e) => (e.entregador || "").toUpperCase() === "IGOR");
        const leandro = filtered.filter((e) => (e.entregador || "").toUpperCase() === "LEANDRO");
        const outras = filtered.filter((e) => {
          const ent = (e.entregador || "").toUpperCase();
          return ent && ent !== "IGOR" && ent !== "LEANDRO";
        });

        const renderCard = (e: Entrega) => {
          const sc = STATUS_CONFIG[e.status];
          const isSel = entregasSelecionadas.has(e.id);
          return (
            <button
              key={e.id}
              onClick={() => {
                if (modoSelecao) {
                  const next = new Set(entregasSelecionadas);
                  if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                  setEntregasSelecionadas(next);
                } else {
                  setSelectedEntrega(e);
                }
              }}
              className={`w-full text-left p-3 rounded-lg border transition-all hover:shadow-sm ${isSel ? "ring-2 ring-blue-500 border-blue-500" : `${dm ? sc.borderDark : sc.border} ${dm ? sc.bgDark : sc.bg}`}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span>{sc.icon}</span>
                  {e.horario && <span className={`text-sm font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{e.horario}</span>}
                </div>
                <div className="flex items-center gap-1">
                  {e.finalizada && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500/20 text-green-600">✅</span>}
                  {e.comprovante_lancado && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-600">🧾</span>}
                </div>
              </div>
              <p className={`text-sm font-semibold truncate ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{e.cliente}</p>
              {e.bairro && <p className={`text-[11px] truncate ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{e.bairro}</p>}
              {e.produto && <p className={`text-[11px] truncate ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>🍎 {e.produto}</p>}
            </button>
          );
        };

        const renderColumn = (titulo: string, emoji: string, lista: Entrega[], cor: string) => (
          <div className={`bg-white border rounded-xl overflow-hidden ${cor}`}>
            <div className={`px-3 py-2 text-center border-b ${cor}`}>
              <p className="text-xs font-bold uppercase tracking-wide">
                {emoji} {titulo} <span className="text-[10px] opacity-70">({lista.length})</span>
              </p>
            </div>
            <div className="p-2 space-y-2 min-h-[120px]">
              {lista.length === 0 ? (
                <p className="text-[11px] text-[#B0B0B0] text-center py-6">Sem entregas</p>
              ) : (
                lista.map(renderCard)
              )}
            </div>
          </div>
        );

        // Se for dia futuro/passado: lista simples (sem divisão de motoboy)
        if (isFutureOrPast) {
          return (
            <div className="bg-white border border-[#D2D2D7] rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-[#F5F5F7] border-b border-[#D2D2D7]">
                <p className="text-xs font-bold text-[#86868B] uppercase">
                  {filtered.length} entrega{filtered.length !== 1 ? "s" : ""} agendada{filtered.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="p-3 space-y-2">
                {filtered.length === 0 ? (
                  <p className="text-sm text-[#B0B0B0] text-center py-8">Nenhuma entrega nessa data</p>
                ) : (
                  filtered.map(renderCard)
                )}
              </div>
            </div>
          );
        }

        // Hoje: aguardando (topo) + Igor/Leandro (swimlanes) + outras (baixo)
        return (
          <div className="space-y-3">
            {aguardando.length > 0 && (
              <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-yellow-100 border-b-2 border-yellow-300">
                  <p className="text-xs font-bold text-yellow-800 uppercase">
                    ⏳ Aguardando motoboy ({aguardando.length})
                  </p>
                </div>
                <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {aguardando.map(renderCard)}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {renderColumn("Motoboy Igor", "🛵", igor, "border-blue-300")}
              {renderColumn("Motoboy Leandro", "🛵", leandro, "border-purple-300")}
            </div>
            {outras.length > 0 && (
              <div className="bg-white border border-[#D2D2D7] rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-[#F5F5F7] border-b border-[#D2D2D7]">
                  <p className="text-xs font-bold text-[#86868B] uppercase">
                    📦 Outras ({outras.length}) — Retirada / Correios / Externo
                  </p>
                </div>
                <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {outras.map(renderCard)}
                </div>
              </div>
            )}
            {filtered.length === 0 && (
              <div className="bg-white border border-[#D2D2D7] rounded-xl p-8 text-center">
                <p className="text-sm text-[#86868B]">Nenhuma entrega agendada para hoje</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Calendario semanal */}
      {loading ? (
        <div className="p-8 text-center text-[#86868B]">Carregando...</div>
      ) : viewMode === "semana" ? (
        <>
          {/* Desktop: grid de 6 colunas */}
          <div className="hidden md:grid grid-cols-6 gap-2">
            {days.map((day, idx) => {
              const dateStr = formatDate(day);
              const isToday = dateStr === today;
              const dayEntregas = entregas.filter((e) => e.data_entrega === dateStr).filter((e) => {
                if (filtroBia === "finalizada") return e.finalizada === true;
                if (filtroBia === "pendentes_final") return e.finalizada !== true;
                if (filtroBia === "comprovante") return e.comprovante_lancado === true;
                if (filtroBia === "sem_comprovante") return e.comprovante_lancado !== true;
                return true;
              });
              // Sort by horario
              dayEntregas.sort((a, b) => (a.horario || "ZZZ").localeCompare(b.horario || "ZZZ"));

              return (
                <div
                  key={dateStr}
                  className={`bg-white border rounded-xl overflow-hidden min-h-[200px] ${isToday ? "border-[#E8740E] ring-1 ring-[#E8740E]/30" : "border-[#D2D2D7]"}`}
                >
                  {/* Day header */}
                  <div className={`px-3 py-2 text-center border-b ${isToday ? "bg-[#E8740E] text-white border-[#E8740E]" : "bg-[#F5F5F7] border-[#D2D2D7]"}`}>
                    <p className="text-[10px] font-bold uppercase">{DIAS_SEMANA[idx]}</p>
                    <p className="text-sm font-bold">{day.getDate()}/{String(day.getMonth() + 1).padStart(2, "0")}</p>
                  </div>

                  {/* Entregas */}
                  <div className="p-1.5 space-y-1.5">
                    {dayEntregas.length === 0 && (
                      <p className="text-[10px] text-[#B0B0B0] text-center py-4">Sem entregas</p>
                    )}
                    {dayEntregas.map((e) => {
                      const sc = STATUS_CONFIG[e.status];
                      const isSel = entregasSelecionadas.has(e.id);
                      return (
                        <button
                          key={e.id}
                          onClick={() => {
                            if (modoSelecao) {
                              const next = new Set(entregasSelecionadas);
                              if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                              setEntregasSelecionadas(next);
                            } else {
                              setSelectedEntrega(e);
                            }
                          }}
                          className={`w-full text-left p-2 rounded-lg border transition-all hover:shadow-sm ${isSel ? "ring-2 ring-blue-500 border-blue-500" : `${dm ? sc.borderDark : sc.border} ${dm ? sc.bgDark : sc.bg}`}`}
                        >
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="text-[10px]">{sc.icon}</span>
                            {e.horario && <span className={`text-[10px] font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{e.horario}</span>}
                          </div>
                          <p className={`text-xs font-semibold truncate ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{e.cliente}</p>
                          {e.bairro && <p className={`text-[10px] truncate ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{e.bairro}</p>}
                          <div className="flex items-center gap-1 mt-1">
                            {e.finalizada && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-green-500/20 text-green-600">✅</span>}
                            {e.comprovante_lancado && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-500/20 text-blue-600">🧾</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile: lista vertical por dia */}
          <div className="md:hidden space-y-3">
            {days.map((day, idx) => {
              const dateStr = formatDate(day);
              const isToday = dateStr === today;
              const dayEntregas = entregas.filter((e) => e.data_entrega === dateStr).filter((e) => {
                if (filtroBia === "finalizada") return e.finalizada === true;
                if (filtroBia === "pendentes_final") return e.finalizada !== true;
                if (filtroBia === "comprovante") return e.comprovante_lancado === true;
                if (filtroBia === "sem_comprovante") return e.comprovante_lancado !== true;
                return true;
              });
              dayEntregas.sort((a, b) => (a.horario || "ZZZ").localeCompare(b.horario || "ZZZ"));

              if (dayEntregas.length === 0 && !isToday) return null;

              return (
                <div
                  key={dateStr}
                  className={`bg-white border rounded-xl overflow-hidden ${isToday ? "border-[#E8740E] ring-1 ring-[#E8740E]/30" : "border-[#D2D2D7]"}`}
                >
                  <div className={`px-4 py-2 flex items-center justify-between ${isToday ? "bg-[#E8740E] text-white" : "bg-[#F5F5F7]"}`}>
                    <span className="text-sm font-bold">{DIAS_SEMANA[idx]} {day.getDate()}/{String(day.getMonth() + 1).padStart(2, "0")}</span>
                    <span className={`text-xs ${isToday ? "text-white/80" : "text-[#86868B]"}`}>{dayEntregas.length} entrega{dayEntregas.length !== 1 ? "s" : ""}</span>
                  </div>

                  <div className="p-2 space-y-2">
                    {dayEntregas.length === 0 && (
                      <p className="text-xs text-[#B0B0B0] text-center py-3">Sem entregas</p>
                    )}
                    {dayEntregas.map((e) => {
                      const sc = STATUS_CONFIG[e.status];
                      const isSel = entregasSelecionadas.has(e.id);
                      return (
                        <button
                          key={e.id}
                          onClick={() => {
                            if (modoSelecao) {
                              const next = new Set(entregasSelecionadas);
                              if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                              setEntregasSelecionadas(next);
                            } else {
                              setSelectedEntrega(e);
                            }
                          }}
                          className={`w-full text-left p-3 rounded-lg border transition-all ${isSel ? "ring-2 ring-blue-500 border-blue-500" : `${dm ? sc.borderDark : sc.border} ${dm ? sc.bgDark : sc.bg}`}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span>{sc.icon}</span>
                              <span className={`text-sm font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{e.cliente}</span>
                            </div>
                            {e.horario && <span className="text-xs font-bold text-[#1D1D1F]">{e.horario}</span>}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-[#86868B]">
                            {e.bairro && <span>{e.bairro}</span>}
                            {e.entregador && <span>- {e.entregador}</span>}
                            {e.finalizada && <span className="text-green-600 font-bold">✅</span>}
                            {e.comprovante_lancado && <span className="text-blue-600 font-bold">🧾</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {/* Resumo da semana */}
      {!loading && (
        <div className="bg-white border border-[#D2D2D7] rounded-xl p-4">
          <div className="flex flex-wrap gap-4 justify-center">
            {(["PENDENTE", "SAIU", "ENTREGUE", "CANCELADA"] as const).map((status) => {
              const count = entregas.filter((e) => e.status === status).length;
              const sc = STATUS_CONFIG[status];
              return (
                <div key={status} className="flex items-center gap-2">
                  <span>{sc.icon}</span>
                  <span className={`text-sm font-semibold ${sc.color}`}>{count} {sc.label}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#1D1D1F]">Total: {entregas.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalhes da entrega */}
      {selectedEntrega && (() => {
        const e = selectedEntrega;
        const sc = STATUS_CONFIG[e.status];
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEntrega(null)}>
            <div className={`rounded-2xl w-full max-w-md shadow-xl ${dm ? "bg-[#1C1C1E]" : "bg-white"}`} onClick={(ev) => ev.stopPropagation()}>
              {/* Header */}
              <div className={`px-5 py-4 rounded-t-2xl border-b ${dm ? `${sc.bgDark} ${sc.borderDark}` : `${sc.bg} ${sc.border}`}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{sc.icon}</span>
                    <div>
                      <h3 className={`text-base font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{e.cliente}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <input
                          type="date"
                          defaultValue={e.data_entrega}
                          onBlur={(ev) => {
                            const v = ev.target.value;
                            if (v && v !== e.data_entrega) quickPatchEntrega(e.id, { data_entrega: v });
                          }}
                          className={`text-[11px] px-1.5 py-0.5 rounded border bg-transparent ${dm ? "border-[#3A3A3C] text-[#F5F5F7]" : "border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                        />
                        <input
                          type="time"
                          defaultValue={e.horario || ""}
                          onBlur={(ev) => {
                            const v = ev.target.value;
                            if (v !== (e.horario || "")) quickPatchEntrega(e.id, { horario: v || null });
                          }}
                          className={`text-[11px] px-1.5 py-0.5 rounded border bg-transparent ${dm ? "border-[#3A3A3C] text-[#F5F5F7]" : "border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                        />
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedEntrega(null)} className={`text-lg ${dm ? "text-[#98989D] hover:text-[#F5F5F7]" : "text-[#86868B] hover:text-[#1D1D1F]"}`}>X</button>
                </div>
              </div>

              {/* Flags da Bia */}
              <div className={`px-5 py-3 border-b ${dm ? "border-[#3A3A3C] bg-[#1A1A1C]" : "border-[#E5E5EA] bg-[#FAFAFB]"}`}>
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={e.finalizada === true}
                      onChange={(ev) => quickPatchEntrega(e.id, { finalizada: ev.target.checked })}
                      className="w-4 h-4 accent-green-600 cursor-pointer"
                    />
                    <span className={`text-xs font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>✅ Finalizada</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={e.comprovante_lancado === true}
                      onChange={(ev) => quickPatchEntrega(e.id, { comprovante_lancado: ev.target.checked })}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                    <span className={`text-xs font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>🧾 Comprovante lançado</span>
                  </label>
                </div>
              </div>

              {/* Detalhes */}
              <div className="px-5 py-4 space-y-3">
                {e.telefone && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[#86868B]">Tel:</span>
                    <a href={`tel:${e.telefone}`} className="text-blue-600 font-medium">{e.telefone}</a>
                  </div>
                )}
                {e.endereco && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Endereco: </span>
                    <span className="text-[#1D1D1F]">{e.endereco}</span>
                  </div>
                )}
                {e.bairro && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Bairro: </span>
                    <span className="text-[#1D1D1F] font-medium">{e.bairro}</span>
                  </div>
                )}
                {e.entregador && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Entregador: </span>
                    <span className="text-[#1D1D1F]">{e.entregador}</span>
                  </div>
                )}
                {e.produto && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Produto: </span>
                    <span className="text-[#1D1D1F] font-medium">{e.produto}</span>
                  </div>
                )}
                {e.tipo && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Tipo: </span>
                    <span className="text-[#1D1D1F] font-medium">{e.tipo}</span>
                    {e.detalhes_upgrade && <span className="text-[#86868B]"> — {e.detalhes_upgrade}</span>}
                  </div>
                )}
                {e.forma_pagamento && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Pagamento: </span>
                    <span className="text-[#1D1D1F] font-medium">
                      {formatPagamentoDisplay(e.forma_pagamento, e.valor)}
                    </span>
                  </div>
                )}
                {e.vendedor && (
                  <div className="text-sm">
                    <span className="text-[#86868B]">Vendedor: </span>
                    <span className="text-[#1D1D1F]">{e.vendedor}</span>
                  </div>
                )}
                {e.observacao && (
                  <div className="text-sm p-3 bg-[#F5F5F7] rounded-lg">
                    <span className="text-[#86868B]">Obs: </span>
                    <span className="text-[#1D1D1F]">{e.observacao}</span>
                  </div>
                )}

                {/* Atribuir Motoboy */}
                <div className="pt-2">
                  <p className="text-xs font-bold text-[#86868B] uppercase mb-2">🛵 Atribuir Motoboy</p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: "IGOR", label: "Igor", emoji: "🛵", color: "blue" },
                      { value: "LEANDRO", label: "Leandro", emoji: "🛵", color: "purple" },
                      { value: "RETIRADA", label: "Retirada", emoji: "🏬", color: "gray" },
                      { value: "CORREIOS", label: "Correios", emoji: "📦", color: "gray" },
                    ] as const).map((opt) => {
                      const isActive = (e.entregador || "").toUpperCase() === opt.value;
                      const activeStyle = opt.color === "blue"
                        ? "bg-blue-100 text-blue-700 border-2 border-blue-400"
                        : opt.color === "purple"
                          ? "bg-purple-100 text-purple-700 border-2 border-purple-400"
                          : "bg-gray-100 text-gray-700 border-2 border-gray-400";
                      return (
                        <button
                          key={opt.value}
                          onClick={() => quickPatchEntrega(e.id, { entregador: opt.value })}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                            isActive
                              ? activeStyle
                              : "bg-white border border-[#D2D2D7] text-[#86868B] hover:bg-[#F5F5F7]"
                          }`}
                        >
                          {opt.emoji} {opt.label}
                        </button>
                      );
                    })}
                    {e.entregador && !["IGOR","LEANDRO","RETIRADA","CORREIOS"].includes((e.entregador || "").toUpperCase()) && (
                      <span className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">
                        ✏️ {e.entregador}
                      </span>
                    )}
                    {e.entregador && (
                      <button
                        onClick={() => quickPatchEntrega(e.id, { entregador: null })}
                        className="px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-red-200 text-red-500 hover:bg-red-50"
                        title="Remover motoboy"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                <div className="pt-2">
                  <p className="text-xs font-bold text-[#86868B] uppercase mb-2">Alterar Status</p>
                  <div className="flex flex-wrap gap-2">
                    {(["PENDENTE", "SAIU", "ENTREGUE", "CANCELADA"] as const).map((status) => {
                      const c = STATUS_CONFIG[status];
                      const isActive = e.status === status;
                      return (
                        <button
                          key={status}
                          onClick={() => handleStatusChange(e, status)}
                          disabled={isActive}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                            isActive
                              ? `${c.bg} ${c.color} border-2 ${c.border} opacity-100`
                              : `bg-white border border-[#D2D2D7] text-[#86868B] hover:${c.bg} hover:${c.color} hover:${c.border}`
                          }`}
                        >
                          {c.icon} {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Copiar formulário motoboy */}
                <div className="pt-2 border-t border-[#D2D2D7]">
                  <button
                    onClick={() => {
                      const regiao = e.regiao || e.bairro || "";
                      const isUpgrade = e.tipo === "UPGRADE" || !!e.detalhes_upgrade;
                      const tipoLabel = isUpgrade ? "UPGRADE (Troca)" : "Compra";
                      const msg = [
                        `🛵 *ENTREGA ${regiao.toUpperCase()}* 🛵`,
                        `🛵`,
                        `⏰ *HORÁRIO:* ${e.horario || "A combinar"}`,
                        `📍 *LOCAL:* ${e.endereco || "A definir"} - ${e.bairro || ""}`,
                        `🍎 *PRODUTO:* ${e.produto || ""}`,
                        `‼️ *TIPO:* ${tipoLabel}`,
                        ...(isUpgrade && e.detalhes_upgrade ? [`🔄 *PRODUTO NA TROCA:* ${e.detalhes_upgrade}`] : []),
                        `💵 *PAGAMENTO:* ${formatPagamentoDisplay(e.forma_pagamento, e.valor)}`,
                        `🧑 *CLIENTE:* ${e.cliente || ""}`,
                        `📞 *CONTATO:* ${e.telefone || ""}`,
                        e.observacao ? `OBS: ${e.observacao}` : "",
                        `💼 Vendedor: ${e.vendedor || ""}`,
                        "________________________________",
                      ].filter(Boolean).join("\n");
                      navigator.clipboard.writeText(msg);
                      alert("Formulário copiado! Cole no WhatsApp do motoboy.");
                    }}
                    className="w-full py-2.5 rounded-xl text-center text-sm font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors mb-2"
                  >
                    📋 Copiar Formulário Motoboy
                  </button>
                </div>

                {/* Acoes */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // Carregar dados da entrega no formulário pra editar
                      setForm({
                        cliente: e.cliente || "",
                        telefone: e.telefone || "",
                        endereco: e.endereco || "",
                        endereco_entrega: e.endereco || "",
                        local_detalhes: "",
                        bairro: e.bairro || "",
                        data_entrega: e.data_entrega || hojeBR(),
                        horario: e.horario || "",
                        entregador: e.entregador || "",
                        observacao: e.observacao || "",
                        tipo: e.tipo || "",
                        forma_pagamento: e.forma_pagamento || "",
                        valor: e.valor != null ? String(e.valor) : "",
                        parcelas: "",
                        maquina: "",
                        forma_pagamento_2: "",
                        valor_2: "",
                        vendedor: e.vendedor || "",
                        regiao: e.regiao || "",
                        local_entrega: "",
                        shopping_nome: "",
                      });
                      if (e.produto) setProdutos(e.produto.split(" | ").filter(Boolean));
                      if (e.detalhes_upgrade) {
                        setTrocaAtiva(true);
                        const lines = e.detalhes_upgrade.split("\n");
                        setTrocaProduto(lines[0] || "");
                        const corLine = lines.find(l => l.startsWith("Cor:"));
                        if (corLine) setTrocaCor(corLine.replace("Cor:", "").trim());
                        const batLine = lines.find(l => l.startsWith("Bateria:"));
                        if (batLine) setTrocaBateria(batLine.replace("Bateria:", "").replace("%", "").trim());
                        const valLine = lines.find(l => l.startsWith("Avaliação:"));
                        if (valLine) { const m = valLine.match(/[\d.]+/); if (m) setTrocaValor(m[0]); }
                        const obsLine = lines.find(l => !l.startsWith("Cor:") && !l.startsWith("Bateria:") && !l.startsWith("Avaliação:") && lines.indexOf(l) > 0);
                        if (obsLine) setTrocaObs(obsLine);
                      }
                      setProdutoManual(true);
                      setEditingEntregaId(e.id);
                      setShowForm(true);
                      setSelectedEntrega(null);
                    }}
                    className="flex-1 py-2.5 rounded-xl text-center text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                  >
                    ✏️ Editar
                  </button>
                  {e.telefone && (
                    <a
                      href={`https://wa.me/55${e.telefone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2.5 rounded-xl text-center text-sm font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors"
                    >
                      WhatsApp
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(e.id)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
