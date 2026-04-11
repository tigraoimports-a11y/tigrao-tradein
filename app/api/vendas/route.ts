import { hojeBR } from "@/lib/date-utils";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendPaymentNotification, sendSaleNotification, sendCancelNotification } from "@/lib/telegram";
import { logActivity } from "@/lib/activity-log";
import { hasPermission } from "@/lib/permissions";
import { recalcularSaldoDia } from "@/lib/saldos";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

/** Converte valor da troca em número, suportando "R$ 2.300,00" e "2300" */
function parseTrocaValor(val: string | null | undefined): number {
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.,]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

/** Detecta categoria do produto a partir do nome */
function detectCategoriaSeminovo(produto: string | null | undefined): string {
  const p = (produto || "").toUpperCase();
  if (p.includes("MACBOOK")) return "MACBOOK";
  if (p.includes("MAC MINI")) return "MAC_MINI";
  if (p.includes("MAC STUDIO")) return "MAC_STUDIO";
  if (p.includes("IMAC")) return "IMAC";
  if (p.includes("IPAD")) return "IPADS";
  if (p.includes("APPLE WATCH")) return "APPLE_WATCH";
  if (p.includes("AIRPODS")) return "AIRPODS";
  return "IPHONES";
}

function getUsuario(req: NextRequest): string {
  const raw = req.headers.get("x-admin-user") || "sistema";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function getRole(req: NextRequest): string {
  return req.headers.get("x-admin-role") || "admin";
}

function getPermissoes(req: NextRequest): string[] {
  try { return JSON.parse(req.headers.get("x-admin-permissoes") || "[]"); } catch { return []; }
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  const permissoes = getPermissoes(req);
  if (!hasPermission(role, "vendas.read", permissoes)) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const { searchParams } = new URL(req.url);

  // Check recompra: verifica se CPF ou nome já tem vendas
  if (searchParams.get("action") === "check_recompra") {
    const cpf = searchParams.get("cpf");
    const cliente = searchParams.get("cliente");
    let found = false;
    if (cpf) {
      const cleanCpf = cpf.replace(/[\.\-\/\s]/g, "");
      const { data } = await supabase.from("vendas").select("id").ilike("cpf", `%${cleanCpf}%`).limit(1);
      found = (data?.length || 0) > 0;
    }
    if (!found && cliente) {
      const { data } = await supabase.from("vendas").select("id").ilike("cliente", `%${cliente}%`).limit(1);
      found = (data?.length || 0) > 0;
    }
    return NextResponse.json({ recompra: found });
  }

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const search = searchParams.get("search");

  let query = supabase.from("vendas").select("*").order("data", { ascending: false });
  if (search) {
    // Se parece CPF (só números e pontos/traço), busca por CPF; senão busca por nome ou ambos
    const cleanSearch = search.replace(/[\.\-\/\s]/g, "");
    // Formata como CPF (XXX.XXX.XXX-XX) para casar com banco que armazena com pontuação
    const fmtCpf = cleanSearch.length >= 3 ? cleanSearch.replace(/^(\d{3})(\d{3})?(\d{3})?(\d{1,2})?$/, (_m, a, b, c, d) =>
      [a, b, c].filter(Boolean).join(".") + (d ? `-${d}` : "")) : cleanSearch;
    if (/^\d{3,}$/.test(cleanSearch)) {
      query = query.or(`cpf.ilike.%${cleanSearch}%,cpf.ilike.%${fmtCpf}%`);
    } else {
      query = query.or(`cliente.ilike.%${search}%,cpf.ilike.%${search}%`);
    }
  } else {
    if (from) query = query.gte("data", from);
    if (to) query = query.lte("data", to);
  }

  const estoqueId = searchParams.get("estoque_id");
  if (estoqueId) query = query.eq("estoque_id", estoqueId);

  // Filtros para o seletor de venda no Estorno
  const cliente = searchParams.get("cliente");
  if (cliente) query = query.ilike("cliente", cliente);
  const fornecedor = searchParams.get("fornecedor");
  if (fornecedor) query = query.ilike("fornecedor", fornecedor);

  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 500;
  const { data, error } = await query.limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  const permissoes = getPermissoes(req);
  if (!hasPermission(role, "vendas.create", permissoes)) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  const usuario = getUsuario(req);

  const body = await req.json();

  // Importação em lote (vendas históricas)
  if (body.action === "import_bulk") {
    const rows = body.rows as Record<string, unknown>[];
    if (!rows?.length) return NextResponse.json({ error: "rows required" }, { status: 400 });

    let imported = 0;
    const errors: string[] = [];

    // Inserir em lotes de 100 via Supabase
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await supabase.from("vendas").insert(batch);
      if (error) {
        errors.push(`Lote ${i}-${i + batch.length}: ${error.message}`);
        // Tentar um a um no lote com erro
        for (const row of batch) {
          const { error: e2 } = await supabase.from("vendas").insert(row);
          if (e2) errors.push(`${(row as Record<string, string>).cliente}: ${e2.message}`);
          else imported++;
        }
      } else {
        imported += batch.length;
      }
    }

    return NextResponse.json({ ok: true, imported, errors: errors.slice(0, 20), total: rows.length });
  }

  // Extrair dados do seminovo antes de inserir a venda
  const seminovoData = body._seminovo;
  delete body._seminovo;
  const seminovoData2 = body._seminovo2;
  delete body._seminovo2;

  // Extrair estoque_id antes de inserir
  let estoqueId = body._estoque_id;
  delete body._estoque_id;

  // Se tem estoque_id, verificar se produto ainda está disponível e copiar IMEI/Serial
  let imeiFromEstoque: string | null = null;
  let serialFromEstoque: string | null = null;
  if (estoqueId) {
    const { data: estoqueItem } = await supabase.from("estoque").select("imei, serial_no, qnt, status, tipo").eq("id", estoqueId).single();
    if (!estoqueItem) return NextResponse.json({ error: "Produto não encontrado no estoque" }, { status: 404 });
    if (estoqueItem.status === "ESGOTADO" || estoqueItem.qnt <= 0) {
      return NextResponse.json({ error: "Produto já foi vendido (ESGOTADO). Não é possível registrar outra venda." }, { status: 409 });
    }
    // Bloqueia venda de item em PENDENCIA — precisa mover pra estoque primeiro
    if (estoqueItem.status === "PENDENTE" || estoqueItem.tipo === "PENDENCIA") {
      return NextResponse.json({
        error: "Item está em PENDÊNCIAS. Mova pra estoque (Recalc Balanços ou botão de confirmar recebimento) antes de vender.",
      }, { status: 409 });
    }
    if (estoqueItem.imei && !body.imei) imeiFromEstoque = estoqueItem.imei;
    if (estoqueItem.serial_no && !body.serial_no) serialFromEstoque = estoqueItem.serial_no;
  }

  // Garantir nome do cliente em caixa alta
  if (body.cliente && typeof body.cliente === "string") {
    body.cliente = body.cliente.toUpperCase();
  }

  // Auto-preencher bairro/cidade/uf a partir do CEP se não informados
  if (body.cep && body.cep !== "00000000" && !body.bairro) {
    try {
      const cepClean = String(body.cep).replace(/\D/g, "");
      if (cepClean.length === 8) {
        const res = await fetch(`https://viacep.com.br/ws/${cepClean}/json/`);
        const cepData = await res.json();
        if (!cepData.erro) {
          if (!body.bairro) body.bairro = cepData.bairro || null;
          if (!body.cidade) body.cidade = cepData.localidade || null;
          if (!body.uf) body.uf = cepData.uf || null;
          if (!body.endereco) body.endereco = cepData.logradouro || null;
        }
      }
    } catch { /* ignore CEP lookup failure */ }
  }

  // forma pode ser null (pagamento a definir depois)
  if (!body.forma) body.forma = null;

  // Brinde / Cortesia: forçar valores zerados para não impactar faturamento
  if (body.is_brinde) {
    body.custo = 0;
    body.preco_vendido = 0;
    if (!body.notas || !body.notas.includes("Brinde")) {
      body.notas = body.notas ? `Brinde / Presente ao cliente\n${body.notas}` : "Brinde / Presente ao cliente";
    }
  }

  // Crédito de lojista (abatimento): valor vem em usar_credito_loja (opcional, só ATACADO)
  const usarCreditoLoja = Number(body.usar_credito_loja || 0);
  delete body.usar_credito_loja;
  // Salvar na coluna credito_lojista_usado (para rastreio na tela de operações)
  if (usarCreditoLoja > 0) body.credito_lojista_usado = usarCreditoLoja;

  // Garantir que preco_vendido inclui crédito de lojista (frontend já soma, mas safety net)
  if (usarCreditoLoja > 0 && body.preco_vendido !== undefined) {
    const precoAtual = Number(body.preco_vendido) || 0;
    // Se preco_vendido é menor que o crédito usado, significa que não foi incluído
    if (precoAtual < usarCreditoLoja) {
      body.preco_vendido = precoAtual + usarCreditoLoja;
    }
  }

  const { data, error } = await supabase.from("vendas").insert({
    ...body,
    estoque_id: estoqueId || null,
    ...(imeiFromEstoque ? { imei: imeiFromEstoque } : {}),
    ...(serialFromEstoque ? { serial_no: serialFromEstoque } : {}),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Abater crédito do lojista (se solicitado) — usa tabela `lojistas` (saldo_credito),
  // mesma fonte de verdade da tela Clientes/Lojistas e do lookup na Nova Venda.
  if (usarCreditoLoja > 0 && (body.tipo === "ATACADO" || body.origem === "ATACADO") && body.cliente) {
    try {
      // 1) Localiza o lojista por cpf/cnpj/nome
      const normNome = String(body.cliente || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
      const cpfDig = String(body.cpf || "").replace(/\D/g, "");
      const cnpjDig = String(body.cnpj || "").replace(/\D/g, "");
      let lojistaId: string | null = null;
      if (cpfDig) {
        const { data: l } = await supabase.from("lojistas").select("id").eq("cpf", cpfDig).maybeSingle();
        if (l) lojistaId = l.id;
      }
      if (!lojistaId && cnpjDig) {
        const { data: l } = await supabase.from("lojistas").select("id").eq("cnpj", cnpjDig).maybeSingle();
        if (l) lojistaId = l.id;
      }
      if (!lojistaId && normNome) {
        const { data: ls } = await supabase.from("lojistas").select("id, nome").ilike("nome", normNome);
        if (ls && ls.length > 0) {
          const alvo = ls.find((l: { nome: string }) => (l.nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase() === normNome.toUpperCase()) || ls[0];
          lojistaId = alvo.id;
        }
      }
      if (lojistaId) {
        await supabase.rpc("mover_saldo_lojista", {
          p_lojista_id: lojistaId,
          p_tipo: "DEBITO",
          p_valor: usarCreditoLoja,
          p_venda_id: data?.id || null,
          p_motivo: `Venda ${data?.id?.slice(0, 8)}`,
          p_usuario: usuario,
        });
        await logActivity(usuario, "Crédito lojista usado em venda", `${body.cliente}: -R$${usarCreditoLoja}`, "vendas", data?.id);
      } else {
        console.warn("[Vendas] Crédito solicitado mas lojista não encontrado:", body.cliente);
      }
    } catch (e) {
      console.error("[Vendas] Erro ao debitar crédito lojista:", e);
    }
  }

  // Se não tem estoque_id mas tem serial, buscar automaticamente no estoque
  // (sem .single() — evita erro silencioso quando há 0 ou N matches)
  // Só pega itens EM ESTOQUE — itens PENDENTE precisam ser movidos antes de vender.
  if (!estoqueId && body.serial_no) {
    const serialU = String(body.serial_no).toUpperCase();
    const { data: foundBySerial } = await supabase
      .from("estoque")
      .select("id, status")
      .eq("serial_no", serialU)
      .eq("status", "EM ESTOQUE")
      .limit(1);
    if (foundBySerial && foundBySerial.length > 0) {
      estoqueId = foundBySerial[0].id;
      await supabase.from("vendas").update({ estoque_id: estoqueId }).eq("id", data?.id);
    }
  }

  // Proteção anti-duplicidade: marcar como ESGOTADO quaisquer outros itens ativos
  // com o mesmo serial (exceto o que acabou de ser vinculado).
  if (body.serial_no) {
    const serialU = String(body.serial_no).toUpperCase();
    const { data: duplicados } = await supabase
      .from("estoque")
      .select("id")
      .eq("serial_no", serialU)
      .in("status", ["EM ESTOQUE", "PENDENTE"]);
    if (duplicados && duplicados.length > 0) {
      const idsParaEsgotar = duplicados
        .filter(d => d.id !== estoqueId)
        .map(d => d.id);
      if (idsParaEsgotar.length > 0) {
        await supabase.from("estoque")
          .update({ qnt: 0, status: "ESGOTADO", updated_at: new Date().toISOString() })
          .in("id", idsParaEsgotar);
        await logActivity(usuario, "Duplicidade de serial resolvida (auto)", `Serial ${serialU}: ${idsParaEsgotar.length} item(s) ESGOTADO`, "estoque");
      }
    }
  }

  // Descontar do estoque se veio de um produto cadastrado
  if (estoqueId) {
    const { data: item } = await supabase.from("estoque").select("qnt,produto,tipo").eq("id", estoqueId).single();
    if (item) {
      const novaQnt = Math.max(0, Number(item.qnt) - 1);
      // Seminovos e Novos: marcar como ESGOTADO ao chegar em qnt=0 (nunca deletar)
      // Isso preserva o ID do item e permite rastreabilidade completa (retorno ao estoque na devolução)
      await supabase.from("estoque").update({
        qnt: novaQnt,
        status: novaQnt === 0 ? "ESGOTADO" : "EM ESTOQUE",
        updated_at: new Date().toISOString(),
      }).eq("id", estoqueId);
      await logActivity(
        usuario,
        novaQnt === 0 ? "Esgotou do estoque (auto)" : "Removeu do estoque (auto)",
        `${item.produto || body.produto || "?"} — restam ${novaQnt} un.`,
        "estoque",
        estoqueId
      );
    }
  }

  // Log da venda
  await logActivity(
    usuario,
    estoqueId ? "Registrou venda" : "Registrou venda (manual)",
    `${body.cliente || "?"} - ${body.produto || "?"}`,
    "vendas",
    data?.id
  );

  // Notificação Telegram movida para quando a venda for FINALIZADA (PATCH)

  // Helper: monta observacao com tags de grade/caixa/cabo/fonte
  const buildObsComTags = (obs: string | null, grade: string | null, caixa: string | null, cabo: string | null, fonte: string | null): string | null => {
    const parts: string[] = [];
    if (obs) parts.push(obs.trim());
    if (grade) parts.push(`[GRADE_${grade}]`);
    if (caixa === "SIM") parts.push("[COM_CAIXA]");
    if (cabo === "SIM") parts.push("[COM_CABO]");
    if (fonte === "SIM") parts.push("[COM_FONTE]");
    return parts.length > 0 ? parts.join(" ") : null;
  };

  // Se tem produto na troca, criar item como PENDENCIA
  // (cliente ainda tem o aparelho, devolve em 24h)
  // Fallback: se _seminovo não veio mas a venda tem valor de troca, criar pendência mesmo sem nome do produto
  const pTrocaValor1 = parseTrocaValor(data?.produto_na_troca);
  const hasTroca1Info = !!(data?.troca_produto || pTrocaValor1 > 0 || (seminovoData && (seminovoData.produto || (seminovoData.valor || 0) > 0)));
  const sem1 = seminovoData && (seminovoData.produto || (seminovoData.valor || 0) > 0)
    ? seminovoData
    : hasTroca1Info
      ? { produto: data?.troca_produto || null, valor: pTrocaValor1, cor: data?.troca_cor || null, bateria: data?.troca_bateria ? parseInt(data.troca_bateria) : null, observacao: data?.troca_obs || null, serial_no: data?.troca_serial || null, imei: data?.troca_imei || null, grade: data?.troca_grade || null, caixa: data?.troca_caixa || null, cabo: data?.troca_cabo || null, fonte: data?.troca_fonte || null, categoria: data?.troca_categoria || null, garantia: data?.troca_garantia || null }
      : null;

  if (hasTroca1Info) {
    const sem1Final = sem1 || { produto: data?.troca_produto || null, valor: pTrocaValor1, cor: data?.troca_cor || null, bateria: data?.troca_bateria ? parseInt(data.troca_bateria) : null, observacao: data?.troca_obs || null, serial_no: data?.troca_serial || null, imei: data?.troca_imei || null, grade: data?.troca_grade || null, caixa: data?.troca_caixa || null, cabo: data?.troca_cabo || null, fonte: data?.troca_fonte || null, categoria: data?.troca_categoria || null, origem: null, garantia: data?.troca_garantia || null };
    const nomeCliente = (body.cliente || data?.cliente || "").toUpperCase();
    const nomeProduto1 = sem1Final.produto || "PRODUTO DA TROCA — IDENTIFICAR";
    // Verificar se pendência já existe (evitar duplicata em caso de venda cancelada e relançada)
    const { data: existingPend1 } = await supabase.from("estoque")
      .select("id")
      .eq("cliente", nomeCliente)
      .eq("produto", nomeProduto1)
      .eq("tipo", "PENDENCIA")
      .eq("status", "PENDENTE")
      .limit(1);
    if (existingPend1 && existingPend1.length > 0) {
      await logActivity(usuario, "Pendência troca já existia", `${nomeProduto1} R$${sem1Final.valor} — ${body.cliente || "?"} (reaproveitada)`, "estoque", existingPend1[0].id);
    } else {
      const { error: errSeminovo } = await supabase.from("estoque").insert({
        produto: nomeProduto1,
        categoria: sem1Final.categoria || detectCategoriaSeminovo(sem1Final.produto),
        qnt: 1,
        custo_unitario: sem1Final.valor || 0,
        status: "PENDENTE",
        tipo: "PENDENCIA",
        cor: sem1Final.cor ? String(sem1Final.cor).toUpperCase() : null,
        observacao: buildObsComTags(sem1Final.observacao || null, sem1Final.grade || null, sem1Final.caixa || null, sem1Final.cabo || null, sem1Final.fonte || null),
        bateria: sem1Final.bateria || null,
        serial_no: sem1Final.serial_no || null,
        imei: sem1Final.imei || null,
        origem: sem1Final.origem || null,
        garantia: sem1Final.garantia || null,
        cliente: nomeCliente || null,
        fornecedor: nomeCliente || null,
        data_compra: body.data || data?.data || null,
        updated_at: new Date().toISOString(),
      });
      if (errSeminovo) console.error("Erro ao criar pendencia troca 1:", errSeminovo.message);
      else await logActivity(usuario, "Pendência troca criada (auto)", `${nomeProduto1} R$${sem1Final.valor} — ${body.cliente || "?"}`, "estoque");
    }
  }

  // 2º produto na troca — mesmo fluxo com fallback
  const pTrocaValor2 = parseTrocaValor(data?.produto_na_troca2);
  const hasTroca2Info = !!(data?.troca_produto2 || pTrocaValor2 > 0 || (seminovoData2 && (seminovoData2.produto || (seminovoData2.valor || 0) > 0)));
  const sem2 = seminovoData2 && (seminovoData2.produto || (seminovoData2.valor || 0) > 0)
    ? seminovoData2
    : hasTroca2Info
      ? { produto: data?.troca_produto2 || null, valor: pTrocaValor2, cor: data?.troca_cor2 || null, bateria: data?.troca_bateria2 ? parseInt(data.troca_bateria2) : null, observacao: data?.troca_obs2 || null, serial_no: data?.troca_serial2 || null, imei: data?.troca_imei2 || null, grade: data?.troca_grade2 || null, caixa: data?.troca_caixa2 || null, cabo: data?.troca_cabo2 || null, fonte: data?.troca_fonte2 || null, categoria: data?.troca_categoria2 || null, garantia: data?.troca_garantia2 || null }
      : null;

  if (hasTroca2Info) {
    const sem2Final = sem2 || { produto: data?.troca_produto2 || null, valor: pTrocaValor2, cor: data?.troca_cor2 || null, bateria: data?.troca_bateria2 ? parseInt(data.troca_bateria2) : null, observacao: data?.troca_obs2 || null, serial_no: data?.troca_serial2 || null, imei: data?.troca_imei2 || null, grade: data?.troca_grade2 || null, caixa: data?.troca_caixa2 || null, cabo: data?.troca_cabo2 || null, fonte: data?.troca_fonte2 || null, categoria: data?.troca_categoria2 || null, origem: null, garantia: data?.troca_garantia2 || null };
    const nomeCliente2 = (body.cliente || data?.cliente || "").toUpperCase();
    const nomeProduto2 = sem2Final.produto || "PRODUTO DA TROCA 2 — IDENTIFICAR";
    // Verificar se pendência já existe (evitar duplicata)
    const { data: existingPend2 } = await supabase.from("estoque")
      .select("id")
      .eq("cliente", nomeCliente2)
      .eq("produto", nomeProduto2)
      .eq("tipo", "PENDENCIA")
      .eq("status", "PENDENTE")
      .limit(1);
    if (existingPend2 && existingPend2.length > 0) {
      await logActivity(usuario, "Pendência troca 2 já existia", `${nomeProduto2} R$${sem2Final.valor} — ${body.cliente || "?"} (reaproveitada)`, "estoque", existingPend2[0].id);
    } else {
      const { error: errSeminovo2 } = await supabase.from("estoque").insert({
        produto: nomeProduto2,
        categoria: sem2Final.categoria || detectCategoriaSeminovo(sem2Final.produto),
        qnt: 1,
        custo_unitario: sem2Final.valor || 0,
        status: "PENDENTE",
        tipo: "PENDENCIA",
        cor: sem2Final.cor ? String(sem2Final.cor).toUpperCase() : null,
        observacao: buildObsComTags(sem2Final.observacao || null, sem2Final.grade || null, sem2Final.caixa || null, sem2Final.cabo || null, sem2Final.fonte || null),
        bateria: sem2Final.bateria || null,
        serial_no: sem2Final.serial_no || null,
        imei: sem2Final.imei || null,
        origem: sem2Final.origem || null,
        garantia: sem2Final.garantia || null,
        cliente: nomeCliente2 || null,
        fornecedor: nomeCliente2 || null,
        data_compra: body.data || data?.data || null,
        updated_at: new Date().toISOString(),
      });
      if (errSeminovo2) console.error("Erro ao criar pendencia troca 2:", errSeminovo2.message);
      else await logActivity(usuario, "Pendência troca 2 criada (auto)", `${nomeProduto2} R$${sem2Final.valor} — ${body.cliente || "?"}`, "estoque");
    }
  }

  // Entrega NÃO é criada automaticamente — equipe cria manualmente na agenda

  // Criar termo de procedência automaticamente (status PENDENTE) se houver troca
  if (hasTroca1Info || (data?.troca_produto2)) {
    try {
      const aparelhosTermo: { modelo: string; cor?: string; imei?: string; serial?: string; condicao?: string }[] = [];
      if (data?.troca_produto || seminovoData?.produto) {
        aparelhosTermo.push({
          modelo: data?.troca_produto || seminovoData?.produto || "",
          cor: data?.troca_cor || "",
          imei: data?.troca_imei || seminovoData?.imei || "",
          serial: data?.troca_serial || seminovoData?.serial_no || "",
          condicao: [
            data?.troca_bateria ? `Bateria ${data.troca_bateria}%` : "",
            data?.troca_grade ? `Grade ${data.troca_grade}` : "",
          ].filter(Boolean).join(", "),
        });
      }
      if (data?.troca_produto2) {
        aparelhosTermo.push({
          modelo: data.troca_produto2,
          cor: data?.troca_cor2 || "",
          imei: data?.troca_imei2 || "",
          serial: data?.troca_serial2 || "",
          condicao: data?.troca_bateria2 ? `Bateria ${data.troca_bateria2}%` : "",
        });
      }
      if (aparelhosTermo.length > 0) {
        await supabase.from("termos_procedencia").insert({
          venda_id: data?.id,
          cliente_nome: (body.cliente || "").toUpperCase(),
          cliente_cpf: body.cpf || "",
          aparelhos: aparelhosTermo,
          status: "PENDENTE",
          gerado_por: usuario,
        });
      }
    } catch { /* ignore — não bloqueia a venda */ }
  }

  // Recalcular saldos do dia automaticamente
  if (body.data) recalcularSaldoDia(supabase, body.data).catch(() => {});

  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  if (!hasPermission(role, "vendas.create")) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  const usuario = getUsuario(req);

  const body = await req.json();

  // Bulk update: finalizar todas vendas de uma data
  if (body.action === "finalizar_dia") {
    const { data: dia } = body;
    if (!dia) return NextResponse.json({ error: "data required" }, { status: 400 });
    const { data: updated, error } = await supabase
      .from("vendas")
      .update({ status_pagamento: "FINALIZADO" })
      .eq("data", dia)
      .eq("status_pagamento", "AGUARDANDO")
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, finalizadas: updated?.length || 0 });
  }

  // Sync troca_produto/troca_cor/troca_categoria em vendas vinculadas
  if (body.action === "sync_by_cliente_data") {
    const { cliente, data_compra, produto, cor, categoria } = body;
    if (!cliente) return NextResponse.json({ error: "cliente obrigatorio" }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (produto) updates.troca_produto = produto;
    if (cor !== undefined) updates.troca_cor = cor;
    if (categoria) updates.troca_categoria = categoria;

    // 1) Tentar por cliente + data exata
    if (data_compra) {
      const { data: r1, error: e1 } = await supabase.from("vendas")
        .update(updates)
        .ilike("cliente", cliente)
        .eq("data", data_compra)
        .not("troca_produto", "is", null)
        .select("id");
      if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
      if (r1 && r1.length > 0) return NextResponse.json({ ok: true, updated: r1.length });
    }

    // 2) Fallback: buscar TODAS as vendas desse cliente com troca_produto preenchido
    //    (seleciona primeiro, depois decide qual atualizar)
    const { data: candidatas, error: eCand } = await supabase.from("vendas")
      .select("id, data, troca_produto, troca_produto2")
      .ilike("cliente", cliente)
      .not("troca_produto", "is", null)
      .order("data", { ascending: false });
    if (eCand) return NextResponse.json({ error: eCand.message }, { status: 500 });

    if (!candidatas || candidatas.length === 0) {
      // 3) Último fallback: qualquer venda do cliente (inclusive sem troca_produto ainda)
      //    atualiza apenas a mais recente
      const { data: rFallback, error: eFallback } = await supabase.from("vendas")
        .select("id, data")
        .ilike("cliente", cliente)
        .order("data", { ascending: false })
        .limit(1);
      if (eFallback) return NextResponse.json({ error: eFallback.message }, { status: 500 });
      if (!rFallback || rFallback.length === 0) return NextResponse.json({ ok: true, updated: 0 });
      await supabase.from("vendas").update(updates).eq("id", rFallback[0].id);
      return NextResponse.json({ ok: true, updated: 1, fallback: "latest" });
    }

    // Se só 1 candidata, atualiza direto
    if (candidatas.length === 1) {
      await supabase.from("vendas").update(updates).eq("id", candidatas[0].id);
      return NextResponse.json({ ok: true, updated: 1 });
    }

    // Se há data_compra, tentar achar a candidata mais próxima da data
    if (data_compra) {
      const match = candidatas.find(v => v.data === data_compra) || candidatas[0];
      await supabase.from("vendas").update(updates).eq("id", match.id);
      return NextResponse.json({ ok: true, updated: 1 });
    }

    // Múltiplas sem data: atualiza a mais recente
    await supabase.from("vendas").update(updates).eq("id", candidatas[0].id);
    return NextResponse.json({ ok: true, updated: 1 });
  }

  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Remover campos internos que não existem na tabela vendas
  delete fields._seminovo;
  delete fields._seminovo2;
  delete fields._estoque_id;
  delete fields.usar_credito_loja; // virtual — só usado no POST

  // Todos os campos de troca existem na tabela vendas após migration 20260406_vendas_troca_serial_imei
  const { data, error } = await supabase.from("vendas").update(fields).eq("id", id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Se serial_no foi atualizado, marcar estoque correspondente como ESGOTADO
  // (previne itens vendidos que ficam "EM ESTOQUE" por falta de vínculo)
  if (fields.serial_no && data && data.length > 0) {
    const serialU = String(fields.serial_no).toUpperCase();
    const vendaEstoqueId = data[0].estoque_id;
    const { data: estoqueItems } = await supabase
      .from("estoque")
      .select("id")
      .eq("serial_no", serialU)
      .eq("status", "EM ESTOQUE");
    if (estoqueItems && estoqueItems.length > 0) {
      const idsParaEsgotar = estoqueItems
        .filter(e => e.id !== vendaEstoqueId)
        .map(e => e.id);
      // Se a venda não tem estoque_id, esgotar TODOS com esse serial
      const ids = vendaEstoqueId ? idsParaEsgotar : estoqueItems.map(e => e.id);
      if (ids.length > 0) {
        await supabase.from("estoque")
          .update({ qnt: 0, status: "ESGOTADO", updated_at: new Date().toISOString() })
          .in("id", ids);
      }
    }
  }

  // Enviar notificação no Telegram quando venda é FINALIZADA
  if (fields.status_pagamento === "FINALIZADO" && data && data.length > 0) {
    const venda = data[0];
    const lucroCalc = Number(venda.preco_vendido || 0) - Number(venda.custo || 0);
    console.log("[Vendas] Enviando notificação Telegram para venda finalizada:", venda.cliente, venda.produto);
    sendSaleNotification({
      produto: venda.produto,
      cor: venda.cor,
      cliente: venda.cliente,
      preco_vendido: venda.preco_vendido,
      custo: venda.custo,
      lucro: lucroCalc,
      banco: venda.banco,
      forma: venda.forma,
      qnt_parcelas: venda.qnt_parcelas,
      bandeira: venda.bandeira,
      vendedor: venda.vendedor || "sistema",
    }).then(ok => {
      if (!ok) console.error("[Vendas] Falha ao enviar notificação Telegram para:", venda.cliente);
      else console.log("[Vendas] Notificação Telegram enviada com sucesso para:", venda.cliente);
    }).catch(err => console.error("[Vendas] Erro notificação Telegram:", err));

    // Enviar Nota Fiscal por email ao cliente (se tem email + NF anexada)
    if (venda.email && venda.nota_fiscal_url) {
      import("@/lib/email").then(({ enviarNotaFiscal }) => {
        enviarNotaFiscal({
          to: venda.email!,
          clienteNome: venda.cliente || "Cliente",
          produto: `${venda.produto || ""}${venda.cor ? ` ${venda.cor}` : ""}`.trim(),
          valor: Number(venda.preco_vendido || 0),
          notaFiscalUrl: venda.nota_fiscal_url!,
        }).then(() => {
          console.log("[Vendas] NF enviada por email para:", venda.email);
          logActivity(usuario, "NF enviada por email", `${venda.cliente} → ${venda.email}`, "vendas", id).catch(() => {});
        }).catch(err => {
          console.error("[Vendas] Erro ao enviar NF por email:", err);
        });
      }).catch(err => console.error("[Vendas] Erro ao importar email:", err));
    }
  }

  // Se tem reajustes, sincronizar com tabela reajustes (para relatório da noite)
  if (fields.reajustes && Array.isArray(fields.reajustes) && data?.[0]) {
    const venda = data[0];
    // Deletar reajustes antigos desta venda
    await supabase.from("reajustes").delete().eq("venda_ref", id);
    // Inserir todos os reajustes atuais
    const reajInserts = fields.reajustes.map((r: { valor: number; motivo: string; banco: string; data: string }) => ({
      data: r.data || hojeBR(),
      cliente: venda.cliente || "?",
      motivo: r.motivo || "",
      valor: r.valor,
      banco: r.banco || null,
      venda_ref: id,
    }));
    if (reajInserts.length > 0) {
      await supabase.from("reajustes").insert(reajInserts);
    }
    // Recalcular saldo do dia do reajuste (pode ser diferente do dia da venda)
    const reajDatas = [...new Set(reajInserts.map((r: { data: string }) => r.data))];
    for (const d of reajDatas) {
      recalcularSaldoDia(supabase, d as string).catch(() => {});
    }
  }

  // Recalcular saldos do dia automaticamente
  const vendaData = data?.[0]?.data || fields.data;
  if (vendaData) recalcularSaldoDia(supabase, vendaData).catch(() => {});

  // Sync automático para pendências no estoque quando troca é editada/adicionada na venda
  if (data?.[0]) {
    const venda = data[0];
    const trocaFields = ["troca_produto", "troca_cor", "troca_categoria", "troca_bateria", "troca_obs", "produto_na_troca",
                          "troca_serial", "troca_imei", "troca_grade", "troca_caixa", "troca_cabo", "troca_fonte", "troca_pulseira", "troca_ciclos", "troca_garantia",
                          "troca_produto2", "troca_cor2", "troca_categoria2", "troca_bateria2", "troca_obs2", "produto_na_troca2",
                          "troca_serial2", "troca_imei2", "troca_grade2", "troca_caixa2", "troca_cabo2", "troca_fonte2", "troca_pulseira2", "troca_ciclos2", "troca_garantia2"];
    const hasTrocaChange = trocaFields.some(f => f in fields);
    if (hasTrocaChange && venda.cliente) {
      const nomeCliente = String(venda.cliente).toUpperCase();
      // Buscar pendências existentes do cliente
      const { data: pendencias } = await supabase
        .from("estoque")
        .select("id, produto, data_compra")
        .ilike("fornecedor", venda.cliente)
        .eq("status", "PENDENTE")
        .eq("tipo", "PENDENCIA")
        .order("data_compra", { ascending: false });

      const existing = pendencias || [];

      // ── TROCA 1 ──
      const hasTroca1 = !!(venda.troca_produto || venda.produto_na_troca);
      if (hasTroca1) {
        const p1 = existing.find(p => p.data_compra === venda.data) || existing[0];
        if (p1) {
          // UPDATE
          const upd1: Record<string, unknown> = {};
          if (fields.troca_produto) upd1.produto = fields.troca_produto;
          if (fields.troca_cor !== undefined) upd1.cor = fields.troca_cor ? String(fields.troca_cor).toUpperCase() : null;
          if (fields.troca_categoria) upd1.categoria = fields.troca_categoria;
          if (fields.troca_bateria !== undefined) { const b = parseInt(String(fields.troca_bateria || "")); upd1.bateria = Number.isFinite(b) ? b : null; }
          // Reconstruir observacao com tags sempre que algum campo flag mudar
          const obsFlagFields = ["troca_obs", "troca_grade", "troca_caixa", "troca_cabo", "troca_fonte", "troca_pulseira", "troca_ciclos"];
          if (obsFlagFields.some(k => k in fields)) {
            const obsBase = (fields.troca_obs !== undefined ? fields.troca_obs : venda.troca_obs) || "";
            const grade = (fields.troca_grade !== undefined ? fields.troca_grade : venda.troca_grade) || "";
            const caixa = (fields.troca_caixa !== undefined ? fields.troca_caixa : venda.troca_caixa) || "";
            const cabo = (fields.troca_cabo !== undefined ? fields.troca_cabo : venda.troca_cabo) || "";
            const fonte = (fields.troca_fonte !== undefined ? fields.troca_fonte : venda.troca_fonte) || "";
            const pulseira = (fields.troca_pulseira !== undefined ? fields.troca_pulseira : venda.troca_pulseira) || "";
            const ciclos = (fields.troca_ciclos !== undefined ? fields.troca_ciclos : venda.troca_ciclos) || "";
            let result = String(obsBase);
            if (grade) result += ` [GRADE_${grade}]`;
            if (caixa === "SIM") result += " [COM_CAIXA]";
            if (cabo === "SIM") result += " [COM_CABO]";
            if (fonte === "SIM") result += " [COM_FONTE]";
            if (pulseira === "SIM") result += " [COM_PULSEIRA]";
            if (ciclos) result += ` [CICLOS:${ciclos}]`;
            upd1.observacao = result.trim() || null;
          }
          if (fields.produto_na_troca !== undefined) upd1.custo_unitario = parseTrocaValor(fields.produto_na_troca);
          if (fields.troca_serial !== undefined) upd1.serial_no = fields.troca_serial ? String(fields.troca_serial).toUpperCase() : null;
          if (fields.troca_imei !== undefined) upd1.imei = fields.troca_imei ? String(fields.troca_imei).toUpperCase() : null;
          if (fields.troca_garantia !== undefined) upd1.garantia = fields.troca_garantia || null;
          if (Object.keys(upd1).length > 0) {
            upd1.updated_at = new Date().toISOString();
            await supabase.from("estoque").update(upd1).eq("id", p1.id);
          }
        } else {
          // INSERT — não existia pendência, criar agora
          const valor1 = parseTrocaValor(venda.produto_na_troca);
          const nome1 = venda.troca_produto || "PRODUTO DA TROCA — IDENTIFICAR";
          const obs1Parts: string[] = [];
          if (venda.troca_obs) obs1Parts.push(String(venda.troca_obs));
          if (venda.troca_grade) obs1Parts.push(`[GRADE_${venda.troca_grade}]`);
          if (venda.troca_caixa === "SIM") obs1Parts.push("[COM_CAIXA]");
          if (venda.troca_cabo === "SIM") obs1Parts.push("[COM_CABO]");
          if (venda.troca_fonte === "SIM") obs1Parts.push("[COM_FONTE]");
          if (venda.troca_pulseira === "SIM") obs1Parts.push("[COM_PULSEIRA]");
          if (venda.troca_ciclos) obs1Parts.push(`[CICLOS:${venda.troca_ciclos}]`);
          const { error: errNew1 } = await supabase.from("estoque").insert({
            produto: nome1,
            categoria: venda.troca_categoria || detectCategoriaSeminovo(venda.troca_produto),
            qnt: 1,
            custo_unitario: valor1,
            status: "PENDENTE",
            tipo: "PENDENCIA",
            cor: venda.troca_cor ? String(venda.troca_cor).toUpperCase() : null,
            bateria: (() => { const b = parseInt(String(venda.troca_bateria || "")); return Number.isFinite(b) ? b : null; })(),
            observacao: obs1Parts.length ? obs1Parts.join(" ").trim() : null,
            serial_no: venda.troca_serial ? String(venda.troca_serial).toUpperCase() : null,
            imei: venda.troca_imei ? String(venda.troca_imei).toUpperCase() : null,
            garantia: venda.troca_garantia || null,
            cliente: nomeCliente,
            fornecedor: nomeCliente,
            data_compra: venda.data,
            updated_at: new Date().toISOString(),
          });
          if (!errNew1) await logActivity(usuario, "Pendência troca criada (edição)", `${nome1} R$${valor1} — ${venda.cliente}`, "estoque");
          else console.error("Erro ao criar pendencia troca 1 (PATCH):", errNew1.message);
        }
      }

      // ── TROCA 2 ──
      const hasTroca2 = !!(venda.troca_produto2 || venda.produto_na_troca2);
      if (hasTroca2) {
        // Segunda pendência = segunda na lista (ou primeira se não existir troca 1)
        const p2 = existing.length >= 2
          ? (existing.find(p => p.data_compra === venda.data && p.id !== existing[0]?.id) || existing[1])
          : (hasTroca1 ? undefined : existing[0]);
        if (p2) {
          const upd2: Record<string, unknown> = {};
          if (fields.troca_produto2) upd2.produto = fields.troca_produto2;
          if (fields.troca_cor2 !== undefined) upd2.cor = fields.troca_cor2 ? String(fields.troca_cor2).toUpperCase() : null;
          if (fields.troca_categoria2) upd2.categoria = fields.troca_categoria2;
          if (fields.troca_bateria2 !== undefined) { const b = parseInt(String(fields.troca_bateria2 || "")); upd2.bateria = Number.isFinite(b) ? b : null; }
          if (fields.troca_obs2 !== undefined) upd2.observacao = fields.troca_obs2 || null;
          if (fields.produto_na_troca2 !== undefined) upd2.custo_unitario = parseTrocaValor(fields.produto_na_troca2);
          if (fields.troca_serial2 !== undefined) upd2.serial_no = fields.troca_serial2 ? String(fields.troca_serial2).toUpperCase() : null;
          if (fields.troca_imei2 !== undefined) upd2.imei = fields.troca_imei2 ? String(fields.troca_imei2).toUpperCase() : null;
          if (fields.troca_garantia2 !== undefined) upd2.garantia = fields.troca_garantia2 || null;
          if (Object.keys(upd2).length > 0) {
            upd2.updated_at = new Date().toISOString();
            await supabase.from("estoque").update(upd2).eq("id", p2.id);
          }
        } else {
          const valor2 = parseTrocaValor(venda.produto_na_troca2);
          const nome2 = venda.troca_produto2 || "PRODUTO DA TROCA 2 — IDENTIFICAR";
          const obs2Parts: string[] = [];
          if (venda.troca_obs2) obs2Parts.push(String(venda.troca_obs2));
          if (venda.troca_grade2) obs2Parts.push(`[GRADE_${venda.troca_grade2}]`);
          if (venda.troca_caixa2 === "SIM") obs2Parts.push("[COM_CAIXA]");
          if (venda.troca_cabo2 === "SIM") obs2Parts.push("[COM_CABO]");
          if (venda.troca_fonte2 === "SIM") obs2Parts.push("[COM_FONTE]");
          if (venda.troca_pulseira2 === "SIM") obs2Parts.push("[COM_PULSEIRA]");
          if (venda.troca_ciclos2) obs2Parts.push(`[CICLOS:${venda.troca_ciclos2}]`);
          const { error: errNew2 } = await supabase.from("estoque").insert({
            produto: nome2,
            categoria: venda.troca_categoria2 || detectCategoriaSeminovo(venda.troca_produto2),
            qnt: 1,
            custo_unitario: valor2,
            status: "PENDENTE",
            tipo: "PENDENCIA",
            cor: venda.troca_cor2 ? String(venda.troca_cor2).toUpperCase() : null,
            bateria: (() => { const b = parseInt(String(venda.troca_bateria2 || "")); return Number.isFinite(b) ? b : null; })(),
            observacao: obs2Parts.length ? obs2Parts.join(" ").trim() : null,
            serial_no: venda.troca_serial2 ? String(venda.troca_serial2).toUpperCase() : null,
            imei: venda.troca_imei2 ? String(venda.troca_imei2).toUpperCase() : null,
            garantia: venda.troca_garantia2 || null,
            cliente: nomeCliente,
            fornecedor: nomeCliente,
            data_compra: venda.data,
            updated_at: new Date().toISOString(),
          });
          if (!errNew2) await logActivity(usuario, "Pendência troca 2 criada (edição)", `${nome2} R$${valor2} — ${venda.cliente}`, "estoque");
          else console.error("Erro ao criar pendencia troca 2 (PATCH):", errNew2.message);
        }
      }
    }
  }

  return NextResponse.json({ ok: true, updated: data });
}

export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  const permissoes = getPermissoes(req);
  if (!hasPermission(role, "vendas.create", permissoes)) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  const usuario = getUsuario(req);

  const body = await req.json();
  const { id, devolver_como_credito } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Buscar venda antes de deletar (para limpar seminovo se houver)
  const { data: venda } = await supabase.from("vendas").select("*").eq("id", id).single();

  // Reverter débito de crédito de lojista (se houve) — busca movimentação real, não preco_vendido
  const isAtacado = venda && (venda.tipo === "ATACADO" || venda.origem === "ATACADO");
  let creditoDevolvido = 0;
  if (isAtacado && venda?.cliente) {
    // Buscar se houve débito de crédito nessa venda (pela tabela de movimentações)
    const { data: movDebito } = await supabase
      .from("lojistas_movimentacoes")
      .select("valor, lojista_id")
      .eq("venda_id", id)
      .eq("tipo", "DEBITO")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (movDebito && movDebito.valor > 0) {
      // Sempre devolver o crédito que foi debitado, independente de devolver_como_credito
      creditoDevolvido = movDebito.valor;
      try {
        await supabase.rpc("mover_saldo_lojista", {
          p_lojista_id: movDebito.lojista_id,
          p_tipo: "CREDITO",
          p_valor: movDebito.valor,
          p_venda_id: id,
          p_motivo: `Cancelamento venda ${String(id).slice(0, 8)} → crédito devolvido`,
          p_usuario: usuario,
        });
        await logActivity(usuario, "Venda cancelada → crédito lojista devolvido", `${venda.cliente}: +R$${movDebito.valor}`, "vendas", id);
      } catch (e) {
        console.error("[Vendas] Erro ao devolver crédito lojista:", e);
      }
    }
  }

  // Se lojista pediu pra manter valor da venda como crédito ADICIONAL (ex: devolver tudo como crédito)
  // Subtrai o que já foi devolvido acima (crédito original) pra não duplicar
  if (devolver_como_credito && isAtacado && venda?.cliente) {
    const valorCredito = Math.max(0, Number(venda.preco_vendido || 0) - creditoDevolvido);
    if (valorCredito > 0) {
      try {
        const normNome = String(venda.cliente || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
        const cpfDig = String(venda.cpf || "").replace(/\D/g, "");
        const cnpjDig = String(venda.cnpj || "").replace(/\D/g, "");
        let lojistaId: string | null = null;
        if (cpfDig) {
          const { data: l } = await supabase.from("lojistas").select("id").eq("cpf", cpfDig).maybeSingle();
          if (l) lojistaId = l.id;
        }
        if (!lojistaId && cnpjDig) {
          const { data: l } = await supabase.from("lojistas").select("id").eq("cnpj", cnpjDig).maybeSingle();
          if (l) lojistaId = l.id;
        }
        if (!lojistaId && normNome) {
          const { data: ls } = await supabase.from("lojistas").select("id, nome").ilike("nome", normNome);
          if (ls && ls.length > 0) {
            const alvo = ls.find((l: { nome: string }) => (l.nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase() === normNome.toUpperCase()) || ls[0];
            lojistaId = alvo.id;
          }
        }
        if (!lojistaId) {
          // Auto-cria lojista antes de creditar
          const { data: created } = await supabase.from("lojistas").insert({ nome: venda.cliente, cpf: venda.cpf || null, cnpj: venda.cnpj || null, saldo_credito: 0 }).select("id").single();
          if (created) lojistaId = created.id;
        }
        if (lojistaId) {
          await supabase.rpc("mover_saldo_lojista", {
            p_lojista_id: lojistaId,
            p_tipo: "CREDITO",
            p_valor: valorCredito,
            p_venda_id: id,
            p_motivo: `Cancelamento venda ${String(id).slice(0, 8)} → crédito`,
            p_usuario: usuario,
          });
          await logActivity(usuario, "Venda cancelada → crédito lojista", `${venda.cliente}: +R$${valorCredito}`, "vendas", id);
        }
      } catch (e) {
        console.error("[Vendas] Erro ao creditar lojista:", e);
      }
    }
  }

  // Apagar entrega vinculada (se existir)
  await supabase.from("entregas").delete().eq("venda_id", id);

  const { error } = await supabase.from("vendas").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(
    usuario,
    "Excluiu venda",
    `${venda?.cliente || "?"} - ${venda?.produto || "?"}`,
    "vendas",
    id
  );

  // Notificação Telegram de venda cancelada
  if (venda) {
    sendCancelNotification({
      produto: venda.produto,
      cliente: venda.cliente,
      preco_vendido: venda.preco_vendido,
      usuario,
    }).catch(err => console.error("[Vendas] Erro notificação cancelamento:", err));
  }

  // Devolver ao estoque se a venda veio de produto cadastrado
  // Helper para restaurar estoque por serial ou nome+cor
  async function restaurarEstoque(v: typeof venda): Promise<boolean> {
    if (!v) return false;
    // 1. Por estoque_id direto
    if (v.estoque_id) {
      const { data: item } = await supabase.from("estoque").select("id, qnt, tipo").eq("id", v.estoque_id).single();
      if (item) {
        const { error: upErr } = await supabase.from("estoque").update({
          qnt: Number(item.qnt) + 1,
          status: "EM ESTOQUE",
          updated_at: new Date().toISOString(),
        }).eq("id", v.estoque_id);
        if (!upErr) {
          await logActivity(usuario, "Devolveu ao estoque (cancelamento)", v.produto, "estoque", v.estoque_id);
          return true;
        }
        console.error("[Vendas DELETE] Erro ao restaurar estoque por id:", upErr.message);
      }
    }
    // 2. Por serial_no (pega o mais recente, sem .single() que falha com múltiplos)
    if (v.serial_no) {
      const { data: bySerial } = await supabase.from("estoque")
        .select("id, qnt, status")
        .eq("serial_no", v.serial_no)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (bySerial && bySerial.length > 0) {
        const { error: upErr } = await supabase.from("estoque").update({
          qnt: 1, status: "EM ESTOQUE", updated_at: new Date().toISOString(),
        }).eq("id", bySerial[0].id);
        if (!upErr) {
          await logActivity(usuario, "Devolveu ao estoque (cancelamento, serial)", `${v.produto} serial=${v.serial_no}`, "estoque", bySerial[0].id);
          return true;
        }
        console.error("[Vendas DELETE] Erro ao restaurar por serial:", upErr.message);
      }
    }
    // 3. Por IMEI (mesma lógica do serial)
    if (v.imei) {
      const { data: byImei } = await supabase.from("estoque")
        .select("id, qnt, status")
        .eq("imei", v.imei)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (byImei && byImei.length > 0) {
        const { error: upErr } = await supabase.from("estoque").update({
          qnt: 1, status: "EM ESTOQUE", updated_at: new Date().toISOString(),
        }).eq("id", byImei[0].id);
        if (!upErr) {
          await logActivity(usuario, "Devolveu ao estoque (cancelamento, IMEI)", `${v.produto} imei=${v.imei}`, "estoque", byImei[0].id);
          return true;
        }
        console.error("[Vendas DELETE] Erro ao restaurar por IMEI:", upErr.message);
      }
    }
    // 4. Por produto+cor
    if (v.produto) {
      let q = supabase.from("estoque").select("id, qnt, status").eq("produto", v.produto).in("status", ["EM ESTOQUE", "ESGOTADO"]);
      if (v.cor) q = q.eq("cor", v.cor);
      const { data: byName } = await q.order("updated_at", { ascending: false }).limit(1);
      if (byName && byName.length > 0) {
        const { error: upErr } = await supabase.from("estoque").update({
          qnt: Number(byName[0].qnt) + 1, status: "EM ESTOQUE", updated_at: new Date().toISOString(),
        }).eq("id", byName[0].id);
        if (!upErr) {
          await logActivity(usuario, "Devolveu ao estoque (cancelamento, produto)", v.produto, "estoque", byName[0].id);
          return true;
        }
        console.error("[Vendas DELETE] Erro ao restaurar por produto:", upErr.message);
      }
    }
    // 5. Último recurso: recriar
    if (v.produto) {
      const { error: errInsert } = await supabase.from("estoque").insert({
        produto: v.produto,
        cor: v.cor || null,
        serial_no: v.serial_no || null,
        imei: v.imei || null,
        qnt: 1,
        status: "EM ESTOQUE",
        tipo: "NOVO",
        categoria: v.categoria || null,
        custo_unitario: v.custo || null,
        fornecedor: v.fornecedor || null,
        updated_at: new Date().toISOString(),
      });
      if (!errInsert) {
        await logActivity(usuario, "Recriou no estoque (cancelamento)", `${v.produto} serial=${v.serial_no || "?"}`, "estoque");
        return true;
      }
      await logActivity(usuario, "Cancelamento: falha ao recriar no estoque", `${v.produto}: ${errInsert.message}`, "estoque");
    }
    return false;
  }

  if (venda) {
    const restored = await restaurarEstoque(venda);
    if (!restored && venda.produto) {
      await logActivity(usuario, "Cancelamento: produto não restaurado ao estoque", venda.produto || "?", "estoque");
    }
  }

  // Se tinha produto na troca (valor OU nome de produto), remover a pendência específica do estoque
  if (venda && (venda.produto_na_troca || venda.troca_produto || venda.produto_na_troca2 || venda.troca_produto2) && venda.cliente) {
    const clienteUpper = (venda.cliente || "").toUpperCase();
    // Helper: busca pendência por produto exato, fallback por cliente+data
    async function removerPendencia(trocaProduto: string | null, label: string) {
      // 1. Tentar por nome exato do produto
      if (trocaProduto) {
        const { data: found } = await supabase.from("estoque")
          .select("id, produto")
          .eq("produto", trocaProduto)
          .eq("cliente", clienteUpper)
          .in("tipo", ["PENDENCIA", "SEMINOVO"])
          .order("created_at", { ascending: false })
          .limit(1);
        if (found && found.length > 0) {
          await supabase.from("estoque").delete().eq("id", found[0].id);
          await logActivity(usuario, `Removeu pendência ${label} (cancelamento)`, `${found[0].produto} — ${venda.cliente}`, "estoque");
          return;
        }
      }
      // 2. Fallback: buscar por cliente + tipo + data da venda
      const { data: fallback } = await supabase.from("estoque")
        .select("id, produto")
        .eq("cliente", clienteUpper)
        .in("tipo", ["PENDENCIA", "SEMINOVO"])
        .eq("data_compra", venda.data)
        .order("created_at", { ascending: false })
        .limit(1);
      if (fallback && fallback.length > 0) {
        await supabase.from("estoque").delete().eq("id", fallback[0].id);
        await logActivity(usuario, `Removeu pendência ${label} (cancelamento, fallback)`, `${fallback[0].produto} — ${venda.cliente}`, "estoque");
      }
    }
    // 1ª troca
    if (venda.troca_produto || venda.produto_na_troca) {
      await removerPendencia(venda.troca_produto, "troca");
    }
    // 2ª troca
    if (venda.troca_produto2 || venda.produto_na_troca2) {
      await removerPendencia(venda.troca_produto2, "troca 2");
    }
  }

  // Recalcular saldos do dia automaticamente
  if (venda?.data) recalcularSaldoDia(supabase, venda.data).catch(() => {});

  return NextResponse.json({ ok: true });
}
