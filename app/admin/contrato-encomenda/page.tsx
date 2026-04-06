"use client";
import { useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

const CONDICOES_PADRAO = [
  "Sem marcas de uso",
  "Sem avarias",
  "Sem defeitos",
  "Com caixa original",
  "Sem caixa original",
  "Com carregador original",
  "Sem carregador original",
];

const FORMAS_PAGAMENTO = [
  "integralmente via Pix no ato da assinatura deste contrato",
  "via cartão de crédito no ato da assinatura deste contrato",
  "50% via Pix no ato da assinatura e 50% na entrega do produto",
  "via transferência bancária no ato da assinatura deste contrato",
];

function hoje(): string {
  const d = new Date();
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${String(d.getDate()).padStart(2, "0")} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ContratoEncomendaPage() {
  const { password } = useAdmin();

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Contratante
  const [clienteNome, setClienteNome] = useState("");
  const [clienteCPF, setClienteCPF] = useState("");
  const [clienteRua, setClienteRua] = useState("");
  const [clienteNumero, setClienteNumero] = useState("");
  const [clienteComplemento, setClienteComplemento] = useState("");
  const [clienteBairro, setClienteBairro] = useState("");
  const [clienteCEP, setClienteCEP] = useState("");

  // Produto novo
  const [produtoNovo, setProdutoNovo] = useState("");
  const [storageNovo, setStorageNovo] = useState("");
  const [corNova, setCorNova] = useState("");
  const [detalhesNovo, setDetalhesNovo] = useState("");
  const [valorNovo, setValorNovo] = useState("");

  // Troca
  const [temTroca, setTemTroca] = useState(true);
  const [produtoUsado, setProdutoUsado] = useState("");
  const [storageUsado, setStorageUsado] = useState("");
  const [corUsada, setCorUsada] = useState("");
  const [condicoesSelecionadas, setCondicoesSelecionadas] = useState<string[]>([
    "Sem marcas de uso", "Sem avarias", "Sem defeitos", "Com caixa original",
  ]);
  const [outraCondicao, setOutraCondicao] = useState("");
  const [bateria, setBateria] = useState("");
  const [valorUsado, setValorUsado] = useState("");

  // Pagamento e prazo
  const [formaPagamento, setFormaPagamento] = useState(FORMAS_PAGAMENTO[0]);
  const [prazoEntrega, setPrazoEntrega] = useState("20");
  const [dataContrato, setDataContrato] = useState(hoje());

  function formatCPF(v: string) {
    return v.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4").slice(0, 14);
  }

  function formatCEP(v: string) {
    return v.replace(/\D/g, "").replace(/(\d{5})(\d{3})/, "$1-$2").slice(0, 9);
  }

  function toggleCondicao(c: string) {
    setCondicoesSelecionadas(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    );
  }

  const enderecoCompleto = [
    clienteRua,
    clienteNumero,
    clienteComplemento,
    clienteBairro,
    clienteCEP ? `cep: ${clienteCEP}` : "",
    "Rio de Janeiro – RJ",
  ].filter(Boolean).join(", ");

  const vNovo = parseFloat(valorNovo.replace(/\./g, "").replace(",", ".")) || 0;
  const vUsado = parseFloat(valorUsado.replace(/\./g, "").replace(",", ".")) || 0;
  const restante = vNovo - (temTroca ? vUsado : 0);

  async function gerarPDF() {
    if (!clienteNome || !clienteCPF || !produtoNovo || !valorNovo) {
      setMsg("⚠️ Preencha nome, CPF, produto e valor.");
      return;
    }

    const condicoesFinais = [
      ...condicoesSelecionadas,
      ...(outraCondicao ? [outraCondicao] : []),
    ];

    setLoading(true);
    setMsg("");

    try {
      const res = await fetch("/api/contrato-encomenda", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password || "",
        },
        body: JSON.stringify({
          clienteNome,
          clienteCPF,
          clienteEndereco: enderecoCompleto,
          produtoNovo,
          storageNovo,
          corNova,
          detalhesNovo: detalhesNovo || undefined,
          valorNovo: vNovo,
          temTroca,
          produtoUsado: temTroca ? produtoUsado : undefined,
          storageUsado: temTroca ? storageUsado : undefined,
          corUsada: temTroca ? corUsada : undefined,
          condicoesUsado: temTroca ? condicoesFinais : undefined,
          bateriaUsado: temTroca && bateria ? `${bateria}%` : undefined,
          valorUsado: temTroca ? vUsado : undefined,
          formaPagamento,
          prazoEntrega: parseInt(prazoEntrega) || 20,
          data: dataContrato,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setMsg(`❌ ${err.error || "Erro ao gerar PDF"}`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CONTRATO ENCOMENDA-${clienteNome.split(" ").slice(0, 2).join(" ")}- ${produtoNovo} ${storageNovo} ${corNova}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("✅ Contrato gerado com sucesso!");
    } catch {
      setMsg("❌ Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200";
  const labelCls = "block text-xs font-semibold text-gray-600 mb-1";
  const sectionCls = "bg-white rounded-xl border border-gray-200 p-5";

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">📄 Contrato de Encomenda</h1>
        <p className="text-sm text-gray-500 mt-1">Preencha os dados abaixo para gerar o contrato em PDF</p>
      </div>

      {/* CONTRATANTE */}
      <div className={sectionCls}>
        <h2 className="text-sm font-bold text-orange-600 uppercase tracking-wide mb-4">I – Dados do Contratante</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Nome completo *</label>
            <input className={inputCls} value={clienteNome} onChange={e => setClienteNome(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>CPF *</label>
            <input className={inputCls} value={clienteCPF} onChange={e => setClienteCPF(formatCPF(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>CEP</label>
            <input className={inputCls} value={clienteCEP} onChange={e => setClienteCEP(formatCEP(e.target.value))} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Rua / Avenida</label>
            <input className={inputCls} value={clienteRua} onChange={e => setClienteRua(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Número</label>
            <input className={inputCls} value={clienteNumero} onChange={e => setClienteNumero(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Complemento</label>
            <input className={inputCls} value={clienteComplemento} onChange={e => setClienteComplemento(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Bairro</label>
            <input className={inputCls} value={clienteBairro} onChange={e => setClienteBairro(e.target.value)} />
          </div>
        </div>
        {(clienteRua || clienteBairro) && (
          <p className="mt-3 text-xs text-gray-400 italic">Preview: {enderecoCompleto}</p>
        )}
      </div>

      {/* PRODUTO NOVO */}
      <div className={sectionCls}>
        <h2 className="text-sm font-bold text-orange-600 uppercase tracking-wide mb-4">II – Produto Novo (Encomenda)</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Produto *</label>
            <input className={inputCls} value={produtoNovo} onChange={e => setProdutoNovo(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Detalhes adicionais do produto <span className="text-gray-400 font-normal">(opcional)</span></label>
            <textarea className={inputCls + " resize-none"} rows={2} value={detalhesNovo} onChange={e => setDetalhesNovo(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Valor de venda do produto novo (R$) *</label>
            <input className={inputCls} value={valorNovo} onChange={e => setValorNovo(e.target.value)} />
          </div>
        </div>
      </div>

      {/* PRODUTO NA TROCA */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-orange-600 uppercase tracking-wide">III – Produto na Troca</h2>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={temTroca} onChange={e => setTemTroca(e.target.checked)} className="rounded" />
            Tem troca
          </label>
        </div>

        {temTroca && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 sm:col-span-1">
                <label className={labelCls}>Produto usado</label>
                <input className={inputCls} value={produtoUsado} onChange={e => setProdutoUsado(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Storage</label>
                <input className={inputCls} value={storageUsado} onChange={e => setStorageUsado(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Cor</label>
                <input className={inputCls} value={corUsada} onChange={e => setCorUsada(e.target.value)} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Condições do aparelho</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {CONDICOES_PADRAO.map(c => (
                  <button
                    key={c}
                    onClick={() => toggleCondicao(c)}
                    className={`text-xs px-3 py-1 rounded-full border transition ${
                      condicoesSelecionadas.includes(c)
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-gray-600 border-gray-300 hover:border-orange-300"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <input
                className={`${inputCls} mt-2`}
                value={outraCondicao}
                onChange={e => setOutraCondicao(e.target.value)}
                placeholder="Outra condição (opcional)"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Saúde da bateria (%)</label>
                <input className={inputCls} value={bateria} onChange={e => setBateria(e.target.value)} type="number" min="1" max="100" />
              </div>
              <div>
                <label className={labelCls}>Valor avaliado (R$)</label>
                <input className={inputCls} value={valorUsado} onChange={e => setValorUsado(e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PAGAMENTO E PRAZO */}
      <div className={sectionCls}>
        <h2 className="text-sm font-bold text-orange-600 uppercase tracking-wide mb-4">IV – Pagamento e Prazo</h2>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Forma de pagamento</label>
            <select className={inputCls} value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)}>
              {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <input
              className={`${inputCls} mt-2`}
              value={formaPagamento}
              onChange={e => setFormaPagamento(e.target.value)}
              placeholder=""
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Prazo de entrega (dias úteis)</label>
              <input className={inputCls} value={prazoEntrega} onChange={e => setPrazoEntrega(e.target.value)} type="number" min="1" max="60" />
            </div>
            <div>
              <label className={labelCls}>Data do contrato</label>
              <input className={inputCls} value={dataContrato} onChange={e => setDataContrato(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* RESUMO */}
      {(vNovo > 0 || vUsado > 0) && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm space-y-1">
          <p className="font-bold text-orange-700 mb-2">Resumo Financeiro</p>
          <div className="flex justify-between text-gray-700">
            <span>Produto novo:</span>
            <span className="font-semibold">{fmtBRL(vNovo)}</span>
          </div>
          {temTroca && vUsado > 0 && (
            <div className="flex justify-between text-gray-700">
              <span>Valor na troca:</span>
              <span className="font-semibold text-green-600">– {fmtBRL(vUsado)}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-800 font-bold border-t border-orange-200 pt-1 mt-1">
            <span>Valor a pagar:</span>
            <span className="text-orange-600">{fmtBRL(restante)}</span>
          </div>
        </div>
      )}

      {/* BOTÃO GERAR */}
      {msg && (
        <p className={`text-sm font-medium ${msg.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>{msg}</p>
      )}

      <button
        onClick={gerarPDF}
        disabled={loading}
        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl text-base transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <><span className="animate-spin">⏳</span> Gerando PDF...</>
        ) : (
          <>📄 Gerar Contrato PDF</>
        )}
      </button>
    </div>
  );
}
