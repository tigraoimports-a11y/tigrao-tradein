import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function authCron(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return secret === process.env.CRON_SECRET;
}

function diasAtras(dateStr: string): number {
  const now = new Date();
  const created = new Date(dateStr);
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

function primeiroNome(nome: string): string {
  return (nome || "").split(" ")[0] || "Cliente";
}

// Normaliza nome pra comparacao: "  João Silva " → "JOAO SILVA"
function normalizarNome(nome: string): string {
  return (nome || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

// Envia mensagem de texto simples via Z-API (instancia de follow-up)
async function enviarWhatsApp(phone: string, message: string): Promise<boolean> {
  const instanceId = process.env.ZAPI_FOLLOWUP_INSTANCE_ID;
  const token = process.env.ZAPI_FOLLOWUP_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN ?? "";

  if (!instanceId || !token) {
    console.log("[Followup] Z-API nao configurado, pulando envio WhatsApp");
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
    console.log(`[Followup] WhatsApp enviado para ${fone}:`, JSON.stringify(json));
    return res.ok;
  } catch (err) {
    console.error(`[Followup] Erro ao enviar WhatsApp para ${phone}:`, err);
    return false;
  }
}

// Retorna true se o horario atual (America/Sao_Paulo) esta fora da janela
// comercial pra envio de follow-up de simulacao.
// Regras (pedido da equipe pra nao incomodar cliente no fim de semana):
// - Domingo: nao envia o dia todo
// - Sabado: nao envia a partir do meio-dia (sabado tarde/noite)
// Segunda a sexta e sabado de manha continuam enviando normal.
function foraDoHorarioComercial(): { fora: boolean; motivo: string } {
  const nowSP = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  );
  const dow = nowSP.getDay(); // 0=Dom, 6=Sab
  const hour = nowSP.getHours();
  if (dow === 0) return { fora: true, motivo: "Domingo — pausado" };
  if (dow === 6 && hour >= 12) return { fora: true, motivo: "Sabado a tarde — pausado" };
  return { fora: false, motivo: "" };
}

// Roda todo dia as 14h — envia WhatsApp automatico pro cliente que simulou e nao fechou
// Verifica se o cliente ja comprou antes de enviar
export async function GET(req: NextRequest) {
  if (!authCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pausa fim de semana (domingo inteiro + sabado a partir do meio-dia)
  const janela = foraDoHorarioComercial();
  if (janela.fora) {
    return NextResponse.json({ ok: true, skipped: true, motivo: janela.motivo });
  }

  try {
    // Buscar simulacoes dos ultimos 3 dias
    const tresDiasAtras = new Date();
    tresDiasAtras.setDate(tresDiasAtras.getDate() - 3);
    const dataLimite = tresDiasAtras.toISOString();

    const { data: sims, error } = await supabase
      .from("simulacoes")
      .select("id, created_at, nome, whatsapp, modelo_novo, storage_novo, preco_novo, modelo_usado, storage_usado, avaliacao_usado, diferenca, status, contatado, follow_up_enviado, opt_out_whatsapp, vendedor")
      .gte("created_at", dataLimite)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Followup] Query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!sims || sims.length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhuma simulacao nos ultimos 3 dias" });
    }

    // Filtrar: status SAIR (nao fechou) E sem follow-up enviado E sem opt-out
    const naoConvertidas = sims.filter(s =>
      s.status === "SAIR" && !s.follow_up_enviado && !s.opt_out_whatsapp
    );

    if (naoConvertidas.length === 0) {
      return NextResponse.json({ ok: true, message: "Todas simulacoes ja foram acompanhadas" });
    }

    // Buscar vendas dos ultimos 90 dias pra cruzar (quem ja comprou)
    // Janela ampla pra pegar clientes que compraram antes e agora simularam de novo
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
    // Se o cliente ja clicou GOSTEI alguma vez, nao precisa follow-up
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

    // Enviar WhatsApp pra quem saiu sem fechar, tem whatsapp, e tem pelo menos 1 dia
    const paraEnviarWA = naoConvertidas.filter(s => {
      const dias = diasAtras(s.created_at);
      return s.whatsapp && dias >= 1;
    });

    let whatsappEnviados = 0;
    let jaCompraram = 0;
    const whatsappErros: string[] = [];

    for (const s of paraEnviarWA) {
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
        await supabase
          .from("simulacoes")
          .update({ follow_up_enviado: true })
          .eq("id", s.id);
        continue;
      }

      const nome = primeiroNome(s.nome);
      const modeloUsado = s.modelo_usado ? `${s.modelo_usado}${s.storage_usado ? ` ${s.storage_usado}` : ""}` : "seu aparelho";
      const modeloNovoFull = s.modelo_novo ? `${s.modelo_novo}${s.storage_novo ? ` ${s.storage_novo}` : ""}` : "o produto";

      const nomeVendedor = s.vendedor || "Nicolas";
      const msg = `Oi ${nome}! Tudo bem? Me chamo ${nomeVendedor}. 😊\n\nVi que você fez uma simulação de upgrade aqui na TIGRÃO IMPORTS, dando seu ${modeloUsado} na compra do ${modeloNovoFull}. Mas não fechou seu pedido conosco 🙁\n\nQueria saber se ficou com alguma dúvida? Talvez eu consiga te ajudar a fechar seu pedido hoje 🤩\n\n_Digite *1* se tiver interesse ou *2* para não receber mais mensagens._`;

      const enviou = await enviarWhatsApp(s.whatsapp, msg);

      if (enviou) {
        whatsappEnviados++;
        await supabase
          .from("simulacoes")
          .update({ follow_up_enviado: true })
          .eq("id", s.id);
      } else {
        whatsappErros.push(s.nome || "Sem nome");
      }

      // Delay de 3s entre mensagens
      if (paraEnviarWA.indexOf(s) < paraEnviarWA.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    return NextResponse.json({
      ok: true,
      total_simulacoes: sims.length,
      nao_convertidas: naoConvertidas.length,
      whatsapp_enviados: whatsappEnviados,
      ja_compraram: jaCompraram,
      whatsapp_erros: whatsappErros,
    });
  } catch (err) {
    console.error("[Followup] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
