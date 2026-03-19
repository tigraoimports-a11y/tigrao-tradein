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
  const [jsonDirect, setJsonDirect] = useState(false);
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
        : { table: tipo, rows: data, autoStatus: tipo === "vendas" };

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

    // JSON files (e.g. estoque-merged.json) — import directly
    if (file.name.endsWith(".json")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (Array.isArray(data) && data.length > 0) {
            setHeaders(Object.keys(data[0]));
            setRows(data);
            setJsonDirect(true);
            setResult(null);
          }
        } catch (err) {
          alert("Erro ao ler JSON: " + String(err));
        }
      };
      reader.readAsText(file);
      return;
    }

    setJsonDirect(false);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const data = res.data as Record<string, string>[];
        // Filtrar linhas em branco — só manter linhas que tenham pelo menos
        // CLIENTE ou PRODUTO ou DESCRICAO ou CATEGORIA preenchido
        const filtered = data.filter(row => {
          const vals = Object.values(row).map(v => (v || "").trim());
          const nonEmpty = vals.filter(v => v.length > 0);
          // Pelo menos 3 campos preenchidos para ser uma linha válida
          return nonEmpty.length >= 3;
        });
        setHeaders(res.meta.fields ?? []);
        setRows(filtered);
        setResult(null);
      },
    });
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    setResult(null);

    // JSON direto (ex: estoque-merged.json) — envia sem transformar
    if (jsonDirect) {
      const res = await fetch("/api/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ table, rows, autoStatus: false }),
      });
      const json = await res.json();
      setResult(json);
      setImporting(false);
      return;
    }

    // Mapear campos para o formato do banco
    const numericFields = ["custo", "preco_vendido", "valor", "sinal_antecipado", "entrada_pix", "valor_comprovante", "comp_alt", "custo_unitario"];
    const intFields = ["qnt_parcelas", "parc_alt", "qnt", "bateria"];

    // Converter data do Numbers (DD/MM/YY ou DD/MM/YYYY) para YYYY-MM-DD
    function parseDate(val: string): string {
      // Já no formato ISO
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
      // DD/MM/YY ou DD/MM/YYYY
      const m = val.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
      if (m) {
        const day = m[1].padStart(2, "0");
        const month = m[2].padStart(2, "0");
        let year = m[3];
        if (year.length === 2) year = `20${year}`;
        return `${year}-${month}-${day}`;
      }
      return val;
    }

    // Converter R$ 8.181,00 → 8181
    function parseReais(val: string): number {
      // Remove "R$", espaços, pontos de milhar, troca vírgula por ponto
      const clean = val.replace(/R\$\s*/gi, "").replace(/\./g, "").replace(",", ".").trim();
      return parseFloat(clean) || 0;
    }

    // Mapear banco: "ITAÚ" → "ITAU", "ITAÚ + MP" → "ITAU"
    function parseBanco(val: string): string {
      const v = val.toUpperCase().replace(/[ÚÜ]/g, "U").replace(/[ÃÂ]/g, "A").trim();
      if (v.includes("ITAU") && v.includes("MP")) return "ITAU"; // banco principal
      if (v.includes("ITAU")) return "ITAU";
      if (v.includes("INFINITE") || v.includes("INF")) return "INFINITE";
      if (v.includes("MERCADO") || v.includes("MP")) return "MERCADO_PAGO";
      if (v.includes("ESPECIE") || v.includes("DINHEIRO")) return "ESPECIE";
      return v;
    }

    // Mapear forma: "PIX", "C. CRÉDITO", "C. CRÉDITO + PIX", "LINK" etc
    function parseForma(val: string): string {
      const v = val.toUpperCase().trim();
      if (v.includes("CREDITO") || v.includes("CRÉDITO")) return "CARTAO";
      if (v.includes("DEBITO") || v.includes("DÉBITO")) return "CARTAO";
      if (v.includes("LINK")) return "CARTAO"; // Link de pagamento = cartão
      if (v.includes("PIX")) return "PIX";
      if (v.includes("DINHEIRO")) return "DINHEIRO";
      if (v.includes("FIADO")) return "FIADO";
      if (v.includes("CARTAO") || v.includes("CARTÃO")) return "CARTAO";
      return "PIX"; // fallback seguro
    }

    // Normalizar origem: remover acentos e mapear para valores aceitos
    // Constraint: ANUNCIO, RECOMPRA, INDICACAO, ATACADO
    function parseOrigem(val: string): string {
      const v = val.toUpperCase().trim()
        .replace(/[ÀÁÂÃÄ]/g, "A")
        .replace(/[ÈÉÊË]/g, "E")
        .replace(/[ÌÍÎÏ]/g, "I")
        .replace(/[ÒÓÔÕÖ]/g, "O")
        .replace(/[ÙÚÛÜ]/g, "U")
        .replace(/[Ç]/g, "C")
        .replace(/[^A-Z0-9_\s]/g, "");
      if (v.includes("ANUNCIO")) return "ANUNCIO";
      if (v.includes("RECOMPRA")) return "RECOMPRA";
      if (v.includes("INDICACAO") || v.includes("INDICAC")) return "INDICACAO";
      if (v.includes("ATACADO")) return "ATACADO";
      // Canais de marketing → ANUNCIO
      if (v.includes("CHAT") || v.includes("GPT") || v.includes("TIK") || v.includes("TOK") || v.includes("INSTAGRAM") || v.includes("FACEBOOK") || v.includes("GOOGLE")) return "ANUNCIO";
      // Se não reconhecido, default RECOMPRA
      return "RECOMPRA";
    }

    // Detectar recebimento
    function parseRecebimento(forma: string, banco: string): string {
      const f = forma.toUpperCase();
      if (f.includes("CREDITO") || f.includes("CRÉDITO") || f.includes("LINK")) return "D+1";
      if (f.includes("FIADO")) return "FIADO";
      return "D+0"; // PIX, dinheiro, débito
    }

    // Normalizar recebimento: aceitar datas e mapear para D+0/D+1/FIADO
    function parseRecebimentoValue(val: string): string {
      const v = val.toUpperCase().trim();
      if (v === "D+0" || v === "D+1" || v === "FIADO") return v;
      // Se é uma data (DD/MM/YYYY), não usar como recebimento — será auto-detectado
      if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(v)) return "";
      if (v.includes("D+0") || v.includes("PIX") || v.includes("DINHEIRO")) return "D+0";
      if (v.includes("D+1") || v.includes("CREDIT") || v.includes("LINK")) return "D+1";
      if (v.includes("FIADO")) return "FIADO";
      return "";
    }

    const mapped = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      // Track original values for recebimento detection
      let rawForma = "";
      let rawBanco = "";

      for (const [key, val] of Object.entries(row)) {
        let k = key.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
        if (!val || val.trim() === "") continue;

        // Normalize special column names from Numbers
        if (k === "descrio" || k === "descriao" || k === "descricao") k = "descricao";
        if (k === "valor_r" || k === "valorr" || k.startsWith("valor")) k = "valor";
        if (k === "observao" || k === "observacao") k = "observacao";
        if (k === "preo_vendido" || k === "precovendido" || k === "preco_vendido") k = "preco_vendido";
        if (k === "margem_" || k === "margem") { continue; } // Skip margem % column
        if (k === "hora") { continue; } // Skip hora column
        if (k === "total_" || k === "total") { continue; } // Skip total columns
        if (k === "entrada_no_pix" || k === "banco_entrada_pix" || k === "banco_alt" || k === "valor_comprovante" || k === "valor_comprovante_alt" || k === "bandeira_parcelado_alt" || k === "qnt_parcela_1" || k === "bandeira_parcelado") { continue; } // Skip extra vendas columns

        if (k === "data") {
          obj[k] = parseDate(val);
        } else if (numericFields.includes(k)) {
          obj[k] = parseReais(val);
        } else if (intFields.includes(k)) {
          obj[k] = parseInt(val.replace(/\D/g, "")) || 0;
        } else if (k === "banco") {
          rawBanco = val;
          obj[k] = parseBanco(val);
          // Se tem 2 bancos (ex: "ITAÚ + MP"), guardar o segundo
          const parts = val.toUpperCase().split("+").map(s => s.trim());
          if (parts.length > 1) {
            obj["banco_2nd"] = parseBanco(parts[1]);
          }
        } else if (k === "banco_1" || k === "banco1") {
          // Coluna duplicada "banco" do Numbers → mapeia para banco_sinal
          obj["banco_sinal"] = parseBanco(val);
        } else if (k === "forma") {
          rawForma = val;
          obj[k] = parseForma(val);
        } else if (k === "origem") {
          obj[k] = parseOrigem(val);
        } else if (k === "recebimento") {
          const parsed = parseRecebimentoValue(val);
          if (parsed) obj[k] = parsed;
          // Se vazio (era uma data), será auto-detectado abaixo
        } else if (k === "is_dep_esp") {
          obj[k] = val.toLowerCase() === "true" || val === "1" || val.toLowerCase() === "sim";
        } else if (k === "preco_vendido" || k === "precovendido" || k === "preco") {
          obj["preco_vendido"] = parseReais(val);
        } else if (k === "tipo" && table === "gastos") {
          const v = val.toUpperCase().trim()
            .replace(/[ÀÁÂÃÄ]/g, "A").replace(/[ÈÉÊË]/g, "E").replace(/[ÌÍÎÏ]/g, "I").replace(/[ÒÓÔÕÖ]/g, "O").replace(/[ÙÚÛÜ]/g, "U");
          obj[k] = v.includes("SAIDA") || v.includes("SAID") ? "SAIDA" : v.includes("ENTRADA") ? "ENTRADA" : v;
        } else if (k === "categoria" && table === "gastos") {
          // Normalize gastos category: remove accents
          const v = val.toUpperCase().trim()
            .replace(/[ÀÁÂÃÄ]/g, "A").replace(/[ÈÉÊË]/g, "E").replace(/[ÌÍÎÏ]/g, "I").replace(/[ÒÓÔÕÖ]/g, "O").replace(/[ÙÚÛÜ]/g, "U").replace(/[Ç]/g, "C");
          if (v.includes("ANUNCIO")) obj[k] = "ANUNCIOS";
          else if (v.includes("ALIMENTA")) obj[k] = "ALIMENTACAO";
          else obj[k] = v;
        } else {
          obj[k] = val.trim().toUpperCase();
        }
      }

      // Auto-detect recebimento se não veio no CSV ou foi inválido
      if (!obj["recebimento"] && (rawForma || rawBanco)) {
        obj["recebimento"] = parseRecebimento(rawForma, rawBanco);
      }

      // Vendas: garantir campos NOT NULL tem valor válido
      if (table === "vendas") {
        // Origem default
        if (!obj["origem"] || obj["origem"] === "") {
          const tipo = String(obj["tipo"] || "").toUpperCase();
          if (tipo === "ATACADO") obj["origem"] = "ATACADO";
          else obj["origem"] = "RECOMPRA";
        }
        // Tipo default
        if (!obj["tipo"] || obj["tipo"] === "") {
          const origem = String(obj["origem"] || "").toUpperCase();
          if (origem === "ATACADO") obj["tipo"] = "ATACADO";
          else obj["tipo"] = "VENDA";
        }
        // Validar tipo está no check constraint
        const tipoVal = String(obj["tipo"]).toUpperCase();
        if (!["VENDA", "UPGRADE", "ATACADO"].includes(tipoVal)) {
          obj["tipo"] = "VENDA";
        }
        // Banco default
        if (!obj["banco"] || obj["banco"] === "") {
          obj["banco"] = "ITAU";
        }
        // Forma default
        if (!obj["forma"] || obj["forma"] === "") {
          obj["forma"] = "PIX";
        }
        // Recebimento default
        if (!obj["recebimento"] || obj["recebimento"] === "") {
          obj["recebimento"] = "D+0";
        }
      }

      return obj;
    });

    // Filtrar linhas sem data (totais, resumos, linhas vazias)
    const validRows = mapped.filter(r => r["data"] && String(r["data"]).length >= 8);

    const rowsToSend = table === "vendas" ? validRows : mapped;
    const res = await fetch("/api/importar", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ table, rows: rowsToSend, autoStatus: table === "vendas" }),
    });
    const json = await res.json();
    setResult(json);
    setImporting(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-[#1D1D1F]">Importar Dados</h2>

      {quickMsg && <div className={`px-4 py-3 rounded-xl text-sm ${quickMsg.includes("Erro") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{quickMsg}</div>}

      {/* Limpar dados (antes de reimportar) */}
      <div className="bg-white border border-red-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold text-red-600 mb-1">🗑️ Limpar Dados (antes de reimportar)</h3>
        <p className="text-xs text-[#86868B] mb-4">Apaga TODOS os registros da tabela selecionada. Use antes de reimportar.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(["vendas", "gastos", "estoque"] as const).map((t) => (
            <button
              key={t}
              onClick={async () => {
                if (!confirm(`APAGAR TODOS os registros de ${t.toUpperCase()}? Essa ação não pode ser desfeita.`)) return;
                setQuickImporting(`limpar-${t}`);
                setQuickMsg("");
                try {
                  const res = await fetch("/api/importar", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json", "x-admin-password": password },
                    body: JSON.stringify({ table: t }),
                  });
                  const json = await res.json();
                  setQuickMsg(json.ok ? `${t.toUpperCase()} limpa com sucesso!` : `Erro: ${json.error}`);
                } catch (err) { setQuickMsg(`Erro: ${String(err)}`); }
                setQuickImporting("");
              }}
              disabled={!!quickImporting}
              className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 font-semibold hover:bg-red-100 transition-colors disabled:opacity-50 text-center"
            >
              {quickImporting === `limpar-${t}` ? "Limpando..." : `Limpar ${t.toUpperCase()}`}
            </button>
          ))}
        </div>
      </div>

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
            <span className="block text-xs font-normal mt-1 opacity-80">Marco 2026 (até dia 18 = Finalizado, dia 19+ = Pendente)</span>
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
            <input type="file" accept=".csv,.json" onChange={handleFile} className="text-sm" />
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
