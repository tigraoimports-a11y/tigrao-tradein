"use client";

import { useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import Papa from "papaparse";

export default function ImportarPage() {
  const { password } = useAdmin();
  const [table, setTable] = useState<"vendas" | "gastos" | "estoque">("vendas");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: { row: number; error: string }[]; total: number } | null>(null);
  const [quickImporting, setQuickImporting] = useState("");
  const [quickMsg, setQuickMsg] = useState("");

  const handleQuickImport = async (tipo: "vendas" | "gastos" | "estoque") => {
    setQuickImporting(tipo);
    setQuickMsg("");
    try {
      const res = await fetch(`/${tipo}-initial.json`);
      const data = await res.json();

      const endpoint = tipo === "estoque" ? "/api/estoque" : `/api/importar`;
      const body = tipo === "estoque"
        ? { action: "import", rows: data }
        : { table: tipo, rows: data };

      const importRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify(body),
      });
      const json = await importRes.json();
      if (json.ok || json.imported) {
        setQuickMsg(`${json.imported ?? data.length} registros de ${tipo} importados!`);
      } else {
        setQuickMsg(`Erro: ${json.error}`);
      }
    } catch (err) {
      setQuickMsg(`Erro: ${String(err)}`);
    }
    setQuickImporting("");
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const data = res.data as Record<string, string>[];
        setHeaders(res.meta.fields ?? []);
        setRows(data);
        setResult(null);
      },
    });
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    setResult(null);

    // Mapear campos para o formato do banco
    const mapped = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(row)) {
        const k = key.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
        if (!val || val.trim() === "") continue;

        // Tentar converter números
        if (["custo", "preco_vendido", "valor", "sinal_antecipado", "entrada_pix", "valor_comprovante", "comp_alt"].includes(k)) {
          obj[k] = parseFloat(val.replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
        } else if (["qnt_parcelas", "parc_alt", "qnt"].includes(k)) {
          obj[k] = parseInt(val) || 0;
        } else if (k === "is_dep_esp") {
          obj[k] = val.toLowerCase() === "true" || val === "1" || val.toLowerCase() === "sim";
        } else {
          obj[k] = val.trim();
        }
      }
      return obj;
    });

    const res = await fetch("/api/importar", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ table, rows: mapped }),
    });
    const json = await res.json();
    setResult(json);
    setImporting(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-[#1D1D1F]">Importar Dados</h2>

      {quickMsg && <div className={`px-4 py-3 rounded-xl text-sm ${quickMsg.includes("Erro") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{quickMsg}</div>}

      {/* Importação rápida das planilhas Numbers */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold text-[#1D1D1F] mb-1">Importacao Rapida — Planilhas Numbers</h3>
        <p className="text-xs text-[#86868B] mb-4">Dados extraidos de VENDAS MARCO 2026 e ESTOQUE 2026</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => handleQuickImport("vendas")}
            disabled={!!quickImporting}
            className="px-4 py-4 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50 text-center"
          >
            {quickImporting === "vendas" ? "Importando..." : "Importar 297 Vendas"}
            <span className="block text-xs font-normal mt-1 opacity-80">Marco 2026</span>
          </button>
          <button
            onClick={() => handleQuickImport("gastos")}
            disabled={!!quickImporting}
            className="px-4 py-4 rounded-xl bg-[#E74C3C] text-white font-semibold hover:bg-[#C0392B] transition-colors disabled:opacity-50 text-center"
          >
            {quickImporting === "gastos" ? "Importando..." : "Importar 143 Gastos"}
            <span className="block text-xs font-normal mt-1 opacity-80">Marco 2026</span>
          </button>
          <button
            onClick={() => handleQuickImport("estoque")}
            disabled={!!quickImporting}
            className="px-4 py-4 rounded-xl bg-[#2ECC71] text-white font-semibold hover:bg-[#27AE60] transition-colors disabled:opacity-50 text-center"
          >
            {quickImporting === "estoque" ? "Importando..." : "Importar 129 Produtos"}
            <span className="block text-xs font-normal mt-1 opacity-80">Estoque 2026</span>
          </button>
          <button
            onClick={async () => {
              setQuickImporting("extras");
              setQuickMsg("");
              try {
                const res = await fetch("/estoque-extras.json");
                const data = await res.json();
                const importRes = await fetch("/api/estoque", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-admin-password": password },
                  body: JSON.stringify({ action: "import", rows: data }),
                });
                const json = await importRes.json();
                setQuickMsg(json.ok ? `${json.imported} pendencias e a caminho importados!` : `Erro: ${json.error}`);
              } catch (err) { setQuickMsg(`Erro: ${String(err)}`); }
              setQuickImporting("");
            }}
            disabled={!!quickImporting}
            className="px-4 py-4 rounded-xl bg-[#F39C12] text-white font-semibold hover:bg-[#E67E22] transition-colors disabled:opacity-50 text-center"
          >
            {quickImporting === "extras" ? "Importando..." : "Importar Pendencias + A Caminho"}
            <span className="block text-xs font-normal mt-1 opacity-80">5 pendencias + 9 a caminho</span>
          </button>
        </div>
      </div>

      {/* Upload CSV manual */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 shadow-sm space-y-6">
        {/* Seleção de tabela */}
        <div className="flex gap-4 items-center">
          <div>
            <p className="text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-1">Tabela destino</p>
            <select value={table} onChange={(e) => setTable(e.target.value as "vendas" | "gastos" | "estoque")} className="px-3 py-2 rounded-xl border border-[#D2D2D7] text-sm">
              <option value="vendas">Vendas</option>
              <option value="gastos">Gastos</option>
              <option value="estoque">Estoque</option>
            </select>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-1">Arquivo CSV</p>
            <input type="file" accept=".csv" onChange={handleFile} className="text-sm" />
          </div>
        </div>

        {/* Instruções Numbers */}
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 space-y-2">
          <p className="font-semibold">Como exportar do Numbers:</p>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li>Abra sua planilha no Numbers</li>
            <li>Selecione a <strong>aba</strong> que quer exportar (Vendas OU Gastos)</li>
            <li>Va em <strong>Arquivo &gt; Exportar &gt; CSV</strong></li>
            <li>Salve o arquivo .csv</li>
            <li>Faca upload aqui selecionando a tabela correta</li>
          </ol>
          <p className="text-xs text-amber-600">O formato .numbers nao e suportado diretamente. Exporte cada aba como CSV separadamente.</p>
        </div>

        {/* Info das colunas esperadas */}
        <div className="p-4 bg-[#F5F5F7] rounded-xl text-xs text-[#86868B]">
          {table === "vendas" ? (
            <div>
              <p className="font-semibold mb-1">Colunas esperadas para VENDAS:</p>
              <p>data, cliente, origem (ANUNCIO/RECOMPRA/INDICACAO/ATACADO), tipo (VENDA/UPGRADE/ATACADO), produto, fornecedor, custo, preco_vendido, banco (ITAU/INFINITE/MERCADO_PAGO/ESPECIE), forma (PIX/CARTAO/DINHEIRO/FIADO), recebimento (D+0/D+1/FIADO)</p>
              <p className="mt-1 text-[#86868B]">Colunas opcionais: qnt_parcelas, bandeira, local, produto_na_troca, sinal_antecipado, banco_sinal</p>
            </div>
          ) : table === "gastos" ? (
            <div>
              <p className="font-semibold mb-1">Colunas esperadas para GASTOS:</p>
              <p>data, tipo (SAIDA/ENTRADA), categoria, valor, banco (ITAU/INFINITE/MERCADO_PAGO/ESPECIE)</p>
              <p className="mt-1 text-[#86868B]">Colunas opcionais: descricao, observacao, is_dep_esp (sim/nao)</p>
            </div>
          ) : (
            <div>
              <p className="font-semibold mb-1">Colunas esperadas para ESTOQUE:</p>
              <p>produto, categoria (IPHONES/IPADS/MACBOOK/APPLE_WATCH/AIRPODS/ACESSORIOS/OUTROS), qnt, custo_unitario</p>
              <p className="mt-1 text-[#86868B]">Colunas opcionais: status, fornecedor, cor, observacao</p>
            </div>
          )}
        </div>

        {/* Preview */}
        {rows.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-[#1D1D1F] mb-2">{rows.length} linhas encontradas — Preview (5 primeiras):</p>
            <div className="overflow-x-auto border border-[#D2D2D7] rounded-xl">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#F5F5F7]">
                    {headers.map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-[#86868B] font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t border-[#F5F5F7]">
                      {headers.map((h) => (
                        <td key={h} className="px-3 py-2 whitespace-nowrap max-w-[150px] truncate">{row[h] || "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={handleImport}
              disabled={importing}
              className="mt-4 px-6 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
            >
              {importing ? "Importando..." : `Importar ${rows.length} linhas para ${table}`}
            </button>
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div className={`p-4 rounded-xl text-sm ${result.errors.length > 0 ? "bg-yellow-50 text-yellow-700" : "bg-green-50 text-green-700"}`}>
            <p><strong>{result.imported}</strong> de {result.total} linhas importadas com sucesso.</p>
            {result.errors.length > 0 && (
              <div className="mt-2">
                <p className="font-semibold">Erros:</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs">Linha {e.row}: {e.error}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
