// lib/pdf-termo-procedencia.ts — Gerador do Termo de Declaração de Propriedade e Procedência
import PDFDocument from "pdfkit";

export interface AparelhoTermo {
  modelo: string;
  capacidade?: string;
  cor?: string;
  imei?: string;
  serial?: string;
  condicao?: string; // ex: "Bateria 87%, Grade A, Com Caixa"
}

export interface TermoProcedenciaData {
  clienteNome: string;
  clienteCPF: string;
  aparelhos: AparelhoTermo[];
  cidade?: string; // default "Rio de Janeiro"
  data?: string;   // DD/MM/AAAA
}

export async function gerarTermoProcedenciaPDF(dados: TermoProcedenciaData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
    });

    const chunks: Uint8Array[] = [];
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const contentW = pageW - 120; // 60px margin each side
    const leftMargin = 60;

    // ── HEADER ──────────────────────────────────────────────
    // Logo text (centralizado, bold)
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#1A1A2E");
    doc.text("TERMO DE DECLARAÇÃO DE PROPRIEDADE E PROCEDÊNCIA DE APARELHO", leftMargin, 60, {
      width: contentW,
      align: "center",
    });

    doc.fontSize(10).font("Helvetica-Bold").fillColor("#1A1A2E");
    doc.text("TIGRÃO IMPORTS LTDA – CNPJ: 50.139.554/0001-42", leftMargin, doc.y + 8, {
      width: contentW,
      align: "center",
    });

    let y = doc.y + 30;

    // ── TEXTO JURÍDICO ──────────────────────────────────────
    const fontSize = 11;
    const lineGap = 6;
    doc.fontSize(fontSize).font("Helvetica").fillColor("#333333");

    // Parágrafo 1: Declaração
    const nome = dados.clienteNome || "___________________________";
    const cpf = dados.clienteCPF || "_______________";

    doc.text(
      `        Conforme assegura o artigo 82 da lei nº10.406 de 2002, que versa sobre bens imóveis, eu, ${nome}, CPF nº ${cpf}, detentor do(s) aparelho(s) abaixo descrito(s):`,
      leftMargin, y,
      { width: contentW, lineGap, align: "justify" }
    );

    y = doc.y + 15;

    // ── APARELHOS ───────────────────────────────────────────
    for (let i = 0; i < dados.aparelhos.length; i++) {
      const ap = dados.aparelhos[i];
      const num = dados.aparelhos.length > 1 ? `Aparelho ${i + 1}: ` : "";

      // Box com borda
      const boxY = y;
      doc.save();
      doc.roundedRect(leftMargin, boxY, contentW, 0, 4); // placeholder, will resize

      doc.fontSize(10).font("Helvetica-Bold").fillColor("#1A1A2E");
      doc.text(`${num}${ap.modelo || "—"}`, leftMargin + 12, y + 8, { width: contentW - 24 });
      y = doc.y + 4;

      doc.fontSize(9.5).font("Helvetica").fillColor("#555555");
      const detalhes: string[] = [];
      if (ap.capacidade) detalhes.push(`Capacidade: ${ap.capacidade}`);
      if (ap.cor) detalhes.push(`Cor: ${ap.cor}`);
      if (ap.imei) detalhes.push(`IMEI: ${ap.imei}`);
      if (ap.serial) detalhes.push(`Nº de Série: ${ap.serial}`);
      if (ap.condicao) detalhes.push(`Condições: ${ap.condicao}`);

      if (detalhes.length > 0) {
        doc.text(detalhes.join("   |   "), leftMargin + 12, y, { width: contentW - 24 });
        y = doc.y + 4;
      }

      const boxH = y - boxY + 8;
      doc.restore();
      doc.lineWidth(0.5).strokeColor("#D2D2D7").roundedRect(leftMargin, boxY, contentW, boxH, 4).stroke();
      y = boxY + boxH + 10;
    }

    y += 5;

    // ── DECLARAÇÃO ──────────────────────────────────────────
    doc.fontSize(fontSize).font("Helvetica").fillColor("#333333");
    doc.text(
      "declaro, ser o proprietário e detentor da posse legítima e pacífica do(s) aparelho(s) ora mencionado(s), e afirmo que não haver qualquer embaraço civil ou criminal.",
      leftMargin, y,
      { width: contentW, lineGap, align: "justify" }
    );
    y = doc.y + 15;

    // Parágrafo 2: Anuência
    doc.text(
      "        Cumpre ressaltar que a empresa Tigrão Imports LTDA, possui minha anuência para verificar o IMEI em bases públicas e privadas, consultar status de bloqueio, perda, roubo ou restrições, e compartilhar este termo com autoridades competentes, se necessário.",
      leftMargin, y,
      { width: contentW, lineGap, align: "justify" }
    );
    y = doc.y + 15;

    // Parágrafo 3: Isenção
    doc.text(
      "        Isento de Responsabilidade a Tigrão Imports LTDA, e reconheço que a empresa atua de boa-fé e não poderá ser responsabilizada por irregularidades anteriores à entrega do aparelho, sendo minha inteira responsabilidade qualquer consequência legal, e autorizo o trânsito do aparelho em território nacional ou fora dele.",
      leftMargin, y,
      { width: contentW, lineGap, align: "justify" }
    );
    y = doc.y + 15;

    // Parágrafo 4: Penalidades
    doc.text(
      "        Atesto a veracidade das informações prestadas e estou ciente das penalidades previstas nos arts. 297 a 299 e art. 180 do Código Penal.",
      leftMargin, y,
      { width: contentW, lineGap, align: "justify" }
    );
    y = doc.y + 30;

    // ── DATA E CIDADE ───────────────────────────────────────
    const cidade = dados.cidade || "Rio de Janeiro";
    const dataStr = dados.data || (() => {
      const d = new Date();
      const dia = d.getDate();
      const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
      return `${dia} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
    })();

    doc.fontSize(fontSize).font("Helvetica").fillColor("#333333");
    doc.text(`${cidade}, ${dataStr}.`, leftMargin, y, { width: contentW });
    y = doc.y + 50;

    // ── ASSINATURAS ─────────────────────────────────────────
    const sigW = contentW * 0.45;
    const sigX1 = leftMargin + (contentW - sigW) / 2;

    // Declarante
    doc.lineWidth(0.5).strokeColor("#333333")
      .moveTo(sigX1, y).lineTo(sigX1 + sigW, y).stroke();
    doc.fontSize(9).font("Helvetica").fillColor("#555555");
    doc.text("Assinatura do Declarante", sigX1, y + 5, { width: sigW, align: "center" });

    y = doc.y + 40;

    // Representante
    doc.lineWidth(0.5).strokeColor("#333333")
      .moveTo(sigX1, y).lineTo(sigX1 + sigW, y).stroke();
    doc.fontSize(9).font("Helvetica").fillColor("#555555");
    doc.text("Assinatura do Representante da Tigrão Imports LTDA", sigX1, y + 5, { width: sigW, align: "center" });

    doc.end();
  });
}
