// app/api/admin/contrato/route.ts — Gera PDF de contrato de trade-in
import { NextRequest, NextResponse } from "next/server";
import { gerarContratoPDF, ContratoData } from "@/lib/pdf-contrato";

export async function POST(req: NextRequest) {
  try {
    const body: ContratoData = await req.json();

    // Validação mínima
    if (!body.clienteNome || !body.clienteTelefone || !body.aparelhoModelo || !body.novoModelo) {
      return NextResponse.json(
        { error: "Campos obrigatórios: clienteNome, clienteTelefone, aparelhoModelo, novoModelo" },
        { status: 400 }
      );
    }

    const pdfBuffer = await gerarContratoPDF(body);

    const filename = `contrato_tradein_${body.clienteNome.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Erro ao gerar contrato PDF:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
