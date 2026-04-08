"use client";

import { useEffect, useState, useCallback } from "react";
import { useAutoRefetch } from "@/lib/useAutoRefetch";
import { useAdmin } from "@/components/admin/AdminShell";

interface Lista { id: string; nome: string; status: string; data: string; created_at: string; }
interface Item { id: string; lista_id: string; produto: string; quantidade: number; }
interface Preco { id: string; item_id: string; fornecedor: string; preco: number; prazo: string | null; observacao: string | null; }

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

export default function CotacaoPage() {
  const { password, user } = useAdmin();
  const [listas, setListas] = useState<Lista[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [precos, setPrecos] = useState<Preco[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [novaLista, setNovaLista] = useState("");
  const [novoItem, setNovoItem] = useState<Record<string, string>>({});
  const [novoPreco, setNovoPreco] = useState<Record<string, { fornecedor: string; preco: string; prazo: string }>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cotacao", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } });
      if (res.ok) {
        const json = await res.json();
        setListas(json.listas ?? []);
        setItens(json.itens ?? []);
        setPrecos(json.precos ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefetch(fetchData);

  const apiPost = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/cotacao", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const handleCriarLista = async () => {
    if (!novaLista.trim()) return;
    const json = await apiPost({ action: "criar_lista", nome: novaLista });
    if (json.ok) { setNovaLista(""); fetchData(); }
  };

  const handleAddItem = async (listaId: string) => {
    const produto = novoItem[listaId]?.trim();
    if (!produto) return;
    const json = await apiPost({ action: "add_item", lista_id: listaId, produto });
    if (json.ok) { setNovoItem((p) => ({ ...p, [listaId]: "" })); fetchData(); }
  };

  const handleAddPreco = async (itemId: string) => {
    const p = novoPreco[itemId];
    if (!p?.fornecedor || !p?.preco) return;
    const json = await apiPost({ action: "add_preco", item_id: itemId, fornecedor: p.fornecedor, preco: parseFloat(p.preco), prazo: p.prazo || null });
    if (json.ok) { setNovoPreco((prev) => ({ ...prev, [itemId]: { fornecedor: "", preco: "", prazo: "" } })); fetchData(); }
  };

  const inputCls = "px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] text-sm focus:outline-none focus:border-[#E8740E] transition-colors";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold text-[#1D1D1F]">Cotacao de Fornecedores</h2>
        <div className="flex gap-2">
          <input value={novaLista} onChange={(e) => setNovaLista(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCriarLista()} placeholder="Nome da lista..." className={`${inputCls} w-48`} />
          <button onClick={handleCriarLista} className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623]">Nova Lista</button>
        </div>
      </div>

      {msg && <div className="px-4 py-3 rounded-xl text-sm bg-green-50 text-green-700">{msg}</div>}

      {loading ? (
        <div className="py-12 text-center text-[#86868B]">Carregando...</div>
      ) : listas.length === 0 ? (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-12 text-center shadow-sm">
          <p className="text-[#86868B]">Nenhuma lista de cotacao. Crie uma para comecar.</p>
        </div>
      ) : (
        listas.map((lista) => {
          const listaItens = itens.filter((i) => i.lista_id === lista.id);
          const isAberta = lista.status === "ABERTA";

          return (
            <div key={lista.id} className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 bg-[#F5F5F7] border-b border-[#D2D2D7] flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-[#1D1D1F]">{lista.nome}</h3>
                  <span className="text-[10px] text-[#86868B]">{lista.data} | {listaItens.length} itens</span>
                </div>
                <div className="flex gap-2">
                  <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${isAberta ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                    {lista.status}
                  </span>
                  {isAberta && (
                    <button onClick={async () => { await apiPost({ action: "fechar_lista", id: lista.id }); fetchData(); }} className="px-2 py-0.5 rounded-lg text-xs text-[#86868B] border border-[#D2D2D7] hover:text-[#E74C3C]">Fechar</button>
                  )}
                  <button onClick={async () => {
                    if (!confirm("Excluir lista?")) return;
                    await apiPost({ action: "delete_lista", id: lista.id });
                    fetchData();
                  }} className="text-[#86868B] hover:text-red-500 text-xs">X</button>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {listaItens.map((item) => {
                  const itemPrecos = precos.filter((p) => p.item_id === item.id);
                  const melhorPreco = itemPrecos.length > 0 ? Math.min(...itemPrecos.map((p) => p.preco)) : null;
                  const pp = novoPreco[item.id] ?? { fornecedor: "", preco: "", prazo: "" };

                  return (
                    <div key={item.id} className="border border-[#E8E8ED] rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{item.produto} <span className="text-[#86868B] text-xs">x{item.quantidade}</span></span>
                        <div className="flex items-center gap-2">
                          {melhorPreco && <span className="text-xs text-green-600 font-bold">Melhor: {fmt(melhorPreco)}</span>}
                          <button onClick={async () => { await apiPost({ action: "delete_item", id: item.id }); fetchData(); }} className="text-[#86868B] hover:text-red-500 text-[10px]">X</button>
                        </div>
                      </div>

                      {/* Precos dos fornecedores */}
                      {itemPrecos.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 mb-2">
                          {itemPrecos.map((p) => (
                            <div key={p.id} className={`flex items-center justify-between px-2 py-1 rounded-lg text-xs ${p.preco === melhorPreco ? "bg-green-50 border border-green-200" : "bg-[#F5F5F7]"}`}>
                              <span className="text-[#1D1D1F]">{p.fornecedor}</span>
                              <div className="flex items-center gap-1">
                                <span className={`font-bold ${p.preco === melhorPreco ? "text-green-600" : "text-[#1D1D1F]"}`}>{fmt(p.preco)}</span>
                                <button onClick={async () => { await apiPost({ action: "delete_preco", id: p.id }); fetchData(); }} className="text-[#86868B] hover:text-red-500 text-[8px]">x</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Adicionar preço */}
                      {isAberta && (
                        <div className="flex gap-1.5 items-center">
                          <input value={pp.fornecedor} onChange={(e) => setNovoPreco((prev) => ({ ...prev, [item.id]: { ...pp, fornecedor: e.target.value } }))} placeholder="Fornecedor" className={`${inputCls} flex-1 !py-1.5 text-xs`} />
                          <input type="number" value={pp.preco} onChange={(e) => setNovoPreco((prev) => ({ ...prev, [item.id]: { ...pp, preco: e.target.value } }))} placeholder="R$" className={`${inputCls} w-24 !py-1.5 text-xs`} />
                          <input value={pp.prazo} onChange={(e) => setNovoPreco((prev) => ({ ...prev, [item.id]: { ...pp, prazo: e.target.value } }))} placeholder="Prazo" className={`${inputCls} w-20 !py-1.5 text-xs`} />
                          <button onClick={() => handleAddPreco(item.id)} className="px-3 py-1.5 rounded-lg bg-[#E8740E] text-white text-xs font-semibold">+</button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Adicionar item */}
                {isAberta && (
                  <div className="flex gap-2 items-center pt-2 border-t border-[#F5F5F7]">
                    <input value={novoItem[lista.id] ?? ""} onChange={(e) => setNovoItem((p) => ({ ...p, [lista.id]: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && handleAddItem(lista.id)} placeholder="Adicionar produto..." className={`${inputCls} flex-1`} />
                    <button onClick={() => handleAddItem(lista.id)} className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold">Adicionar</button>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
