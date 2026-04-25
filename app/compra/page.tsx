"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { WHATSAPP_FORMULARIO } from "@/lib/whatsapp-config";
import { corParaPT } from "@/lib/cor-pt";
import { getAgendamentoBounds } from "@/lib/date-utils";
import { withUTMs } from "@/lib/utm-tracker";
import { useTradeInAnalytics } from "@/lib/useTradeInAnalytics";

function maskCPF(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return digits.slice(0, 3) + "." + digits.slice(3);
  if (digits.length <= 9)
    return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6);
  return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6, 9) + "-" + digits.slice(9);
}

function maskCNPJ(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return digits.slice(0, 2) + "." + digits.slice(2);
  if (digits.length <= 8) return digits.slice(0, 2) + "." + digits.slice(2, 5) + "." + digits.slice(5);
  if (digits.length <= 12)
    return digits.slice(0, 2) + "." + digits.slice(2, 5) + "." + digits.slice(5, 8) + "/" + digits.slice(8);
  return (
    digits.slice(0, 2) + "." + digits.slice(2, 5) + "." + digits.slice(5, 8) +
    "/" + digits.slice(8, 12) + "-" + digits.slice(12)
  );
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return "(" + digits.slice(0, 2) + ") " + digits.slice(2);
  return "(" + digits.slice(0, 2) + ") " + digits.slice(2, 7) + "-" + digits.slice(7);
}

function maskCEP(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return digits.slice(0, 5) + "-" + digits.slice(5);
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmt2(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Taxas de parcelamento (mesma tabela do orçamento admin)
const TAXAS: Record<number, number> = {
  1: 4, 2: 5, 3: 5.5, 4: 6, 5: 7, 6: 7.5,
  7: 8, 8: 9.1, 9: 10, 10: 11, 11: 12, 12: 13,
  13: 14, 14: 15, 15: 16, 16: 17, 17: 18, 18: 19,
  19: 20, 20: 21, 21: 22,
};

interface ProdutoAPI {
  modelo: string;
  armazenamento: string;
  precoPix: number;
  categoria?: string | null;
}

function CompraForm() {
  const searchParams = useSearchParams();
  // Tracking de funil — etapa 5 (formulario de compra). Eventos:
  //   compra_view    — cliente entrou na pagina
  //   compra_submit  — cliente concluiu formulario com sucesso
  // Permite ver drop-off do /troca → /compra → submit no /admin/analytics.
  const { trackAction } = useTradeInAnalytics();

  // URL params
  const produtoParam = searchParams.get("produto") || searchParams.get("p") || "";
  const precoParam = searchParams.get("preco") || searchParams.get("v") || "";
  const vendedor = searchParams.get("vendedor") || "";
  const whatsapp = searchParams.get("whatsapp") || "";
  const shortCode = searchParams.get("short") || "";

  // Encomenda — flag organizacional controlada pelo operador no gerar-link.
  // Cliente nao pode desligar via URL; o backend valida com link_compras.tipo.
  // sinal_pct=0 (ou nao setado) = pagamento integral. >0 = cobrou so esse %
  // no link, com restante combinado na entrega.
  const encomendaParam = searchParams.get("encomenda") === "1";
  const previsaoChegadaParam = searchParams.get("previsao_chegada") || "";
  const sinalPctParam = Math.max(0, Math.min(100, Number(searchParams.get("sinal_pct") || "0") || 0));
  // Cobranca extra opcional — capa, pelicula, brinde, etc. Ja esta somada no
  // valor cobrado (preco param). Aqui so pra mostrar breakdown ao cliente.
  const extraDescricaoParam = searchParams.get("extra_descricao") || "";
  const extraValorParam = Number(searchParams.get("extra_valor") || "0") || 0;

  // Trade-in params (vindos do StepQuote)
  const trocaProdutoParam = searchParams.get("troca_produto") || "";
  const trocaValorParam = searchParams.get("troca_valor") || "";
  const trocaCondParam = searchParams.get("troca_cond") || "";
  const trocaCorParam = searchParams.get("troca_cor") || "";
  // 2º produto na troca
  const trocaProduto2Param = searchParams.get("troca_produto2") || "";
  const trocaValor2Param = searchParams.get("troca_valor2") || "";
  const trocaCond2Param = searchParams.get("troca_cond2") || "";
  const trocaCor2Param = searchParams.get("troca_cor2") || "";
  const trocaCaixaParam = searchParams.get("troca_caixa") || "";
  const trocaCaixa2Param = searchParams.get("troca_caixa2") || "";
  const nomeParam = searchParams.get("nome") || "";
  const cpfParam = searchParams.get("cpf") || "";
  const emailParam = searchParams.get("email") || "";
  const whatsappClienteParam = searchParams.get("whatsapp_cliente") || searchParams.get("telefone") || "";
  const instagramParam = searchParams.get("instagram") || "";
  const cepParam = searchParams.get("cep") || "";
  const enderecoParam = searchParams.get("endereco") || "";
  const numeroParam = searchParams.get("numero") || "";
  const complementoParam = searchParams.get("complemento") || "";
  const bairroParam = searchParams.get("bairro") || "";

  // Payment params (vindos do StepQuote)
  // Normaliza forma de pagamento: gerador usa "Cartao Credito", form usa "Cartao de Credito"
  const pagamentoPagoParam = searchParams.get("pagamento_pago") || "";
  const formaRaw = searchParams.get("forma") || "";
  const FORMA_MAP: Record<string, string> = {
    "Pix": "PIX", "pix": "PIX",
    "Cartao Credito": "Cartao de Credito", "Cartao+Credito": "Cartao de Credito",
    "Cartao Debito": "Debito", "Cartao+Debito": "Debito",
    "Pix + Cartao": "PIX + Cartao", "Pix+%2B+Cartao": "PIX + Cartao",
  };
  // Identificadores do pagamento MP (vindos da back_url do MP após pagamento aprovado)
  const mpPaymentId = searchParams.get("payment_id") || "";
  const mpPreferenceId = searchParams.get("preference_id") || "";
  const pagamentoPagoStr = pagamentoPagoParam === "link"
    ? "Pedido pago no Instagram via link"
    : pagamentoPagoParam === "pix"
    ? "Pedido pago via PIX (Instagram)"
    : pagamentoPagoParam === "mp"
    ? "Pago via Mercado Pago (Link)"
    : "";
  // Quando o vendedor marca "Formulário primeiro" no /admin/gerar-link, o
  // link inclui pm=1 (pagar_mp=1). Isso habilita o botão "Pagar MP" aqui.
  const pagarMpHabilitado =
    searchParams.get("pm") === "1" && !!shortCode && !pagamentoPagoParam;
  const formaParam = pagamentoPagoStr || FORMA_MAP[formaRaw] || formaRaw;
  const parcelasParam = searchParams.get("parcelas") || "";
  const entradaPixParam = searchParams.get("entrada_pix") || "";
  const descontoParam = parseFloat(searchParams.get("desconto") || "0") || 0;

  // Local de entrega (vindo do gerador de link)
  const localParam = searchParams.get("local") || "";
  const shoppingParam = searchParams.get("shopping") || "";
  const horarioParam = searchParams.get("horario") || "";
  const dataEntregaParam = searchParams.get("data_entrega") || "";
  const taxaEntregaParam = parseFloat(searchParams.get("taxa_entrega") || "0") || 0;

  // Produtos adicionais (vindo do gerador de link) — com preço individual
  const produtosExtras: { nome: string; preco: number }[] = [];
  for (let i = 2; i <= 10; i++) {
    const p = searchParams.get(`produto${i}`);
    if (!p) break;
    const pv = parseFloat(searchParams.get(`preco${i}`) || "0") || 0;
    produtosExtras.push({ nome: p, preco: pv });
  }

  // Products from API
  const [allProducts, setAllProducts] = useState<ProdutoAPI[]>([]);
  const [catalogo, setCatalogo] = useState<Record<string, { produto: string; cor: string | null; preco: number | null }[]>>({});
  const [catSel, setCatSel] = useState("");
  const [produtoInput, setProdutoInput] = useState(produtoParam);
  const [precoAuto, setPrecoAuto] = useState(precoParam ? parseInt(precoParam) : 0);
  const [corSel, setCorSel] = useState("");

  // Variantes do produto base (ex: "Mac Mini M4" → lista de configs)
  // Prioridade: tabela de preços (/admin/precos) → estoque (fallback)
  type Variante = { produto: string; preco: number | null };
  const variantesDoBase = useMemo((): Variante[] => {
    // Só entra neste modo quando produto base veio pela URL mas sem preço
    if (!produtoParam || precoParam) return [];
    const base = produtoParam.toLowerCase().trim();

    // 1. Tenta tabela de preços (mesma fonte do gerar-link)
    const fromPrecos: Variante[] = allProducts
      .filter(p => {
        const nome = `${p.modelo} ${p.armazenamento}`.toLowerCase().trim();
        return nome.startsWith(base) && nome !== base;
      })
      .map(p => ({ produto: `${p.modelo} ${p.armazenamento}`.trim(), preco: p.precoPix }));

    if (fromPrecos.length > 0) return fromPrecos;

    // 2. Fallback: estoque em stock
    const todas: Variante[] = [];
    for (const itens of Object.values(catalogo)) {
      for (const item of itens) {
        const nome = item.produto.toLowerCase().trim();
        if (nome.startsWith(base) && nome !== base) {
          if (!todas.find(v => v.produto === item.produto)) {
            todas.push({ produto: item.produto, preco: item.preco });
          }
        }
      }
    }
    return todas;
  }, [produtoParam, precoParam, allProducts, catalogo]);
  const [coresDisponiveis, setCoresDisponiveis] = useState<string[]>([]);
  // Controla visibilidade do picker de cor independente do valor.
  // Antes: o picker tinha `!corSel` na condicao — sumia assim que o cliente
  // comecava a digitar (pior UX). Agora: decide UMA VEZ na montagem. Se o
  // operador nao preencheu cor (via URL/auto-detect rapido), mostra e MANTEM
  // visivel enquanto o cliente digita. So esconde se auto-detect populou
  // corSel antes do cliente interagir.
  const [precisaEscolherCor, setPrecisaEscolherCor] = useState(true);
  const clienteTocouCorRef = useRef(false);

  // Catálogo construído da tabela de preços (fallback quando estoque vazio)
  const CAT_LABELS: Record<string, string> = {
    IPHONE: "iPhones", IPAD: "iPads", MACBOOK: "MacBooks",
    APPLE_WATCH: "Apple Watch", AIRPODS: "AirPods",
    MAC_MINI: "Mac Mini", ACESSORIOS: "Acessórios", OUTROS: "Outros",
  };
  function inferCatLabel(cat: string) {
    return CAT_LABELS[cat] || cat.replace(/_/g, " ");
  }
  const catalogoDePrecos = useMemo((): Record<string, { produto: string; cor: null; preco: number | null }[]> => {
    if (allProducts.length === 0) return {};
    const cats: Record<string, { produto: string; cor: null; preco: number | null }[]> = {};
    for (const p of allProducts) {
      const cat = inferCatLabel(p.categoria || "OUTROS");
      if (!cats[cat]) cats[cat] = [];
      const nome = `${p.modelo} ${p.armazenamento}`.trim();
      if (!cats[cat].find(x => x.produto === nome)) {
        cats[cat].push({ produto: nome, cor: null, preco: p.precoPix });
      }
    }
    return cats;
  }, [allProducts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Usa estoque se disponível, senão tabela de preços
  const catalogoAtivo = Object.keys(catalogo).length > 0 ? catalogo : catalogoDePrecos;

  // WhatsApp pode vir do URL ou ser buscado da config
  const [whatsappFormConfig, setWhatsappFormConfig] = useState("");
  const [whatsappPrincipalConfig, setWhatsappPrincipalConfig] = useState("");
  // Prioridade: param URL (do gerador de link) > whatsapp_formularios > whatsapp_principal > fallback
  const whatsappFinal = whatsapp || whatsappFormConfig || whatsappPrincipalConfig || WHATSAPP_FORMULARIO;

  // Catálogo oficial de cores por modelo (catalogo_modelo_configs) — cores
  // teóricas (todas as cores Apple daquele modelo), complementa o estoque real
  // quando o modelo nao tem peças em estoque no momento.
  const [catalogoCores, setCatalogoCores] = useState<Record<string, string[]>>({});

  // Tracking: dispara "compra_view" 1x quando cliente entra na pagina.
  // Reutiliza session_id do /troca quando vier no mesmo navegador (analytics
  // amarra as duas etapas como mesma jornada).
  useEffect(() => {
    trackAction("compra_view");
  }, [trackAction]);

  // Fetch products + config
  useEffect(() => {
    Promise.all([
      fetch("/api/produtos").then(r => r.json()).catch(() => ({ data: [] })),
      fetch("/api/produtos-disponiveis").then(r => r.json()).catch(() => ({ categorias: {} })),
      fetch("/api/tradein-config").then(r => r.json()).catch(() => ({ data: null })),
      fetch("/api/catalogo-cores").then(r => r.json()).catch(() => ({ modelos: {} })),
    ]).then(([prodRes, catRes, cfgRes, corRes]) => {
      // /api/produtos retorna array direto (não {data: []})
      if (Array.isArray(prodRes)) setAllProducts(prodRes);
      else if (prodRes.data) setAllProducts(prodRes.data);
      if (catRes.categorias) setCatalogo(catRes.categorias);
      if (cfgRes.data?.whatsapp_formularios) setWhatsappFormConfig(cfgRes.data.whatsapp_formularios);
      if (cfgRes.data?.whatsapp_principal) setWhatsappPrincipalConfig(cfgRes.data.whatsapp_principal);
      if (corRes?.modelos) setCatalogoCores(corRes.modelos);
    });
  }, []);

  // Cores oficiais do modelo via match por tokens (mesma lógica do /admin/gerar-link).
  // Ex: "iPhone 17 Pro Max 1TB" matches "iPhone 17 Pro Max" no catálogo.
  const coresParaProduto = useMemo(() => (nomeProduto: string): string[] => {
    if (!nomeProduto) return [];
    if (/Apple Watch Ultra/i.test(nomeProduto)) return [];
    if (/Pencil|Cable|Cabo|Carregador|Adapter|Hub|Case|Capa|Pelicula/i.test(nomeProduto)) return [];
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
    const tokens = (s: string) => stripNoise(s).toLowerCase().split(/\s+/).filter(t => t && !STOP.has(t));
    const prodTokens = new Set(tokens(nomeProduto));
    let raw: string[] = [];
    let bestCount = 0;
    for (const [nome, cores] of Object.entries(catalogoCores)) {
      const catTokens = tokens(nome);
      if (catTokens.length === 0) continue;
      if (catTokens.every(t => prodTokens.has(t)) && catTokens.length > bestCount) {
        raw = cores;
        bestCount = catTokens.length;
      }
    }
    return raw;
  }, [catalogoCores]);

  // Auto-fill price when product selected
  useEffect(() => {
    if (!produtoInput || precoParam) return;
    const match = allProducts.find(p => `${p.modelo} ${p.armazenamento}` === produtoInput || p.modelo === produtoInput);
    if (match) setPrecoAuto(match.precoPix);
  }, [produtoInput, allProducts, precoParam]);

  // Monta cores disponíveis combinando 2 fontes:
  //   1. ESTOQUE (catalogo) — cores reais em estoque, match por startsWith
  //   2. CATÁLOGO OFICIAL (catalogoCores) — todas as cores Apple do modelo,
  //      match por tokens (reusa lógica do /admin/gerar-link)
  // Isso impede o cliente de digitar cor inválida (ex: "ROSA" num iPhone 17
  // Pro Max). Deduplica pela tradução PT pra nao mostrar "Black Titanium" e
  // "Titânio Preto" lado a lado — exibe só "TITÂNIO PRETO".
  useEffect(() => {
    const prod = produtoInput || produtoParam;
    if (!prod) { setCoresDisponiveis([]); return; }

    const bruto: string[] = [];
    // 1. Estoque (cor raw do banco, ex: "Titânio Preto")
    for (const items of Object.values(catalogo)) {
      for (const item of items) {
        if (item.cor && item.produto.startsWith(prod)) bruto.push(item.cor);
      }
    }
    // 2. Catálogo (cor EN, ex: "Black Titanium")
    bruto.push(...coresParaProduto(prod));

    // Dedup por tradução PT uppercase
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of bruto) {
      const pt = corParaPT(c).toUpperCase().trim();
      if (!pt || seen.has(pt)) continue;
      seen.add(pt);
      out.push(pt);
    }
    setCoresDisponiveis(out.sort());
  }, [produtoInput, produtoParam, catalogo, coresParaProduto]);

  // Se auto-detect populou corSel ANTES do cliente tocar no campo, esconde
  // o picker (operador efetivamente preencheu a cor via nome do produto).
  // Se cliente ja comecou a digitar, mantem o picker visivel.
  useEffect(() => {
    if (corSel && !clienteTocouCorRef.current) {
      setPrecisaEscolherCor(false);
    }
  }, [corSel]);

  // Auto-detect cor embutida no nome do produto (ex: "iPhone 15 Preto Espacial")
  useEffect(() => {
    if (corSel || coresDisponiveis.length === 0) return;
    const prod = produtoInput || produtoParam;
    if (!prod) return;
    const words = prod.split(" ");
    for (const n of [3, 2, 1]) {
      if (words.length < n) continue;
      const candidate = words.slice(-n).join(" ");
      const match = coresDisponiveis.find(c =>
        c.toLowerCase() === candidate.toLowerCase() ||
        corParaPT(c).toLowerCase() === candidate.toLowerCase()
      );
      if (match) { setCorSel(match); break; }
    }
  }, [coresDisponiveis, produtoInput, produtoParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fallback: detecta cor PT no final do produtoParam mesmo sem catalogo/estoque.
  // Fix pro caso do operador incluir a cor no nome do produto via gerar-link
  // (ex: "iPhone 17 Pro Max 256GB Prata") — antes o /compra ainda pedia pra
  // escolher a cor de novo porque coresDisponiveis vinha vazio (lookup por
  // startsWith nao casava com o produto com cor no nome). Roda uma vez no
  // mount, so se corSel ainda esta vazio.
  useEffect(() => {
    if (corSel) return;
    const prod = produtoParam;
    if (!prod) return;
    // Cores PT comuns — ordem importante: multi-palavra ANTES de uma so pra
    // match correto (ex: "Titanio Preto" antes de "Preto").
    const CORES_PT = [
      "Titânio Preto", "Titânio Azul", "Titânio Deserto", "Titânio Natural", "Titânio Branco",
      "Titanio Preto", "Titanio Azul", "Titanio Deserto", "Titanio Natural", "Titanio Branco",
      "Space Black", "Space Gray", "Rose Gold", "Midnight Green", "Sky Blue",
      "Preto", "Branco", "Azul", "Verde", "Prata", "Cinza", "Dourado",
      "Roxo", "Rosa", "Laranja", "Amarelo", "Vermelho", "Estelar", "Grafite",
      "Black", "White", "Blue", "Green", "Silver", "Gold", "Purple", "Pink",
      "Red", "Orange", "Yellow", "Midnight", "Starlight", "Natural", "Graphite",
    ];
    const pNorm = prod.toLowerCase();
    // Ordena por tamanho decrescente e tenta match no sufixo
    const sorted = [...CORES_PT].sort((a, b) => b.length - a.length);
    for (const cor of sorted) {
      if (pNorm.endsWith(" " + cor.toLowerCase())) {
        setCorSel(cor);
        // Tira a cor do final do produtoInput pra coresDisponiveis funcionar
        const semCor = prod.slice(0, prod.length - cor.length - 1).trim();
        setProdutoInput(semCor);
        break;
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const preco = precoParam ? parseInt(precoParam) : precoAuto;

  // Form state — aceita pre-preenchimento vindo do gerar-link
  const [pessoa, setPessoa] = useState<"PF" | "PJ">("PF");
  const [nome, setNome] = useState(nomeParam);
  const [cpf, setCpf] = useState(cpfParam ? maskCPF(cpfParam) : "");
  const [cnpj, setCnpj] = useState("");
  // Inscricao estadual (so PJ): null = nao respondeu ainda, "ISENTO" = nao tem, string = numero
  const [ieStatus, setIeStatus] = useState<null | "TEM" | "ISENTO">(null);
  const [ie, setIe] = useState("");
  const [email, setEmail] = useState(emailParam);
  const [telefone, setTelefone] = useState(whatsappClienteParam ? maskPhone(whatsappClienteParam) : "");
  const [cep, setCep] = useState(cepParam ? maskCEP(cepParam) : "");
  const [endereco, setEndereco] = useState(enderecoParam);
  const [numero, setNumero] = useState(numeroParam);
  const [complemento, setComplemento] = useState(complementoParam);
  const [bairro, setBairro] = useState(bairroParam);
  const [horario, setHorario] = useState(horarioParam);
  const [horariosDisponiveis, setHorariosDisponiveis] = useState<string[]>(["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]);
  // "Outro" = entrega em local personalizado (aprovado internamente via gerar-link).
  // Essa opção nunca aparece para o cliente comum — só se o operador passou
  // localParam === "outro" no link. Pagamento tratado como "pagar na entrega"
  // (mesma regra de shopping, sem exigência de antecipação).
  const [local, setLocal] = useState<"Loja" | "Entrega" | "Correios">(
    localParam === "correios" ? "Correios"
      : (localParam === "shopping" || localParam === "residencia" || localParam === "outro") ? "Entrega"
      : localParam === "loja" ? "Loja"
      : "Loja"
  );
  const [tipoEntrega, setTipoEntrega] = useState<"Shopping" | "Residencia" | "Outro">(
    // Encomenda nao aceita Shopping — derruba pra Residencia se o link veio com shopping
    encomendaParam && localParam === "shopping" ? "Residencia"
      : localParam === "shopping" ? "Shopping"
      : localParam === "outro" ? "Outro"
      : "Residencia"
  );
  // Sinaliza que o operador pré-autorizou local personalizado — só mostramos
  // esse tipo quando este flag estiver ativo.
  const localOutroHabilitado = localParam === "outro";
  const [shopping, setShopping] = useState(shoppingParam);
  const [dataEntrega, setDataEntrega] = useState(dataEntregaParam);
  const [formaPagamento, setFormaPagamento] = useState(formaParam);
  const [parcelas, setParcelas] = useState(parcelasParam);
  // Abrir forma de pagamento se: não veio forma, ou veio cartão mas sem parcelas (cliente precisa escolher)
  const [editPagamento, setEditPagamento] = useState(!formaParam || (formaParam.includes("Cartao") && !parcelasParam));
  const [origem, setOrigem] = useState("");
  const [instagram, setInstagram] = useState(instagramParam);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState("");

  // Fetch horários dinâmicos baseado no tipo (entrega/retirada) + data selecionada
  useEffect(() => {
    const tipo = local === "Loja" ? "retirada" : "entrega";
    const params = new URLSearchParams({ tipo });
    if (dataEntrega) params.set("data", dataEntrega);
    fetch(`/api/horarios?${params}`)
      .then(r => r.json())
      .then(j => {
        if (j.horarios?.length > 0) {
          setHorariosDisponiveis(j.horarios);
          // Se horário selecionado não está mais disponível, limpa
          if (horario && !j.horarios.includes(horario)) setHorario("");
        }
      })
      .catch(() => {}); // fallback mantém os hardcoded
  }, [local, dataEntrega]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trade-in state
  const [temTroca, setTemTroca] = useState<boolean | null>(trocaProdutoParam ? true : null);
  const [trocaProduto, setTrocaProduto] = useState(trocaProdutoParam);
  const [trocaValor, setTrocaValor] = useState(trocaValorParam);
  const [trocaCond, setTrocaCond] = useState(trocaCondParam);
  const [descTroca, setDescTroca] = useState("");

  // Prints dos aparelhos da troca (N° Série + IMEI da tela Ajustes > Sobre)
  type PrintTipo = "serial" | "imei";
  type PrintSlot = { tipo: PrintTipo; aparelho: 1 | 2; label: string };
  const [printsUrls, setPrintsUrls] = useState<Record<string, string>>({});
  const [printsUploading, setPrintsUploading] = useState<Record<string, boolean>>({});
  const [printsErro, setPrintsErro] = useState<Record<string, string>>({});
  const temSegundoAparelho = !!trocaProduto2Param;

  // Apenas iPhone tem IMEI — iPad, Apple Watch e MacBook so tem Nº de Serie.
  // Quando o cliente da um desses na troca, nao exigimos IMEI (nem print
  // nem campo de texto). Mantem validacao rigida pra iPhone (2 prints).
  //
  // Detecta pelo nome do produto (texto livre vindo do simulador ou do link
  // gerado pelo admin). Fallback pro antigo comportamento (exige IMEI) quando
  // nome vazio — mais seguro do que pular a validacao por engano.
  const produtoTemImei = (produto: string | null | undefined): boolean => {
    const p = (produto || "").toUpperCase();
    if (!p) return true; // sem info → exige IMEI (comportamento original)
    if (/\bIPAD\b/.test(p)) return false;
    if (/\bMACBOOK\b|\bMAC\s*MINI\b|\bMAC\s*BOOK\b/.test(p)) return false;
    if (/\bAPPLE\s*WATCH\b|\bWATCH\b/.test(p)) return false;
    if (/\bAIRPODS\b/.test(p)) return false;
    return true; // default (iPhone, seminovo, outros celulares) exige IMEI
  };
  const aparelho1TemImei = produtoTemImei(trocaProdutoParam);
  const aparelho2TemImei = produtoTemImei(trocaProduto2Param);

  // Detecta tipo de aparelho pelo nome (pra exibir caminho correto de Ajustes
  // no texto de instrucao). Se nao identificar, retorna "aparelho" generico.
  const detectarTipoAparelho = (produto: string | null | undefined): string => {
    const p = (produto || "").toUpperCase();
    if (/\bIPHONE\b/.test(p)) return "iPhone";
    if (/\bIPAD\b/.test(p)) return "iPad";
    if (/\bMACBOOK\b|\bMAC\s*BOOK\b|\bMAC\s*MINI\b/.test(p)) return "MacBook";
    if (/\bAPPLE\s*WATCH\b|\bWATCH\b/.test(p)) return "Apple Watch";
    if (/\bAIRPODS\b/.test(p)) return "AirPods";
    return "aparelho";
  };

  // IMEI e Nº de Série dos aparelhos na troca.
  // Fluxo: cliente anexa o print → backend usa Claude Vision pra ler o
  // número automaticamente → valor aparece preenchido aqui (read-only por
  // default, com botão "Corrigir" como fallback se o OCR errar).
  const [trocaSerial1, setTrocaSerial1] = useState("");
  const [trocaImei1, setTrocaImei1] = useState("");
  const [trocaSerial2, setTrocaSerial2] = useState("");
  const [trocaImei2, setTrocaImei2] = useState("");

  // Status da consulta Infosimples (Anatel/Celular Legal) — preenchido pelo
  // backend apos OCR. "OK" = aparelho regular, "BLOQUEADO" = roubo/furto/perda,
  // "ERRO" = consulta falhou. Usado no texto WhatsApp que vai pro vendedor pra
  // sinalizar antifraude antes de fechar a venda.
  type ImeiStatusValor = "OK" | "BLOQUEADO" | "ERRO" | null;
  const [trocaImeiStatus1, setTrocaImeiStatus1] = useState<ImeiStatusValor>(null);
  const [trocaImeiStatus2, setTrocaImeiStatus2] = useState<ImeiStatusValor>(null);

  // Resultado do OCR por slot (serial1/imei1/serial2/imei2).
  // "ok" = OCR conseguiu ler; "fail" = OCR falhou (cliente digita manual).
  type OcrStatus = { state: "idle" | "reading" | "ok" | "fail"; error?: string };
  const [ocrStatus, setOcrStatus] = useState<Record<string, OcrStatus>>({});
  // Controla se o cliente abriu o input manual via "Corrigir" (mesmo quando OCR deu certo).
  const [manualMode, setManualMode] = useState<Record<string, boolean>>({});

  function setTextBySlot(slot: PrintSlot, value: string) {
    if (slot.aparelho === 1) {
      if (slot.tipo === "serial") setTrocaSerial1(value);
      else setTrocaImei1(value);
    } else {
      if (slot.tipo === "serial") setTrocaSerial2(value);
      else setTrocaImei2(value);
    }
  }

  async function uploadPrint(slot: PrintSlot, file: File) {
    if (!shortCode) {
      setPrintsErro((p) => ({ ...p, [`${slot.tipo}${slot.aparelho}`]: "Link de compra inválido" }));
      return;
    }
    const key = `${slot.tipo}${slot.aparelho}`;
    setPrintsUploading((p) => ({ ...p, [key]: true }));
    setPrintsErro((p) => ({ ...p, [key]: "" }));
    setOcrStatus((p) => ({ ...p, [key]: { state: "reading" } }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("short_code", shortCode);
      fd.append("tipo", slot.tipo);
      fd.append("aparelho", String(slot.aparelho));
      // Passa dados da URL pra o backend criar o registro se nao existir
      // (caso o cliente tenha vindo direto do simulador sem passar pelo link-compras-auto)
      if (produtoParam) fd.append("produto", produtoParam);
      if (nomeParam) fd.append("cliente_nome", nomeParam);
      if (whatsappClienteParam) fd.append("cliente_telefone", whatsappClienteParam);
      if (trocaProdutoParam) fd.append("troca_produto", trocaProdutoParam);
      if (trocaValorParam) fd.append("troca_valor", trocaValorParam);
      if (trocaCorParam) fd.append("troca_cor", trocaCorParam);
      if (trocaCondParam) fd.append("troca_condicao", trocaCondParam);
      const res = await fetch("/api/link-compras/upload-print", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok) {
        setPrintsUrls((p) => ({ ...p, [key]: json.url }));
        // Backend retorna both serial E imei (quando detecta cada um). Preenchemos
        // ambos os campos do aparelho independente de qual slot foi anexado —
        // assim se cliente troca os 2 prints de lugar, ainda funciona.
        const extractedSerial: string | null = json.extractedSerial || null;
        const extractedImei: string | null = json.extractedImei || null;
        if (extractedSerial) {
          if (slot.aparelho === 1) setTrocaSerial1(extractedSerial);
          else setTrocaSerial2(extractedSerial);
        }
        if (extractedImei) {
          if (slot.aparelho === 1) setTrocaImei1(extractedImei);
          else setTrocaImei2(extractedImei);
        }
        // Status Infosimples (Anatel/Celular Legal) — backend ja consultou
        // automaticamente apos OCR. Salva pra usar no texto WhatsApp.
        const imeiStatusFromBackend: ImeiStatusValor = json.imeiStatus || null;
        if (imeiStatusFromBackend) {
          if (slot.aparelho === 1) setTrocaImeiStatus1(imeiStatusFromBackend);
          else setTrocaImeiStatus2(imeiStatusFromBackend);
        }
        // Status do slot depende do que era esperado ali
        const valorDoSlot = slot.tipo === "serial" ? extractedSerial : extractedImei;
        const valorDoOutro = slot.tipo === "serial" ? extractedImei : extractedSerial;
        if (valorDoSlot) {
          setOcrStatus((p) => ({ ...p, [key]: { state: "ok" } }));
        } else if (valorDoOutro) {
          const nomeOutro = slot.tipo === "serial" ? "IMEI" : "Nº de Série";
          const nomeSlot = slot.tipo === "serial" ? "Nº de Série" : "IMEI";
          setOcrStatus((p) => ({
            ...p,
            [key]: {
              state: "fail",
              error: `Esse print é do ${nomeOutro} (salvei lá!). Anexe o print do ${nomeSlot} aqui, ou digite manualmente abaixo.`,
            },
          }));
          setManualMode((p) => ({ ...p, [key]: true }));
        } else {
          setOcrStatus((p) => ({ ...p, [key]: { state: "fail", error: json.extractedError || "Não consegui ler o print" } }));
          setManualMode((p) => ({ ...p, [key]: true }));
        }
      } else {
        setPrintsErro((p) => ({ ...p, [key]: json.error || "Falha no upload" }));
        setOcrStatus((p) => ({ ...p, [key]: { state: "idle" } }));
      }
    } catch {
      setPrintsErro((p) => ({ ...p, [key]: "Erro ao enviar" }));
      setOcrStatus((p) => ({ ...p, [key]: { state: "idle" } }));
    } finally {
      setPrintsUploading((p) => ({ ...p, [key]: false }));
    }
  }

  // Honeypot anti-bot: campo oculto via CSS que só bots preenchem.
  // Se vier com valor no submit, o backend descarta a submissão (200 fake).
  const [honeypot, setHoneypot] = useState("");
  const trocaNum1 = parseFloat(trocaValor) || 0;
  const trocaNum2 = parseFloat(trocaValor2Param) || 0;
  const trocaNum = trocaNum1 + trocaNum2;
  const isFromTradeIn = !!trocaProdutoParam || (parseFloat(trocaValorParam) || 0) > 0;

  // CEP auto-fill
  useEffect(() => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    setCepError("");
    fetch(`https://viacep.com.br/ws/${digits}/json/`)
      .then((r) => r.json())
      .then((data) => {
        if (data.erro) { setCepError("CEP nao encontrado"); }
        else { setEndereco(data.logradouro || ""); setBairro(data.bairro || ""); }
      })
      .catch(() => setCepError("Erro ao buscar CEP"))
      .finally(() => setCepLoading(false));
  }, [cep]);

  // PIX entry — pode vir do URL ou ser digitado pelo cliente no modo "PIX + Cartao"
  const [entradaPixManual, setEntradaPixManual] = useState(entradaPixParam || "");

  // Estado do fluxo "Pagar com Mercado Pago" (formulário → pagamento).
  // Quando o cliente clica "Pagar MP", salvamos os dados no link_compras e
  // redirecionamos pro checkout MP (o WhatsApp automático só dispara DEPOIS
  // que MP confirma pagamento via webhook).
  const [loadingMp, setLoadingMp] = useState(false);
  const [erroMp, setErroMp] = useState("");

  // Janela de agendamento (hoje a D+2 de calendário, pulando domingos).
  // Encomenda: orcamento dura 24h — janela de agendamento encolhe pra
  // hoje + amanha (em vez de hoje + 2 dias).
  const agendamentoBounds = useMemo(() => getAgendamentoBounds(new Date(), { encomenda: encomendaParam }), [encomendaParam]);

  // Installment calculations
  const descontoNum = parseFloat(String(descontoParam)) || 0;
  // IMPORTANTE: `preco` (URL param `v`) JA E o total somado de todos os
  // produtos — o gerar-link setta `preco = total` (soma do produto 1 + extras).
  // Nao somar extras aqui de novo — dava double counting (ex: 14.294 + 5.497
  // = 19.791 era o total mostrado, mas o admin calcula 14.294).
  // Precos individuais em `produtosExtras` sao so pra display informativo.
  const valorBase = preco > 0 ? Math.max(preco - descontoNum - trocaNum, 0) : 0;
  const entradaPixNum = parseFloat(entradaPixManual || entradaPixParam) || 0;
  const valorParcelar = entradaPixNum > 0 ? Math.max(valorBase - entradaPixNum, 0) : valorBase;
  const parcOpts = useMemo(() => {
    if (valorParcelar <= 0) return [];
    return Object.entries(TAXAS).map(([n, taxa]) => {
      const num = parseInt(n);
      const total = Math.ceil(valorParcelar * (1 + taxa / 100));
      const vp = total / num;
      return { parcelas: num, valorParcela: vp, total };
    });
  }, [valorParcelar]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!produtoInput && !produtoParam) {
      alert("Selecione o produto desejado antes de enviar.");
      return;
    }

    // Cor sempre obrigatoria — se tem cores no estoque, cliente escolhe chip;
    // senao, digita manualmente no input. Evita mensagens chegando sem cor.
    // Minimo 3 chars evita caso de cliente enviar so "P" quando ia digitar
    // "Prata" (mensagem chegava pra vendedora com "— P —").
    const corTrim = (corSel || "").trim();
    if (corTrim.length < 3) {
      alert("Informe a cor do produto completa (ex: Prata, Azul, Preto).");
      document.getElementById("escolha-cor")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (!formaPagamento) {
      alert("Selecione a forma de pagamento antes de enviar.");
      return;
    }

    // PJ: Inscricao Estadual e obrigatoria responder (TEM ou ISENTO). Se TEM,
    // precisa preencher o numero.
    if (pessoa === "PJ") {
      if (ieStatus === null) {
        alert("Responda se a empresa tem ou é isenta de Inscrição Estadual.");
        return;
      }
      if (ieStatus === "TEM" && !ie.trim()) {
        alert("Informe o número da Inscrição Estadual.");
        return;
      }
    }

    if (formaPagamento.includes("Cartao") && !parcelas && !pagamentoPagoParam) {
      alert("Selecione o numero de parcelas antes de enviar.");
      return;
    }

    // Valida prints do aparelho na troca (obrigatorios quando ha troca + link de compra)
    // IMEI so e exigido pra iPhone — iPad/Watch/MacBook so tem Nº de Serie.
    if (temTroca && shortCode) {
      const faltaSerial1 = !printsUrls.serial1;
      const faltaImei1 = aparelho1TemImei && !printsUrls.imei1;
      const faltaSerial2 = temSegundoAparelho && !printsUrls.serial2;
      const faltaImei2 = temSegundoAparelho && aparelho2TemImei && !printsUrls.imei2;
      if (faltaSerial1 || faltaImei1 || faltaSerial2 || faltaImei2) {
        // Scroll pra area de prints e destaca (em vez de alert que fecha)
        const el = document.getElementById("prints-troca");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-4", "ring-red-500", "animate-pulse");
          setTimeout(() => el.classList.remove("ring-4", "ring-red-500", "animate-pulse"), 3000);
          // Tenta abrir a galeria do primeiro print faltante
          setTimeout(() => {
            const key = faltaSerial1 ? "serial1" : faltaImei1 ? "imei1" : faltaSerial2 ? "serial2" : "imei2";
            const input = document.getElementById(`print-input-${key}`) as HTMLInputElement | null;
            input?.click();
          }, 400);
        }
        return;
      }

      // Valida que o IMEI e Nº de Série foram extraídos com sucesso (via OCR
      // ou preenchidos manualmente quando OCR falha). Serial mínimo 6 chars,
      // IMEI mínimo 14 dígitos (IMEI tem 15, aceita 14+ pra tolerar 1 falha do OCR).
      // IMEI so e exigido pra iPhone.
      const soDigitos = (s: string) => s.replace(/\D/g, "");
      const serial1Ok = trocaSerial1.trim().length >= 6;
      const imei1Ok = !aparelho1TemImei || soDigitos(trocaImei1).length >= 14;
      const serial2Ok = !temSegundoAparelho || trocaSerial2.trim().length >= 6;
      const imei2Ok = !temSegundoAparelho || !aparelho2TemImei || soDigitos(trocaImei2).length >= 14;
      if (!serial1Ok || !imei1Ok || !serial2Ok || !imei2Ok) {
        const el = document.getElementById("prints-troca");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-4", "ring-red-500", "animate-pulse");
          setTimeout(() => el.classList.remove("ring-4", "ring-red-500", "animate-pulse"), 3000);
        }
        const semImei = !aparelho1TemImei && (!temSegundoAparelho || !aparelho2TemImei);
        alert(
          semImei
            ? "Não conseguimos ler o Nº de Série em algum dos prints. Tire novos prints mais nítidos ou use o botão 'Corrigir' pra digitar manualmente."
            : "Não conseguimos ler o Nº de Série ou o IMEI em algum dos prints. Tire novos prints mais nítidos (tela do iPhone em Ajustes > Geral > Sobre) ou use o botão 'Corrigir' pra digitar manualmente.",
        );
        return;
      }
    }

    // Janela de agendamento: rejeita datas fora de [min, max] e domingos.
    if (local !== "Correios" && dataEntrega) {
      if (dataEntrega < agendamentoBounds.min || dataEntrega > agendamentoBounds.max) {
        alert("Agendamento disponivel apenas para hoje, amanha ou depois de amanha. Ajuste a data.");
        return;
      }
      if (new Date(dataEntrega + "T12:00:00").getDay() === 0) {
        alert("Domingo indisponivel para agendamento. Ajuste a data.");
        return;
      }
    }

    const produtoFinal = produtoInput || produtoParam || "";
    const precoFinal = preco > 0 ? preco : precoAuto;
    if (!precoFinal) {
      alert("Informe o valor combinado do produto.");
      return;
    }

    const localStr = local === "Loja" ? "Retirada em loja"
      : local === "Correios" ? "Envio Correios"
      : tipoEntrega === "Shopping" ? `Entrega - Shopping: ${shopping}`
      : tipoEntrega === "Outro" ? `Entrega - Local combinado: ${shopping || "(a definir)"}`
      : "Entrega - Residência";

    // Valor base para cálculos (usa precoFinal definido acima)
    const descontoFinal = parseFloat(String(descontoParam)) || 0;
    // `precoFinal` ja e o total somado de todos os produtos (gerar-link envia
    // `v = total`). Extras aqui sao so display. Nao somar de novo — dava
    // double count (14.294 total + 5.497 extras = 19.791 erroneo).
    const valorBaseFinal = Math.max(precoFinal - descontoFinal - trocaNum, 0);
    const entradaFinal = entradaPixNum || parseFloat(entradaPixParam) || 0;
    const valorParcelarFinal = entradaFinal > 0 ? Math.max(valorBaseFinal - entradaFinal, 0) : valorBaseFinal;

    // Parcelas recalculadas com precoFinal (garante precisão mesmo se precoAuto mudou no submit)
    const parcelasCalc = parcelas ? (() => {
      const n = parseInt(parcelas);
      const taxa = TAXAS[n] ?? 0;
      const total = valorParcelarFinal * (1 + taxa / 100);
      const vp = total / n;
      return { n, total, vp };
    })() : null;

    // Pagamento estruturado (bloco de linhas).
    // Caso especial: pagamento_pago=mp com entrada PIX → fluxo "dividido"
    // (link MP pagou o parcelado, PIX fica pendente na retirada).
    // Split em "Pagamento 1: Link MP [PAGO]" + "Pagamento 2: PIX [PENDENTE]".
    // Usamos colchetes em vez de emojis pra garantir renderização em qualquer
    // fonte/device (alguns navegadores/WhatsApp não suportam supplementary plane).
    const isMpComPixPendente = pagamentoPagoParam === "mp" && entradaFinal > 0;
    const pagLines: string[] = [];
    if (isMpComPixPendente && parcelasCalc) {
      pagLines.push(`*Pagamento 1:* Link MP — ${parcelasCalc.n}x de R$ ${fmt2(parcelasCalc.vp)} (total R$ ${fmt2(parcelasCalc.total)}) [PAGO]`);
      pagLines.push(`*Pagamento 2:* PIX R$ ${fmt(entradaFinal)} [PENDENTE]`);
    } else if (isMpComPixPendente) {
      pagLines.push(`*Pagamento 1:* Link MP R$ ${fmt(valorParcelarFinal)} [PAGO]`);
      pagLines.push(`*Pagamento 2:* PIX R$ ${fmt(entradaFinal)} [PENDENTE]`);
    } else if (formaPagamento === "PIX") {
      pagLines.push(`*Forma:* PIX`);
      pagLines.push(`*Valor:* R$ ${fmt(valorBaseFinal)}`);
    } else if (formaPagamento === "Debito") {
      pagLines.push(`*Forma:* Débito`);
      pagLines.push(`*Valor:* R$ ${fmt(valorBaseFinal)}`);
    } else if ((formaPagamento.includes("Cartao") || formaPagamento === "PIX + Cartao") && parcelas && parcelasCalc) {
      if (entradaFinal > 0) {
        pagLines.push(`*Forma:* PIX + Cartão`);
        pagLines.push(`*Entrada PIX:* R$ ${fmt(entradaFinal)}`);
        pagLines.push(`*Parcelas:* ${parcelasCalc.n}x de R$ ${fmt2(parcelasCalc.vp)}`);
        pagLines.push(`*Total no cartão:* R$ ${fmt2(parcelasCalc.total)}`);
      } else {
        pagLines.push(`*Forma:* Cartão de Crédito`);
        pagLines.push(`*Parcelas:* ${parcelasCalc.n}x de R$ ${fmt2(parcelasCalc.vp)}`);
        pagLines.push(`*Total:* R$ ${fmt2(parcelasCalc.total)}`);
      }
    } else if (formaPagamento === "Link de Pagamento" && parcelas && parcelasCalc) {
      pagLines.push(`*Forma:* Link de Pagamento`);
      pagLines.push(`*Parcelas:* ${parcelasCalc.n}x de R$ ${fmt2(parcelasCalc.vp)}`);
      pagLines.push(`*Total:* R$ ${fmt2(parcelasCalc.total)}`);
    } else if (formaPagamento === "Link de Pagamento" && parcelas) {
      pagLines.push(`*Forma:* Link de Pagamento — ${parcelas}x`);
    } else {
      pagLines.push(`*Forma:* ${formaPagamento}`);
    }

    const isTradeInFlow = isFromTradeIn || trocaProduto;
    const enderecoFull = `${endereco}, ${numero}${complemento ? ` - ${complemento}` : ""}`;
    // Encomenda: sempre antecipado (cliente paga sinal ou integral pelo link
    // antes do produto chegar — recolhimento da troca/diferenca fica pra
    // retirada). Sem encomenda: residencia/correios = antecipado, resto = na entrega.
    const pagEntrega = pagamentoPagoParam ? ""
      : encomendaParam ? "! PAGAMENTO ANTECIPADO"
      : local === "Correios" ? "! PAGAMENTO ANTECIPADO"
      : local === "Entrega" && tipoEntrega === "Residencia" ? "! PAGAMENTO ANTECIPADO"
      : local === "Entrega" ? "PAGAR NA ENTREGA"
      : "";

    // Bloco encomenda — vai logo no topo da mensagem pra equipe ver na
    // primeira linha que e pedido sob encomenda. Inclui prazo, valor pago
    // agora (sinal ou integral) e restante na entrega quando aplicavel.
    const encomendaLines: string[] = [];
    if (encomendaParam) {
      const temSinalEnc = sinalPctParam > 0 && sinalPctParam < 100;
      const valorSinalEnc = temSinalEnc ? Math.round((valorBaseFinal * sinalPctParam) / 100) : valorBaseFinal;
      const valorRestanteEnc = temSinalEnc ? Math.max(valorBaseFinal - valorSinalEnc, 0) : 0;
      encomendaLines.push(`*━━━ 📦 PEDIDO SOB ENCOMENDA ━━━*`);
      if (previsaoChegadaParam) encomendaLines.push(`*Prazo de entrega:* ${previsaoChegadaParam} após pagamento`);
      if (temSinalEnc) {
        encomendaLines.push(`*Pagamento agora:* Sinal ${sinalPctParam}% — R$ ${fmt(valorSinalEnc)}`);
        if (valorRestanteEnc > 0) encomendaLines.push(`*Restante na entrega:* R$ ${fmt(valorRestanteEnc)}`);
      } else {
        encomendaLines.push(`*Pagamento agora:* Integral — R$ ${fmt(valorBaseFinal)}`);
      }
      if (temTroca) encomendaLines.push(`*Aparelho na troca:* avaliação e coleta no dia da retirada`);
      encomendaLines.push("");
    }

    const lines = [
      `Olá, me chamo ${nome}. ${isTradeInFlow ? "Fiz a avaliação de troca no site e preenchi o formulário de compra." : "Vim pelo formulário de compra!"}`,
      "",
      ...encomendaLines,
      `*━━━ DADOS DA COMPRA — Tigrão Imports ━━━*`,
      "",
      `*▸ DADOS PESSOAIS*`,
      // Dados pessoais / empresa
      ...(pessoa === "PJ"
        ? [
            `*Tipo:* Pessoa Jurídica`,
            `*Razão Social:* ${nome}`,
            `*CNPJ:* ${cnpj}`,
            `*Inscrição Estadual:* ${ieStatus === "TEM" ? ie : "Isento"}`,
          ]
        : [
            `*Nome completo:* ${nome}`,
            `*CPF:* ${cpf}`,
          ]),
      `*E-mail:* ${email}`,
      `*Telefone:* ${telefone}`,
      ...(instagram ? [`*Instagram:* ${instagram}`] : []),
      `*CEP:* ${cep}`,
      `*Endereço:* ${enderecoFull}`,
      `*Bairro:* ${bairro}`,
      "",
      // Produtos — precoFinal e o TOTAL somado (conforme gerar-link envia).
      // Quando ha extras com preco individual, calcula Produto 1 = total -
      // soma dos extras. Evita mensagem mostrando valor total na linha do
      // primeiro produto (ex: "iPhone — R$ 21.294" quando na verdade e a
      // soma com o Mac Mini).
      ...(() => {
        const somaExtras = produtosExtras.reduce((s, p) => s + (Number(p.preco) || 0), 0);
        const precoP1 = somaExtras > 0 && precoFinal > somaExtras ? precoFinal - somaExtras : precoFinal;
        const subtotalBruto = precoFinal; // soma de todos sem desconto/troca
        return [
          `*▸ ${produtosExtras.length > 0 ? "PRODUTOS" : "PRODUTO"}*`,
          `*Produto 1:* ${produtoFinal}${corSel ? ` — ${corSel}` : ""}${precoP1 > 0 ? ` — R$ ${fmt(precoP1)}` : ""}`,
          ...(produtosExtras.map((p, i) => `*Produto ${i + 2}:* ${p.nome}${p.preco > 0 ? ` — R$ ${fmt(p.preco)}` : ""}`)),
          // Subtotal so aparece quando tem mais de um produto — pra deixar
          // claro o somado antes de descontos/troca.
          ...(produtosExtras.length > 0 ? [`*Subtotal:* R$ ${fmt(subtotalBruto)}`] : []),
          ...(descontoParam > 0 ? [`*Desconto:* - R$ ${fmt(descontoParam)}`] : []),
          ...(descontoParam > 0 || produtosExtras.length > 0 ? [`*Total com desconto:* R$ ${fmt(valorBaseFinal)}`] : []),
        ];
      })(),
      "",
      // Pagamento
      `*▸ PAGAMENTO*`,
      ...pagLines,
      // Detalhes do pagamento MP (quando pago via link MP).
      // Se não há entrada PIX, mostra "Valor pago no link" (valor total).
      // Se há entrada PIX, o valor já está em *Pagamento 1* acima.
      ...(pagamentoPagoParam === "mp" && !isMpComPixPendente && valorBaseFinal > 0
        ? [`*Valor pago no link:* R$ ${fmt(valorBaseFinal)}`]
        : []),
      ...(pagamentoPagoParam === "mp" && mpPaymentId
        ? [`*ID do pagamento MP:* ${mpPaymentId}`]
        : []),
      ...(pagamentoPagoParam === "mp" && !mpPaymentId && mpPreferenceId
        ? [`*Preference MP:* ${mpPreferenceId}`]
        : []),
    ];

    // Trade-in info
    if (temTroca && (trocaProduto || descTroca)) {
      const temDoisUsados = !!trocaProduto2Param;
      lines.push("");
      lines.push(`*▸ ${temDoisUsados ? "APARELHOS NA TROCA" : "APARELHO NA TROCA"}*`);
      if (trocaProduto) {
        if (temDoisUsados) lines.push(``, `*Aparelho 1:*`);
        lines.push(`*Modelo:* ${trocaProduto}`);
        if (trocaCorParam) lines.push(`*Cor:* ${trocaCorParam}`);
        if (trocaNum1 > 0) lines.push(`*Valor avaliado:* R$ ${fmt(trocaNum1)}`);
        if (trocaCond) lines.push(`*Condição:* ${trocaCond}`);
        if (trocaCaixaParam) lines.push(`*Caixa original:* ${trocaCaixaParam === "1" ? "Sim" : "Não"}`);
        if (trocaSerial1.trim()) lines.push(`*Nº de Série:* ${trocaSerial1.trim()}`);
        if (trocaImei1.trim()) {
          // Status Anatel/Infosimples vai grudado no IMEI pra equipe ver de
          // cara. ✅ = pode comprar, ❌ = NAO comprar (consultar manual antes),
          // ⚠️ = consulta falhou (consultar manual no site da Anatel).
          const statusIcon =
            trocaImeiStatus1 === "OK" ? " ✅ Verificado" :
            trocaImeiStatus1 === "BLOQUEADO" ? " ❌ BLOQUEADO — NAO COMPRAR" :
            trocaImeiStatus1 === "ERRO" ? " ⚠️ Consultar manual" :
            "";
          lines.push(`*IMEI:* ${trocaImei1.trim()}${statusIcon}`);
        }
      } else if (descTroca) {
        lines.push(`*Modelo:* ${descTroca}`);
      }
      // 2o produto na troca
      if (temDoisUsados) {
        lines.push(``, `*Aparelho 2:*`);
        lines.push(`*Modelo:* ${trocaProduto2Param}`);
        if (trocaCor2Param) lines.push(`*Cor:* ${trocaCor2Param}`);
        if (trocaNum2 > 0) lines.push(`*Valor avaliado:* R$ ${fmt(trocaNum2)}`);
        if (trocaCond2Param) lines.push(`*Condição:* ${trocaCond2Param}`);
        if (trocaCaixa2Param) lines.push(`*Caixa original:* ${trocaCaixa2Param === "1" ? "Sim" : "Não"}`);
        if (trocaSerial2.trim()) lines.push(`*Nº de Série:* ${trocaSerial2.trim()}`);
        if (trocaImei2.trim()) {
          const statusIcon2 =
            trocaImeiStatus2 === "OK" ? " ✅ Verificado" :
            trocaImeiStatus2 === "BLOQUEADO" ? " ❌ BLOQUEADO — NAO COMPRAR" :
            trocaImeiStatus2 === "ERRO" ? " ⚠️ Consultar manual" :
            "";
          lines.push(`*IMEI:* ${trocaImei2.trim()}${statusIcon2}`);
        }
      }
      if (valorBase > 0) { lines.push(""); lines.push(`*Diferença a pagar:* R$ ${fmt(valorBase)}`); }
    }

    // Vendedor, origem, entrega
    lines.push("");
    lines.push(`*▸ ENTREGA*`);
    if (vendedor) lines.push(`*Vendedor:* ${vendedor}`);
    if (origem) lines.push(`*Como conheceu a loja:* ${origem}`);
    lines.push(`*Horário:* ${horario}`);
    if (dataEntrega) {
      const [y, m, d] = dataEntrega.split("-");
      lines.push(`*Data:* ${d}/${m}/${y}`);
    }
    lines.push(`*Local:* ${localStr}`);
    if (taxaEntregaParam > 0) lines.push(`*Taxa de entrega:* R$ ${fmt(taxaEntregaParam)}`);
    if (pagEntrega) lines.push(pagEntrega);
    if (local === "Entrega" && !pagamentoPagoParam) {
      lines.push("");
      lines.push("*! TAXA DE DESLOCAMENTO:* Caso a compra não seja concluída no ato da entrega (limite, divergência, etc), será cobrada taxa de deslocamento. Cliente ciente.");
    }

    // Entrega NÃO é criada automaticamente — equipe cria manualmente na agenda

    // Se veio de um short link rastreável, devolve os dados preenchidos pro admin.
    // IMPORTANTE: usamos navigator.sendBeacon — projetado exatamente pra POSTs
    // que precisam sobreviver ao unload/navigation (analytics, tracking).
    // fetch+keepalive falhava em mobile Safari/Chrome: o navegador cancelava
    // o request ao abrir wa.me, deixando cliente_preencheu_em NULL e o pedido
    // aparecia como "Aguardando" no admin mesmo depois de chegar no WhatsApp.
    // sendBeacon é gerenciado pelo user-agent fora do contexto da página, então
    // completa mesmo quando a aba navega ou fecha.
    if (shortCode) {
      const enderecoFullTxt = `${endereco}, ${numero}${complemento ? ` - ${complemento}` : ""}`;
      const payload = JSON.stringify({
        dados: {
          nome, cpf: pessoa === "PJ" ? "" : cpf, cnpj: pessoa === "PJ" ? cnpj : "", pessoa,
          inscricao_estadual: pessoa === "PJ" ? (ieStatus === "TEM" ? ie : "ISENTO") : "",
          email, telefone, instagram,
          cep, endereco, numero, complemento, bairro,
          endereco_completo: enderecoFullTxt,
          produto: produtoFinal, cor: corSel, preco: precoFinal,
          forma_pagamento: pagLines.join(" | "),
          local: localStr, horario, data_entrega: dataEntrega,
          vendedor, origem,
          troca_serial: temTroca ? trocaSerial1.trim() : "",
          troca_imei: temTroca ? trocaImei1.trim() : "",
          troca_serial2: temTroca && temSegundoAparelho ? trocaSerial2.trim() : "",
          troca_imei2: temTroca && temSegundoAparelho ? trocaImei2.trim() : "",
          website: honeypot,
        },
      });
      const preenchUrl = `/api/link-compras/${encodeURIComponent(shortCode)}/preenchimento`;
      let beaconOk = false;
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        try {
          const blob = new Blob([payload], { type: "application/json" });
          beaconOk = navigator.sendBeacon(preenchUrl, blob);
        } catch { /* fallback */ }
      }
      // Fallback: fetch+keepalive caso o beacon falhe (quota estourada ou browser
      // sem suporte). Melhor que nada — em desktop funciona bem.
      if (!beaconOk) {
        fetch(preenchUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: payload,
        }).catch(() => {});
      }

      // Cria/atualiza venda em status FORMULARIO_PREENCHIDO — equipe vê na aba
      // "📝 Formulários Preenchidos" de /admin/vendas, confere e envia pra
      // "Vendas Pendentes" manualmente. Fire-and-forget via sendBeacon/keepalive.
      const vendaPayload = JSON.stringify(withUTMs({
        shortCode,
        nome, pessoa, cpf, cnpj, email, telefone, instagram,
        cep, endereco, numero, complemento, bairro,
        produto: produtoFinal, cor: corSel, preco: precoFinal, desconto: descontoNum,
        // Produtos adicionais (multi-produto): quando o link foi gerado com
        // produto2, produto3... — backend cria uma venda por produto, todas
        // com o mesmo grupo_id pra admin tratar como carrinho unificado.
        produtosExtras,
        formaPagamento, parcelas, entradaPix: entradaPixNum,
        trocaProduto: temTroca ? trocaProduto : undefined,
        trocaCor: temTroca ? trocaCorParam : undefined,
        trocaValor: temTroca ? trocaNum1 : undefined,
        trocaCondicao: temTroca ? trocaCond : undefined,
        trocaCaixa: temTroca ? trocaCaixaParam === "1" : undefined,
        trocaSerial: temTroca ? trocaSerial1.trim() : undefined,
        trocaImei: temTroca ? trocaImei1.trim() : undefined,
        trocaProduto2: temTroca && temSegundoAparelho ? trocaProduto2Param : undefined,
        trocaCor2: temTroca && temSegundoAparelho ? trocaCor2Param : undefined,
        trocaValor2: temTroca && temSegundoAparelho ? trocaNum2 : undefined,
        trocaCondicao2: temTroca && temSegundoAparelho ? trocaCond2Param : undefined,
        trocaCaixa2: temTroca && temSegundoAparelho ? trocaCaixa2Param === "1" : undefined,
        trocaSerial2: temTroca && temSegundoAparelho ? trocaSerial2.trim() : undefined,
        trocaImei2: temTroca && temSegundoAparelho ? trocaImei2.trim() : undefined,
        localEntrega: localStr, dataEntrega, horarioEntrega: horario,
        vendedor, origem,
        // Encomenda: backend confere o tipo do link_compras antes de criar
        // em `encomendas` em vez de `vendas`. URL param sozinho nao confia.
        encomenda: encomendaParam,
        previsaoChegada: encomendaParam ? previsaoChegadaParam : undefined,
        sinalPct: encomendaParam ? sinalPctParam : undefined,
        website: honeypot,
      }));
      const vendaUrl = "/api/vendas/from-formulario";
      let vendaBeaconOk = false;
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        try {
          const blob = new Blob([vendaPayload], { type: "application/json" });
          vendaBeaconOk = navigator.sendBeacon(vendaUrl, blob);
        } catch { /* fallback */ }
      }
      if (!vendaBeaconOk) {
        fetch(vendaUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: vendaPayload,
        }).catch(() => {});
      }
    }

    // Tracking: cliente concluiu o formulario com sucesso (etapa 5 do funil)
    trackAction("compra_submit");

    const url = `https://wa.me/${whatsappFinal}?text=${encodeURIComponent(lines.join("\n"))}`;
    window.open(url, "_blank");
  }

  // ========================================================
  // Fluxo invertido: cliente preencheu formulário → paga MP
  // ========================================================
  // Fluxo: POST /api/create-mp-from-form com TODOS os dados → server cria
  // link_compras (atualiza), gera preference MP com dados pré-preenchidos e
  // devolve init_point → redirecionamos cliente pro MP.
  // Quando MP confirma pagamento, o webhook /api/mp-webhook monta a mensagem
  // completa e envia AUTOMATICAMENTE pro grupo (sem o cliente precisar
  // clicar em "Enviar no WhatsApp").
  async function handlePagarMp() {
    setErroMp("");

    if (!shortCode) {
      setErroMp("Link inválido. Peça um novo link ao vendedor.");
      return;
    }

    // Validações (duplicam as do handleSubmit — OK, são baratas)
    const produtoFinal = produtoInput || produtoParam || "";
    if (!produtoFinal) {
      setErroMp("Selecione o produto desejado.");
      return;
    }
    if (!corSel || !corSel.trim()) {
      setErroMp("Escolha a cor do produto.");
      document.getElementById("escolha-cor")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const precoFinal = preco > 0 ? preco : precoAuto;
    if (!precoFinal || precoFinal <= 0) {
      setErroMp("Informe o valor do produto.");
      return;
    }
    if (!nome) {
      setErroMp("Preencha seu nome completo.");
      return;
    }
    if (pessoa === "PJ" ? !cnpj : !cpf) {
      setErroMp(`Preencha seu ${pessoa === "PJ" ? "CNPJ" : "CPF"}.`);
      return;
    }
    if (pessoa === "PJ") {
      if (ieStatus === null) {
        setErroMp("Responda se a empresa tem ou é isenta de Inscrição Estadual.");
        return;
      }
      if (ieStatus === "TEM" && !ie.trim()) {
        setErroMp("Informe o número da Inscrição Estadual.");
        return;
      }
    }
    if (!email || !telefone) {
      setErroMp("Preencha email e telefone.");
      return;
    }

    // Calcula valor a cobrar no MP. Se há entrada PIX (pagamento dividido),
    // o MP cobra só o valor parcelar (o PIX fica pendente pra retirada).
    // IMPORTANTE: aplica a taxa do cartao/link nas parcelas — o operador
    // define "Link 12x" esperando cobrar R$ com taxa repassada (ex: 5497
    // base + 13% = 6212 em 12x de 517,67). Antes o MP cobrava so R$ 5497
    // (sem taxa), ficava 12x de 458,08 e a loja nao recebia o repasse.
    const descontoFinal = parseFloat(String(descontoParam)) || 0;
    // `precoFinal` ja e o total somado — gerar-link envia `v = total`. Nao
    // somar extras aqui (double count).
    const valorBaseFinal = Math.max(precoFinal - descontoFinal - trocaNum, 0);
    const entradaFinal = entradaPixNum || parseFloat(entradaPixParam) || 0;
    const valorSemTaxa =
      entradaFinal > 0 ? Math.max(valorBaseFinal - entradaFinal, 0) : valorBaseFinal;
    const nParcelasMp = parseInt(parcelas || "1") || 1;
    const taxaParcelasMp = nParcelasMp > 1 ? (TAXAS[nParcelasMp] ?? 0) : 0;
    const valorMpCobrado = taxaParcelasMp > 0
      ? Math.round(valorSemTaxa * (1 + taxaParcelasMp / 100))
      : valorSemTaxa;

    if (valorMpCobrado <= 0) {
      setErroMp("Valor a pagar via Mercado Pago inválido (R$ 0).");
      return;
    }

    setLoadingMp(true);

    try {
      const payload = {
        shortCode,
        nome,
        pessoa,
        cpf: pessoa === "PF" ? cpf : undefined,
        cnpj: pessoa === "PJ" ? cnpj : undefined,
        inscricao_estadual: pessoa === "PJ" ? (ieStatus === "TEM" ? ie : "ISENTO") : undefined,
        email,
        telefone,
        instagram,
        cep,
        endereco,
        numero,
        complemento,
        bairro,
        produto: produtoFinal,
        cor: corSel,
        preco: precoFinal,
        produtosExtras,
        desconto: descontoFinal,
        formaPagamento: formaPagamento || "Link de Pagamento",
        parcelas,
        entradaPix: entradaFinal,
        troca:
          trocaProdutoParam || descTroca
            ? {
                aparelhos: [
                  ...(trocaProdutoParam
                    ? [{
                        modelo: trocaProdutoParam,
                        cor: trocaCorParam,
                        valor: trocaNum1,
                        condicao: trocaCondParam,
                        caixa: trocaCaixaParam === "1",
                        serial: trocaSerial1.trim() || undefined,
                        imei: trocaImei1.trim() || undefined,
                      }]
                    : []),
                  ...(trocaProduto2Param
                    ? [{
                        modelo: trocaProduto2Param,
                        cor: trocaCor2Param,
                        valor: trocaNum2,
                        condicao: trocaCond2Param,
                        caixa: trocaCaixa2Param === "1",
                        serial: trocaSerial2.trim() || undefined,
                        imei: trocaImei2.trim() || undefined,
                      }]
                    : []),
                ],
                descricaoLivre: descTroca || undefined,
              }
            : undefined,
        entrega: {
          local: local === "Correios" ? "Correios" : local === "Loja" ? "Loja" : "Entrega",
          tipoEntrega: local === "Entrega" ? tipoEntrega : undefined,
          // Para "Outro", o campo `shopping` guarda o nome do local combinado
          // (reusamos o mesmo campo pra evitar novo campo no backend).
          shopping: (tipoEntrega === "Shopping" || tipoEntrega === "Outro") ? shopping : undefined,
          data: dataEntrega,
          horario,
          vendedor,
          origem,
        },
        isFromTradeIn,
        valorMp: valorMpCobrado,
        // Número do WhatsApp do vendedor que gerou o link — salvamos no
        // snapshot pra que /pagamento-confirmado possa redirecionar o cliente
        // direto pro chat do vendedor com o pedido + comprovante MP.
        whatsappVendedor: whatsappFinal,
        // Honeypot anti-bot (humanos nunca preenchem isso — só bots)
        website: honeypot,
      };

      const res = await fetch("/api/create-mp-from-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.init_point) {
        throw new Error(json.error || "Não foi possível gerar o link de pagamento");
      }

      // Cria venda em FORMULARIO_PREENCHIDO antes de redirecionar pro MP.
      // Fire-and-forget — se falhar por qq motivo, não bloqueia o cliente.
      try {
        await fetch("/api/vendas/from-formulario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify(withUTMs({
            shortCode,
            nome, pessoa, cpf, cnpj, email, telefone, instagram,
            cep, endereco, numero, complemento, bairro,
            produto: produtoFinal, cor: corSel, preco: precoFinal, desconto: descontoFinal,
            formaPagamento: formaPagamento || "Link de Pagamento",
            parcelas, entradaPix: entradaFinal,
            trocaProduto: trocaProdutoParam || undefined,
            trocaCor: trocaCorParam || undefined,
            trocaValor: trocaNum1 || undefined,
            trocaCondicao: trocaCondParam || undefined,
            trocaCaixa: trocaCaixaParam === "1",
            trocaSerial: trocaSerial1.trim() || undefined,
            trocaImei: trocaImei1.trim() || undefined,
            trocaProduto2: trocaProduto2Param || undefined,
            trocaCor2: trocaCor2Param || undefined,
            trocaValor2: trocaNum2 || undefined,
            trocaCondicao2: trocaCond2Param || undefined,
            trocaCaixa2: trocaCaixa2Param === "1",
            trocaSerial2: trocaSerial2.trim() || undefined,
            trocaImei2: trocaImei2.trim() || undefined,
            vendedor, origem,
            website: honeypot,
          })),
        });
      } catch { /* não bloqueia redirect */ }

      // Tracking: cliente concluiu o formulario com sucesso (etapa 5 do funil)
      trackAction("compra_submit");

      // Redireciona pro Mercado Pago (troca a URL, não abre nova aba — assim
      // o cliente não perde o contexto do pedido).
      window.location.href = json.init_point;
    } catch (err) {
      console.error("[handlePagarMp]", err);
      setErroMp(err instanceof Error ? err.message : "Erro ao gerar link de pagamento");
      setLoadingMp(false);
    }
  }

  if (!whatsappFinal) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm text-center max-w-sm">
          <p className="text-2xl mb-2">&#x1F42F;</p>
          <p className="text-[#1D1D1F] font-semibold">Carregando...</p>
          <p className="text-[#86868B] text-sm mt-1">Aguarde um momento...</p>
        </div>
      </div>
    );
  }

  const inputCls = "w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]";
  const labelCls = "block text-sm font-medium text-[#1D1D1F] mb-1";
  const cardCls = "bg-white rounded-xl p-4 shadow-sm border border-[#E8E8ED] space-y-3";
  const sectionTitle = "text-xs text-[#86868B] uppercase tracking-wider font-semibold";

  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      {/* Header — fica AZUL quando encomenda pra diferenciar visualmente do
          fluxo de compra normal (laranja). Cliente entende ja no topo que
          esta num pedido sob encomenda. */}
      <div className={`${encomendaParam ? "bg-blue-600" : "bg-[#E8740E]"} text-white px-4 py-4 text-center`}>
        <p className="text-lg font-bold">&#x1F42F; TigraoImports</p>
        <p className="text-sm opacity-90">{encomendaParam ? "📦 ENCOMENDA — Reserva do seu produto" : "Formulario de Compra"}</p>
      </div>

      {/* Banner de encomenda — mini-timeline em 3 passos. Substitui o texto
          seco anterior por uma visualizacao clara: pagar agora -> aguardar
          chegada -> retirar (e entregar troca, se houver). Mostra valores em
          R$ pra o cliente nao precisar calcular ou rolar pro resumo. */}
      {encomendaParam && (() => {
        const temSinal = sinalPctParam > 0 && sinalPctParam < 100;
        const temTrocaEnc = !!trocaProdutoParam;
        const valorTotalEnc = preco;
        const valorAposTrocaEnc = Math.max(valorTotalEnc - trocaNum, 0);
        const valorSinalEnc = temSinal ? Math.round((valorAposTrocaEnc * sinalPctParam) / 100) : valorAposTrocaEnc;
        const valorRestanteEnc = temSinal ? Math.max(valorAposTrocaEnc - valorSinalEnc, 0) : 0;
        return (
          <div className="mx-4 mt-4 rounded-2xl p-5 border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100 shadow-sm">
            <p className="text-sm font-bold text-blue-900 mb-4 flex items-center gap-1.5">
              <span>📦</span><span>Como funciona sua encomenda</span>
            </p>
            <div className="grid grid-cols-3 gap-2 relative">
              {/* Linha conectora horizontal — atras dos circulos */}
              <div className="absolute top-4 left-[16.67%] right-[16.67%] h-0.5 bg-blue-300" aria-hidden="true" />
              {/* Passo 1: Pagar agora */}
              <div className="relative flex flex-col items-center text-center">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold z-10 mb-2 shadow-md">1</div>
                <p className="text-[11px] font-bold text-blue-900 leading-tight">Pagar agora</p>
                <p className="text-[10px] text-blue-700 mt-0.5 leading-tight">{temSinal ? `Sinal ${sinalPctParam}%` : "Integral"}</p>
                {valorSinalEnc > 0 && (
                  <p className="text-xs font-bold text-blue-900 mt-1">R$ {fmt(valorSinalEnc)}</p>
                )}
              </div>
              {/* Passo 2: Aguardar chegada */}
              <div className="relative flex flex-col items-center text-center">
                <div className="w-8 h-8 rounded-full bg-white border-2 border-blue-400 text-blue-600 flex items-center justify-center text-xs font-bold z-10 mb-2 shadow-sm">2</div>
                <p className="text-[11px] font-bold text-blue-900 leading-tight">Aguardar</p>
                <p className="text-[10px] text-blue-700 mt-0.5 leading-tight">{previsaoChegadaParam || "em breve"}</p>
                <p className="text-[10px] text-blue-700 mt-1">📦 chegada</p>
              </div>
              {/* Passo 3: Retirar (+ entregar troca se houver) */}
              <div className="relative flex flex-col items-center text-center">
                <div className="w-8 h-8 rounded-full bg-white border-2 border-blue-400 text-blue-600 flex items-center justify-center text-xs font-bold z-10 mb-2 shadow-sm">3</div>
                <p className="text-[11px] font-bold text-blue-900 leading-tight">Retirar</p>
                <p className="text-[10px] text-blue-700 mt-0.5 leading-tight">{temTrocaEnc ? "+ entregar troca" : "na loja"}</p>
                {valorRestanteEnc > 0 && (
                  <p className="text-xs font-bold text-blue-900 mt-1">R$ {fmt(valorRestanteEnc)}</p>
                )}
              </div>
            </div>
            {temTrocaEnc && (
              <p className="text-[11px] text-blue-800 mt-4 pt-3 border-t border-blue-200 leading-relaxed">
                <span className="font-semibold">💱 Sobre sua troca:</span> seu aparelho usado sera avaliado e recolhido na data da retirada — voce nao precisa entregar antes.
              </p>
            )}
          </div>
        );
      })()}

      {/* Cobranca extra — capa, pelicula, brinde, etc. Ja esta somada no total
          cobrado, aqui so avisa ao cliente que esta incluido. */}
      {extraDescricaoParam && extraValorParam > 0 && (
        <div className="mx-4 mt-4 rounded-xl p-3 border border-amber-300 bg-amber-50">
          <p className="text-xs text-amber-900">
            <span className="font-semibold">➕ Inclui:</span> {extraDescricaoParam} — R$ {fmt(extraValorParam)}
          </p>
        </div>
      )}

      {/* Product info */}
      <div className="mx-4 mt-4 bg-white rounded-xl p-4 shadow-sm border border-[#E8E8ED]">
        {produtoParam ? (
          <>
            <p className={sectionTitle}>{produtosExtras.length > 0 ? "Produtos" : "Produto"}</p>

            {/* Modo variante: produto base veio na URL mas sem preço → mostra picker de configs */}
            {variantesDoBase.length > 0 && !produtoInput && (
              <div className="mt-2 space-y-2">
                <p className="text-[#1D1D1F] font-bold text-lg">{produtoParam}</p>
                <p className="text-xs text-[#86868B] uppercase tracking-wider font-semibold mt-3 mb-1">Escolha a configuracao</p>
                <div className="space-y-2">
                  {variantesDoBase.map(v => (
                    <button key={v.produto} type="button"
                      onClick={() => { setProdutoInput(v.produto); setPrecoAuto(v.preco ?? 0); setCorSel(""); }}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 border-[#D2D2D7] bg-[#F5F5F7] hover:border-[#E8740E] hover:bg-[#FFF5EB] transition-all text-left">
                      <span className="text-sm font-semibold text-[#1D1D1F]">
                        {v.produto.replace(produtoParam, "").trim().replace(/^[-–]/, "").trim() || v.produto}
                      </span>
                      {v.preco && (
                        <span className="text-sm font-bold text-[#E8740E] ml-3 shrink-0">R$ {fmt(v.preco)}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Variante selecionada — mostra config escolhida + botão trocar */}
            {variantesDoBase.length > 0 && produtoInput && (
              <div className="mt-2 space-y-1">
                <p className="text-[#1D1D1F] font-bold text-lg">{produtoInput}</p>
                {precoAuto > 0 && (
                  <p className="text-[#E8740E] font-bold text-2xl">R$ {fmt(precoAuto)}</p>
                )}
                <button type="button" onClick={() => { setProdutoInput(""); setPrecoAuto(0); setCorSel(""); }}
                  className="text-xs text-[#E8740E] underline underline-offset-2 mt-1">
                  Trocar configuracao
                </button>
              </div>
            )}

            {/* Modo normal: produto + preço já definidos na URL */}
            {variantesDoBase.length === 0 && (() => {
              // Calcula preco individual do produto 1 = preco total - soma dos extras.
              // `preco` na URL e o total somado (conforme gerar-link envia).
              const somaExtras = produtosExtras.reduce((s, p) => s + (Number(p.preco) || 0), 0);
              const precoP1 = preco > 0 ? Math.max(preco - somaExtras, 0) : 0;
              return (
                <>
                  <p className="text-[#1D1D1F] font-bold text-lg mt-1">
                    {produtoParam}
                    {precoP1 > 0 && <span className="text-[#E8740E] font-bold ml-2">R$ {fmt(precoP1)}</span>}
                  </p>
                  {produtosExtras.map((p, i) => (
                    <p key={i} className="text-[#1D1D1F] font-semibold text-base mt-1">
                      {p.nome}
                      {p.preco > 0 && <span className="text-[#E8740E] font-bold ml-2">R$ {fmt(p.preco)}</span>}
                    </p>
                  ))}
                  {preco > 0 && (
                    <div className="mt-3 pt-3 border-t border-[#E8E8ED] space-y-1">
                      {/* Quando ha desconto/troca, mostra breakdown claro: total sem
                          desconto → desconto/troca → total com desconto. Quando nao
                          ha, mostra so 'Preco de venda'. */}
                      {(descontoParam > 0 || trocaNum > 0) ? (
                        <>
                          <div className="flex justify-between items-baseline">
                            <span className="text-[#86868B] text-xs uppercase tracking-wider">Total sem desconto</span>
                            <span className="text-[#1D1D1F] font-semibold text-base">R$ {fmt(preco)}</span>
                          </div>
                          {descontoParam > 0 && (
                            <div className="flex justify-between items-baseline">
                              <span className="text-blue-500 text-xs font-semibold">Desconto</span>
                              <span className="text-blue-500 font-semibold text-base">- R$ {fmt(descontoParam)}</span>
                            </div>
                          )}
                          {trocaNum > 0 && (
                            <div className="flex justify-between items-baseline">
                              <span className="text-blue-500 text-xs font-semibold">Valor da troca</span>
                              <span className="text-blue-500 font-semibold text-base">- R$ {fmt(trocaNum)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-baseline pt-1 border-t border-[#E8E8ED]">
                            <span className="text-[#86868B] text-xs uppercase tracking-wider">{trocaNum > 0 ? "Diferenca a pagar" : "Total com desconto"}</span>
                            <span className="text-[#E8740E] font-bold text-2xl">R$ {fmt(valorBase)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between items-baseline">
                          <span className="text-[#86868B] text-xs uppercase tracking-wider">{produtosExtras.length > 0 ? "Preco total" : "Preco de venda"}</span>
                          <span className="text-[#E8740E] font-bold text-2xl">R$ {fmt(preco)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}

            {/* Selecao de cor — mostra APENAS quando o operador nao pre-preencheu
                (via URL ou auto-detect do nome do produto). Uma vez decidido no
                mount, mantem visivel enquanto cliente digita — antes o campo
                sumia porque a condicao era `!corSel`, e assim que cliente
                digitava 1 letra o bloco inteiro desaparecia. */}
            {(produtoInput || produtoParam) && precisaEscolherCor && (
              <div id="escolha-cor" className="mt-3 pt-3 border-t-2 border-[#E8740E] bg-[#FFF5EB] -mx-4 px-4 pb-3 rounded-b-xl">
                <p className="text-sm uppercase tracking-wider font-bold mb-2 text-[#E8740E]">
                  ⚠ Escolha a cor do produto *
                </p>
                {coresDisponiveis.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {coresDisponiveis.map(cor => (
                      <button key={cor} type="button"
                        onClick={() => { clienteTocouCorRef.current = true; setCorSel(corSel === cor ? "" : cor); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${corSel === cor ? "bg-[#E8740E] text-white border-[#E8740E]" : "bg-white text-[#1D1D1F] border-[#D2D2D7] hover:border-[#E8740E]"}`}>
                        {cor}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={corSel}
                    onChange={(e) => {
                      clienteTocouCorRef.current = true;
                      setCorSel(e.target.value.toUpperCase());
                    }}
                    placeholder="Ex: Preto, Azul, Titânio Preto, Meia-Noite..."
                    className={inputCls}
                    autoComplete="off"
                  />
                )}
              </div>
            )}
          </>
        ) : Object.keys(catalogoAtivo).length > 0 ? (
          <>
            <p className={sectionTitle}>Qual produto deseja?</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.keys(catalogoAtivo).map(cat => (
                <button key={cat} type="button" onClick={() => { setCatSel(catSel === cat ? "" : cat); setProdutoInput(""); setPrecoAuto(0); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${catSel === cat ? "bg-[#E8740E] text-white" : "bg-[#F5F5F7] border border-[#D2D2D7] text-[#6E6E73]"}`}>
                  {cat}
                </button>
              ))}
            </div>
            {catSel && catalogoAtivo[catSel] && (
              <div className="mt-3 max-h-[200px] overflow-y-auto space-y-1 border border-[#D2D2D7] rounded-lg p-2 bg-[#F5F5F7]">
                {catalogoAtivo[catSel].map(p => (
                  <button key={p.produto} type="button" onClick={() => { setProdutoInput(p.produto); setPrecoAuto(p.preco ?? 0); setCorSel(""); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${produtoInput === p.produto ? "bg-[#E8740E] text-white font-semibold" : "bg-white text-[#1D1D1F] hover:bg-[#FFF5EB]"}`}>
                    <span>{p.produto}</span>
                    {p.preco && <span className={`ml-2 text-xs font-bold ${produtoInput === p.produto ? "text-white/80" : "text-[#E8740E]"}`}>R$ {fmt(p.preco)}</span>}
                  </button>
                ))}
              </div>
            )}
            {produtoInput && (
              <div className="mt-3 p-3 rounded-lg bg-green-50 border border-green-200 space-y-2">
                <p className="text-sm font-semibold text-[#1D1D1F]">{produtoInput}{corSel ? ` — ${corSel}` : ""}</p>
                {preco > 0 ? (
                  <>
                    <p className="text-[#E8740E] font-bold text-xl">R$ {fmt(preco)}</p>
                    {descontoParam > 0 && <p className="text-blue-500 font-semibold text-sm">Desconto: - R$ {fmt(descontoParam)}</p>}
                    {(trocaNum > 0 || descontoParam > 0) && <p className="text-green-600 font-semibold text-sm">{trocaNum > 0 ? "Diferenca a pagar" : descontoParam > 0 ? "Total com desconto" : "Total"}: R$ {fmt(valorBase)}</p>}
                  </>
                ) : (
                  <div>
                    <label className="block text-xs text-[#86868B] mb-1">Valor combinado (R$) *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={precoAuto > 0 ? String(precoAuto) : ""}
                      onChange={e => setPrecoAuto(parseInt(e.target.value.replace(/\D/g,"")) || 0)}
                      placeholder="Ex: 7500"
                      className={inputCls}
                    />
                  </div>
                )}
              </div>
            )}
            {/* Seleção de cor — cores reais do estoque */}
            {produtoInput && coresDisponiveis.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-[#86868B] uppercase tracking-wider font-semibold mb-2">Escolha a cor</p>
                <div className="flex flex-wrap gap-2">
                  {coresDisponiveis.map(cor => (
                    <button key={cor} type="button" onClick={() => setCorSel(corSel === cor ? "" : cor)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${corSel === cor ? "bg-[#E8740E] text-white border-[#E8740E]" : "bg-[#F5F5F7] text-[#1D1D1F] border-[#D2D2D7] hover:border-[#E8740E]"}`}>
                      {cor}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <p className={sectionTitle}>Qual produto deseja?</p>
            <input type="text" required value={produtoInput} onChange={(e) => setProdutoInput(e.target.value)}
              placeholder="Ex: iPhone 17 Pro Max 256GB Silver" className={`${inputCls} mt-2`} />
          </>
        )}
        {vendedor && <p className="text-[#86868B] text-sm mt-2">Vendedor: {vendedor}</p>}
      </div>

      {/* Trade-in from URL (pre-filled) */}
      {isFromTradeIn && (
        <div className="mx-4 mt-3 bg-green-50 rounded-xl p-4 shadow-sm border border-green-200 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-green-600 font-bold text-sm">&#x2705; {trocaProduto2Param ? "Trocas confirmadas" : "Troca confirmada"}</span>
          </div>
          <div>
            <p className="text-[#1D1D1F] font-semibold">{trocaProduto}{trocaCorParam ? ` — ${trocaCorParam}` : ""}{trocaProduto2Param ? " (1º)" : ""}</p>
            {trocaNum1 > 0 && <p className="text-green-600 font-bold">Avaliacao: R$ {fmt(trocaNum1)}</p>}
            {trocaCond && <p className="text-[#86868B] text-xs">{trocaCond}</p>}
            {trocaCaixaParam && (
              <span className={`inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${trocaCaixaParam === "1" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                {trocaCaixaParam === "1" ? "📦 Com caixa original" : "📦 Sem caixa original"}
              </span>
            )}
          </div>
          {trocaProduto2Param && (
            <div className="pt-2 border-t border-green-200">
              <p className="text-[#1D1D1F] font-semibold">{trocaProduto2Param}{trocaCor2Param ? ` — ${trocaCor2Param}` : ""} (2º)</p>
              {trocaNum2 > 0 && <p className="text-green-600 font-bold">Avaliacao: R$ {fmt(trocaNum2)}</p>}
              {trocaCond2Param && <p className="text-[#86868B] text-xs">{trocaCond2Param}</p>}
              {trocaCaixa2Param && (
                <span className={`inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${trocaCaixa2Param === "1" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  {trocaCaixa2Param === "1" ? "📦 Com caixa original" : "📦 Sem caixa original"}
                </span>
              )}
            </div>
          )}
          {preco > 0 && descontoParam > 0 && <p className="text-blue-500 font-semibold text-sm pt-2 border-t border-green-200">Desconto: - R$ {fmt(descontoParam)}</p>}
          {preco > 0 && <p className={`text-[#E8740E] font-bold text-lg ${descontoParam > 0 ? "" : "pt-2 border-t border-green-200"}`}>{trocaNum > 0 ? "Diferenca a pagar" : descontoParam > 0 ? "Total com desconto" : "Total"}: R$ {fmt(valorBase)}</p>}
        </div>
      )}

      {/* Badge: pagamento já efetuado via Mercado Pago */}
      {pagamentoPagoParam === "mp" && (
        <div className="mx-4 mt-3 bg-green-50 rounded-xl p-4 shadow-sm border border-green-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-green-600 font-bold text-sm">&#x2705; Pagamento aprovado via Mercado Pago</span>
          </div>
          <p className="text-[#1D1D1F] text-sm">
            Para finalizar, preencha seus dados e endereço de entrega abaixo.
          </p>
          {mpPaymentId && (
            <p className="text-[#86868B] text-xs mt-1">
              ID do pagamento: <span className="font-mono">{mpPaymentId}</span>
            </p>
          )}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="mx-4 mt-4 mb-8 space-y-3">
        {/* Honeypot anti-bot — invisível pra humanos (off-screen + aria-hidden).
            Bots que fazem scraping preenchem todos os inputs; se vier com valor,
            o backend descarta via checkHoneypot() retornando 200 fake. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "-9999px",
            top: "-9999px",
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
          }}
        >
          <label htmlFor="website">Website (não preencher)</label>
          <input
            id="website"
            type="text"
            name="website"
            autoComplete="off"
            tabIndex={-1}
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        {/* Dados Pessoais */}
        <div className={cardCls}>
          <p className={sectionTitle}>{pessoa === "PJ" ? "Dados da Empresa" : "Dados Pessoais"}</p>

          {/* Toggle PF / PJ */}
          <div className="flex gap-2">
            {(["PF", "PJ"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPessoa(p)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors border-2 ${
                  pessoa === p
                    ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]"
                    : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"
                }`}
              >
                {p === "PF" ? "Pessoa Física" : "Pessoa Jurídica"}
              </button>
            ))}
          </div>

          <div>
            <label className={labelCls}>{pessoa === "PJ" ? "Razão Social *" : "Nome Completo *"}</label>
            <input
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={pessoa === "PJ" ? "Nome da empresa" : "Seu nome completo"}
              className={inputCls}
            />
          </div>
          {pessoa === "PJ" ? (
            <>
              <div>
                <label className={labelCls}>CNPJ *</label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  value={cnpj}
                  onChange={(e) => setCnpj(maskCNPJ(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  className={inputCls}
                />
              </div>
              {/* Inscricao Estadual — pergunta obrigatoria. Empresa tem IE ou eh isenta. */}
              <div>
                <label className={labelCls}>Inscrição Estadual *</label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => { setIeStatus("TEM"); }}
                    className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${ieStatus === "TEM" ? "bg-[#E8740E] text-white border-[#E8740E]" : "bg-white text-[#1D1D1F] border-[#D2D2D7] hover:border-[#E8740E]"}`}
                  >
                    Tem IE
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIeStatus("ISENTO"); setIe(""); }}
                    className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${ieStatus === "ISENTO" ? "bg-[#E8740E] text-white border-[#E8740E]" : "bg-white text-[#1D1D1F] border-[#D2D2D7] hover:border-[#E8740E]"}`}
                  >
                    Isento
                  </button>
                </div>
                {ieStatus === "TEM" && (
                  <input
                    type="text"
                    required
                    value={ie}
                    onChange={(e) => setIe(e.target.value.replace(/[^0-9.\-/\s]/g, ""))}
                    placeholder="Número da Inscrição Estadual"
                    className={inputCls}
                  />
                )}
                {ieStatus === null && (
                  <p className="text-[11px] text-red-500 mt-1">Responda se a empresa tem ou é isenta de Inscrição Estadual.</p>
                )}
              </div>
            </>
          ) : (
            <div>
              <label className={labelCls}>CPF *</label>
              <input
                type="text"
                required
                inputMode="numeric"
                value={cpf}
                onChange={(e) => setCpf(maskCPF(e.target.value))}
                placeholder="000.000.000-00"
                className={inputCls}
              />
            </div>
          )}
          <div>
            <label className={labelCls}>E-mail *</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={pessoa === "PJ" ? "financeiro@empresa.com" : "seu@email.com"} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Telefone *</label>
            <input type="text" required inputMode="numeric" value={telefone} onChange={(e) => setTelefone(maskPhone(e.target.value))} placeholder="(21) 99999-9999" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Instagram (opcional)</label>
            <input type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@seuinstagram" className={inputCls} />
          </div>
        </div>

        {/* Endereco */}
        <div className={cardCls}>
          <p className={sectionTitle}>Endereco</p>
          <div>
            <label className={labelCls}>CEP *</label>
            <div className="relative">
              <input type="text" required inputMode="numeric" value={cep} onChange={(e) => setCep(maskCEP(e.target.value))} placeholder="00000-000" className={inputCls} />
              {cepLoading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868B] text-sm">Buscando...</span>}
            </div>
            {cepError && <p className="text-red-500 text-xs mt-1">{cepError}</p>}
          </div>
          <div>
            <label className={labelCls}>Endereco (rua) *</label>
            <input type="text" required value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Ex: Rua Pitimbu" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Numero *</label>
              <input type="text" required inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: 10" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Complemento</label>
              <input type="text" value={complemento} onChange={(e) => setComplemento(e.target.value)} placeholder="Apto, bloco..." className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Bairro *</label>
            <input type="text" required value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Bairro" className={inputCls} />
          </div>
        </div>

        {/* Como conheceu */}
        <div className={cardCls}>
          <p className={sectionTitle}>Como nos encontrou?</p>
          <div className="grid grid-cols-3 gap-2">
            {["Anuncio", "Story", "Direct", "WhatsApp", "Indicacao", "Ja sou cliente", "Pesquisa"].map(o => (
              <label key={o} className={`flex items-center justify-center px-2 py-2.5 rounded-lg border-2 cursor-pointer transition-colors text-[12px] font-medium text-center ${origem === o ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                <input type="radio" name="origem" value={o} checked={origem === o} onChange={() => setOrigem(o)} className="sr-only" />
                {o}
              </label>
            ))}
          </div>
        </div>

        {/* Pagamento */}
        <div className={cardCls}>
          <p className={sectionTitle}>Pagamento</p>

          {/* Resumo fechado quando veio do trade-in */}
          {!editPagamento && formaPagamento && (
            <div className="space-y-2">
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 space-y-1.5">
                {/* Quando pagamento já foi efetuado (link / pix / mp), mostra o status.
                    Sem esse bloco a faixa verde ficaria vazia nesses casos porque
                    não temos parcelas/entrada/PIX pra renderizar. */}
                {pagamentoPagoParam === "mp" && entradaPixNum > 0 ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#86868B]">Pagamento 1</span>
                      <span className="font-bold text-green-600 text-right">
                        &#x2705; Link MP
                        {parcelas && (() => {
                          const p = parcOpts.find(o => o.parcelas === parseInt(parcelas));
                          return p ? ` ${p.parcelas}x de R$ ${fmt2(p.valorParcela)}` : "";
                        })()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#86868B]">Pagamento 2</span>
                      <span className="font-bold text-amber-600 text-right">
                        &#x23F3; PIX R$ {fmt(entradaPixNum)} (pendente)
                      </span>
                    </div>
                  </>
                ) : pagamentoPagoParam ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#86868B]">Status</span>
                    <span className="font-bold text-green-600">&#x2705; {formaPagamento}</span>
                  </div>
                ) : null}
                {entradaPixParam && parseFloat(entradaPixParam) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#86868B]">Entrada no PIX</span>
                    <span className="font-bold text-green-600">R$ {fmt(parseFloat(entradaPixParam))}</span>
                  </div>
                )}
                {parcelas && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#86868B]">Parcelado</span>
                    <span className="font-bold text-[#1D1D1F]">
                      {parcelas}x{(() => { const p = parcOpts.find(o => o.parcelas === parseInt(parcelas)); return p ? ` de R$ ${fmt2(p.valorParcela)} (total R$ ${fmt(p.total)})` : ""; })()}
                    </span>
                  </div>
                )}
                {formaPagamento === "PIX" && valorBase > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#86868B]">PIX a vista</span>
                    <span className="font-bold text-green-600">R$ {fmt(valorBase)}</span>
                  </div>
                )}
              </div>
              {/* Esconder edição de pagamento quando veio do link (valores acordados) */}
              {!formaParam && (
                <button type="button" onClick={() => setEditPagamento(true)}
                  className="w-full py-2 rounded-lg text-xs font-medium text-[#E8740E] border border-[#E8740E] bg-white hover:bg-[#FFF5EB] transition-colors">
                  Editar forma de pagamento
                </button>
              )}
            </div>
          )}

          {/* Formulário completo de pagamento */}
          {editPagamento && (<>
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-2">Forma de pagamento *</label>
            <div className="grid grid-cols-2 gap-2">
              {["PIX", "Cartao de Credito", "Debito", "PIX + Cartao"].map(f => (
                <label key={f} className={`flex items-center justify-center px-3 py-3 rounded-lg border-2 cursor-pointer transition-colors text-sm font-medium ${formaPagamento === f ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                  <input type="radio" name="pagamento" value={f} checked={formaPagamento === f} onChange={() => { setFormaPagamento(f); if (!f.includes("Cartao")) setParcelas(""); }} className="sr-only" />
                  {f}
                </label>
              ))}
            </div>
          </div>

          {/* PIX price display */}
          {formaPagamento === "PIX" && valorBase > 0 && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
              <p className="text-xs text-[#86868B]">Valor no PIX</p>
              <p className="text-green-600 font-bold text-2xl">R$ {fmt(valorBase)}</p>
            </div>
          )}

          {/* Campo entrada PIX quando "PIX + Cartao" selecionado */}
          {formaPagamento === "PIX + Cartao" && (
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Valor de entrada no PIX (R$)</label>
              <input
                type="text"
                inputMode="numeric"
                value={entradaPixManual}
                onChange={e => { setEntradaPixManual(e.target.value.replace(/\D/g, "")); setParcelas(""); }}
                placeholder="Ex: 1000"
                className={inputCls}
              />
              {entradaPixNum > 0 && valorParcelar > 0 && (
                <p className="text-xs text-green-700 mt-1 font-medium">
                  Entrada PIX: R$ {fmt(entradaPixNum)} — restante no cartão: R$ {fmt(valorParcelar)}
                </p>
              )}
            </div>
          )}

          {/* Installment grid */}
          {formaPagamento.includes("Cartao") && (valorParcelar > 0 || (formaPagamento === "PIX + Cartao" && entradaPixNum === 0)) && (
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] mb-2">
                {formaPagamento === "PIX + Cartao" && entradaPixNum > 0
                  ? `Parcelamento do restante (R$ ${fmt(valorParcelar)})`
                  : "Escolha o parcelamento"}
              </label>
              {parcOpts.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {parcOpts.filter(o => [1,2,3,4,5,6,7,8,9,10,11,12,15,18,21].includes(o.parcelas)).map(o => (
                    <label key={o.parcelas} className={`flex flex-col items-center py-2.5 px-2 rounded-lg border-2 cursor-pointer transition-colors ${parcelas === String(o.parcelas) ? "border-[#E8740E] bg-[#FFF5EB]" : "border-[#D2D2D7] bg-[#F5F5F7]"}`}>
                      <input type="radio" name="parcelas" value={o.parcelas} checked={parcelas === String(o.parcelas)} onChange={() => setParcelas(String(o.parcelas))} className="sr-only" />
                      <span className={`text-xs font-bold ${parcelas === String(o.parcelas) ? "text-[#E8740E]" : "text-[#1D1D1F]"}`}>{o.parcelas}x</span>
                      <span className={`text-[11px] font-semibold ${parcelas === String(o.parcelas) ? "text-[#E8740E]" : "text-[#6E6E73]"}`}>R$ {fmt2(o.valorParcela)}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-1.5">
                  {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21].map(n => (
                    <label key={n} className={`flex items-center justify-center py-2 rounded-lg border-2 cursor-pointer transition-colors text-xs font-bold ${parcelas === String(n) ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                      <input type="radio" name="parcelas" value={n} checked={parcelas === String(n)} onChange={() => setParcelas(String(n))} className="sr-only" />
                      {n}x
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          </>)}
        </div>

        {/* Troca */}
        {!isFromTradeIn && (
          <div className={cardCls}>
            <p className={sectionTitle}>Troca</p>
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] mb-2">Voce vai dar algum produto na troca?</label>
              <div className="flex gap-3">
                <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${temTroca === false ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                  <input type="radio" name="troca" checked={temTroca === false} onChange={() => { setTemTroca(false); setDescTroca(""); }} className="sr-only" />
                  <span className="font-medium">Nao</span>
                </label>
                <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${temTroca === true ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                  <input type="radio" name="troca" checked={temTroca === true} onChange={() => setTemTroca(true)} className="sr-only" />
                  <span className="font-medium">Sim</span>
                </label>
              </div>
              {temTroca && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Descreva o produto *</label>
                  <textarea required value={descTroca} onChange={(e) => setDescTroca(e.target.value)}
                    placeholder="Ex: iPhone 15 Pro Max 256GB, bateria 90%, sem marcas de uso" rows={3}
                    className={`${inputCls} resize-none`} />
                </div>
              )}

            </div>
          </div>
        )}

        {/* Prints da troca — card independente, aparece tanto no fluxo do simulador
            quanto quando o cliente marca troca manualmente */}
        {temTroca && shortCode && (() => {
          // Texto do titulo/instrucao muda conforme o tipo de aparelho:
          //   iPhone → "Nº de Série e IMEI" (pede ambos)
          //   iPad/Watch/MacBook → "Nº de Série" (sem IMEI)
          //   Mix (iPhone + iPad na mesma troca) → "Nº de Série" no geral,
          //   IMEI so aparece pro iPhone na lista de slots
          const algumTemImei = aparelho1TemImei || (temSegundoAparelho && aparelho2TemImei);
          const tituloCard = algumTemImei
            ? "📸 Nº de Série e IMEI do seu aparelho (obrigatório)"
            : "📸 Nº de Série do seu aparelho (obrigatório)";
          // Instrucao: especifica localizacao por tipo de aparelho. Se mix,
          // usa genérico.
          const instrucaoPath = (() => {
            const tipo1 = aparelho1TemImei ? "iPhone" : detectarTipoAparelho(trocaProdutoParam);
            const tipo2 = temSegundoAparelho
              ? (aparelho2TemImei ? "iPhone" : detectarTipoAparelho(trocaProduto2Param))
              : tipo1;
            // Ajustes > Geral > Sobre funciona em iPhone/iPad/iPod. Watch/Mac tem path diferente.
            if (tipo1 === tipo2) {
              if (tipo1 === "Apple Watch") return "No seu Apple Watch, vá em **Ajustes → Geral → Sobre**";
              if (tipo1 === "MacBook") return "No seu MacBook, vá em **Menu Apple () → Sobre este Mac**";
              return "No seu aparelho, vá em **Ajustes → Geral → Sobre**";
            }
            return "Em cada aparelho, acesse **Ajustes → Geral → Sobre** (no Mac: **Menu Apple → Sobre este Mac**)";
          })();
          return (
          <div className={cardCls}>
            <p className={sectionTitle}>{tituloCard}</p>
            <div id="prints-troca" className="p-4 rounded-xl bg-amber-50 border-2 border-amber-300 transition-all">
              <p className="text-xs text-[#6E6E73] mb-3">
                {instrucaoPath.split("**").map((parte, i) =>
                  i % 2 === 1 ? <strong key={i}>{parte}</strong> : <span key={i}>{parte}</span>,
                )}
                {" "}e tire {algumTemImei ? <strong>os prints pedidos</strong> : <strong>1 print</strong>}:
                {algumTemImei
                  ? <> mostrando o <strong>Nº de Série</strong>{algumTemImei ? <> e, se for iPhone, o <strong>IMEI</strong></> : null}.</>
                  : <> mostrando o <strong>Nº de Série</strong>.</>}
                {" "}Nosso sistema lê o número automaticamente — você só precisa anexar.
              </p>

              {/* Explicação do POR QUE pedimos essa info — passa segurança ao cliente */}
              <div className="mb-4 p-3 rounded-lg bg-white border border-amber-200">
                <p className="text-xs font-semibold text-[#1D1D1F] mb-1.5">🔒 Por que pedimos essas informações?</p>
                <ul className="text-[11px] text-[#6E6E73] space-y-1 list-none">
                  <li>• <strong>Proteção mútua:</strong> registramos a procedência do aparelho de forma oficial, protegendo você e a nossa loja</li>
                  <li>• <strong>Sem erros de digitação:</strong> o print garante que o Nº de Série e IMEI fiquem corretos no contrato</li>
                  <li>• <strong>Agiliza a entrega:</strong> chegamos com o contrato pronto, sem precisar ficar anotando dados na hora</li>
                  <li>• <strong>Seus dados estão seguros:</strong> usados só pra formalizar a troca e arquivados com segurança</li>
                </ul>
              </div>

              {([
                { tipo: "serial", aparelho: 1, label: `Nº de Série${temSegundoAparelho ? " (aparelho 1)" : ""}` },
                // IMEI so aparece pra iPhone — iPad/Watch/MacBook nao tem
                ...(aparelho1TemImei ? [
                  { tipo: "imei", aparelho: 1, label: `IMEI${temSegundoAparelho ? " (aparelho 1)" : ""}` },
                ] : []),
                ...(temSegundoAparelho ? [
                  { tipo: "serial", aparelho: 2, label: "Nº de Série (aparelho 2)" } as PrintSlot,
                  ...(aparelho2TemImei ? [{ tipo: "imei", aparelho: 2, label: "IMEI (aparelho 2)" } as PrintSlot] : []),
                ] : []),
              ] as PrintSlot[]).map((slot) => {
                const key = `${slot.tipo}${slot.aparelho}`;
                const url = printsUrls[key];
                const uploading = printsUploading[key];
                const erro = printsErro[key];
                const ocr = ocrStatus[key] || { state: "idle" };
                const isManual = manualMode[key] === true;
                const textValue =
                  slot.aparelho === 1
                    ? (slot.tipo === "serial" ? trocaSerial1 : trocaImei1)
                    : (slot.tipo === "serial" ? trocaSerial2 : trocaImei2);
                const isImei = slot.tipo === "imei";
                const placeholder = isImei ? "Digite os 15 dígitos do IMEI" : "Digite o Nº de Série";
                const tipoLabel = isImei ? "IMEI" : "Nº de Série";
                return (
                  <div key={key} className="mb-3 last:mb-0">
                    <label className="block text-xs font-medium text-[#1D1D1F] mb-1.5">{slot.label} *</label>
                    {url ? (
                      <div className="flex items-center gap-2 mb-2">
                        <img src={url} alt={slot.label} className="w-14 h-14 rounded-lg object-cover border border-[#D2D2D7]" />
                        <span className="text-xs text-green-600 font-semibold">✓ Print enviado</span>
                        <button
                          type="button"
                          onClick={() => {
                            setPrintsUrls((p) => { const n = { ...p }; delete n[key]; return n; });
                            setOcrStatus((p) => ({ ...p, [key]: { state: "idle" } }));
                            setManualMode((p) => ({ ...p, [key]: false }));
                            setTextBySlot(slot, "");
                          }}
                          className="text-xs text-red-600 hover:underline ml-auto"
                        >
                          Trocar
                        </button>
                      </div>
                    ) : (
                      <label className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${uploading ? "border-[#D2D2D7] bg-[#F5F5F7]" : "border-[#E8740E] bg-white hover:bg-[#FFF5EB] active:bg-[#FFF5EB]"}`}>
                        <input
                          id={`print-input-${key}`}
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          disabled={uploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadPrint(slot, f);
                          }}
                        />
                        <span className="text-sm text-[#E8740E] font-semibold">
                          {uploading
                            ? (ocr.state === "reading" ? "⏳ Lendo número..." : "⏳ Enviando...")
                            : "📤 Anexar print"}
                        </span>
                      </label>
                    )}

                    {/* Resultado do OCR (após upload) */}
                    {url && ocr.state === "ok" && !isManual && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-300">
                        <span className="text-xs text-green-800">
                          ✓ <strong>{tipoLabel} detectado:</strong> <span className="font-mono">{textValue}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setManualMode((p) => ({ ...p, [key]: true }))}
                          className="text-[11px] text-[#6E6E73] hover:text-[#E8740E] hover:underline ml-auto"
                        >
                          Corrigir
                        </button>
                      </div>
                    )}
                    {url && ocr.state === "fail" && (
                      <div className="text-xs text-amber-700 mb-1.5">
                        <p>⚠️ Não consegui ler o {tipoLabel} do print. Digite manualmente abaixo.</p>
                        {ocr.error && (
                          <p className="text-[10px] text-amber-600 mt-0.5 opacity-80 font-mono break-all">
                            (debug: {ocr.error})
                          </p>
                        )}
                      </div>
                    )}
                    {url && isManual && (
                      <input
                        type="text"
                        inputMode={isImei ? "numeric" : "text"}
                        autoComplete="off"
                        value={textValue}
                        onChange={(e) => setTextBySlot(slot, e.target.value)}
                        placeholder={placeholder}
                        maxLength={isImei ? 20 : 30}
                        className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm text-[#1D1D1F] bg-white focus:outline-none focus:border-[#E8740E]"
                      />
                    )}

                    {erro && <p className="text-xs text-red-600 mt-1">{erro}</p>}
                  </div>
                );
              })}

              {/* Aviso sobre o Termo de Procedência (aparece quando todos os prints + textos foram preenchidos) */}
              {(() => {
                // IMEI so conta se o aparelho tem IMEI (iPhone). Sem isso,
                // iPad/Watch/MacBook nunca mostrariam o aviso de conclusao.
                const textosOk1 = trocaSerial1.trim().length >= 6
                  && (!aparelho1TemImei || trocaImei1.replace(/\D/g, "").length >= 14);
                const textosOk2 = !temSegundoAparelho
                  || (trocaSerial2.trim().length >= 6
                      && (!aparelho2TemImei || trocaImei2.replace(/\D/g, "").length >= 14));
                const printsOk1 = !!printsUrls.serial1 && (!aparelho1TemImei || !!printsUrls.imei1);
                const printsOk2 = !temSegundoAparelho
                  || (!!printsUrls.serial2 && (!aparelho2TemImei || !!printsUrls.imei2));
                const todosEnviados = printsOk1 && printsOk2 && textosOk1 && textosOk2;
                if (!todosEnviados) return null;
                return (
                  <div className="mt-4 p-3 rounded-lg bg-green-50 border-2 border-green-300">
                    <p className="text-xs font-bold text-green-800 mb-2">✅ Prints recebidos! Próximo passo:</p>
                    <p className="text-[11px] text-[#1D1D1F] leading-relaxed mb-2">
                      Como você vai dar um produto usado na troca, você receberá no seu <strong>WhatsApp</strong> um link
                      do <strong>Termo de Procedência</strong> — um documento onde você declara ser o proprietário legítimo
                      do aparelho que está nos entregando.
                    </p>
                    <p className="text-[11px] text-[#1D1D1F] leading-relaxed">
                      A assinatura é <strong>digital</strong> e leva menos de 1 minuto: basta clicar no link,
                      digitar o código SMS que vai chegar no seu celular e tirar uma selfie rápida. Tem
                      validade jurídica completa e pode ser assinado tranquilamente enquanto aguarda o motoboy chegar.
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
          );
        })()}

        {/* Entrega */}
        <div className={cardCls}>
          <p className={sectionTitle}>Entrega</p>
          {local === "Correios" ? (
          <div className="py-3 px-4 rounded-lg bg-[#FFF5EB] border border-[#E8740E]/30 text-sm text-[#6E6E73]">
            📦 Seu pedido será enviado pelos <strong>Correios</strong>. Nossa equipe entrará em contato para confirmar o endereço e o código de rastreio.
          </div>
          ) : (
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-2">Como deseja receber? *</label>
            <div className="flex gap-3">
              <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 rounded-lg border-2 cursor-pointer transition-colors ${local === "Loja" ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                <input type="radio" name="local" value="Loja" checked={local === "Loja"} onChange={() => setLocal("Loja")} className="sr-only" />
                <span className="text-lg">&#x1F3EA;</span>
                <span className="font-medium text-sm">Retirar na Loja</span>
              </label>
              <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 rounded-lg border-2 cursor-pointer transition-colors ${local === "Entrega" ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                <input type="radio" name="local" value="Entrega" checked={local === "Entrega"} onChange={() => setLocal("Entrega")} className="sr-only" />
                <span className="text-lg">&#x1F69A;</span>
                <span className="font-medium text-sm">Solicitar Entrega</span>
              </label>
            </div>
          </div>
          )}

          {/* Data — janela curta (hoje, +1, +2 calendário) com domingo bloqueado.
              Bounds computadas em lib/date-utils.getAgendamentoBounds.
              Obs: min/max do <input type="date"> são apenas dica visual em
              alguns browsers — o clamp abaixo garante a regra no onChange. */}
          {local !== "Correios" && (<div>
            <label className={labelCls}>Data *</label>
            <input type="date" required value={dataEntrega}
              onChange={(e) => {
                const raw = e.target.value;
                if (!raw) return;
                // Clamp: fora da janela → volta pro min/max mais próximo.
                let iso = raw;
                if (iso < agendamentoBounds.min) iso = agendamentoBounds.min;
                else if (iso > agendamentoBounds.max) iso = agendamentoBounds.max;
                // Domingo: pula para a próxima segunda automaticamente.
                const d = new Date(iso + "T12:00:00");
                if (d.getDay() === 0) {
                  d.setDate(d.getDate() + 1);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, "0");
                  const day = String(d.getDate()).padStart(2, "0");
                  iso = `${y}-${m}-${day}`;
                }
                if (iso !== raw) {
                  alert(encomendaParam
                    ? "Encomenda: agendamento so pode ser hoje ou amanha (orcamento expira em 24h)."
                    : "Agendamento disponivel apenas para hoje, amanha ou depois de amanha (sem domingo).");
                }
                setDataEntrega(iso);
              }}
              min={agendamentoBounds.min}
              max={agendamentoBounds.max}
              className={inputCls} />
            <p className={`text-[11px] mt-1 ${encomendaParam ? "text-blue-700 font-medium" : "text-[#86868B]"}`}>
              {encomendaParam
                ? "📦 Encomenda: agendamento até amanhã (orçamento válido por 24h)."
                : "Agendamento disponivel para hoje, amanha ou depois de amanha. Domingo indisponivel."}
            </p>
          </div>)}

          {/* Horário — dinâmico conforme tipo + dia da semana (não mostra pra Correios) */}
          {local !== "Correios" && (<div>
            <label className={labelCls}>Horario *</label>
            {horarioParam === "LOGISTICA" ? (
              <div className="py-3 px-4 rounded-lg bg-[#FFF5EB] border border-[#E8740E]/30 text-sm text-[#86868B]">
                🚚 O horário da sua entrega será definido pela nossa equipe de logística. Entraremos em contato para confirmar.
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {horariosDisponiveis.map(h => (
                  <button key={h} type="button" onClick={() => setHorario(h)}
                    className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${horario === h ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                    {h}
                  </button>
                ))}
              </div>
            )}
          </div>)}

          {local === "Entrega" && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-[#1D1D1F] mb-2">Local de entrega *</label>
              {/* "Outro" só aparece com localParam=outro (exceção liberada pelo operador).
                  Encomenda nao aceita Shopping — operador combina entrega em residencia
                  ou outro local quando o produto chegar. */}
              <div className={`grid gap-3 ${(() => {
                const c = 1 + (encomendaParam ? 0 : 1) + (localOutroHabilitado || encomendaParam ? 1 : 0);
                return c === 1 ? "grid-cols-1" : c === 2 ? "grid-cols-2" : "grid-cols-3";
              })()}`}>
                <label className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${tipoEntrega === "Residencia" ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                  <input type="radio" name="tipoEntrega" value="Residencia" checked={tipoEntrega === "Residencia"} onChange={() => { setTipoEntrega("Residencia"); setShopping(""); }} className="sr-only" />
                  &#x1F3E0; <span className="font-medium text-sm">Residência</span>
                </label>
                {!encomendaParam && (
                  <label className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${tipoEntrega === "Shopping" ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                    <input type="radio" name="tipoEntrega" value="Shopping" checked={tipoEntrega === "Shopping"} onChange={() => setTipoEntrega("Shopping")} className="sr-only" />
                    &#x1F3EC; <span className="font-medium text-sm">Shopping</span>
                  </label>
                )}
                {(localOutroHabilitado || encomendaParam) && (
                  <label className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${tipoEntrega === "Outro" ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                    <input type="radio" name="tipoEntrega" value="Outro" checked={tipoEntrega === "Outro"} onChange={() => setTipoEntrega("Outro")} className="sr-only" />
                    &#x1F4CD; <span className="font-medium text-sm">Outro local</span>
                  </label>
                )}
              </div>
              {!pagamentoPagoParam && (
                <div className={`p-3 rounded-lg text-sm font-semibold text-center ${(encomendaParam || tipoEntrega === "Residencia") ? "bg-yellow-50 border border-yellow-200 text-yellow-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
                  {(encomendaParam || tipoEntrega === "Residencia") ? "⚠️ PAGAMENTO ANTECIPADO" : "✅ PAGAR NA ENTREGA"}
                </div>
              )}
              {tipoEntrega === "Shopping" && (
                <div>
                  <label className={labelCls}>Qual shopping? *</label>
                  <input type="text" required value={shopping} onChange={(e) => setShopping(e.target.value)} placeholder="Ex: BarraShopping, Village Mall..." className={inputCls} />
                </div>
              )}
              {tipoEntrega === "Outro" && (
                <div>
                  <label className={labelCls}>Local combinado *</label>
                  <input type="text" required value={shopping} onChange={(e) => setShopping(e.target.value)} placeholder="Ex: Estação do metrô, escritório..." className={inputCls} />
                  <p className="text-[11px] text-[#86868B] mt-1 italic">Entrega em local personalizado previamente combinado com a equipe.</p>
                </div>
              )}
              {!pagamentoPagoParam && tipoEntrega !== "Outro" && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs leading-relaxed">
                  <p><strong>⚠️ Taxa de deslocamento:</strong> Caso a compra nao seja concluida no ato da entrega (falta de limite, divergencia, etc), sera cobrada uma taxa de deslocamento.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {local === "Entrega" && !pagamentoPagoParam && (
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" required className="mt-1 accent-[#E8740E] w-4 h-4" />
            <span className="text-xs text-[#6E6E73] leading-relaxed">
              Estou ciente de que, caso a entrega nao seja concluida por falta de limite, divergencia de valores ou situacao diferente do combinado, sera cobrada uma <strong className="text-red-600">taxa de deslocamento</strong>.
            </span>
          </label>
        )}

        {pagarMpHabilitado ? (
          <>
            {/* Fluxo INVERTIDO: cliente paga MP agora (com tudo preenchido). */}
            {/* Ao clicar, o servidor salva o formulário + cria preference MP    */}
            {/* e redireciona pro checkout. Na aprovação, o webhook MP envia     */}
            {/* o pedido completo pro grupo automaticamente.                     */}
            <button
              type="button"
              onClick={handlePagarMp}
              disabled={loadingMp}
              className="w-full py-3.5 bg-[#009EE3] text-white font-bold text-lg rounded-xl shadow-sm hover:bg-[#008ECC] active:bg-[#0080B8] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingMp ? (
                <>
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                    <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" className="opacity-75" />
                  </svg>
                  Gerando link...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current" aria-hidden>
                    <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
                  </svg>
                  Pagar com Mercado Pago
                </>
              )}
            </button>
            {erroMp && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {erroMp}
              </div>
            )}
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#D2D2D7]" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 bg-[#F5F5F7] text-xs text-[#86868B]">ou</span>
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-white border-2 border-[#25D366] text-[#1DA851] font-semibold text-base rounded-xl shadow-sm hover:bg-[#F0FDF4] active:bg-[#DCFCE7] transition-colors flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Combinar outro pagamento via WhatsApp
            </button>
            <p className="text-center text-xs text-[#86868B]">
              Ao pagar pelo Mercado Pago, seu pedido é confirmado automaticamente.
            </p>
          </>
        ) : (
          <>
            <button type="submit"
              className="w-full py-3.5 bg-[#25D366] text-white font-bold text-lg rounded-xl shadow-sm hover:bg-[#20BD5A] active:bg-[#1DA851] transition-colors flex items-center justify-center gap-2">
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Enviar pelo WhatsApp
            </button>
            <p className="text-center text-xs text-[#86868B]">Ao enviar, seus dados serao compartilhados com o vendedor via WhatsApp.</p>
          </>
        )}
      </form>
    </div>
  );
}

export default function CompraPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center"><p className="text-[#86868B]">Carregando...</p></div>}>
      <CompraForm />
    </Suspense>
  );
}
