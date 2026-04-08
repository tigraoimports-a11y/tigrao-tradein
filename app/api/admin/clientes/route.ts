import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() || "";
  const tab = searchParams.get("tab") || "clientes";

  // =========== TAB: FORNECEDORES ===========
  if (tab === "fornecedores") {
    // 1) Buscar cadastro de fornecedores (tabela master)
    const { data: fornCadastro, error: fornErr } = await supabase
      .from("fornecedores")
      .select("id, nome, contato, observacao, created_at")
      .order("nome");
    if (fornErr) return NextResponse.json({ error: fornErr.message }, { status: 500 });

    const cadastrados = new Set((fornCadastro || []).map(f => f.nome.trim().toUpperCase()));
    const cadastroMap = new Map((fornCadastro || []).map(f => [f.nome.trim().toUpperCase(), f]));

    // Mapeamento de aliases → nome canônico (baseado no sistema antigo todos_contatos_tigrao.csv)
    const FORN_ALIASES: Record<string, string> = {
      "ECO": "ECO CELL", "ECO CEL": "ECO CELL", "ECOCEL": "ECO CELL",
      "EMILIO SHOP": "EMILIO",
      "FABIO BANGU": "FÁBIO BANGU", "FABIO F/A": "FÁBIO BANGU",
      "MIAMI ZONE": "MIAMI",
      "PLANETA CEL": "PLANETA",
      "TM": "TM CEL",
      "XFB IMPORT": "XFB",
      "ZN": "ZN CELL", "ZN CEL": "ZN CELL",
    };
    function normForn(nome: string): string {
      const up = nome.trim().toUpperCase();
      return FORN_ALIASES[up] || up;
    }

    // 2) Buscar itens do estoque (com paginação)
    const estoqueQuery = supabase
      .from("estoque")
      .select("fornecedor, produto, cor, qnt, custo_unitario, data_compra, data_entrada, categoria, tipo, status, serial_no")
      .not("fornecedor", "is", null);
    const estoqueData: Record<string, unknown>[] = [];
    let estFrom = 0;
    const EST_PAGE = 1000;
    while (true) {
      const { data: batch, error: batchErr } = await estoqueQuery.range(estFrom, estFrom + EST_PAGE - 1);
      if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 });
      if (!batch || batch.length === 0) break;
      estoqueData.push(...batch.filter((b: Record<string, unknown>) => b.fornecedor && (b.fornecedor as string).trim() !== ""));
      if (batch.length < EST_PAGE) break;
      estFrom += EST_PAGE;
    }

    // 3) Buscar vendas (itens já vendidos — saíram do estoque, com paginação)
    const vendasQuery = supabase
      .from("vendas")
      .select("fornecedor, produto, custo, data, serial_no, imei, status_pagamento")
      .not("fornecedor", "is", null);
    const vendasData: Record<string, unknown>[] = [];
    let vFrom = 0;
    while (true) {
      const { data: batch, error: batchErr } = await vendasQuery.range(vFrom, vFrom + EST_PAGE - 1);
      if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 });
      if (!batch || batch.length === 0) break;
      vendasData.push(...batch.filter((b: Record<string, unknown>) =>
        b.fornecedor && (b.fornecedor as string).trim() !== "" && b.status_pagamento !== "CANCELADO"
      ));
      if (batch.length < EST_PAGE) break;
      vFrom += EST_PAGE;
    }

    // Agrupar por fornecedor (todos — cadastrados e não cadastrados)
    type FornEntry = {
      id: string;
      nome: string;
      contato: string | null;
      observacao: string | null;
      created_at: string;
      cadastrado: boolean;
      total_produtos: number;
      total_investido: number;
      total_em_estoque: number;
      total_vendido: number;
      primeira_compra: string;
      ultima_compra: string;
      categorias: Set<string>;
      compras: { produto: string; cor: string | null; qnt: number; custo_unitario: number; data: string; categoria: string; status: string; serial_no: string | null }[];
    };
    const fornMap = new Map<string, FornEntry>();

    // Inicializar todos os fornecedores cadastrados (mesmo sem compras)
    for (const fc of (fornCadastro || [])) {
      const key = normForn(fc.nome);
      if (search && !key.includes(search.toUpperCase())) continue;
      if (fornMap.has(key)) {
        // Já existe (outro cadastro mapeou pro mesmo nome canônico) — mescla dados de contato
        const existing = fornMap.get(key)!;
        if (!existing.contato && fc.contato) existing.contato = fc.contato;
        if (!existing.observacao && fc.observacao) existing.observacao = fc.observacao;
        continue;
      }
      fornMap.set(key, {
        id: fc.id, nome: fc.nome, contato: fc.contato, observacao: fc.observacao, created_at: fc.created_at,
        cadastrado: true,
        total_produtos: 0, total_investido: 0, total_em_estoque: 0, total_vendido: 0,
        primeira_compra: "", ultima_compra: "",
        categorias: new Set(), compras: [],
      });
    }

    // Helper: garante que fornecedor existe no map (cria se necessário)
    function ensureForn(forn: string): FornEntry | null {
      if (search && !forn.includes(search.toUpperCase())) return null;
      if (!fornMap.has(forn)) {
        fornMap.set(forn, {
          id: "", nome: forn,
          contato: null, observacao: null,
          created_at: "",
          cadastrado: false,
          total_produtos: 0, total_investido: 0, total_em_estoque: 0, total_vendido: 0,
          primeira_compra: "", ultima_compra: "",
          categorias: new Set(), compras: [],
        });
      }
      return fornMap.get(forn)!;
    }

    // Rastrear seriais/produtos já contabilizados (evitar duplicata estoque+venda)
    const contabilizados = new Set<string>();

    // Processar estoque (itens atuais)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const item of estoqueData as any[]) {
      const forn = normForn(item.fornecedor || "");
      if (!forn) continue;
      const f = ensureForn(forn);
      if (!f) continue;

      const custo = (item.custo_unitario || 0) * (item.qnt || 1);
      f.total_produtos += item.qnt || 1;
      f.total_investido += custo;
      if (item.status === "EM ESTOQUE") f.total_em_estoque += item.qnt || 0;
      if (item.categoria) f.categorias.add(item.categoria);

      const data = item.data_compra || item.data_entrada || "";
      if (data && (!f.primeira_compra || data < f.primeira_compra)) f.primeira_compra = data;
      if (data && (!f.ultima_compra || data > f.ultima_compra)) f.ultima_compra = data;

      // Marcar como contabilizado
      const chave = item.serial_no ? `serial:${item.serial_no}` : `prod:${forn}:${item.produto}:${data}:${item.custo_unitario}`;
      contabilizados.add(chave);

      f.compras.push({
        produto: item.produto, cor: item.cor, qnt: item.qnt || 1,
        custo_unitario: item.custo_unitario || 0, data, categoria: item.categoria || "",
        status: item.status || "", serial_no: item.serial_no || null,
      });
    }

    // Processar vendas (itens que saíram do estoque)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const v of vendasData as any[]) {
      const forn = normForn(v.fornecedor || "");
      if (!forn) continue;
      const f = ensureForn(forn);
      if (!f) continue;

      // Evitar duplicata com estoque
      const chave = v.serial_no ? `serial:${v.serial_no}` : `prod:${forn}:${v.produto}:${v.data}:${v.custo}`;
      if (contabilizados.has(chave)) continue;
      contabilizados.add(chave);

      const custo = Number(v.custo || 0);
      f.total_produtos += 1;
      f.total_investido += custo;
      f.total_vendido += 1;

      const data = v.data || "";
      if (data && (!f.primeira_compra || data < f.primeira_compra)) f.primeira_compra = data;
      if (data && (!f.ultima_compra || data > f.ultima_compra)) f.ultima_compra = data;

      f.compras.push({
        produto: v.produto || "", cor: null, qnt: 1,
        custo_unitario: custo, data, categoria: "",
        status: "VENDIDO", serial_no: v.serial_no || null,
      });
    }

    const fornecedores = Array.from(fornMap.values())
      .map(f => ({
        ...f,
        categorias: Array.from(f.categorias),
        compras: f.compras.sort((a, b) => (b.data || "").localeCompare(a.data || "")),
      }))
      .sort((a, b) => b.total_investido - a.total_investido);

    return NextResponse.json({
      fornecedores,
      total: fornecedores.length,
      total_investido: fornecedores.reduce((s, f) => s + f.total_investido, 0),
      total_produtos: fornecedores.reduce((s, f) => s + f.total_produtos, 0),
      total_em_estoque: fornecedores.reduce((s, f) => s + f.total_em_estoque, 0),
    });
  }

  // =========== TABS: clientes / lojistas — via RPC (SQL group by) ===========
  // Evita baixar todas as vendas pro Node — Postgres agrega e retorna só o resumo.
  if (tab === "clientes" || tab === "lojistas") {
    const { data: resumo, error: rpcErr } = await supabase.rpc("clientes_resumo", {
      p_is_lojista: tab === "lojistas",
      p_search: search || null,
    });
    if (rpcErr) {
      // Fallback pro caminho antigo caso a migration da RPC ainda não tenha rodado
      console.error("[clientes] RPC clientes_resumo falhou, usando fallback:", rpcErr.message);
    } else {
      type ResumoRow = {
        nome: string; cpf: string | null; cnpj: string | null; email: string | null;
        bairro: string | null; cidade: string | null; uf: string | null;
        total_compras: number; total_gasto: number; ultima_compra: string;
        ultimo_produto: string; cliente_desde: string; is_lojista: boolean;
        vendas: never[];
      };
      const clientes: ResumoRow[] = (resumo || []).map((r: Record<string, unknown>) => ({
        nome: String(r.nome || ""),
        cpf: (r.cpf as string | null) ?? null,
        cnpj: (r.cnpj as string | null) ?? null,
        email: (r.email as string | null) ?? null,
        bairro: (r.bairro as string | null) ?? null,
        cidade: (r.cidade as string | null) ?? null,
        uf: (r.uf as string | null) ?? null,
        total_compras: Number(r.total_compras || 0),
        total_gasto: Number(r.total_gasto || 0),
        ultima_compra: String(r.ultima_compra || ""),
        ultimo_produto: String(r.ultimo_produto || ""),
        cliente_desde: String(r.cliente_desde || ""),
        is_lojista: Boolean(r.is_lojista),
        vendas: [],
      }));
      return NextResponse.json({
        clientes,
        total: clientes.length,
        total_gasto: clientes.reduce((s: number, c: ResumoRow) => s + c.total_gasto, 0),
        total_compras: clientes.reduce((s: number, c: ResumoRow) => s + c.total_compras, 0),
      });
    }
  }

  // ─── Fallback (notas + caso RPC não esteja disponível) ───
  // Não usar .neq("status_pagamento", "CANCELADO") — bug do Supabase exclui registros com NULL
  let query = supabase
    .from("vendas")
    .select("id,data,cliente,cpf,cnpj,email,bairro,cidade,uf,origem,tipo,produto,fornecedor,preco_vendido,forma,banco,serial_no,imei,nota_fiscal_url,status_pagamento")
    .order("data", { ascending: false });

  if (search) {
    const clean = search.replace(/[\.\-\/\s]/g, "");
    if (/^[A-Z0-9]{8,}$/i.test(clean)) {
      query = query.or(`serial_no.ilike.%${clean}%,imei.ilike.%${clean}%,cpf.ilike.%${clean}%,cliente.ilike.%${search}%`);
    } else if (/^\d{3,}$/.test(clean)) {
      query = query.ilike("cpf", `%${clean}%`);
    } else {
      query = query.ilike("cliente", `%${search}%`);
    }
  }

  // Paginação em batches
  const rawVendas: Record<string, unknown>[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data: batch, error: batchErr } = await query.range(from, from + PAGE - 1);
    if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 });
    if (!batch || batch.length === 0) break;
    rawVendas.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  // Filtrar cancelados em JS (evita bug do .neq() com NULL no Supabase)
  const vendas = rawVendas.filter((v: Record<string, unknown>) =>
    v.status_pagamento !== "CANCELADO"
  );

  // Tab "notas"
  if (tab === "notas") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notas = vendas.filter((v: any) => v.nota_fiscal_url).map((v: any) => ({
      id: v.id, data: v.data, cliente: v.cliente, produto: v.produto,
      preco_vendido: Number(v.preco_vendido || 0), nota_fiscal_url: v.nota_fiscal_url,
    }));
    return NextResponse.json({ notas, total: notas.length });
  }

  // Agrupar por cliente (sem enviar vendas[] no response — fica mais leve)
  const clienteMap = new Map<string, {
    nome: string; cpf: string | null; cnpj: string | null; email: string | null;
    bairro: string | null; cidade: string | null; uf: string | null;
    total_compras: number; total_gasto: number; ultima_compra: string; ultimo_produto: string;
    cliente_desde: string; is_lojista: boolean;
    vendas: { id: string; data: string; produto: string; preco_vendido: number; forma: string; banco: string; serial_no: string | null; imei: string | null }[];
  }>();
  const cpfToKey = new Map<string, string>();

  // Normaliza nome: tira acentos, colapsa espaços, remove sufixos comuns de lojistas atacado
  // ("ATACADO", "LOJA", "LOJAS", "STORE") pra unificar "021 TECH" e "021 TECH ATACADO".
  const normalizeLojistaNome = (n: string) =>
    n.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ").trim().toUpperCase()
      .replace(/\s+(ATACADO|ATAC|LOJAS?|STORE|IMPORTS?|CELL|CEL)\b.*$/i, "")
      .trim();

  const cnpjToKey = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const v of vendas as any[]) {
    const nome = (v.cliente || "").trim();
    if (!nome) continue;
    const isAtacado = v.tipo === "ATACADO" || v.origem === "ATACADO";
    const cpf = (v.cpf || "").trim();
    const cnpj = (v.cnpj || "").trim();

    let key: string;
    if (cpf) {
      if (cpfToKey.has(cpf)) { key = cpfToKey.get(cpf)!; }
      else { key = `cpf:${cpf}`; cpfToKey.set(cpf, key); }
    } else if (cnpj) {
      if (cnpjToKey.has(cnpj)) { key = cnpjToKey.get(cnpj)!; }
      else { key = `cnpj:${cnpj}`; cnpjToKey.set(cnpj, key); }
    } else {
      key = `nome:${normalizeLojistaNome(nome)}`;
    }

    if (!clienteMap.has(key)) {
      clienteMap.set(key, {
        nome, cpf: v.cpf, cnpj: v.cnpj, email: v.email,
        bairro: v.bairro, cidade: v.cidade, uf: v.uf,
        total_compras: 0, total_gasto: 0, ultima_compra: v.data, ultimo_produto: v.produto,
        cliente_desde: v.data, is_lojista: isAtacado, vendas: [],
      });
    }

    const c = clienteMap.get(key)!;
    c.total_compras++;
    c.total_gasto += Number(v.preco_vendido || 0);
    if (v.data > c.ultima_compra) { c.ultima_compra = v.data; c.ultimo_produto = v.produto; }
    if (v.data < c.cliente_desde) c.cliente_desde = v.data;
    if (isAtacado) c.is_lojista = true;
    if (nome.length > c.nome.length) c.nome = nome;
    if (v.cpf && !c.cpf) c.cpf = v.cpf;
    if (v.cnpj && !c.cnpj) c.cnpj = v.cnpj;
    if (v.email && !c.email) c.email = v.email;
    if (v.bairro && !c.bairro) c.bairro = v.bairro;
    if (v.cidade && !c.cidade) c.cidade = v.cidade;
    if (v.uf && !c.uf) c.uf = v.uf;

    c.vendas.push({
      id: v.id, data: v.data, produto: v.produto, preco_vendido: Number(v.preco_vendido || 0),
      forma: v.forma, banco: v.banco, serial_no: v.serial_no, imei: v.imei,
    });
  }

  let clientes = Array.from(clienteMap.values());
  if (tab === "lojistas") {
    clientes = clientes.filter((c) => c.is_lojista);
  } else {
    clientes = clientes.filter((c) => !c.is_lojista);
  }

  clientes.sort((a, b) => b.total_gasto - a.total_gasto);

  return NextResponse.json({
    clientes,
    total: clientes.length,
    total_gasto: clientes.reduce((s, c) => s + c.total_gasto, 0),
    total_compras: clientes.reduce((s, c) => s + c.total_compras, 0),
  });
}
