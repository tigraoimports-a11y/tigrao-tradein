// app/api/admin/sku/reconciliacao/route.ts
// Detecta inconsistencias entre estoque e vendas usando SKU canonico como
// chave de cruzamento. Projetado pra auditoria semanal/mensal — responde
// "cade as coisas que nao batem?".
//
// 3 tipos de inconsistencia:
//
//   1. SKU_DIVERGENTE_PERSISTIDO:
//      Venda com estoque_id vinculado, mas vendas.sku ≠ estoque.sku.
//      Significa que o bloqueio falhou antes (pre-validacao) ou o admin
//      editou depois. Risco: produto errado foi separado pro cliente.
//
//   2. ESGOTADO_SEM_VENDA:
//      Item de estoque com status ESGOTADO/VENDIDO mas sem venda vinculada
//      (nenhuma venda com estoque_id apontando pra ele). Possivel sumico/
//      roubo/venda fora do sistema.
//
//   3. VENDA_SEM_ESTOQUE:
//      Venda registrada sem estoque_id (nao deduziu de nenhum item).
//      Possivel dupla-contagem — o estoque ainda pensa que tem.
//
// Uso:
//   GET /api/admin/sku/reconciliacao?from=YYYY-MM-DD
//   Default: ultimos 30 dias.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { compararSkus } from "@/lib/sku-validator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// Hipotese automatica — cruzamento heuristico pra classificar sumicos e
// vendas sem baixa segundo a causa mais provavel. Permite o admin agir rapido
// sem abrir cada caso pra investigar manualmente.
interface Hipotese {
  // Tipo da hipotese:
  //   serial_match           — achou contraparte com mesmo serial/imei (match certeiro)
  //   atacado_proximo        — achou venda atacado com mesmo SKU em data proxima
  //   venda_nao_vinculada    — venda com mesmo SKU, proxima, mas sem estoque_id
  //   brinde_proximo         — venda brinde com mesmo SKU em data proxima
  //   lote_presumido         — 3+ sumicos iguais (mesmo SKU, data proxima) = atacado provavel
  //   estoque_disponivel     — (VENDA_SEM_ESTOQUE) item com mesmo SKU existe EM ESTOQUE
  //   estoque_esgotado       — (VENDA_SEM_ESTOQUE) item com mesmo SKU existe ESGOTADO
  //   nenhuma                — nada encontrado, investigar
  tipo: "serial_match" | "atacado_proximo" | "venda_nao_vinculada"
    | "brinde_proximo" | "lote_presumido"
    | "estoque_disponivel" | "estoque_esgotado"
    | "nenhuma";
  confianca: "alta" | "media" | "baixa";
  descricao: string;
  venda_id?: string;
  estoque_id?: string;    // usado em VENDA_SEM_ESTOQUE pra sugerir vinculo reverso
  cliente?: string;
  data_venda?: string;
}

interface Inconsistencia {
  tipo: "SKU_DIVERGENTE_PERSISTIDO" | "ESGOTADO_SEM_VENDA" | "VENDA_SEM_ESTOQUE";
  severidade: "alta" | "media" | "baixa";
  descricao: string;
  produto: string;
  detalhes: Record<string, string | number | null>;
  ids: { venda_id?: string; estoque_id?: string };
  hipotese?: Hipotese;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fromParam = req.nextUrl.searchParams.get("from");
  const fromDate = fromParam || daysAgoIso(30).slice(0, 10);

  try {
    const resultados: Inconsistencia[] = [];

    // ── 1. SKU divergente persistido ────────────────────────────────
    // Vendas com estoque_id + sku diferente do estoque.sku
    const { data: vendasComEstoque } = await supabase
      .from("vendas")
      .select("id, produto, sku, estoque_id, cliente, data, preco_vendido")
      .not("estoque_id", "is", null)
      .not("sku", "is", null)
      .gte("data", fromDate)
      .neq("status_pagamento", "CANCELADO");

    if (vendasComEstoque && vendasComEstoque.length > 0) {
      const estoqueIds = vendasComEstoque.map((v) => v.estoque_id!).filter(Boolean) as string[];
      const { data: itensEstoque } = await supabase
        .from("estoque")
        .select("id, sku, produto")
        .in("id", estoqueIds);
      const estoqueMap = new Map<string, { sku: string | null; produto: string }>(
        (itensEstoque || []).map((e) => [e.id, { sku: e.sku, produto: e.produto }]),
      );

      for (const v of vendasComEstoque) {
        const est = estoqueMap.get(v.estoque_id!);
        if (!est || !est.sku) continue; // se estoque nao tem SKU, pula
        // Usa o mesmo comparador do bloqueio de criacao/edicao — tolera SKU
        // parcial (ex: venda gravada sem cor vs estoque com cor). Se compararSkus
        // considera OK, NAO e divergencia real — pula.
        const comp = compararSkus(v.sku, est.sku);
        if (comp.ok) continue;
        resultados.push({
          tipo: "SKU_DIVERGENTE_PERSISTIDO",
          severidade: "alta",
          descricao: comp.motivo
            ? `Divergencia em: ${comp.motivo}`
            : "Venda vinculada a item de estoque com SKU diferente",
          produto: v.produto || est.produto,
          detalhes: {
            venda_sku: v.sku,
            estoque_sku: est.sku,
            cliente: v.cliente || "?",
            data: v.data || "?",
            preco: Number(v.preco_vendido || 0),
          },
          ids: { venda_id: v.id, estoque_id: v.estoque_id! },
        });
      }
    }

    // ── 2. Esgotado sem venda (produto sumiu) ──────────────────────
    // Itens de estoque com status=ESGOTADO no periodo mas sem venda vinculada.
    // So checa os ESGOTADOS recentemente (updated_at >= fromDate) pra evitar
    // lixo historico antigo.
    const { data: esgotados } = await supabase
      .from("estoque")
      .select("id, produto, sku, cor, serial_no, imei, custo_unitario, updated_at")
      .eq("status", "ESGOTADO")
      .gte("updated_at", fromDate);

    if (esgotados && esgotados.length > 0) {
      const esgotadoIds = esgotados.map((e) => e.id);
      const { data: vendasVinculadas } = await supabase
        .from("vendas")
        .select("estoque_id")
        .in("estoque_id", esgotadoIds);
      const vinculados = new Set((vendasVinculadas || []).map((v) => v.estoque_id));

      const sumicos = esgotados.filter((e) => !vinculados.has(e.id));

      // Heuristica "lote presumido": 3+ sumicos do mesmo SKU em ate 7 dias entre
      // si = provavel atacado em lote. Muito provavelmente e uma venda que o
      // admin registrou uma vez mas o estoque tem varias unidades marcadas
      // ESGOTADO (ou 1 venda pro lojista com multiplas unidades).
      const sumicosPorSku = new Map<string, typeof sumicos>();
      for (const s of sumicos) {
        if (!s.sku) continue;
        const lista = sumicosPorSku.get(s.sku) || [];
        lista.push(s);
        sumicosPorSku.set(s.sku, lista);
      }
      const lotePresumido = new Set<string>(); // ids de estoque que entram em lote
      for (const [, lista] of sumicosPorSku) {
        if (lista.length < 3) continue;
        // Checa se estao em uma janela de 7 dias
        const datas = lista.map((s) => s.updated_at?.slice(0, 10)).filter(Boolean).sort();
        if (datas.length < 3) continue;
        const primeiro = new Date(datas[0]!).getTime();
        const ultimo = new Date(datas[datas.length - 1]!).getTime();
        if ((ultimo - primeiro) / 86400000 <= 7) {
          for (const s of lista) lotePresumido.add(s.id);
        }
      }

      // Cruzamento heuristico: pra cada sumico, tenta achar uma venda que
      // explique a saida. 3 estrategias em ordem de confianca decrescente:
      //   1. Mesmo serial/imei (match certeiro)
      //   2. Mesmo SKU + data proxima (±3 dias) + atacado/brinde (legitimo)
      //   3. Mesmo SKU + data proxima + sem estoque_id (venda nao vinculada)
      //
      // Carrega todas as vendas candidatas em 1 query pra evitar N+1.
      const skusEsgotados = [...new Set(sumicos.map((e) => e.sku).filter(Boolean) as string[])];
      const seriaisEsgotados = [...new Set(sumicos.map((e) => e.serial_no).filter(Boolean) as string[])];
      const imeisEsgotados = [...new Set(sumicos.map((e) => e.imei).filter(Boolean) as string[])];

      // Data limite: 7 dias antes do primeiro sumico (margem de seguranca)
      const dataMinimaVendas = (() => {
        const min = sumicos.reduce((acc, e) => {
          if (!e.updated_at) return acc;
          return !acc || e.updated_at < acc ? e.updated_at : acc;
        }, null as string | null);
        if (!min) return fromDate;
        const d = new Date(min);
        d.setDate(d.getDate() - 7);
        return d.toISOString().slice(0, 10);
      })();

      // 1 query pra todas as vendas potencialmente relacionadas
      let vendasCandidatas: Array<{
        id: string; produto: string | null; sku: string | null; cliente: string | null;
        data: string | null; serial_no: string | null; imei: string | null;
        estoque_id: string | null; tipo: string | null; is_brinde: boolean | null;
      }> = [];
      if (skusEsgotados.length > 0 || seriaisEsgotados.length > 0 || imeisEsgotados.length > 0) {
        const filtros: string[] = [];
        if (skusEsgotados.length > 0) filtros.push(`sku.in.(${skusEsgotados.map((s) => `"${s}"`).join(",")})`);
        if (seriaisEsgotados.length > 0) filtros.push(`serial_no.in.(${seriaisEsgotados.map((s) => `"${s}"`).join(",")})`);
        if (imeisEsgotados.length > 0) filtros.push(`imei.in.(${imeisEsgotados.map((i) => `"${i}"`).join(",")})`);

        const { data: vendas } = await supabase
          .from("vendas")
          .select("id, produto, sku, cliente, data, serial_no, imei, estoque_id, tipo, is_brinde")
          .or(filtros.join(","))
          .gte("data", dataMinimaVendas)
          .neq("status_pagamento", "CANCELADO");
        vendasCandidatas = vendas || [];
      }

      // Helper: diferenca de dias entre duas datas ISO (YYYY-MM-DD ou com T)
      const diffDias = (a: string | null, b: string | null): number => {
        if (!a || !b) return 999;
        const ta = new Date(a.slice(0, 10)).getTime();
        const tb = new Date(b.slice(0, 10)).getTime();
        return Math.abs((ta - tb) / 86400000);
      };

      for (const e of sumicos) {
        // Analisa hipoteses por ordem de confianca
        let hipotese: Hipotese | undefined;
        const dataSumico = e.updated_at ? e.updated_at.slice(0, 10) : null;

        // 1. Match de serial/imei (confianca alta — praticamente certeza)
        const matchSerial = vendasCandidatas.find((v) => {
          if (v.estoque_id) return false; // ja vinculada a outro estoque
          if (e.serial_no && v.serial_no && v.serial_no.toUpperCase() === e.serial_no.toUpperCase()) return true;
          if (e.imei && v.imei && v.imei === e.imei) return true;
          return false;
        });
        if (matchSerial) {
          hipotese = {
            tipo: "serial_match",
            confianca: "alta",
            descricao: `Venda de ${matchSerial.cliente || "?"} (${matchSerial.data || "?"}) tem o mesmo ${matchSerial.serial_no ? "serial" : "IMEI"} mas nao esta vinculada ao estoque. Basta vincular.`,
            venda_id: matchSerial.id,
            cliente: matchSerial.cliente || undefined,
            data_venda: matchSerial.data || undefined,
          };
        }

        // 2. Venda atacado / brinde com mesmo SKU em data proxima (legitimo)
        if (!hipotese && e.sku) {
          const atacadoOuBrinde = vendasCandidatas.find((v) => {
            if (v.sku !== e.sku) return false;
            if (diffDias(v.data, dataSumico) > 5) return false;
            return v.tipo === "ATACADO" || !!v.is_brinde;
          });
          if (atacadoOuBrinde) {
            hipotese = {
              tipo: atacadoOuBrinde.is_brinde ? "brinde_proximo" : "atacado_proximo",
              confianca: "media",
              descricao: atacadoOuBrinde.is_brinde
                ? `Brinde de ${atacadoOuBrinde.cliente || "?"} em ${atacadoOuBrinde.data} — provavelmente este item. Ignora com seguranca.`
                : `Venda atacado pra ${atacadoOuBrinde.cliente || "?"} em ${atacadoOuBrinde.data} com mesmo SKU — provavelmente este item faz parte do lote. Ignora com seguranca.`,
              venda_id: atacadoOuBrinde.id,
              cliente: atacadoOuBrinde.cliente || undefined,
              data_venda: atacadoOuBrinde.data || undefined,
            };
          }
        }

        // 3. Venda normal com mesmo SKU em data proxima, sem estoque_id (nao vinculada)
        if (!hipotese && e.sku) {
          const candidatasNaoVinculadas = vendasCandidatas.filter((v) => {
            if (v.sku !== e.sku) return false;
            if (v.estoque_id) return false;
            if (diffDias(v.data, dataSumico) > 5) return false;
            return true;
          });
          // Pega a mais proxima na data
          candidatasNaoVinculadas.sort((a, b) => diffDias(a.data, dataSumico) - diffDias(b.data, dataSumico));
          const naoVinculada = candidatasNaoVinculadas[0];
          if (naoVinculada) {
            hipotese = {
              tipo: "venda_nao_vinculada",
              confianca: "media",
              descricao: `Venda de ${naoVinculada.cliente || "?"} em ${naoVinculada.data} tem o mesmo SKU mas nao foi vinculada. Provavelmente este item — vincular resolve.`,
              venda_id: naoVinculada.id,
              cliente: naoVinculada.cliente || undefined,
              data_venda: naoVinculada.data || undefined,
            };
          }
        }

        // 4. Lote presumido (3+ iguais em 7 dias, sem venda atacado explicita
        // achada). Menos certeza que atacado_proximo, mas forte indicio.
        if (!hipotese && lotePresumido.has(e.id)) {
          const totalLote = sumicosPorSku.get(e.sku!)?.length || 0;
          hipotese = {
            tipo: "lote_presumido",
            confianca: "media",
            descricao: `${totalLote} unidades do mesmo SKU marcadas ESGOTADO em datas proximas — padrao classico de venda atacado em lote. Provavelmente pode ignorar.`,
          };
        }

        // 5. Nada achado — possivel problema real
        if (!hipotese) {
          hipotese = {
            tipo: "nenhuma",
            confianca: "baixa",
            descricao: "Nao achei venda relacionada. Pode ser venda fora do sistema, brinde nao registrado, perda, roubo ou uso interno.",
          };
        }

        // Severidade: se achou venda pra vincular, e media (acao simples).
        // Se atacado/brinde/lote, e baixa (legitimo). Se nao achou nada, alta.
        const severidadeHipotese = hipotese.tipo === "serial_match" || hipotese.tipo === "venda_nao_vinculada"
          ? "media"
          : hipotese.tipo === "atacado_proximo" || hipotese.tipo === "brinde_proximo" || hipotese.tipo === "lote_presumido"
          ? "baixa"
          : "alta";

        resultados.push({
          tipo: "ESGOTADO_SEM_VENDA",
          severidade: severidadeHipotese,
          descricao: "Item marcado como ESGOTADO mas sem venda vinculada",
          produto: e.produto,
          detalhes: {
            sku: e.sku || "sem SKU",
            cor: e.cor,
            serial: e.serial_no,
            imei: e.imei,
            custo: Number(e.custo_unitario || 0),
            desde: dataSumico || "?",
          },
          ids: { estoque_id: e.id, ...(hipotese.venda_id ? { venda_id: hipotese.venda_id } : {}) },
          hipotese,
        });
      }
    }

    // ── 3. Venda sem estoque vinculado (nao deduziu estoque) ────────
    // So sinaliza vendas com SKU populado (senao nao tem baseline pra validar)
    // e que deveriam ter vinculacao (modelo conhecido com serial).
    const { data: vendasSemEstoque } = await supabase
      .from("vendas")
      .select("id, produto, sku, cliente, data, preco_vendido, serial_no, imei")
      .is("estoque_id", null)
      .not("sku", "is", null)
      .gte("data", fromDate)
      .neq("status_pagamento", "CANCELADO")
      .neq("status_pagamento", "FORMULARIO_PREENCHIDO"); // formulario preenchido ainda nao foi processado

    if (vendasSemEstoque && vendasSemEstoque.length > 0) {
      const vendasAlvo = vendasSemEstoque.filter((v) => v.serial_no || v.imei);

      // Cruzamento heuristico pra auto-classificar vendas sem baixa:
      //   1. Serial/IMEI match → basta vincular (alta confianca)
      //   2. SKU EXATO bate com EM ESTOQUE → pode ser este
      //   3. SKU PREFIX — venda sem cor vs estoque com cor (ex:
      //      venda "IPHONE-17-256GB" vs estoque "IPHONE-17-256GB-PRETO")
      //   4. SKU bate com item ESGOTADO → dupla contagem, alertar
      //   5. SKU nao existe em LUGAR NENHUM no estoque → "legado nao cadastrado"
      //      (vendas antigas importadas sem vincular — baixa severidade, ignora)
      //
      // Busca: EXATO + PREFIX (estoque.sku LIKE venda.sku || '-%') pra cobrir
      // caso de venda com SKU parcial (sem cor).
      const skusVendas = [...new Set(vendasAlvo.map((v) => v.sku).filter(Boolean) as string[])];
      const seriaisVendas = [...new Set(vendasAlvo.map((v) => v.serial_no).filter(Boolean) as string[])];
      const imeisVendas = [...new Set(vendasAlvo.map((v) => v.imei).filter(Boolean) as string[])];

      let estoqueCandidato: Array<{
        id: string; produto: string; sku: string | null;
        serial_no: string | null; imei: string | null; status: string | null;
      }> = [];
      if (skusVendas.length > 0 || seriaisVendas.length > 0 || imeisVendas.length > 0) {
        // Monta OR conditions individuais pra suportar PREFIX (.like)
        const orParts: string[] = [];
        for (const s of skusVendas) {
          orParts.push(`sku.eq.${s}`);
          orParts.push(`sku.like.${s}-*`); // prefix match (venda sem cor vs estoque com)
        }
        for (const s of seriaisVendas) orParts.push(`serial_no.eq.${s}`);
        for (const i of imeisVendas) orParts.push(`imei.eq.${i}`);

        const { data } = await supabase
          .from("estoque")
          .select("id, produto, sku, serial_no, imei, status")
          .or(orParts.join(","));
        estoqueCandidato = data || [];
      }

      // Helper: SKU A e prefix-compativel com B quando sao iguais OU um comeca
      // com o outro + "-" (ex: "IPHONE-17-256GB" ⊂ "IPHONE-17-256GB-PRETO")
      const skuMatch = (a: string | null, b: string | null): boolean => {
        if (!a || !b) return false;
        if (a === b) return true;
        if (b.startsWith(a + "-")) return true;
        if (a.startsWith(b + "-")) return true;
        return false;
      };

      for (const v of vendasAlvo) {
        let hipotese: Hipotese | undefined;

        // 1. Serial/IMEI match — confianca alta
        const matchSerial = estoqueCandidato.find((e) => {
          if (v.serial_no && e.serial_no && v.serial_no.toUpperCase() === e.serial_no.toUpperCase()) return true;
          if (v.imei && e.imei && v.imei === e.imei) return true;
          return false;
        });
        if (matchSerial) {
          if (matchSerial.status === "EM ESTOQUE" || matchSerial.status === "PENDENTE") {
            hipotese = {
              tipo: "serial_match",
              confianca: "alta",
              descricao: `Item com mesmo ${v.serial_no ? "serial" : "IMEI"} existe no estoque (status: ${matchSerial.status}). Vincular da baixa automaticamente.`,
              estoque_id: matchSerial.id,
            };
          } else if (matchSerial.status === "ESGOTADO") {
            hipotese = {
              tipo: "serial_match",
              confianca: "alta",
              descricao: `Item com mesmo ${v.serial_no ? "serial" : "IMEI"} existe no estoque (ja ESGOTADO). Vincular fecha o circuito.`,
              estoque_id: matchSerial.id,
            };
          }
        }

        // 2. SKU match (EXATO ou PREFIX) — confianca media
        if (!hipotese && v.sku) {
          // Prefere EM ESTOQUE; se nao achar, considera ESGOTADO. Usa skuMatch
          // pra aceitar venda sem cor vs estoque com cor (e vice-versa).
          const emEstoque = estoqueCandidato.find((e) => skuMatch(v.sku, e.sku) && e.status === "EM ESTOQUE");
          const esgotado = estoqueCandidato.find((e) => skuMatch(v.sku, e.sku) && e.status === "ESGOTADO");
          if (emEstoque) {
            const skuIgual = emEstoque.sku === v.sku;
            hipotese = {
              tipo: "estoque_disponivel",
              confianca: skuIgual ? "media" : "media",
              descricao: skuIgual
                ? `Ha item com mesmo SKU no estoque (disponivel). Pode ser este — verifica serial/IMEI antes de vincular.`
                : `Ha item compativel no estoque (SKU ${emEstoque.sku} — venda tem SKU parcial ${v.sku}). Vincular se confirmar.`,
              estoque_id: emEstoque.id,
            };
          } else if (esgotado) {
            hipotese = {
              tipo: "estoque_esgotado",
              confianca: "baixa",
              descricao: `Ha item com mesmo SKU ja ESGOTADO (${esgotado.sku}). Pode ser dupla contagem (outra venda ja deu baixa) — investigar antes.`,
              estoque_id: esgotado.id,
            };
          }
        }

        // 3. Nada encontrado — e uma venda "legado" (provavelmente importada
        // sem cadastrar estoque na epoca). Marca com hipotese suave pra admin
        // ignorar em massa sem achar que e problema grave.
        if (!hipotese) {
          hipotese = {
            tipo: "nenhuma",
            confianca: "baixa",
            descricao: "Nao achei item no estoque (provavelmente venda antiga/importada sem cadastrar estoque). Pode ignorar se ja sabe que e legado.",
          };
        }

        const severidadeV = hipotese.tipo === "serial_match"
          ? "media"
          : hipotese.tipo === "estoque_disponivel"
          ? "media"
          : hipotese.tipo === "estoque_esgotado"
          ? "alta" // dupla contagem = perigoso
          : "baixa"; // "nenhuma" = provavel legado, baixa severidade

        resultados.push({
          tipo: "VENDA_SEM_ESTOQUE",
          severidade: severidadeV,
          descricao: "Venda registrada sem vincular item do estoque",
          produto: v.produto,
          detalhes: {
            sku: v.sku,
            cliente: v.cliente || "?",
            data: v.data || "?",
            serial: v.serial_no,
            imei: v.imei,
            preco: Number(v.preco_vendido || 0),
          },
          ids: { venda_id: v.id, ...(hipotese.estoque_id ? { estoque_id: hipotese.estoque_id } : {}) },
          hipotese,
        });
      }
    }

    // Resumo
    const resumo = {
      total: resultados.length,
      por_tipo: {
        SKU_DIVERGENTE_PERSISTIDO: resultados.filter((r) => r.tipo === "SKU_DIVERGENTE_PERSISTIDO").length,
        ESGOTADO_SEM_VENDA: resultados.filter((r) => r.tipo === "ESGOTADO_SEM_VENDA").length,
        VENDA_SEM_ESTOQUE: resultados.filter((r) => r.tipo === "VENDA_SEM_ESTOQUE").length,
      },
      por_severidade: {
        alta: resultados.filter((r) => r.severidade === "alta").length,
        media: resultados.filter((r) => r.severidade === "media").length,
        baixa: resultados.filter((r) => r.severidade === "baixa").length,
      },
      periodo: { from: fromDate, until: new Date().toISOString().slice(0, 10) },
    };

    return NextResponse.json({ ok: true, resumo, inconsistencias: resultados });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ─── POST: acoes de auto-correcao ───────────────────────────────────
// Ha 2 actions suportadas:
//
//   action=sync_from_estoque
//     Corrige venda.sku divergente copiando de estoque.sku
//     Body: { venda_ids: string[] }
//
//   action=vincular_venda_estoque
//     Vincula uma venda orfa a um item de estoque sumido (quando
//     hipotese automatica tem alta confianca — serial_match ou sku+data)
//     Body: { pares: [{ venda_id, estoque_id }, ...] }
//     Seta venda.estoque_id = estoque_id pra cada par. Resolve sumicos
//     que tem venda correspondente mas nunca foram vinculados.
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();

    if (body.action === "sync_from_estoque") {
      return await syncFromEstoque(body);
    }
    if (body.action === "vincular_venda_estoque") {
      return await vincularVendaEstoque(body);
    }
    return NextResponse.json({ error: "action invalida — use sync_from_estoque ou vincular_venda_estoque" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function syncFromEstoque(body: Record<string, unknown>) {
  const vendaIds = Array.isArray(body.venda_ids) ? body.venda_ids.filter((v: unknown) => typeof v === "string") as string[] : [];
  if (vendaIds.length === 0) {
    return NextResponse.json({ error: "venda_ids vazio" }, { status: 400 });
  }

  const { data: vendas } = await supabase
    .from("vendas")
    .select("id, sku, estoque_id")
    .in("id", vendaIds)
    .not("estoque_id", "is", null);
  if (!vendas || vendas.length === 0) {
    return NextResponse.json({ ok: true, atualizadas: 0, falhas: vendaIds.map((id: string) => ({ venda_id: id, motivo: "venda nao encontrada ou sem estoque_id" })) });
  }

  const estoqueIds = vendas.map((v) => v.estoque_id!).filter(Boolean) as string[];
  const { data: estoques } = await supabase
    .from("estoque")
    .select("id, sku")
    .in("id", estoqueIds);
  const skuByEstoqueId = new Map<string, string>();
  for (const e of estoques || []) {
    if (e.sku) skuByEstoqueId.set(e.id, e.sku);
  }

  let atualizadas = 0;
  const falhas: Array<{ venda_id: string; motivo: string }> = [];
  for (const v of vendas) {
    const estoqueSku = skuByEstoqueId.get(v.estoque_id!);
    if (!estoqueSku) {
      falhas.push({ venda_id: v.id, motivo: "estoque sem SKU" });
      continue;
    }
    if (estoqueSku === v.sku) continue;
    const { error: upErr } = await supabase
      .from("vendas")
      .update({ sku: estoqueSku })
      .eq("id", v.id);
    if (upErr) {
      falhas.push({ venda_id: v.id, motivo: upErr.message });
    } else {
      atualizadas++;
    }
  }

  return NextResponse.json({ ok: true, atualizadas, falhas });
}

async function vincularVendaEstoque(body: Record<string, unknown>) {
  const paresRaw = Array.isArray(body.pares) ? body.pares : [];
  const pares = paresRaw
    .filter((p): p is { venda_id: string; estoque_id: string } =>
      !!p && typeof p === "object" &&
      typeof (p as { venda_id?: unknown }).venda_id === "string" &&
      typeof (p as { estoque_id?: unknown }).estoque_id === "string",
    );
  if (pares.length === 0) {
    return NextResponse.json({ error: "pares vazio ou formato invalido" }, { status: 400 });
  }

  // Carrega vendas alvo — so aceita vincular vendas SEM estoque_id (evita
  // sobrescrever vinculos existentes por engano).
  const vendaIds = [...new Set(pares.map((p) => p.venda_id))];
  const { data: vendas } = await supabase
    .from("vendas")
    .select("id, estoque_id, sku")
    .in("id", vendaIds);
  const vendasMap = new Map((vendas || []).map((v) => [v.id, v]));

  // Carrega estoques alvo — copia SKU pra venda se venda nao tiver
  const estoqueIds = [...new Set(pares.map((p) => p.estoque_id))];
  const { data: estoques } = await supabase
    .from("estoque")
    .select("id, sku")
    .in("id", estoqueIds);
  const estoqueMap = new Map((estoques || []).map((e) => [e.id, e]));

  let vinculadas = 0;
  const falhas: Array<{ venda_id: string; motivo: string }> = [];
  for (const par of pares) {
    const v = vendasMap.get(par.venda_id);
    if (!v) {
      falhas.push({ venda_id: par.venda_id, motivo: "venda nao encontrada" });
      continue;
    }
    if (v.estoque_id) {
      falhas.push({ venda_id: par.venda_id, motivo: "venda ja tem estoque_id (nao sobrescrevo)" });
      continue;
    }
    const est = estoqueMap.get(par.estoque_id);
    const updates: Record<string, string | null> = { estoque_id: par.estoque_id };
    // Copia SKU do estoque se venda nao tiver (consistencia com POST /api/vendas)
    if (est?.sku && !v.sku) updates.sku = est.sku;

    const { error: upErr } = await supabase
      .from("vendas")
      .update(updates)
      .eq("id", par.venda_id);
    if (upErr) {
      falhas.push({ venda_id: par.venda_id, motivo: upErr.message });
    } else {
      vinculadas++;
    }
  }

  return NextResponse.json({ ok: true, vinculadas, falhas });
}
