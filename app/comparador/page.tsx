"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { getTema, temaCSSVars } from "@/lib/temas";

interface Variacao { id: string; nome: string; preco: number; atributos: Record<string, string>; }
interface Produto { id: string; nome: string; slug: string; categoria: string; categoriaEmoji?: string; imagem: string | null; variacoes: Variacao[]; }
interface Config { tema?: string; }

function formatBRL(v: number) { return v ? `R$ ${v.toLocaleString("pt-BR")}` : "Consulte"; }

export default function ComparadorPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [config, setConfig] = useState<Config>({ tema: "tigrao" });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const tema = useMemo(() => getTema(config.tema), [config.tema]);
  const cssVars = useMemo(() => temaCSSVars(tema), [tema]);

  useEffect(() => {
    fetch("/api/loja?format=grouped").then(r => r.json()).then(d => {
      setProdutos(d.produtos ?? []);
      if (d.config) setConfig(d.config);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return produtos;
    return produtos.filter(p => p.nome.toLowerCase().includes(search.toLowerCase()));
  }, [produtos, search]);

  const selectedProdutos = useMemo(() => selected.map(id => produtos.find(p => p.id === id)).filter(Boolean) as Produto[], [selected, produtos]);

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 3 ? [...prev, id] : prev);
  }

  const getMinPreco = (p: Produto) => Math.min(...p.variacoes.map(v => Number(v.preco)).filter(v => v > 0), Infinity);
  const getMaxPreco = (p: Produto) => Math.max(...p.variacoes.map(v => Number(v.preco)).filter(v => v > 0), 0);
  const getStorages = (p: Produto) => [...new Set(p.variacoes.map(v => v.atributos?.armazenamento || v.atributos?.storage).filter(Boolean))];
  const getCores = (p: Produto) => [...new Set(p.variacoes.map(v => v.atributos?.cor).filter(Boolean))];

  if (loading) return <div style={{ backgroundColor: tema.bg, color: tema.text, ...cssVars } as React.CSSProperties} className="min-h-dvh flex items-center justify-center"><p>Carregando...</p></div>;

  return (
    <div style={{ backgroundColor: tema.bg, color: tema.text, ...cssVars } as React.CSSProperties} className="min-h-dvh">
      <header style={{ backgroundColor: tema.headerBg, borderColor: tema.cardBorder }} className="sticky top-0 z-50 backdrop-blur-xl border-b">
        <div className="max-w-[1280px] mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2"><span className="text-2xl">🐯</span><span className="text-[17px] font-bold">TigraoImports</span></Link>
          <Link href="/" style={{ backgroundColor: tema.bgSecondary, color: tema.text }} className="px-3 py-1.5 rounded-full text-[13px] font-medium">Voltar</Link>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-4 py-6">
        <h1 className="text-[24px] font-bold mb-2">Comparador de Produtos</h1>
        <p className="text-[14px] mb-6" style={{ color: tema.textMuted }}>Selecione ate 3 produtos para comparar lado a lado</p>

        {/* Tabela comparativa */}
        {selectedProdutos.length >= 2 && (
          <div className="mb-8 overflow-x-auto">
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: tema.cardBorder, backgroundColor: tema.cardBg }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: tema.bgSecondary }}>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase" style={{ color: tema.textMuted }}>Specs</th>
                    {selectedProdutos.map(p => (
                      <th key={p.id} className="px-4 py-3 text-center min-w-[140px]">
                        <div className="text-[13px] font-bold">{p.nome}</div>
                        <button onClick={() => toggleSelect(p.id)} className="text-[10px] text-red-500 mt-1">remover</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderColor: tema.cardBorder }} className="border-t">
                    <td className="px-4 py-3 font-medium" style={{ color: tema.textMuted }}>Preco (a partir de)</td>
                    {selectedProdutos.map(p => <td key={p.id} className="px-4 py-3 text-center font-bold" style={{ color: tema.accent }}>{formatBRL(getMinPreco(p))}</td>)}
                  </tr>
                  <tr style={{ borderColor: tema.cardBorder }} className="border-t">
                    <td className="px-4 py-3 font-medium" style={{ color: tema.textMuted }}>Preco maximo</td>
                    {selectedProdutos.map(p => <td key={p.id} className="px-4 py-3 text-center">{formatBRL(getMaxPreco(p))}</td>)}
                  </tr>
                  <tr style={{ borderColor: tema.cardBorder }} className="border-t">
                    <td className="px-4 py-3 font-medium" style={{ color: tema.textMuted }}>Armazenamento</td>
                    {selectedProdutos.map(p => <td key={p.id} className="px-4 py-3 text-center text-xs">{getStorages(p).join(", ") || "-"}</td>)}
                  </tr>
                  <tr style={{ borderColor: tema.cardBorder }} className="border-t">
                    <td className="px-4 py-3 font-medium" style={{ color: tema.textMuted }}>Cores</td>
                    {selectedProdutos.map(p => <td key={p.id} className="px-4 py-3 text-center text-xs">{getCores(p).join(", ") || "-"}</td>)}
                  </tr>
                  <tr style={{ borderColor: tema.cardBorder }} className="border-t">
                    <td className="px-4 py-3 font-medium" style={{ color: tema.textMuted }}>Variacoes</td>
                    {selectedProdutos.map(p => <td key={p.id} className="px-4 py-3 text-center">{p.variacoes.length}</td>)}
                  </tr>
                  <tr style={{ borderColor: tema.cardBorder }} className="border-t">
                    <td className="px-4 py-3 font-medium" style={{ color: tema.textMuted }}>21x no cartao</td>
                    {selectedProdutos.map(p => { const v = getMinPreco(p); const parc = Math.round((v * 1.21) / 21); return <td key={p.id} className="px-4 py-3 text-center text-xs">{v > 0 ? `${formatBRL(parc)}/mes` : "-"}</td>; })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Busca + Grid de seleção */}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto..."
          className="w-full px-4 py-3 rounded-xl border text-[14px] mb-4" style={{ borderColor: tema.cardBorder, backgroundColor: tema.cardBg, color: tema.text }} />

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map(p => {
            const isSel = selected.includes(p.id);
            return (
              <button key={p.id} onClick={() => toggleSelect(p.id)}
                className={`text-left rounded-xl border p-3 transition-all ${isSel ? "ring-2" : ""}`}
                style={{ borderColor: isSel ? tema.accent : tema.cardBorder, backgroundColor: tema.cardBg, ...(isSel ? { ringColor: tema.accent } : {}) }}>
                <div className="text-[28px] text-center mb-2">{p.categoriaEmoji || "📦"}</div>
                <p className="text-[12px] font-semibold line-clamp-2">{p.nome}</p>
                <p className="text-[11px] mt-1" style={{ color: tema.accent }}>{formatBRL(getMinPreco(p))}</p>
                {isSel && <span className="block mt-1 text-[10px] text-center font-bold" style={{ color: tema.accent }}>SELECIONADO</span>}
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
