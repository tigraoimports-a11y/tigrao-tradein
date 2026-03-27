"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAdmin } from "@/components/admin/AdminShell";
import { CATEGORIAS, CAT_LABELS } from "@/lib/produto-specs";
import { QRCodeCanvas } from "qrcode.react";

interface ProdutoEstoque {
  id: string;
  produto: string;
  categoria: string;
  cor: string | null;
  custo_unitario: number;
  serial_no: string | null;
  imei: string | null;
  tipo: string | null;
  qnt: number;
  preco_venda: number | null;
}

type TamanhoEtiqueta = "pequena" | "media" | "grande";

const TAMANHOS: Record<TamanhoEtiqueta, { label: string; width: string; height: string; fontSize: { nome: string; preco: string; serial: string; marca: string; qr: number } }> = {
  pequena: {
    label: "Pequena (5x3cm)",
    width: "50mm", height: "30mm",
    fontSize: { nome: "7pt", preco: "10pt", serial: "5pt", marca: "5pt", qr: 40 },
  },
  media: {
    label: "Media (7x5cm)",
    width: "70mm", height: "50mm",
    fontSize: { nome: "9pt", preco: "14pt", serial: "6pt", marca: "6pt", qr: 60 },
  },
  grande: {
    label: "Grande (10x7cm)",
    width: "100mm", height: "70mm",
    fontSize: { nome: "12pt", preco: "18pt", serial: "7pt", marca: "8pt", qr: 80 },
  },
};

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Componente de etiqueta individual ──
function EtiquetaPreco({
  produto,
  tamanho,
  precoOverride,
}: {
  produto: ProdutoEstoque;
  tamanho: TamanhoEtiqueta;
  precoOverride?: number | null;
}) {
  const config = TAMANHOS[tamanho];
  const preco = precoOverride ?? produto.preco_venda ?? produto.custo_unitario;
  const qrData = produto.serial_no || produto.imei || produto.id;

  return (
    <div
      className="etiqueta-preco bg-white border border-gray-400 flex flex-col justify-between overflow-hidden"
      style={{
        width: config.width,
        height: config.height,
        padding: tamanho === "pequena" ? "2mm" : tamanho === "media" ? "3mm" : "4mm",
        pageBreakInside: "avoid",
        breakInside: "avoid",
      }}
    >
      {/* Header: marca */}
      <div className="text-center" style={{ marginBottom: tamanho === "pequena" ? "0.5mm" : "1mm" }}>
        <span
          className="font-black tracking-tight"
          style={{
            fontSize: config.fontSize.marca,
            color: "#F97316",
            letterSpacing: "0.5px",
          }}
        >
          TIGRAO IMPORTS
        </span>
      </div>

      {/* Nome do produto */}
      <div className="text-center flex-shrink-0">
        <p
          className="font-bold text-gray-900 leading-tight"
          style={{
            fontSize: config.fontSize.nome,
            lineHeight: 1.15,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as const,
          }}
        >
          {produto.produto}
        </p>
        {produto.cor && tamanho !== "pequena" && (
          <p className="text-gray-500" style={{ fontSize: config.fontSize.serial, marginTop: "0.5mm" }}>
            {produto.cor}
          </p>
        )}
      </div>

      {/* Centro: QR code + preco */}
      <div className="flex items-center justify-center gap-1 flex-1" style={{ minHeight: 0 }}>
        <div className="flex-shrink-0">
          <QRCodeCanvas
            value={qrData}
            size={config.fontSize.qr}
            level="M"
            includeMargin={false}
            bgColor="#ffffff"
            fgColor="#000000"
          />
        </div>
        <div className="text-center flex-1">
          <p
            className="font-black text-gray-900"
            style={{
              fontSize: config.fontSize.preco,
              lineHeight: 1,
            }}
          >
            {formatPrice(preco)}
          </p>
          {tamanho !== "pequena" && (
            <p className="text-gray-400" style={{ fontSize: config.fontSize.serial, marginTop: "0.5mm" }}>
              a vista no PIX
            </p>
          )}
        </div>
      </div>

      {/* Footer: serial */}
      <div className="text-center" style={{ marginTop: tamanho === "pequena" ? "0" : "1mm" }}>
        {produto.serial_no && (
          <p
            className="text-gray-400 font-mono tracking-wider"
            style={{ fontSize: config.fontSize.serial }}
          >
            SN: {produto.serial_no}
          </p>
        )}
        {!produto.serial_no && produto.imei && (
          <p
            className="text-gray-400 font-mono tracking-wider"
            style={{ fontSize: config.fontSize.serial }}
          >
            IMEI: {produto.imei}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Pagina principal ──
export default function EtiquetasPrecoPage() {
  const router = useRouter();
  const { password, user } = useAdmin();
  const printRef = useRef<HTMLDivElement>(null);

  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoria, setCategoria] = useState("");
  const [busca, setBusca] = useState("");
  const [tamanho, setTamanho] = useState<TamanhoEtiqueta>("media");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [precoCustom, setPrecoCustom] = useState<Record<string, string>>({});

  const headers = useCallback(() => ({
    "x-admin-password": password,
    "x-admin-user": encodeURIComponent(user?.nome || "sistema"),
  }), [password, user]);

  // Buscar produtos
  useEffect(() => {
    if (!password) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (categoria) params.set("categoria", categoria);
    fetch(`/api/admin/etiquetas-preco?${params}`, { headers: headers() })
      .then((r) => r.ok ? r.json() : { data: [] })
      .then((json) => setProdutos(json.data || []))
      .catch(() => setProdutos([]))
      .finally(() => setLoading(false));
  }, [password, categoria, headers]);

  // Filtrar por busca
  const produtosFiltrados = produtos.filter((p) => {
    if (!busca) return true;
    const termo = busca.toUpperCase();
    return (
      p.produto.toUpperCase().includes(termo) ||
      (p.serial_no || "").toUpperCase().includes(termo) ||
      (p.imei || "").toUpperCase().includes(termo) ||
      (p.cor || "").toUpperCase().includes(termo)
    );
  });

  // Agrupar por produto (nome)
  const produtosAgrupados = new Map<string, ProdutoEstoque[]>();
  for (const p of produtosFiltrados) {
    const key = p.produto;
    if (!produtosAgrupados.has(key)) produtosAgrupados.set(key, []);
    produtosAgrupados.get(key)!.push(p);
  }

  function toggleSelecionado(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selecionarTodos() {
    if (selecionados.size === produtosFiltrados.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(produtosFiltrados.map((p) => p.id)));
    }
  }

  function selecionarCategoria(cat: string) {
    const ids = produtosFiltrados.filter((p) => p.categoria === cat).map((p) => p.id);
    setSelecionados((prev) => {
      const next = new Set(prev);
      const todosJaSelecionados = ids.every((id) => next.has(id));
      if (todosJaSelecionados) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  const produtosSelecionados = produtosFiltrados.filter((p) => selecionados.has(p.id));

  // Imprimir etiquetas
  function handlePrint() {
    if (produtosSelecionados.length === 0) return;
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;

    // Renderizar no DOM real com React, depois copiar para popup
    const container = document.createElement("div");
    container.id = "print-temp";
    container.style.position = "fixed";
    container.style.left = "-9999px";
    document.body.appendChild(container);

    // Usar import dinamico para renderizar
    import("react-dom/client").then(({ createRoot }) => {
      const root = createRoot(container);
      const config = TAMANHOS[tamanho];

      root.render(
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2mm", padding: "2mm" }}>
          {produtosSelecionados.map((p) => (
            <EtiquetaPreco
              key={p.id}
              produto={p}
              tamanho={tamanho}
              precoOverride={precoCustom[p.id] ? parseFloat(precoCustom[p.id].replace(/\./g, "").replace(",", ".")) : null}
            />
          ))}
        </div>
      );

      // Aguardar render e canvas QR
      setTimeout(() => {
        const html = container.innerHTML;
        root.unmount();
        document.body.removeChild(container);

        // Converter canvas para img no HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const canvases = container.querySelectorAll("canvas");
        // Ja removemos o container, entao vamos usar a abordagem direta

        win.document.write(`<!DOCTYPE html><html><head>
          <title>Etiquetas de Preco - TigraoImports</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { margin: 0; padding: 0; }
            body { font-family: Arial, Helvetica, sans-serif; }
            .print-grid {
              display: flex;
              flex-wrap: wrap;
              gap: 2mm;
              padding: 3mm;
            }
            .etiqueta-preco {
              border: 0.5pt solid #999;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              overflow: hidden;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            @media print {
              @page { margin: 3mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head><body>
          <div class="print-grid">${html}</div>
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 300);
            };
          <\/script>
        </body></html>`);
        win.document.close();
      }, 500);
    });
  }

  // Abordagem alternativa: copiar QR como data URL via canvas
  function handlePrintDirect() {
    if (produtosSelecionados.length === 0) return;
    const config = TAMANHOS[tamanho];
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;

    // Gerar QR codes via qrcode lib (server-side compatible)
    import("qrcode").then((QRCode) => {
      const promises = produtosSelecionados.map(async (p) => {
        const qrData = p.serial_no || p.imei || p.id;
        const precoVal = precoCustom[p.id]
          ? parseFloat(precoCustom[p.id].replace(/\./g, "").replace(",", "."))
          : (p.preco_venda ?? p.custo_unitario);
        const dataUrl = await QRCode.toDataURL(qrData, {
          width: config.fontSize.qr * 3,
          margin: 0,
          errorCorrectionLevel: "M",
        });
        return { ...p, qrDataUrl: dataUrl, precoFinal: precoVal };
      });

      Promise.all(promises).then((items) => {
        const etiquetasHtml = items.map((p) => {
          const serial = p.serial_no || "";
          const imei = p.imei || "";
          return `
            <div class="etiqueta-preco" style="width:${config.width};height:${config.height};padding:${tamanho === "pequena" ? "2mm" : tamanho === "media" ? "3mm" : "4mm"};">
              <div style="text-align:center;margin-bottom:${tamanho === "pequena" ? "0.5mm" : "1mm"}">
                <span style="font-weight:900;font-size:${config.fontSize.marca};color:#F97316;letter-spacing:0.5px;">TIGRAO IMPORTS</span>
              </div>
              <div style="text-align:center;">
                <p style="font-weight:bold;font-size:${config.fontSize.nome};line-height:1.15;color:#111;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${p.produto}</p>
                ${p.cor && tamanho !== "pequena" ? `<p style="font-size:${config.fontSize.serial};color:#666;margin-top:0.5mm;">${p.cor}</p>` : ""}
              </div>
              <div style="display:flex;align-items:center;justify-content:center;gap:${tamanho === "pequena" ? "1mm" : "2mm"};flex:1;min-height:0;">
                <img src="${p.qrDataUrl}" style="width:${config.fontSize.qr}px;height:${config.fontSize.qr}px;" />
                <div style="text-align:center;flex:1;">
                  <p style="font-weight:900;font-size:${config.fontSize.preco};line-height:1;color:#111;">${formatPrice(p.precoFinal)}</p>
                  ${tamanho !== "pequena" ? `<p style="font-size:${config.fontSize.serial};color:#999;margin-top:0.5mm;">a vista no PIX</p>` : ""}
                </div>
              </div>
              <div style="text-align:center;margin-top:${tamanho === "pequena" ? "0" : "1mm"};">
                ${serial ? `<p style="font-size:${config.fontSize.serial};color:#999;font-family:monospace;letter-spacing:1px;">SN: ${serial}</p>` : ""}
                ${!serial && imei ? `<p style="font-size:${config.fontSize.serial};color:#999;font-family:monospace;letter-spacing:1px;">IMEI: ${imei}</p>` : ""}
              </div>
            </div>
          `;
        }).join("");

        win.document.write(`<!DOCTYPE html><html><head>
          <title>Etiquetas de Preco - TigraoImports</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { margin: 0; padding: 0; }
            body { font-family: Arial, Helvetica, sans-serif; }
            .print-grid {
              display: flex;
              flex-wrap: wrap;
              gap: 2mm;
              padding: 3mm;
            }
            .etiqueta-preco {
              border: 0.5pt solid #999;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              overflow: hidden;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            @media print {
              @page { margin: 3mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .etiqueta-preco { border: 0.3pt solid #ccc; }
            }
          </style>
        </head><body>
          <div class="print-grid">${etiquetasHtml}</div>
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 200);
            };
          <\/script>
        </body></html>`);
        win.document.close();
      });
    });
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 focus:outline-none";
  const labelCls = "text-xs font-semibold text-gray-500 mb-1";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/admin")} className="text-gray-400 hover:text-gray-600 text-sm">&larr; Voltar</button>
            <h1 className="text-xl font-bold text-gray-900">Etiquetas de Preco</h1>
          </div>
          <div className="flex items-center gap-2">
            {produtosSelecionados.length > 0 && (
              <span className="text-sm text-orange-600 font-semibold">
                {produtosSelecionados.length} selecionado{produtosSelecionados.length !== 1 ? "s" : ""}
              </span>
            )}
            <button
              onClick={handlePrintDirect}
              disabled={produtosSelecionados.length === 0}
              className="bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Imprimir
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Filtros */}
        <div className="bg-white rounded-2xl shadow-sm border p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Categoria */}
            <div>
              <p className={labelCls}>Categoria</p>
              <select
                value={categoria}
                onChange={(e) => { setCategoria(e.target.value); setSelecionados(new Set()); }}
                className={inputCls}
              >
                <option value="">Todas</option>
                {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
              </select>
            </div>

            {/* Busca */}
            <div className="md:col-span-2">
              <p className={labelCls}>Buscar produto</p>
              <input
                type="text"
                placeholder="Nome, serial, IMEI..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className={inputCls}
              />
            </div>

            {/* Tamanho */}
            <div>
              <p className={labelCls}>Tamanho da etiqueta</p>
              <select
                value={tamanho}
                onChange={(e) => setTamanho(e.target.value as TamanhoEtiqueta)}
                className={inputCls}
              >
                {(Object.keys(TAMANHOS) as TamanhoEtiqueta[]).map((t) => (
                  <option key={t} value={t}>{TAMANHOS[t].label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Acoes rapidas */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={selecionarTodos}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              {selecionados.size === produtosFiltrados.length && produtosFiltrados.length > 0 ? "Desmarcar todos" : "Selecionar todos"}
            </button>
            {categoria && (
              <button
                onClick={() => selecionarCategoria(categoria)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-orange-300 text-orange-600 hover:bg-orange-50 transition-colors"
              >
                Selecionar toda categoria
              </button>
            )}
            {selecionados.size > 0 && (
              <button
                onClick={() => setSelecionados(new Set())}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
              >
                Limpar selecao
              </button>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              {produtosFiltrados.length} produto{produtosFiltrados.length !== 1 ? "s" : ""} encontrado{produtosFiltrados.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent"></div>
            <p className="text-sm text-gray-500 mt-2">Carregando produtos...</p>
          </div>
        )}

        {/* Lista de produtos */}
        {!loading && produtosFiltrados.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
            <p className="text-gray-400 text-lg">Nenhum produto encontrado</p>
            <p className="text-gray-300 text-sm mt-1">Altere os filtros ou adicione produtos ao estoque</p>
          </div>
        )}

        {!loading && produtosFiltrados.length > 0 && (
          <div className="space-y-4">
            {/* Tabela de produtos */}
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selecionados.size === produtosFiltrados.length && produtosFiltrados.length > 0}
                        onChange={selecionarTodos}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Produto</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cor</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Serial/IMEI</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Custo</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Preco Venda</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-32">Preco Etiqueta</th>
                  </tr>
                </thead>
                <tbody>
                  {produtosFiltrados.map((p) => {
                    const selected = selecionados.has(p.id);
                    return (
                      <tr
                        key={p.id}
                        className={`border-b transition-colors cursor-pointer ${selected ? "bg-orange-50" : "hover:bg-gray-50"}`}
                        onClick={() => toggleSelecionado(p.id)}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelecionado(p.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{p.produto}</p>
                          <p className="text-xs text-gray-400">{CAT_LABELS[p.categoria] || p.categoria} {p.tipo === "SEMINOVO" && <span className="text-amber-500 font-semibold">SEMINOVO</span>}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{p.cor || "—"}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                          {p.serial_no || p.imei || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatPrice(p.custo_unitario)}</td>
                        <td className="px-4 py-3">
                          {p.preco_venda ? (
                            <span className="font-semibold text-green-600">{formatPrice(p.preco_venda)}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            placeholder={formatPrice(p.preco_venda ?? p.custo_unitario)}
                            value={precoCustom[p.id] || ""}
                            onChange={(e) => setPrecoCustom((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-orange-400 focus:outline-none"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Preview das etiquetas selecionadas */}
            {produtosSelecionados.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900">
                    Preview ({produtosSelecionados.length} etiqueta{produtosSelecionados.length !== 1 ? "s" : ""})
                  </h3>
                  <button
                    onClick={handlePrintDirect}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2 rounded-xl transition-colors flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Imprimir {produtosSelecionados.length} etiqueta{produtosSelecionados.length !== 1 ? "s" : ""}
                  </button>
                </div>

                <div
                  ref={printRef}
                  className="bg-gray-100 rounded-xl p-4 flex flex-wrap gap-3 justify-center"
                >
                  {produtosSelecionados.map((p) => (
                    <EtiquetaPreco
                      key={p.id}
                      produto={p}
                      tamanho={tamanho}
                      precoOverride={precoCustom[p.id] ? parseFloat(precoCustom[p.id].replace(/\./g, "").replace(",", ".")) : null}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
