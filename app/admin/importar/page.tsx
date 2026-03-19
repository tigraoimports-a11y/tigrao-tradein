"use client";

import { useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import Papa from "papaparse";

export default function ImportarPage() {
  const { password } = useAdmin();
  const [table, setTable] = useState<"vendas" | "gastos">("vendas");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: { row: number; error: string }[]; total: number } | null>(null);

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
        } else if (["qnt_parcelas", "parc_alt"].includes(k)) {
          obj[k] = parseInt(val) || null;
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
      <h2 className="text-lg font-bold text-[#1D1D1F]">Importar CSV</h2>

      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 shadow-sm space-y-6">
        {/* Seleção de tabela */}
        <div className="flex gap-4 items-center">
          <div>
            <p className="text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-1">Tabela destino</p>
            <select value={table} onChange={(e) => setTable(e.target.value as "vendas" | "gastos")} className="px-3 py-2 rounded-xl border border-[#D2D2D7] text-sm">
              <option value="vendas">Vendas</option>
              <option value="gastos">Gastos</option>
            </select>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-1">Arquivo CSV</p>
            <input type="file" accept=".csv" onChange={handleFile} className="text-sm" />
          </div>
        </div>

        {/* Info das colunas esperadas */}
        <div className="p-4 bg-[#F5F5F7] rounded-xl text-xs text-[#86868B]">
          {table === "vendas" ? (
            <p><strong>Colunas esperadas:</strong> data, cliente, origem, tipo, produto, fornecedor, custo, preco_vendido, banco, forma, recebimento, qnt_parcelas, bandeira, local, produto_na_troca, sinal_antecipado, banco_sinal</p>
          ) : (
            <p><strong>Colunas esperadas:</strong> data, tipo, categoria, descricao, valor, banco, observacao, is_dep_esp</p>
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
