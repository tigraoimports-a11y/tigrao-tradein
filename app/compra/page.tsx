"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo, Suspense } from "react";
import { WHATSAPP_FORMULARIO } from "@/lib/whatsapp-config";
import { corParaPT } from "@/lib/cor-pt";

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

  // URL params
  const produtoParam = searchParams.get("produto") || searchParams.get("p") || "";
  const precoParam = searchParams.get("preco") || searchParams.get("v") || "";
  const vendedor = searchParams.get("vendedor") || "";
  const whatsapp = searchParams.get("whatsapp") || "";
  const shortCode = searchParams.get("short") || "";

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
  const formaParam = pagamentoPagoStr || FORMA_MAP[formaRaw] || formaRaw;
  const parcelasParam = searchParams.get("parcelas") || "";
  const entradaPixParam = searchParams.get("entrada_pix") || "";
  const descontoParam = parseFloat(searchParams.get("desconto") || "0") || 0;

  // Local de entrega (vindo do gerador de link)
  const localParam = searchParams.get("local") || "";
  const shoppingParam = searchParams.get("shopping") || "";
  const horarioParam = searchParams.get("horario") || "";
  const dataEntregaParam = searchParams.get("data_entrega") || "";

  // Produtos adicionais (vindo do gerador de link)
  const produtosExtras: string[] = [];
  for (let i = 2; i <= 10; i++) {
    const p = searchParams.get(`produto${i}`);
    if (p) produtosExtras.push(p);
    else break;
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

  // Fetch products + config
  useEffect(() => {
    Promise.all([
      fetch("/api/produtos").then(r => r.json()).catch(() => ({ data: [] })),
      fetch("/api/produtos-disponiveis").then(r => r.json()).catch(() => ({ categorias: {} })),
      fetch("/api/tradein-config").then(r => r.json()).catch(() => ({ data: null })),
    ]).then(([prodRes, catRes, cfgRes]) => {
      // /api/produtos retorna array direto (não {data: []})
      if (Array.isArray(prodRes)) setAllProducts(prodRes);
      else if (prodRes.data) setAllProducts(prodRes.data);
      if (catRes.categorias) setCatalogo(catRes.categorias);
      if (cfgRes.data?.whatsapp_formularios) setWhatsappFormConfig(cfgRes.data.whatsapp_formularios);
      if (cfgRes.data?.whatsapp_principal) setWhatsappPrincipalConfig(cfgRes.data.whatsapp_principal);
    });
  }, []);

  // Auto-fill price when product selected
  useEffect(() => {
    if (!produtoInput || precoParam) return;
    const match = allProducts.find(p => `${p.modelo} ${p.armazenamento}` === produtoInput || p.modelo === produtoInput);
    if (match) setPrecoAuto(match.precoPix);
  }, [produtoInput, allProducts, precoParam]);

  // Fetch cores disponíveis do estoque para o produto selecionado
  useEffect(() => {
    const prod = produtoInput || produtoParam;
    if (!prod) { setCoresDisponiveis([]); return; }
    // Buscar no catálogo já carregado
    const cores = new Set<string>();
    for (const items of Object.values(catalogo)) {
      for (const item of items) {
        if (item.cor && item.produto.startsWith(prod)) {
          cores.add(item.cor.toUpperCase());
        }
      }
    }
    if (cores.size > 0) { setCoresDisponiveis([...cores].sort()); return; }
    // Fallback: buscar todas as cores do catálogo cujo nome base corresponde
    const prodLower = prod.toLowerCase();
    for (const items of Object.values(catalogo)) {
      for (const item of items) {
        if (item.cor) {
          const baseName = item.produto.replace(/ - .+$/, "").toLowerCase();
          if (baseName === prodLower || prodLower.includes(baseName) || baseName.includes(prodLower)) {
            cores.add(item.cor.toUpperCase());
          }
        }
      }
    }
    setCoresDisponiveis([...cores].sort());
  }, [produtoInput, produtoParam, catalogo]);

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

  const preco = precoParam ? parseInt(precoParam) : precoAuto;

  // Form state — aceita pre-preenchimento vindo do gerar-link
  const [pessoa, setPessoa] = useState<"PF" | "PJ">("PF");
  const [nome, setNome] = useState(nomeParam);
  const [cpf, setCpf] = useState(cpfParam ? maskCPF(cpfParam) : "");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState(emailParam);
  const [telefone, setTelefone] = useState(whatsappClienteParam ? maskPhone(whatsappClienteParam) : "");
  const [cep, setCep] = useState(cepParam ? maskCEP(cepParam) : "");
  const [endereco, setEndereco] = useState(enderecoParam);
  const [numero, setNumero] = useState(numeroParam);
  const [complemento, setComplemento] = useState(complementoParam);
  const [bairro, setBairro] = useState(bairroParam);
  const [horario, setHorario] = useState(horarioParam);
  const [horariosDisponiveis, setHorariosDisponiveis] = useState<string[]>(["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]);
  const [local, setLocal] = useState<"Loja" | "Entrega" | "Correios">(localParam === "correios" ? "Correios" : localParam === "shopping" || localParam === "residencia" ? "Entrega" : localParam === "loja" ? "Loja" : "Loja");
  const [tipoEntrega, setTipoEntrega] = useState<"Shopping" | "Residencia">(localParam === "shopping" ? "Shopping" : "Residencia");
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

  // Installment calculations
  const descontoNum = parseFloat(String(descontoParam)) || 0;
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

    if (!formaPagamento) {
      alert("Selecione a forma de pagamento antes de enviar.");
      return;
    }

    if (formaPagamento.includes("Cartao") && !parcelas && !pagamentoPagoParam) {
      alert("Selecione o numero de parcelas antes de enviar.");
      return;
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
      : "Entrega - Residencia";

    // Valor base para cálculos (usa precoFinal definido acima)
    const descontoFinal = parseFloat(String(descontoParam)) || 0;
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

    // Forma de pagamento com detalhes completos
    let pagStr = formaPagamento;
    if (formaPagamento === "Link de Pagamento" && parcelas && parcelasCalc) {
      pagStr = `Link de Pagamento — ${parcelasCalc.n}x de R$ ${fmt2(parcelasCalc.vp)} (total R$ ${fmt2(parcelasCalc.total)})`;
    } else if (formaPagamento.includes("Cartao") && parcelas && parcelasCalc) {
      if (entradaFinal > 0) {
        pagStr = `Entrada PIX R$ ${fmt(entradaFinal)} + ${parcelasCalc.n}x de R$ ${fmt2(parcelasCalc.vp)} no cartao (total cartao: R$ ${fmt2(parcelasCalc.total)})`;
      } else {
        pagStr = `R$ ${fmt2(parcelasCalc.total)} em ${parcelasCalc.n}x de R$ ${fmt2(parcelasCalc.vp)} no cartao`;
      }
    } else if (formaPagamento === "Link de Pagamento" && parcelas) {
      pagStr = `Link de Pagamento — ${parcelas}x`;
    } else if (formaPagamento === "PIX") {
      pagStr = `PIX — R$ ${fmt(valorBaseFinal)}`;
    } else if (formaPagamento === "PIX + Cartao" && parcelas && parcelasCalc) {
      pagStr = `Entrada PIX R$ ${fmt(entradaFinal)} + ${parcelasCalc.n}x de R$ ${fmt2(parcelasCalc.vp)} no cartao (total cartao: R$ ${fmt2(parcelasCalc.total)})`;
    } else if (formaPagamento === "Debito") {
      pagStr = `Debito — R$ ${fmt(valorBaseFinal)}`;
    }

    const isTradeInFlow = isFromTradeIn || trocaProduto;
    const enderecoFull = `${endereco}, ${numero}${complemento ? ` - ${complemento}` : ""}`;
    const pagEntrega = pagamentoPagoParam ? "" : local === "Correios" ? "⚠️ PAGAMENTO ANTECIPADO" : local === "Entrega" && tipoEntrega === "Residencia" ? "⚠️ PAGAMENTO ANTECIPADO" : local === "Entrega" ? "✅ PAGAR NA ENTREGA" : "";

    const lines = [
      `Ola, me chamo ${nome}. ${isTradeInFlow ? "Fiz a avaliacao de troca no site e preenchi o formulario de compra." : "Vim pelo formulario de compra!"}`,
      "",
      `*DADOS DA COMPRA -- TigraoImports*`,
      "",
      // Dados pessoais / empresa
      ...(pessoa === "PJ"
        ? [
            `*Tipo:* Pessoa Juridica`,
            `*Razao Social:* ${nome}`,
            `*CNPJ:* ${cnpj}`,
          ]
        : [
            `*Nome completo:* ${nome}`,
            `*CPF:* ${cpf}`,
          ]),
      `*E-mail:* ${email}`,
      `*Telefone:* ${telefone}`,
      ...(instagram ? [`*Instagram:* ${instagram}`] : []),
      `*CEP:* ${cep}`,
      `*Endereco:* ${enderecoFull}`,
      `*Bairro:* ${bairro}`,
      "",
      // Produto e pagamento
      `*Produto:* ${produtoFinal}${corSel ? ` — ${corSel}` : ""}${precoFinal > 0 ? ` — R$ ${fmt(precoFinal)}` : ""}`,
      ...(produtosExtras.map((p, i) => `*Produto ${i + 2}:* ${p}`)),
      ...(descontoParam > 0 ? [`*Desconto:* - R$ ${fmt(descontoParam)}`] : []),
      ...(descontoParam > 0 ? [`*Total final:* R$ ${fmt(valorBaseFinal)}`] : []),
      `*Forma de pagamento:* ${pagStr}`,
      // Detalhes do pagamento MP (quando pago via link MP).
      // Valor pago = valorBaseFinal (preço - desconto - troca).
      // NÃO expomos URL de "comprovante" porque mercadopago.com.br/activities/...
      // só é acessível logado na conta que RECEBEU o pagamento (vendedor),
      // não é público pro cliente.
      ...(pagamentoPagoParam === "mp" && valorBaseFinal > 0
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
      lines.push(temDoisUsados ? `*MEUS APARELHOS NA TROCA:*` : `*MEU APARELHO NA TROCA:*`);
      if (trocaProduto) {
        if (temDoisUsados) lines.push(``, `*Aparelho 1:*`);
        lines.push(`Modelo: ${trocaProduto}`);
        if (trocaCorParam) lines.push(`Cor: ${trocaCorParam}`);
        if (trocaNum1 > 0) lines.push(`Valor avaliado: R$ ${fmt(trocaNum1)}`);
        if (trocaCond) lines.push(`Condicao: ${trocaCond}`);
        if (trocaCaixaParam) lines.push(`Caixa original: ${trocaCaixaParam === "1" ? "Sim" : "Nao"}`);
      } else if (descTroca) {
        lines.push(`Modelo: ${descTroca}`);
      }
      // 2º produto na troca
      if (temDoisUsados) {
        lines.push(``, `*Aparelho 2:*`);
        lines.push(`Modelo: ${trocaProduto2Param}`);
        if (trocaCor2Param) lines.push(`Cor: ${trocaCor2Param}`);
        if (trocaNum2 > 0) lines.push(`Valor avaliado: R$ ${fmt(trocaNum2)}`);
        if (trocaCond2Param) lines.push(`Condicao: ${trocaCond2Param}`);
        if (trocaCaixa2Param) lines.push(`Caixa original: ${trocaCaixa2Param === "1" ? "Sim" : "Nao"}`);
      }
      if (valorBase > 0) { lines.push(""); lines.push(`*Diferenca a pagar: R$ ${fmt(valorBase)}*`); }
    }

    // Vendedor, origem, entrega
    lines.push("");
    if (vendedor) lines.push(`*Vendedor:* ${vendedor}`);
    if (origem) lines.push(`*Como conheceu:* ${origem}`);
    lines.push(`*Horario:* ${horario}`);
    if (dataEntrega) {
      const [y, m, d] = dataEntrega.split("-");
      lines.push(`*Data:* ${d}/${m}/${y}`);
    }
    lines.push(`*Local:* ${localStr}`);
    if (pagEntrega) lines.push(pagEntrega);
    if (local === "Entrega" && !pagamentoPagoParam) {
      lines.push("");
      lines.push("⚠️ *TAXA DE DESLOCAMENTO:* Caso a compra nao seja concluida no ato da entrega (limite, divergencia, etc), sera cobrada taxa de deslocamento. ✅ Cliente ciente.");
    }

    // Entrega NÃO é criada automaticamente — equipe cria manualmente na agenda

    // Se veio de um short link rastreável, devolve os dados preenchidos pro admin (fire-and-forget)
    if (shortCode) {
      const enderecoFullTxt = `${endereco}, ${numero}${complemento ? ` - ${complemento}` : ""}`;
      fetch(`/api/link-compras/${encodeURIComponent(shortCode)}/preenchimento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dados: {
            nome, cpf: pessoa === "PJ" ? "" : cpf, cnpj: pessoa === "PJ" ? cnpj : "", pessoa,
            email, telefone, instagram,
            cep, endereco, numero, complemento, bairro,
            endereco_completo: enderecoFullTxt,
            produto: produtoFinal, cor: corSel, preco: precoFinal,
            forma_pagamento: pagStr,
            local: localStr, horario, data_entrega: dataEntrega,
            vendedor, origem,
          },
        }),
      }).catch(() => {});
    }

    const url = `https://wa.me/${whatsappFinal}?text=${encodeURIComponent(lines.join("\n"))}`;
    window.open(url, "_blank");
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
      {/* Header */}
      <div className="bg-[#E8740E] text-white px-4 py-4 text-center">
        <p className="text-lg font-bold">&#x1F42F; TigraoImports</p>
        <p className="text-sm opacity-90">Formulario de Compra</p>
      </div>

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
            {variantesDoBase.length === 0 && (
              <>
                <p className="text-[#1D1D1F] font-bold text-lg mt-1">{produtoParam}</p>
                {produtosExtras.map((p, i) => (
                  <p key={i} className="text-[#1D1D1F] font-semibold text-base mt-1">{p}</p>
                ))}
                {preco > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[#86868B] text-xs uppercase tracking-wider">Preco de venda</p>
                    <p className="text-[#E8740E] font-bold text-2xl">R$ {fmt(preco)}</p>
                    {descontoParam > 0 && (
                      <p className="text-blue-500 font-semibold text-sm">Desconto: - R$ {fmt(descontoParam)}</p>
                    )}
                    {(trocaNum > 0 || descontoParam > 0) && (
                      <p className="text-green-600 font-semibold text-sm">{trocaNum > 0 ? "Diferenca a pagar" : "Total"}: R$ {fmt(valorBase)}</p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Seleção de cor — cores reais do estoque */}
            {(produtoInput || variantesDoBase.length === 0) && coresDisponiveis.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[#E8E8ED]">
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
                    {(trocaNum > 0 || descontoParam > 0) && <p className="text-green-600 font-semibold text-sm">{trocaNum > 0 ? "Diferenca a pagar" : "Total"}: R$ {fmt(valorBase)}</p>}
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
          {preco > 0 && <p className={`text-[#E8740E] font-bold text-lg ${descontoParam > 0 ? "" : "pt-2 border-t border-green-200"}`}>{trocaNum > 0 ? "Diferenca a pagar" : "Total"}: R$ {fmt(valorBase)}</p>}
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
                {pagamentoPagoParam && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#86868B]">Status</span>
                    <span className="font-bold text-green-600">&#x2705; {formaPagamento}</span>
                  </div>
                )}
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

          {/* Data — seg a sab (não mostra pra Correios) */}
          {local !== "Correios" && (<div>
            <label className={labelCls}>Data *</label>
            <input type="date" required value={dataEntrega}
              onChange={(e) => {
                if (!e.target.value) return;
                const d = new Date(e.target.value + "T12:00:00");
                if (d.getDay() === 0) {
                  // Domingo: pula para a próxima segunda automaticamente
                  d.setDate(d.getDate() + 1);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, "0");
                  const day = String(d.getDate()).padStart(2, "0");
                  setDataEntrega(`${y}-${m}-${day}`);
                  return;
                }
                setDataEntrega(e.target.value);
              }}
              min={(() => {
                const d = new Date();
                d.setDate(d.getDate() + (d.getHours() >= 18 ? 1 : 0));
                while (d.getDay() === 0) d.setDate(d.getDate() + 1);
                // Usar data LOCAL (não UTC) para evitar off-by-one em fusos horários
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, "0");
                const day = String(d.getDate()).padStart(2, "0");
                return `${y}-${m}-${day}`;
              })()}
              className={inputCls} />
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
              <div className="flex gap-3">
                <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${tipoEntrega === "Residencia" ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                  <input type="radio" name="tipoEntrega" value="Residencia" checked={tipoEntrega === "Residencia"} onChange={() => { setTipoEntrega("Residencia"); setShopping(""); }} className="sr-only" />
                  &#x1F3E0; <span className="font-medium">Residencia</span>
                </label>
                <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${tipoEntrega === "Shopping" ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                  <input type="radio" name="tipoEntrega" value="Shopping" checked={tipoEntrega === "Shopping"} onChange={() => setTipoEntrega("Shopping")} className="sr-only" />
                  &#x1F3EC; <span className="font-medium">Shopping</span>
                </label>
              </div>
              {!pagamentoPagoParam && (
                <div className={`p-3 rounded-lg text-sm font-semibold text-center ${tipoEntrega === "Residencia" ? "bg-yellow-50 border border-yellow-200 text-yellow-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
                  {tipoEntrega === "Residencia" ? "⚠️ PAGAMENTO ANTECIPADO" : "✅ PAGAR NA ENTREGA"}
                </div>
              )}
              {tipoEntrega === "Shopping" && (
                <div>
                  <label className={labelCls}>Qual shopping? *</label>
                  <input type="text" required value={shopping} onChange={(e) => setShopping(e.target.value)} placeholder="Ex: BarraShopping, Village Mall..." className={inputCls} />
                </div>
              )}
              {!pagamentoPagoParam && (
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

        <button type="submit"
          className="w-full py-3.5 bg-[#25D366] text-white font-bold text-lg rounded-xl shadow-sm hover:bg-[#20BD5A] active:bg-[#1DA851] transition-colors flex items-center justify-center gap-2">
          <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Enviar pelo WhatsApp
        </button>
        <p className="text-center text-xs text-[#86868B]">Ao enviar, seus dados serao compartilhados com o vendedor via WhatsApp.</p>
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
