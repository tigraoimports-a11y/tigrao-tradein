import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { rateLimitPublic } from "@/lib/rate-limit";

// POST — insert funnel/tracking event
// Endpoint propositalmente chamado /api/funnel (e nao /api/analytics) porque
// adblockers (uBlock, Brave, etc) bloqueiam URLs com "analytics" e isso fazia
// 99% dos eventos serem perdidos silenciosamente em produ
export async function POST(req: NextRequest) {
  const limited = rateLimitPublic(req);
  if (limited) return limited;

  try {
    const body = await req.json();
    const { event, step, question, sessionId, deviceType, utm_source, utm_medium, utm_campaign } = body;

    if (!event || !sessionId) {
      return NextResponse.json({ error: "event and sessionId required" }, { status: 400 });
    }

    // Trunca strings pra evitar payloads gigantes (proteca DOS)
    const trunc = (v: unknown, max = 200) =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

    const { error } = await supabase.from("tradein_analytics").insert({
      session_id: sessionId,
      event,
      step: step ?? null,
      question: question ?? null,
      device_type: trunc(deviceType, 32),
      utm_source: trunc(utm_source),
      utm_medium: trunc(utm_medium),
      utm_campaign: trunc(utm_campaign),
    });

    if (error) {
      console.error("Funnel insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Funnel POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// GET — aggregated funnel data for admin panel
//
// Query params:
//   range: "7d" | "30d" | "all"
//   utm_source: filtra eventos por origem (ex: "meta", "instagram")
//   device_type: filtra por tipo de dispositivo (iphone | ipad | macbook | watch)
export async function GET(req: NextRequest) {
  try {
    const pw = req.headers.get("x-admin-password") || "";
    const adminPw = process.env.ADMIN_PASSWORD || "";
    if (!adminPw) {
      return NextResponse.json({ error: "ADMIN_PASSWORD not configured" }, { status: 500 });
    }

    let authorized = pw === adminPw;
    if (!authorized) {
      const { data: userRow } = await supabase
        .from("admin_users")
        .select("id")
        .eq("api_token", pw)
        .single();
      if (userRow) authorized = true;
    }

    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const range = req.nextUrl.searchParams.get("range") || "7d";
    const filterUtmSource = req.nextUrl.searchParams.get("utm_source") || "";
    const filterDeviceType = req.nextUrl.searchParams.get("device_type") || "";

    let fromDate: string | null = null;
    const now = new Date();
    if (range === "7d") {
      fromDate = new Date(now.getTime() - 7 * 86400000).toISOString();
    } else if (range === "30d") {
      fromDate = new Date(now.getTime() - 30 * 86400000).toISOString();
    }

    let query = supabase
      .from("tradein_analytics")
      .select("*")
      .order("created_at", { ascending: true });

    if (fromDate) {
      query = query.gte("created_at", fromDate);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error("Funnel GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const allRows = events || [];

    // Pra filtrar por UTM/device, precisa propagar o valor pra TODOS eventos
    // de cada sessao (so o site_view tem UTM gravado, os step_view seguintes
    // podem nao ter se foi capturado depois). Construimos um mapa session →
    // metadados antes de aplicar filtros.
    type SessionMeta = {
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
      device_type?: string;
    };
    const sessionMeta: Record<string, SessionMeta> = {};
    for (const row of allRows) {
      const sid = row.session_id;
      if (!sessionMeta[sid]) sessionMeta[sid] = {};
      const meta = sessionMeta[sid];
      // Strategy: prefer o primeiro valor nao-vazio (= UTM/device da entrada)
      if (row.utm_source && !meta.utm_source) meta.utm_source = row.utm_source;
      if (row.utm_medium && !meta.utm_medium) meta.utm_medium = row.utm_medium;
      if (row.utm_campaign && !meta.utm_campaign) meta.utm_campaign = row.utm_campaign;
      if (row.device_type && !meta.device_type) meta.device_type = row.device_type;
    }

    // Aplica filtros opcionais. A linha passa se a SESSAO inteira bate.
    let rows = allRows;
    if (filterUtmSource) {
      rows = rows.filter((r) => sessionMeta[r.session_id]?.utm_source === filterUtmSource);
    }
    if (filterDeviceType) {
      rows = rows.filter((r) => sessionMeta[r.session_id]?.device_type === filterDeviceType);
    }

    // ============================================================
    // AGREGACAO PRINCIPAL (igual ao que ja tinha — agora respeita filtros)
    // ============================================================
    const sessions = new Set<string>();
    const siteViewSessions = new Set<string>();
    const startedSessions = new Set<string>();
    const stepViews: Record<number, Set<string>> = {};
    const stepCompletes: Record<number, Set<string>> = {};
    const questionAnswers: Record<string, Set<string>> = {};
    const whatsappSessions = new Set<string>();
    const exitSessions = new Set<string>();
    const cotarOutroSessions = new Set<string>();
    const compraViewSessions = new Set<string>();
    const compraSubmitSessions = new Set<string>();

    for (const row of rows) {
      sessions.add(row.session_id);

      if (row.event === "site_view") siteViewSessions.add(row.session_id);
      if (row.event === "question_answer") startedSessions.add(row.session_id);

      if (row.event === "step_view" && row.step != null) {
        if (!stepViews[row.step]) stepViews[row.step] = new Set();
        stepViews[row.step].add(row.session_id);
      }

      if (row.event === "step_complete" && row.step != null) {
        if (!stepCompletes[row.step]) stepCompletes[row.step] = new Set();
        stepCompletes[row.step].add(row.session_id);
      }

      if (row.event === "question_answer" && row.question) {
        const key = `${row.step}:${row.question}`;
        if (!questionAnswers[key]) questionAnswers[key] = new Set();
        questionAnswers[key].add(row.session_id);
      }

      if (row.event === "quote_whatsapp") whatsappSessions.add(row.session_id);
      if (row.event === "quote_exit") exitSessions.add(row.session_id);
      if (row.event === "quote_cotar_outro") cotarOutroSessions.add(row.session_id);
      if (row.event === "compra_view") compraViewSessions.add(row.session_id);
      if (row.event === "compra_submit") compraSubmitSessions.add(row.session_id);
    }

    const visits = siteViewSessions.size > 0 ? siteViewSessions.size : sessions.size;

    const funnel = [1, 2, 3, 4].map((step) => {
      const views = stepViews[step]?.size || 0;
      const completes = stepCompletes[step]?.size || 0;
      return {
        step,
        views,
        completes,
        droppedHere: Math.max(views - completes, 0),
      };
    });

    const compraView = compraViewSessions.size;
    const compraSubmit = compraSubmitSessions.size;
    funnel.push({
      step: 5,
      views: compraView,
      completes: compraSubmit,
      droppedHere: Math.max(compraView - compraSubmit, 0),
    });

    const questionBreakdown = Object.entries(questionAnswers)
      .map(([key, set]) => {
        const [stepStr, question] = key.split(":");
        return { step: parseInt(stepStr), question, sessions: set.size };
      })
      .sort((a, b) => a.step - b.step || b.sessions - a.sessions);

    const dailySessions: Record<string, Set<string>> = {};
    for (const row of rows) {
      const day = row.created_at.slice(0, 10);
      if (!dailySessions[day]) dailySessions[day] = new Set();
      dailySessions[day].add(row.session_id);
    }
    const daily = Object.entries(dailySessions)
      .map(([date, set]) => ({ date, sessions: set.size }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ============================================================
    // BREAKDOWN POR DIMENSAO (UTM source + device type)
    // ============================================================
    // Pra cada UTM source / device type, mostra o funil completo:
    //   - sessions: quantas sessoes vieram desse canal
    //   - started: quantas iniciaram simulacao
    //   - whatsapp: quantas fecharam pedido
    //   - submit: quantas submeteram /compra
    //   - conversion: % final (submit/sessions)
    type DimRow = {
      key: string;          // valor do UTM/device (ou "(direto)" se NULL)
      sessions: number;
      started: number;
      whatsapp: number;
      submit: number;
      conversion: number;   // 0-100
    };

    function buildDim(getValue: (sid: string) => string | undefined): DimRow[] {
      const map: Record<string, { sessions: Set<string>; started: Set<string>; whatsapp: Set<string>; submit: Set<string> }> = {};

      for (const sid of sessions) {
        const key = getValue(sid) || "(direto/sem origem)";
        if (!map[key]) {
          map[key] = { sessions: new Set(), started: new Set(), whatsapp: new Set(), submit: new Set() };
        }
        map[key].sessions.add(sid);
        if (startedSessions.has(sid)) map[key].started.add(sid);
        if (whatsappSessions.has(sid)) map[key].whatsapp.add(sid);
        if (compraSubmitSessions.has(sid)) map[key].submit.add(sid);
      }

      return Object.entries(map)
        .map(([key, v]) => {
          const sCount = v.sessions.size;
          return {
            key,
            sessions: sCount,
            started: v.started.size,
            whatsapp: v.whatsapp.size,
            submit: v.submit.size,
            conversion: sCount > 0 ? Math.round((v.submit.size / sCount) * 1000) / 10 : 0,
          };
        })
        .sort((a, b) => b.sessions - a.sessions);
    }

    const byUtmSource = buildDim((sid) => sessionMeta[sid]?.utm_source);
    const byDeviceType = buildDim((sid) => sessionMeta[sid]?.device_type);

    // ============================================================
    // SESSOES INDIVIDUAIS (ultimas 50) — pra debug fino
    // ============================================================
    // Por sessao calcula: quando entrou, qual ultimo step viu, qual ultima
    // pergunta respondeu, qual UTM/device, e se completou (submit /compra ou
    // pelo menos clicou WhatsApp).
    type SessionDetail = {
      sessionId: string;
      startedAt: string;
      lastEventAt: string;
      lastStep: number | null;
      lastQuestion: string | null;
      utmSource: string | null;
      deviceType: string | null;
      completedWhatsapp: boolean;
      completedSubmit: boolean;
      eventCount: number;
    };

    const sessionDetails: Record<string, SessionDetail> = {};
    for (const row of rows) {
      const sid = row.session_id;
      if (!sessionDetails[sid]) {
        sessionDetails[sid] = {
          sessionId: sid,
          startedAt: row.created_at,
          lastEventAt: row.created_at,
          lastStep: row.step ?? null,
          lastQuestion: row.question ?? null,
          utmSource: sessionMeta[sid]?.utm_source ?? null,
          deviceType: sessionMeta[sid]?.device_type ?? null,
          completedWhatsapp: false,
          completedSubmit: false,
          eventCount: 0,
        };
      }
      const det = sessionDetails[sid];
      det.eventCount++;
      // como rows ja vem sorted ASC por created_at, o ultimo update vence
      det.lastEventAt = row.created_at;
      if (row.step != null) det.lastStep = row.step;
      if (row.question) det.lastQuestion = row.question;
      if (row.event === "quote_whatsapp") det.completedWhatsapp = true;
      if (row.event === "compra_submit") det.completedSubmit = true;
    }

    const sessionsList = Object.values(sessionDetails)
      .sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt))
      .slice(0, 50);

    return NextResponse.json({
      visits,
      startedCount: startedSessions.size,
      totalSessions: sessions.size,
      whatsappCount: whatsappSessions.size,
      exitCount: exitSessions.size,
      cotarOutroCount: cotarOutroSessions.size,
      compraViewCount: compraView,
      compraSubmitCount: compraSubmit,
      funnel,
      questionBreakdown,
      daily,
      conversionRate: visits > 0
        ? ((whatsappSessions.size / visits) * 100).toFixed(1)
        : "0",
      conversionRateFinal: visits > 0
        ? ((compraSubmit / visits) * 100).toFixed(1)
        : "0",
      // Novo (#20): drop-off por canal e por dispositivo + sessoes individuais
      byUtmSource,
      byDeviceType,
      sessionsList,
      // Filtros aplicados (echo) pra UI mostrar "Filtrando por X"
      filters: {
        utm_source: filterUtmSource || null,
        device_type: filterDeviceType || null,
      },
    });
  } catch (err) {
    console.error("Funnel GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
