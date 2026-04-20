"use client";
import { hojeBR } from "@/lib/date-utils";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { getTaxa, calcularLiquido } from "@/lib/taxas";
import { INSTALLMENT_RATES } from "@/lib/calculations";
import { formatProdutoDisplay, getModeloBase, limparNomeProduto } from "@/lib/produto-display";
import { corParaPT } from "@/lib/cor-pt";
import { useVendedores } from "@/lib/vendedores";

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
  entrada?: number | null;
  parcelas?: number | null;
  valor_total?: number | null;
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

// Labels de status adaptados para coleta
function getStatusLabel(status: EntregaStatus, tipo: string | null): string {
  if (tipo === "COLETA") {
    switch (status) {
      case "SAIU": return "Saiu p/ Coleta";
      case "ENTREGUE": return "Coletado";
      default: return STATUS_CONFIG[status]?.label || status;
    }
  }
  return STATUS_CONFIG[status]?.label || status;
}

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

// Tabela de taxas em nível de módulo pra reuso em formatPagamentoDisplay e no form
const TAXAS_PARCELAS_MODULE: Record<number, number> = {
  1: 4, 2: 5, 3: 5.5, 4: 6, 5: 7, 6: 7.5,
  7: 8, 8: 9.1, 9: 10, 10: 11, 11: 12, 12: 13,
  13: 14, 14: 15, 15: 16, 16: 17, 17: 18, 18: 19,
  19: 20, 20: 21, 21: 22,
};

const fmtBRL = (v: number) => `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Formata o campo PAGAMENTO do formulário do motoboy com breakdown detalhado.
 * Produz saida multilinha com bullets (1 item por linha) pra motoboy ler facil.
 *
 * Suporta 3 formatos de forma_pagamento:
 *   1. Legado vendas admin: "Entrada PIX R$ X + 10x no Cartão (Itau)"
 *   2. Link-compras:        "Entrada R$ X via Pix + 10x no Cartão"
 *   3. Verbose com pipes:   "Forma: PIX + Cartão | Entrada PIX: R$ 2.000 | Parcelas: 12x de R$ 329,30 | Total no cartão: R$ 3.951,61"
 *   4. Simples:             "PIX", "Debito", "Cartao Credito 12x"
 *
 * Caso 3 é detectado pela presenca de " | " — quebra direto em bullets.
 * Caso 1/2/4 passa pelo parser antigo.
 */
function formatPagamentoDisplay(
  formaPagamento: string | null,
  valor: number | null,
  valorTotal?: number | null,
  entradaCol?: number | null,
  _parcelasCol?: number | null,
): string {
  if (!formaPagamento) return "—";
  const fp = formaPagamento.trim();

  // Formato verbose com pipes (vendas multi-pagamento) — ja vem estruturado,
  // so quebra em bullets. Um par "Chave: Valor" por linha.
  if (fp.includes(" | ")) {
    const partes = fp.split(" | ").map(s => s.trim()).filter(Boolean);
    return partes.map(p => `   • ${p}`).join("\n");
  }

  const total = Number(valorTotal || valor || 0);
  const entrada = Number(entradaCol || 0);
  // Detecta entrada Pix/Especie/Transferencia
  let labelEntrada = "Entrada";
  if (/via\s+Pix/i.test(fp) || /\+\s*pix/i.test(fp) || /Entrada\s+PIX/i.test(fp)) {
    labelEntrada = "Entrada PIX";
  } else if (/\+\s*esp[eé]cie/i.test(fp) || /via\s+Dinheiro/i.test(fp) || /Entrada\s+Esp[eé]cie/i.test(fp)) {
    labelEntrada = "Entrada Espécie";
  } else if (/\+\s*transfer/i.test(fp)) {
    labelEntrada = "Entrada Transferência";
  }
  // Extrai cartões "Nx no Cartão (MAQ)" — 1 ou 2 ocorrências
  const cartaoRegex = /(\d+)x\s+no\s+(Cart[ãa]o|Link)(?:\s*\(([^)]*)\))?/gi;
  const cartoes: { parcelas: number; maquina: string; tipo: "Cartão" | "Link" }[] = [];
  let m;
  while ((m = cartaoRegex.exec(fp)) !== null) {
    const tipo = /link/i.test(m[2]) ? "Link" : "Cartão" as const;
    let maq = (m[3] || "").trim();
    if (!maq && tipo === "Link") maq = "Mercado Pago";
    cartoes.push({ parcelas: parseInt(m[1]), maquina: maq, tipo });
  }
  const baseCartoes = Math.max(0, total - entrada);
  // Nome resumido da forma (sem "Entrada X R$ Y + Nx no Cartao") — eh so a
  // descricao da forma principal. Se nao conseguiu parsear, mostra fp inteiro.
  const formaResumo = cartoes.length > 0
    ? (entrada > 0 ? `${labelEntrada} + Cartão` : "Cartão")
    : fp;
  const linhas: string[] = [`   • Forma: ${formaResumo}`];
  if (entrada > 0) {
    linhas.push(`   • ${labelEntrada}: ${fmtBRL(entrada)}`);
  }
  if (cartoes.length === 1 && cartoes[0].parcelas > 0) {
    const c = cartoes[0];
    const vParc = baseCartoes / c.parcelas;
    const maqSuffix = c.maquina ? ` (${c.maquina})` : "";
    if (c.parcelas > 1) {
      linhas.push(`   • Parcelas: ${c.parcelas}x de ${fmtBRL(vParc)}${maqSuffix}`);
      linhas.push(`   • Total no cartão: ${fmtBRL(baseCartoes)}`);
    } else {
      linhas.push(`   • ${c.tipo}: ${fmtBRL(baseCartoes)}${maqSuffix}`);
    }
  } else if (cartoes.length === 2) {
    // Dois cartões — aproxima 50/50 na falta de granularidade
    const metade = baseCartoes / 2;
    cartoes.forEach((c, i) => {
      const vParc = c.parcelas > 0 ? metade / c.parcelas : 0;
      const maqSuffix = c.maquina ? ` (${c.maquina})` : "";
      linhas.push(`   • ${c.tipo} ${i + 1}: ${c.parcelas}x de ${fmtBRL(vParc)}${maqSuffix}`);
    });
    linhas.push(`   • Total nos cartões: ${fmtBRL(baseCartoes)}`);
  } else if (cartoes.length === 0 && valor != null) {
    // Sem cartoes detectados (ex: PIX puro)
    linhas.push(`   • Valor: ${fmtBRL(Number(valor))}`);
  }
  return linhas.join("\n");
}

/**
 * Formata o campo PRODUTO do formulário do motoboy.
 *
 * Caso 1: single produto sem " + " → retorna como veio.
 * Caso 2: mesmo produto com specs separados por " + " (ex: "MACBOOK NEO 13"
 *   + 8GB + 256GB Prata") → flatten em uma linha so, usando "/" entre
 *   tokens de storage/RAM adjacentes e espaco no resto. Ex: "MACBOOK NEO
 *   13" 8GB/256GB Prata".
 * Caso 3: produtos diferentes separados por " + " (ex: "MacBook + iPhone")
 *   — detecta quando 2+ partes contem nome de device (iPhone/MacBook/etc).
 *   Quebra em bullets, um por linha.
 */
function formatProdutoMotoboy(produto: string | null | undefined): string {
  if (!produto) return "—";
  const parts = produto.split(" + ").map(s => s.trim()).filter(Boolean);
  if (parts.length <= 1) return produto;

  const deviceRegex = /\b(iphone|macbook|ipad|apple\s*watch|airpods?|mac\s*mini|mac\s*studio|imac)\b/i;
  const devicesCount = parts.filter(p => deviceRegex.test(p)).length;
  if (devicesCount > 1) {
    // Multi-produto real — mantem bullets
    return "\n" + parts.map(p => `   • ${p}`).join("\n");
  }

  // Mesmo produto com specs colados por "+". Junta em linha unica.
  // Separadores: "/" entre tokens que comecam com NUMERO+GB/TB (storage/RAM),
  //              espaco no resto.
  const startsWithStorage = (s: string) => /^\d+\s*(GB|TB)\b/i.test(s);
  let out = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const prev = parts[i - 1];
    const curr = parts[i];
    const sep = startsWithStorage(prev) && startsWithStorage(curr) ? "/" : " ";
    out += sep + curr;
  }
  return out;
}

export default function EntregasPage() {
  const { password, apiHeaders, darkMode: dm } = useAdmin();
  // Lista dinâmica de vendedores (editável em /admin/configuracoes).
  const vendedoresList = useVendedores(password);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState(true);
  // ID pra destacar (vem de /admin/vendas?destacar=XXX ao clicar 'Ver entrega')
  const [destacarId, setDestacarId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("destacar");
    if (id) setDestacarId(id);
  }, []);

  // Quando as entregas carregam E temos um destacarId, rola ate o card e
  // destaca por 3 segundos. Util pra botao 'Ver entrega' em /admin/vendas.
  useEffect(() => {
    if (!destacarId || entregas.length === 0) return;
    const el = document.getElementById(`entrega-${destacarId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-4", "ring-[#E8740E]", "ring-offset-2");
      setTimeout(() => {
        el.classList.remove("ring-4", "ring-[#E8740E]", "ring-offset-2");
      }, 3000);
    }
  }, [destacarId, entregas.length]);
  const [weekOffset, setWeekOffset] = useState(0);
  // Visualização: "dia" (default) mostra um único dia com divisão por motoboy;
  // "semana" mostra o calendário semanal completo (visão geral).
  const [viewMode, setViewMode] = useState<"dia" | "semana">("dia");
  // Data que estamos visualizando no modo "dia" — começa em hoje.
  const [viewDate, setViewDate] = useState<string>(() => hojeBR());
  const [filtroBia, setFiltroBia] = useState<"todas" | "finalizada" | "pendentes_final" | "comprovante" | "sem_comprovante">("todas");
  const [showForm, setShowForm] = useState(false);
  const [modoSimples, setModoSimples] = useState(false);
  const [modoColeta, setModoColeta] = useState(false);
  const [rastreio, setRastreio] = useState("");
  // Campos específicos da coleta (aparelho)
  const [coletaBateria, setColetaBateria] = useState("");
  const [coletaEstado, setColetaEstado] = useState<"A+" | "A" | "AB" | "B" | "">("");
  const [coletaCaixa, setColetaCaixa] = useState<"sim" | "nao" | "">("");
  const [coletaMarcas, setColetaMarcas] = useState("");

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
    taxa_incluida: "",        // "1" = Valor R$ do Pag1 já inclui a taxa do cartão
    forma_pagamento_2: "",
    valor_2: "",
    parcelas_2: "",
    maquina_2: "",
    taxa_incluida_2: "",      // "1" = Valor R$ do Pag2 já inclui a taxa do cartão
    vendedor: "",
    regiao: "",
    local_entrega: "",
    shopping_nome: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [produtos, setProdutos] = useState<string[]>([""]);
  const [trocas, setTrocas] = useState<string[]>([]);
  const [showPagAlt, setShowPagAlt] = useState(false);
  const [horarioLivreForcado, setHorarioLivreForcado] = useState(false);

  // Estoque picker states
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [catSel, setCatSel] = useState("");
  const [serialBusca, setSerialBusca] = useState("");
  const [estoqueId, setEstoqueId] = useState("");
  const [produtoManual, setProdutoManual] = useState(false);
  const [jaPago, setJaPago] = useState(false);
  const [precosVenda, setPrecosVenda] = useState<{ modelo: string; armazenamento: string; preco_pix: number; categoria: string }[]>([]);

  // Carrinho — substitui preco1/preco2/corSel/showProduto2/modelo2/cor2/catSel2
  interface CarrinhoItem {
    key: string;
    nome: string;
    cor: string;
    preco: number;
    categoria: string;
  }
  const [carrinho, setCarrinho] = useState<CarrinhoItem[]>([]);
  const [addingProduct, setAddingProduct] = useState(false);
  const [tempCor, setTempCor] = useState("");
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
  const CAT_LABELS: Record<string, string> = { IPHONE: "iPhones", IPAD: "iPads", MACBOOK: "MacBooks", APPLE_WATCH: "Apple Watch", AIRPODS: "AirPods", ACESSORIOS: "Acessórios", MAC_MINI: "Mac Mini", OUTROS: "Outros", SEMINOVOS: "📱 Seminovos" };
  const temSeminovos = useMemo(() => estoque.some(p => p.tipo === "SEMINOVO" && p.qnt > 0), [estoque]);
  const categoriaPrecos = useMemo(() => {
    const cats = [...new Set(precosVenda.map(p => p.categoria))].sort();
    if (temSeminovos) cats.push("SEMINOVOS");
    return cats;
  }, [precosVenda, temSeminovos]);

  // Lista de seminovos agrupados por modelo base (mesmo padrão do Estoque)
  const seminovosList = useMemo(() => {
    type Item = { nome: string; key: string; items: EstoqueItem[] };
    const groups = new Map<string, Item>();
    for (const p of estoque) {
      if (p.tipo !== "SEMINOVO" || p.qnt <= 0) continue;
      const baseKey = getModeloBase(p.produto, p.categoria);
      const nome = formatProdutoDisplay({ produto: p.produto, categoria: p.categoria, cor: null, observacao: null }).toUpperCase();
      if (!groups.has(baseKey)) groups.set(baseKey, { nome, key: baseKey, items: [] });
      groups.get(baseKey)!.items.push(p);
    }
    return [...groups.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [estoque]);

  // Produtos filtrados por categoria
  const produtosFiltradosPreco = useMemo(() => {
    if (!catSel) return [];
    return precosVenda
      .filter(p => p.categoria === catSel)
      .map(p => ({ nome: `${p.modelo} ${p.armazenamento}`.trim(), preco: p.preco_pix }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [precosVenda, catSel]);

  // Cores cadastradas no catálogo global (Configurações > Produtos > aba Cores)
  const [catalogoCores, setCatalogoCores] = useState<Record<string, string[]>>({});
  useEffect(() => {
    fetch("/api/catalogo-cores")
      .then(r => r.json())
      .then(j => { if (j?.modelos) setCatalogoCores(j.modelos); })
      .catch(() => {});
  }, []);

  // Match por tokens entre nome do produto selecionado e modelo do catálogo.
  // Retorna as cores em PT (via corParaPT), dedupadas. Mesma lógica do /gerar-link.
  const coresParaProduto = useMemo(() => (nomeProduto: string): string[] => {
    if (!nomeProduto) return [];
    const normGen = (s: string) => s
      .replace(/(\d+)\s*(ST|ND|RD|TH)\b/gi, "$1")
      .replace(/(\d+)\s*[ºª°]/g, "$1")
      .replace(/\bGENERATION\b/gi, "GEN")
      .replace(/\bGERAÇÃO\b/gi, "GEN");
    const stripNoise = (s: string) => normGen(s)
      .replace(/\b\d+\s*(GB|TB)\b/gi, "")
      .replace(/[""\(\)\+\-]/g, " ")
      .replace(/\s+/g, " ").trim();
    const STOP = new Set(["de","the","with","com","e","a","o","gen"]);
    const expandSynonyms = (toks: string[]): string[] => {
      const set = new Set(toks);
      if (set.has("ipad")) {
        if (set.has("a16")) set.add("11");
        if (set.has("11")) set.add("a16");
        if (set.has("a14")) set.add("10");
        if (set.has("10")) set.add("a14");
      }
      return [...set];
    };
    const tokens = (s: string) => expandSynonyms(stripNoise(s).toLowerCase().split(/\s+/).filter(t => t && !STOP.has(t)));
    const prodTokens = new Set(tokens(nomeProduto));

    let raw: string[] = [];
    let bestCount = 0;
    for (const [nome, cores] of Object.entries(catalogoCores)) {
      const catTokens = tokens(nome);
      if (catTokens.length === 0) continue;
      const allMatch = catTokens.every(t => prodTokens.has(t));
      if (allMatch && catTokens.length > bestCount) {
        raw = cores;
        bestCount = catTokens.length;
      }
    }

    // Dedup por tradução PT (mantém nome PT como label)
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of raw) {
      const pt = corParaPT(c);
      const key = pt.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(pt);
    }
    // Se o nome do produto já contém uma cor/variante, não mostrar seletor
    const CORES_CONHECIDAS = ["black","white","silver","gold","blue","red","green","pink","purple","orange","yellow","titanium","starlight","midnight","natural","preto","branco","prata","dourado","azul","vermelho","verde","rosa","roxo","estelar","meia-noite","milanes","milanês","ocean","alpine","braided","sport"];
    const prodLow = nomeProduto.toLowerCase();
    const jaTemCor = CORES_CONHECIDAS.some(c => prodLow.includes(c));
    if (jaTemCor) return [];

    return out.sort((a, b) => a.localeCompare(b));
  }, [catalogoCores]);

  // Valor base e final
  // Se tiver itens no carrinho (seleção do catálogo), usa a soma. Senão usa o campo manual form.valor.
  const somaProdutos = carrinho.reduce((s, p) => s + p.preco, 0);
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

  // Cálculo de parcelas com taxa embutida — mesma tabela do site de trade-in.
  // Fonte única: INSTALLMENT_RATES em lib/calculations.ts (usada pelo /troca).
  // Ex: [12, 1.13] → 12x tem taxa de 13%. Convertemos multiplicador → percentual.
  const TAXAS_PARCELAS: Record<number, number> = Object.fromEntries(
    INSTALLMENT_RATES.map(([n, rate]) => [n, Math.round((rate - 1) * 1000) / 10])
  );
  const isCartaoCredito = form.forma_pagamento === "Cartao Credito" || form.forma_pagamento === "Link de Pagamento";
  const nParcelas = parseInt(form.parcelas) || 0;
  const taxaAtual = isCartaoCredito && nParcelas > 0 ? (TAXAS_PARCELAS[nParcelas] || 0) : 0;
  // Se taxa_incluida="1", o valorPag1 já vem com taxa embutida — não multiplicamos de novo.
  // Caso contrário, aplica a taxa por cima (comportamento padrão).
  const taxaJaInclusaPag1 = form.taxa_incluida === "1";
  const totalComTaxa = taxaAtual > 0
    ? (taxaJaInclusaPag1 ? valorPag1 : Math.ceil(valorPag1 * (1 + taxaAtual / 100)))
    : valorPag1;
  // Base do Pag1 (valor sem taxa) — quando taxa já está inclusa, deriva dividindo
  const valorPag1Base = taxaJaInclusaPag1 && taxaAtual > 0
    ? Math.round(valorPag1 / (1 + taxaAtual / 100))
    : valorPag1;
  const valorParcela = nParcelas > 0 ? Math.ceil(totalComTaxa / nParcelas) : 0;

  // Pagamento 2 pode ser cartão também — calcula taxa/parcelas separadamente
  const isCartao2 = form.forma_pagamento_2 === "Cartao Credito" || form.forma_pagamento_2 === "Link de Pagamento";
  const nParcelas2 = parseInt(form.parcelas_2) || 0;
  const taxaAtual2 = isCartao2 && nParcelas2 > 0 ? (TAXAS_PARCELAS[nParcelas2] || 0) : 0;
  const taxaJaInclusaPag2 = form.taxa_incluida_2 === "1";
  const totalComTaxa2 = taxaAtual2 > 0
    ? (taxaJaInclusaPag2 ? valorPag2 : Math.ceil(valorPag2 * (1 + taxaAtual2 / 100)))
    : valorPag2;
  const valorPag2Base = taxaJaInclusaPag2 && taxaAtual2 > 0
    ? Math.round(valorPag2 / (1 + taxaAtual2 / 100))
    : valorPag2;
  const valorParcela2 = nParcelas2 > 0 ? Math.ceil(totalComTaxa2 / nParcelas2) : 0;

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  // Regra do André: 1x a 12x = INFINITE | 13x a 21x = ITAU
  const maquinaFromParcelas = (n: number | string): "INFINITE" | "ITAU" | "" => {
    const num = typeof n === "string" ? parseInt(n) : n;
    if (!num || num <= 0) return "";
    if (num <= 12) return "INFINITE";
    if (num <= 21) return "ITAU";
    return "";
  };

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
    const obsQp = qp.get("observacao") || "";
    const obs = obsQp || (diferencaPix ? `Diferença PIX: R$ ${diferencaPix}` : "");
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
      endereco_entrega: endereco || f.endereco_entrega,
      bairro: bairro || f.bairro,
      valor: valor ? String(Math.round(parseFloat(valor))) : f.valor,
      observacao: obs || f.observacao,
    }));
    // Modo coleta via query param (vindo de /admin/estoque pendências)
    const modoQp = qp.get("modo") || "";
    if (modoQp === "coleta") {
      setModoColeta(true);
      setModoSimples(false);
      set("tipo", "COLETA");
      const batQp = qp.get("coleta_bateria") || "";
      const estQp = qp.get("coleta_estado") || "";
      const caixaQp = qp.get("coleta_caixa") || "";
      const marcasQp = qp.get("coleta_marcas") || "";
      if (batQp) setColetaBateria(batQp);
      if (estQp) setColetaEstado(estQp as "A+" | "A" | "AB" | "B" | "");
      if (caixaQp) setColetaCaixa(caixaQp as "sim" | "nao");
      if (marcasQp) setColetaMarcas(marcasQp);
    }
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
    // Auto-buscar endereço do cliente quando nome vem via query params
    if (clienteNome && clienteNome.length >= 2 && password) {
      fetch(`/api/admin/entregas?search_clientes=${encodeURIComponent(clienteNome.trim())}`, { headers: apiHeaders() })
        .then(r => r.json())
        .then(j => {
          const clientes = j.clientes || [];
          // Buscar match exato (case-insensitive)
          const match = clientes.find((s: { cliente: string }) => s.cliente?.toUpperCase() === clienteNome.toUpperCase());
          if (match) {
            if (match.endereco) { set("endereco", match.endereco); set("endereco_entrega", match.endereco); }
            if (match.bairro) set("bairro", match.bairro);
            if (match.regiao) set("regiao", match.regiao);
            if (match.telefone && !clienteTel) set("telefone", match.telefone);
          }
        })
        .catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!form.cliente || !form.data_entrega) {
      setMsg("Preencha cliente e data da entrega");
      return;
    }
    setSaving(true);
    setMsg("");

    const produtosStr = carrinho.length > 0
      ? carrinho.map(p => p.cor ? `${p.nome} ${p.cor}` : p.nome).join(" + ")
      : (produtos.filter(Boolean).join(" + ") || "");
    const trocasStr = trocaAtiva ? [trocaProduto, trocaCor ? `Cor: ${trocaCor}` : "", trocaBateria ? `Bateria: ${trocaBateria}%` : "", trocaObs, trocaValor ? `Avaliação: R$ ${trocaValor}` : ""].filter(Boolean).join("\n") : "";
    const isEdit = !!editingEntregaId;
    // Endereço de entrega final: Shopping → shopping_nome; Outro → local_detalhes; senão endereco_entrega; fallback endereco cadastro
    const enderecoEntregaFinal =
      form.local_entrega === "SHOPPING" && form.shopping_nome?.trim()
        ? form.shopping_nome.trim()
        : form.local_entrega === "OUTRO" && form.local_detalhes?.trim()
        ? form.local_detalhes.trim()
        : (form.endereco_entrega?.trim() || form.endereco?.trim() || "");
    // Forma de pagamento detalhada (embute parcelas/máquina de ambos os pagamentos)
    let formaPagDetalhada = form.forma_pagamento || "";
    if ((form.forma_pagamento === "Cartao Credito" || form.forma_pagamento === "Cartao Debito") && form.parcelas) {
      formaPagDetalhada = `${form.parcelas}x no Cartão${form.maquina ? ` (${form.maquina})` : ""}`;
    } else if (form.forma_pagamento === "Link de Pagamento" && form.parcelas) {
      formaPagDetalhada = `${form.parcelas}x no Link${form.maquina ? ` (${form.maquina})` : ""}`;
    } else if (form.forma_pagamento === "Pix" && form.maquina) {
      formaPagDetalhada = `PIX (${form.maquina})`;
    }
    if (form.forma_pagamento_2 && form.valor_2) {
      if (isCartao2 && form.parcelas_2) {
        formaPagDetalhada += ` + ${form.parcelas_2}x no ${form.forma_pagamento_2 === "Link de Pagamento" ? "Link" : "Cartão"}${form.maquina_2 ? ` (${form.maquina_2})` : ""}`;
      } else {
        formaPagDetalhada += ` + ${form.forma_pagamento_2} R$${form.valor_2}`;
      }
    }
    // Total a pagar incluindo taxa dos dois cartões (se houver)
    const valorTotalFinal = totalComTaxa + totalComTaxa2;
    // Observação — NÃO inclui mais "Endereço cadastro" (motoboy não precisa saber)
    const obsExtras: string[] = [];
    if (form.observacao) obsExtras.push(form.observacao);
    if (descontoNum > 0) obsExtras.push(`Desconto: R$ ${descontoNum}`);
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
        tipo: modoColeta ? "COLETA" : trocaAtiva ? "UPGRADE" : (form.tipo || null),
        detalhes_upgrade: modoColeta
          ? (() => {
              const parts: string[] = [];
              if (coletaBateria) parts.push(`Bateria: ${coletaBateria}%`);
              if (coletaEstado) parts.push(`Estado: ${coletaEstado}`);
              if (coletaCaixa) parts.push(coletaCaixa === "sim" ? "Com caixa" : "Sem caixa");
              if (coletaMarcas) parts.push(coletaMarcas);
              return parts.length ? parts.join("\n") : null;
            })()
          : trocasStr || null,
        forma_pagamento: modoColeta ? null : jaPago ? "JÁ PAGO" : (formaPagDetalhada || null),
        valor: modoColeta ? null : (valorAPagar > 0 ? valorAPagar : (form.valor ? parseFloat(form.valor) : null)),
        // Campos estruturados pra exibicao detalhada no modal.
        // `entrada` guarda Pix/Espécie/Transferência do pagamento 2 (não-cartão) — NÃO incluímos cartão aqui.
        entrada: modoColeta ? null : (form.forma_pagamento_2 && !isCartao2 && form.valor_2 ? parseFloat(form.valor_2) : null),
        parcelas: modoColeta ? null : (form.parcelas ? parseInt(form.parcelas) : null),
        valor_total: modoColeta ? null : (valorTotalFinal > 0 ? valorTotalFinal : (form.valor ? parseFloat(form.valor) : null)),
        vendedor: form.vendedor || null,
        regiao: form.regiao || null,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      setMsg(isEdit ? (modoColeta ? "Coleta atualizada!" : "Entrega atualizada!") : (modoColeta ? "Coleta agendada!" : "Entrega agendada!"));
      setForm({ ...emptyForm, data_entrega: hojeBR() });
      setClienteUltimaCompra(null);
      setProdutos([""]); setTrocas([]); setShowPagAlt(false);
      setCarrinho([]); setAddingProduct(false); setTempCor("");
      setCatSel(""); setEstoqueId("");
      setValorPag1Override("");
      setDesconto(""); setTrocaAtiva(false); setTrocaValor(""); setTrocaProduto(""); setTrocaCor(""); setTrocaBateria(""); setTrocaObs(""); setProdutoManual(false); setSerialBusca("");
      setColetaBateria(""); setColetaEstado(""); setColetaCaixa(""); setColetaMarcas("");
      setEditingEntregaId(null);
      setRastreio("");
      setModoSimples(false);
      setModoColeta(false);
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
    // Aplica logica global: strip origem/E-SIM/[tags], traduz cor EN→PT,
    // dedupe repetidas e simplifica cor composta (Preto Brilhante → Preto).
    const prods = produtos.filter(Boolean).map(p => limparNomeProduto(p));
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

    // Trocas formatadas — aplica mesma limpeza de produto (cor PT, sem regiao, etc)
    const trocasText = trocas.filter(Boolean).map((t, i) => {
      const limpo = limparNomeProduto(t.replace(/\n/g, " / "));
      return trocas.length > 1 ? `${i + 1}. ${limpo}` : limpo;
    }).join("\n   ");

    // formatProdutoDisplay retorna string vazia ou com leading "\n" se multi.
    // Pra single produto, sai na mesma linha do emoji/label. Pra multi, quebra.
    const produtoFormatado = formatProdutoMotoboy(produtoText);
    const produtoLine = produtoFormatado.startsWith("\n")
      ? `🍎 *PRODUTO:*${produtoFormatado}`
      : `🍎 *PRODUTO:* ${produtoFormatado}`;
    // Pagamento — se pagText tem \n (multi-linha) quebra direto; senao inline.
    const pagCompleto = `${pagText}${pagAlt}`;
    const pagLine = pagCompleto.includes("\n")
      ? `💵 *PAGAMENTO:*\n${pagCompleto}`
      : `💵 *PAGAMENTO:* ${pagCompleto}`;
    const lines = [
      `🛵 *ENTREGA ${(form.bairro || "—").toUpperCase()}* 🛵`,
      `🛵`,
      `⏰ *HORÁRIO:* ${form.horario || "—"}`,
      `📍 *LOCAL:* ${form.endereco || "—"} - ${form.bairro || ""}`,
      produtoLine,
      `‼️ *TIPO:* ${tipoLabel}`,
      ...(form.tipo === "UPGRADE" && trocas.filter(Boolean).length > 0 ? [`🔄 *PRODUTO NA TROCA:*\n   ${trocasText}`] : []),
      pagLine,
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
            onClick={() => { setShowForm(!showForm || modoSimples || modoColeta); setModoSimples(false); setModoColeta(false); setMsg(""); }}
            className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors"
          >
            {showForm && !modoSimples ? "Fechar" : "+ Nova Entrega"}
          </button>
          <button
            onClick={() => {
              const willOpen = !(showForm && modoSimples);
              setShowForm(willOpen);
              setModoSimples(willOpen);
              setModoColeta(false);
              if (willOpen && !form.tipo) set("tipo", "CORREIOS");
              setMsg("");
            }}
            className="px-4 py-2 rounded-xl border-2 border-[#E8740E] text-[#E8740E] text-sm font-semibold hover:bg-[#FFF5EB] transition-colors"
          >
            {showForm && modoSimples ? "Fechar" : "📮 Entrega Simplificada"}
          </button>
          <button
            onClick={() => {
              const willOpen = !(showForm && modoColeta);
              setShowForm(willOpen);
              setModoColeta(willOpen);
              setModoSimples(false);
              if (willOpen) set("tipo", "COLETA");
              setMsg("");
            }}
            className="px-4 py-2 rounded-xl border-2 border-green-600 text-green-600 text-sm font-semibold hover:bg-green-50 transition-colors"
          >
            {showForm && modoColeta ? "Fechar" : "🛵 Agendar Coleta"}
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
              <h2 className="text-sm font-bold text-[#1D1D1F]">{editingEntregaId ? (form.tipo === "COLETA" ? "✏️ Editar Coleta" : "✏️ Editar Entrega") : modoColeta ? "🛵 Agendar Coleta" : modoSimples ? "📮 Nova Entrega Simplificada (Correios / externa)" : "Agendar Nova Entrega"}</h2>
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
                    const manual = window.prompt("Cole aqui os dados da venda (Ctrl+V / Cmd+V):", "");
                    text = manual || "";
                  }
                  if (!text || text.length < 10) { setMsg("Nada no clipboard. Copie a mensagem do WhatsApp primeiro."); return; }

                  // Helpers
                  const stripAst = (l: string) => l.replace(/\*/g, "").trim();
                  const cleanLow = (l: string) => stripAst(l).toLowerCase().replace(/[✅⚠️📌🤔🎯🔄💰📋🏷️🖥️💳📦🍎📱💻⌚🎧·•]/g, "").trim();
                  const afterColon = (l: string) => { const i = l.indexOf(":"); return i >= 0 ? l.slice(i + 1).trim() : l.trim(); };
                  const parseMoney = (s: string): number => {
                    const m = s.match(/([\d.,]+)/);
                    if (!m) return 0;
                    let raw = m[1];
                    if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
                    else {
                      // Só pontos — se o último bloco tem 3 dígitos, é milhar (ex: 7.997 → 7997)
                      const parts = raw.split(".");
                      if (parts.length > 1 && parts[parts.length - 1].length === 3) raw = parts.join("");
                    }
                    return parseFloat(raw) || 0;
                  };

                  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

                  const r: {
                    cliente?: string; telefone?: string; cpf?: string; email?: string;
                    cep?: string; endereco?: string; bairro?: string;
                    produto?: string; produto_valor?: number;
                    forma_pagamento?: string; entrada_pix?: number; parcelas_str?: string; parcelas_n?: number; parcelas_val?: number;
                    troca_produto?: string; troca_cor?: string; troca_valor?: number; troca_bateria?: number;
                    troca_obs_parts: string[];
                    horario?: string; vendedor?: string;
                    local_entrega?: string; shopping_nome?: string;
                    tipo_pagamento?: string;
                  } = { troca_obs_parts: [] };

                  let section: "" | "troca" | "pagamento" | "produtos" = "";

                  for (const rawLine of lines) {
                    const line = stripAst(rawLine);
                    const low = cleanLow(rawLine);
                    if (!low || low.length < 2) continue;

                    // === Headers de seção ===
                    if (low.includes("meu aparelho na troca") || low.includes("aparelho na troca") || low.includes("produto na troca") || low.includes("trocas inclu")) {
                      section = "troca"; continue;
                    }
                    if (low.includes("modelo escolhido")) { section = "produtos"; continue; }
                    if (low.includes("como conheceu") || low.includes("diferenca a pagar") || low.includes("diferença a pagar")) { section = ""; continue; }
                    if (low.includes("dados da compra") || low.includes("dados do cliente")) { continue; }

                    // === Campos do cliente (sempre top-level, quebram seção) ===
                    if (/^cpf\s*[:：]/.test(low)) { const m = line.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/); if (m) r.cpf = m[0]; section = ""; continue; }
                    if (/^e[- ]?mail\s*[:：]/.test(low)) { r.email = afterColon(line); section = ""; continue; }
                    if (/^(telefone|whatsapp|celular)\s*[:：]/.test(low)) {
                      const m = line.match(/\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}/); if (m) r.telefone = m[0]; section = ""; continue;
                    }
                    if (/^cep\s*[:：]/.test(low)) { const m = line.match(/\d{5}[-.\s]?\d{3}/); if (m) r.cep = m[0]; section = ""; continue; }
                    if (/^endere(c|ç)o\s*[:：]/.test(low) || /^end[\s.:]/.test(low)) { r.endereco = afterColon(line); section = ""; continue; }
                    if (/^bairro\s*[:：]/.test(low)) { r.bairro = afterColon(line); section = ""; continue; }
                    if (/^nome\s*(completo)?\s*[:：]/.test(low)) { r.cliente = afterColon(line); section = ""; continue; }
                    if (/^hor[áa]rio\s*[:：]/.test(low) || /^hora\s*[:：]/.test(low)) { r.horario = afterColon(line); section = ""; continue; }
                    if (/^vendedor\s*[:：]/.test(low)) { r.vendedor = afterColon(line); section = ""; continue; }
                    if (/^local\s*[:：]/.test(low)) {
                      const val = afterColon(line);
                      const lv = val.toLowerCase();
                      if (lv.includes("shopping")) {
                        r.local_entrega = "SHOPPING";
                        const m = val.match(/shopping\s*[:\-]\s*(.+)$/i);
                        if (m) r.shopping_nome = m[1].trim();
                      }
                      else if (lv.includes("resid")) r.local_entrega = "RESIDÊNCIA";
                      else if (lv.includes("retir") || lv.includes("loja")) r.local_entrega = "RETIRADA";
                      else r.local_entrega = "OUTRO";
                      section = ""; continue;
                    }
                    if (low.includes("pagamento antecipado") || (low.includes("antecipado") && !low.includes("sinal"))) { r.tipo_pagamento = "ANTECIPADO"; continue; }
                    if (low.includes("pagar na entrega")) { r.tipo_pagamento = "NA ENTREGA"; continue; }

                    // === Troca section ===
                    if (section === "troca") {
                      // "Modelo: iPhone 13 Pro Max 128GB"
                      if (/^modelo\s*[:：]/.test(low)) { r.troca_produto = afterColon(line); continue; }
                      // "Valor avaliado: R$ 2.100" (label diferente de "Valor:" do produto principal)
                      if (low.includes("valor avaliado") || low.includes("avaliado em") || low.includes("avaliado:")) {
                        r.troca_valor = parseMoney(line); continue;
                      }
                      // "Cor: Azul"
                      if (/^cor\s*[:：]/.test(low)) { r.troca_cor = afterColon(line); continue; }
                      // "Condicao: Saude bateria 78% | Sem marcas | ..."
                      if (/^condi(c|ç)(a|ã)o\s*[:：]/.test(low)) {
                        const cond = afterColon(line);
                        const bat = cond.match(/(\d{2,3})\s*%/);
                        if (bat) r.troca_bateria = parseInt(bat[1]);
                        const parts = cond.split(/\s*\|\s*/).map(p => p.trim())
                          .filter(p => p && !/sa[uú]de\s+bateria/i.test(p) && !/^\d{2,3}\s*%/.test(p));
                        r.troca_obs_parts.push(...parts);
                        continue;
                      }
                      // "Saude bateria: 78%" ou "Bateria: 92"
                      if (/^sa[uú]de\s+bateria\s*[:：]/.test(low) || /^bateria\s*[:：]/.test(low)) {
                        const m = line.match(/(\d{2,3})/); if (m) r.troca_bateria = parseInt(m[1]); continue;
                      }
                      // "Caixa original: Sim"
                      if (/^caixa\s+original\s*[:：]/.test(low)) {
                        const v = afterColon(line).toLowerCase();
                        r.troca_obs_parts.push(v.includes("sim") ? "Com caixa original" : "Sem caixa original");
                        continue;
                      }
                      // "Observação: ..."
                      if (/^obs(erva(c|ç)(ão|ao|oes|ões)?)?\s*[:：]/.test(low)) {
                        const v = afterColon(line); if (v) r.troca_obs_parts.push(v); continue;
                      }
                      // Linha iniciando com produto Apple sem label "Modelo:"
                      if (!r.troca_produto && /^(iphone|ipad|macbook|apple watch|airpods|mac mini)/i.test(low)) {
                        let val = line;
                        const pm = val.match(/\s*[—–\-]\s*R?\$?\s*([\d.,]+)\s*$/);
                        if (pm) { r.troca_valor = parseMoney(pm[1]); val = val.replace(/\s*[—–\-]\s*R?\$?\s*[\d.,]+\s*$/, "").trim(); }
                        r.troca_produto = val.replace(/^[·•]\s*/, "");
                        continue;
                      }
                      // Linha genérica dentro da troca → vai pras observações
                      if (r.troca_produto && !low.includes("total") && !low.includes("seu aparelho")) {
                        r.troca_obs_parts.push(line);
                      }
                      continue;
                    }

                    // === Produto principal (fora da troca) ===
                    if (/^produto\s*[:：]/.test(low) && !low.includes("na troca")) {
                      let val = afterColon(line);
                      const pm = val.match(/\s*[—–\-]\s*R?\$?\s*([\d.,]+)\s*$/);
                      if (pm) { r.produto_valor = parseMoney(pm[1]); val = val.replace(/\s*[—–\-]\s*R?\$?\s*[\d.,]+\s*$/, "").trim(); }
                      r.produto = val;
                      section = ""; continue;
                    }
                    if (section === "produtos" && low.length > 3) {
                      if (!r.produto) r.produto = line.replace(/^[·•]\s*/, "");
                      else r.troca_obs_parts.push(line);
                      continue;
                    }

                    // === Pagamento ===
                    if (low.includes("forma de pagamento") || low.includes("forma pagamento")) {
                      const inline = afterColon(line);
                      if (inline && inline.length >= 2) r.forma_pagamento = inline;
                      section = "pagamento";
                      // Não dá continue — deixa cair nas regex de pix/parcelas abaixo,
                      // porque o inline pode ter "Entrada PIX R$ X + Yx de R$ Z".
                    }
                    // PIX antes: "Entrada PIX R$ 2.100"
                    if (!r.entrada_pix) {
                      const pixA = line.match(/entrada\s+pix[^\d]*([\d.,]+)/i);
                      if (pixA) r.entrada_pix = parseMoney(pixA[1]);
                    }
                    // PIX depois: "entrada de 2.500 no pix" / "entrada de R$ 2.500 no pix"
                    if (!r.entrada_pix) {
                      const pixB = line.match(/entrada\s+(?:de\s+)?R?\$?\s*([\d.,]+)[^\n]*?pix/i);
                      if (pixB) r.entrada_pix = parseMoney(pixB[1]);
                    }
                    // Parcelas: "10x de R$ 579,70"
                    if (!r.parcelas_n) {
                      const parcM = line.match(/(\d+)x\s+de\s+R?\$?\s*([\d.,]+)/i);
                      if (parcM) {
                        r.parcelas_n = parseInt(parcM[1]);
                        r.parcelas_val = parseMoney(parcM[2]);
                        r.parcelas_str = `${r.parcelas_n}x de R$ ${parcM[2]}`;
                      } else {
                        // "3.770 em 10x no cartao" / "R$ 3.770 em 10x"
                        const parcT = line.match(/R?\$?\s*([\d.,]+)\s+em\s+(\d+)\s*x/i);
                        if (parcT) {
                          const total = parseMoney(parcT[1]);
                          r.parcelas_n = parseInt(parcT[2]);
                          if (r.parcelas_n > 0 && total > 0) {
                            r.parcelas_val = total / r.parcelas_n;
                            r.parcelas_str = `${r.parcelas_n}x de R$ ${r.parcelas_val.toFixed(2).replace(".", ",")}`;
                          }
                        } else {
                          // "10x no cartao" sem valor explícito
                          const parcS = line.match(/(\d+)x\s+no\s+cart/i);
                          if (parcS) r.parcelas_n = parseInt(parcS[1]);
                        }
                      }
                    }
                    // "💰 R$ 8.000,00 à vista no PIX"
                    if (low.includes("vista") && low.includes("pix") && !r.entrada_pix) {
                      const m = line.match(/R?\$?\s*([\d.,]+)/); if (m) r.entrada_pix = parseMoney(m[1]);
                    }
                  }

                  // === Aplicar no formulário ===
                  const applied: string[] = [];
                  if (r.cliente) { set("cliente", r.cliente); applied.push("cliente"); }
                  if (r.telefone) { set("telefone", r.telefone); applied.push("telefone"); }
                  if (r.bairro) { set("bairro", r.bairro); applied.push("bairro"); }
                  if (r.endereco) {
                    set("endereco", r.endereco);
                    if (!form.endereco_entrega?.trim()) set("endereco_entrega", r.endereco);
                    applied.push("endereço");
                  }
                  if (r.horario) { set("horario", r.horario); applied.push("horário"); }
                  if (r.vendedor) { set("vendedor", r.vendedor); applied.push("vendedor"); }
                  if (r.local_entrega) { set("local_entrega", r.local_entrega); applied.push("local"); }
                  if (r.shopping_nome) set("shopping_nome", r.shopping_nome);

                  // === Pagamento: dividir em Pag1 / Pag2 usando valores do select ===
                  const formaTxt = (r.forma_pagamento || "").toLowerCase();
                  const hasPix = !!r.entrada_pix;
                  const hasParc = !!r.parcelas_n;
                  // Quando o texto diz "10x de R$ 579,70" ou "3.770 em 10x", o valor
                  // é o TOTAL cobrado no cartão — já inclui a taxa da máquina.
                  // Guardamos esse total para jogar no override do Pag1 com flag "taxa_incluida".
                  const totalCartaoComTaxa = (hasParc && r.parcelas_val)
                    ? Math.round(r.parcelas_n! * r.parcelas_val)
                    : 0;
                  // Taxa usada pra derivar a base sem taxa (pra ajustar o form.valor)
                  const taxaCartao = hasParc ? (TAXAS_PARCELAS[r.parcelas_n!] || 0) : 0;
                  const baseCartao = totalCartaoComTaxa > 0 && taxaCartao > 0
                    ? Math.round(totalCartaoComTaxa / (1 + taxaCartao / 100))
                    : totalCartaoComTaxa;
                  if (hasPix && hasParc) {
                    // Cartão + Entrada PIX → Pag1 = Cartão Crédito, Pag2 = Pix
                    const mq = maquinaFromParcelas(r.parcelas_n!);
                    setForm(f => ({
                      ...f,
                      forma_pagamento: "Cartao Credito",
                      parcelas: String(r.parcelas_n),
                      maquina: mq || f.maquina,
                      taxa_incluida: totalCartaoComTaxa > 0 ? "1" : "",
                      forma_pagamento_2: "Pix",
                      valor_2: String(Math.round(r.entrada_pix!)),
                      taxa_incluida_2: "",
                    }));
                    if (totalCartaoComTaxa > 0) setValorPag1Override(String(totalCartaoComTaxa));
                    setShowPagAlt(true);
                    applied.push(`pagamento: ${r.parcelas_n}x cartão${mq ? ` (${mq})` : ""}${totalCartaoComTaxa > 0 ? ` R$ ${totalCartaoComTaxa.toLocaleString("pt-BR")}` : ""} + PIX R$ ${r.entrada_pix!.toLocaleString("pt-BR")}`);
                  } else if (hasParc) {
                    const mq = maquinaFromParcelas(r.parcelas_n!);
                    setForm(f => ({
                      ...f,
                      forma_pagamento: "Cartao Credito",
                      parcelas: String(r.parcelas_n),
                      maquina: mq || f.maquina,
                      taxa_incluida: totalCartaoComTaxa > 0 ? "1" : "",
                    }));
                    if (totalCartaoComTaxa > 0) setValorPag1Override(String(totalCartaoComTaxa));
                    applied.push(`pagamento: ${r.parcelas_n}x cartão${mq ? ` (${mq})` : ""}${totalCartaoComTaxa > 0 ? ` R$ ${totalCartaoComTaxa.toLocaleString("pt-BR")}` : ""}`);
                  } else if (hasPix || /pix/.test(formaTxt)) {
                    set("forma_pagamento", "Pix");
                    applied.push("pagamento: Pix");
                  } else if (/d[ée]bito/i.test(formaTxt)) {
                    set("forma_pagamento", "Cartao Debito");
                    applied.push("pagamento: Cartão Débito");
                  } else if (/link/.test(formaTxt)) {
                    set("forma_pagamento", "Link de Pagamento");
                    applied.push("pagamento: Link");
                  } else if (/esp[ée]cie|dinheiro/i.test(formaTxt)) {
                    set("forma_pagamento", "Especie");
                    applied.push("pagamento: Espécie");
                  } else if (/transf/i.test(formaTxt)) {
                    set("forma_pagamento", "Transferencia");
                    applied.push("pagamento: Transferência");
                  } else if (/cart/i.test(formaTxt)) {
                    set("forma_pagamento", "Cartao Credito");
                    applied.push("pagamento: Cartão Crédito");
                  }

                  // Valor base da venda (sem taxa do cartão) — soma base cartão + entrada pix.
                  // Assim o "A pagar" (base) bate com a soma dos pagamentos base no validador.
                  const valorVenda = r.produto_valor
                    || (hasPix && hasParc ? Math.round(baseCartao + (r.entrada_pix || 0)) : 0)
                    || (hasParc ? baseCartao : 0)
                    || (hasPix ? Math.round(r.entrada_pix!) : 0);
                  if (valorVenda > 0) set("valor", String(valorVenda));

                  // === Produto: tentar encaixar no catálogo ===
                  if (r.produto) {
                    const prodStr = r.produto.trim();
                    // Cores conhecidas (EN e PT) — extrai cor do final do nome
                    const CORES = [
                      "TITANIO DESERTO", "TITANIO NATURAL", "TITANIO PRETO", "TITANIO BRANCO", "TITANIO AZUL",
                      "DESERT TITANIUM", "NATURAL TITANIUM", "BLACK TITANIUM", "WHITE TITANIUM", "BLUE TITANIUM",
                      "SIERRA BLUE", "PACIFIC BLUE", "DEEP PURPLE", "ALPINE GREEN", "MIDNIGHT GREEN",
                      "SPACE BLACK", "SPACE GRAY", "COSMIC ORANGE", "MEIA NOITE", "MEIA-NOITE",
                      "AZUL SIERRA", "AZUL COSMOS", "AZUL TITANIO",
                      "GRAFITE", "LAVANDA", "ESTELAR", "STARLIGHT", "MIDNIGHT", "GRAPHITE", "LAVENDER",
                      "SILVER", "GOLD", "BLUE", "PINK", "YELLOW", "PURPLE", "GREEN", "RED", "BLACK", "WHITE",
                      "PRATA", "DOURADO", "AZUL", "ROSA", "AMARELO", "ROXO", "VERDE", "VERMELHO", "PRETO", "BRANCO",
                      "CINZA", "LARANJA", "TITANIO",
                    ].sort((a, b) => b.length - a.length);
                    const upperProd = prodStr.toUpperCase();
                    let corEncontrada = "";
                    let nomeSemCor = prodStr;
                    for (const cor of CORES) {
                      const re = new RegExp(`\\s+${cor.replace(/[-\s]/g, "[-\\s]")}\\s*$`, "i");
                      if (re.test(upperProd)) {
                        corEncontrada = cor;
                        nomeSemCor = prodStr.replace(re, "").trim();
                        break;
                      }
                    }

                    // Match no catálogo de preços (mesma lógica de lookupPrecoVenda)
                    const normalize = (s: string) => s.toUpperCase()
                      .replace(/\([^)]*\)/g, " ").replace(/[|\\/]/g, " ").replace(/["']/g, " ")
                      .replace(/\bRAM\b/g, " ").replace(/\s+/g, " ").trim();
                    const nameTokens = new Set(normalize(nomeSemCor).split(" ").filter(Boolean));

                    let best: { p: (typeof precosVenda)[number] | null; score: number } = { p: null, score: 0 };
                    for (const p of precosVenda) {
                      const combined = `${p.modelo} ${p.armazenamento}`;
                      const tokens = normalize(combined).split(" ").filter(Boolean);
                      if (!tokens.length) continue;
                      const todos = tokens.every(t => nameTokens.has(t));
                      if (todos && tokens.length > best.score) best = { p, score: tokens.length };
                    }

                    if (best.p) {
                      const m = best.p;
                      const corPT = corEncontrada ? (corParaPT(corEncontrada) || corEncontrada) : "";
                      setCarrinho([{
                        key: `${m.modelo}-${Date.now()}`,
                        nome: `${m.modelo} ${m.armazenamento}`.trim(),
                        cor: corPT,
                        preco: r.produto_valor || m.preco_pix,
                        categoria: m.categoria,
                      }]);
                      setProdutoManual(false);
                      applied.push(`produto: ${m.modelo}${corPT ? " " + corPT : ""}`);
                    } else {
                      // Não achou no catálogo — modo manual
                      setProdutoManual(true);
                      setProdutos([prodStr]);
                      applied.push("produto (manual)");
                    }
                  }

                  // === Troca: popular os campos VISÍVEIS do formulário ===
                  if (r.troca_produto) {
                    setTrocaAtiva(true);
                    set("tipo", "UPGRADE");
                    setTrocaProduto(r.troca_produto);
                    if (r.troca_valor) setTrocaValor(String(r.troca_valor));
                    if (r.troca_cor) setTrocaCor(r.troca_cor);
                    if (r.troca_bateria) setTrocaBateria(String(r.troca_bateria));
                    // Dedupa e junta observações
                    const obsUnicas = Array.from(new Set(r.troca_obs_parts.map(s => s.trim()).filter(Boolean)));
                    if (obsUnicas.length) setTrocaObs(obsUnicas.join(" | "));
                    applied.push("troca completa");
                  }

                  setMsg(applied.length > 0
                    ? `✅ Dados da venda colados: ${applied.join(", ")}.`
                    : "⚠️ Nada reconhecido no texto colado.");
                } catch { setMsg("Erro ao ler clipboard. Permita o acesso."); }
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold border-2 border-dashed border-[#E8740E] text-[#E8740E] hover:bg-[#FFF5EB] transition-colors"
            >
              📋 Colar dados da venda
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
                          // Preenche endereco cadastro + endereco_entrega (admin pode alterar depois)
                          if (s.endereco) { set("endereco", s.endereco); set("endereco_entrega", s.endereco); }
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
            <div className="col-span-2 md:col-span-3">
              <p className={labelCls}>{modoColeta || form.tipo === "COLETA" ? "Endereço da coleta" : "Endereço de entrega"}</p>
              <input value={form.endereco_entrega || form.endereco} onChange={(e) => set("endereco_entrega", e.target.value)} placeholder={modoColeta || form.tipo === "COLETA" ? "Endereço completo para coleta" : "Endereço completo para entrega"} className={inputCls} />
              {form.endereco && form.endereco_entrega && form.endereco_entrega !== form.endereco && (
                <p className="text-[10px] text-[#86868B] mt-1">📋 Cadastro: {form.endereco}</p>
              )}
            </div>
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
            {/* ==== COLETA ==== */}
            {modoColeta && (
              <div className="col-span-2 md:col-span-3 space-y-3 border-t border-green-300 pt-3 mt-1">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">🛵 Dados da Coleta</p>
                <div>
                  <p className={labelCls}>Produto a coletar</p>
                  <input value={produtos[0] || ""} onChange={(e) => setProdutos([e.target.value])} placeholder="Ex: iPhone 15 128GB Preto" className={inputCls} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <p className={labelCls}>Bateria %</p>
                    <input value={coletaBateria} onChange={(e) => setColetaBateria(e.target.value.replace(/\D/g, ""))} placeholder="Ex: 87" className={inputCls} inputMode="numeric" />
                  </div>
                  <div>
                    <p className={labelCls}>Estado (grade)</p>
                    <select value={coletaEstado} onChange={(e) => setColetaEstado(e.target.value as typeof coletaEstado)} className={inputCls}>
                      <option value="">-- Selecionar --</option>
                      <option value="A+">A+ (Excelente)</option>
                      <option value="A">A (Muito bom)</option>
                      <option value="AB">AB (Bom)</option>
                      <option value="B">B (Regular)</option>
                    </select>
                  </div>
                  <div>
                    <p className={labelCls}>Caixa original</p>
                    <select value={coletaCaixa} onChange={(e) => setColetaCaixa(e.target.value as typeof coletaCaixa)} className={inputCls}>
                      <option value="">-- Selecionar --</option>
                      <option value="sim">Com caixa</option>
                      <option value="nao">Sem caixa</option>
                    </select>
                  </div>
                  <div>
                    <p className={labelCls}>Obs. do aparelho</p>
                    <input value={coletaMarcas} onChange={(e) => setColetaMarcas(e.target.value)} placeholder="Ex: sem marcas, arranhão lateral..." className={inputCls} />
                  </div>
                </div>
                <div>
                  <p className={labelCls}>Vendedor</p>
                  <select value={form.vendedor} onChange={(e) => set("vendedor", e.target.value)} className={inputCls}>
                    <option value="">-- Selecionar --</option>
                    {vendedoresList.map((v) => (
                      <option key={v.nome} value={v.nome}>{v.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className={labelCls}>Motoboy / Responsável</p>
                  <select value={form.entregador} onChange={(e) => set("entregador", e.target.value)} className={inputCls}>
                    <option value="">Aguardando motoboy</option>
                    <option value="Igor">Igor</option>
                    <option value="Leandro">Leandro</option>
                    <option value="Retirada">Retirada</option>
                    <option value="Correios">Correios</option>
                  </select>
                </div>
              </div>
            )}
            {!modoSimples && !modoColeta && (<>
            {/* Produto — seleção do estoque ou manual */}
            <div className="col-span-2 md:col-span-3 space-y-3 border-t border-[#E5E5EA] pt-3 mt-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Produto</p>
                <button onClick={() => { setProdutoManual(!produtoManual); if (!produtoManual) { setCatSel(""); setEstoqueId(""); setCarrinho([]); } }} className="text-xs text-[#E8740E] font-medium hover:underline">
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
                /* Carrinho — lista de produtos selecionados + picker */
                <div className="space-y-3">
                  {/* Carrinho display */}
                  {carrinho.length > 0 && (
                    <div className={`rounded-xl border p-3 space-y-2 ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-green-50 border-green-200"}`}>
                      <p className={`text-xs font-bold uppercase tracking-wider ${dm ? "text-green-400" : "text-green-700"}`}>Carrinho</p>
                      {carrinho.map((item, idx) => (
                        <div key={item.key} className={`flex items-center justify-between text-sm ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>
                          <span className="font-medium">{idx + 1}. {item.cor ? `${item.nome} ${item.cor}` : item.nome}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">R$ {item.preco.toLocaleString("pt-BR")}</span>
                            <button type="button" onClick={() => setCarrinho(prev => prev.filter(p => p.key !== item.key))} className="text-red-400 hover:text-red-600 text-base leading-none">✕</button>
                          </div>
                        </div>
                      ))}
                      <div className={`border-t pt-2 mt-1 flex justify-between text-sm font-bold ${dm ? "border-[#3A3A3C] text-green-400" : "border-green-300 text-green-700"}`}>
                        <span>Total</span>
                        <span>R$ {carrinho.reduce((s, p) => s + p.preco, 0).toLocaleString("pt-BR")}</span>
                      </div>
                    </div>
                  )}

                  {/* Product picker — shown when addingProduct is true */}
                  {addingProduct ? (
                    <div className={`rounded-xl border p-3 space-y-3 ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#D2D2D7]"}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Selecionar produto</p>
                        <button type="button" onClick={() => { setAddingProduct(false); setCatSel(""); setTempCor(""); }} className="text-xs text-red-400 hover:text-red-600 font-semibold">✕ Fechar</button>
                      </div>
                      <select value={catSel} onChange={(e) => { setCatSel(e.target.value); setTempCor(""); }} className={inputCls}>
                        <option value="">-- Categoria --</option>
                        {categoriaPrecos.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
                      </select>
                      {catSel && catSel !== "SEMINOVOS" && (
                        <div className={`max-h-[300px] overflow-y-auto rounded-xl border divide-y ${dm ? "border-[#3A3A3C] divide-[#3A3A3C]" : "border-[#D2D2D7] divide-[#E5E5EA]"}`}>
                          {produtosFiltradosPreco.length === 0 && <p className="text-xs text-center text-[#86868B] py-4">Nenhum produto</p>}
                          {produtosFiltradosPreco.map((m) => {
                            const cores = coresParaProduto(m.nome);
                            return (
                              <div key={m.nome}>
                                <button type="button" onClick={() => {
                                  if (cores.length === 0) {
                                    // No colors — add directly to carrinho
                                    setCarrinho(prev => [...prev, { key: `${m.nome}-${Date.now()}`, nome: m.nome, cor: "", preco: m.preco, categoria: catSel }]);
                                    setAddingProduct(false); setCatSel(""); setTempCor("");
                                  } else {
                                    // Has colors — select this product to show color chips
                                    setProdutos([m.nome]);
                                    setTempCor("");
                                  }
                                }} className={`w-full px-4 py-3 flex items-center justify-between text-left transition-all ${produtos[0] === m.nome ? (dm ? "bg-[#3A2410] border-l-4 border-[#E8740E]" : "bg-[#FFF5EB] border-l-4 border-[#E8740E]") : (dm ? "hover:bg-[#2C2C2E]" : "hover:bg-[#F9F9FB]")}`}>
                                  <p className={`text-sm font-semibold ${produtos[0] === m.nome ? "text-[#E8740E]" : (dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]")}`}>{m.nome}</p>
                                  <p className={`text-sm font-bold ${produtos[0] === m.nome ? "text-[#E8740E]" : (dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]")}`}>R$ {m.preco.toLocaleString("pt-BR")}</p>
                                </button>
                                {produtos[0] === m.nome && cores.length > 0 && (
                                  <div className={`px-4 py-3 border-t ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#FAFAFA] border-[#E5E5EA]"}`}>
                                    <p className="text-xs font-medium mb-2 text-[#86868B]">Selecione a cor:</p>
                                    <div className="flex flex-wrap gap-2">
                                      {cores.map(cor => (
                                        <button key={cor} type="button" onClick={() => {
                                          setCarrinho(prev => [...prev, { key: `${m.nome}-${cor}-${Date.now()}`, nome: m.nome, cor, preco: m.preco, categoria: catSel }]);
                                          setAddingProduct(false); setCatSel(""); setTempCor(""); setProdutos([""]);
                                        }}
                                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${dm ? "bg-[#1C1C1E] text-[#F5F5F7] border-[#3A3A3C] hover:border-[#E8740E] hover:bg-[#3A2410]" : "bg-white text-[#1D1D1F] border-[#D2D2D7] hover:border-[#E8740E] hover:bg-[#FFF5EB]"}`}
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
                      {catSel === "SEMINOVOS" && (
                        <div className={`max-h-[300px] overflow-y-auto rounded-xl border divide-y ${dm ? "border-[#3A3A3C] divide-[#3A3A3C]" : "border-[#D2D2D7] divide-[#E5E5EA]"}`}>
                          {seminovosList.length === 0 && <p className="text-xs text-center text-[#86868B] py-4">Nenhum seminovo em estoque</p>}
                          {seminovosList.map((g) => {
                            const sel = produtos[0] === g.nome;
                            const qtdTotal = g.items.reduce((s, i) => s + i.qnt, 0);
                            // Seminovos: get cores from items
                            const coresSemi = (() => {
                              if (!sel) return [];
                              const set = new Set<string>();
                              for (const it of g.items) if (it.cor) set.add(it.cor.toUpperCase());
                              return [...set].sort();
                            })();
                            return (
                              <div key={g.key}>
                                <button type="button" onClick={() => {
                                  if (sel) { setProdutos([""]); return; }
                                  setProdutos([g.nome]);
                                  setTempCor("");
                                }} className={`w-full px-4 py-3 flex items-center justify-between text-left transition-all ${sel ? (dm ? "bg-[#3A2410] border-l-4 border-[#E8740E]" : "bg-[#FFF5EB] border-l-4 border-[#E8740E]") : (dm ? "hover:bg-[#2C2C2E]" : "hover:bg-[#F9F9FB]")}`}>
                                  <p className={`text-sm font-semibold ${sel ? "text-[#E8740E]" : (dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]")}`}>{g.nome}</p>
                                  <p className={`text-xs font-medium ${sel ? "text-[#E8740E]" : "text-[#86868B]"}`}>{qtdTotal} un.</p>
                                </button>
                                {sel && (
                                  <div className={`px-4 py-3 border-t space-y-2 ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#FAFAFA] border-[#E5E5EA]"}`}>
                                    {coresSemi.length > 0 && (<>
                                      <p className="text-xs font-medium text-[#86868B]">Selecione a cor:</p>
                                      <div className="flex flex-wrap gap-2">
                                        {coresSemi.map(cor => (
                                          <button key={cor} type="button" onClick={() => setTempCor(tempCor === cor ? "" : cor)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${tempCor === cor ? "bg-[#E8740E] text-white border-[#E8740E]" : (dm ? "bg-[#1C1C1E] text-[#F5F5F7] border-[#3A3A3C] hover:border-[#E8740E]" : "bg-white text-[#1D1D1F] border-[#D2D2D7] hover:border-[#E8740E]")}`}
                                          >{cor}</button>
                                        ))}
                                      </div>
                                    </>)}
                                    <div>
                                      <p className={labelCls}>Valor de venda R$</p>
                                      <input type="number" value={form.valor} onChange={(e) => set("valor", e.target.value)} placeholder="0" className={inputCls} />
                                      <p className="text-[11px] text-[#86868B] italic mt-1">Seminovo não tem preço fixo — digite o valor acordado com o cliente.</p>
                                    </div>
                                    <button type="button" onClick={() => {
                                      const precoSemi = parseFloat(form.valor) || 0;
                                      setCarrinho(prev => [...prev, { key: `${g.nome}-${tempCor}-${Date.now()}`, nome: g.nome, cor: tempCor, preco: precoSemi, categoria: "SEMINOVOS" }]);
                                      setAddingProduct(false); setCatSel(""); setTempCor(""); setProdutos([""]);
                                    }} className="w-full px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#D06A0D] transition-colors">
                                      Adicionar ao carrinho
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* "+ Adicionar produto" button */
                    <button
                      type="button"
                      onClick={() => { setAddingProduct(true); setCatSel(""); setProdutos([""]); }}
                      className={`w-full px-4 py-2 rounded-xl border-2 border-dashed text-sm font-semibold transition-colors ${dm ? "border-[#E8740E] text-[#E8740E] hover:bg-[#3A2410]" : "border-[#E8740E] text-[#E8740E] hover:bg-[#FFF5EB]"}`}
                    >
                      + Adicionar produto
                    </button>
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

            {/* JÁ PAGO */}
            <div className="col-span-2 md:col-span-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)} className="w-4 h-4 accent-[#2ECC71]" />
                <span className={`text-sm font-semibold ${jaPago ? "text-[#2ECC71]" : (dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]")}`}>✅ Já está pago</span>
              </label>
            </div>

            {/* PAGAMENTO 1 */}
            {!jaPago && <div className={`col-span-2 md:col-span-3 rounded-xl border px-4 py-3 space-y-3 ${dm ? "border-[#3A3A3C] bg-[#1C1C1E]" : "border-[#D2D2D7] bg-white"}`}>
              <p className={`text-sm font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>💳 Pagamento 1</p>
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
                  {isCartaoCredito && (
                    <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer text-[10px] text-[#86868B]">
                      <input
                        type="checkbox"
                        checked={form.taxa_incluida === "1"}
                        onChange={(e) => set("taxa_incluida", e.target.checked ? "1" : "")}
                        className="accent-[#E8740E]"
                      />
                      Taxa já incluída no valor
                    </label>
                  )}
                  {valorPag1Override && (
                    <button
                      type="button"
                      onClick={() => { setValorPag1Override(""); set("taxa_incluida", ""); }}
                      className="text-[10px] text-[#E8740E] hover:underline mt-1 block"
                    >
                      ↺ Voltar pro automático
                    </button>
                  )}
                </div>
                {(form.forma_pagamento === "Cartao Credito" || form.forma_pagamento === "Cartao Debito" || form.forma_pagamento === "Link de Pagamento") && (
                  <>
                    <div>
                      <p className={labelCls}>Parcelas {form.forma_pagamento === "Link de Pagamento" && <span className="text-[10px] text-[#86868B]">(máx. 12x)</span>}</p>
                      <select
                        value={form.parcelas}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm(f => ({ ...f, parcelas: v, maquina: maquinaFromParcelas(v) || f.maquina }));
                        }}
                        className={inputCls}
                      >
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
                    <span className="text-[#86868B]">Base (sem taxa): <b className="text-[#1D1D1F]">R$ {valorPag1Base.toLocaleString("pt-BR")}</b></span>
                    <span className="text-red-500">Taxa {form.forma_pagamento === "Link de Pagamento" ? "link" : "cartão"} ({taxaAtual}%): <b>+R$ {(totalComTaxa - valorPag1Base).toLocaleString("pt-BR")}</b></span>
                    <span className="text-[#86868B]">Total c/ taxa: <b className="text-[#1D1D1F]">R$ {totalComTaxa.toLocaleString("pt-BR")}</b></span>
                    <span className="text-[#E8740E] font-bold">{nParcelas}x de R$ {valorParcela.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}
            </div>}

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
                    <select value={form.forma_pagamento_2} onChange={(e) => { set("forma_pagamento_2", e.target.value); if (e.target.value !== "Cartao Credito" && e.target.value !== "Link de Pagamento") { set("parcelas_2", ""); set("maquina_2", ""); } }} className={inputCls}>
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
                    {isCartao2 && (
                      <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer text-[10px] text-[#86868B]">
                        <input
                          type="checkbox"
                          checked={form.taxa_incluida_2 === "1"}
                          onChange={(e) => set("taxa_incluida_2", e.target.checked ? "1" : "")}
                          className="accent-[#E8740E]"
                        />
                        Taxa já incluída no valor
                      </label>
                    )}
                  </div>
                  {isCartao2 && (<>
                    <div>
                      <p className={labelCls}>Parcelas {form.forma_pagamento_2 === "Link de Pagamento" && <span className="text-[10px] text-[#86868B]">(máx. 12x)</span>}</p>
                      <select
                        value={form.parcelas_2}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm(f => ({ ...f, parcelas_2: v, maquina_2: maquinaFromParcelas(v) || f.maquina_2 }));
                        }}
                        className={inputCls}
                      >
                        <option value="">—</option>
                        {(form.forma_pagamento_2 === "Link de Pagamento" ? [1,2,3,4,5,6,7,8,9,10,11,12] : [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]).map(n => <option key={n} value={String(n)}>{n}x</option>)}
                      </select>
                    </div>
                    <div>
                      <p className={labelCls}>Máquina</p>
                      <select value={form.maquina_2} onChange={(e) => set("maquina_2", e.target.value)} className={inputCls}>
                        <option value="">-- Selecionar --</option>
                        <option value="ITAU">Itaú</option>
                        <option value="INFINITE">Infinite</option>
                      </select>
                    </div>
                    {nParcelas2 > 0 && valorPag2 > 0 && (
                      <div className="col-span-2 bg-[#FFF8F0] border border-[#E8740E]/30 rounded-lg px-3 py-2 text-xs">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="text-[#86868B]">Base (sem taxa): <b className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>R$ {valorPag2Base.toLocaleString("pt-BR")}</b></span>
                          <span className="text-red-500">Taxa ({taxaAtual2}%): <b>+R$ {(totalComTaxa2 - valorPag2Base).toLocaleString("pt-BR")}</b></span>
                          <span className="text-[#86868B]">Total c/ taxa: <b className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>R$ {totalComTaxa2.toLocaleString("pt-BR")}</b></span>
                          <span className="text-[#E8740E] font-bold">{nParcelas2}x de R$ {valorParcela2.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )}
                  </>)}
                </div>
              </div>
            )}

            {/* Validador da soma dos pagamentos (soma valores-base, pré-taxa) */}
            {(valorPag1 > 0 || valorPag2 > 0) && valorAPagar > 0 && (() => {
              const soma = valorPag1Base + valorPag2Base;
              const diff = soma - valorAPagar;
              const ok = Math.abs(diff) < 1;
              const totalCliente = totalComTaxa + totalComTaxa2;
              return (
                <div className={`col-span-2 md:col-span-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
                  <span>{ok ? "✅" : "⚠️"}</span>
                  <span>
                    Pagamento 1: <b>R$ {valorPag1Base.toLocaleString("pt-BR")}</b>
                    {valorPag2 > 0 && <> + Pagamento 2: <b>R$ {valorPag2Base.toLocaleString("pt-BR")}</b></>}
                    {" = "}<b>R$ {soma.toLocaleString("pt-BR")}</b>
                    {" · "}Valor a pagar: <b>R$ {valorAPagar.toLocaleString("pt-BR")}</b>
                    {(taxaAtual > 0 || taxaAtual2 > 0) && <> · Total cliente c/ taxa: <b>R$ {totalCliente.toLocaleString("pt-BR")}</b></>}
                    {!ok && <> · <b>Divergência R$ {Math.abs(diff).toLocaleString("pt-BR")}</b> {diff > 0 ? "a mais" : "a menos"}</>}
                  </span>
                </div>
              );
            })()}
            <div>
              <p className={labelCls}>Vendedor</p>
              <select value={form.vendedor} onChange={(e) => set("vendedor", e.target.value)} className={inputCls}>
                <option value="">-- Selecionar --</option>
                {vendedoresList.map((v) => (
                  <option key={v.nome} value={v.nome}>{v.nome}</option>
                ))}
              </select>
            </div>
            </>)}
            <div>
              <p className={labelCls}>{modoColeta || form.tipo === "COLETA" ? "Data da Coleta" : "Data da Entrega"}</p>
              <input type="date" value={form.data_entrega} onChange={(e) => set("data_entrega", e.target.value)} className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Horario</p>
              {(() => {
                const HORARIOS_FIXOS = ["MANHA","TARDE","NOITE","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];
                const horarioEhLivre = !!form.horario && !HORARIOS_FIXOS.includes(form.horario);
                const mostrarHorarioLivre = horarioEhLivre || horarioLivreForcado;
                return (
                  <>
                    <select
                      value={mostrarHorarioLivre ? "__LIVRE__" : form.horario}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__LIVRE__") {
                          setHorarioLivreForcado(true);
                          if (!horarioEhLivre) set("horario", "");
                        } else {
                          setHorarioLivreForcado(false);
                          set("horario", v);
                        }
                      }}
                      className={inputCls}
                    >
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
                      <option value="__LIVRE__">⏰ Horario livre (digitar)...</option>
                    </select>
                    {mostrarHorarioLivre && (
                      <input
                        type="time"
                        value={horarioEhLivre ? form.horario : ""}
                        onChange={(e) => set("horario", e.target.value)}
                        className={`${inputCls} mt-2`}
                        placeholder="Ex: 16:45"
                      />
                    )}
                  </>
                );
              })()}
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
              {saving ? "Salvando..." : editingEntregaId ? "Salvar Alterações" : modoColeta ? "Agendar Coleta" : "Agendar Entrega"}
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

      {modoSelecao && (() => {
        // Calcula entregas visíveis na view atual (para "Selecionar todas")
        const aplicaFiltroBia = (arr: Entrega[]) => arr.filter((e) => {
          if (filtroBia === "finalizada") return e.finalizada === true;
          if (filtroBia === "pendentes_final") return e.finalizada !== true;
          if (filtroBia === "comprovante") return e.comprovante_lancado === true;
          if (filtroBia === "sem_comprovante") return e.comprovante_lancado !== true;
          return true;
        });
        const visiveis = viewMode === "dia"
          ? aplicaFiltroBia(entregas.filter((e) => e.data_entrega === viewDate))
          : aplicaFiltroBia(entregas.filter((e) => e.data_entrega >= from && e.data_entrega <= to));
        const todosMarcados = visiveis.length > 0 && visiveis.every(e => entregasSelecionadas.has(e.id));
        const toggleTodas = () => {
          if (todosMarcados) setEntregasSelecionadas(new Set());
          else setEntregasSelecionadas(new Set(visiveis.map(e => e.id)));
        };
        const bulkPatch = async (body: Record<string, unknown>, confirmMsg: string) => {
          if (entregasSelecionadas.size === 0) { alert("Nenhuma entrega selecionada"); return; }
          if (!confirm(confirmMsg)) return;
          const ids = Array.from(entregasSelecionadas);
          for (const id of ids) {
            await fetch("/api/admin/entregas", {
              method: "PATCH",
              headers: apiHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ id, ...body }),
            });
          }
          setEntregasSelecionadas(new Set());
          setModoSelecao(false);
          fetchEntregas();
        };
        const selCount = entregasSelecionadas.size;
        return (
          <div className={`flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl border ${dm ? "bg-blue-900/20 border-blue-600/40" : "bg-blue-50 border-blue-200"}`}>
            <button
              onClick={toggleTodas}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${todosMarcados ? "bg-blue-500 text-white" : dm ? "bg-[#2C2C2E] text-blue-300 border border-blue-600/40" : "bg-white border border-blue-300 text-blue-700"} hover:bg-blue-600 hover:text-white`}
            >
              {todosMarcados ? "☑ Desmarcar todas" : `☐ Selecionar todas (${visiveis.length})`}
            </button>
            <span className={`text-sm font-semibold ${dm ? "text-blue-300" : "text-blue-700"}`}>
              {selCount} selecionada{selCount !== 1 ? "s" : ""}
            </span>
            {selCount > 0 && (<>
              <div className="h-5 w-px bg-blue-300/50 mx-1" />
              <button
                onClick={() => bulkPatch({ finalizada: true, status: "ENTREGUE" }, `Finalizar ${selCount} entregas?`)}
                className="px-3 py-1 rounded-lg bg-green-500 text-white text-xs font-bold hover:bg-green-600"
              >✅ Finalizar</button>
              <button
                onClick={() => bulkPatch({ comprovante_lancado: true }, `Marcar comprovante em ${selCount} entregas?`)}
                className="px-3 py-1 rounded-lg bg-blue-500 text-white text-xs font-bold hover:bg-blue-600"
              >🧾 Comprovante</button>
              <div className="h-5 w-px bg-blue-300/50 mx-1" />
              <span className={`text-[11px] font-semibold uppercase ${dm ? "text-blue-300" : "text-blue-700"}`}>Motoboy:</span>
              {([
                { value: "IGOR", label: "Igor", emoji: "🛵" },
                { value: "LEANDRO", label: "Leandro", emoji: "🛵" },
                { value: "RETIRADA", label: "Retirada", emoji: "🏬" },
                { value: "CORREIOS", label: "Correios", emoji: "📦" },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => bulkPatch({ entregador: opt.value }, `Atribuir ${opt.label} a ${selCount} entregas?`)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${dm ? "bg-[#2C2C2E] text-[#F5F5F7] border border-[#3A3A3C] hover:border-[#E8740E]" : "bg-white border border-[#D2D2D7] text-[#1D1D1F] hover:border-[#E8740E]"}`}
                >{opt.emoji} {opt.label}</button>
              ))}
              <div className="h-5 w-px bg-blue-300/50 mx-1" />
              <span className={`text-[11px] font-semibold uppercase ${dm ? "text-blue-300" : "text-blue-700"}`}>Status:</span>
              {(["PENDENTE","SAIU","ENTREGUE","CANCELADA"] as const).map(st => {
                const c = STATUS_CONFIG[st];
                return (
                  <button
                    key={st}
                    onClick={() => bulkPatch({ status: st }, `Mudar status de ${selCount} entregas para ${c.label}?`)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${dm ? "bg-[#2C2C2E] text-[#F5F5F7] border border-[#3A3A3C] hover:border-[#E8740E]" : "bg-white border border-[#D2D2D7] text-[#1D1D1F] hover:border-[#E8740E]"}`}
                  >{c.icon} {c.label}</button>
                );
              })}
              <button
                onClick={() => setEntregasSelecionadas(new Set())}
                className={`ml-auto text-xs hover:underline ${dm ? "text-blue-300" : "text-blue-700"}`}
              >Limpar seleção</button>
            </>)}
          </div>
        );
      })()}

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
              id={`entrega-${e.id}`}
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
                  {modoSelecao && (
                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded border-2 ${isSel ? "bg-blue-500 border-blue-500 text-white" : dm ? "border-[#636366] bg-transparent" : "border-[#D2D2D7] bg-white"}`}>
                      {isSel && <span className="text-[10px] leading-none">✓</span>}
                    </span>
                  )}
                  <span>{sc.icon}</span>
                  {e.horario && <span className={`text-sm font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{e.horario}</span>}
                </div>
                <div className="flex items-center gap-1">
                  {e.tipo === "COLETA" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-600/20 text-green-700">🛵 COLETA</span>}
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
              <div className={`rounded-xl overflow-hidden border-2 ${dm ? "bg-yellow-900/20 border-yellow-600/60" : "bg-yellow-50 border-yellow-300"}`}>
                <div className={`px-4 py-2 border-b-2 ${dm ? "bg-yellow-900/40 border-yellow-600/60" : "bg-yellow-100 border-yellow-300"}`}>
                  <p className={`text-xs font-bold uppercase ${dm ? "text-yellow-200" : "text-yellow-800"}`}>
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
                    <span className="text-[#1D1D1F] font-medium">{e.forma_pagamento}</span>
                    {(() => {
                      // valor_total salvo já inclui taxa de ambos os cartões
                      const total = Number(e.valor_total || e.valor || 0);
                      const entrada = Number(e.entrada || 0);
                      const fp = e.forma_pagamento || "";
                      // Detecta forma da entrada (Pix/Espécie/Transferência) pelo texto
                      let labelEntrada = "Entrada";
                      if (/\+\s*pix/i.test(fp)) labelEntrada = "Entrada PIX";
                      else if (/\+\s*esp[eé]cie/i.test(fp)) labelEntrada = "Entrada Espécie";
                      else if (/\+\s*transfer/i.test(fp)) labelEntrada = "Entrada Transferência";
                      // Extrai cartões da string "Nx no Cartão (MAQ)" — pode ter 1 ou 2 ocorrências
                      const cartaoRegex = /(\d+)x\s+no\s+(?:Cart[ãa]o|Link)(?:\s*\(([^)]*)\))?/gi;
                      const cartoes: { parcelas: number; maquina: string }[] = [];
                      let m;
                      while ((m = cartaoRegex.exec(fp)) !== null) {
                        cartoes.push({ parcelas: parseInt(m[1]), maquina: (m[2] || "").trim() });
                      }
                      // Base a parcelar nos cartões = total − entrada
                      const baseCartoes = Math.max(0, total - entrada);
                      // Se há 2 cartões, precisamos saber quanto de cada. O esquema atual só guarda total —
                      // divide igualmente quando não há info específica. Para 1 cartão, usa tudo.
                      let linhasCartao: { label: string; valor: number; parcelas: number; valorParcela: number }[] = [];
                      if (cartoes.length === 1 && cartoes[0].parcelas > 0) {
                        const c = cartoes[0];
                        linhasCartao.push({
                          label: `${c.parcelas}x${c.maquina ? ` no Cartão (${c.maquina})` : ""}`,
                          valor: baseCartoes,
                          parcelas: c.parcelas,
                          valorParcela: baseCartoes / c.parcelas,
                        });
                      } else if (cartoes.length === 2) {
                        // Sem granularidade de valores: tenta dividir 50/50 como aproximação
                        const metade = baseCartoes / 2;
                        linhasCartao = cartoes.map(c => ({
                          label: `${c.parcelas}x${c.maquina ? ` no Cartão (${c.maquina})` : ""}`,
                          valor: metade,
                          parcelas: c.parcelas,
                          valorParcela: c.parcelas > 0 ? metade / c.parcelas : 0,
                        }));
                      }
                      if (total <= 0 && linhasCartao.length === 0) return null;
                      return (
                        <div className="mt-1 pl-2 text-xs text-[#86868B] space-y-0.5">
                          {total > 0 && <p>Total: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></p>}
                          {entrada > 0 && <p>{labelEntrada}: R$ {entrada.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>}
                          {linhasCartao.map((l, i) => (
                            <p key={i}>{l.label}: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>R$ {l.valorParcela.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>{linhasCartao.length > 1 && <> · total R$ {l.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</>}</p>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
                <div className="text-sm flex items-center gap-2 flex-wrap">
                  <span className="text-[#86868B]">Vendedor: </span>
                  <select
                    value={e.vendedor || ""}
                    onChange={async (ev) => {
                      const novoVendedor = ev.target.value || null;
                      // Otimista: atualiza local imediato
                      setEntregas(prev => prev.map(x => x.id === e.id ? { ...x, vendedor: novoVendedor } : x));
                      if (selectedEntrega?.id === e.id) setSelectedEntrega({ ...selectedEntrega, vendedor: novoVendedor });
                      try {
                        const res = await fetch("/api/admin/entregas", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json", ...apiHeaders() },
                          body: JSON.stringify({ id: e.id, vendedor: novoVendedor }),
                        });
                        if (!res.ok) {
                          // Reverte se deu erro
                          setEntregas(prev => prev.map(x => x.id === e.id ? { ...x, vendedor: e.vendedor } : x));
                          alert("Erro ao atualizar vendedor");
                        }
                      } catch {
                        setEntregas(prev => prev.map(x => x.id === e.id ? { ...x, vendedor: e.vendedor } : x));
                        alert("Erro de conexão");
                      }
                    }}
                    className={`px-2 py-1 rounded-lg border text-sm ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} hover:border-[#E8740E] focus:outline-none focus:border-[#E8740E]`}
                  >
                    <option value="">— Nenhum —</option>
                    {(() => {
                      const opcoes = new Set<string>();
                      if (e.vendedor) opcoes.add(e.vendedor);
                      for (const v of vendedoresList) {
                        if (v.ativo !== false && v.nome) opcoes.add(v.nome);
                      }
                      return [...opcoes].map((n) => <option key={n} value={n}>{n}</option>);
                    })()}
                  </select>
                </div>
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
                          {c.icon} {getStatusLabel(status, e.tipo)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Copiar formulário motoboy / coleta */}
                <div className="pt-2 border-t border-[#D2D2D7]">
                  <button
                    onClick={() => {
                      if (e.tipo === "COLETA") {
                        // Formulário de COLETA — sem valores financeiros
                        const detalhesAparelho = e.detalhes_upgrade
                          ? e.detalhes_upgrade.split("\n").filter(l => !l.toLowerCase().startsWith("avaliação") && !l.toLowerCase().startsWith("avaliacao")).join("\n• ")
                          : "";
                        const obsLimpa = (e.observacao || "").split(" | ").filter(p => !p.startsWith("Endereço cadastro:")).join(" | ").trim();
                        const produtoFmtC = formatProdutoMotoboy(e.produto);
                        const produtoLineC = produtoFmtC.startsWith("\n")
                          ? `🍎 *PRODUTO:*${produtoFmtC}`
                          : `🍎 *PRODUTO:* ${produtoFmtC}`;
                        const msg = [
                          `🛵 *COLETA* 🛵`,
                          ``,
                          `⏰ *HORÁRIO:* ${e.horario || "Horário a combinar"}`,
                          `📍 *LOCAL COLETA:* ${e.endereco || "A definir"}${e.bairro ? ` - ${e.bairro}` : ""}`,
                          produtoLineC,
                          ``,
                          ...(detalhesAparelho ? [`📱 *APARELHO NA COLETA:*`, `• ${detalhesAparelho}`] : []),
                          ``,
                          `🧑 *CLIENTE:* ${e.cliente || ""}`,
                          `📞 *CONTATO:* ${e.telefone || ""}`,
                          obsLimpa ? `\nOBS: ${obsLimpa}` : "",
                          ``,
                          `💼 Vendedor: ${e.vendedor || ""}`,
                        ].filter(l => l !== undefined).join("\n");
                        navigator.clipboard.writeText(msg);
                        alert("Formulário de coleta copiado! Cole no WhatsApp do motoboy.");
                      } else {
                        // Formulário de ENTREGA
                        const regiao = e.regiao || e.bairro || "";
                        const isUpgrade = e.tipo === "UPGRADE" || !!e.detalhes_upgrade;
                        const tipoLabel = isUpgrade ? "UPGRADE (Troca)" : "Compra";
                        const trocaTexto = e.detalhes_upgrade
                          ? e.detalhes_upgrade.split("\n").filter(l => !l.startsWith("Avaliação:"))
                              .map(l => l.replace(/\s*—\s*R\$\s*[\d.,]+/g, "")) // Remove valor avaliado (motoboy não vê)
                              .join(" / ")
                          : "";
                        const obsLimpa = (e.observacao || "").split(" | ").filter(p => !p.startsWith("Endereço cadastro:")).join(" | ").trim();
                        // Produto: multi-produto quebra em bullets (quando tem " + ")
                        const produtoFmt = formatProdutoMotoboy(e.produto);
                        const produtoLine = produtoFmt.startsWith("\n")
                          ? `🍎 *PRODUTO:*${produtoFmt}`
                          : `🍎 *PRODUTO:* ${produtoFmt}`;
                        // Pagamento: formatPagamentoDisplay ja retorna multi-linha com bullets
                        const pagFmt = formatPagamentoDisplay(e.forma_pagamento, e.valor, e.valor_total, e.entrada, e.parcelas);
                        const pagLine = pagFmt.includes("\n")
                          ? `💵 *PAGAMENTO:*\n${pagFmt}`
                          : `💵 *PAGAMENTO:* ${pagFmt}`;
                        const msg = [
                          `🛵 *ENTREGA ${regiao.toUpperCase()}* 🛵`,
                          `🛵`,
                          `⏰ *HORÁRIO:* ${e.horario || "A combinar"}`,
                          `📍 *LOCAL:* ${e.endereco || "A definir"} - ${e.bairro || ""}`,
                          produtoLine,
                          `‼️ *TIPO:* ${tipoLabel}`,
                          ...(isUpgrade && trocaTexto ? [`🔄 *PRODUTO NA TROCA:* ${trocaTexto}`] : []),
                          pagLine,
                          `🧑 *CLIENTE:* ${e.cliente || ""}`,
                          `📞 *CONTATO:* ${e.telefone || ""}`,
                          obsLimpa ? `OBS: ${obsLimpa}` : "",
                          `💼 Vendedor: ${e.vendedor || ""}`,
                          "________________________________",
                        ].filter(Boolean).join("\n");
                        navigator.clipboard.writeText(msg);
                        alert("Formulário copiado! Cole no WhatsApp do motoboy.");
                      }
                    }}
                    className={`w-full py-2.5 rounded-xl text-center text-sm font-semibold transition-colors mb-2 ${e.tipo === "COLETA" ? "bg-green-600 text-white hover:bg-green-700" : "bg-[#E8740E] text-white hover:bg-[#D06A0D]"}`}
                  >
                    {e.tipo === "COLETA" ? "📋 Copiar Formulário Coleta" : "📋 Copiar Formulário Motoboy"}
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
                        taxa_incluida: "",
                        forma_pagamento_2: "",
                        valor_2: "",
                        parcelas_2: "",
                        maquina_2: "",
                        taxa_incluida_2: "",
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
                      // Ativar modo coleta se editando uma coleta
                      if (e.tipo === "COLETA") {
                        setModoColeta(true);
                        setModoSimples(false);
                        setTrocaAtiva(false);
                        // Carregar campos do aparelho dos detalhes_upgrade
                        if (e.detalhes_upgrade) {
                          const lines = e.detalhes_upgrade.split("\n");
                          const batLine = lines.find(l => l.startsWith("Bateria:"));
                          if (batLine) setColetaBateria(batLine.replace("Bateria:", "").replace("%", "").trim());
                          const estLine = lines.find(l => l.startsWith("Estado:"));
                          if (estLine) setColetaEstado(estLine.replace("Estado:", "").trim() as "A+" | "A" | "AB" | "B" | "");
                          if (lines.some(l => l.includes("Com caixa"))) setColetaCaixa("sim");
                          else if (lines.some(l => l.includes("Sem caixa"))) setColetaCaixa("nao");
                          if (lines.some(l => l.includes("Com marcas"))) setColetaMarcas("sim");
                          else if (lines.some(l => l.includes("Sem marcas"))) setColetaMarcas("nao");
                        }
                      } else {
                        setModoColeta(false);
                      }
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
