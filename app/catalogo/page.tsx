"use client";

import { useEffect, useState } from "react";

interface Variacao { nome: string; preco: number; atributos: Record<string, string>; }
interface Produto { id: string; nome: string; categoria: string; categoriaLabel: string; categoriaEmoji?: string; variacoes: Variacao[]; }

function formatBRL(v: number) { return v ? `R$ ${v.toLocaleString("pt-BR")}` : "Consulte"; }

export default function CatalogoPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/loja?format=grouped").then(r => r.json()).then(d => setProdutos(d.produtos ?? [])).finally(() => setLoading(false));
  }, []);

  const categorias = [...new Set(produtos.map(p => p.categoriaLabel))];
  const data = new Date().toLocaleDateString("pt-BR");

  if (loading) return <div className="min-h-dvh flex items-center justify-center bg-white"><p>Carregando catalogo...</p></div>;

  return (
    <div className="bg-white text-[#1D1D1F] min-h-dvh">
      {/* Header - não aparece no print */}
      <div className="print:hidden sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-50">
        <h1 className="text-lg font-bold">Catalogo TigraoImports</h1>
        <button onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold">📄 Baixar PDF</button>
      </div>

      {/* Conteúdo printável */}
      <div className="max-w-[800px] mx-auto px-8 py-8">
        {/* Capa */}
        <div className="text-center mb-12 print:mb-8">
          <p className="text-6xl mb-4">🐯</p>
          <h1 className="text-3xl font-bold">TigraoImports</h1>
          <p className="text-lg text-gray-500 mt-2">Catalogo de Produtos</p>
          <p className="text-sm text-gray-400 mt-1">{data}</p>
          <div className="flex justify-center gap-4 mt-6 text-xs text-gray-500">
            <span>📦 Lacrado</span>
            <span>🔒 Garantia Apple 1 ano</span>
            <span>🧾 Nota Fiscal</span>
          </div>
        </div>

        {categorias.map(cat => {
          const prods = produtos.filter(p => p.categoriaLabel === cat);
          if (prods.length === 0) return null;
          return (
            <div key={cat} className="mb-10 print:break-inside-avoid">
              <h2 className="text-xl font-bold border-b-2 border-[#E8740E] pb-2 mb-4">
                {prods[0]?.categoriaEmoji || "📦"} {cat}
              </h2>
              {prods.map(p => {
                const minPreco = Math.min(...p.variacoes.map(v => Number(v.preco)).filter(v => v > 0), Infinity);
                const storages = [...new Set(p.variacoes.map(v => v.atributos?.armazenamento || v.atributos?.storage).filter(Boolean))];
                const cores = [...new Set(p.variacoes.map(v => v.atributos?.cor).filter(Boolean))];
                return (
                  <div key={p.id} className="mb-4 p-4 rounded-xl border border-gray-200 print:break-inside-avoid">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-bold">{p.nome}</h3>
                        {storages.length > 0 && <p className="text-xs text-gray-500 mt-1">Armazenamento: {storages.join(" | ")}</p>}
                        {cores.length > 0 && <p className="text-xs text-gray-500">Cores: {cores.join(", ")}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-[#E8740E]">{minPreco < Infinity ? formatBRL(minPreco) : "Consulte"}</p>
                        {minPreco < Infinity && <p className="text-[10px] text-gray-400">ou 21x de {formatBRL(Math.round((minPreco * 1.21) / 21))}</p>}
                      </div>
                    </div>
                    {p.variacoes.length > 1 && (
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
                        {p.variacoes.map((v, i) => (
                          <div key={i} className="text-[10px] px-2 py-1 rounded bg-gray-50 flex justify-between">
                            <span className="text-gray-600">{v.nome}</span>
                            <span className="font-semibold">{formatBRL(Number(v.preco))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Rodapé */}
        <div className="text-center text-xs text-gray-400 mt-12 pt-4 border-t">
          <p>TigraoImports — Barra da Tijuca, Rio de Janeiro</p>
          <p className="mt-1">Precos validos por 24h | Sujeitos a disponibilidade</p>
          <p className="mt-1">WhatsApp: (21) 97246-1357 | @tigraoimports</p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 15mm; }
        }
      `}</style>
    </div>
  );
}
