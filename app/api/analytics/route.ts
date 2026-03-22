import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST — insert analytics event
export async function POST(req: NextRequest) {
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
      console.error("Analytics insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Analytics POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// GET — aggregated analytics for admin panel
export async function GET(req: NextRequest) {
  try {
    const pw = req.headers.get("x-admin-password") || "";
    // Auth check — same pattern as other admin endpoints
    const adminPw = process.env.ADMIN_PASSWORD || "";
    if (!adminPw) {
      return NextResponse.json({ error: "ADMIN_PASSWORD not configured" }, { status: 500 });
    }

    // Also accept Supabase service role auth (for users authenticated via /api/auth)
    let authorized = pw === adminPw;
    if (!authorized) {
      // Try to validate via admin_users table (same as other admin pages)
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
    // "all" => no date filter

    // Fetch all events in range
    let query = supabase
      .from("tradein_analytics")
      .select("*")
      .order("created_at", { ascending: true });

    if (fromDate) {
      query = query.gte("created_at", fromDate);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error("Analytics GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = events || [];

    // Aggregate: sessions per step
    const sessions = new Set<string>();
    const stepViews: Record<number, Set<string>> = {};
    const stepCompletes: Record<number, Set<string>> = {};
    const questionAnswers: Record<string, Set<string>> = {};
    let whatsappCount = 0;
    let exitCount = 0;
    let cotarOutroCount = 0;

    for (const row of rows) {
      sessions.add(row.session_id);

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

      if (row.event === "quote_whatsapp") whatsappCount++;
      if (row.event === "quote_exit") exitCount++;
      if (row.event === "quote_cotar_outro") cotarOutroCount++;
    }

    // Build funnel
    const funnel = [1, 2, 3, 4].map((step) => ({
      step,
      views: stepViews[step]?.size || 0,
      completes: stepCompletes[step]?.size || 0,
    }));

    // Build question breakdown for step 1 (most interesting for drop-off)
    const questionBreakdown = Object.entries(questionAnswers)
      .map(([key, set]) => {
        const [stepStr, question] = key.split(":");
        return { step: parseInt(stepStr), question, sessions: set.size };
      })
      .sort((a, b) => a.step - b.step || b.sessions - a.sessions);

    // Daily sessions for chart
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
      totalSessions: sessions.size,
      whatsappCount,
      exitCount,
      cotarOutroCount,
      funnel,
      questionBreakdown,
      daily,
      conversionRate: sessions.size > 0
        ? ((whatsappCount / sessions.size) * 100).toFixed(1)
        : "0",
    });
  } catch (err) {
    console.error("Analytics GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
