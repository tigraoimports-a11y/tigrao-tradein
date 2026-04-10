"use client";

import { useState, useEffect, useMemo } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { getWhatsAppByVendedor, VENDEDORES } from "@/lib/whatsapp-config";
import { corParaPT, corParaEN } from "@/lib/cor-pt";
import { getModeloBase } from "@/lib/produto-display";

export default function GerarLinkPage() {
  const { user, password: adminPw, apiHeaders: adminHeaders, darkMode: dm } = useAdmin();

  const [produtos, setProdutos] = useState<string[]>([""]);
  const [preco, setPreco] = useState("");
  // Preços individuais por produto (idx → preco numérico), pra somar quando tem 2+ produtos
  const [precosPorProduto, setPrecosPorProduto] = useState<Record<number, number>>({});
  const [produtoManual, setProdutoManual] = useState(false);
  const [catSel, setCatSel] = useState("");
  const [pickerIdx, setPickerIdx] = useState<number | null>(null);

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
      const nome = corPt ? `${base} ${corPt}` : base;
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
      .replace(/(\d+)\s*[º°]/g, "$1")
      .replace(/\bGENERATION\b/gi, "GEN")
      .replace(/\bGERAÇÃO\b/gi, "GEN");
    const stripNoise = (s: string) => normGen(s)
      .replace(/\b\d+\s*(GB|TB)\b/gi, "")
      .replace(/\b\d+\s*MM\b/gi, "")
      .replace(/\b(GPS|CELLULAR|WI[- ]?FI|CELL)\b/gi, "")
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

  const [vendedorNome, setVendedorNome] = useState("");
  const [forma, setForma] = useState("");
  const [parcelas, setParcelas] = useState("");
  const [entradaPix, setEntradaPix] = useState("");
  const [localEntrega, setLocalEntrega] = useState("");
  const [shoppingNome, setShoppingNome] = useState("");
  const [horario, setHorario] = useState("");
  const [dataEntrega, setDataEntrega] = useState("");
  const [desconto, setDesconto] = useState("");
  const [temTroca, setTemTroca] = useState(false);
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
  const [pagamentoPago, setPagamentoPago] = useState<"" | "link" | "pix">("");

  // Dados do cliente (pré-preenchimento via cola de texto)
  const [incluirDadosCliente, setIncluirDadosCliente] = useState(true);
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
    if (c.endereco) setCliEndereco(c.endereco);
    if (c.bairro) setCliBairro(c.bairro);
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
    tipo: "COMPRA" | "TROCA";
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
    operador: string | null;
    status: string | null;
    cliente_dados_preenchidos: Record<string, unknown> | null;
    cliente_preencheu_em: string | null;
    entrega_id: string | null;
    observacao: string | null;
    arquivado: boolean;
    created_at: string;
  };
  const [aba, setAba] = useState<"novo" | "historico">("novo");
  const [histLinks, setHistLinks] = useState<LinkCompra[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histBusca, setHistBusca] = useState("");
  const [histTipo, setHistTipo] = useState<"" | "COMPRA" | "TROCA">("");
  const [histArquivado, setHistArquivado] = useState<"0" | "1">("0");

  async function fetchHistorico() {
    if (!adminPw) return;
    setHistLoading(true);
    try {
      const params = new URLSearchParams();
      if (histBusca.trim()) params.set("q", histBusca.trim());
      if (histTipo) params.set("tipo", histTipo);
      params.set("arquivado", histArquivado);
      const res = await fetch(`/api/admin/link-compras?${params}`, { headers: adminHeaders() });
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
  }, [aba, histBusca, histTipo, histArquivado]); // eslint-disable-line react-hooks/exhaustive-deps

  async function arquivarLink(id: string, arquivado: boolean) {
    await fetch("/api/admin/link-compras", {
      method: "PATCH",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id, arquivado }),
    });
    fetchHistorico();
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
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
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

  function editarLink(l: LinkCompra) {
    reutilizarLink(l);
    setEditingLinkId(l.id);
    setPasteMsg(`✏️ Editando link ${l.short_code}. Ao clicar em "Gerar Link" as alterações serão salvas.`);
  }

  async function salvarEdicaoLink() {
    if (!editingLinkId) return false;
    const prodsFilled = produtos.filter(Boolean);
    const corPTSimples = corSel ? corParaPT(corSel) : "";
    const corENCanon = corSel ? (corParaEN(corSel) || corSel) : "";
    const nomeProdutoFinal = corSel ? `${prodsFilled[0]} ${corPTSimples}` : (prodsFilled[0] || "");
    try {
      const res = await fetch("/api/admin/link-compras", {
        method: "PATCH",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          id: editingLinkId,
          produto: nomeProdutoFinal,
          produtos_extras: prodsFilled.length > 1 ? prodsFilled.slice(1).map((nome, i) => {
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
          cliente_nome: cliNome.trim() || null,
          cliente_telefone: cliTelefone.trim() || null,
          cliente_cpf: cliCpf.trim() || null,
          cliente_email: cliEmail.trim() || null,
        }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setPasteMsg(`❌ Erro ao salvar: ${j.error || res.status}`); return false; }
      setPasteMsg(`✅ Link ${editingLinkId.slice(0, 6)} atualizado.`);
      setEditingLinkId(null);
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
        }),
      });
      const j = await res.json();
      if (!res.ok) { alert("Erro: " + (j.error || res.status)); return; }
      setEncaminharLink(null);
      setEncaminharData(""); setEncaminharHorario(""); setEncaminharObs("");
      fetchHistorico();
      alert("✅ Entrega criada com sucesso!");
    } catch (e) { alert("Erro: " + String(e)); }
  }

  function reutilizarLink(l: LinkCompra) {
    setProdutos([l.produto.replace(new RegExp(`\\s+${l.cor || ""}$`, "i"), "").trim()]);
    if (l.cor) setCorSel(l.cor);
    if (l.valor) setPreco(Number(l.valor).toLocaleString("pt-BR"));
    if (l.forma_pagamento) setForma(l.forma_pagamento);
    if (l.parcelas) setParcelas(String(l.parcelas));
    if (l.entrada) setEntradaPix(Number(l.entrada).toLocaleString("pt-BR"));
    if (l.desconto) setDesconto(Number(l.desconto).toLocaleString("pt-BR"));
    if (l.vendedor) setVendedorNome(l.vendedor);
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
    if (d.endereco) { setCliEndereco(d.endereco); encontrados.push("Endereço"); }
    if (d.numero) { setCliNumero(d.numero); encontrados.push("Número"); }
    if (d.complemento) { setCliComplemento(d.complemento); encontrados.push("Complemento"); }
    if (d.bairro) { setCliBairro(d.bairro); encontrados.push("Bairro"); }
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

  const rawPreco = preco.replace(/\./g, "").replace(",", ".");
  const rawEntrada = entradaPix.replace(/\./g, "").replace(",", ".");
  const rawTrocaVal = trocaValor.replace(/\./g, "").replace(",", ".");
  const rawTrocaVal2 = trocaValor2.replace(/\./g, "").replace(",", ".");

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
    // Snapshot local — evita race com re-renders/setState que possam limpar produtos[0]
    const prodsFilled = produtos.filter(Boolean);
    if (prodsFilled.length === 0) {
      setPasteMsg("⚠️ Selecione ao menos um produto antes de gerar o link.");
      return;
    }
    const corPTSimples = corSel ? corParaPT(corSel) : "";
    const corENCanon = corSel ? (corParaEN(corSel) || corSel) : "";
    const nomeProdutoFinal = corSel ? `${prodsFilled[0]} ${corPTSimples}` : prodsFilled[0];
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

    const whatsappDestino = getWhatsAppByVendedor(vendedorNome);
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

    // Helper: aplica cor extra no nome (PT simples)
    const aplicarCorExtra = (nome: string, idx: number): string => {
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
    }
    if (rawPreco && rawPreco !== "0") shortData.v = rawPreco;
    if (descontoNum > 0) shortData.dc = String(descontoNum);
    shortData.s = vendedorNome || "";
    shortData.w = whatsappDestino;
    if (forma) shortData.f = forma;
    if (parcelas) shortData.x = parcelas;
    if (rawEntrada && rawEntrada !== "0") shortData.e = rawEntrada;
    if (localEntrega) shortData.l = localEntrega;
    if (shoppingNome) shortData.sh = shoppingNome;
    if (horario) shortData.h = horario;
    if (dataEntrega) shortData.dt = dataEntrega;
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
              tipo: trocaProduto ? "TROCA" : "COMPRA",
              cliente_nome: cliNome.trim() || null,
              cliente_telefone: cliTelefone.trim() || null,
              cliente_cpf: cliCpf.trim() || null,
              cliente_email: cliEmail.trim() || null,
              produto: nomeProdutoFinal,
              produtos_extras: prodsFilled.length > 1 ? prodsFilled.slice(1).map((nome, i) => aplicarCorExtra(nome, i + 1)) : null,
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
              troca_produto2: temSegundaTroca ? trocaProduto2 || null : null,
              troca_valor2: temSegundaTroca ? Number(trocaValor2.replace(/\./g, "").replace(",", ".")) || 0 : 0,
              troca_condicao2: temSegundaTroca ? trocaCondicao2 || null : null,
              troca_cor2: temSegundaTroca ? trocaCor2 || null : null,
              vendedor: vendedorNome || null,
              simulacao_id: simulacaoId,
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

      if (parsedProdutos.length > 0) setProdutos(parsedProdutos);

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

  const inputCls = "w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] text-sm focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]";
  const labelCls = "block text-sm font-medium text-[#1D1D1F] mb-1";

  const showParcelas = forma === "Cartao Credito" || forma === "Cartao Debito" || forma === "Link de Pagamento";
  const showEntradaPix = forma === "Cartao Credito";

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
                          <FL label="Produto" k="produto" full />
                          {editLinkExtras && editLinkExtras.length > 0 && (
                            <div className="col-span-2">
                              <label className="block text-[10px] font-semibold text-[#86868B] uppercase tracking-wide mb-1">Produtos extras</label>
                              {editLinkExtras.map((pe, i) => (
                                <p key={i} className="text-sm px-3 py-1.5 rounded-lg border border-[#D2D2D7] mb-1">{pe}</p>
                              ))}
                            </div>
                          )}
                          <FL label="Cor" k="cor" />
                          <FL label="Valor (R$)" k="valor" type="number" />
                          <FL label="Forma de pagamento" k="forma_pagamento" />
                          <FL label="Parcelas" k="parcelas" type="number" />
                          <FL label="Entrada (R$)" k="entrada" type="number" full />
                          <FL label="Vendedor" k="vendedor" full />
                          <FL label="Observação" k="observacao" full />
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
                            {(editDados.forma_pagamento || editDados.preco) && (
                              <section>
                                <h5 className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wide mb-2">Pagamento (escolhido pelo cliente)</h5>
                                <div className="grid grid-cols-1 gap-3">
                                  <FD label="Forma de pagamento" k="forma_pagamento" full />
                                  <FD label="Preço" k="preco" full />
                                </div>
                                <p className="text-[10px] text-[#86868B] mt-1 italic">Esse texto veio do que o cliente escolheu ao preencher (parcelas, entrada, etc).</p>
                              </section>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="px-5 py-3 border-t border-[#E5E5EA] bg-[#F9F9FB] flex items-center justify-end gap-2">
                <button onClick={() => setViewDataLink(null)} className="px-4 py-2 text-sm font-semibold text-[#86868B] hover:text-[#1D1D1F]">Cancelar</button>
                <button
                  onClick={salvarDadosCliente}
                  disabled={savingDados}
                  className="px-4 py-2 rounded-lg bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#D4640A] disabled:opacity-50"
                >
                  {savingDados ? "Salvando…" : "💾 Salvar alterações"}
                </button>
              </div>
            </>
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
                <label className="text-[11px] text-[#86868B] font-semibold">Observação (opcional)</label>
                <textarea value={encaminharObs} onChange={(e) => setEncaminharObs(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm mt-1" />
              </div>
              <button onClick={encaminharParaEntrega} disabled={!encaminharData} className="w-full py-2.5 rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-600 disabled:opacity-50">
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
            <select value={histArquivado} onChange={(e) => setHistArquivado(e.target.value as "0" | "1")} className={inputCls} style={{ maxWidth: 160 }}>
              <option value="0">Ativos</option>
              <option value="1">Arquivados</option>
            </select>
          </div>

          {histLoading && <p className="text-xs text-[#86868B] text-center py-4">Carregando...</p>}
          {!histLoading && histLinks.length === 0 && <p className="text-xs text-[#86868B] text-center py-6">Nenhum link encontrado.</p>}

          <div className="space-y-2">
            {histLinks.map((l) => (
              <div key={l.id} className={`border rounded-xl p-3 ${l.tipo === "TROCA" ? "border-purple-200 bg-purple-50/30" : "border-[#E5E5EA] bg-[#F9F9FB]"}`}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${l.tipo === "TROCA" ? "bg-purple-200 text-purple-800" : "bg-orange-200 text-orange-800"}`}>
                        {l.tipo === "TROCA" ? "🔄 COMPRA + TROCA" : "🛒 SÓ COMPRA"}
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
                  <button
                    onClick={() => copiarLinkHist(l.url_curta || `${typeof window !== "undefined" ? window.location.origin : ""}/c/${l.short_code}`)}
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
                      onClick={() => { setEncaminharLink(l); setEncaminharData(new Date().toISOString().slice(0, 10)); }}
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
            ))}
          </div>
        </div>
      )}

      {aba === "novo" && (
      <>
      <div className="bg-white border border-[#D2D2D7] rounded-xl p-4 shadow-sm space-y-4">
        {/* Botão colar resumo */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#1D1D1F]">Dados do pedido</p>
          <button
            onClick={colarResumo}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 border-dashed border-[#E8740E] text-[#E8740E] hover:bg-[#FFF5EB] transition-colors"
          >
            📋 Colar resumo
          </button>
        </div>

        {pasteMsg && (
          <div className={`px-3 py-2 rounded-lg text-xs font-medium ${pasteMsg.includes("Erro") || pasteMsg.includes("Nada") || pasteMsg.includes("Nenhum") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
            {pasteMsg}
          </div>
        )}

        {/* Produto — seleção do estoque ou manual */}
        <div className="flex items-center justify-between">
          <label className={labelCls}>Produto *</label>
          <button onClick={() => { setProdutoManual(!produtoManual); setCatSel(""); setPickerIdx(null); }} className="text-xs text-[#E8740E] font-medium hover:underline">
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
            <select value={catSel} onChange={(e) => { setCatSel(e.target.value); setProdutos([""]); setPreco(""); setCorSel(""); setPrecosPorProduto({}); }} className={inputCls}>
              <option value="">-- Categoria --</option>
              {categoriaPrecos.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
              <option value="SEMINOVOS">📱 Seminovos (em estoque)</option>
            </select>
            {catSel && (
              <div className={`max-h-[300px] overflow-y-auto rounded-xl border divide-y ${dm ? "border-[#3A3A3C] divide-[#3A3A3C]" : "border-[#D2D2D7] divide-[#E5E5EA]"}`}>
                {(() => {
                  const listaBase = catSel === "SEMINOVOS" ? seminovosDisponiveis : produtosFiltradosPreco;
                  if (listaBase.length === 0) return <p className="text-xs text-center text-[#86868B] py-4">Nenhum produto</p>;
                  // Se há produto selecionado, mostra só ele (colapsa a lista)
                  const lista = produtos[0] ? listaBase.filter(m => m.nome === produtos[0]) : listaBase;
                  return lista.map((m) => {
                    const sel = produtos[0] === m.nome;
                    return (
                      <div key={m.nome}>
                        <button onClick={() => {
                          if (sel) { setProdutos([""]); setPreco(""); setCorSel(""); setPrecosPorProduto({}); return; }
                          setProdutos([m.nome]);
                          setPreco(m.preco > 0 ? m.preco.toLocaleString("pt-BR") : "");
                          setCorSel("");
                        }} className={`w-full px-4 py-3 flex items-center justify-between text-left transition-all ${sel ? (dm ? "bg-[#E8740E]/20 border-l-4 border-[#E8740E]" : "bg-[#FFF5EB] border-l-4 border-[#E8740E]") : (dm ? "hover:bg-[#2C2C2E]" : "hover:bg-[#F9F9FB]")}`}>
                          <p className={`text-sm font-semibold ${sel ? "text-[#E8740E]" : (dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]")}`}>{m.nome}{sel && corSel ? ` ${corParaPT(corSel)}` : ""}</p>
                          <p className={`text-sm font-bold ${sel ? "text-[#E8740E]" : (dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]")}`}>{m.preco > 0 ? `R$ ${m.preco.toLocaleString("pt-BR")}` : "—"}</p>
                        </button>
                        {sel && catSel !== "SEMINOVOS" && coresDisponiveis.length > 0 && (
                          <div className={`px-4 py-3 ${dm ? "bg-[#1C1C1E] border-t border-[#3A3A3C]" : "bg-[#FAFAFA] border-t border-[#E5E5EA]"}`}>
                            <p className={`text-xs font-medium mb-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Selecione a cor:</p>
                            <div className="flex flex-wrap gap-2">
                              {coresDisponiveis.map(cor => (
                                <button key={cor} onClick={() => setCorSel(corSel === cor ? "" : cor)}
                                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${corSel === cor ? "bg-[#E8740E] text-white border-[#E8740E]" : (dm ? "bg-[#2C2C2E] text-[#F5F5F7] border-[#3A3A3C] hover:border-[#E8740E]" : "bg-white text-[#1D1D1F] border-[#D2D2D7] hover:border-[#E8740E]")}`}
                                >{corParaPT(cor)}</button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        )}
        <button onClick={() => {
          const newIdx = produtos.length;
          setProdutos([...produtos, ""]);
          setProdutoManual(true);
          setPickerIdx(newIdx);
          setCatSel("");
        }} className="text-xs text-[#E8740E] font-medium hover:underline">+ Adicionar produto</button>

        {/* Resumo dos produtos com preço individual */}
        {produtos.filter(Boolean).length > 1 && (
          <div className={`rounded-xl p-3 space-y-1.5 ${dm ? "bg-[#2C2C2E] border border-[#3A3A3C]" : "bg-green-50 border border-green-200"}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${dm ? "text-green-400" : "text-green-700"}`}>Produtos no link ({produtos.filter(Boolean).length})</p>
            {produtos.filter(Boolean).map((p, i) => {
              const pPreco = lookupPreco(p);
              return (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{i + 1}. {p}</span>
                  <span className="font-semibold text-green-600">{pPreco > 0 ? `R$ ${pPreco.toLocaleString("pt-BR")}` : "—"}</span>
                </div>
              );
            })}
            <div className={`pt-1.5 border-t flex justify-between text-xs font-bold ${dm ? "border-[#3A3A3C] text-[#F5F5F7]" : "border-green-300 text-[#1D1D1F]"}`}>
              <span>Total</span>
              <span className="text-green-600">R$ {produtos.filter(Boolean).reduce((s, p) => s + lookupPreco(p), 0).toLocaleString("pt-BR")}</span>
            </div>
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
          <select value={localEntrega} onChange={(e) => { setLocalEntrega(e.target.value); if (e.target.value !== "shopping" && e.target.value !== "outro") setShoppingNome(""); }} className={inputCls}>
            <option value="">-- Opcional --</option>
            <option value="loja">Retirada em Loja</option>
            <option value="shopping">Entrega em Shopping</option>
            <option value="residencia">Entrega em Residencia</option>
            <option value="outro">Outro local</option>
          </select>
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
            <input
              type="date"
              value={dataEntrega}
              onChange={(e) => setDataEntrega(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Vendedor</label>
          <select value={vendedorNome} onChange={(e) => setVendedorNome(e.target.value)} className={inputCls}>
            <option value="">-- Selecionar --</option>
            <option value="Andre">Andre</option>
            <option value="Bianca">Bianca</option>
            <option value="Nicole">Nicole</option>
          </select>
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

        <button
          onClick={gerarLink}
          disabled={!produtos.some(Boolean)}
          className="w-full py-3 bg-[#E8740E] text-white font-bold rounded-xl hover:bg-[#D06A0D] active:bg-[#B85E0B] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Gerar Link
        </button>
      </div>

      {generatedLink && (
        <div className="bg-white border border-[#D2D2D7] rounded-xl p-4 shadow-sm space-y-3">
          <p className="text-sm font-semibold text-[#1D1D1F]">Link gerado:</p>
          <div className="bg-[#F5F5F7] rounded-lg p-3 break-all text-xs text-[#1D1D1F] font-mono border border-[#D2D2D7]">
            {generatedLink}
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
