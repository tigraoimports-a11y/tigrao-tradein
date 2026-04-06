"use client";
import { useState, useEffect, useRef } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { hojeBR } from "@/lib/date-utils";

interface EstoqueItem {
  id: string;
  produto: string;
  cor: string | null;
  qnt: number;
  serial_no: string | null;
  imei: string | null;
  status: string;
}

export default function RegistrarVendaPage() {
  const { password, user, apiHeaders, darkMode } = useAdmin();
  const dm = darkMode;

  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<EstoqueItem[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [produtoSelecionado, setProdutoSelecionado] = useState<EstoqueItem | null>(null);
  const [cliente, setCliente] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  const bg = dm ? "bg-[#1C1C1E]" : "bg-[#F5F5F7]";
  const card = dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-white border-[#E8E8ED]";
  const txt = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const sub = dm ? "text-[#AEAEB2]" : "text-[#6E6E73]";
  const inp = dm
    ? "bg-[#3A3A3C] border-[#48484A] text-[#F5F5F7] placeholder-[#6E6E73]"
    : "bg-white border-[#C7C7CC] text-[#1D1D1F] placeholder-[#AEAEB2]";

  useEffect(() => {
    if (busca.length < 2) { setResultados([]); return; }
    if (buscaTimer.current) clearTimeout(buscaTimer.current);
    buscaTimer.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`/api/estoque?search=${encodeURIComponent(busca)}&status=EM ESTOQUE&limit=20`, {
          headers: apiHeaders(),
        });
        if (r.ok) {
          const j = await r.json();
          setResultados((j.data || []).filter((i: EstoqueItem) => i.qnt > 0));
        }
      } catch { /* ignore */ }
      setBuscando(false);
    }, 300);
  }, [busca, apiHeaders]);

  function selecionarProduto(item: EstoqueItem) {
    setProdutoSelecionado(item);
    setBusca("");
    setResultados([]);
  }

  function limpar() {
    setProdutoSelecionado(null);
    setCliente("");
    setObs("");
    setBusca("");
    setResultados([]);
    setTimeout(() => buscaRef.current?.focus(), 100);
  }

  async function registrar() {
    if (!produtoSelecionado) { setMsg({ tipo: "erro", texto: "Selecione um produto." }); return; }
    if (!cliente.trim()) { setMsg({ tipo: "erro", texto: "Informe o nome do cliente." }); return; }

    setSalvando(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        data: hojeBR(),
        cliente: cliente.trim().toUpperCase(),
        produto: produtoSelecionado.produto,
        cor: produtoSelecionado.cor || null,
        status_pagamento: "PENDENTE",
        vendedor: user?.nome || "sistema",
        notas: obs.trim() || null,
        _estoque_id: produtoSelecionado.id,
        serial_no: produtoSelecionado.serial_no || null,
        imei: produtoSelecionado.imei || null,
      };

      const res = await fetch("/api/vendas", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders() },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        setMsg({ tipo: "erro", texto: err.error || "Erro ao registrar venda." });
        return;
      }

      setMsg({ tipo: "ok", texto: `Venda registrada! ${produtoSelecionado.produto} → ${cliente.trim().toUpperCase()}` });
      limpar();
    } catch {
      setMsg({ tipo: "erro", texto: "Erro de conexão." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className={`min-h-screen ${bg} p-4 md:p-6`}>
      <div className="max-w-lg mx-auto space-y-4">
        <div>
          <h1 className={`text-2xl font-bold ${txt}`}>Registrar Venda</h1>
          <p className={`text-sm mt-1 ${sub}`}>Produto sai do estoque imediatamente. Pagamento será definido depois.</p>
        </div>

        {/* Mensagem de feedback */}
        {msg && (
          <div className={`p-3 rounded-xl text-sm font-medium ${msg.tipo === "ok" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            {msg.texto}
          </div>
        )}

        {/* Busca de produto */}
        <div className={`${card} border rounded-2xl p-4 space-y-3`}>
          <p className={`text-xs font-bold uppercase tracking-wide ${sub}`}>1. Produto</p>

          {produtoSelecionado ? (
            <div className="flex items-center justify-between gap-3">
              <div className={`flex-1 rounded-xl border p-3 ${dm ? "bg-[#3A3A3C] border-[#48484A]" : "bg-[#F5F5F7] border-[#E8E8ED]"}`}>
                <p className={`font-semibold text-sm ${txt}`}>{produtoSelecionado.produto}</p>
                {produtoSelecionado.cor && <p className={`text-xs ${sub}`}>{produtoSelecionado.cor}</p>}
                {produtoSelecionado.serial_no && <p className={`text-xs font-mono ${sub}`}>SN: {produtoSelecionado.serial_no}</p>}
              </div>
              <button onClick={limpar} className={`text-xs px-3 py-1.5 rounded-lg border ${dm ? "border-[#48484A] text-[#AEAEB2]" : "border-[#C7C7CC] text-[#6E6E73]"}`}>
                Trocar
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                ref={buscaRef}
                autoFocus
                className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-orange-200 ${inp}`}
                placeholder="Buscar produto por nome ou serial..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
              {buscando && <p className={`text-xs mt-1 ${sub}`}>Buscando...</p>}
              {resultados.length > 0 && (
                <div className={`absolute z-10 w-full mt-1 rounded-xl border shadow-lg overflow-hidden ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-white border-[#E8E8ED]"}`}>
                  {resultados.map(item => (
                    <button
                      key={item.id}
                      onClick={() => selecionarProduto(item)}
                      className={`w-full text-left px-4 py-3 text-sm border-b last:border-b-0 transition ${dm ? "border-[#3A3A3C] hover:bg-[#3A3A3C]" : "border-[#F5F5F7] hover:bg-[#F5F5F7]"}`}
                    >
                      <span className={`font-medium ${txt}`}>{item.produto}</span>
                      {item.cor && <span className={`ml-2 ${sub}`}>{item.cor}</span>}
                      {item.serial_no && <span className={`ml-2 text-xs font-mono ${sub}`}>SN: {item.serial_no}</span>}
                    </button>
                  ))}
                </div>
              )}
              {busca.length >= 2 && !buscando && resultados.length === 0 && (
                <p className={`text-xs mt-1 ${sub}`}>Nenhum produto encontrado em estoque.</p>
              )}
            </div>
          )}
        </div>

        {/* Cliente */}
        <div className={`${card} border rounded-2xl p-4 space-y-3`}>
          <p className={`text-xs font-bold uppercase tracking-wide ${sub}`}>2. Cliente</p>
          <input
            className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-orange-200 ${inp}`}
            placeholder="Nome do cliente"
            value={cliente}
            onChange={e => setCliente(e.target.value)}
          />
        </div>

        {/* Observação */}
        <div className={`${card} border rounded-2xl p-4 space-y-3`}>
          <p className={`text-xs font-bold uppercase tracking-wide ${sub}`}>3. Observação <span className={`font-normal ${sub}`}>(opcional)</span></p>
          <textarea
            className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#E8740E] focus:ring-1 focus:ring-orange-200 resize-none ${inp}`}
            placeholder="Ex: cliente buscou em loja, produto saiu sem nota..."
            rows={3}
            value={obs}
            onChange={e => setObs(e.target.value)}
          />
        </div>

        {/* Botão */}
        <button
          onClick={registrar}
          disabled={salvando || !produtoSelecionado || !cliente.trim()}
          className="w-full bg-[#E8740E] hover:bg-[#D4600A] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-2xl text-base transition"
        >
          {salvando ? "Registrando..." : "Registrar Venda"}
        </button>

        <p className={`text-center text-xs ${sub}`}>
          O produto sai do estoque agora. André ou Nicolas completarão o pagamento em <strong>Vendas Pendentes</strong>.
        </p>
      </div>
    </div>
  );
}
