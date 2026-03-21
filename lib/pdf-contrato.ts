// lib/pdf-contrato.ts — Gerador de Contrato de Trade-In em PDF (PDFKit)
import PDFDocument from "pdfkit";

// ============================================
// Types
// ============================================

export interface ContratoData {
  // Cliente
  clienteNome: string;
  clienteCPF?: string;
  clienteTelefone: string;
  clienteEmail?: string;

  // Aparelho usado (trade-in)
  aparelhoModelo: string;
  aparelhoStorage: string;
  aparelhoIMEI?: string;
  aparelhoCor?: string;
  condicao: string; // texto descritivo da condição
  valorAvaliado: number;

  // Aparelho novo
  novoModelo: string;
  novoStorage: string;
  novoCor: string;
  novoPreco: number;

  // Pagamento
  diferenca: number;
  formaPagamento: string;

  // Meta
  data: string; // DD/MM/AAAA
  validade: string; // ex: "24 horas"
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
  green: "#2ECC71",
};

function hexToRGB(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function fmtBRL(v: number): string {
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

// ============================================
// PDF Generation
// ============================================

export async function gerarContratoPDF(dados: ContratoData): Promise<Buffer> {
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
    const contentW = pageW - 100; // 50px margin each side
    let y = 40;

    // ==========================================
    // HEADER
    // ==========================================
    doc.rect(0, 0, pageW, 80).fill(C.headerBg);

    doc.fontSize(22).font("Helvetica-Bold").fillColor(C.headerText);
    doc.text("TIGRAO IMPORTS", 50, 18, { width: contentW, align: "center" });

    doc.fontSize(12).font("Helvetica").fillColor(C.accent);
    doc.text("CONTRATO DE TRADE-IN", 50, 46, { width: contentW, align: "center" });

    y = 95;

    // Data e validade
    doc.fontSize(9).font("Helvetica").fillColor(C.textLight);
    doc.text(`Data: ${dados.data}  |  Validade: ${dados.validade}`, 50, y, { width: contentW, align: "right" });
    y += 20;

    // ==========================================
    // SECTION 1: Dados do Cliente
    // ==========================================
    y = drawSectionHeader(doc, "1. DADOS DO CLIENTE", y, contentW);
    y = drawField(doc, "Nome", dados.clienteNome, y, contentW);
    if (dados.clienteCPF) y = drawField(doc, "CPF", dados.clienteCPF, y, contentW);
    y = drawField(doc, "Telefone", dados.clienteTelefone, y, contentW);
    if (dados.clienteEmail) y = drawField(doc, "E-mail", dados.clienteEmail, y, contentW);
    y += 10;

    // ==========================================
    // SECTION 2: Aparelho na Troca
    // ==========================================
    y = drawSectionHeader(doc, "2. APARELHO NA TROCA", y, contentW);
    y = drawField(doc, "Modelo", dados.aparelhoModelo, y, contentW);
    y = drawField(doc, "Armazenamento", dados.aparelhoStorage, y, contentW);
    if (dados.aparelhoIMEI) y = drawField(doc, "IMEI", dados.aparelhoIMEI, y, contentW);
    if (dados.aparelhoCor) y = drawField(doc, "Cor", dados.aparelhoCor, y, contentW);

    // Condição — multiline
    doc.fontSize(9).font("Helvetica-Bold").fillColor(C.text);
    doc.text("Condição:", 50, y, { width: 100 });
    doc.fontSize(9).font("Helvetica").fillColor(C.textLight);
    const condHeight = doc.heightOfString(dados.condicao, { width: contentW - 110 });
    doc.text(dados.condicao, 160, y, { width: contentW - 110 });
    y += Math.max(condHeight, 14) + 4;

    y = drawField(doc, "Valor Avaliado", fmtBRL(dados.valorAvaliado), y, contentW, C.green);
    y += 10;

    // ==========================================
    // SECTION 3: Aparelho Novo
    // ==========================================
    y = drawSectionHeader(doc, "3. APARELHO NOVO", y, contentW);
    y = drawField(doc, "Modelo", dados.novoModelo, y, contentW);
    y = drawField(doc, "Armazenamento", dados.novoStorage, y, contentW);
    y = drawField(doc, "Cor", dados.novoCor, y, contentW);
    y = drawField(doc, "Preco", fmtBRL(dados.novoPreco), y, contentW);
    y = drawField(doc, "Condicao", "Novo, Lacrado, 1 ano garantia Apple, NF", y, contentW);
    y += 10;

    // ==========================================
    // SECTION 4: Valores
    // ==========================================
    y = drawSectionHeader(doc, "4. VALORES", y, contentW);

    // Highlight box
    doc.roundedRect(50, y, contentW, 80, 6).fill(C.sectionBg);
    const boxY = y + 10;

    doc.fontSize(10).font("Helvetica").fillColor(C.textLight);
    doc.text("Valor do aparelho usado:", 70, boxY);
    doc.font("Helvetica-Bold").fillColor(C.green);
    doc.text(fmtBRL(dados.valorAvaliado), 280, boxY);

    doc.fontSize(10).font("Helvetica").fillColor(C.textLight);
    doc.text("Preco do aparelho novo:", 70, boxY + 18);
    doc.font("Helvetica-Bold").fillColor(C.text);
    doc.text(fmtBRL(dados.novoPreco), 280, boxY + 18);

    doc.moveTo(70, boxY + 34).lineTo(430, boxY + 34).strokeColor(C.border).lineWidth(0.5).stroke();

    doc.fontSize(12).font("Helvetica-Bold").fillColor(C.accent);
    doc.text("Diferenca a pagar:", 70, boxY + 40);
    doc.text(fmtBRL(dados.diferenca), 280, boxY + 40);

    y += 90;

    y = drawField(doc, "Forma de Pagamento", dados.formaPagamento, y, contentW);
    y += 15;

    // ==========================================
    // SECTION 5: Termos e Condições
    // ==========================================
    y = checkPageBreak(doc, y, 200);
    y = drawSectionHeader(doc, "5. TERMOS E CONDICOES", y, contentW);

    const termos = [
      "1. O aparelho na troca foi avaliado presencialmente e o valor acordado e definitivo.",
      "2. O cliente declara ser o legitimo proprietario do aparelho entregue.",
      "3. O aparelho entregue nao possui bloqueio de operadora, bloqueio por IMEI, ou restricoes.",
      "4. A TigraoImports garante que o produto novo e lacrado, com garantia Apple de 1 ano e nota fiscal.",
      "5. Este contrato tem validade de 24 horas a partir da data de emissao.",
      "6. Em caso de desistencia apos a troca, taxas de restocking poderao ser aplicadas.",
    ];

    doc.fontSize(8.5).font("Helvetica").fillColor(C.textLight);
    for (const termo of termos) {
      const h = doc.heightOfString(termo, { width: contentW - 10 });
      y = checkPageBreak(doc, y, h + 6);
      doc.text(termo, 55, y, { width: contentW - 10 });
      y += h + 4;
    }

    y += 15;

    // ==========================================
    // SECTION 6: Assinaturas
    // ==========================================
    y = checkPageBreak(doc, y, 100);
    y = drawSectionHeader(doc, "6. ASSINATURAS", y, contentW);
    y += 10;

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
  doc.text(`${label}:`, 50, y, { width: 110 });
  doc.fontSize(9).font("Helvetica").fillColor(valueColor || C.textLight);
  doc.text(value, 160, y, { width: contentW - 110 });
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
