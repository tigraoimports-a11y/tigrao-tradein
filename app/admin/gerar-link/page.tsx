"use client";

import { useState, useEffect, useMemo } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { getWhatsAppByVendedor, VENDEDORES } from "@/lib/whatsapp-config";

export default function GerarLinkPage() {
  const { user, password: adminPw, apiHeaders: adminHeaders, darkMode: dm } = useAdmin();

  const [produtos, setProdutos] = useState<string[]>([""]);
  const [preco, setPreco] = useState("");
  const [produtoManual, setProdutoManual] = useState(false);
  const [catSel, setCatSel] = useState("");

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

  // Fetch estoque para obter cores reais disponíveis
  const [estoqueItems, setEstoqueItems] = useState<{ produto: string; cor: string | null; qnt: number }[]>([]);
  useEffect(() => {
    if (!adminPw) return;
    fetch("/api/estoque", { headers: adminHeaders() })
      .then(r => r.json())
      .then(j => {
        if (j.data && Array.isArray(j.data)) {
          setEstoqueItems(
            j.data
              .filter((p: { status?: string; qnt?: number }) => p.status === "EM ESTOQUE" && (p.qnt || 0) > 0)
              .map((p: { produto: string; cor: string | null; qnt: number }) => ({
                produto: p.produto, cor: p.cor, qnt: p.qnt
              }))
          );
        }
      })
      .catch(() => {});
  }, [adminPw]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cores reais do estoque para o produto selecionado
  const coresDisponiveis = useMemo(() => {
    if (!produtos[0]) return [];
    const prodSel = produtos[0].toLowerCase().replace(/[º°""]/g, "").replace(/\s+/g, " ").trim();
    // Extrair palavras-chave do produto selecionado pra matching flexível
    const keywords = prodSel.split(" ").filter(w => w.length >= 2);
    const cores = new Set<string>();
    for (const item of estoqueItems) {
      const prodEstoque = item.produto.toLowerCase().replace(/[º°""]/g, "").replace(/\s+/g, " ").trim();
      // Match direto
      if (prodEstoque.includes(prodSel) || prodSel.includes(prodEstoque)) {
        if (item.cor) cores.add(item.cor.toUpperCase());
        continue;
      }
      // Match flexível: primeira keyword (família do produto) obrigatória + mínimo de matches
      const firstKeyword = keywords[0];
      if (firstKeyword && !prodEstoque.includes(firstKeyword)) continue;
      const matchCount = keywords.filter(kw => prodEstoque.includes(kw)).length;
      if (matchCount >= Math.min(3, keywords.length - 1)) {
        if (item.cor) cores.add(item.cor.toUpperCase());
      }
    }
    return [...cores].sort();
  }, [produtos, estoqueItems]);

  const [vendedorNome, setVendedorNome] = useState(user?.nome || "");
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
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [pasteMsg, setPasteMsg] = useState("");
  const [pagamentoPago, setPagamentoPago] = useState<"" | "link" | "pix">("");

  const formatPreco = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    return Number(digits).toLocaleString("pt-BR");
  };

  const rawPreco = preco.replace(/\./g, "").replace(",", ".");
  const rawEntrada = entradaPix.replace(/\./g, "").replace(",", ".");
  const rawTrocaVal = trocaValor.replace(/\./g, "").replace(",", ".");

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
  const entradaNum = parseFloat(rawEntrada) || 0;
  const valorSemTaxa = Math.max(0, precoBase - descontoNum - trocaNum);
  const valorParcelar = Math.max(0, valorSemTaxa - entradaNum);
  const numParcelas = parseInt(parcelas) || 0;
  const taxa = ((forma === "Cartao Credito" || forma === "Link de Pagamento") && numParcelas > 0) ? (TAXAS[numParcelas] || 0) : 0;
  const valorComTaxa = taxa > 0 ? Math.ceil(valorParcelar * (1 + taxa / 100)) : valorParcelar;
  const valorParcela = numParcelas > 0 ? Math.ceil(valorComTaxa / numParcelas) : 0;
  const valorTotal = entradaNum + valorComTaxa;

  // WhatsApp por vendedor (centralizado em lib/whatsapp-config.ts)

  async function gerarLink() {
    const prodsFilled = produtos.filter(Boolean);
    if (prodsFilled.length === 0) return;

    const whatsappDestino = getWhatsAppByVendedor(vendedorNome);
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

    // Montar dados com keys curtas
    const shortData: Record<string, string> = {};
    // Incluir cor no nome do produto se selecionada
    shortData.p = corSel ? `${prodsFilled[0]} ${corSel}` : prodsFilled[0];
    for (let i = 1; i < prodsFilled.length; i++) {
      shortData[`p${i + 1}`] = prodsFilled[i];
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
    const rawTroca = trocaValor.replace(/\./g, "").replace(",", ".");
    if (rawTroca && rawTroca !== "0") shortData.tv = rawTroca;
    if (pagamentoPago) shortData.pp = pagamentoPago;

    // Salvar no banco e gerar código curto de 6 chars
    try {
      const res = await fetch("/api/short-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: shortData }),
      });
      const json = await res.json();
      if (json.code) {
        setGeneratedLink(`${baseUrl}/c/${json.code}`);
        setCopied(false);
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
      <h1 className="text-xl font-bold text-[#1D1D1F]">Gerar Link de Compra</h1>
      <p className="text-sm text-[#86868B]">
        Gere um link pre-preenchido para enviar ao cliente. Ele completa os dados pessoais e envia direto pro WhatsApp da Bianca.
      </p>

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
          <button onClick={() => { setProdutoManual(!produtoManual); if (!produtoManual) setCatSel(""); }} className="text-xs text-[#E8740E] font-medium hover:underline">
            {produtoManual ? "📋 Selecionar do estoque" : "✏️ Digitar manual"}
          </button>
        </div>

        {produtoManual ? (
          <>
            {produtos.map((prod, idx) => (
              <div key={idx} className="flex gap-2 items-end">
                <div className="flex-1">
                  <input
                    type="text"
                    value={prod}
                    onChange={(e) => { const np = [...produtos]; np[idx] = e.target.value; setProdutos(np); }}
                    placeholder={idx === 0 ? "Ex: iPhone 17 Pro Max 256GB Silver" : `Produto ${idx + 1}...`}
                    className={inputCls}
                  />
                </div>
                {idx > 0 && <button onClick={() => setProdutos(produtos.filter((_, i) => i !== idx))} className="px-2 py-2.5 text-red-400 hover:text-red-600 text-lg">✕</button>}
              </div>
            ))}
          </>
        ) : (
          <div className="space-y-3">
            <select value={catSel} onChange={(e) => { setCatSel(e.target.value); setProdutos([""]); setPreco(""); setCorSel(""); }} className={inputCls}>
              <option value="">-- Categoria --</option>
              {categoriaPrecos.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
            </select>
            {catSel && (
              <div className={`max-h-[300px] overflow-y-auto rounded-xl border divide-y ${dm ? "border-[#3A3A3C] divide-[#3A3A3C]" : "border-[#D2D2D7] divide-[#E5E5EA]"}`}>
                {produtosFiltradosPreco.length === 0 && <p className="text-xs text-center text-[#86868B] py-4">Nenhum produto</p>}
                {produtosFiltradosPreco.map((m) => {
                  const sel = produtos[0] === m.nome;
                  return (
                    <div key={m.nome}>
                      <button onClick={() => {
                        if (sel) { setProdutos([""]); setPreco(""); setCorSel(""); return; }
                        setProdutos([m.nome]);
                        setPreco(m.preco.toLocaleString("pt-BR"));
                        setCorSel("");
                      }} className={`w-full px-4 py-3 flex items-center justify-between text-left transition-all ${sel ? (dm ? "bg-[#E8740E]/20 border-l-4 border-[#E8740E]" : "bg-[#FFF5EB] border-l-4 border-[#E8740E]") : (dm ? "hover:bg-[#2C2C2E]" : "hover:bg-[#F9F9FB]")}`}>
                        <p className={`text-sm font-semibold ${sel ? "text-[#E8740E]" : (dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]")}`}>{m.nome}</p>
                        <p className={`text-sm font-bold ${sel ? "text-[#E8740E]" : (dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]")}`}>R$ {m.preco.toLocaleString("pt-BR")}</p>
                      </button>
                      {sel && coresDisponiveis.length > 0 && (
                        <div className={`px-4 py-3 ${dm ? "bg-[#1C1C1E] border-t border-[#3A3A3C]" : "bg-[#FAFAFA] border-t border-[#E5E5EA]"}`}>
                          <p className={`text-xs font-medium mb-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Selecione a cor:</p>
                          <div className="flex flex-wrap gap-2">
                            {coresDisponiveis.map(cor => (
                              <button key={cor} onClick={() => setCorSel(corSel === cor ? "" : cor)}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${corSel === cor ? "bg-[#E8740E] text-white border-[#E8740E]" : (dm ? "bg-[#2C2C2E] text-[#F5F5F7] border-[#3A3A3C] hover:border-[#E8740E]" : "bg-white text-[#1D1D1F] border-[#D2D2D7] hover:border-[#E8740E]")}`}
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
        <button onClick={() => { setProdutos([...produtos, ""]); if (!produtoManual) setProdutoManual(true); }} className="text-xs text-[#E8740E] font-medium hover:underline">+ Adicionar produto</button>

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
              onChange={(e) => { setTemTroca(e.target.checked); if (!e.target.checked) { setTrocaProduto(""); setTrocaValor(""); } }}
              className="w-4 h-4 rounded accent-[#E8740E]"
            />
            <span className="text-sm font-semibold text-[#1D1D1F]">Produto na troca</span>
          </label>
          {temTroca && (
            <div className="space-y-3 mt-3">
              <div>
                <label className={labelCls}>Detalhes do produto na troca</label>
                <textarea
                  value={trocaProduto}
                  onChange={(e) => setTrocaProduto(e.target.value)}
                  placeholder="Ex: iPhone 16 Plus 128GB, 100% bateria, sem marcas, com caixa e cabo, garantia Apple até Out/2026"
                  rows={3}
                  className={inputCls + " resize-none"}
                />
              </div>
              <div>
                <label className={labelCls}>Valor de Avaliacao do Usado (R$)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={trocaValor}
                  onChange={(e) => setTrocaValor(formatPreco(e.target.value))}
                  placeholder="Ex: 4.500"
                  className={inputCls}
                />
              </div>
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
              <option value="Manha">Manha</option>
              <option value="Tarde">Tarde</option>
              <option value="Noite">Noite</option>
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
                  <span className="text-green-500">Troca (avaliação)</span>
                  <span className="font-semibold text-green-500">- R$ {trocaNum.toLocaleString("pt-BR")}</span>
                </div>
              )}
              {trocaNum > 0 && (
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
                    <span className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{numParcelas}x de R$ {valorParcela.toLocaleString("pt-BR")}</span>
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
    </div>
  );
}
