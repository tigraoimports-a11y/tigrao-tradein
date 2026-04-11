// app/api/admin/termo-procedencia/route.ts — Gera PDF de Termo de Procedencia
import { NextRequest, NextResponse } from "next/server";
import { gerarTermoProcedenciaPDF, TermoProcedenciaData } from "@/lib/pdf-termo-procedencia";

export async function POST(req: NextRequest) {
  try {
    const body: TermoProcedenciaData = await req.json();

    // Validacao obrigatoria: serial e IMEI
    if (!body.clienteNome || !body.produtoModelo) {
      return NextResponse.json(
        { error: "Campos obrigatorios: clienteNome, produtoModelo" },
        { status: 400 }
      );
    }
    if (!body.serialNo || !body.imei) {
      return NextResponse.json(
        { error: "Numero de Serie e IMEI sao obrigatorios para gerar o Termo de Procedencia" },
        { status: 400 }
      );
    }

    const pdfBuffer = await gerarTermoProcedenciaPDF(body);

    const filename = `termo_procedencia_${body.clienteNome.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Erro ao gerar Termo de Procedencia PDF:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
