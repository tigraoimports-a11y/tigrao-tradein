"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo, Suspense } from "react";

function maskCPF(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return digits.slice(0, 3) + "." + digits.slice(3);
  if (digits.length <= 9)
    return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6);
  return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6, 9) + "-" + digits.slice(9);
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
  categoria?: string;
}

function CompraForm() {
  const searchParams = useSearchParams();

  // URL params
  const produtoParam = searchParams.get("produto") || searchParams.get("p") || "";
  const precoParam = searchParams.get("preco") || searchParams.get("v") || "";
  const vendedor = searchParams.get("vendedor") || "";
  const whatsapp = searchParams.get("whatsapp") || "";

  // Trade-in params (vindos do StepQuote)
  const trocaProdutoParam = searchParams.get("troca_produto") || "";
  const trocaValorParam = searchParams.get("troca_valor") || "";
  const trocaCondParam = searchParams.get("troca_cond") || "";
  const nomeParam = searchParams.get("nome") || "";
  const whatsappClienteParam = searchParams.get("whatsapp_cliente") || "";
  const instagramParam = searchParams.get("instagram") || "";

  // Products from API
  const [allProducts, setAllProducts] = useState<ProdutoAPI[]>([]);
  const [catalogo, setCatalogo] = useState<Record<string, { produto: string; cor: string | null; preco: number | null }[]>>({});
  const [catSel, setCatSel] = useState("");
  const [produtoInput, setProdutoInput] = useState(produtoParam);
  const [precoAuto, setPrecoAuto] = useState(precoParam ? parseInt(precoParam) : 0);

  // Fetch products
  useEffect(() => {
    Promise.all([
      fetch("/api/produtos").then(r => r.json()).catch(() => ({ data: [] })),
      fetch("/api/produtos-disponiveis").then(r => r.json()).catch(() => ({ categorias: {} })),
    ]).then(([prodRes, catRes]) => {
      if (prodRes.data) setAllProducts(prodRes.data);
      if (catRes.categorias) setCatalogo(catRes.categorias);
    });
  }, []);

  // Auto-fill price when product selected
  useEffect(() => {
    if (!produtoInput || precoParam) return;
    const match = allProducts.find(p => `${p.modelo} ${p.armazenamento}` === produtoInput || p.modelo === produtoInput);
    if (match) setPrecoAuto(match.precoPix);
  }, [produtoInput, allProducts, precoParam]);

  const preco = precoParam ? parseInt(precoParam) : precoAuto;

  // Form state
  const [nome, setNome] = useState(nomeParam);
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState(whatsappClienteParam);
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [horario, setHorario] = useState("");
  const [local, setLocal] = useState<"Loja" | "Entrega">("Loja");
  const [tipoEntrega, setTipoEntrega] = useState<"Shopping" | "Residencia">("Residencia");
  const [shopping, setShopping] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [parcelas, setParcelas] = useState("");
  const [origem, setOrigem] = useState("");
  const [instagram, setInstagram] = useState(instagramParam);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState("");

  // Trade-in state
  const [temTroca, setTemTroca] = useState<boolean | null>(trocaProdutoParam ? true : null);
  const [trocaProduto, setTrocaProduto] = useState(trocaProdutoParam);
  const [trocaValor, setTrocaValor] = useState(trocaValorParam);
  const [trocaCond, setTrocaCond] = useState(trocaCondParam);
  const [descTroca, setDescTroca] = useState("");
  const trocaNum = parseFloat(trocaValor) || 0;
  const isFromTradeIn = !!trocaProdutoParam;

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

  // Installment calculations
  const valorBase = preco > 0 ? (trocaNum > 0 ? preco - trocaNum : preco) : 0;
  const parcOpts = useMemo(() => {
    if (valorBase <= 0) return [];
    return Object.entries(TAXAS).map(([n, taxa]) => {
      const num = parseInt(n);
      const total = Math.ceil(valorBase * (1 + taxa / 100));
      const vp = Math.ceil(total / num);
      return { parcelas: num, valorParcela: vp, total };
    });
  }, [valorBase]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const localStr = local === "Loja" ? "Retirada em loja"
      : tipoEntrega === "Shopping" ? `Entrega - Shopping: ${shopping}`
      : "Entrega - Residencia";

    // Forma de pagamento com detalhes
    let pagStr = formaPagamento;
    if (formaPagamento.includes("Cartao") && parcelas) {
      const p = parcOpts.find(o => o.parcelas === parseInt(parcelas));
      pagStr = p ? `${fmt(p.total)} em ${parcelas}x de R$ ${fmt(p.valorParcela)} no cartao` : `${parcelas}x no cartao`;
    } else if (formaPagamento === "PIX" && valorBase > 0) {
      pagStr = `PIX - R$ ${fmt(valorBase)}`;
    } else if (formaPagamento === "PIX + Cartao" && parcelas) {
      pagStr = `PIX + Cartao em ${parcelas}x`;
    }

    const lines = [
      `Ola, me chamo ${nome}. Vim pelo formulario de compra!`,
      "",
      `WhatsApp: ${telefone}`,
      `E-mail: ${email}`,
      ...(instagram ? [`Instagram: ${instagram}`] : []),
      "",
      `*DADOS DA COMPRA -- TigraoImports*`,
      "",
      `Nome completo: ${nome}`,
      `CPF: ${cpf}`,
      ` E-mail: ${email}`,
      `Telefone: ${telefone}`,
      `CEP: ${cep}`,
      `Endereco: ${endereco}`,
      `Bairro: ${bairro}`,
      "",
      `*Produto:* ${produtoInput || produtoParam}`,
      ...(preco > 0 ? [`*Forma de pagamento:* ${pagStr}`] : [`*Forma de pagamento:* ${formaPagamento}`]),
      ...(origem ? [`*Como conheceu:* ${origem}`] : []),
    ];

    // Trade-in info
    if (temTroca && (trocaProduto || descTroca)) {
      lines.push("");
      if (trocaProduto) {
        lines.push(`*Produto na troca:* ${trocaProduto}`);
        if (trocaNum > 0) lines.push(`Avaliacao: R$ ${fmt(trocaNum)}`);
        if (trocaCond) lines.push(`Condicao: ${trocaCond}`);
        if (valorBase > 0) lines.push(`*(Valor da troca no Pix: R$${fmt(valorBase)})*`);
      } else if (descTroca) {
        lines.push(`*Produto na troca:* ${descTroca}`);
      }
    }

    lines.push("", `Horario: ${horario}`, `${localStr}`);

    const url = `https://wa.me/${whatsapp}?text=${encodeURIComponent(lines.join("\n"))}`;
    window.open(url, "_blank");
  }

  if (!whatsapp) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm text-center max-w-sm">
          <p className="text-2xl mb-2">&#x1F42F;</p>
          <p className="text-[#1D1D1F] font-semibold">Link invalido</p>
          <p className="text-[#86868B] text-sm mt-1">Este link de compra esta incompleto. Solicite um novo link ao vendedor.</p>
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
            <p className={sectionTitle}>Produto</p>
            <p className="text-[#1D1D1F] font-bold text-lg mt-1">{produtoParam}</p>
            {preco > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[#E8740E] font-bold text-2xl">R$ {fmt(preco)}</p>
                {trocaNum > 0 && (
                  <p className="text-green-600 font-semibold text-sm">Com a troca: R$ {fmt(valorBase)}</p>
                )}
              </div>
            )}
          </>
        ) : Object.keys(catalogo).length > 0 ? (
          <>
            <p className={sectionTitle}>Qual produto deseja?</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.keys(catalogo).map(cat => (
                <button key={cat} type="button" onClick={() => { setCatSel(catSel === cat ? "" : cat); setProdutoInput(""); setPrecoAuto(0); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${catSel === cat ? "bg-[#E8740E] text-white" : "bg-[#F5F5F7] border border-[#D2D2D7] text-[#6E6E73]"}`}>
                  {cat}
                </button>
              ))}
            </div>
            {catSel && catalogo[catSel] && (
              <div className="mt-3 max-h-[200px] overflow-y-auto space-y-1 border border-[#D2D2D7] rounded-lg p-2 bg-[#F5F5F7]">
                {catalogo[catSel].map(p => (
                  <button key={p.produto} type="button" onClick={() => setProdutoInput(p.produto)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${produtoInput === p.produto ? "bg-[#E8740E] text-white font-semibold" : "bg-white text-[#1D1D1F] hover:bg-[#FFF5EB]"}`}>
                    {p.produto}
                  </button>
                ))}
              </div>
            )}
            {produtoInput && preco > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-green-50 border border-green-200">
                <p className="text-sm font-semibold text-[#1D1D1F]">{produtoInput}</p>
                <p className="text-[#E8740E] font-bold text-xl">R$ {fmt(preco)}</p>
                {trocaNum > 0 && <p className="text-green-600 font-semibold text-sm">Com a troca: R$ {fmt(valorBase)}</p>}
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
        <div className="mx-4 mt-3 bg-green-50 rounded-xl p-4 shadow-sm border border-green-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-green-600 font-bold text-sm">&#x2705; Troca confirmada</span>
          </div>
          <p className="text-[#1D1D1F] font-semibold">{trocaProduto}</p>
          {trocaNum > 0 && <p className="text-green-600 font-bold text-lg">Avaliacao: R$ {fmt(trocaNum)}</p>}
          {trocaCond && <p className="text-[#86868B] text-xs mt-1">{trocaCond}</p>}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="mx-4 mt-4 mb-8 space-y-3">
        {/* Dados Pessoais */}
        <div className={cardCls}>
          <p className={sectionTitle}>Dados Pessoais</p>
          <div>
            <label className={labelCls}>Nome Completo *</label>
            <input type="text" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>CPF *</label>
            <input type="text" required inputMode="numeric" value={cpf} onChange={(e) => setCpf(maskCPF(e.target.value))} placeholder="000.000.000-00" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>E-mail *</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className={inputCls} />
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
            <label className={labelCls}>Endereco *</label>
            <input type="text" required value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, numero, complemento" className={inputCls} />
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

          {/* Installment grid */}
          {formaPagamento.includes("Cartao") && valorBase > 0 && (
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] mb-2">Escolha o parcelamento</label>
              <div className="grid grid-cols-3 gap-2">
                {parcOpts.filter(o => [1,2,3,4,5,6,7,8,9,10,11,12,15,18,21].includes(o.parcelas)).map(o => (
                  <label key={o.parcelas} className={`flex flex-col items-center py-2.5 px-2 rounded-lg border-2 cursor-pointer transition-colors ${parcelas === String(o.parcelas) ? "border-[#E8740E] bg-[#FFF5EB]" : "border-[#D2D2D7] bg-[#F5F5F7]"}`}>
                    <input type="radio" name="parcelas" value={o.parcelas} checked={parcelas === String(o.parcelas)} onChange={() => setParcelas(String(o.parcelas))} className="sr-only" />
                    <span className={`text-xs font-bold ${parcelas === String(o.parcelas) ? "text-[#E8740E]" : "text-[#1D1D1F]"}`}>{o.parcelas}x</span>
                    <span className={`text-[11px] font-semibold ${parcelas === String(o.parcelas) ? "text-[#E8740E]" : "text-[#6E6E73]"}`}>R$ {fmt(o.valorParcela)}</span>
                  </label>
                ))}
              </div>
              {formaPagamento === "PIX + Cartao" && (
                <p className="text-xs text-[#86868B] mt-2">Voce pode combinar PIX + Cartao. Informe os detalhes ao vendedor.</p>
              )}
            </div>
          )}

          {/* Fallback: no price, just number selector */}
          {formaPagamento.includes("Cartao") && valorBase <= 0 && (
            <div>
              <label className="block text-sm font-medium text-[#1D1D1F] mb-2">Em quantas vezes?</label>
              <div className="grid grid-cols-7 gap-1.5">
                {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21].map(n => (
                  <label key={n} className={`flex items-center justify-center py-2 rounded-lg border-2 cursor-pointer transition-colors text-xs font-bold ${parcelas === String(n) ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                    <input type="radio" name="parcelas" value={n} checked={parcelas === String(n)} onChange={() => setParcelas(String(n))} className="sr-only" />
                    {n}x
                  </label>
                ))}
              </div>
            </div>
          )}
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
          <div>
            <label className={labelCls}>Horario Preferido *</label>
            <input type="text" required value={horario} onChange={(e) => setHorario(e.target.value)} placeholder="Ex: Manha, Tarde, 14h-16h" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-2">Local *</label>
            <div className="flex gap-3">
              <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${local === "Loja" ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                <input type="radio" name="local" value="Loja" checked={local === "Loja"} onChange={() => setLocal("Loja")} className="sr-only" />
                <span className="text-lg">&#x1F3EA;</span>
                <span className="font-medium">Loja</span>
              </label>
              <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${local === "Entrega" ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                <input type="radio" name="local" value="Entrega" checked={local === "Entrega"} onChange={() => setLocal("Entrega")} className="sr-only" />
                <span className="text-lg">&#x1F69A;</span>
                <span className="font-medium">Entrega</span>
              </label>
            </div>
            {local === "Entrega" && (
              <div className="mt-3 space-y-3">
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
                {tipoEntrega === "Shopping" && (
                  <div>
                    <label className={labelCls}>Qual shopping? *</label>
                    <input type="text" required value={shopping} onChange={(e) => setShopping(e.target.value)} placeholder="Ex: BarraShopping, Village Mall..." className={inputCls} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

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
