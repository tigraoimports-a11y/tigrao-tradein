import { NextRequest, NextResponse } from "next/server";
import { gerarContratoEncomendaPDF, ContratoEncomendaData } from "@/lib/pdf-encomenda";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const dados: ContratoEncomendaData = await req.json();

    if (!dados.clienteNome || !dados.clienteCPF || !dados.produtoNovo || !dados.valorNovo) {
      return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    const pdfBuffer = await gerarContratoEncomendaPDF(dados);

    const nomeArquivo = `CONTRATO ENCOMENDA-${dados.clienteNome.split(" ").slice(0, 2).join(" ")}- ${dados.produtoNovo} ${dados.storageNovo} ${dados.corNova}.pdf`;

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`,
      },
    });
  } catch (err) {
    console.error("Erro ao gerar contrato:", err);
    return NextResponse.json({ error: "Erro ao gerar PDF" }, { status: 500 });
  }
}
