// lib/pdf-termo-procedencia.ts — Gerador de Termo de Procedencia em PDF (PDFKit)
import PDFDocument from "pdfkit";

// ============================================
// Types
// ============================================

export interface TermoProcedenciaData {
  clienteNome: string;
  clienteCPF?: string;
  clienteTelefone?: string;
  produtoModelo: string;
  produtoStorage?: string;
  produtoCor?: string;
  serialNo: string;
  imei: string;
  bateria?: string;
  grade?: string;
  valorAvaliado?: number;
  data: string; // DD/MM/AAAA
}

// ============================================
// Colors
// ============================================

const C = {
  headerBg: "#1A1A2E",
  headerText: "#FFFFFF",
  accent: "#E8740E",
  text: "#333333",
  textLight: "#666666",
  border: "#D2D2D7",
  sectionBg: "#F5F5F7",
};

// ============================================
// PDF Generation
// ============================================

export async function gerarTermoProcedenciaPDF(dados: TermoProcedenciaData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: 50, right: 50 },
    });

    const chunks: Uint8Array[] = [];
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const contentW = pageW - 100;
    let y = 40;

    // ==========================================
    // HEADER
    // ==========================================
    doc.rect(0, 0, pageW, 80).fill(C.headerBg);

    doc.fontSize(22).font("Helvetica-Bold").fillColor(C.headerText);
    doc.text("TIGRAO IMPORTS", 50, 18, { width: contentW, align: "center" });

    doc.fontSize(12).font("Helvetica").fillColor(C.accent);
    doc.text("TERMO DE PROCEDENCIA", 50, 46, { width: contentW, align: "center" });

    y = 95;

    // Data
    doc.fontSize(9).font("Helvetica").fillColor(C.textLight);
    doc.text(`Data: ${dados.data}`, 50, y, { width: contentW, align: "right" });
    y += 20;

    // ==========================================
    // SECTION 1: Dados do Cliente
    // ==========================================
    y = drawSectionHeader(doc, "1. DADOS DO CLIENTE", y, contentW);
    y = drawField(doc, "Nome", dados.clienteNome, y, contentW);
    if (dados.clienteCPF) y = drawField(doc, "CPF", dados.clienteCPF, y, contentW);
    if (dados.clienteTelefone) y = drawField(doc, "Telefone", dados.clienteTelefone, y, contentW);
    y += 10;

    // ==========================================
    // SECTION 2: Dados do Aparelho
    // ==========================================
    y = drawSectionHeader(doc, "2. DADOS DO APARELHO", y, contentW);
    y = drawField(doc, "Modelo", dados.produtoModelo, y, contentW);
    if (dados.produtoStorage) y = drawField(doc, "Armazenamento", dados.produtoStorage, y, contentW);
    if (dados.produtoCor) y = drawField(doc, "Cor", dados.produtoCor, y, contentW);
    y = drawField(doc, "Numero de Serie", dados.serialNo, y, contentW);
    y = drawField(doc, "IMEI", dados.imei, y, contentW);
    if (dados.bateria) y = drawField(doc, "Bateria", dados.bateria, y, contentW);
    if (dados.grade) y = drawField(doc, "Grade", dados.grade, y, contentW);
    if (dados.valorAvaliado) y = drawField(doc, "Valor Avaliado", `R$ ${dados.valorAvaliado.toLocaleString("pt-BR")}`, y, contentW);
    y += 10;

    // ==========================================
    // SECTION 3: Declaracao de Procedencia
    // ==========================================
    y = drawSectionHeader(doc, "3. DECLARACAO DE PROCEDENCIA", y, contentW);

    const declaracao = [
      `Eu, ${dados.clienteNome}${dados.clienteCPF ? `, portador(a) do CPF ${dados.clienteCPF}` : ""}, declaro para os devidos fins que:`,
      "",
      "1. Sou o(a) legitimo(a) proprietario(a) do aparelho acima descrito.",
      "",
      "2. O aparelho foi adquirido de forma licita e nao possui qualquer restricao judicial, policial ou administrativa.",
      "",
      "3. O aparelho nao possui bloqueio de operadora, bloqueio por IMEI, ou quaisquer pendencias que impossibilitem seu uso ou comercializacao.",
      "",
      "4. Autorizo a empresa TigraoImports a comercializar o referido aparelho apos a conclusao da transacao de trade-in.",
      "",
      "5. Declaro estar ciente de que qualquer informacao falsa prestada neste termo podera acarretar responsabilidade civil e criminal, nos termos da legislacao vigente.",
    ];

    doc.fontSize(9).font("Helvetica").fillColor(C.text);
    for (const linha of declaracao) {
      if (!linha) { y += 4; continue; }
      const h = doc.heightOfString(linha, { width: contentW - 10 });
      y = checkPageBreak(doc, y, h + 6);
      doc.text(linha, 55, y, { width: contentW - 10 });
      y += h + 2;
    }

    y += 20;

    // ==========================================
    // SECTION 4: Assinaturas
    // ==========================================
    y = checkPageBreak(doc, y, 120);
    y = drawSectionHeader(doc, "4. ASSINATURAS", y, contentW);
    y += 15;

    const sigWidth = (contentW - 40) / 2;

    // Cliente signature line
    doc.moveTo(50, y + 40).lineTo(50 + sigWidth, y + 40).strokeColor(C.text).lineWidth(0.8).stroke();
    doc.fontSize(9).font("Helvetica").fillColor(C.text);
    doc.text("Cliente", 50, y + 45, { width: sigWidth, align: "center" });
    doc.fontSize(8).fillColor(C.textLight);
    doc.text(dados.clienteNome, 50, y + 57, { width: sigWidth, align: "center" });
    if (dados.clienteCPF) {
      doc.text(`CPF: ${dados.clienteCPF}`, 50, y + 68, { width: sigWidth, align: "center" });
    }

    // TigraoImports signature line
    const sigX2 = 50 + sigWidth + 40;
    doc.moveTo(sigX2, y + 40).lineTo(sigX2 + sigWidth, y + 40).strokeColor(C.text).lineWidth(0.8).stroke();
    doc.fontSize(9).font("Helvetica").fillColor(C.text);
    doc.text("TigraoImports", sigX2, y + 45, { width: sigWidth, align: "center" });

    y += 85;

    // ==========================================
    // FOOTER
    // ==========================================
    const now = new Date();
    const hora = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

    doc.fontSize(8).font("Helvetica").fillColor(C.textLight);
    doc.text(
      `${dados.data} as ${hora} — TigraoImports — Barra da Tijuca, RJ`,
      50,
      doc.page.height - 40,
      { width: contentW, align: "center" }
    );

    doc.end();
  });
}

// ============================================
// Drawing Helpers
// ============================================

function drawSectionHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  y: number,
  contentW: number
): number {
  doc.fontSize(11).font("Helvetica-Bold").fillColor(C.accent);
  doc.text(title, 50, y, { width: contentW });
  y += 16;
  doc.moveTo(50, y).lineTo(50 + contentW, y).strokeColor(C.accent).lineWidth(1).stroke();
  y += 8;
  return y;
}

function drawField(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  y: number,
  contentW: number,
  valueColor?: string
): number {
  doc.fontSize(9).font("Helvetica-Bold").fillColor(C.text);
  doc.text(`${label}:`, 50, y, { width: 130 });
  doc.fontSize(9).font("Helvetica").fillColor(valueColor || C.textLight);
  doc.text(value, 180, y, { width: contentW - 130 });
  return y + 16;
}

function checkPageBreak(
  doc: PDFKit.PDFDocument,
  y: number,
  neededHeight: number
): number {
  if (y + neededHeight > doc.page.height - 60) {
    doc.addPage();
    return 40;
  }
  return y;
}
