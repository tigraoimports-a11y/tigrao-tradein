import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function authCron(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return secret === process.env.CRON_SECRET;
}

function primeiroNome(nome: string): string {
  return (nome || "").split(" ")[0] || "Cliente";
}

function fmtBRL(v: number): string {
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

// Normaliza nome pra comparacao: "  João Silva " → "JOAO SILVA"
function normalizarNome(nome: string): string {
  return (nome || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/\s+/g, " ");
}

// Primeiro nome normalizado: "CAMILLA PIMENTEL" → "CAMILLA"
function primeiroNomeNorm(nome: string): string {
  return normalizarNome(nome).split(" ")[0] || "";
}

// Normaliza telefone: so digitos, remove DDI 55
function normalizarTelefone(tel: string): string {
  let t = (tel || "").replace(/\D/g, "");
  if (t.length > 11 && t.startsWith("55")) t = t.substring(2);
  return t;
}

// Envia mensagem via Z-API (instancia de follow-up)
async function enviarWhatsApp(phone: string, message: string): Promise<boolean> {
  const instanceId = process.env.ZAPI_FOLLOWUP_INSTANCE_ID;
  const token = process.env.ZAPI_FOLLOWUP_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN ?? "";

  if (!instanceId || !token) {
    console.log("[AlertaPreco] Z-API nao configurado");
    return false;
  }

  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

  try {
    let fone = phone.replace(/\D/g, "");
    if (!fone.startsWith("55")) fone = `55${fone}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": clientToken,
      },
      body: JSON.stringify({ phone: fone, message }),
    });
    const json = await res.json();
    console.log(`[AlertaPreco] WhatsApp enviado para ${fone}:`, JSON.stringify(json));
    return res.ok;
  } catch (err) {
    console.error(`[AlertaPreco] Erro ao enviar WhatsApp para ${phone}:`, err);
    return false;
  }
}

// Roda todo dia as 11h — verifica se algum produto baixou de preco
// e avisa o cliente que simulou aquele produto (so se ele NAO comprou)
export async function GET(req: NextRequest) {
  if (!authCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Buscar precos atuais da tabela precos — SO LACRADO.
    // Simulacoes vem do fluxo /troca (aparelho novo lacrado). Se cruzassemos
    // com SEMINOVO, que tem mesmo modelo+armazenamento mas preco bem mais
    // baixo, a conta de "baixou R$X" daria um valor enorme e o robo mandaria
    // "queda" errada. Filtro no banco evita confusao mesmo com tipo LACRADO
    // tendo varios valores (TRADEIN/CATALOGO/AMBOS).
    const { data: precos, error: errPrecos } = await supabase
      .from("precos")
      .select("modelo, armazenamento, preco_pix")
      .neq("status", "esgotado")
      .neq("tipo", "SEMINOVO");

    if (errPrecos || !precos) {
      console.error("[AlertaPreco] Erro ao buscar precos:", errPrecos);
      return NextResponse.json({ error: "Erro ao buscar precos" }, { status: 500 });
    }

    // Mapa de precos atuais: "iPhone 16 Pro|256GB" → 5797
    const precoAtualMap = new Map<string, number>();
    for (const p of precos) {
      const key = `${p.modelo}|${p.armazenamento}`;
      precoAtualMap.set(key, Number(p.preco_pix));
    }

    // 2. Buscar simulacoes dos ultimos 30 dias (status SAIR, sem alerta enviado)
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    const dataLimite = trintaDiasAtras.toISOString();

    const { data: sims, error: errSims } = await supabase
      .from("simulacoes")
      .select("id, nome, whatsapp, modelo_novo, storage_novo, preco_novo, modelo_usado, storage_usado, diferenca, status, alerta_preco_enviado, opt_out_whatsapp")
      .gte("created_at", dataLimite)
      .eq("status", "SAIR")
      .or("alerta_preco_enviado.is.null,alerta_preco_enviado.eq.false")
      .order("created_at", { ascending: false });

    if (errSims) {
      console.error("[AlertaPreco] Erro ao buscar simulacoes:", errSims);
      return NextResponse.json({ error: errSims.message }, { status: 500 });
    }

    // Filtrar opt-out no código (evita conflito de múltiplos .or() no Supabase)
    const simsElegiveis = (sims || []).filter(s => !s.opt_out_whatsapp);

    if (simsElegiveis.length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhuma simulacao elegivel" });
    }

    // 3. Buscar vendas dos ultimos 90 dias pra cruzar (quem ja comprou)
    // Janela ampla pra pegar clientes que compraram antes
    const noventaDias = new Date();
    noventaDias.setDate(noventaDias.getDate() - 90);
    const dataLimiteVendas = noventaDias.toISOString();

    const { data: vendas } = await supabase
      .from("vendas")
      .select("cliente, telefone")
      .gte("created_at", dataLimiteVendas);

    const nomesQueCompraram = new Set<string>();
    const primeirosNomesQueCompraram = new Set<string>();
    const telefonesQueCompraram = new Set<string>();
    if (vendas) {
      for (const v of vendas) {
        if (v.cliente) {
          nomesQueCompraram.add(normalizarNome(v.cliente));
          const pn = primeiroNomeNorm(v.cliente);
          if (pn.length >= 4) primeirosNomesQueCompraram.add(pn);
        }
        if (v.telefone) {
          const t = normalizarTelefone(v.telefone);
          if (t.length >= 10) telefonesQueCompraram.add(t);
        }
      }
    }

    // Tambem buscar link_compras dos ultimos 90 dias (tem telefone bem preenchido)
    const { data: links } = await supabase
      .from("link_compras")
      .select("cliente_nome, cliente_telefone")
      .gte("created_at", dataLimiteVendas);
    if (links) {
      for (const l of links) {
        if (l.cliente_nome) nomesQueCompraram.add(normalizarNome(l.cliente_nome));
        if (l.cliente_telefone) {
          const t = normalizarTelefone(l.cliente_telefone);
          if (t.length >= 10) telefonesQueCompraram.add(t);
        }
      }
    }

    // Telefones que ja demonstraram interesse (GOSTEI) em QUALQUER simulacao
    // Se o cliente ja clicou GOSTEI alguma vez, provavelmente comprou ou esta em
    // negociacao ativa — nao precisa alerta automatico
    const { data: gosteis } = await supabase
      .from("simulacoes")
      .select("whatsapp")
      .eq("status", "GOSTEI");
    const telefonesQueGostaram = new Set<string>();
    if (gosteis) {
      for (const g of gosteis) {
        if (g.whatsapp) {
          const t = normalizarTelefone(g.whatsapp);
          if (t.length >= 10) telefonesQueGostaram.add(t);
        }
      }
    }

    // 4. Comparar precos e enviar alertas
    let alertasEnviados = 0;
    let jaCompraram = 0;
    const erros: string[] = [];
    const QUEDA_MINIMA = 100; // so avisa se baixou pelo menos R$100

    for (const s of simsElegiveis) {
      if (!s.whatsapp || !s.modelo_novo || !s.storage_novo || !s.preco_novo) continue;

      // Verificar se o cliente ja comprou ou ja demonstrou interesse
      const nomeNorm = normalizarNome(s.nome);
      const pNome = primeiroNomeNorm(s.nome);
      const telNorm = normalizarTelefone(s.whatsapp || "");

      const jaComprouPorTel = telNorm.length >= 10 && telefonesQueCompraram.has(telNorm);
      const jaComprouPorNome = nomeNorm && nomesQueCompraram.has(nomeNorm);
      // Match por primeiro nome: so vale se a simulacao tem so o primeiro nome
      // (pra evitar falsos positivos com sobrenomes diferentes)
      const simSoPrimeiroNome = nomeNorm.split(" ").length === 1;
      const jaComprouPorPrimeiroNome = simSoPrimeiroNome && pNome.length >= 4 && primeirosNomesQueCompraram.has(pNome);
      const jaGostou = telNorm.length >= 10 && telefonesQueGostaram.has(telNorm);

      if (jaComprouPorTel || jaComprouPorNome || jaComprouPorPrimeiroNome || jaGostou) {
        jaCompraram++;
        // Marcar como enviado pra nao checar de novo
        await supabase
          .from("simulacoes")
          .update({ alerta_preco_enviado: true })
          .eq("id", s.id);
        continue;
      }

      const key = `${s.modelo_novo}|${s.storage_novo}`;
      const precoAtual = precoAtualMap.get(key);

      if (!precoAtual) continue; // produto nao existe mais

      const precoOriginal = Number(s.preco_novo);
      const queda = precoOriginal - precoAtual;

      if (queda < QUEDA_MINIMA) continue; // nao baixou o suficiente

      // Calcular nova diferenca (preco novo - avaliacao usado)
      const avaliacaoUsado = Number(s.diferenca || 0) > 0
        ? precoOriginal - Number(s.diferenca)
        : 0;
      const novaDiferenca = avaliacaoUsado > 0 ? precoAtual - avaliacaoUsado : precoAtual;

      const nome = primeiroNome(s.nome);
      const modeloUsado = s.modelo_usado
        ? `${s.modelo_usado}${s.storage_usado ? ` ${s.storage_usado}` : ""}`
        : "seu aparelho";

      const msg = `Oi ${nome}! Tenho uma boa notícia! 🎉\n\nO *${s.modelo_novo} ${s.storage_novo}* que você pesquisou aqui na TIGRÃO IMPORTS *baixou ${fmtBRL(queda)}*!\n\nDando seu ${modeloUsado} na troca, a diferença agora fica em *${fmtBRL(novaDiferenca)}*.\n\nQuer aproveitar essa condição? Estou à disposição! 🐯`;

      const enviou = await enviarWhatsApp(s.whatsapp, msg);

      if (enviou) {
        alertasEnviados++;
        await supabase
          .from("simulacoes")
          .update({ alerta_preco_enviado: true })
          .eq("id", s.id);
      } else {
        erros.push(s.nome || "Sem nome");
      }

      // Delay de 3s entre mensagens
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    return NextResponse.json({
      ok: true,
      simulacoes_analisadas: sims.length,
      alertas_enviados: alertasEnviados,
      ja_compraram: jaCompraram,
      erros,
    });
  } catch (err) {
    console.error("[AlertaPreco] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
