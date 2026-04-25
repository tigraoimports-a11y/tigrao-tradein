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
    const { event, step, question, sessionId } = body;

    if (!event || !sessionId) {
      return NextResponse.json({ error: "event and sessionId required" }, { status: 400 });
    }

    const { error } = await supabase.from("tradein_analytics").insert({
      session_id: sessionId,
      event,
      step: step ?? null,
      question: question ?? null,
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

    const rows = events || [];

    const sessions = new Set<string>();
    const siteViewSessions = new Set<string>();
    const startedSessions = new Set<string>();
    const stepViews: Record<number, Set<string>> = {};
    const stepCompletes: Record<number, Set<string>> = {};
    const questionAnswers: Record<string, Set<string>> = {};
    const whatsappSessions = new Set<string>();
    const exitSessions = new Set<string>();
    const cotarOutroSessions = new Set<string>();
    // Etapa 5 do funil — formulario /compra (preenchimento de dados pessoais).
    // Mede drop-off depois do orcamento aceito → quem chega no formulario e
    // quem completa de fato.
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

    // Visitas: prefer site_view, mas se ainda nao tem (deploy recente),
    // usa o total de sessoes como aproxima
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

    // Etapa 5: formulario /compra. Diferente das etapas 1-4 (que sao
    // sub-passos do simulador), esta e uma pagina nova com seu proprio
    // pageview e submit. View = chegou no /compra, complete = submeteu.
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
      // Conversao final ate submit do /compra (etapa 5)
      conversionRateFinal: visits > 0
        ? ((compraSubmit / visits) * 100).toFixed(1)
        : "0",
    });
  } catch (err) {
    console.error("Funnel GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
