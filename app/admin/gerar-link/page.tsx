"use client";

import { useState, useEffect, useMemo } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { WHATSAPP_DEFAULT } from "@/lib/whatsapp-config";
import { useVendedores, getWhatsAppFromVendedores } from "@/lib/vendedores";
import { corParaPT, corParaEN } from "@/lib/cor-pt";
import { getModeloBase } from "@/lib/produto-display";
import { buildWaFollowUpUrl } from "@/lib/whatsappFollowUp";
import { getPublicBaseUrl } from "@/lib/public-url";
import { formatPedidoMessage, type PedidoData, type PedidoTrocaItem } from "@/lib/formatPedido";
import { confirmar } from "@/lib/confirm-modal";

export default function GerarLinkPage() {
  const { user, password: adminPw, apiHeaders: adminHeaders, darkMode: dm } = useAdmin();

  const [produtos, setProdutos] = useState<string[]>([""]);
  const [preco, setPreco] = useState("");
  // Preços individuais por produto (idx → preco numérico), pra somar quando tem 2+ produtos
  const [precosPorProduto, setPrecosPorProduto] = useState<Record<number, number>>({});
  const [produtoManual, setProdutoManual] = useState(false);
  const [catSel, setCatSel] = useState("");
  const [pickerIdx, setPickerIdx] = useState<number | null>(null);

  // === Carrinho de produtos (padrão cart como /admin/entregas) ===
  interface CarrinhoLinkItem {
    key: string;
    nome: string;      // "IPHONE 17 256GB"
    cor: string;        // "Branco" (PT)
    corEN: string;      // "White" (EN) - for the link URL
    preco: number;
    categoria: string;
  }
  const [carrinhoLink, setCarrinhoLink] = useState<CarrinhoLinkItem[]>([]);
  const [addingProduct, setAddingProduct] = useState(true); // starts open for first product
  const [cartCatSel, setCartCatSel] = useState(""); // categoria selecionada no picker do carrinho
  const [cartCorPending, setCartCorPending] = useState<{ nome: string; preco: number; categoria: string } | null>(null); // modelo pendente de cor

  // Fetch preços de venda (tabela precos com categoria)
  const [precosVenda, setPrecosVenda] = useState<{ modelo: string; armazenamento: string; preco_pix: number; categoria: string }[]>([]);
  useEffect(() => {
    if (!adminPw) return;
    fetch("/api/admin/precos", { headers: adminHeaders() })
      .then(r => r.json())
      .then(j => {
        if (j.data && Array.isArray(j.data)) {
          setPrecosVenda(j.data.filter((p: { status?: string; preco_pix: number }) => p.status !== "esgotado" && p.preco_pix > 0).map((p: { modelo: string; armazenamento: string; preco_pix: number; categoria: string }) => ({
            modelo: p.modelo, armazenamento: p.armazenamento, preco_pix: p.preco_pix, categoria: p.categoria || "OUTROS"
          })));
        }
      })
      .catch(() => {});
  }, [adminPw]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [corSel, setCorSel] = useState("");
  const [coresExtras, setCoresExtras] = useState<string[]>([]); // cor por índice extra (produto 2, 3, ...)

  // Fetch estoque para obter cores reais disponíveis + seminovos
  const [estoqueItems, setEstoqueItems] = useState<{ produto: string; categoria: string; cor: string | null; qnt: number; tipo?: string; preco_sugerido?: number | null }[]>([]);
  useEffect(() => {
    if (!adminPw) return;
    fetch("/api/estoque", { headers: adminHeaders() })
      .then(r => r.json())
      .then(j => {
        if (j.data && Array.isArray(j.data)) {
          setEstoqueItems(
            j.data
              .filter((p: { status?: string; qnt?: number }) => p.status === "EM ESTOQUE" && (p.qnt || 0) > 0)
              .map((p: { produto: string; categoria: string; cor: string | null; qnt: number; tipo?: string; preco_sugerido?: number | null }) => ({
                produto: p.produto, categoria: p.categoria, cor: p.cor, qnt: p.qnt, tipo: p.tipo, preco_sugerido: p.preco_sugerido
              }))
          );
        }
      })
      .catch(() => {});
  }, [adminPw]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seminovos disponíveis em tempo real — agrupados por modelo base + cor
  // (mesma lógica do /admin/estoque via getModeloBase)
  const seminovosDisponiveis = useMemo(() => {
    const map = new Map<string, { nome: string; preco: number; count: number }>();
    for (const p of estoqueItems) {
      if (p.tipo !== "SEMINOVO") continue;
      const base = getModeloBase(p.produto, p.categoria || "SEMINOVOS");
      const corPt = p.cor ? corParaPT(p.cor) : "";
      const nome = (corPt ? `${base} ${corPt}` : base).toUpperCase();
      const key = nome.toUpperCase();
      const prev = map.get(key);
      if (prev) {
        // agrega preço médio ponderado (pula zeros)
        if ((p.preco_sugerido || 0) > 0) {
          prev.preco = prev.preco > 0
            ? Math.round((prev.preco * prev.count + (p.preco_sugerido || 0)) / (prev.count + 1))
            : (p.preco_sugerido || 0);
          prev.count += 1;
        }
      } else {
        map.set(key, { nome, preco: p.preco_sugerido || 0, count: (p.preco_sugerido || 0) > 0 ? 1 : 0 });
      }
    }
    return Array.from(map.values())
      .map(({ nome, preco }) => ({ nome, preco }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [estoqueItems]);

  // Cores do catálogo por modelo (catalogo_modelo_configs)
  const [catalogoCores, setCatalogoCores] = useState<Record<string, string[]>>({});
  useEffect(() => {
    fetch("/api/catalogo-cores")
      .then(r => r.json())
      .then(j => { if (j?.modelos) setCatalogoCores(j.modelos); })
      .catch(() => {});
  }, []);

  // Cores disponíveis pra QUALQUER nome de produto — fonte: catalogo_modelo_configs.
  const coresParaProduto = useMemo(() => (nomeProduto: string): string[] => {
    if (!nomeProduto) return [];
    // Apple Watch Ultra: cor já faz parte do nome do produto — NÃO mostrar seletor
    if (/Apple Watch Ultra/i.test(nomeProduto)) return [];
    // Acessórios sem cor (Apple Pencil, cabos, etc)
    if (/Pencil|Cable|Cabo|Carregador|Adapter|Hub|Case|Capa|Pelicula/i.test(nomeProduto)) return [];
    // Normaliza gerações (2ND/2º/2 → 2, 3RD/3º → 3) e remove ruído
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
      // iPad chip ↔ geração (iPad A16 = iPad 11, A15 = 10, A14 = 9/10)
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

    // Match por tokens: todos os tokens do catálogo devem existir no produto.
    // Escolhe o match com mais tokens (mais específico).
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

    // Dedup por tradução PT
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of raw) {
      const pt = corParaPT(c);
      const key = pt.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out.sort((a, b) => corParaPT(a).localeCompare(corParaPT(b)));
  }, [catalogoCores]);

  const coresDisponiveis = useMemo(() => coresParaProduto(produtos[0] || ""), [produtos, coresParaProduto]);

  // Auto-soma preço base quando há múltiplos produtos
  // Lookup preço de cada produto pelo nome na lista de preços
  const lookupPreco = (nome: string): number => {
    if (!nome) return 0;
    const match = precosVenda.find(p => `${p.modelo} ${p.armazenamento}`.trim() === nome);
    if (match) return match.preco_pix;
    const semi = seminovosDisponiveis.find(s => s.nome === nome);
    return semi?.preco || 0;
  };

  // Quando produtos mudam, recalcula preço base como soma de todos
  useEffect(() => {
    const prodsFilled = produtos.filter(Boolean);
    if (prodsFilled.length <= 1) return; // 1 produto: preço já setado no select
    const total = prodsFilled.reduce((s, p) => s + lookupPreco(p), 0);
    if (total > 0) setPreco(total.toLocaleString("pt-BR"));
  }, [produtos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-soma preço do carrinho
  useEffect(() => {
    if (carrinhoLink.length === 0) return;
    const total = carrinhoLink.reduce((s, item) => s + item.preco, 0);
    if (total > 0) setPreco(total.toLocaleString("pt-BR"));
  }, [carrinhoLink]);

  const [vendedorNome, setVendedorNome] = useState("");
  // Tag de campanha/origem do link (ex: "Instagram Stories", "Anuncio Meta",
  // "Indicacao") — fica em link_compras.campanha pra agrupar conversoes em
  // analytics. Texto livre + presets rapidos.
  const [campanha, setCampanha] = useState("");
  // Lista dinâmica de vendedores (editável em /admin/configuracoes).
  const vendedoresList = useVendedores(adminPw);
  const [forma, setForma] = useState("");
  const [parcelas, setParcelas] = useState("");
  const [entradaPix, setEntradaPix] = useState("");
  const [localEntrega, setLocalEntrega] = useState("");
  const [shoppingNome, setShoppingNome] = useState("");
  const [horario, setHorario] = useState("");
  const [dataEntrega, setDataEntrega] = useState("");
  const [desconto, setDesconto] = useState("");
  const [temTroca, setTemTroca] = useState(false);
  // Encomenda: cliente paga sinal antecipado (default 50%) e produto tem
  // prazo de chegada. So operador marca (cliente nao escolhe).
  const [encomenda, setEncomenda] = useState(false);
  const [previsaoChegada, setPrevisaoChegada] = useState("");
  const [sinalPct, setSinalPct] = useState("50");
  const [trocaProduto, setTrocaProduto] = useState("");
  const [trocaValor, setTrocaValor] = useState("");
  const [temSegundaTroca, setTemSegundaTroca] = useState(false);
  const [trocaCondicao, setTrocaCondicao] = useState("");
  const [trocaCor, setTrocaCor] = useState("");
  const [trocaCondicao2, setTrocaCondicao2] = useState("");
  const [trocaCor2, setTrocaCor2] = useState("");
  const [trocaProduto2, setTrocaProduto2] = useState("");
  const [trocaValor2, setTrocaValor2] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [pasteMsg, setPasteMsg] = useState("");
  // Cobranca extra opcional (capa, pelicula, brinde, etc). Soma no total do link.
  const [extraDescricao, setExtraDescricao] = useState("");
  const [extraValor, setExtraValor] = useState("");
  const [pagamentoPago, setPagamentoPago] = useState<"" | "link" | "pix">("");
  // Fluxo invertido: habilita botão "Pagar com Mercado Pago" no /compra.
  const [pagarMp, setPagarMp] = useState(false);
  const [taxaEntrega, setTaxaEntrega] = useState("");
  // Link Mercado Pago (gerado via API MP — independente do "Gerar Link" do form)
  const [mpLink, setMpLink] = useState("");
  const [mpLoading, setMpLoading] = useState(false);
  const [mpErr, setMpErr] = useState("");
  const [mpCopied, setMpCopied] = useState(false);

  // Dados do cliente (pré-preenchimento via cola de texto)
  const [incluirDadosCliente, setIncluirDadosCliente] = useState(false);
  const [dadosClienteTexto, setDadosClienteTexto] = useState("");
  const [cliNome, setCliNome] = useState("");
  const [cliCpf, setCliCpf] = useState("");
  const [cliEmail, setCliEmail] = useState("");
  const [cliTelefone, setCliTelefone] = useState("");
  const [cliCep, setCliCep] = useState("");
  const [cliEndereco, setCliEndereco] = useState("");
  const [cliNumero, setCliNumero] = useState("");
  const [cliComplemento, setCliComplemento] = useState("");
  const [cliBairro, setCliBairro] = useState("");
  const [parseMsg, setParseMsg] = useState("");
  const [simulacaoId, setSimulacaoId] = useState<string | null>(null);

  // Autocomplete de clientes cadastrados — dispara por nome OU CPF
  type CliSug = { nome: string; telefone: string | null; cpf: string | null; email: string | null; endereco: string | null; bairro: string | null; cidade: string | null; uf: string | null };
  const [cliSugs, setCliSugs] = useState<CliSug[]>([]);
  const [showCliSugs, setShowCliSugs] = useState(false);
  const [cliSugSource, setCliSugSource] = useState<"nome" | "cpf">("nome");
  useEffect(() => {
    const q = cliNome.trim();
    if (q.length < 2) { if (cliSugSource === "nome") setCliSugs([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/link-compras?autocomplete=1&q=${encodeURIComponent(q)}`, { headers: adminHeaders() });
        const j = await res.json();
        if (Array.isArray(j?.clientes)) { setCliSugs(j.clientes); setCliSugSource("nome"); }
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliNome]);
  useEffect(() => {
    const q = cliCpf.replace(/\D/g, "");
    if (q.length < 3) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/link-compras?autocomplete=1&q=${encodeURIComponent(q)}`, { headers: adminHeaders() });
        const j = await res.json();
        if (Array.isArray(j?.clientes) && j.clientes.length > 0) {
          setCliSugs(j.clientes); setCliSugSource("cpf"); setShowCliSugs(true);
        }
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliCpf]);
  const aplicarCliente = (c: CliSug) => {
    setCliNome(c.nome || "");
    if (c.telefone) setCliTelefone(c.telefone);
    if (c.cpf) setCliCpf(c.cpf);
    if (c.email) setCliEmail(c.email);
    // Só preenche endereço se o campo estiver vazio (preserva edição manual)
    if (c.endereco && !cliEndereco.trim()) setCliEndereco(c.endereco);
    if (c.bairro && !cliBairro.trim()) setCliBairro(c.bairro);
    setIncluirDadosCliente(true);
    setShowCliSugs(false);
  };

  // Prefill via query string (vindo de /admin/simulacoes)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("sim_id")) setSimulacaoId(q.get("sim_id"));
    if (q.get("prod")) {
      setProdutoManual(true);
      setProdutos([q.get("prod") || ""]);
    }
    if (q.get("preco")) setPreco(Number(q.get("preco")).toLocaleString("pt-BR"));
    if (q.get("tp")) { setTemTroca(true); setTrocaProduto(q.get("tp") || ""); }
    if (q.get("tv")) setTrocaValor(Number(q.get("tv")).toLocaleString("pt-BR"));
    if (q.get("cn") || q.get("cte")) {
      setIncluirDadosCliente(true);
      if (q.get("cn")) setCliNome(q.get("cn") || "");
      if (q.get("cte")) setCliTelefone(q.get("cte") || "");
    }
    if (q.get("sv")) setVendedorNome(q.get("sv") || "");
  }, []);

  // === Histórico de Links ===
  type LinkCompra = {
    id: string;
    short_code: string;
    url_curta: string | null;
    tipo: "COMPRA" | "TROCA" | "ENCOMENDA";
    cliente_nome: string | null;
    cliente_telefone: string | null;
    cliente_cpf: string | null;
    cliente_email: string | null;
    produto: string;
    produtos_extras: string[] | null;
    cor: string | null;
    valor: number;
    desconto: number;
    forma_pagamento: string | null;
    parcelas: string | null;
    entrada: number;
    troca_produto: string | null;
    troca_valor: number;
    troca_condicao: string | null;
    troca_cor: string | null;
    troca_produto2: string | null;
    troca_valor2: number;
    troca_condicao2: string | null;
    troca_cor2: string | null;
    vendedor: string | null;
    campanha: string | null;
    operador: string | null;
    status: string | null;
    cliente_dados_preenchidos: Record<string, unknown> | null;
    cliente_preencheu_em: string | null;
    entrega_id: string | null;
    observacao: string | null;
    arquivado: boolean;
    pagamento_pago: string | null;
    taxa_entrega: number;
    created_at: string;
  };
  const [aba, setAba] = useState<"novo" | "historico">("novo");
  const [histLinks, setHistLinks] = useState<LinkCompra[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histBusca, setHistBusca] = useState("");
  const [histTipo, setHistTipo] = useState<"" | "COMPRA" | "TROCA">("");
  const [histArquivado, setHistArquivado] = useState<"0" | "1">("0");
  const [histStatus, setHistStatus] = useState<"" | "ATIVO" | "PREENCHIDO" | "ENCAMINHADO">("");
  const [histOperador, setHistOperador] = useState<string>("");
  // Vendedor designado no link (separado do operador que criou)
  const [histVendedor, setHistVendedor] = useState<string>("");

  // Lista de operadores unicos extraida dos links carregados. Alimenta o
  // dropdown "Vendedor que criou" na aba Historico. Ordena alfabeticamente,
  // ignora vazios. O filtro em si e aplicado no cliente (nao no backend) pra
  // evitar round-trip e manter o dropdown populado ao alternar filtros.
  const operadoresDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const l of histLinks) {
      if (l.operador && l.operador.trim()) set.add(l.operador.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [histLinks]);

  // Lista de vendedores designados extraida dos links carregados.
  const vendedoresDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const l of histLinks) {
      if (l.vendedor && l.vendedor.trim()) set.add(l.vendedor.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [histLinks]);

  async function fetchHistorico() {
    if (!adminPw) return;
    setHistLoading(true);
    try {
      const params = new URLSearchParams();
      if (histBusca.trim()) params.set("q", histBusca.trim());
      if (histTipo) params.set("tipo", histTipo);
      if (histStatus) params.set("status", histStatus);
      params.set("arquivado", histArquivado);
      const res = await fetch(`/api/admin/link-compras?${params}`, { headers: adminHeaders(), cache: "no-store" });
      const j = await res.json();
      const rows = (j.data || []).map((r: LinkCompra & { produtos_extras: unknown }) => {
        let pe: string[] | null = null;
        if (Array.isArray(r.produtos_extras)) pe = r.produtos_extras as string[];
        else if (typeof r.produtos_extras === "string") {
          try { const parsed = JSON.parse(r.produtos_extras); pe = Array.isArray(parsed) ? parsed : null; } catch { pe = null; }
        }
        return { ...r, produtos_extras: pe };
      });
      setHistLinks(rows);
    } catch { /* ignore */ }
    setHistLoading(false);
  }

  useEffect(() => {
    if (aba === "historico") fetchHistorico();
  }, [aba, histBusca, histTipo, histArquivado, histStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  async function arquivarLink(id: string, arquivado: boolean) {
    await fetch("/api/admin/link-compras", {
      method: "PATCH",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id, arquivado }),
    });
    fetchHistorico();
  }

  // Modal "Marcar como preenchido" — reabre um link Aguardando e permite
  // ao admin copiar os dados do WhatsApp do cliente pro banco, garantindo
  // que o link apareça corretamente em /admin/simulacoes > Historico de
  // Formularios com nome e telefone preenchidos (em vez de ficar em branco).
  const [marcarLink, setMarcarLink] = useState<LinkCompra | null>(null);
  const [marcarNome, setMarcarNome] = useState("");
  const [marcarTelefone, setMarcarTelefone] = useState("");
  const [marcarCpf, setMarcarCpf] = useState("");
  const [marcarEmail, setMarcarEmail] = useState("");
  const [marcarSalvando, setMarcarSalvando] = useState(false);

  function abrirMarcarPreenchido(l: LinkCompra) {
    setMarcarLink(l);
    setMarcarNome(l.cliente_nome || "");
    setMarcarTelefone(l.cliente_telefone || "");
    setMarcarCpf(l.cliente_cpf || "");
    setMarcarEmail(l.cliente_email || "");
  }

  async function confirmarMarcarPreenchido() {
    if (!marcarLink) return;
    const nome = marcarNome.trim();
    const tel = marcarTelefone.trim();
    if (!nome) { alert("Informe o nome do cliente."); return; }
    if (!tel) { alert("Informe o WhatsApp do cliente."); return; }

    setMarcarSalvando(true);
    try {
      const patch: Record<string, unknown> = {
        id: marcarLink.id,
        cliente_nome: nome,
        cliente_telefone: tel,
        cliente_preencheu_em: new Date().toISOString(),
        status: "PREENCHIDO",
      };
      if (marcarCpf.trim()) patch.cliente_cpf = marcarCpf.trim();
      if (marcarEmail.trim()) patch.cliente_email = marcarEmail.trim();

      const res = await fetch("/api/admin/link-compras", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert("Erro ao marcar: " + (j.error || res.status));
        return;
      }
      setMarcarLink(null);
      fetchHistorico();
    } finally {
      setMarcarSalvando(false);
    }
  }

  async function excluirLink(id: string) {
    if (!confirm("Excluir este link do histórico definitivamente? Essa ação não pode ser desfeita.")) return;
    const res = await fetch("/api/admin/link-compras", {
      method: "DELETE",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert("Erro ao excluir: " + (j.error || res.status));
      return;
    }
    fetchHistorico();
  }

  async function copiarLinkHist(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch { /* ignore */ }
  }

  // === Editar link existente ===
  // editingLinkId persiste em sessionStorage pra sobreviver a refresh/troca de
  // aba — sem isso, o id ficava null e o click em "Gerar Link" caia no POST
  // (criando duplicata) em vez do PATCH.
  const [editingLinkId, setEditingLinkId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem("gerar_link_editing_id");
  });
  const [editingShortCode, setEditingShortCode] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem("gerar_link_editing_short");
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (editingLinkId) sessionStorage.setItem("gerar_link_editing_id", editingLinkId);
    else sessionStorage.removeItem("gerar_link_editing_id");
  }, [editingLinkId]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (editingShortCode) sessionStorage.setItem("gerar_link_editing_short", editingShortCode);
    else sessionStorage.removeItem("gerar_link_editing_short");
  }, [editingShortCode]);
  const [viewDataLink, setViewDataLink] = useState<LinkCompra | null>(null);
  const [editDados, setEditDados] = useState<Record<string, string>>({});
  const [editLink, setEditLink] = useState<Record<string, string>>({});
  const [editLinkExtras, setEditLinkExtras] = useState<string[] | null>(null);
  const [savingDados, setSavingDados] = useState(false);

  useEffect(() => {
    if (viewDataLink) {
      const src = (viewDataLink.cliente_dados_preenchidos || {}) as Record<string, unknown>;
      const obj: Record<string, string> = {};
      for (const [k, v] of Object.entries(src)) obj[k] = v == null ? "" : String(v);
      setEditDados(obj);
      setEditLink({
        produto: viewDataLink.produto || "",
        cor: viewDataLink.cor || "",
        valor: viewDataLink.valor != null ? String(viewDataLink.valor) : "",
        forma_pagamento: viewDataLink.forma_pagamento || "",
        parcelas: viewDataLink.parcelas != null ? String(viewDataLink.parcelas) : "",
        entrada: viewDataLink.entrada != null ? String(viewDataLink.entrada) : "",
        vendedor: viewDataLink.vendedor || "",
        cliente_nome: viewDataLink.cliente_nome || "",
        cliente_telefone: viewDataLink.cliente_telefone || "",
        cliente_cpf: viewDataLink.cliente_cpf || "",
        cliente_email: viewDataLink.cliente_email || "",
        troca_produto: viewDataLink.troca_produto || "",
        troca_valor: viewDataLink.troca_valor != null ? String(viewDataLink.troca_valor) : "",
        troca_produto2: viewDataLink.troca_produto2 || "",
        troca_valor2: viewDataLink.troca_valor2 != null ? String(viewDataLink.troca_valor2) : "",
        observacao: viewDataLink.observacao || "",
        desconto: viewDataLink.desconto != null ? String(viewDataLink.desconto) : "",
        pagamento_pago: viewDataLink.pagamento_pago || "",
      });
      // Produtos extras como array separado
      const pe = viewDataLink.produtos_extras;
      if (Array.isArray(pe)) setEditLinkExtras(pe as string[]);
      else if (typeof pe === "string") { try { const p = JSON.parse(pe); setEditLinkExtras(Array.isArray(p) ? p : null); } catch { setEditLinkExtras(null); } }
      else setEditLinkExtras(null);
    } else {
      setEditDados({});
      setEditLink({});
      setEditLinkExtras(null);
    }
  }, [viewDataLink]);

  async function salvarDadosCliente() {
    if (!viewDataLink) return;
    setSavingDados(true);
    try {
      const dadosPayload: Record<string, unknown> = { ...editDados };
      if (editDados.endereco || editDados.numero || editDados.complemento) {
        dadosPayload.endereco_completo = `${editDados.endereco || ""}${editDados.numero ? `, ${editDados.numero}` : ""}${editDados.complemento ? ` - ${editDados.complemento}` : ""}`.trim();
      }
      const body: Record<string, unknown> = {
        id: viewDataLink.id,
        cliente_dados_preenchidos: dadosPayload,
        produto: editLink.produto || null,
        cor: editLink.cor || null,
        valor: Number(editLink.valor) || 0,
        forma_pagamento: editLink.forma_pagamento || null,
        parcelas: editLink.parcelas ? Number(editLink.parcelas) : null,
        entrada: Number(editLink.entrada) || 0,
        vendedor: editLink.vendedor || null,
        cliente_nome: editLink.cliente_nome || null,
        cliente_telefone: editLink.cliente_telefone || null,
        cliente_cpf: editLink.cliente_cpf || null,
        cliente_email: editLink.cliente_email || null,
        troca_produto: editLink.troca_produto || null,
        troca_valor: Number(editLink.troca_valor) || 0,
        troca_produto2: editLink.troca_produto2 || null,
        troca_valor2: Number(editLink.troca_valor2) || 0,
        observacao: editLink.observacao || null,
        desconto: Number(editLink.desconto) || 0,
        produtos_extras: editLinkExtras || null,
        pagamento_pago: editLink.pagamento_pago || null,
      };
      const res = await fetch("/api/admin/link-compras", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert("Erro ao salvar: " + (j.error || res.status));
      } else {
        setViewDataLink(null);
        fetchHistorico();
      }
    } finally {
      setSavingDados(false);
    }
  }
  const [encaminharLink, setEncaminharLink] = useState<LinkCompra | null>(null);
  const [encaminharData, setEncaminharData] = useState("");
  const [encaminharHorario, setEncaminharHorario] = useState("");
  const [encaminharObs, setEncaminharObs] = useState("");
  const [encaminharVendedor, setEncaminharVendedor] = useState("");

  function editarLink(l: LinkCompra) {
    reutilizarLink(l);
    setEditingLinkId(l.id);
    setEditingShortCode(l.short_code || null);
    setPasteMsg(`✏️ Editando link ${l.short_code}. Ao clicar em "Gerar Link" as alterações serão salvas.`);
  }

  async function salvarEdicaoLink() {
    if (!editingLinkId) return false;
    const useCart = carrinhoLink.length > 0;
    const prodsFilled = useCart ? carrinhoLink.map(item => item.nome) : produtos.filter(Boolean);
    const corPTSimples = useCart ? (carrinhoLink[0]?.cor || "") : (corSel ? corParaPT(corSel) : "");
    const corENCanon = useCart ? (carrinhoLink[0]?.corEN || "") : (corSel ? (corParaEN(corSel) || corSel) : "");
    const nomeProdutoFinal = corPTSimples ? `${prodsFilled[0]} ${corPTSimples}` : (prodsFilled[0] || "");
    try {
      const res = await fetch("/api/admin/link-compras", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          id: editingLinkId,
          produto: nomeProdutoFinal,
          produtos_extras: prodsFilled.length > 1 ? prodsFilled.slice(1).map((nome, i) => {
            if (useCart) { const item = carrinhoLink[i + 1]; return item?.cor ? `${nome} ${item.cor}` : nome; }
            const c = coresExtras[i]; return c ? `${nome} ${corParaPT(c)}` : nome;
          }) : null,
          cor: corENCanon || null,
          valor: Number(rawPreco) || 0,
          desconto: descontoNum || 0,
          forma_pagamento: forma || null,
          parcelas: parcelas || null,
          entrada: Number(rawEntrada) || 0,
          troca_produto: trocaProduto || null,
          troca_valor: Number(trocaValor.replace(/\./g, "").replace(",", ".")) || 0,
          troca_condicao: trocaCondicao || null,
          troca_cor: trocaCor || null,
          troca_produto2: temSegundaTroca ? (trocaProduto2 || null) : null,
          troca_valor2: temSegundaTroca ? (Number(trocaValor2.replace(/\./g, "").replace(",", ".")) || 0) : 0,
          troca_condicao2: temSegundaTroca ? trocaCondicao2 || null : null,
          troca_cor2: temSegundaTroca ? trocaCor2 || null : null,
          vendedor: vendedorNome || null,
          campanha: campanha.trim() || null,
          cliente_nome: cliNome.trim() || null,
          cliente_telefone: cliTelefone.trim() || null,
          cliente_cpf: cliCpf.trim() || null,
          cliente_email: cliEmail.trim() || null,
          taxa_entrega: Number(rawTaxaEntrega) || 0,
        }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setPasteMsg(`❌ Erro ao salvar: ${j.error || res.status}`); return false; }

      // Atualizar dados do short link (activity_log) para o cliente ver as mudanças
      if (editingShortCode) {
        const aplicarCorExtra = (nome: string, idx: number): string => {
          if (useCart) { const item = carrinhoLink[idx]; return item?.cor ? `${nome} ${item.cor}` : nome; }
          const cor = coresExtras[idx - 1]; return cor ? `${nome} ${corParaPT(cor)}` : nome;
        };
        const whatsappDestino = getWhatsAppFromVendedores(vendedorNome, vendedoresList, WHATSAPP_DEFAULT);
        const shortData: Record<string, string> = {};
        shortData.p = nomeProdutoFinal;
        for (let i = 1; i < prodsFilled.length; i++) {
          shortData[`p${i + 1}`] = aplicarCorExtra(prodsFilled[i], i);
        }
        // Valor cobrado no link = produto (sinal se encomenda) + extra cobranca
        const extraNumBase = extraValor ? Number(extraValor.replace(/\./g, "").replace(",", ".")) || 0 : 0;
        const baseCobrado = encomenda && sinalPct
          ? Math.round(((Number(rawPreco) || 0) * Number(sinalPct)) / 100)
          : Number(rawPreco) || 0;
        const valorExibir = String(baseCobrado + extraNumBase);
        if (valorExibir && valorExibir !== "0") shortData.v = valorExibir;
        if (extraDescricao.trim()) shortData.ex_d = extraDescricao.trim();
        if (extraNumBase > 0) shortData.ex_v = String(extraNumBase);
        if (descontoNum > 0) shortData.dc = String(descontoNum);
        shortData.s = vendedorNome || "";
        if (campanha.trim()) shortData.cm = campanha.trim();
        shortData.w = whatsappDestino;
        if (forma) shortData.f = forma;
        if (parcelas) shortData.x = parcelas;
        if (rawEntrada && rawEntrada !== "0") shortData.e = rawEntrada;
        if (localEntrega) shortData.l = localEntrega;
        if (shoppingNome) shortData.sh = shoppingNome;
        if (horario) shortData.h = horario;
        if (dataEntrega) shortData.dt = dataEntrega;
        if (rawTaxaEntrega && rawTaxaEntrega !== "0") shortData.te = rawTaxaEntrega;
        if (trocaProduto) shortData.tp = trocaProduto;
        if (trocaCondicao) shortData.tcd = trocaCondicao;
        if (trocaCor) shortData.tc = trocaCor;
        const rawTroca = trocaValor.replace(/\./g, "").replace(",", ".");
        if (rawTroca && rawTroca !== "0") shortData.tv = rawTroca;
        if (temSegundaTroca && trocaProduto2) shortData.tp2 = trocaProduto2;
        const rawTroca2 = trocaValor2.replace(/\./g, "").replace(",", ".");
        if (temSegundaTroca && rawTroca2 && rawTroca2 !== "0") shortData.tv2 = rawTroca2;
        if (temSegundaTroca && trocaCondicao2) shortData.tcd2 = trocaCondicao2;
        if (temSegundaTroca && trocaCor2) shortData.tc2 = trocaCor2;
        if (pagamentoPago) shortData.pp = pagamentoPago;
        // pm=1 → formulário primeiro, depois cliente paga MP direto do /compra
        if (pagarMp) shortData.pm = "1";
        // Encomenda: flag + prazo + % do sinal. Cliente nao pode desativar isso
        // pelo URL (backend ignora quando o link_compras.tipo for diferente).
        if (encomenda) {
          shortData.enc = "1";
          if (previsaoChegada.trim()) shortData.prev = previsaoChegada.trim();
          if (sinalPct) shortData.sinal = String(sinalPct);
        }
        if (incluirDadosCliente) {
          if (cliNome.trim()) shortData.cn = cliNome.trim();
          if (cliCpf.trim()) shortData.ccpf = cliCpf.trim();
          if (cliEmail.trim()) shortData.cem = cliEmail.trim();
          if (cliTelefone.trim()) shortData.cte = cliTelefone.trim();
          if (cliCep.trim()) shortData.ccep = cliCep.trim();
          if (cliEndereco.trim()) shortData.cen = cliEndereco.trim();
          if (cliNumero.trim()) shortData.cnu = cliNumero.trim();
          if (cliComplemento.trim()) shortData.cco = cliComplemento.trim();
          if (cliBairro.trim()) shortData.cba = cliBairro.trim();
        }
        shortData.short = editingShortCode;
        await fetch("/api/short-link", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: editingShortCode, data: shortData }),
        }).catch(() => {}); // best-effort
      }

      // Checar se o backend reportou sincronizacao de entrega vinculada
      let sufixoEntrega = "";
      try {
        const j = await res.clone().json();
        if (j?.entregaSincronizada) sufixoEntrega = " (entrega atualizada)";
      } catch { /* ignore */ }

      setPasteMsg(`✅ Link ${editingShortCode || editingLinkId.slice(0, 6)} atualizado.${sufixoEntrega}`);
      setEditingLinkId(null);
      setEditingShortCode(null);
      // Recarrega o historico pra UI refletir o estado atualizado do banco
      // (antes, o state local ficava stale apos editar).
      fetchHistorico();
      return true;
    } catch (e) {
      setPasteMsg(`❌ Erro: ${String(e)}`);
      return false;
    }
  }

  async function encaminharParaEntrega() {
    if (!encaminharLink || !encaminharData) return;
    try {
      const res = await fetch("/api/admin/link-compras/encaminhar-entrega", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          link_id: encaminharLink.id,
          data_entrega: encaminharData,
          horario: encaminharHorario || null,
          observacao: encaminharObs || null,
          vendedor: encaminharVendedor || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) { alert("Erro: " + (j.error || res.status)); return; }
      setEncaminharLink(null);
      setEncaminharData(""); setEncaminharHorario(""); setEncaminharObs(""); setEncaminharVendedor("");
      fetchHistorico();
      alert("✅ Entrega criada com sucesso!");
    } catch (e) { alert("Erro: " + String(e)); }
  }

  function reutilizarLink(l: LinkCompra) {
    const prod1 = l.produto.replace(new RegExp(`\\s+${l.cor || ""}$`, "i"), "").trim();
    const extras = l.produtos_extras && Array.isArray(l.produtos_extras) ? l.produtos_extras : [];
    setProdutos([prod1, ...extras]);
    setProdutoManual(true);
    setCarrinhoLink([]);
    if (l.cor) setCorSel(l.cor);
    if (l.valor) setPreco(Number(l.valor).toLocaleString("pt-BR"));
    if (l.forma_pagamento) setForma(l.forma_pagamento);
    if (l.parcelas) setParcelas(String(l.parcelas));
    if (l.entrada) setEntradaPix(Number(l.entrada).toLocaleString("pt-BR"));
    if (l.desconto) setDesconto(Number(l.desconto).toLocaleString("pt-BR"));
    if (l.vendedor) setVendedorNome(l.vendedor);
    if (l.campanha) setCampanha(l.campanha);
    if (l.taxa_entrega) setTaxaEntrega(Number(l.taxa_entrega).toLocaleString("pt-BR"));
    if (l.cliente_nome || l.cliente_telefone || l.cliente_cpf) {
      setIncluirDadosCliente(true);
      if (l.cliente_nome) setCliNome(l.cliente_nome);
      if (l.cliente_telefone) setCliTelefone(l.cliente_telefone);
      if (l.cliente_cpf) setCliCpf(l.cliente_cpf);
    }
    if (l.troca_produto) {
      setTemTroca(true);
      setTrocaProduto(l.troca_produto);
      if (l.troca_valor) setTrocaValor(Number(l.troca_valor).toLocaleString("pt-BR"));
      if (l.troca_condicao) setTrocaCondicao(l.troca_condicao);
      if (l.troca_cor) setTrocaCor(l.troca_cor);
    }
    // Encomenda: restaura se o link original era tipo ENCOMENDA
    const lAny = l as unknown as { tipo?: string; previsao_chegada?: string | null; sinal_pct?: number | null; extra_descricao?: string | null; extra_valor?: number | null };
    if (lAny.tipo === "ENCOMENDA") {
      setEncomenda(true);
      if (lAny.previsao_chegada) setPrevisaoChegada(lAny.previsao_chegada);
      if (lAny.sinal_pct != null) setSinalPct(String(lAny.sinal_pct));
    }
    // Cobranca extra: restaura independente do tipo
    if (lAny.extra_descricao) setExtraDescricao(lAny.extra_descricao);
    if (lAny.extra_valor != null) setExtraValor(Number(lAny.extra_valor).toLocaleString("pt-BR"));
    setAba("novo");
  }

  // Prefill via query params (vindo de /admin/simulacoes, etc)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const qp = new URLSearchParams(window.location.search);
    if (!qp.toString()) return;
    const produtoQp = qp.get("produto");
    if (produtoQp) setProdutos([produtoQp]);
    const precoQp = qp.get("preco");
    if (precoQp) {
      const n = Math.round(parseFloat(precoQp));
      if (!isNaN(n) && n > 0) setPreco(n.toLocaleString("pt-BR"));
    }
    const corQp = qp.get("cor");
    if (corQp) setCorSel(corQp.toUpperCase());
    const trocaProd = qp.get("troca_produto");
    if (trocaProd) { setTemTroca(true); setTrocaProduto(trocaProd); }
    const trocaVal = qp.get("troca_valor");
    if (trocaVal) {
      const n = Math.round(parseFloat(trocaVal));
      if (!isNaN(n) && n > 0) setTrocaValor(n.toLocaleString("pt-BR"));
    }
    const trocaCorQp = qp.get("troca_cor");
    if (trocaCorQp) setTrocaCor(trocaCorQp);
    const trocaCondQp = qp.get("troca_condicao");
    if (trocaCondQp) setTrocaCondicao(trocaCondQp);
    // Dados do cliente vindos de simulação
    const cliNomeQp = qp.get("cliente_nome");
    if (cliNomeQp) { setIncluirDadosCliente(true); setCliNome(cliNomeQp); }
    const cliTelQp = qp.get("cliente_whatsapp") || qp.get("cliente_telefone");
    if (cliTelQp) setCliTelefone(cliTelQp);
    const vendedorQp = qp.get("vendedor");
    if (vendedorQp) setVendedorNome(vendedorQp);
    const simIdQp = qp.get("sim_id");
    if (simIdQp) setSimulacaoId(simIdQp);
    // Device 2
    const trocaProd2Qp = qp.get("troca_produto2");
    if (trocaProd2Qp) { setTemSegundaTroca(true); setTrocaProduto2(trocaProd2Qp); }
    const trocaVal2Qp = qp.get("troca_valor2");
    if (trocaVal2Qp) {
      const n = Math.round(parseFloat(trocaVal2Qp));
      if (!isNaN(n) && n > 0) setTrocaValor2(n.toLocaleString("pt-BR"));
    }
    const trocaCond2Qp = qp.get("troca_condicao2");
    if (trocaCond2Qp) setTrocaCondicao2(trocaCond2Qp);
    const trocaCor2Qp = qp.get("troca_cor2");
    if (trocaCor2Qp) setTrocaCor2(trocaCor2Qp);
    // Modo manual quando vem de simulação
    if (qp.get("produto")) setProdutoManual(true);
  }, []);

  const formatPreco = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    return Number(digits).toLocaleString("pt-BR");
  };

  // Parser de bloco de texto colado pelo vendedor (formato WhatsApp antigo)
  function parseDadosCliente(text: string) {
    const out: { nome?: string; cpf?: string; email?: string; telefone?: string; cep?: string; endereco?: string; numero?: string; complemento?: string; bairro?: string } = {};
    if (!text.trim()) return out;
    // Limpa emojis/asteriscos/markdown
    const clean = text.replace(/[✅☑️✔️]/g, "").replace(/\*/g, "").replace(/_/g, "");
    const lines = clean.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const m = line.match(/^([^:]{2,30}):\s*(.+)$/);
      if (!m) continue;
      const label = m[1].toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const value = m[2].trim();
      if (/nome/.test(label)) out.nome = value;
      else if (/cpf/.test(label)) out.cpf = value;
      else if (/e[-\s]?mail|email/.test(label)) out.email = value;
      else if (/telefone|celular|whats|fone|tel\b/.test(label)) out.telefone = value;
      else if (/cep/.test(label)) out.cep = value;
      else if (/endereco|rua|logradouro/.test(label)) {
        const parts = value.split(",").map((p) => p.trim());
        out.endereco = parts[0];
        if (parts[1]) out.numero = parts[1].replace(/^n[oº°]?\.?\s*/i, "");
        if (parts[2]) out.complemento = parts.slice(2).join(", ");
      } else if (/numero|número/.test(label)) out.numero = value.replace(/^n[oº°]?\.?\s*/i, "");
      else if (/complemento/.test(label)) out.complemento = value;
      else if (/bairro/.test(label)) {
        // "São Francisco - Niterói - RJ" — pega só a 1ª parte
        const parts = value.split(/\s*-\s*/).map((p) => p.trim());
        out.bairro = parts[0];
      }
    }
    return out;
  }

  function aplicarParse() {
    const d = parseDadosCliente(dadosClienteTexto);
    const encontrados: string[] = [];
    if (d.nome) { setCliNome(d.nome); encontrados.push("Nome"); }
    if (d.cpf) { setCliCpf(d.cpf); encontrados.push("CPF"); }
    if (d.email) { setCliEmail(d.email); encontrados.push("E-mail"); }
    if (d.telefone) { setCliTelefone(d.telefone); encontrados.push("Telefone"); }
    if (d.cep) { setCliCep(d.cep); encontrados.push("CEP"); }
    // Só preenche endereço se o campo estiver vazio (preserva edição manual)
    if (d.endereco) { if (!cliEndereco.trim()) setCliEndereco(d.endereco); encontrados.push("Endereço"); }
    if (d.numero) { if (!cliNumero.trim()) setCliNumero(d.numero); encontrados.push("Número"); }
    if (d.complemento) { if (!cliComplemento.trim()) setCliComplemento(d.complemento); encontrados.push("Complemento"); }
    if (d.bairro) { if (!cliBairro.trim()) setCliBairro(d.bairro); encontrados.push("Bairro"); }
    if (encontrados.length === 0) setParseMsg("❌ Não consegui identificar nenhum dado. Verifique o formato.");
    else setParseMsg(`✅ ${encontrados.length} campo(s) extraído(s): ${encontrados.join(", ")}`);
    setTimeout(() => setParseMsg(""), 5000);
  }

  function limparDadosCliente() {
    setDadosClienteTexto("");
    setCliNome(""); setCliCpf(""); setCliEmail(""); setCliTelefone("");
    setCliCep(""); setCliEndereco(""); setCliNumero(""); setCliComplemento(""); setCliBairro("");
    setParseMsg("");
  }

  function limparTudo() {
    // Produtos / carrinho
    setProdutos([""]); setPreco(""); setPrecosPorProduto({}); setCarrinhoLink([]);
    setProdutoManual(false); setCorSel(""); setCoresExtras([]); setAddingProduct(false);
    // Pagamento
    setForma("Cartao Credito"); setParcelas("21"); setEntradaPix(""); setDesconto("");
    setPagamentoPago("");
    setPagarMp(false);
    // Entrega
    setLocalEntrega("shopping"); setShoppingNome(""); setHorario(""); setDataEntrega(""); setTaxaEntrega("");
    // Troca
    setTemTroca(false); setTrocaProduto(""); setTrocaValor(""); setTrocaCondicao(""); setTrocaCor("");
    setTemSegundaTroca(false); setTrocaProduto2(""); setTrocaValor2(""); setTrocaCondicao2(""); setTrocaCor2("");
    // Encomenda
    setEncomenda(false); setPrevisaoChegada(""); setSinalPct("50");
    setExtraDescricao(""); setExtraValor("");
    // Cliente
    setIncluirDadosCliente(false); limparDadosCliente();
    // Link gerado
    setGeneratedLink(""); setCopied(false); setPasteMsg("");
    setVendedorNome("");
    setCampanha("");
    setEditingLinkId(null); setEditingShortCode(null);
  }

  const rawPreco = preco.replace(/\./g, "").replace(",", ".");
  const rawEntrada = entradaPix.replace(/\./g, "").replace(",", ".");
  const rawTrocaVal = trocaValor.replace(/\./g, "").replace(",", ".");
  const rawTrocaVal2 = trocaValor2.replace(/\./g, "").replace(",", ".");
  const rawTaxaEntrega = taxaEntrega.replace(/\./g, "").replace(",", ".");

  // Taxas de parcelamento (mesma tabela do sistema)
  const TAXAS: Record<number, number> = {
    1: 4, 2: 5, 3: 5.5, 4: 6, 5: 7, 6: 7.5,
    7: 8, 8: 9.1, 9: 10, 10: 11, 11: 12, 12: 13,
    13: 14, 14: 15, 15: 16, 16: 17, 17: 18, 18: 19,
    19: 20, 20: 21, 21: 22,
  };

  // Cálculos
  const precoBase = parseFloat(rawPreco) || 0;
  const descontoNum = parseFloat(desconto.replace(/\./g, "").replace(",", ".")) || 0;
  const trocaNum = parseFloat(rawTrocaVal) || 0;
  const trocaNum2 = parseFloat(rawTrocaVal2) || 0;
  const trocaTotal = trocaNum + trocaNum2;
  const entradaNum = parseFloat(rawEntrada) || 0;
  const valorSemTaxa = Math.max(0, precoBase - descontoNum - trocaTotal);
  const valorParcelar = Math.max(0, valorSemTaxa - entradaNum);
  const numParcelas = parseInt(parcelas) || 0;
  const taxa = ((forma === "Cartao Credito" || forma === "Link de Pagamento") && numParcelas > 0) ? (TAXAS[numParcelas] || 0) : 0;
  const valorComTaxa = taxa > 0 ? Math.ceil(valorParcelar * (1 + taxa / 100)) : valorParcelar;
  const valorParcela = numParcelas > 0 ? valorComTaxa / numParcelas : 0;
  const valorTotal = entradaNum + valorComTaxa;

  // WhatsApp por vendedor (centralizado em lib/whatsapp-config.ts)

  async function gerarLink() {
    // Suporta carrinho (modo estoque) ou produtos array (modo manual/legado)
    const useCart = carrinhoLink.length > 0;
    const prodsFilled = useCart ? carrinhoLink.map(item => item.nome) : produtos.filter(Boolean);
    if (prodsFilled.length === 0) {
      setPasteMsg("⚠️ Selecione ao menos um produto antes de gerar o link.");
      return;
    }

    // Encomenda: confirmacao explicita antes de gerar — operador valida prazo,
    // valor de sinal/integral e o que cliente vera no /compra. Evita esquecer
    // de preencher o prazo ou marcar encomenda por engano. So pede confirmacao
    // em criacao nova (edicao ja tem fluxo proprio acima).
    if (encomenda && !editingLinkId) {
      const precoEnc = Number(rawPreco) || 0;
      const trocaTEnc = (Number(rawTrocaVal) || 0) + (Number(rawTrocaVal2) || 0);
      const baseEnc = Math.max(precoEnc - trocaTEnc, 0);
      const pctEnc = Number(sinalPct) || 0;
      const temSinalConf = pctEnc > 0 && pctEnc < 100;
      const sinalConf = temSinalConf ? Math.round((baseEnc * pctEnc) / 100) : baseEnc;
      const restConf = temSinalConf ? Math.max(baseEnc - sinalConf, 0) : 0;
      if (!previsaoChegada.trim()) {
        setPasteMsg("⚠️ Encomenda precisa de prazo de entrega — preencha antes de gerar.");
        return;
      }
      const linhasBody: string[] = [];
      linhasBody.push(`📦 PEDIDO SOB ENCOMENDA`);
      linhasBody.push(`Prazo: ${previsaoChegada} após pagamento`);
      linhasBody.push("");
      if (temSinalConf) {
        linhasBody.push(`Cliente paga AGORA: R$ ${sinalConf.toLocaleString("pt-BR")} (sinal ${pctEnc}%)`);
        if (restConf > 0) linhasBody.push(`Restante na entrega: R$ ${restConf.toLocaleString("pt-BR")}`);
      } else {
        linhasBody.push(`Cliente paga AGORA: R$ ${baseEnc.toLocaleString("pt-BR")} (integral)`);
      }
      if (trocaTEnc > 0) {
        linhasBody.push("");
        linhasBody.push(`Troca: R$ ${trocaTEnc.toLocaleString("pt-BR")} (avaliacao recolhida na retirada)`);
      }
      const ok = await confirmar({
        title: "Confirmar encomenda?",
        body: linhasBody.join("\n"),
        confirmLabel: "📦 Gerar link de encomenda",
        cancelLabel: "Voltar e revisar",
      });
      if (!ok) return;
    }
    // Cor do primeiro produto: do carrinho ou do seletor legado
    const corPTSimples = useCart ? (carrinhoLink[0].cor || "") : (corSel ? corParaPT(corSel) : "");
    const corENCanon = useCart ? (carrinhoLink[0].corEN || "") : (corSel ? (corParaEN(corSel) || corSel) : "");
    const nomeProdutoFinal = corPTSimples ? `${prodsFilled[0]} ${corPTSimples}` : prodsFilled[0];
    if (!nomeProdutoFinal || !nomeProdutoFinal.trim()) {
      setPasteMsg("⚠️ Nome do produto vazio — selecione novamente.");
      return;
    }

    // Modo edição: salva por cima e não cria short_code novo
    if (editingLinkId) {
      const ok = await salvarEdicaoLink();
      if (ok) { setAba("historico"); fetchHistorico(); }
      return;
    }

    const whatsappDestino = getWhatsAppFromVendedores(vendedorNome, vendedoresList, WHATSAPP_DEFAULT);
    const baseUrl = getPublicBaseUrl();

    // Helper: aplica cor extra no nome (PT simples)
    const aplicarCorExtra = (nome: string, idx: number): string => {
      if (useCart) {
        const item = carrinhoLink[idx];
        return item?.cor ? `${nome} ${item.cor}` : nome;
      }
      const cor = coresExtras[idx - 1];
      if (!cor) return nome;
      return `${nome} ${corParaPT(cor)}`;
    };

    // Montar dados com keys curtas
    const shortData: Record<string, string> = {};
    // Incluir cor no nome do produto se selecionada
    shortData.p = nomeProdutoFinal;
    for (let i = 1; i < prodsFilled.length; i++) {
      shortData[`p${i + 1}`] = aplicarCorExtra(prodsFilled[i], i);
      // Preço individual do produto extra
      const precoExtra = useCart ? (carrinhoLink[i]?.preco || 0) : (precosPorProduto[i] || 0);
      if (precoExtra > 0) shortData[`v${i + 1}`] = String(precoExtra);
    }
    // Encomenda com sinal — cobra sinal no link em vez do total
    const extraNumMp = extraValor ? Number(extraValor.replace(/\./g, "").replace(",", ".")) || 0 : 0;
    const baseCobradoMp = encomenda && sinalPct
      ? Math.round(((Number(rawPreco) || 0) * Number(sinalPct)) / 100)
      : Number(rawPreco) || 0;
    const valorExibirMp = String(baseCobradoMp + extraNumMp);
    if (valorExibirMp && valorExibirMp !== "0") shortData.v = valorExibirMp;
    if (extraDescricao.trim()) shortData.ex_d = extraDescricao.trim();
    if (extraNumMp > 0) shortData.ex_v = String(extraNumMp);
    if (descontoNum > 0) shortData.dc = String(descontoNum);
    shortData.s = vendedorNome || "";
    if (campanha.trim()) shortData.cm = campanha.trim();
    shortData.w = whatsappDestino;
    if (forma) shortData.f = forma;
    if (parcelas) shortData.x = parcelas;
    if (rawEntrada && rawEntrada !== "0") shortData.e = rawEntrada;
    if (localEntrega) shortData.l = localEntrega;
    if (shoppingNome) shortData.sh = shoppingNome;
    if (horario) shortData.h = horario;
    if (dataEntrega) shortData.dt = dataEntrega;
    if (rawTaxaEntrega && rawTaxaEntrega !== "0") shortData.te = rawTaxaEntrega;
    if (trocaProduto) shortData.tp = trocaProduto;
    if (trocaCondicao) shortData.tcd = trocaCondicao;
    if (trocaCor) shortData.tc = trocaCor;
    const rawTroca = trocaValor.replace(/\./g, "").replace(",", ".");
    if (rawTroca && rawTroca !== "0") shortData.tv = rawTroca;
    if (temSegundaTroca && trocaProduto2) shortData.tp2 = trocaProduto2;
    const rawTroca2Data = trocaValor2.replace(/\./g, "").replace(",", ".");
    if (temSegundaTroca && rawTroca2Data && rawTroca2Data !== "0") shortData.tv2 = rawTroca2Data;
    if (temSegundaTroca && trocaCondicao2) shortData.tcd2 = trocaCondicao2;
    if (temSegundaTroca && trocaCor2) shortData.tc2 = trocaCor2;
    if (pagamentoPago) shortData.pp = pagamentoPago;
    // pm=1 → habilita botão "Pagar com Mercado Pago" no /compra (fluxo invertido)
    if (pagarMp) shortData.pm = "1";

    // Dados do cliente pré-preenchidos (quando o vendedor incluir)
    if (incluirDadosCliente) {
      if (cliNome.trim()) shortData.cn = cliNome.trim();
      if (cliCpf.trim()) shortData.ccpf = cliCpf.trim();
      if (cliEmail.trim()) shortData.cem = cliEmail.trim();
      if (cliTelefone.trim()) shortData.cte = cliTelefone.trim();
      if (cliCep.trim()) shortData.ccep = cliCep.trim();
      if (cliEndereco.trim()) shortData.cen = cliEndereco.trim();
      if (cliNumero.trim()) shortData.cnu = cliNumero.trim();
      if (cliComplemento.trim()) shortData.cco = cliComplemento.trim();
      if (cliBairro.trim()) shortData.cba = cliBairro.trim();
    }

    // Salvar no banco e gerar código curto de 6 chars
    try {
      const res = await fetch("/api/short-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: shortData }),
      });
      const json = await res.json();
      if (json.code) {
        const urlCurta = `${baseUrl}/c/${json.code}`;
        setGeneratedLink(urlCurta);
        setCopied(false);

        // Salvar no histórico persistente de links de compra
        try {
          const resHist = await fetch("/api/admin/link-compras", {
            method: "POST",
            headers: adminHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              short_code: json.code,
              url_curta: urlCurta,
              // Encomenda tem precedencia sobre troca: pode ter encomenda COM
              // troca, mas o tipo do link conta pra fluxo do /compra (banner).
              // sinal_pct > 0 = cobra so esse % no link (sinal antecipado).
              // sinal_pct null/0 = pagamento integral (valor cheio).
              tipo: encomenda ? "ENCOMENDA" : (trocaProduto ? "TROCA" : "COMPRA"),
              previsao_chegada: encomenda ? (previsaoChegada.trim() || null) : null,
              sinal_pct: encomenda && sinalPct ? Number(sinalPct) : null,
              extra_descricao: extraDescricao.trim() || null,
              extra_valor: extraValor ? Number(extraValor.replace(/\./g, "").replace(",", ".")) || null : null,
              cliente_nome: cliNome.trim() || null,
              cliente_telefone: cliTelefone.trim() || null,
              cliente_cpf: cliCpf.trim() || null,
              cliente_email: cliEmail.trim() || null,
              produto: nomeProdutoFinal,
              produtos_extras: prodsFilled.length > 1 ? prodsFilled.slice(1).map((nome, i) => aplicarCorExtra(nome, i + 1)) : null,
              cor: corENCanon || null,
              // valor cobrado no link = produto (ou sinal se encomenda) + extra
              valor: (() => {
                const base = encomenda && sinalPct
                  ? Math.round(((Number(rawPreco) || 0) * Number(sinalPct)) / 100)
                  : Number(rawPreco) || 0;
                const extra = extraValor ? Number(extraValor.replace(/\./g, "").replace(",", ".")) || 0 : 0;
                return base + extra;
              })(),
              desconto: descontoNum || 0,
              forma_pagamento: forma || null,
              parcelas: parcelas || null,
              entrada: Number(rawEntrada) || 0,
              troca_produto: trocaProduto || null,
              troca_valor: Number(trocaValor.replace(/\./g, "").replace(",", ".")) || 0,
              troca_condicao: trocaCondicao || null,
              troca_cor: trocaCor || null,
              troca_produto2: temSegundaTroca ? trocaProduto2 || null : null,
              troca_valor2: temSegundaTroca ? Number(trocaValor2.replace(/\./g, "").replace(",", ".")) || 0 : 0,
              troca_condicao2: temSegundaTroca ? trocaCondicao2 || null : null,
              troca_cor2: temSegundaTroca ? trocaCor2 || null : null,
              vendedor: vendedorNome || null,
              campanha: campanha.trim() || null,
              simulacao_id: simulacaoId,
              pagamento_pago: pagamentoPago || null,
              taxa_entrega: Number(rawTaxaEntrega) || 0,
            }),
          });
          if (!resHist.ok) {
            const err = await resHist.json().catch(() => ({ error: `HTTP ${resHist.status}` }));
            setPasteMsg(`⚠️ Link gerado mas falhou ao salvar no histórico: ${err.error || resHist.status}`);
          }
        } catch (e) {
          setPasteMsg(`⚠️ Link gerado mas falhou ao salvar no histórico: ${String(e)}`);
        }

        return;
      }
    } catch { /* fallback below */ }

    // Fallback: base64url comprimido (se API falhar)
    const jsonStr = JSON.stringify(shortData);
    const b64 = btoa(unescape(encodeURIComponent(jsonStr))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    setGeneratedLink(`${baseUrl}/c/${b64}`);
    setCopied(false);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = generatedLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // ── Link Mercado Pago ─────────────────────────────────────
  async function gerarLinkMP() {
    setMpErr("");
    setMpLink("");
    setMpCopied(false);

    // Valida valor e parcelas
    if (!valorComTaxa || valorComTaxa <= 0) {
      setMpErr("Informe o valor do produto antes de gerar o link MP.");
      return;
    }
    const useCart = carrinhoLink.length > 0;
    const prodsFilled = useCart ? carrinhoLink.map(i => i.nome) : produtos.filter(Boolean);
    if (prodsFilled.length === 0) {
      setMpErr("Selecione ao menos um produto.");
      return;
    }
    // `maxP` = máximo de parcelas permitido ao cliente no checkout MP.
    // Sempre 12, pra cliente poder escolher qualquer parcelamento até o limite
    // do "parcelado vendedor" configurado na conta MP. `numParcelas` (o que o
    // admin escolheu no form) entra só como `default_installments` (sugestão).
    const maxP = 12;
    const defaultInstallments = numParcelas > 0 ? Math.min(numParcelas, 12) : undefined;
    const titulo = prodsFilled.join(" + ");

    // Monta shortData enxuto pro formulário pós-pagamento (só o que importa:
    // produto, vendedor, entrega). Client data e forma pagamento ficam por
    // conta do /compra + override do pagamento_pago=mp.
    const corPTSimples = useCart ? (carrinhoLink[0].cor || "") : (corSel ? corParaPT(corSel) : "");
    const corENCanon = useCart ? (carrinhoLink[0].corEN || "") : (corSel ? (corParaEN(corSel) || corSel) : "");
    const nomeProdutoFinal = corPTSimples ? `${prodsFilled[0]} ${corPTSimples}` : prodsFilled[0];
    const aplicarCorExtra = (nome: string, idx: number): string => {
      if (useCart) {
        const item = carrinhoLink[idx];
        return item?.cor ? `${nome} ${item.cor}` : nome;
      }
      const cor = coresExtras[idx - 1];
      if (!cor) return nome;
      return `${nome} ${corParaPT(cor)}`;
    };
    const whatsappDestino = getWhatsAppFromVendedores(vendedorNome, vendedoresList, WHATSAPP_DEFAULT);

    const shortData: Record<string, string> = {};
    shortData.p = nomeProdutoFinal;
    for (let i = 1; i < prodsFilled.length; i++) {
      shortData[`p${i + 1}`] = aplicarCorExtra(prodsFilled[i], i);
    }
    // IMPORTANTE: passamos o `rawPreco` (valor cheio do produto) e não o
    // `valorComTaxa` porque o /compra recalcula `valorBase = preco - desconto - troca`.
    // Se passássemos valorComTaxa (que já desconta troca), o form subtrairia
    // troca de novo e daria valor errado.
    // Encomenda com sinal — cobra sinal no link em vez do total
    const extraNumMp2 = extraValor ? Number(extraValor.replace(/\./g, "").replace(",", ".")) || 0 : 0;
    const baseCobradoMp2 = encomenda && sinalPct
      ? Math.round(((Number(rawPreco) || 0) * Number(sinalPct)) / 100)
      : Number(rawPreco) || 0;
    const valorExibirMp2 = String(baseCobradoMp2 + extraNumMp2);
    if (valorExibirMp2 && valorExibirMp2 !== "0") shortData.v = valorExibirMp2;
    if (extraDescricao.trim()) shortData.ex_d = extraDescricao.trim();
    if (extraNumMp2 > 0) shortData.ex_v = String(extraNumMp2);
    if (descontoNum > 0) shortData.dc = String(descontoNum);
    // Forma + parcelas + entrada PIX — pra /compra montar "Pagamento 1/2"
    // quando há entrada PIX pendente (valor parcelado no link MP + PIX separado).
    shortData.f = "Link de Pagamento";
    if (parcelas) shortData.x = parcelas;
    if (rawEntrada && rawEntrada !== "0") shortData.e = rawEntrada;
    shortData.s = vendedorNome || "";
    shortData.w = whatsappDestino;
    if (localEntrega) shortData.l = localEntrega;
    if (shoppingNome) shortData.sh = shoppingNome;
    if (horario) shortData.h = horario;
    if (dataEntrega) shortData.dt = dataEntrega;
    if (rawTaxaEntrega && rawTaxaEntrega !== "0") shortData.te = rawTaxaEntrega;

    // Dados de troca — pra seção "Troca confirmada" aparecer preenchida no /compra
    if (trocaProduto) shortData.tp = trocaProduto;
    if (trocaCondicao) shortData.tcd = trocaCondicao;
    if (trocaCor) shortData.tc = trocaCor;
    const rawTrocaMp = trocaValor.replace(/\./g, "").replace(",", ".");
    if (rawTrocaMp && rawTrocaMp !== "0") shortData.tv = rawTrocaMp;
    if (temSegundaTroca && trocaProduto2) shortData.tp2 = trocaProduto2;
    if (temSegundaTroca && trocaCondicao2) shortData.tcd2 = trocaCondicao2;
    if (temSegundaTroca && trocaCor2) shortData.tc2 = trocaCor2;
    const rawTroca2Mp = trocaValor2.replace(/\./g, "").replace(",", ".");
    if (temSegundaTroca && rawTroca2Mp && rawTroca2Mp !== "0") shortData.tv2 = rawTroca2Mp;

    // Encomenda (so operador marca — cliente nao altera pelo URL)
    if (encomenda) {
      shortData.enc = "1";
      if (previsaoChegada.trim()) shortData.prev = previsaoChegada.trim();
      if (sinalPct) shortData.sinal = String(sinalPct);
    }

    // Dados do cliente pré-preenchidos (quando o vendedor incluir)
    if (incluirDadosCliente) {
      if (cliNome.trim()) shortData.cn = cliNome.trim();
      if (cliCpf.trim()) shortData.ccpf = cliCpf.trim();
      if (cliEmail.trim()) shortData.cem = cliEmail.trim();
      if (cliTelefone.trim()) shortData.cte = cliTelefone.trim();
      if (cliCep.trim()) shortData.ccep = cliCep.trim();
      if (cliEndereco.trim()) shortData.cen = cliEndereco.trim();
      if (cliNumero.trim()) shortData.cnu = cliNumero.trim();
      if (cliComplemento.trim()) shortData.cco = cliComplemento.trim();
      if (cliBairro.trim()) shortData.cba = cliBairro.trim();
    }

    setMpLoading(true);
    try {
      // 1. Cria short-link (armazena dados do produto/vendedor pro /compra)
      let shortCode = "";
      try {
        const shortRes = await fetch("/api/short-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: shortData }),
        });
        const shortJson = await shortRes.json();
        if (shortJson.code) shortCode = shortJson.code;
      } catch {
        // Se falhar, seguimos sem shortCode — MP cai na página genérica de sucesso
      }

      // 2. Cria preferência no MP (back_url aponta pro /c/{shortCode}?pp=mp)
      const res = await fetch("/api/admin/mp-preference", {
        method: "POST",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          titulo,
          valor: valorComTaxa,
          maxParcelas: maxP,
          defaultInstallments,
          shortCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMpErr(data?.error || "Falha ao gerar link MP.");
        return;
      }
      const initPoint = data.init_point || data.sandbox_init_point || "";
      setMpLink(initPoint);

      // 3. Salvar no histórico persistente (mesma tabela dos links comuns).
      // Assim o link MP aparece no /admin/historico-links junto com os demais,
      // com `forma_pagamento="mp"` e os campos `mp_link`/`mp_preference_id`
      // pra diferenciar e permitir reenvio/rastreio via webhook MP.
      if (shortCode) {
        try {
          const baseUrl = getPublicBaseUrl();
          const urlCurta = `${baseUrl}/c/${shortCode}`;
          await fetch("/api/admin/link-compras", {
            method: "POST",
            headers: adminHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              short_code: shortCode,
              url_curta: urlCurta,
              tipo: encomenda ? "ENCOMENDA" : (trocaProduto ? "TROCA" : "COMPRA"),
              previsao_chegada: encomenda ? (previsaoChegada.trim() || null) : null,
              sinal_pct: encomenda ? (Number(sinalPct) || 50) : null,
              extra_descricao: extraDescricao.trim() || null,
              extra_valor: extraValor ? Number(extraValor.replace(/\./g, "").replace(",", ".")) || null : null,
              cliente_nome: cliNome.trim() || null,
              cliente_telefone: cliTelefone.trim() || null,
              cliente_cpf: cliCpf.trim() || null,
              cliente_email: cliEmail.trim() || null,
              produto: nomeProdutoFinal,
              produtos_extras: prodsFilled.length > 1 ? prodsFilled.slice(1).map((nome, i) => aplicarCorExtra(nome, i + 1)) : null,
              cor: corENCanon || null,
              // Valor cheio do produto (consistente com botão laranja) —
              // valorComTaxa (valor cobrado no MP) fica só em mp_link/mp_preference_id.
              valor: Number(rawPreco) || 0,
              desconto: descontoNum || 0,
              forma_pagamento: "mp",
              parcelas: numParcelas > 0 ? String(numParcelas) : null,
              entrada: Number(rawEntrada) || 0,
              troca_produto: trocaProduto || null,
              troca_valor: Number(trocaValor.replace(/\./g, "").replace(",", ".")) || 0,
              troca_condicao: trocaCondicao || null,
              troca_cor: trocaCor || null,
              troca_produto2: temSegundaTroca ? trocaProduto2 || null : null,
              troca_valor2: temSegundaTroca ? Number(trocaValor2.replace(/\./g, "").replace(",", ".")) || 0 : 0,
              troca_condicao2: temSegundaTroca ? trocaCondicao2 || null : null,
              troca_cor2: temSegundaTroca ? trocaCor2 || null : null,
              vendedor: vendedorNome || null,
              simulacao_id: simulacaoId,
              mp_link: initPoint,
              mp_preference_id: data.preference_id || null,
            }),
          });
        } catch {
          // Não bloqueia o fluxo: o link MP já foi gerado, só falhou o histórico.
        }
      }
    } catch {
      setMpErr("Erro de rede ao contatar o servidor.");
    } finally {
      setMpLoading(false);
    }
  }

  async function copiarMpLink() {
    try {
      await navigator.clipboard.writeText(mpLink);
      setMpCopied(true);
      setTimeout(() => setMpCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = mpLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setMpCopied(true);
      setTimeout(() => setMpCopied(false), 2000);
    }
  }

  async function colarResumo() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text.length < 10) { setPasteMsg("Nada no clipboard."); return; }

      // Limpa asteriscos do WhatsApp bold
      const clean = (s: string) => s.replace(/\*/g, "").trim();
      const lines = text.split("\n").map(l => clean(l));
      let filled = 0;
      const parsedProdutos: string[] = [];

      for (const line of lines) {
        const low = line.toLowerCase();
        const extract = (l: string) => {
          const idx = l.indexOf(":");
          return idx >= 0 ? l.slice(idx + 1).trim() : l.trim();
        };

        if (low.includes("produto desejado") || low.match(/^produto\s*:/)) {
          const val = extract(line);
          if (val) {
            // Pode ter múltiplos separados por vírgula ou "+"
            const multi = val.split(/[,+]/).map(s => s.trim()).filter(Boolean);
            parsedProdutos.push(...(multi.length > 0 ? multi : [val]));
            filled++;
          }
        } else if (low.includes("forma de pagamento") || low.includes("forma pagamento")) {
          const val = extract(line);
          if (val) {
            const parcMatch = val.match(/(\d+)\s*x/i);
            if (parcMatch) { setParcelas(parcMatch[1]); filled++; }
            const lowVal = val.toLowerCase();
            if (lowVal.includes("pix") && (lowVal.includes("cart") || parcMatch)) {
              // "PIX + Cartão" ou "entrada pix + 18x cartão"
              setForma("Pix + Cartao"); filled++;
              // Tenta extrair valor do PIX
              const pixVal = val.match(/pix\s*(?:de\s*)?R?\$?\s*([\d.,]+)/i);
              if (pixVal) { setEntradaPix(formatPreco(pixVal[1].replace(/\./g, ""))); filled++; }
            } else if (lowVal.includes("pix")) { setForma("Pix"); filled++; }
            else if (lowVal.includes("cart") || lowVal.includes("credito") || lowVal.includes("crédito") || parcMatch) { setForma("Cartao Credito"); filled++; }
            else if (lowVal.includes("debito") || lowVal.includes("débito")) { setForma("Cartao Debito"); filled++; }
            else if (lowVal.includes("espécie") || lowVal.includes("especie") || lowVal.includes("dinheiro")) { setForma("Especie"); filled++; }
            else if (lowVal.includes("link")) { setForma("Link de Pagamento"); filled++; }
          }
        } else if (low.includes("entrada") && low.includes("pix")) {
          const m = line.match(/R?\$?\s*([\d.,]+)/);
          if (m) { setEntradaPix(formatPreco(m[1].replace(/\./g, ""))); filled++; }
        } else if ((low.includes("entrega") || low.includes("local")) && !low.includes("forma") && !low.includes("pagamento")) {
          const val = extract(line);
          const lowVal = val.toLowerCase();
          if (lowVal.includes("shopping") || lowVal.includes("praia") || lowVal.includes("barra") || lowVal.includes("village") || lowVal.includes("mall")) {
            setLocalEntrega("shopping");
            // Tenta extrair nome do shopping
            const shMatch = val.match(/(barra\s*shopping|village\s*mall|praia\s*shopping|shopping\s*\w+|mall\s*\w+)/i);
            if (shMatch) setShoppingNome(shMatch[1].trim());
            else setShoppingNome(val);
            filled++;
          } else if (lowVal.includes("resid") || lowVal.includes("casa") || lowVal.includes("apartamento") || lowVal.includes("apt")) {
            setLocalEntrega("residencia"); filled++;
          } else if (lowVal.includes("loja") || lowVal.includes("retirada")) {
            setLocalEntrega("loja"); filled++;
          } else if (val) {
            setLocalEntrega("shopping"); filled++;
          }
        } else if (low.includes("horario") || low.includes("horário") || low.includes("periodo") || low.includes("período")) {
          const val = extract(line);
          const lowVal = val.toLowerCase();
          if (lowVal.includes("manha") || lowVal.includes("manhã")) { setHorario("Manha"); filled++; }
          else if (lowVal.includes("tarde")) { setHorario("Tarde"); filled++; }
          else if (lowVal.includes("noite")) { setHorario("Noite"); filled++; }
          else if (val) { setHorario(val); filled++; }
        } else if (low.includes("troca") || low.includes("trade")) {
          const val = extract(line);
          if (val) {
            // Tenta extrair valor da troca
            const valMatch = val.match(/R?\$?\s*([\d.,]+)/);
            if (valMatch) { setTrocaValor(formatPreco(valMatch[1].replace(/\./g, ""))); }
            // Produto na troca: texto antes do valor
            const prodTroca = val.replace(/R?\$?\s*[\d.,]+/g, "").replace(/[-–]/g, "").trim();
            if (prodTroca) { setTrocaProduto(prodTroca); setTemTroca(true); }
            filled++;
          }
        } else if (low.includes("valor") || low.includes("preco") || low.includes("preço")) {
          const m = line.match(/R?\$?\s*([\d.,]+)/);
          if (m) {
            const val = m[1].replace(/\./g, "");
            setPreco(formatPreco(val)); filled++;
          }
        }
      }

      if (parsedProdutos.length > 0) {
        setProdutos(parsedProdutos);
        setProdutoManual(true);
        setCarrinhoLink([]);
      }

      if (filled > 0) {
        setPasteMsg(`Resumo colado! ${filled} campo(s), ${parsedProdutos.length} produto(s).`);
      } else {
        setPasteMsg("Nenhum campo reconhecido no texto.");
      }
      setTimeout(() => setPasteMsg(""), 3000);
    } catch {
      setPasteMsg("Erro ao ler clipboard. Permita o acesso.");
      setTimeout(() => setPasteMsg(""), 3000);
    }
  }

  const inputCls = `w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E] ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`;
  const labelCls = `block text-sm font-medium mb-1 ${dm ? "text-[#98989D]" : "text-[#1D1D1F]"}`;

  const showParcelas = forma === "Cartao Credito" || forma === "Cartao Debito" || forma === "Link de Pagamento";
  // Entrada PIX também disponível pra "Link de Pagamento" (MP):
  // cliente paga parte no PIX (pendente / resolvido no WhatsApp) e o resto
  // vai no link MP parcelado. Taxa do parcelamento é calculada em cima do
  // valor que vai pro link (já descontando desconto + troca + entrada PIX).
  const showEntradaPix = forma === "Cartao Credito" || forma === "Link de Pagamento";

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Modal: Ver dados preenchidos pelo cliente */}
      {viewDataLink && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setViewDataLink(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#E5E5EA] flex items-center justify-between bg-gradient-to-r from-[#FFF8F2] to-white">
              <div>
                <h3 className="text-base font-bold text-[#1D1D1F]">✏️ Editar link</h3>
                <p className="text-[11px] text-[#86868B] mt-0.5">
                  Link <span className="font-mono font-semibold">{viewDataLink.short_code}</span>
                  {viewDataLink.cliente_preencheu_em && <> · {new Date(viewDataLink.cliente_preencheu_em).toLocaleString("pt-BR")}</>}
                </p>
              </div>
              <button onClick={() => setViewDataLink(null)} className="text-xl text-[#86868B] hover:text-red-500 w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50">✕</button>
            </div>
            <>
              <div className="overflow-y-auto p-5 space-y-5">
                {(() => {
                  const FD = ({ label, k, type = "text", full = false }: { label: string; k: string; type?: string; full?: boolean }) => (
                    <div className={full ? "col-span-2" : ""}>
                      <label className="block text-[10px] font-semibold text-[#86868B] uppercase tracking-wide mb-1">{label}</label>
                      <input
                        type={type}
                        value={editDados[k] || ""}
                        onChange={(e) => setEditDados({ ...editDados, [k]: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm focus:border-[#E8740E] focus:outline-none"
                      />
                    </div>
                  );
                  const FL = ({ label, k, type = "text", full = false }: { label: string; k: string; type?: string; full?: boolean }) => (
                    <div className={full ? "col-span-2" : ""}>
                      <label className="block text-[10px] font-semibold text-[#86868B] uppercase tracking-wide mb-1">{label}</label>
                      <input
                        type={type}
                        value={editLink[k] || ""}
                        onChange={(e) => setEditLink({ ...editLink, [k]: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm focus:border-[#E8740E] focus:outline-none"
                      />
                    </div>
                  );
                  const temDados = !!viewDataLink.cliente_dados_preenchidos;
                  return (
                    <>
                      {/* Link — Pedido */}
                      <section>
                        <h4 className="text-xs font-bold text-[#E8740E] uppercase tracking-wide mb-2">🛒 Pedido (link)</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <FL label={editLinkExtras && editLinkExtras.length > 0 ? "Produto 1" : "Produto"} k="produto" full />
                          {editLinkExtras && editLinkExtras.map((pe, i) => (
                            <div key={i} className="col-span-2">
                              <label className="block text-[10px] font-semibold text-[#86868B] uppercase tracking-wide mb-1">Produto {i + 2}</label>
                              <input
                                type="text"
                                value={pe}
                                onChange={(e) => {
                                  const updated = [...editLinkExtras];
                                  updated[i] = e.target.value;
                                  setEditLinkExtras(updated);
                                }}
                                className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm focus:border-[#E8740E] focus:outline-none"
                              />
                            </div>
                          ))}
                          <FL label="Cor" k="cor" />
                          <FL label="Valor (R$)" k="valor" type="number" />
                          <FL label="Forma de pagamento" k="forma_pagamento" />
                          <FL label="Parcelas" k="parcelas" type="number" />
                          <FL label="Entrada (R$)" k="entrada" type="number" full />
                          <FL label="Vendedor" k="vendedor" full />
                          <FL label="Observação" k="observacao" full />
                          {/* Status do pagamento */}
                          <div className="col-span-2">
                            <label className="block text-[10px] font-semibold text-[#86868B] uppercase tracking-wide mb-1">Pagamento efetuado?</label>
                            <div className="flex gap-2">
                              {([["", "Pendente"], ["link", "Pago via Link"], ["pix", "Pago via PIX"]] as const).map(([val, label]) => (
                                <button key={val} type="button" onClick={() => setEditLink(prev => ({ ...prev, pagamento_pago: val }))}
                                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${editLink.pagamento_pago === val ? (val ? "bg-green-600 text-white border-green-600" : "bg-yellow-500 text-white border-yellow-500") : "bg-white text-[#86868B] border-[#D2D2D7] hover:border-[#E8740E]"}`}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        {/* Resumo do pagamento */}
                        {(() => {
                          const valorBruto = Number(editLink.valor || 0);
                          const descontoLink = Number(editLink.desconto || 0);
                          const valor = valorBruto - descontoLink;
                          const entrada = Number(editLink.entrada || 0);
                          const troca = Number(editLink.troca_valor || 0) + Number(editLink.troca_valor2 || 0);
                          const parcelasN = Number(editLink.parcelas || 0);
                          const forma = editLink.forma_pagamento || "";
                          const isCartao = forma === "Cartao Credito" || forma === "Link de Pagamento";
                          // Restante após entrada e troca é o que parcela (taxa só cai sobre ele)
                          const restante = Math.max(0, valor - entrada - troca);
                          const taxaPct = isCartao && parcelasN > 0 ? (TAXAS[parcelasN] || 0) : 0;
                          const restanteComTaxa = taxaPct > 0 ? Math.ceil(restante * (1 + taxaPct / 100)) : restante;
                          const valorFinal = entrada + restanteComTaxa;
                          const valorParcela = parcelasN > 0 ? restanteComTaxa / parcelasN : 0;
                          if (valor <= 0) return null;
                          const boxCls = dm ? "bg-[#14301F] border-[#1F5A38]" : "bg-green-50 border-green-200";
                          const titleCls = dm ? "text-green-300" : "text-green-800";
                          const mutedCls = dm ? "text-[#98989D]" : "text-[#86868B]";
                          const valCls = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
                          const sepCls = dm ? "border-[#1F5A38]" : "border-green-300";
                          return (
                            <div className={`mt-3 p-3 rounded-xl border text-xs space-y-1 ${boxCls}`}>
                              <p className={`font-bold uppercase tracking-wide text-[10px] ${titleCls}`}>💳 Resumo do pagamento</p>
                              <div className="flex justify-between"><span className={mutedCls}>Valor do produto</span><span className={`font-mono ${valCls}`}>R$ {valorBruto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>
                              {descontoLink > 0 && <div className="flex justify-between"><span className="text-blue-500">− Desconto</span><span className="font-mono text-blue-500">R$ {descontoLink.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>}
                              {entrada > 0 && <div className="flex justify-between"><span className={mutedCls}>− Entrada</span><span className={`font-mono ${valCls}`}>R$ {entrada.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>}
                              {troca > 0 && <div className="flex justify-between"><span className={mutedCls}>− Troca abatida</span><span className={`font-mono ${valCls}`}>R$ {troca.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>}
                              {taxaPct > 0 && (
                                <div className="flex justify-between"><span className={mutedCls}>Taxa {parcelasN}x ({taxaPct}%)</span><span className={`font-mono ${valCls}`}>+R$ {(restanteComTaxa - restante).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>
                              )}
                              <div className={`flex justify-between pt-1 border-t ${sepCls}`}><span className={`font-bold ${titleCls}`}>Valor final a pagar</span><span className={`font-mono font-bold ${titleCls}`}>R$ {valorFinal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>
                              {parcelasN > 1 && valorParcela > 0 && (
                                <div className={`flex justify-between ${mutedCls}`}><span>{parcelasN}x de</span><span className="font-mono">R$ {valorParcela.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                              )}
                              {editLink.forma_pagamento && <p className={`text-[10px] pt-1 ${mutedCls}`}>Forma: <strong className={valCls}>{editLink.forma_pagamento}</strong></p>}
                            </div>
                          );
                        })()}
                      </section>

                      {/* Link — Cliente */}
                      <section>
                        <h4 className="text-xs font-bold text-[#E8740E] uppercase tracking-wide mb-2">👤 Cliente (link)</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <FL label="Nome" k="cliente_nome" full />
                          <FL label="Telefone" k="cliente_telefone" />
                          <FL label="CPF" k="cliente_cpf" />
                          <FL label="Email" k="cliente_email" type="email" full />
                        </div>
                      </section>

                      {/* Troca */}
                      {(editLink.troca_produto || editLink.troca_produto2 || viewDataLink.tipo === "TROCA") && (
                        <section>
                          <h4 className="text-xs font-bold text-[#E8740E] uppercase tracking-wide mb-2">🔄 Troca</h4>
                          <div className="grid grid-cols-2 gap-3">
                            <FL label="Produto troca 1" k="troca_produto" full />
                            <FL label="Valor troca 1 (R$)" k="troca_valor" type="number" full />
                            <FL label="Produto troca 2" k="troca_produto2" full />
                            <FL label="Valor troca 2 (R$)" k="troca_valor2" type="number" full />
                          </div>
                        </section>
                      )}

                      {/* Dados preenchidos pelo cliente */}
                      <div className="border-t border-dashed border-[#D2D2D7] pt-4">
                        <div className="mb-3">
                          <h4 className="text-xs font-bold text-[#1D1D1F] uppercase tracking-wide">📋 Dados preenchidos pelo cliente</h4>
                          {viewDataLink.cliente_preencheu_em && (
                            <p className="text-[10px] text-[#86868B] mt-0.5">em {new Date(viewDataLink.cliente_preencheu_em).toLocaleString("pt-BR")}</p>
                          )}
                        </div>
                        {!temDados ? (
                          <p className="text-xs text-[#86868B] italic">Cliente ainda não preencheu.</p>
                        ) : (
                          <>
                            <section className="mb-4">
                              <h5 className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wide mb-2">Pessoa</h5>
                              <div className="grid grid-cols-2 gap-3">
                                <FD label="Nome" k="nome" full />
                                <FD label="Tipo" k="pessoa" />
                                <FD label={editDados.pessoa === "PJ" ? "CNPJ" : "CPF"} k={editDados.pessoa === "PJ" ? "cnpj" : "cpf"} />
                                <FD label="Telefone" k="telefone" />
                                <FD label="Email" k="email" type="email" full />
                                <FD label="Instagram" k="instagram" full />
                              </div>
                            </section>
                            <section className="mb-4">
                              <h5 className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wide mb-2">Endereço</h5>
                              <div className="grid grid-cols-2 gap-3">
                                <FD label="CEP" k="cep" />
                                <FD label="Bairro" k="bairro" />
                                <FD label="Rua" k="endereco" full />
                                <FD label="Número" k="numero" />
                                <FD label="Complemento" k="complemento" />
                              </div>
                            </section>
                            <section>
                              <h5 className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wide mb-2">Entrega</h5>
                              <div className="grid grid-cols-2 gap-3">
                                <FD label="Local" k="local" />
                                <FD label="Origem" k="origem" />
                                <FD label="Data entrega" k="data_entrega" type="date" />
                                <FD label="Horário" k="horario" type="time" />
                              </div>
                            </section>
                            {/* Forma de pagamento escolhida pelo cliente no link */}
                            {(editDados.forma_pagamento || editDados.preco || editLink.forma_pagamento) && (
                              <section>
                                <h5 className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wide mb-2">Pagamento</h5>
                                <div className="grid grid-cols-2 gap-3">
                                  <FD label="Forma (cliente)" k="forma_pagamento" full />
                                  <FD label="Parcelas" k="parcelas" />
                                  <FD label="Entrada PIX" k="entrada_pix" />
                                  <FD label="Desconto" k="desconto" />
                                  <FD label="Preco total" k="preco" full />
                                </div>
                                {/* Badge pagamento pago */}
                                <div className="mt-2">
                                  {viewDataLink.pagamento_pago ? (
                                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                      Pagamento ja efetuado via {viewDataLink.pagamento_pago === "link" ? "Link" : "PIX"}
                                    </span>
                                  ) : (
                                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
                                      Pagamento pendente
                                    </span>
                                  )}
                                </div>
                              </section>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="px-5 py-3 border-t border-[#E5E5EA] bg-[#F9F9FB] flex items-center justify-between">
                <button
                  onClick={async () => {
                    const d = editDados;
                    const l = editLink;
                    // Monta o PedidoData e reusa formatPedidoMessage (mesma funcao
                    // que o cliente usa no /compra). Garante que o formato do copy
                    // bate com o que chega no grupo do WhatsApp (mesmas secoes,
                    // mesmo calculo de parcelas, taxa de deslocamento etc).
                    const precosCarrinho = carrinhoLink.length > 0 ? carrinhoLink.map(c => c.preco || 0) : [];
                    const valorTotal = Number(l.valor) || 0;
                    const somaExtras = precosCarrinho.slice(1).reduce((s, p) => s + p, 0);
                    const precoP1 = precosCarrinho[0] ?? (somaExtras > 0 ? valorTotal - somaExtras : valorTotal);
                    const extrasArr = Array.isArray(editLinkExtras) ? editLinkExtras.filter(Boolean) : [];
                    // Parser simples de "Entrega - Shopping: X" → {local: "Shopping", shopping: "X"}
                    // Se d.local vier ja cru ("Entrega"/"Correios"/"Loja"), usa direto.
                    const parseLocal = (raw: string | undefined): { local: string; tipoEntrega?: "Residencia" | "Comercial"; shopping?: string } => {
                      if (!raw) return { local: "" };
                      if (/shopping/i.test(raw)) {
                        const m = raw.match(/shopping[:\s-]+(.+)/i);
                        return { local: "Shopping", shopping: m?.[1]?.trim() };
                      }
                      if (/correios/i.test(raw)) return { local: "Correios" };
                      if (/retirad|loja/i.test(raw)) return { local: "Loja" };
                      if (/comercial/i.test(raw)) return { local: "Entrega", tipoEntrega: "Comercial" };
                      if (/resid/i.test(raw) || /entrega/i.test(raw)) return { local: "Entrega", tipoEntrega: "Residencia" };
                      return { local: raw };
                    };
                    const locInfo = parseLocal(d.local);

                    const trocaAparelhos: PedidoTrocaItem[] = [];
                    if (Number(l.troca_valor) > 0 || l.troca_produto) {
                      trocaAparelhos.push({ modelo: l.troca_produto || "Produto na troca", cor: l.troca_cor || undefined, valor: Number(l.troca_valor) || 0 });
                    }
                    if (Number(l.troca_valor2) > 0 || l.troca_produto2) {
                      trocaAparelhos.push({ modelo: l.troca_produto2 || "Produto na troca 2", valor: Number(l.troca_valor2) || 0 });
                    }

                    const pedido: PedidoData = {
                      cliente: {
                        nome: d.nome || l.cliente_nome || "",
                        pessoa: (d.pessoa === "PJ" ? "PJ" : "PF") as "PF" | "PJ",
                        cpf: d.cpf || (d.pessoa !== "PJ" ? l.cliente_cpf : undefined) || undefined,
                        cnpj: d.cnpj || undefined,
                        email: d.email || l.cliente_email || undefined,
                        telefone: d.telefone || l.cliente_telefone || undefined,
                        instagram: d.instagram || undefined,
                        cep: d.cep || undefined,
                        endereco: d.endereco || undefined,
                        numero: d.numero || undefined,
                        complemento: d.complemento || undefined,
                        bairro: d.bairro || undefined,
                      },
                      produto: (() => {
                        // l.cor eh salvo em EN ("White") e l.produto ja inclui a cor
                        // PT no final ("iPhone 17 256GB Branco"). Converte cor pra PT
                        // e remove do nome pra nao duplicar ("Branco — White").
                        const corPT = l.cor ? corParaPT(l.cor) : "";
                        const corFinal = corPT && corPT !== "—" ? corPT : l.cor || "";
                        let nome = l.produto || "";
                        if (corFinal) {
                          const escaped = corFinal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                          nome = nome.replace(new RegExp(`\\s+${escaped}\\s*$`, "i"), "").trim();
                        }
                        return {
                          nome,
                          cor: corFinal || undefined,
                          preco: extrasArr.length > 0 ? precoP1 : valorTotal,
                          extras: extrasArr.length > 0
                            ? extrasArr.map((n, i) => ({ nome: n, preco: precosCarrinho[i + 1] || 0 }))
                            : undefined,
                        };
                      })(),
                      pagamento: {
                        forma: d.forma_pagamento || l.forma_pagamento || undefined,
                        parcelas: d.parcelas || l.parcelas || undefined,
                        entrada: Number(d.entrada_pix || l.entrada) || undefined,
                        desconto: Number(l.desconto) || undefined,
                        pagamentoPago: (viewDataLink.pagamento_pago as "mp" | "pix" | null) || null,
                      },
                      troca: trocaAparelhos.length > 0 ? { aparelhos: trocaAparelhos } : undefined,
                      entrega: {
                        local: locInfo.local,
                        tipoEntrega: locInfo.tipoEntrega,
                        shopping: locInfo.shopping,
                        data: d.data_entrega || undefined,
                        horario: d.horario || undefined,
                        vendedor: d.vendedor || undefined,
                        origem: d.origem || undefined,
                      },
                    };
                    const msg = formatPedidoMessage(pedido);
                    try { await navigator.clipboard.writeText(msg); setPasteMsg("✅ Copiado para WhatsApp!"); } catch { setPasteMsg("❌ Erro ao copiar"); }
                  }}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700"
                >
                  📋 Copiar p/ WhatsApp
                </button>
                <div className="flex gap-2">
                <button onClick={() => setViewDataLink(null)} className="px-4 py-2 text-sm font-semibold text-[#86868B] hover:text-[#1D1D1F]">Cancelar</button>
                <button
                  onClick={salvarDadosCliente}
                  disabled={savingDados}
                  className="px-4 py-2 rounded-lg bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#D4640A] disabled:opacity-50"
                >
                  {savingDados ? "Salvando…" : "💾 Salvar alterações"}
                </button>
                </div>
              </div>
            </>
          </div>
        </div>
      )}

      {/* Modal: Marcar como preenchido — pede nome/telefone do cliente pra
          que o link apareça corretamente em Histórico de Formulários.
          Use quando o cliente preencheu via /compra mas o POST não salvou
          (iOS Safari cancelando sendBeacon, conexão instável, etc). */}
      {marcarLink && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setMarcarLink(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#E5E5EA] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1D1D1F]">✓ Marcar como preenchido</h3>
              <button onClick={() => setMarcarLink(null)} className="text-lg text-[#86868B] hover:text-red-500">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[11px] text-[#86868B] bg-blue-50 border border-blue-200 rounded-lg p-2">
                Use esta tela quando o cliente já enviou o formulário pelo WhatsApp mas o sistema não registrou automaticamente. Copie os dados do WhatsApp do cliente para cá.
              </p>
              <div>
                <label className="text-[11px] text-[#86868B] font-semibold">Nome completo *</label>
                <input
                  type="text"
                  value={marcarNome}
                  onChange={(e) => setMarcarNome(e.target.value)}
                  placeholder="Nome do cliente (copiar do WhatsApp)"
                  className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm mt-1"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[11px] text-[#86868B] font-semibold">WhatsApp *</label>
                <input
                  type="tel"
                  value={marcarTelefone}
                  onChange={(e) => setMarcarTelefone(e.target.value)}
                  placeholder="(21) 99999-9999"
                  className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#86868B] font-semibold">CPF (opcional)</label>
                <input
                  type="text"
                  value={marcarCpf}
                  onChange={(e) => setMarcarCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#86868B] font-semibold">E-mail (opcional)</label>
                <input
                  type="email"
                  value={marcarEmail}
                  onChange={(e) => setMarcarEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm mt-1"
                />
              </div>
              <button
                onClick={confirmarMarcarPreenchido}
                disabled={!marcarNome.trim() || !marcarTelefone.trim() || marcarSalvando}
                className="w-full py-2.5 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-50"
              >
                {marcarSalvando ? "Salvando..." : "✓ Marcar como preenchido"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Encaminhar pra entrega */}
      {encaminharLink && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setEncaminharLink(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#E5E5EA] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1D1D1F]">Encaminhar para entrega</h3>
              <button onClick={() => setEncaminharLink(null)} className="text-lg text-[#86868B] hover:text-red-500">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[11px] text-[#86868B]">Uma entrega será criada em /admin/entregas com os dados preenchidos pelo cliente.</p>
              <div>
                <label className="text-[11px] text-[#86868B] font-semibold">Data da entrega *</label>
                <input type="date" value={encaminharData} onChange={(e) => setEncaminharData(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm mt-1" />
              </div>
              <div>
                <label className="text-[11px] text-[#86868B] font-semibold">Horário (opcional)</label>
                <input type="time" value={encaminharHorario} onChange={(e) => setEncaminharHorario(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm mt-1" />
              </div>
              <div>
                <label className="text-[11px] text-[#86868B] font-semibold">Vendedor responsável *</label>
                <select
                  value={encaminharVendedor}
                  onChange={(e) => setEncaminharVendedor(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm mt-1"
                >
                  <option value="">— Selecionar vendedor —</option>
                  {(() => {
                    const opcoes = new Set<string>();
                    if (encaminharLink?.vendedor) opcoes.add(encaminharLink.vendedor);
                    for (const v of vendedoresList) {
                      if (v.ativo !== false && v.nome) opcoes.add(v.nome);
                    }
                    return [...opcoes].map(n => <option key={n} value={n}>{n}</option>);
                  })()}
                </select>
                <p className="text-[10px] text-[#86868B] mt-1">Vendedor responsável pelo contato com o cliente</p>
              </div>
              <div>
                <label className="text-[11px] text-[#86868B] font-semibold">Observação (opcional)</label>
                <textarea value={encaminharObs} onChange={(e) => setEncaminharObs(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm mt-1" />
              </div>
              <button onClick={encaminharParaEntrega} disabled={!encaminharData || !encaminharVendedor} className="w-full py-2.5 rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-600 disabled:opacity-50">
                Criar entrega
              </button>
            </div>
          </div>
        </div>
      )}

      <h1 className="text-xl font-bold text-[#1D1D1F]">Gerar Link de Compra</h1>
      <p className="text-sm text-[#86868B]">
        Gere um link pre-preenchido para enviar ao cliente. Ele completa os dados pessoais e envia direto pro WhatsApp da Bianca.
      </p>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[#E5E5EA]">
        <button
          onClick={() => setAba("novo")}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${aba === "novo" ? "text-[#E8740E] border-b-2 border-[#E8740E]" : "text-[#86868B] hover:text-[#1D1D1F]"}`}
        >
          ✨ Novo Link
        </button>
        <button
          onClick={() => setAba("historico")}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${aba === "historico" ? "text-[#E8740E] border-b-2 border-[#E8740E]" : "text-[#86868B] hover:text-[#1D1D1F]"}`}
        >
          📚 Histórico
        </button>
      </div>

      {aba === "historico" && (
        <div className="bg-white border border-[#D2D2D7] rounded-xl p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap gap-2">
            <input
              value={histBusca}
              onChange={(e) => setHistBusca(e.target.value)}
              placeholder="🔎 Buscar nome, telefone, CPF, produto, código..."
              className={`${inputCls} flex-1 min-w-[200px]`}
            />
            <select value={histTipo} onChange={(e) => setHistTipo(e.target.value as "" | "COMPRA" | "TROCA")} className={inputCls} style={{ maxWidth: 160 }}>
              <option value="">Todos tipos</option>
              <option value="COMPRA">🛒 Só compra</option>
              <option value="TROCA">🔄 Com troca</option>
            </select>
            <select value={histStatus} onChange={(e) => setHistStatus(e.target.value as "" | "ATIVO" | "PREENCHIDO" | "ENCAMINHADO")} className={inputCls} style={{ maxWidth: 180 }}>
              <option value="">Todos status</option>
              <option value="ATIVO">⏳ Aguardando</option>
              <option value="PREENCHIDO">📝 Preenchido</option>
              <option value="ENCAMINHADO">✅ Entrega criada</option>
            </select>
            <select value={histArquivado} onChange={(e) => setHistArquivado(e.target.value as "0" | "1")} className={inputCls} style={{ maxWidth: 160 }}>
              <option value="0">Ativos</option>
              <option value="1">Arquivados</option>
            </select>
            <select
              value={histOperador}
              onChange={(e) => setHistOperador(e.target.value)}
              className={inputCls}
              style={{ maxWidth: 200 }}
              title="Quem criou o link no admin"
            >
              <option value="">🛠️ Todos operadores</option>
              {operadoresDisponiveis.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
            <select
              value={histVendedor}
              onChange={(e) => setHistVendedor(e.target.value)}
              className={inputCls}
              style={{ maxWidth: 200 }}
              title="Vendedor designado no link (campo Vendedor do form)"
            >
              <option value="">👤 Todos vendedores</option>
              {vendedoresDisponiveis.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <button
              onClick={() => fetchHistorico()}
              disabled={histLoading}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-[#E8740E]/10 text-[#E8740E] hover:bg-[#E8740E]/20 transition-colors disabled:opacity-50"
              title="Atualizar lista"
            >
              {histLoading ? "..." : "🔄 Atualizar"}
            </button>
          </div>

          {histLoading && <p className="text-xs text-[#86868B] text-center py-4">Carregando...</p>}
          {!histLoading && histLinks.length === 0 && <p className="text-xs text-[#86868B] text-center py-6">Nenhum link encontrado.</p>}
          {!histLoading && histLinks.length > 0 && (() => {
            const filtrados = histLinks.filter((l) => {
              if (histOperador && (l.operador || "") !== histOperador) return false;
              if (histVendedor && (l.vendedor || "") !== histVendedor) return false;
              return true;
            });
            if (filtrados.length === 0 && (histOperador || histVendedor)) {
              const labels: string[] = [];
              if (histOperador) labels.push(`operador: ${histOperador}`);
              if (histVendedor) labels.push(`vendedor: ${histVendedor}`);
              return (
                <p className="text-xs text-[#86868B] text-center py-6">
                  Nenhum link encontrado pra <strong>{labels.join(" + ")}</strong>.
                </p>
              );
            }
            return null;
          })()}

          {(() => {
            // Mostra TODOS os links (Aguardando, Preenchido, Entrega criada).
            // Filtros aplicados: operador (quem criou) + vendedor (designado).
            const visiveis = histLinks.filter((l) => {
              if (histOperador && (l.operador || "") !== histOperador) return false;
              if (histVendedor && (l.vendedor || "") !== histVendedor) return false;
              return true;
            });
            return (
          <div className="space-y-2">
            {visiveis.map((l) => {
              // Encomenda pode ter troca junto. Badge fica "ENCOMENDA + TROCA"
              // quando tem ambos, senao so o tipo principal.
              const temTrocaLink = !!(l.troca_produto || l.troca_produto2);
              const badge = l.tipo === "ENCOMENDA"
                ? (temTrocaLink ? { icone: "📦", label: "ENCOMENDA + TROCA", cor: "bg-blue-200 text-blue-800" }
                                : { icone: "📦", label: "ENCOMENDA", cor: "bg-blue-200 text-blue-800" })
                : l.tipo === "TROCA"
                  ? { icone: "🔄", label: "COMPRA + TROCA", cor: "bg-purple-200 text-purple-800" }
                  : { icone: "🛒", label: "SÓ COMPRA", cor: "bg-orange-200 text-orange-800" };
              const borderCor = l.tipo === "ENCOMENDA" ? "border-blue-200 bg-blue-50/30"
                : l.tipo === "TROCA" ? "border-purple-200 bg-purple-50/30"
                : "border-[#E5E5EA] bg-[#F9F9FB]";
              return (
              <div key={l.id} className={`border rounded-xl p-3 ${borderCor}`}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${badge.cor}`}>
                        {badge.icone} {badge.label}
                      </span>
                      <span className="text-[10px] text-[#86868B]">
                        {new Date(l.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {l.entrega_id ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-green-200 text-green-800">✅ Entrega criada</span>
                      ) : l.cliente_preencheu_em ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-200 text-blue-800">📝 Preenchido</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-gray-200 text-gray-700">⏳ Aguardando</span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#86868B] mt-0.5">
                      {l.operador ? <>Criado por <strong>{l.operador}</strong></> : null}
                      {l.operador && l.vendedor ? " · " : null}
                      {l.vendedor ? <>Vendedora <strong>{l.vendedor}</strong></> : null}
                    </p>
                    <p className="text-sm font-semibold text-[#1D1D1F] mt-1">{(() => {
                      const cor = l.cor || "";
                      if (!cor) return l.produto;
                      const corPT = corParaPT(cor);
                      const corEN = corParaEN(cor) || cor;
                      // Strip qualquer sufixo de cor (EN ou PT) do produto pra não duplicar
                      let base = l.produto;
                      for (const s of [cor, corPT, corEN]) {
                        if (!s) continue;
                        const re = new RegExp(`\\s+${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
                        base = base.replace(re, "").trim();
                      }
                      return `${base} ${corPT} — ${corEN}`;
                    })()}</p>
                    {l.produtos_extras && l.produtos_extras.length > 0 && (
                      <ul className="text-xs text-[#86868B] mt-0.5 list-disc pl-5">
                        {l.produtos_extras.map((pe, i) => <li key={i}>{pe}</li>)}
                      </ul>
                    )}
                    {l.valor > 0 && <p className="text-xs text-[#E8740E] font-bold">R$ {Number(l.valor).toLocaleString("pt-BR")}</p>}
                    {(() => {
                      const troca = Number(l.troca_valor || 0) + Number(l.troca_valor2 || 0);
                      const entrada = Number(l.entrada || 0);
                      const valorFinal = Math.max(0, Number(l.valor || 0) - troca - entrada);
                      const temDetalhe = l.forma_pagamento || l.parcelas || entrada > 0 || valorFinal !== Number(l.valor || 0);
                      if (!temDetalhe) return null;
                      return (
                        <div className="text-[11px] mt-1 space-y-0.5">
                          {l.forma_pagamento && <p className="text-[#1D1D1F]">💳 <strong>{l.forma_pagamento}</strong>{l.parcelas ? ` · ${l.parcelas}` : ""}</p>}
                          {entrada > 0 && <p className="text-[#86868B]">Entrada: R$ {entrada.toLocaleString("pt-BR")}</p>}
                          {troca > 0 && <p className="text-[#86868B]">Troca abatida: R$ {troca.toLocaleString("pt-BR")}</p>}
                          {valorFinal !== Number(l.valor || 0) && <p className="text-green-700 font-bold">Valor final: R$ {valorFinal.toLocaleString("pt-BR")}</p>}
                        </div>
                      );
                    })()}
                    {/* Badge pagamento pago */}
                    {l.pagamento_pago ? (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">
                        Pago via {l.pagamento_pago === "link" ? "Link" : "PIX"}
                      </span>
                    ) : (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-100 text-yellow-700">
                        Pagamento pendente
                      </span>
                    )}
                    {(l.cliente_nome || l.cliente_telefone) && (
                      <p className="text-xs text-[#86868B] mt-1">
                        👤 {l.cliente_nome || "—"}{l.cliente_telefone ? ` · ${l.cliente_telefone}` : ""}{l.cliente_cpf ? ` · ${l.cliente_cpf}` : ""}
                      </p>
                    )}
                    {l.tipo === "TROCA" && l.troca_produto && (
                      <>
                        <p className="text-xs text-purple-700 mt-1">🔄 Troca: {l.troca_produto}{l.troca_cor ? ` ${l.troca_cor}` : ""}{l.troca_valor ? ` — R$ ${Number(l.troca_valor).toLocaleString("pt-BR")}` : ""}</p>
                        {l.troca_condicao && <p className="text-[10px] text-purple-500 mt-0.5">{l.troca_condicao}</p>}
                      </>
                    )}
                    <p className="text-[10px] text-[#86868B] font-mono mt-1">{l.url_curta || `/c/${l.short_code}`}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {l.cliente_telefone && (() => {
                    const waHref = buildWaFollowUpUrl({
                      clienteNome: l.cliente_nome,
                      clienteTelefone: l.cliente_telefone,
                      produto: l.produto,
                      cor: l.cor,
                      valor: l.valor,
                      desconto: l.desconto,
                      parcelas: l.parcelas,
                      trocaNome: l.troca_produto,
                      trocaCor: l.troca_cor,
                      trocaValor: l.troca_valor,
                      trocaNome2: l.troca_produto2,
                      trocaCor2: l.troca_cor2,
                      trocaValor2: l.troca_valor2,
                      preencheuEm: l.cliente_preencheu_em,
                      pagamentoPago: l.pagamento_pago,
                      entregaId: l.entrega_id,
                    });
                    if (!waHref) return null;
                    return (
                      <a
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2.5 py-1 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium"
                      >
                        💬 WhatsApp
                      </a>
                    );
                  })()}
                  <button
                    onClick={() => copiarLinkHist(l.url_curta || `${getPublicBaseUrl()}/c/${l.short_code}`)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-white border border-[#D2D2D7] hover:border-[#E8740E] hover:text-[#E8740E] font-medium"
                  >
                    📋 Copiar
                  </button>
                  <button
                    onClick={() => reutilizarLink(l)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-white border border-[#D2D2D7] hover:border-[#E8740E] hover:text-[#E8740E] font-medium"
                  >
                    ♻️ Reutilizar
                  </button>
                  <button
                    onClick={() => editarLink(l)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-white border border-[#D2D2D7] hover:border-blue-400 hover:text-blue-600 font-medium"
                  >
                    ✏️ Editar
                  </button>
                  {!l.cliente_preencheu_em && (
                    <button
                      onClick={() => abrirMarcarPreenchido(l)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 font-medium"
                      title="Use quando o cliente já mandou o formulário pelo WhatsApp mas o sistema não registrou"
                    >
                      ✓ Marcar como preenchido
                    </button>
                  )}
                  {l.cliente_preencheu_em && (!l.cliente_nome || !l.cliente_telefone) && (
                    <button
                      onClick={() => abrirMarcarPreenchido(l)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 font-medium"
                      title="Complete os dados do cliente (nome/WhatsApp) a partir da mensagem recebida"
                    >
                      ✏️ Preencher dados do cliente
                    </button>
                  )}
                  {l.cliente_preencheu_em && (
                    <button
                      onClick={() => setViewDataLink(l)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 font-medium"
                    >
                      👁 Dados cliente
                    </button>
                  )}
                  {l.cliente_preencheu_em && !l.entrega_id && (
                    <button
                      onClick={() => { setEncaminharLink(l); setEncaminharData(new Date().toISOString().slice(0, 10)); setEncaminharVendedor("Bianca"); }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium"
                    >
                      → Encaminhar entrega
                    </button>
                  )}
                  <button
                    onClick={() => arquivarLink(l.id, !l.arquivado)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-white border border-[#D2D2D7] hover:border-amber-400 hover:text-amber-600 font-medium"
                  >
                    {l.arquivado ? "↩️ Desarquivar" : "📦 Arquivar"}
                  </button>
                  {user?.role === "admin" && (
                    <button
                      onClick={() => excluirLink(l.id)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-white border border-red-300 text-red-500 hover:bg-red-50 font-medium"
                    >
                      🗑️ Excluir
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
            );
          })()}
        </div>
      )}

      {aba === "novo" && (
      <>
      {editingLinkId && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">✏️</span>
            <div>
              <p className="text-sm font-bold text-blue-900">Editando link {editingShortCode || editingLinkId.slice(0, 6)}</p>
              <p className="text-[11px] text-blue-700">Clique em <strong>Salvar Alterações</strong> pra gravar por cima. O link curto continua o mesmo.</p>
            </div>
          </div>
          <button
            onClick={() => { setEditingLinkId(null); setEditingShortCode(null); setPasteMsg(""); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 font-semibold whitespace-nowrap"
          >
            ✕ Cancelar edição
          </button>
        </div>
      )}
      <div className="bg-white border border-[#D2D2D7] rounded-xl p-4 shadow-sm space-y-4">
        {/* Botão colar resumo */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#1D1D1F]">Dados do pedido</p>
          <div className="flex gap-2">
            <button
              onClick={limparTudo}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 border-dashed border-red-400 text-red-500 hover:bg-red-50 transition-colors"
            >
              🗑️ Limpar dados
            </button>
            <button
              onClick={colarResumo}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 border-dashed border-[#E8740E] text-[#E8740E] hover:bg-[#FFF5EB] transition-colors"
            >
              📋 Colar resumo
            </button>
          </div>
        </div>

        {pasteMsg && (
          <div className={`px-3 py-2 rounded-lg text-xs font-medium ${pasteMsg.includes("Erro") || pasteMsg.includes("Nada") || pasteMsg.includes("Nenhum") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
            {pasteMsg}
          </div>
        )}

        {/* === ENCOMENDA: toggle prioritario no topo do form ===
            Operador marca PRIMEIRO se eh encomenda — define o que o cliente
            vai ver (header azul, mini-timeline) e como o sistema registra
            (link_compras.tipo=ENCOMENDA, vendas.encomenda=true). Antes ficava
            no meio do form e era facil esquecer; agora destaca-se ja na
            primeira tela com gradiente azul quando ativo. */}
        <div className={`p-4 rounded-2xl border-2 transition-all ${encomenda ? "border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100 shadow-md" : `border-dashed ${dm ? "border-blue-700/40 bg-blue-900/10" : "border-blue-300 bg-blue-50/40"}`}`}>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={encomenda}
              onChange={(e) => {
                const checked = e.target.checked;
                setEncomenda(checked);
                if (!checked) { setPrevisaoChegada(""); setSinalPct(""); }
                // Encomenda nao aceita shopping/correios — limpa se ja selecionado
                else if (localEntrega === "shopping" || localEntrega === "correios") setLocalEntrega("");
              }}
              className="w-5 h-5 mt-0.5 rounded accent-blue-600"
            />
            <div className="flex-1">
              <span className={`text-base font-bold ${encomenda ? "text-blue-900" : (dm ? "text-blue-300" : "text-blue-800")}`}>📦 Marcar como ENCOMENDA</span>
              <p className={`text-[11px] mt-0.5 leading-snug ${encomenda ? "text-blue-800" : (dm ? "text-blue-400/80" : "text-blue-700/80")}`}>
                Produto em trânsito do fornecedor — cliente paga sinal/integral agora e recebe no prazo combinado. Cliente vê banner azul + timeline no /compra.
              </p>
            </div>
          </label>

          {encomenda && (
            <div className="space-y-4 mt-4 pl-8">
              {/* Prazo: numero + dropdown unidade */}
              <div>
                <label className="text-xs font-bold text-blue-900 mb-1.5 block uppercase tracking-wide">⏱ Prazo de entrega (após pagamento) *</label>
                {(() => {
                  const m = previsaoChegada.trim().match(/^(\d+)\s*(dia|semana|m[eê]s)/i);
                  const num = m ? m[1] : "";
                  const unidadeRaw = m ? m[2].toLowerCase() : "dias";
                  const unidade = unidadeRaw.startsWith("dia") ? "dias" : unidadeRaw.startsWith("semana") ? "semanas" : "meses";
                  const fmtPrazo = (n: string, u: string) => n ? `${n} ${u}` : "";
                  return (
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={num}
                        onChange={(e) => {
                          const n = e.target.value.replace(/\D/g, "").slice(0, 3);
                          setPrevisaoChegada(fmtPrazo(n, unidade));
                        }}
                        placeholder="15"
                        className={`${inputCls} bg-white`}
                      />
                      <select
                        value={unidade}
                        onChange={(e) => setPrevisaoChegada(fmtPrazo(num, e.target.value))}
                        className={`${inputCls} bg-white`}
                      >
                        <option value="dias">dias</option>
                        <option value="semanas">semanas</option>
                        <option value="meses">meses</option>
                      </select>
                    </div>
                  );
                })()}
              </div>

              {/* Pagamento: integral vs sinal */}
              <div>
                <label className="text-xs font-bold text-blue-900 mb-1.5 block uppercase tracking-wide">💳 Como cliente paga? *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSinalPct("")}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${!sinalPct ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-900 border-blue-200 hover:border-blue-400"}`}
                  >
                    💯 Integral agora
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (!sinalPct) setSinalPct("50"); }}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-colors ${sinalPct ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-900 border-blue-200 hover:border-blue-400"}`}
                  >
                    💰 Sinal antecipado
                  </button>
                </div>
                {sinalPct && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-blue-900 font-medium">% do sinal:</span>
                      {[30, 50, 70].map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setSinalPct(String(p))}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border-2 transition-colors ${sinalPct === String(p) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-700 border-blue-300 hover:border-blue-500"}`}
                        >
                          {p}%
                        </button>
                      ))}
                      <input
                        value={sinalPct}
                        onChange={(e) => setSinalPct(e.target.value.replace(/\D/g, "").slice(0, 3) || "50")}
                        placeholder="50"
                        inputMode="numeric"
                        className={`${inputCls} max-w-[80px] bg-white`}
                      />
                      <span className="text-xs text-blue-900">%</span>
                    </div>
                    {(() => {
                      const pct = Number(sinalPct) || 0;
                      const preco = Number(rawPreco) || 0;
                      const trocaT = (Number(rawTrocaVal) || 0) + (Number(rawTrocaVal2) || 0);
                      const baseAposTroca = Math.max(preco - trocaT, 0);
                      if (!pct || !baseAposTroca) return null;
                      const sinal = Math.round((baseAposTroca * pct) / 100);
                      const restante = baseAposTroca - sinal;
                      return (
                        <p className="text-xs text-blue-900 leading-relaxed">
                          → Cliente paga <strong>R$ {sinal.toLocaleString("pt-BR")}</strong> agora (sinal {pct}%) e <strong>R$ {restante.toLocaleString("pt-BR")}</strong> na entrega
                          {trocaT > 0 ? ` (já descontada a troca de R$ ${trocaT.toLocaleString("pt-BR")})` : ""}.
                        </p>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Mini preview do banner que cliente vai ver no /compra */}
              {previsaoChegada && (Number(rawPreco) > 0) && (() => {
                const pctPrev = Number(sinalPct) || 0;
                const precoPrev = Number(rawPreco) || 0;
                const trocaTPrev = (Number(rawTrocaVal) || 0) + (Number(rawTrocaVal2) || 0);
                const baseAposTrocaPrev = Math.max(precoPrev - trocaTPrev, 0);
                const temSinalPrev = pctPrev > 0 && pctPrev < 100;
                const sinalPrev = temSinalPrev ? Math.round((baseAposTrocaPrev * pctPrev) / 100) : baseAposTrocaPrev;
                const restantePrev = temSinalPrev ? baseAposTrocaPrev - sinalPrev : 0;
                return (
                  <div className="mt-3 p-3 rounded-xl bg-white border border-blue-300 shadow-sm">
                    <p className="text-[10px] uppercase tracking-wider text-blue-700 font-bold mb-2">👁 Cliente vai ver assim:</p>
                    <div className="grid grid-cols-3 gap-1 relative">
                      <div className="absolute top-3 left-[16.67%] right-[16.67%] h-0.5 bg-blue-300" />
                      <div className="relative flex flex-col items-center text-center">
                        <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold z-10 mb-1">1</div>
                        <p className="text-[9px] font-bold text-blue-900">Pagar</p>
                        <p className="text-[9px] text-blue-700">{temSinalPrev ? `Sinal ${pctPrev}%` : "Integral"}</p>
                        {sinalPrev > 0 && <p className="text-[10px] font-bold text-blue-900">R$ {sinalPrev.toLocaleString("pt-BR")}</p>}
                      </div>
                      <div className="relative flex flex-col items-center text-center">
                        <div className="w-6 h-6 rounded-full bg-white border-2 border-blue-400 text-blue-600 flex items-center justify-center text-[10px] font-bold z-10 mb-1">2</div>
                        <p className="text-[9px] font-bold text-blue-900">Aguardar</p>
                        <p className="text-[9px] text-blue-700">{previsaoChegada}</p>
                      </div>
                      <div className="relative flex flex-col items-center text-center">
                        <div className="w-6 h-6 rounded-full bg-white border-2 border-blue-400 text-blue-600 flex items-center justify-center text-[10px] font-bold z-10 mb-1">3</div>
                        <p className="text-[9px] font-bold text-blue-900">Retirar</p>
                        <p className="text-[9px] text-blue-700">{trocaTPrev > 0 ? "+ troca" : "loja"}</p>
                        {restantePrev > 0 && <p className="text-[10px] font-bold text-blue-900">R$ {restantePrev.toLocaleString("pt-BR")}</p>}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Produto — seleção do estoque ou manual */}
        <div className="flex items-center justify-between">
          <label className={labelCls}>Produto *</label>
          <button onClick={() => { const goingManual = !produtoManual; setProdutoManual(goingManual); setCatSel(""); setPickerIdx(null); if (goingManual) { setCarrinhoLink([]); setAddingProduct(true); setCartCatSel(""); setCartCorPending(null); } else { setProdutos([""]); setCorSel(""); setPreco(""); setAddingProduct(true); setCartCatSel(""); setCartCorPending(null); } }} className="text-xs text-[#E8740E] font-medium hover:underline">
            {produtoManual ? "📋 Selecionar do estoque" : "✏️ Digitar manual"}
          </button>
        </div>

        {produtoManual ? (
          <>
            {produtos[0] && coresDisponiveis.length > 0 && (
              <div className={`px-4 py-3 rounded-xl border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-[#FAFAFA] border-[#E5E5EA]"}`}>
                <p className={`text-xs font-medium mb-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Cor do produto 1:</p>
                <div className="flex flex-wrap gap-2">
                  {coresDisponiveis.map(cor => (
                    <button key={cor} onClick={() => setCorSel(corSel === cor ? "" : cor)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${corSel === cor ? "bg-[#E8740E] text-white border-[#E8740E]" : (dm ? "bg-[#2C2C2E] text-[#F5F5F7] border-[#3A3A3C] hover:border-[#E8740E]" : "bg-white text-[#1D1D1F] border-[#D2D2D7] hover:border-[#E8740E]")}`}
                    >{corParaPT(cor)}</button>
                  ))}
                </div>
              </div>
            )}
            {produtos.map((prod, idx) => {
              const coresIdx = idx === 0 ? [] : coresParaProduto(prod); // idx 0 já tem picker acima
              const corIdxSel = idx === 0 ? "" : (coresExtras[idx - 1] || "");
              return (
              <div key={idx} className="space-y-2">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={prod}
                      onChange={(e) => { const np = [...produtos]; np[idx] = e.target.value; setProdutos(np); }}
                      placeholder={idx === 0 ? "Ex: iPhone 17 Pro Max 256GB Silver" : `Produto ${idx + 1}...`}
                      className={inputCls}
                    />
                  </div>
                  <button
                    onClick={() => { setPickerIdx(pickerIdx === idx ? null : idx); setCatSel(""); }}
                    className={`shrink-0 px-2 py-2 text-xs rounded-lg border transition-colors ${pickerIdx === idx ? "bg-[#E8740E] text-white border-[#E8740E]" : "text-[#E8740E] border-[#E8740E]/40 hover:bg-[#FFF5EB]"}`}
                    title="Selecionar do estoque"
                  >📋</button>
                  {idx > 0 && <button onClick={() => {
                    setProdutos(produtos.filter((_, i) => i !== idx));
                    setCoresExtras(coresExtras.filter((_, i) => i !== (idx - 1)));
                    if (pickerIdx === idx) setPickerIdx(null);
                  }} className="px-2 py-2.5 text-red-400 hover:text-red-600 text-lg">✕</button>}
                </div>
                {idx > 0 && prod && coresIdx.length > 0 && (
                  <div className={`px-4 py-3 rounded-xl border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-[#FAFAFA] border-[#E5E5EA]"}`}>
                    <p className={`text-xs font-medium mb-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Cor do produto {idx + 1}:</p>
                    <div className="flex flex-wrap gap-2">
                      {coresIdx.map(cor => (
                        <button key={cor} onClick={() => {
                          const next = [...coresExtras];
                          while (next.length < idx) next.push("");
                          next[idx - 1] = next[idx - 1] === cor ? "" : cor;
                          setCoresExtras(next);
                        }}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${corIdxSel === cor ? "bg-[#E8740E] text-white border-[#E8740E]" : (dm ? "bg-[#2C2C2E] text-[#F5F5F7] border-[#3A3A3C] hover:border-[#E8740E]" : "bg-white text-[#1D1D1F] border-[#D2D2D7] hover:border-[#E8740E]")}`}
                        >{corParaPT(cor)}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );})}
            {/* Picker inline para o slot selecionado */}
            {pickerIdx !== null && (
              <div className={`space-y-2 p-3 rounded-xl border ${dm ? "border-[#E8740E]/40 bg-[#E8740E]/5" : "border-[#E8740E]/30 bg-[#FFF5EB]/60"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#E8740E]">Produto {pickerIdx + 1} — selecionar do estoque:</p>
                  <button onClick={() => { setPickerIdx(null); setCatSel(""); }} className="text-xs text-[#86868B] hover:text-red-500">✕</button>
                </div>
                <select value={catSel} onChange={(e) => setCatSel(e.target.value)} className={inputCls}>
                  <option value="">-- Categoria --</option>
                  {categoriaPrecos.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
                  <option value="SEMINOVOS">📱 Seminovos (em estoque)</option>
                </select>
                {catSel && (
                  <div className={`max-h-[250px] overflow-y-auto rounded-xl border divide-y ${dm ? "border-[#3A3A3C] divide-[#3A3A3C]" : "border-[#D2D2D7] divide-[#E5E5EA]"}`}>
                    {(() => {
                      const lista = catSel === "SEMINOVOS" ? seminovosDisponiveis : produtosFiltradosPreco;
                      if (lista.length === 0) return <p className="text-xs text-center text-[#86868B] py-4">Nenhum produto</p>;
                      return lista.map((m) => {
                        const sel = produtos[pickerIdx!] === m.nome;
                        return (
                          <button key={m.nome} onClick={() => {
                            const idx = pickerIdx!;
                            const np = [...produtos];
                            np[idx] = sel ? "" : m.nome;
                            setProdutos(np);
                            // Guarda preço individual desse produto e recalcula soma
                            const novosPrecos = { ...precosPorProduto };
                            if (sel) { delete novosPrecos[idx]; } else { novosPrecos[idx] = m.preco || 0; }
                            setPrecosPorProduto(novosPrecos);
                            // Soma de todos os produtos selecionados
                            const soma = Object.values(novosPrecos).reduce((s, v) => s + v, 0);
                            setPreco(soma > 0 ? soma.toLocaleString("pt-BR") : "");
                            if (idx === 0) setCorSel("");
                            if (!sel) { setPickerIdx(null); setCatSel(""); }
                          }} className={`w-full px-4 py-3 flex items-center justify-between text-left transition-all ${sel ? (dm ? "bg-[#E8740E]/20 border-l-4 border-[#E8740E]" : "bg-[#FFF5EB] border-l-4 border-[#E8740E]") : (dm ? "hover:bg-[#2C2C2E]" : "hover:bg-[#F9F9FB]")}`}>
                            <p className={`text-sm font-semibold ${sel ? "text-[#E8740E]" : (dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]")}`}>{m.nome}</p>
                            <p className={`text-sm font-bold ${sel ? "text-[#E8740E]" : (dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]")}`}>{m.preco > 0 ? `R$ ${m.preco.toLocaleString("pt-BR")}` : "—"}</p>
                          </button>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {/* === CARRINHO: produtos já adicionados === */}
            {carrinhoLink.length > 0 && (
              <div className={`rounded-xl p-3 space-y-1.5 border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-green-50 border-green-200"}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${dm ? "text-green-400" : "text-green-700"}`}>
                  Produtos no link ({carrinhoLink.length})
                </p>
                {carrinhoLink.map((item, i) => (
                  <div key={item.key} className="flex items-center justify-between text-xs gap-2">
                    <div className="flex-1 min-w-0">
                      <span className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>
                        {i + 1}. {item.nome}{item.cor ? ` ${item.cor}` : ""}
                      </span>
                    </div>
                    <span className={`font-semibold shrink-0 ${dm ? "text-green-400" : "text-green-600"}`}>
                      {item.preco > 0 ? `R$ ${item.preco.toLocaleString("pt-BR")}` : "—"}
                    </span>
                    <button
                      onClick={() => setCarrinhoLink(carrinhoLink.filter((_, idx) => idx !== i))}
                      className="text-red-400 hover:text-red-600 text-sm shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50"
                      title="Remover produto"
                    >✕</button>
                  </div>
                ))}
                {carrinhoLink.length > 1 && (
                  <div className={`pt-1.5 border-t flex justify-between text-xs font-bold ${dm ? "border-[#3A3A3C] text-[#F5F5F7]" : "border-green-300 text-[#1D1D1F]"}`}>
                    <span>Total</span>
                    <span className={dm ? "text-green-400" : "text-green-600"}>
                      R$ {carrinhoLink.reduce((s, item) => s + item.preco, 0).toLocaleString("pt-BR")}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* === PICKER: selecionar categoria → modelo → cor → add to cart === */}
            {addingProduct ? (
              <div className={`space-y-2 p-3 rounded-xl border ${dm ? "border-[#E8740E]/40 bg-[#E8740E]/5" : "border-[#E8740E]/30 bg-[#FFF5EB]/60"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#E8740E]">
                    {carrinhoLink.length === 0 ? "Selecione o produto:" : `Produto ${carrinhoLink.length + 1} — selecionar:`}
                  </p>
                  {carrinhoLink.length > 0 && (
                    <button onClick={() => { setAddingProduct(false); setCartCatSel(""); setCartCorPending(null); }} className="text-xs text-[#86868B] hover:text-red-500">✕</button>
                  )}
                </div>
                <select value={cartCatSel} onChange={(e) => { setCartCatSel(e.target.value); setCartCorPending(null); }} className={inputCls}>
                  <option value="">-- Categoria --</option>
                  {categoriaPrecos.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
                  <option value="SEMINOVOS">📱 Seminovos (em estoque)</option>
                </select>

                {/* Cor selector when a model is pending color choice */}
                {cartCorPending && (() => {
                  const cores = coresParaProduto(cartCorPending.nome);
                  if (cores.length === 0) return null;
                  return (
                    <div className={`px-4 py-3 rounded-xl ${dm ? "bg-[#1C1C1E] border border-[#3A3A3C]" : "bg-[#FAFAFA] border border-[#E5E5EA]"}`}>
                      <p className={`text-xs font-medium mb-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                        Selecione a cor de <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{cartCorPending.nome}</strong>:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {cores.map(cor => (
                          <button key={cor} onClick={() => {
                            const corPT = corParaPT(cor);
                            const corEN = corParaEN(cor) || cor;
                            setCarrinhoLink([...carrinhoLink, {
                              key: `${Date.now()}-${Math.random()}`,
                              nome: cartCorPending!.nome,
                              cor: corPT,
                              corEN,
                              preco: cartCorPending!.preco,
                              categoria: cartCorPending!.categoria,
                            }]);
                            setCartCorPending(null);
                            setCartCatSel("");
                            setAddingProduct(false);
                          }}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${dm ? "bg-[#2C2C2E] text-[#F5F5F7] border-[#3A3A3C] hover:border-[#E8740E] hover:bg-[#E8740E]/20" : "bg-white text-[#1D1D1F] border-[#D2D2D7] hover:border-[#E8740E] hover:bg-[#FFF5EB]"}`}
                          >{corParaPT(cor)}</button>
                        ))}
                      </div>
                      <button onClick={() => setCartCorPending(null)} className="text-[10px] text-[#86868B] hover:text-[#1D1D1F] mt-2">← Voltar</button>
                    </div>
                  );
                })()}

                {/* Model list (hidden when pending color) */}
                {cartCatSel && !cartCorPending && (
                  <div className={`max-h-[250px] overflow-y-auto rounded-xl border divide-y ${dm ? "border-[#3A3A3C] divide-[#3A3A3C]" : "border-[#D2D2D7] divide-[#E5E5EA]"}`}>
                    {(() => {
                      const cartProdutos = precosVenda
                        .filter(p => p.categoria === cartCatSel)
                        .map(p => ({ nome: `${p.modelo} ${p.armazenamento}`.trim(), preco: p.preco_pix }))
                        .sort((a, b) => a.nome.localeCompare(b.nome));
                      const lista = cartCatSel === "SEMINOVOS" ? seminovosDisponiveis : cartProdutos;
                      if (lista.length === 0) return <p className="text-xs text-center text-[#86868B] py-4">Nenhum produto</p>;
                      return lista.map((m) => (
                        <button key={m.nome} onClick={() => {
                          const cores = coresParaProduto(m.nome);
                          const isSeminovo = cartCatSel === "SEMINOVOS";
                          if (!isSeminovo && cores.length > 0) {
                            // Has colors: show color picker
                            setCartCorPending({ nome: m.nome, preco: m.preco, categoria: cartCatSel });
                          } else {
                            // No colors: add directly
                            setCarrinhoLink([...carrinhoLink, {
                              key: `${Date.now()}-${Math.random()}`,
                              nome: m.nome,
                              cor: "",
                              corEN: "",
                              preco: m.preco,
                              categoria: isSeminovo ? "SEMINOVOS" : cartCatSel,
                            }]);
                            setCartCatSel("");
                            setAddingProduct(false);
                          }
                        }} className={`w-full px-4 py-3 flex items-center justify-between text-left transition-all ${dm ? "hover:bg-[#2C2C2E]" : "hover:bg-[#F9F9FB]"}`}>
                          <p className={`text-sm font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{m.nome}</p>
                          <p className={`text-sm font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{m.preco > 0 ? `R$ ${m.preco.toLocaleString("pt-BR")}` : "—"}</p>
                        </button>
                      ));
                    })()}
                  </div>
                )}
              </div>
            ) : (
              /* Button to open picker again */
              <button
                onClick={() => { setAddingProduct(true); setCartCatSel(""); setCartCorPending(null); }}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold border-2 border-dashed transition-colors ${dm ? "border-[#E8740E]/50 text-[#E8740E] hover:bg-[#E8740E]/10" : "border-[#E8740E]/40 text-[#E8740E] hover:bg-[#FFF5EB]"}`}
              >
                + Adicionar produto
              </button>
            )}
          </div>
        )}

        <div>
          <label className={labelCls}>Preco Base (R$)</label>
          <input
            type="text"
            inputMode="numeric"
            value={preco}
            onChange={(e) => setPreco(formatPreco(e.target.value))}
            placeholder="Ex: 8.797 (valor total)"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Desconto (R$)</label>
          <input
            type="text"
            inputMode="numeric"
            value={desconto}
            onChange={(e) => setDesconto(formatPreco(e.target.value))}
            placeholder="Ex: 200 (opcional)"
            className={inputCls}
          />
        </div>

        {/* Cobranca extra (capa, pelicula, brinde, etc). Soma no total do
            link e fica visivel pra operadora no historico e pro cliente no
            /compra junto com o produto. */}
        <div className={`p-3 rounded-xl border ${extraValor ? "border-amber-400 bg-amber-50" : "border-[#E8E8ED] bg-[#FAFAFA]"}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-[#1D1D1F]">➕ Cobrança extra</span>
            <span className="text-[10px] text-[#86868B]">(opcional — capa, película, brinde, etc)</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              value={extraDescricao}
              onChange={(e) => setExtraDescricao(e.target.value)}
              placeholder="Ex: Capa + película"
              className={inputCls}
            />
            <input
              value={extraValor}
              onChange={(e) => setExtraValor(formatPreco(e.target.value))}
              placeholder="R$ 60"
              inputMode="numeric"
              className={`${inputCls} max-w-[120px]`}
            />
          </div>
        </div>

        {/* Troca / Trade-in */}
        <div className={`p-3 rounded-xl border ${temTroca && trocaProduto ? "border-[#E8740E] bg-[#FFF8F0]" : "border-[#E8E8ED] bg-[#FAFAFA]"}`}>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={temTroca}
              onChange={(e) => { setTemTroca(e.target.checked); if (!e.target.checked) { setTrocaProduto(""); setTrocaValor(""); setTrocaCondicao(""); setTrocaCor(""); setTemSegundaTroca(false); setTrocaProduto2(""); setTrocaValor2(""); } }}
              className="w-4 h-4 rounded accent-[#E8740E]"
            />
            <span className="text-sm font-semibold text-[#1D1D1F]">Produto na troca</span>
          </label>
          {temTroca && (
            <div className="space-y-3 mt-3">
              <div>
                <label className={labelCls}>{temSegundaTroca ? "Detalhes do 1º produto na troca" : "Detalhes do produto na troca"}</label>
                <textarea
                  value={trocaProduto}
                  onChange={(e) => setTrocaProduto(e.target.value)}
                  placeholder="Ex: iPhone 16 Plus 128GB, 100% bateria, sem marcas, com caixa e cabo, garantia Apple até Out/2026"
                  rows={3}
                  className={inputCls + " resize-none"}
                />
              </div>
              {trocaCondicao && (
                <div className={`p-2.5 rounded-lg text-xs ${dm ? "bg-purple-900/30 text-purple-300" : "bg-purple-50 text-purple-700"}`}>
                  <span className="font-semibold">Condição:</span> {trocaCondicao}
                </div>
              )}
              {trocaCor && (
                <div className="flex items-center gap-2">
                  <label className={labelCls + " mb-0"}>Cor do usado:</label>
                  <span className={`text-xs font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{trocaCor}</span>
                </div>
              )}
              <div>
                <label className={labelCls}>Valor de Avaliacao do {temSegundaTroca ? "1º " : ""}Usado (R$)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={trocaValor}
                  onChange={(e) => setTrocaValor(formatPreco(e.target.value))}
                  placeholder="Ex: 4.500"
                  className={inputCls}
                />
              </div>

              {!temSegundaTroca && (
                <button
                  type="button"
                  onClick={() => setTemSegundaTroca(true)}
                  className="text-xs text-[#E8740E] hover:underline font-semibold"
                >
                  ➕ Adicionar 2º produto na troca
                </button>
              )}

              {temSegundaTroca && (
                <div className="space-y-3 pt-3 border-t border-dashed border-[#E8740E]/40">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#E8740E]">2º Produto na troca</span>
                    <button
                      type="button"
                      onClick={() => { setTemSegundaTroca(false); setTrocaProduto2(""); setTrocaValor2(""); }}
                      className="text-xs text-[#86868B] hover:text-red-500"
                    >
                      ✕ Remover
                    </button>
                  </div>
                  <div>
                    <label className={labelCls}>Detalhes do 2º produto na troca</label>
                    <textarea
                      value={trocaProduto2}
                      onChange={(e) => setTrocaProduto2(e.target.value)}
                      placeholder="Ex: Apple Watch Series 9 45mm, bateria 98%, com caixa"
                      rows={3}
                      className={inputCls + " resize-none"}
                    />
                  </div>
                  {trocaCondicao2 && (
                    <div className={`p-2.5 rounded-lg text-xs ${dm ? "bg-purple-900/30 text-purple-300" : "bg-purple-50 text-purple-700"}`}>
                      <span className="font-semibold">Condição:</span> {trocaCondicao2}
                    </div>
                  )}
                  {trocaCor2 && (
                    <div className="flex items-center gap-2">
                      <label className={labelCls + " mb-0"}>Cor do usado:</label>
                      <span className={`text-xs font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{trocaCor2}</span>
                    </div>
                  )}
                  <div>
                    <label className={labelCls}>Valor de Avaliacao do 2º Usado (R$)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={trocaValor2}
                      onChange={(e) => setTrocaValor2(formatPreco(e.target.value))}
                      placeholder="Ex: 1.800"
                      className={inputCls}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dados do cliente — pré-preenchimento opcional */}
        <div className={`p-3 rounded-xl border ${incluirDadosCliente ? "border-[#E8740E] bg-[#FFF8F0]" : "border-[#E8E8ED] bg-[#FAFAFA]"}`}>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={incluirDadosCliente}
              onChange={(e) => { setIncluirDadosCliente(e.target.checked); if (!e.target.checked) limparDadosCliente(); }}
              className="w-4 h-4 rounded accent-[#E8740E]"
            />
            <span className="text-sm font-semibold text-[#1D1D1F]">Deseja incluir dados do cliente?</span>
          </label>
          {incluirDadosCliente && (
            <div className="space-y-3 mt-3">
              <div>
                <label className={labelCls}>Colar dados do cliente (formato WhatsApp)</label>
                <textarea
                  value={dadosClienteTexto}
                  onChange={(e) => setDadosClienteTexto(e.target.value)}
                  placeholder={"Cole o bloco do formulário antigo. Exemplo:\n\n✅ Nome completo: João da Silva\n✅ CPF: 000.000.000-00\n✅ E-mail: joao@email.com\n✅ Telefone: 21 99999-9999\n✅ CEP: 00000-000\n✅ Endereço: Rua Exemplo, 100\n✅ Bairro: Centro"}
                  rows={6}
                  className={inputCls + " resize-none font-mono text-xs"}
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={aplicarParse}
                    disabled={!dadosClienteTexto.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] disabled:opacity-40 transition-colors"
                  >
                    🧠 Extrair dados do texto
                  </button>
                  {(cliNome || cliCpf || cliEmail) && (
                    <button
                      type="button"
                      onClick={limparDadosCliente}
                      className="px-3 py-1.5 rounded-lg text-xs text-red-500 border border-red-200 hover:bg-red-50"
                    >
                      🗑️ Limpar
                    </button>
                  )}
                  {parseMsg && <span className="text-[11px] text-[#6E6E73]">{parseMsg}</span>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 relative">
                  <label className={labelCls}>Nome completo</label>
                  <input
                    type="text"
                    value={cliNome}
                    onChange={(e) => { setCliNome(e.target.value); setShowCliSugs(true); }}
                    onFocus={() => setShowCliSugs(true)}
                    onBlur={() => setTimeout(() => setShowCliSugs(false), 200)}
                    placeholder="Digite 2+ letras para buscar cliente cadastrado…"
                    className={inputCls}
                  />
                  {showCliSugs && cliSugs.length > 0 && (
                    <div className={`absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border shadow-lg ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`}>
                      {cliSugs.map((c, i) => (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); aplicarCliente(c); }}
                          className={`w-full text-left px-3 py-2 text-sm ${dm ? "hover:bg-[#2C2C2E] text-[#F5F5F7]" : "hover:bg-[#F5F5F7] text-[#1D1D1F]"} border-b ${dm ? "border-[#3A3A3C]" : "border-[#E5E5EA]"} last:border-0`}
                        >
                          <div className="font-semibold">{c.nome}</div>
                          <div className="text-[11px] text-[#8E8E93] flex gap-2 flex-wrap">
                            {c.telefone && <span>📞 {c.telefone}</span>}
                            {c.cpf && <span>CPF {c.cpf}</span>}
                            {c.email && <span>✉️ {c.email}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelCls}>CPF</label>
                  <input type="text" value={cliCpf} onChange={(e) => setCliCpf(e.target.value)} placeholder="000.000.000-00" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Telefone</label>
                  <input type="text" value={cliTelefone} onChange={(e) => setCliTelefone(e.target.value)} placeholder="(21) 99999-9999" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>E-mail</label>
                  <input type="email" value={cliEmail} onChange={(e) => setCliEmail(e.target.value)} placeholder="cliente@email.com" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>CEP</label>
                  <input type="text" value={cliCep} onChange={(e) => setCliCep(e.target.value)} placeholder="00000-000" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Bairro</label>
                  <input type="text" value={cliBairro} onChange={(e) => setCliBairro(e.target.value)} placeholder="Bairro" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Endereço (rua)</label>
                  <input type="text" value={cliEndereco} onChange={(e) => setCliEndereco(e.target.value)} placeholder="Rua exemplo" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Número</label>
                  <input type="text" value={cliNumero} onChange={(e) => setCliNumero(e.target.value)} placeholder="100" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Complemento</label>
                  <input type="text" value={cliComplemento} onChange={(e) => setCliComplemento(e.target.value)} placeholder="Apto, bloco..." className={inputCls} />
                </div>
              </div>
              <p className="text-[10px] text-[#86868B]">Esses dados vão pré-preenchidos quando o cliente abrir o link — ele só precisa conferir e confirmar.</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className={showParcelas ? "" : "col-span-2"}>
            <label className={labelCls}>Forma de Pagamento</label>
            <select value={forma} onChange={(e) => { setForma(e.target.value); if (!["Cartao Credito", "Cartao Debito", "Link de Pagamento"].includes(e.target.value)) { setParcelas(""); setEntradaPix(""); } }} className={inputCls}>
              <option value="">-- Opcional --</option>
              <option value="Pix">Pix</option>
              <option value="Cartao Credito">Cartao Credito</option>
              <option value="Cartao Debito">Cartao Debito</option>
              <option value="Especie">Especie</option>
              <option value="Link de Pagamento">Link de Pagamento</option>
            </select>
          </div>
          {showParcelas && (
            <div>
              <label className={labelCls}>Parcelas {forma === "Link de Pagamento" && <span className="text-xs text-[#86868B]">(máx. 12x)</span>}</label>
              <select value={parcelas} onChange={(e) => setParcelas(e.target.value)} className={inputCls}>
                <option value="">--</option>
                {Array.from({ length: forma === "Link de Pagamento" ? 12 : 21 }, (_, i) => i + 1).map(n => <option key={n} value={String(n)}>{n}x</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Bloco fluxo de pagamento — explica em texto claro o que cliente vai
            pagar agora e quando, especialmente em encomenda com sinal. So
            renderiza quando ha forma + preco preenchidos. */}
        {forma && precoBase > 0 && (() => {
          const trocaTotalFx = (Number(rawTrocaVal) || 0) + (Number(rawTrocaVal2) || 0);
          const baseAposTroca = Math.max(precoBase - trocaTotalFx - descontoNum, 0);
          const pctFx = Number(sinalPct) || 0;
          const temSinalFx = encomenda && pctFx > 0 && pctFx < 100;
          const valorAgora = temSinalFx ? Math.round((baseAposTroca * pctFx) / 100) : baseAposTroca;
          const valorRestante = temSinalFx ? Math.max(baseAposTroca - valorAgora, 0) : 0;
          const formaLabel = forma === "Pix" ? "PIX" : forma === "Link de Pagamento" ? `Link MP${parcelas ? ` ${parcelas}x` : ""}` : forma === "Cartao Credito" ? `Cartão${parcelas ? ` ${parcelas}x` : ""}` : forma === "Cartao Debito" ? "Débito" : forma === "Especie" ? "Espécie" : forma;
          return (
            <div className={`rounded-xl border p-3 text-xs leading-relaxed ${encomenda ? "border-blue-300 bg-blue-50 text-blue-900" : "border-[#D2D2D7] bg-[#F9F9FB] text-[#1D1D1F]"}`}>
              <p className="font-bold mb-1.5">{encomenda ? "📦 Fluxo de pagamento (encomenda)" : "💳 Fluxo de pagamento"}</p>
              <ol className="space-y-1 list-none">
                <li>
                  <span className="font-semibold">1.</span> Cliente paga <strong>R$ {valorAgora.toLocaleString("pt-BR")}</strong> agora via <strong>{formaLabel}</strong>{temSinalFx ? ` (sinal ${pctFx}%)` : ""}
                </li>
                {encomenda && previsaoChegada && (
                  <li><span className="font-semibold">2.</span> Aguarda <strong>{previsaoChegada}</strong> para chegada do produto</li>
                )}
                {valorRestante > 0 && (
                  <li><span className="font-semibold">{encomenda && previsaoChegada ? "3" : "2"}.</span> Paga restante <strong>R$ {valorRestante.toLocaleString("pt-BR")}</strong> na entrega</li>
                )}
                {trocaTotalFx > 0 && (
                  <li><span className="font-semibold">{encomenda ? "4" : "2"}.</span> 💱 Aparelho da troca (R$ {trocaTotalFx.toLocaleString("pt-BR")}) recolhido na retirada</li>
                )}
              </ol>
            </div>
          );
        })()}

        {showEntradaPix && (
          <div>
            <label className={labelCls}>Entrada no Pix (R$)</label>
            <input
              type="text"
              inputMode="numeric"
              value={entradaPix}
              onChange={(e) => setEntradaPix(formatPreco(e.target.value))}
              placeholder="Ex: 2.000"
              className={inputCls}
            />
          </div>
        )}

        <div>
          <label className={labelCls}>Local de Entrega</label>
          <select
            value={localEntrega}
            onChange={(e) => {
              const v = e.target.value;
              // Encomenda nao aceita shopping/correios — se selecionou um, derruba
              if (encomenda && (v === "shopping" || v === "correios")) return;
              setLocalEntrega(v);
              if (v !== "shopping" && v !== "outro") setShoppingNome("");
            }}
            className={inputCls}
          >
            <option value="">-- Opcional --</option>
            <option value="loja">Retirada no Escritório</option>
            <option value="residencia">Entrega em Residência</option>
            <option value="outro">Outro local combinado</option>
            {!encomenda && (
              <>
                <option value="shopping">Entrega em Shopping</option>
                <option value="correios">📦 Envio Correios</option>
              </>
            )}
          </select>
          {encomenda && (
            <p className="text-[11px] text-blue-700 mt-1">
              📦 Encomenda: só aceita Residência, Escritório ou Outro local. {(localEntrega === "residencia" || localEntrega === "outro") && <span className="font-semibold">Pagamento será antecipado.</span>}
            </p>
          )}
        </div>

        {(localEntrega === "shopping" || localEntrega === "outro") && (
          <div>
            <label className={labelCls}>{localEntrega === "shopping" ? "Qual Shopping?" : "Qual local?"}</label>
            <input
              type="text"
              value={shoppingNome}
              onChange={(e) => setShoppingNome(e.target.value)}
              placeholder={localEntrega === "shopping" ? "Ex: BarraShopping, Village Mall..." : "Ex: Estação do metrô, escritório..."}
              className={inputCls}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Horario</label>
            <select value={horario} onChange={(e) => setHorario(e.target.value)} className={inputCls}>
              <option value="">-- Opcional --</option>
              <option value="LOGISTICA">🚚 Logística define</option>
              {(() => {
                const opts: string[] = [];
                for (let h = 10; h <= 19; h++) {
                  opts.push(`${String(h).padStart(2, "0")}:00`);
                  if (h < 19) opts.push(`${String(h).padStart(2, "0")}:30`);
                }
                return opts.map((t) => <option key={t} value={t}>{t}</option>);
              })()}
            </select>
          </div>
          <div>
            <label className={labelCls}>Data</label>
            {(() => {
              // Encomenda: orcamento dura 24h, entao agendamento so pode ser
              // hoje ou amanha. Fora disso, sem restricao (usa min/max do form
              // padrao do browser, que aceita qualquer data).
              const hoje = new Date();
              const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
              const isoFmt = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
              const minDate = encomenda ? isoFmt(hoje) : undefined;
              const maxDate = encomenda ? isoFmt(amanha) : undefined;
              return (
                <input
                  type="date"
                  value={dataEntrega}
                  min={minDate}
                  max={maxDate}
                  onChange={(e) => {
                    let v = e.target.value;
                    if (encomenda && v && (v < minDate! || v > maxDate!)) {
                      // Clamp pra dentro da janela encomenda
                      v = v < minDate! ? minDate! : maxDate!;
                    }
                    setDataEntrega(v);
                  }}
                  className={inputCls}
                />
              );
            })()}
            {encomenda && (
              <p className="text-[11px] text-blue-700 mt-1">
                ⏱ Encomenda: agendamento até amanhã (orçamento expira em 24h)
              </p>
            )}
          </div>
        </div>

        <div>
          <label className={labelCls}>Taxa de Entrega (R$)</label>
          <input
            type="text"
            inputMode="numeric"
            value={taxaEntrega}
            onChange={(e) => setTaxaEntrega(e.target.value.replace(/[^\d.,]/g, ""))}
            placeholder="Ex: 30 (opcional)"
            className={inputCls}
          />
          <p className="text-[10px] text-[#86868B] mt-0.5">Cobrado do cliente na entrega. Aparece no formulário e no WhatsApp.</p>
        </div>

        <div>
          <label className={labelCls}>Vendedor</label>
          <select value={vendedorNome} onChange={(e) => setVendedorNome(e.target.value)} className={inputCls}>
            <option value="">-- Selecionar --</option>
            {vendedoresList.map((v) => (
              <option key={v.nome} value={v.nome}>{v.nome}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Campanha / Origem do link <span className="text-[10px] font-normal opacity-60">(opcional)</span></label>
          <input
            type="text"
            value={campanha}
            onChange={(e) => setCampanha(e.target.value)}
            placeholder="Ex: Instagram Stories, Anuncio Meta, Indicacao..."
            className={inputCls}
          />
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {["Instagram Stories", "Instagram Direct", "Anuncio Meta", "WhatsApp Status", "Indicacao", "Funcionario"].map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setCampanha(p)}
                className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-colors ${campanha === p ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#98989D] hover:bg-[#3A3A3C]" : "bg-[#F5F5F7] text-[#86868B] hover:bg-[#E5E5EA]"}`}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[#86868B] mt-1">Pra rastrear conversoes por origem nos relatorios.</p>
        </div>

        {/* Resumo do valor total */}
        {precoBase > 0 && (
          <div className={`p-4 rounded-xl border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E5E5EA]"}`}>
            <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Resumo do Pedido</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Preço Base (PIX)</span>
                <span className={`font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>R$ {precoBase.toLocaleString("pt-BR")}</span>
              </div>
              {descontoNum > 0 && (
                <div className="flex justify-between">
                  <span className="text-blue-500">Desconto</span>
                  <span className="font-semibold text-blue-500">- R$ {descontoNum.toLocaleString("pt-BR")}</span>
                </div>
              )}
              {trocaNum > 0 && (
                <div className="flex justify-between">
                  <span className="text-green-500">{trocaNum2 > 0 ? "1ª Troca (avaliação)" : "Troca (avaliação)"}</span>
                  <span className="font-semibold text-green-500">- R$ {trocaNum.toLocaleString("pt-BR")}</span>
                </div>
              )}
              {trocaNum2 > 0 && (
                <div className="flex justify-between">
                  <span className="text-green-500">2ª Troca (avaliação)</span>
                  <span className="font-semibold text-green-500">- R$ {trocaNum2.toLocaleString("pt-BR")}</span>
                </div>
              )}
              {trocaTotal > 0 && (
                <div className="flex justify-between">
                  <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Subtotal</span>
                  <span className={`font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>R$ {valorSemTaxa.toLocaleString("pt-BR")}</span>
                </div>
              )}
              {entradaNum > 0 && (
                <div className="flex justify-between">
                  <span className="text-blue-500">Entrada PIX</span>
                  <span className="font-semibold text-blue-500">R$ {entradaNum.toLocaleString("pt-BR")}</span>
                </div>
              )}
              {taxa > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Valor a parcelar</span>
                    <span className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>R$ {valorParcelar.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-400">Taxa {forma === "Link de Pagamento" ? "link" : "cartão"} ({taxa}%)</span>
                    <span className="font-semibold text-red-400">+ R$ {(valorComTaxa - valorParcelar).toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Parcelamento</span>
                    <span className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{numParcelas}x de R$ {valorParcela.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </>
              )}
              <div className={`flex justify-between pt-2 border-t ${dm ? "border-[#3A3A3C]" : "border-[#E5E5EA]"}`}>
                <span className="font-bold text-[#E8740E]">VALOR TOTAL A PAGAR</span>
                <span className="font-bold text-[#E8740E] text-lg">R$ {valorTotal.toLocaleString("pt-BR")}</span>
              </div>
            </div>
          </div>
        )}

        {/* Pedido já pago */}
        <div>
          <label className={labelCls}>Pagamento já efetuado? <span className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>(opcional)</span></label>
          <div className="flex gap-2 mt-1">
            {([["", "Não"], ["link", "Pago via Link"], ["pix", "Pago via PIX"]] as const).map(([val, label]) => (
              <button key={val} onClick={() => setPagamentoPago(val)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${pagamentoPago === val ? "bg-[#E8740E] text-white border-[#E8740E]" : (dm ? "bg-[#1C1C1E] text-[#98989D] border-[#3A3A3C] hover:border-[#E8740E]" : "bg-white text-[#86868B] border-[#D2D2D7] hover:border-[#E8740E]")}`}>
                {label}
              </button>
            ))}
          </div>
          {pagamentoPago && (
            <p className={`text-xs mt-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
              No formulário o campo pagamento virá preenchido como "pedido pago no Instagram via {pagamentoPago === "link" ? "link" : "PIX"}"
            </p>
          )}
        </div>

        {/* Fluxo invertido: formulário primeiro, pagamento MP depois */}
        {!pagamentoPago && (
          <div className={`rounded-xl p-3 border ${dm ? "border-[#3A3A3C] bg-[#1C1C1E]" : "border-[#009EE3]/30 bg-[#E6F6FD]"}`}>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pagarMp}
                onChange={(e) => setPagarMp(e.target.checked)}
                className="mt-0.5 accent-[#009EE3] w-4 h-4 shrink-0"
              />
              <div className="flex-1">
                <p className={`text-sm font-semibold ${dm ? "text-[#E5E5E7]" : "text-[#1D1D1F]"}`}>
                  💳 Formulário primeiro, depois Mercado Pago
                </p>
                <p className={`text-[11px] leading-relaxed mt-0.5 ${dm ? "text-[#98989D]" : "text-[#6E6E73]"}`}>
                  Cliente preenche os dados e clica em <strong>"Pagar com Mercado Pago"</strong>.
                  Quando MP aprovar, a notificação do pedido completo chega no grupo automaticamente
                  — sem delay de 5s e com todos os dados preenchidos.
                </p>
              </div>
            </label>
          </div>
        )}

        <button
          onClick={gerarLink}
          disabled={carrinhoLink.length === 0 && !produtos.some(Boolean)}
          className={`w-full py-3 font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${editingLinkId ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white" : "bg-[#E8740E] hover:bg-[#D06A0D] active:bg-[#B85E0B] text-white"}`}
        >
          {editingLinkId ? "💾 Salvar Alterações" : "Gerar Link"}
        </button>

        {/* ── Link Mercado Pago (pagamento via MP) ─────── */}
        <div className={`rounded-xl p-3 border ${dm ? "border-[#3A3A3C] bg-[#1C1C1E]" : "border-[#D2D2D7] bg-[#F5F5F7]"}`}>
          <p className={`text-xs font-semibold mb-1 ${dm ? "text-[#E5E5E7]" : "text-[#1D1D1F]"}`}>
            💳 Gerar Link de Pagamento (Mercado Pago)
          </p>
          <p className={`text-[11px] mb-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
            R$ {valorComTaxa.toLocaleString("pt-BR")} • até {numParcelas > 0 ? numParcelas : 1}x sem acréscimo
          </p>
          <button
            onClick={gerarLinkMP}
            disabled={mpLoading || (carrinhoLink.length === 0 && !produtos.some(Boolean)) || valorComTaxa <= 0 || !!editingLinkId}
            title={editingLinkId ? "Em modo edicao o link MP nao pode ser atualizado — salve as alteracoes pelo botao azul acima, ou cancele a edicao pra gerar um link MP novo" : undefined}
            className="w-full py-2.5 bg-[#00B1EA] text-white font-bold rounded-xl hover:bg-[#0097C7] active:bg-[#007FAA] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mpLoading ? "Gerando..." : editingLinkId ? "🔒 MP indisponivel em edicao" : "Gerar Link MP"}
          </button>
          {mpErr && (
            <p className="text-xs text-red-500 mt-2">{mpErr}</p>
          )}
          {mpLink && (
            <div className="mt-3 space-y-2">
              <div className={`rounded-lg p-2 break-all text-xs font-mono border ${dm ? "border-[#3A3A3C] bg-[#0A0A0A] text-[#E5E5E7]" : "border-[#D2D2D7] bg-white text-[#1D1D1F]"}`}>
                {mpLink}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={copiarMpLink}
                  className={`flex-1 py-2 text-sm font-bold rounded-xl transition-colors ${mpCopied ? "bg-green-500 text-white" : "bg-[#1D1D1F] text-white hover:bg-[#333]"}`}
                >
                  {mpCopied ? "Copiado!" : "Copiar"}
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(mpLink)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-3 bg-[#25D366] text-white font-bold rounded-xl hover:bg-[#20BD5A] transition-colors flex items-center gap-1 text-sm"
                >
                  WhatsApp
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {generatedLink && (
        <div className="bg-white border border-[#D2D2D7] rounded-xl p-4 shadow-sm space-y-3">
          <p className="text-sm font-semibold text-[#1D1D1F]">Link gerado:</p>
          <div className="bg-[#F5F5F7] rounded-lg p-3 break-all text-xs text-[#1D1D1F] font-mono border border-[#D2D2D7]">
            {generatedLink}
          </div>

          {/* Pre-visualizacao WhatsApp — bubble que simula como cliente vai ver */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#86868B]">📱 Como vai aparecer no WhatsApp:</p>
            <div className="bg-[#E5DDD5] rounded-lg p-3" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.03) 1px, transparent 0)", backgroundSize: "12px 12px" }}>
              <div className="ml-auto max-w-[85%] bg-[#DCF8C6] rounded-lg rounded-tr-none p-2 shadow-sm">
                {/* Card de preview do link (simula rich preview do WhatsApp) */}
                <div className="bg-white/80 rounded border-l-4 border-[#25D366] p-2 mb-1.5">
                  <p className="text-[10px] font-bold text-[#075E54]">TigraoImports</p>
                  <p className="text-[10px] text-[#3B4A54] line-clamp-2">Finalize sua compra com troca em 1 minuto</p>
                  <p className="text-[9px] text-[#667781] mt-0.5 truncate">{generatedLink.replace(/^https?:\/\//, "")}</p>
                </div>
                <p className="text-[11px] text-[#1F2937] break-all">{generatedLink}</p>
                <p className="text-[9px] text-[#667781] text-right mt-1">
                  {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} ✓✓
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={copiar}
              className={`flex-1 py-2.5 font-bold rounded-xl transition-colors ${
                copied
                  ? "bg-green-500 text-white"
                  : "bg-[#1D1D1F] text-white hover:bg-[#333]"
              }`}
            >
              {copied ? "Copiado!" : "Copiar Link"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(generatedLink)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 px-4 bg-[#25D366] text-white font-bold rounded-xl hover:bg-[#20BD5A] transition-colors flex items-center gap-1"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Enviar
            </a>
          </div>
          <p className="text-[10px] text-[#86868B] text-center">
            WhatsApp: {vendedorNome === "Andre" ? "Andre" : "Bianca"}
          </p>
        </div>
      )}
      </>
      )}
    </div>
  );
}
