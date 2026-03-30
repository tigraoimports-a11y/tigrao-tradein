"use client";

import { useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

export default function GerarLinkPage() {
  const { user } = useAdmin();

  const [produto, setProduto] = useState("");
  const [preco, setPreco] = useState("");
  const [vendedorNome, setVendedorNome] = useState(user?.nome || "");
  const [whatsapp, setWhatsapp] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);

  const formatPreco = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    return Number(digits).toLocaleString("pt-BR");
  };

  const rawPreco = preco.replace(/\./g, "").replace(",", ".");

  function gerarLink() {
    if (!produto || !preco || !whatsapp) return;

    const cleanWhatsapp = whatsapp.replace(/\D/g, "");
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const params = new URLSearchParams({
      produto,
      preco: rawPreco,
      vendedor: vendedorNome,
      whatsapp: cleanWhatsapp,
    });

    const link = `${baseUrl}/compra?${params.toString()}`;
    setGeneratedLink(link);
    setCopied(false);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
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

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold text-[#1D1D1F]">Gerar Link de Compra</h1>
      <p className="text-sm text-[#86868B]">
        Gere um link para enviar ao cliente pelo WhatsApp. O cliente preenche os dados e envia de volta automaticamente.
      </p>

      <div className="bg-white border border-[#D2D2D7] rounded-xl p-4 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Produto *</label>
          <input
            type="text"
            value={produto}
            onChange={(e) => setProduto(e.target.value)}
            placeholder="Ex: iPhone 17 Pro Max 256GB Silver"
            className="w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Preco (R$) *</label>
          <input
            type="text"
            inputMode="numeric"
            value={preco}
            onChange={(e) => setPreco(formatPreco(e.target.value))}
            placeholder="Ex: 8.797"
            className="w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Nome do Vendedor</label>
          <input
            type="text"
            value={vendedorNome}
            onChange={(e) => setVendedorNome(e.target.value)}
            placeholder="Seu nome"
            className="w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1D1D1F] mb-1">WhatsApp (com DDD) *</label>
          <input
            type="text"
            inputMode="numeric"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, "").slice(0, 13))}
            placeholder="5521999999999"
            className="w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]"
          />
          <p className="text-xs text-[#86868B] mt-1">Formato: 55 + DDD + numero (ex: 5521999999999)</p>
        </div>

        <button
          onClick={gerarLink}
          disabled={!produto || !preco || !whatsapp}
          className="w-full py-3 bg-[#E8740E] text-white font-bold rounded-xl hover:bg-[#D06A0D] active:bg-[#B85E0B] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Gerar Link
        </button>
      </div>

      {generatedLink && (
        <div className="bg-white border border-[#D2D2D7] rounded-xl p-4 shadow-sm space-y-3">
          <p className="text-sm font-semibold text-[#1D1D1F]">Link gerado:</p>
          <div className="bg-[#F5F5F7] rounded-lg p-3 break-all text-sm text-[#1D1D1F] font-mono border border-[#D2D2D7]">
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
        </div>
      )}
    </div>
  );
}
