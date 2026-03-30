"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";

function maskCPF(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return digits.slice(0, 3) + "." + digits.slice(3);
  if (digits.length <= 9)
    return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6);
  return (
    digits.slice(0, 3) +
    "." +
    digits.slice(3, 6) +
    "." +
    digits.slice(6, 9) +
    "-" +
    digits.slice(9)
  );
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return "(" + digits.slice(0, 2) + ") " + digits.slice(2);
  return (
    "(" +
    digits.slice(0, 2) +
    ") " +
    digits.slice(2, 7) +
    "-" +
    digits.slice(7)
  );
}

function maskCEP(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return digits.slice(0, 5) + "-" + digits.slice(5);
}

function formatPrice(value: string | null) {
  if (!value) return "";
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 0 });
}

function CompraForm() {
  const searchParams = useSearchParams();

  const produtoParam = searchParams.get("produto") || searchParams.get("p") || "";
  const precoParam = searchParams.get("preco") || searchParams.get("v") || "";
  const vendedor = searchParams.get("vendedor") || "";
  const whatsapp = searchParams.get("whatsapp") || "";

  const [produtoInput, setProdutoInput] = useState(produtoParam);
  const produto = produtoInput || produtoParam;
  const preco = precoParam;

  const [catalogo, setCatalogo] = useState<Record<string, { produto: string; cor: string | null; preco: number | null }[]>>({});
  const [catSel, setCatSel] = useState("");

  useEffect(() => {
    if (!produtoParam) {
      fetch("/api/produtos-disponiveis").then(r => r.json()).then(j => {
        if (j.categorias) setCatalogo(j.categorias);
      }).catch(() => {});
    }
  }, [produtoParam]);

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [horario, setHorario] = useState("");
  const [local, setLocal] = useState<"Loja" | "Entrega">("Loja");
  const [tipoEntrega, setTipoEntrega] = useState<"Shopping" | "Residencia">("Residencia");
  const [shopping, setShopping] = useState("");
  const [temTroca, setTemTroca] = useState<boolean | null>(null);
  const [descTroca, setDescTroca] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState("");

  useEffect(() => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;

    setCepLoading(true);
    setCepError("");
    fetch(`https://viacep.com.br/ws/${digits}/json/`)
      .then((r) => r.json())
      .then((data) => {
        if (data.erro) {
          setCepError("CEP nao encontrado");
        } else {
          setEndereco(data.logradouro || "");
          setBairro(data.bairro || "");
        }
      })
      .catch(() => setCepError("Erro ao buscar CEP"))
      .finally(() => setCepLoading(false));
  }, [cep]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const localStr = local === "Loja" ? "Retirada em loja"
      : tipoEntrega === "Shopping" ? `Entrega - Shopping: ${shopping}`
      : "Entrega - Residencia";

    const lines = [
      `Olá, me chamo ${nome}. Vim pelo formulário de compra!`,
      "",
      `WhatsApp: ${telefone}`,
      `E-mail: ${email}`,
      "",
      `*DADOS DA COMPRA -- TigraoImports*`,
      "",
      `Nome completo: ${nome}`,
      `CPF: ${cpf}`,
      `E-mail: ${email}`,
      `Telefone: ${telefone}`,
      `CEP: ${cep}`,
      `Endereco: ${endereco}`,
      `Bairro: ${bairro}`,
      "",
      `*Produto:* ${produto}${preco ? ` -- R$ ${formatPrice(preco)}` : ""}`,
    ];

    if (temTroca && descTroca) {
      lines.push("", `*Produto na troca:* ${descTroca}`);
    }

    lines.push("", `Horario: ${horario}`, `${localStr}`);

    const message = lines.join("\n");

    const url = `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }

  if (!whatsapp) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm text-center max-w-sm">
          <p className="text-2xl mb-2">&#x1F42F;</p>
          <p className="text-[#1D1D1F] font-semibold">Link invalido</p>
          <p className="text-[#86868B] text-sm mt-1">
            Este link de compra esta incompleto. Solicite um novo link ao vendedor.
          </p>
        </div>
      </div>
    );
  }

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
            <p className="text-xs text-[#86868B] uppercase tracking-wider font-semibold">Produto</p>
            <p className="text-[#1D1D1F] font-bold text-lg mt-1">{produtoParam}</p>
            {preco && <p className="text-[#E8740E] font-bold text-2xl mt-1">R$ {formatPrice(preco)}</p>}
          </>
        ) : Object.keys(catalogo).length > 0 ? (
          <>
            <p className="text-xs text-[#86868B] uppercase tracking-wider font-semibold">Qual produto deseja?</p>
            {/* Categorias */}
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.keys(catalogo).map(cat => (
                <button key={cat} type="button" onClick={() => { setCatSel(catSel === cat ? "" : cat); setProdutoInput(""); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${catSel === cat ? "bg-[#E8740E] text-white" : "bg-[#F5F5F7] border border-[#D2D2D7] text-[#6E6E73]"}`}>
                  {cat}
                </button>
              ))}
            </div>
            {/* Produtos da categoria */}
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
            {produtoInput && (
              <p className="mt-2 text-sm font-semibold text-[#E8740E]">Selecionado: {produtoInput}</p>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-[#86868B] uppercase tracking-wider font-semibold">Qual produto deseja?</p>
            <input
              type="text"
              required
              value={produtoInput}
              onChange={(e) => setProdutoInput(e.target.value)}
              placeholder="Ex: iPhone 17 Pro Max 256GB Silver"
              className="w-full mt-2 px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]"
            />
          </>
        )}
        {vendedor && (
          <p className="text-[#86868B] text-sm mt-2">Vendedor: {vendedor}</p>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="mx-4 mt-4 mb-8 space-y-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#E8E8ED] space-y-3">
          <p className="text-xs text-[#86868B] uppercase tracking-wider font-semibold">
            Dados Pessoais
          </p>

          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-1">
              Nome Completo *
            </label>
            <input
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome completo"
              className="w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-1">CPF *</label>
            <input
              type="text"
              required
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(maskCPF(e.target.value))}
              placeholder="000.000.000-00"
              className="w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-1">E-mail *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Telefone *</label>
            <input
              type="text"
              required
              inputMode="numeric"
              value={telefone}
              onChange={(e) => setTelefone(maskPhone(e.target.value))}
              placeholder="(21) 99999-9999"
              className="w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#E8E8ED] space-y-3">
          <p className="text-xs text-[#86868B] uppercase tracking-wider font-semibold">
            Endereco
          </p>

          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-1">CEP *</label>
            <div className="relative">
              <input
                type="text"
                required
                inputMode="numeric"
                value={cep}
                onChange={(e) => setCep(maskCEP(e.target.value))}
                placeholder="00000-000"
                className="w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]"
              />
              {cepLoading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868B] text-sm">
                  Buscando...
                </span>
              )}
            </div>
            {cepError && <p className="text-red-500 text-xs mt-1">{cepError}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Endereco *</label>
            <input
              type="text"
              required
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Rua, numero, complemento"
              className="w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Bairro *</label>
            <input
              type="text"
              required
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
              placeholder="Bairro"
              className="w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]"
            />
          </div>
        </div>

        {/* Troca */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#E8E8ED] space-y-3">
          <p className="text-xs text-[#86868B] uppercase tracking-wider font-semibold">
            Troca
          </p>
          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-2">Voce vai dar algum produto na troca?</label>
            <div className="flex gap-3">
              <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${temTroca === false ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                <input type="radio" name="troca" checked={temTroca === false} onChange={() => { setTemTroca(false); setDescTroca(""); }} className="sr-only" />
                <span className="font-medium">Não</span>
              </label>
              <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${temTroca === true ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]" : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"}`}>
                <input type="radio" name="troca" checked={temTroca === true} onChange={() => setTemTroca(true)} className="sr-only" />
                <span className="font-medium">Sim</span>
              </label>
            </div>
            {temTroca && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Descreva o produto *</label>
                <textarea
                  required
                  value={descTroca}
                  onChange={(e) => setDescTroca(e.target.value)}
                  placeholder="Ex: iPhone 15 Pro Max 256GB, bateria 90%, sem marcas de uso"
                  rows={3}
                  className="w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E] resize-none"
                />
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#E8E8ED] space-y-3">
          <p className="text-xs text-[#86868B] uppercase tracking-wider font-semibold">
            Entrega
          </p>

          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-1">
              Horario Preferido *
            </label>
            <input
              type="text"
              required
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
              placeholder="Ex: Manha, Tarde, 14h-16h"
              className="w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1D1D1F] mb-2">Local *</label>
            <div className="flex gap-3">
              <label
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  local === "Loja"
                    ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]"
                    : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"
                }`}
              >
                <input
                  type="radio"
                  name="local"
                  value="Loja"
                  checked={local === "Loja"}
                  onChange={() => setLocal("Loja")}
                  className="sr-only"
                />
                <span className="text-lg">&#x1F3EA;</span>
                <span className="font-medium">Loja</span>
              </label>
              <label
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  local === "Entrega"
                    ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]"
                    : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"
                }`}
              >
                <input
                  type="radio"
                  name="local"
                  value="Entrega"
                  checked={local === "Entrega"}
                  onChange={() => setLocal("Entrega")}
                  className="sr-only"
                />
                <span className="text-lg">&#x1F69A;</span>
                <span className="font-medium">Entrega</span>
              </label>
            </div>

            {local === "Entrega" && (
              <div className="mt-3 space-y-3 animate-fadeIn">
                <label className="block text-sm font-medium text-[#1D1D1F] mb-2">Local de entrega *</label>
                <div className="flex gap-3">
                  <label
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      tipoEntrega === "Residencia"
                        ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]"
                        : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"
                    }`}
                  >
                    <input type="radio" name="tipoEntrega" value="Residencia" checked={tipoEntrega === "Residencia"} onChange={() => { setTipoEntrega("Residencia"); setShopping(""); }} className="sr-only" />
                    <span className="text-lg">🏠</span>
                    <span className="font-medium">Residencia</span>
                  </label>
                  <label
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      tipoEntrega === "Shopping"
                        ? "border-[#E8740E] bg-[#FFF5EB] text-[#E8740E]"
                        : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73]"
                    }`}
                  >
                    <input type="radio" name="tipoEntrega" value="Shopping" checked={tipoEntrega === "Shopping"} onChange={() => setTipoEntrega("Shopping")} className="sr-only" />
                    <span className="text-lg">🏬</span>
                    <span className="font-medium">Shopping</span>
                  </label>
                </div>

                {tipoEntrega === "Shopping" && (
                  <div>
                    <label className="block text-sm font-medium text-[#1D1D1F] mb-1">Qual shopping? *</label>
                    <input
                      type="text"
                      required
                      value={shopping}
                      onChange={(e) => setShopping(e.target.value)}
                      placeholder="Ex: BarraShopping, Village Mall..."
                      className="w-full px-3 py-2.5 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E]"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-3.5 bg-[#25D366] text-white font-bold text-lg rounded-xl shadow-sm hover:bg-[#20BD5A] active:bg-[#1DA851] transition-colors flex items-center justify-center gap-2"
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Enviar pelo WhatsApp
        </button>

        <p className="text-center text-xs text-[#86868B]">
          Ao enviar, seus dados serao compartilhados com o vendedor via WhatsApp.
        </p>
      </form>
    </div>
  );
}

export default function CompraPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
          <p className="text-[#86868B]">Carregando...</p>
        </div>
      }
    >
      <CompraForm />
    </Suspense>
  );
}
