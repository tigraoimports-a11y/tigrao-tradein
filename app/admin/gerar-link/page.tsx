"use client";

import { useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { getWhatsAppByVendedor, VENDEDORES } from "@/lib/whatsapp-config";

export default function GerarLinkPage() {
  const { user } = useAdmin();

  const [produtos, setProdutos] = useState<string[]>([""]);
  const [preco, setPreco] = useState("");
  const [vendedorNome, setVendedorNome] = useState(user?.nome || "");
  const [forma, setForma] = useState("");
  const [parcelas, setParcelas] = useState("");
  const [entradaPix, setEntradaPix] = useState("");
  const [localEntrega, setLocalEntrega] = useState("");
  const [shoppingNome, setShoppingNome] = useState("");
  const [horario, setHorario] = useState("");
  const [dataEntrega, setDataEntrega] = useState("");
  const [trocaProduto, setTrocaProduto] = useState("");
  const [trocaValor, setTrocaValor] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [pasteMsg, setPasteMsg] = useState("");

  const formatPreco = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    return Number(digits).toLocaleString("pt-BR");
  };

  const rawPreco = preco.replace(/\./g, "").replace(",", ".");
  const rawEntrada = entradaPix.replace(/\./g, "").replace(",", ".");

  // WhatsApp por vendedor (centralizado em lib/whatsapp-config.ts)

  async function gerarLink() {
    const prodsFilled = produtos.filter(Boolean);
    if (prodsFilled.length === 0) return;

    const whatsappDestino = getWhatsAppByVendedor(vendedorNome);
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

    // Montar dados com keys curtas
    const shortData: Record<string, string> = {};
    shortData.p = prodsFilled[0];
    for (let i = 1; i < prodsFilled.length; i++) {
      shortData[`p${i + 1}`] = prodsFilled[i];
    }
    if (rawPreco && rawPreco !== "0") shortData.v = rawPreco;
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

    // Comprimir com deflate-raw via CompressionStream API
    const json = JSON.stringify(shortData);
    let b64: string;
    try {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      const compressed = await new Response(stream).arrayBuffer();
      const bytes = new Uint8Array(compressed);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      b64 = "z" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    } catch {
      // Fallback: base64url sem compressão
      b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    const link = `${baseUrl}/c/${b64}`;
    setGeneratedLink(link);
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
            if (prodTroca) setTrocaProduto(prodTroca);
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

  const showParcelas = forma === "Cartao Credito" || forma === "Cartao Debito";
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

        {/* Produtos dinâmicos */}
        {produtos.map((prod, idx) => (
          <div key={idx} className="flex gap-2 items-end">
            <div className="flex-1">
              <label className={labelCls}>{idx === 0 ? "Produto *" : `Produto ${idx + 1}`}</label>
              <input
                type="text"
                value={prod}
                onChange={(e) => { const np = [...produtos]; np[idx] = e.target.value; setProdutos(np); }}
                placeholder={idx === 0 ? "Ex: iPhone 17 Pro Max 256GB Silver" : `Produto ${idx + 1}...`}
                className={inputCls}
              />
            </div>
            {idx > 0 && (
              <button onClick={() => setProdutos(produtos.filter((_, i) => i !== idx))} className="px-2 py-2.5 text-red-400 hover:text-red-600 text-lg" title="Remover">✕</button>
            )}
          </div>
        ))}
        <button onClick={() => setProdutos([...produtos, ""])} className="text-xs text-[#E8740E] font-medium hover:underline">+ Adicionar produto</button>

        <div>
          <label className={labelCls}>Preco de Venda (R$)</label>
          <input
            type="text"
            inputMode="numeric"
            value={preco}
            onChange={(e) => setPreco(formatPreco(e.target.value))}
            placeholder="Ex: 8.797 (valor total)"
            className={inputCls}
          />
        </div>

        {/* Troca / Trade-in */}
        <div className={`p-3 rounded-xl border ${trocaProduto ? "border-[#E8740E] bg-[#FFF8F0]" : "border-[#E8E8ED] bg-[#FAFAFA]"}`}>
          <p className="text-sm font-semibold text-[#1D1D1F] mb-3">Produto na troca (opcional)</p>
          <div className="space-y-3">
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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className={showParcelas ? "" : "col-span-2"}>
            <label className={labelCls}>Forma de Pagamento</label>
            <select value={forma} onChange={(e) => { setForma(e.target.value); if (!["Cartao Credito", "Cartao Debito"].includes(e.target.value)) { setParcelas(""); setEntradaPix(""); } }} className={inputCls}>
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
              <label className={labelCls}>Parcelas</label>
              <select value={parcelas} onChange={(e) => setParcelas(e.target.value)} className={inputCls}>
                <option value="">--</option>
                {Array.from({ length: 21 }, (_, i) => i + 1).map(n => <option key={n} value={String(n)}>{n}x</option>)}
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
          <select value={localEntrega} onChange={(e) => { setLocalEntrega(e.target.value); if (e.target.value !== "shopping") setShoppingNome(""); }} className={inputCls}>
            <option value="">-- Opcional --</option>
            <option value="loja">Retirada em Loja</option>
            <option value="shopping">Entrega em Shopping</option>
            <option value="residencia">Entrega em Residencia</option>
          </select>
        </div>

        {localEntrega === "shopping" && (
          <div>
            <label className={labelCls}>Qual Shopping?</label>
            <input
              type="text"
              value={shoppingNome}
              onChange={(e) => setShoppingNome(e.target.value)}
              placeholder="Ex: BarraShopping, Village Mall..."
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
            <option value="Nicolas">Nicolas</option>
            <option value="Nicole">Nicole</option>
          </select>
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
