import { NextRequest, NextResponse } from "next/server";

const auth = (req: NextRequest) => !!req.headers.get("x-admin-password");

// Remove acentos e whitespace duplicado pra comparacao fuzzy
function normalizar(s: string): string {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

// Escapa % e _ do ilike pra fazer match exato case-insensitive
function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, c => "\\" + c);
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase } = await import("@/lib/supabase");
  const body = await req.json();
  const { nomeAntigo, nomeNovo } = body;

  if (!nomeAntigo || !nomeNovo) {
    return NextResponse.json({ error: "nomeAntigo e nomeNovo sao obrigatorios" }, { status: 400 });
  }

  // Comparacao case-sensitive apenas (trimmed): "Mega Cell" vs "MEGA CELL" sao
  // duas entradas distintas no DB que o usuario quer unificar — deve ACEITAR.
  // Antes rejeitava aqui porque comparava em uppercase, bloqueando merge de
  // duplicatas com cases diferentes.
  if (nomeAntigo.trim() === nomeNovo.trim()) {
    return NextResponse.json({ error: "Os nomes sao identicos (case-sensitive) — nada a unificar" }, { status: 400 });
  }

  // Nome final canonico (uppercase + whitespace normalizado).
  const novo = nomeNovo.trim().replace(/\s+/g, " ").toUpperCase();
  const antigoRaw = nomeAntigo.trim();
  const antigoEsc = escapeIlike(antigoRaw);

  const resultado: Record<string, number> = {};
  const erros: string[] = [];

  // Helper: atualiza tabela usando ilike (case-insensitive exact match).
  // Retorna contagem. Em erro, registra e retorna 0.
  const updateTabela = async (tabela: string, coluna: string) => {
    const { data, error } = await supabase.from(tabela)
      .update({ [coluna]: novo })
      .ilike(coluna, antigoEsc)
      .select("id");
    if (error) {
      erros.push(`${tabela}.${coluna}: ${error.message}`);
      return 0;
    }
    return data?.length || 0;
  };

  resultado.vendas = await updateTabela("vendas", "cliente");
  resultado.reajustes = await updateTabela("reajustes", "cliente");
  resultado.estoque = await updateTabela("estoque", "cliente");
  resultado.entregas = await updateTabela("entregas", "cliente");
  resultado.link_compras = await updateTabela("link_compras", "cliente_nome");

  // Lojistas — busca TODOS e faz match por nome normalizado (insensivel a
  // case, acentos e espaços duplos). Cobre casos como "Mega Cell",
  // "MEGA CELL", "MEGA  CELL", "MÉGA CELL" todos como mesmo lojista.
  try {
    const { data: todosLojistas } = await supabase
      .from("lojistas")
      .select("id, nome, saldo_credito");

    const antigoNorm = normalizar(antigoRaw);
    const novoNorm = normalizar(novo);

    const lojistasAntigos = (todosLojistas || []).filter(l => normalizar(l.nome || "") === antigoNorm);
    const lojistaNovo = (todosLojistas || []).find(l => normalizar(l.nome || "") === novoNorm);

    if (lojistasAntigos.length > 0) {
      if (lojistaNovo) {
        // Target existe: soma saldos de todos antigos + transfere movimentacoes + deleta antigos
        const saldoAntigoTotal = lojistasAntigos.reduce((s, l) => s + (l.saldo_credito || 0), 0);
        const saldoFinal = (lojistaNovo.saldo_credito || 0) + saldoAntigoTotal;
        await supabase.from("lojistas")
          .update({ saldo_credito: saldoFinal, nome: novo })
          .eq("id", lojistaNovo.id);

        let movsTransferidas = 0;
        for (const antigo of lojistasAntigos) {
          const { data: movs } = await supabase.from("lojistas_movimentacoes")
            .update({ lojista_id: lojistaNovo.id })
            .eq("lojista_id", antigo.id)
            .select("id");
          movsTransferidas += movs?.length || 0;
          await supabase.from("lojistas").delete().eq("id", antigo.id);
        }
        resultado.lojistas_movimentacoes = movsTransferidas;
        resultado.lojistas = lojistasAntigos.length;
      } else {
        // Target nao existe: renomeia o primeiro antigo pro novo, funde os
        // demais antigos nele (mesmo merge que o caso acima so que com alvo
        // sendo um dos antigos).
        const [primeiro, ...demais] = lojistasAntigos;
        const saldoTotal = lojistasAntigos.reduce((s, l) => s + (l.saldo_credito || 0), 0);
        await supabase.from("lojistas")
          .update({ nome: novo, saldo_credito: saldoTotal })
          .eq("id", primeiro.id);

        let movsTransferidas = 0;
        for (const antigo of demais) {
          const { data: movs } = await supabase.from("lojistas_movimentacoes")
            .update({ lojista_id: primeiro.id })
            .eq("lojista_id", antigo.id)
            .select("id");
          movsTransferidas += movs?.length || 0;
          await supabase.from("lojistas").delete().eq("id", antigo.id);
        }
        resultado.lojistas_movimentacoes = movsTransferidas;
        resultado.lojistas = lojistasAntigos.length;
      }
    }
  } catch (err) {
    erros.push(`lojistas: ${String(err)}`);
  }

  const usuario = req.headers.get("x-admin-user") ? decodeURIComponent(req.headers.get("x-admin-user")!) : "sistema";
  const { logActivity } = await import("@/lib/activity-log");
  await logActivity(
    usuario,
    "Merge cliente/lojista",
    `"${antigoRaw}" → "${novo}" (${JSON.stringify(resultado)}${erros.length ? ` erros: ${erros.join("; ")}` : ""})`,
    "vendas",
    "",
  );

  if (erros.length > 0) {
    return NextResponse.json({ ok: false, resultado, erros, de: antigoRaw, para: novo }, { status: 500 });
  }
  return NextResponse.json({ ok: true, resultado, de: antigoRaw, para: novo });
}
