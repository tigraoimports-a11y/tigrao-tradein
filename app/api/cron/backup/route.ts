import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import nodemailer from "nodemailer";

const TABLES = [
  "vendas",
  "gastos",
  "estoque",
  "saldos_bancarios",
  "simulacoes",
  "clientes",
  "entregas",
  "activity_log",
] as const;

function authCron(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return secret === process.env.CRON_SECRET;
}

export async function GET(req: NextRequest) {
  if (!authCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Export all tables
    const backup: Record<string, unknown[]> = {};
    const counts: { table: string; count: number }[] = [];

    for (const table of TABLES) {
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        console.error(`Backup error on table ${table}:`, error.message);
        backup[table] = [];
        counts.push({ table, count: 0 });
      } else {
        backup[table] = data ?? [];
        counts.push({ table, count: data?.length ?? 0 });
      }
    }

    // Format date DD/MM/YYYY in BRT
    const now = new Date();
    const brt = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const dd = String(brt.getDate()).padStart(2, "0");
    const mm = String(brt.getMonth() + 1).padStart(2, "0");
    const yyyy = brt.getFullYear();
    const dateStr = `${dd}/${mm}/${yyyy}`;

    // Build email body
    const totalRecords = counts.reduce((s, c) => s + c.count, 0);
    const tableRows = counts
      .map((c) => `<tr><td style="padding:4px 12px;border:1px solid #ddd;">${c.table}</td><td style="padding:4px 12px;border:1px solid #ddd;text-align:right;">${c.count.toLocaleString("pt-BR")}</td></tr>`)
      .join("");

    const html = `
      <h2>Backup TigraoImports - ${dateStr}</h2>
      <p>Total de registros: <strong>${totalRecords.toLocaleString("pt-BR")}</strong></p>
      <table style="border-collapse:collapse;margin-top:8px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:4px 12px;border:1px solid #ddd;text-align:left;">Tabela</th>
            <th style="padding:4px 12px;border:1px solid #ddd;text-align:right;">Registros</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p style="margin-top:16px;color:#888;font-size:12px;">Arquivo JSON anexo com todos os dados.</p>
    `;

    // Create JSON buffer
    const jsonString = JSON.stringify(backup, null, 2);
    const jsonBuffer = Buffer.from(jsonString, "utf-8");

    // Send email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: `"TigraoImports Bot" <${process.env.EMAIL_USER}>`,
      to: process.env.REPORT_EMAIL,
      subject: `\uD83D\uDDC4\uFE0F Backup TigraoImports \u2014 ${dateStr}`,
      html,
      attachments: [
        {
          filename: `backup-tigrao-${yyyy}-${mm}-${dd}.json`,
          content: jsonBuffer,
          contentType: "application/json",
        },
      ],
    });

    return NextResponse.json({
      ok: true,
      date: dateStr,
      tables: counts,
      totalRecords,
    });
  } catch (err) {
    console.error("Backup cron error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
