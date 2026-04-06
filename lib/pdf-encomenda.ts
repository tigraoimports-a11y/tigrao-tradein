// lib/pdf-encomenda.ts — Contrato de Encomenda com Troca (formato jurídico TigrãoImports)
import PDFDocument from "pdfkit";

export interface ContratoEncomendaData {
  // Contratante
  clienteNome: string;
  clienteCPF: string;
  clienteEndereco: string; // ex: "Rua X, 123, apto 1, Bairro, CEP: 00000-000, Rio de Janeiro – RJ"

  // Produto novo (encomenda)
  produtoNovo: string;      // ex: "iPhone 17"
  storageNovo: string;      // ex: "512GB"
  corNova: string;          // ex: "Mist Blue (Azul névoa)"
  detalhesNovo?: string;    // ex: "Lacrado, NF inclusa, desbloqueado"
  valorNovo: number;

  // Produto na troca (opcional)
  temTroca: boolean;
  produtoUsado?: string;
  storageUsado?: string;
  corUsada?: string;
  condicoesUsado?: string[]; // bullets
  bateriaUsado?: string;     // ex: "86%"
  valorUsado?: number;

  // Pagamento
  valorAssinatura: number;   // valor pago na assinatura
  formaAssinatura: string;   // ex: "Pix"
  valorEntrega?: number;     // valor pago na entrega (opcional)
  formaEntrega?: string;     // ex: "Pix"

  // Prazo
  prazoEntrega: number;     // dias úteis, default 20

  // Data
  data: string;             // ex: "04 de Abril de 2026"
}

function valorPorExtenso(valor: number): string {
  // Extenso simples para valores comuns — suficiente para contratos
  const units = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
    "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
    "seiscentos", "setecentos", "oitocentos", "novecentos"];

  if (valor === 0) return "zero";
  if (valor === 100) return "cem";
  if (valor === 1000) return "mil";

  const v = Math.round(valor);
  const parts: string[] = [];

  const milhar = Math.floor(v / 1000);
  const resto = v % 1000;
  const centena = Math.floor(resto / 100);
  const dezena = Math.floor((resto % 100) / 10);
  const unidade = resto % 10;

  if (milhar > 0) {
    if (milhar === 1) parts.push("mil");
    else parts.push(`${units[milhar]} mil`);
  }
  if (centena > 0) parts.push(hundreds[centena]);
  if (resto % 100 >= 20) {
    parts.push(tens[dezena]);
    if (unidade > 0) parts.push(units[unidade]);
  } else if (resto % 100 > 0) {
    parts.push(units[resto % 100]);
  }

  return parts.join(" e ");
}

function fmtBRL(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtBRLExtenso(v: number): string {
  return `${fmtBRL(v)} (${valorPorExtenso(v)} reais)`;
}

export async function gerarContratoEncomendaPDF(dados: ContratoEncomendaData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 60, bottom: 60, left: 70, right: 70 },
    });

    const chunks: Uint8Array[] = [];
    doc.on("data", (c: Uint8Array) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width - 140; // largura útil

    function checkBreak(needed = 60) {
      if (doc.y + needed > doc.page.height - 80) doc.addPage();
    }

    function linha() {
      doc.moveDown(0.3);
      doc.moveTo(70, doc.y).lineTo(70 + W, doc.y).strokeColor("#BBBBBB").lineWidth(0.5).stroke();
      doc.moveDown(0.5);
    }

    function titulo(texto: string) {
      checkBreak(50);
      doc.moveDown(0.6);
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#111111");
      doc.text(texto);
      doc.moveDown(0.2);
      linha();
    }

    function p(texto: string, opts?: object) {
      doc.fontSize(10).font("Helvetica").fillColor("#222222");
      doc.text(texto, { lineGap: 3, ...opts });
      doc.moveDown(0.3);
    }

    function bold(texto: string) {
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#222222");
      doc.text(texto, { lineGap: 3 });
      doc.moveDown(0.3);
    }

    function campo(label: string, valor: string) {
      doc.fontSize(10).fillColor("#222222");
      doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
      doc.font("Helvetica").text(valor, { lineGap: 2 });
      doc.moveDown(0.2);
    }

    // ─── TÍTULO PRINCIPAL ───────────────────────────────────────
    doc.fontSize(16).font("Helvetica-Bold").fillColor("#111111");
    doc.text("CONTRATO PARTICULAR DE PRESTAÇÃO", { align: "center" });
    doc.text("DE SERVIÇO DE", { align: "center" });
    doc.fontSize(12).font("Helvetica").fillColor("#444444");
    doc.text("INTERMEDIAÇÃO DE NEGÓCIOS (ENCOMENDA COM TROCA)", { align: "center" });
    doc.moveDown(0.5);
    linha();

    // ─── I – DAS PARTES ──────────────────────────────────────────
    titulo("I – DAS PARTES");

    bold("CONTRATANTE:");
    p(`${dados.clienteNome}, inscrito no CPF nº ${dados.clienteCPF}, residente e domiciliado à ${dados.clienteEndereco}.`);
    doc.moveDown(0.3);

    bold("CONTRATADO:");
    p("TIGRÃO IMPORTS LTDA, Sociedade Empresarial Limitada, inscrita no CNPJ sob o nº 50.139.554/0001-42, com sede na Avenida Ator José Wilker, 605 – Barra Olímpica – RJ.");
    doc.moveDown(0.3);
    p("As partes acima qualificadas resolvem firmar o presente contrato mediante as cláusulas seguintes:");

    // ─── II – DO OBJETO DO CONTRATO ──────────────────────────────
    titulo("II – DO OBJETO DO CONTRATO");

    p("2.1. O presente contrato tem por objeto a intermediação para aquisição do seguinte produto eletrônico da marca Apple:");
    doc.moveDown(0.2);
    campo("Produto", dados.produtoNovo);
    campo("Armazenamento", dados.storageNovo);
    campo("Cor", dados.corNova);
    if (dados.detalhesNovo) campo("Detalhes", dados.detalhesNovo);
    doc.moveDown(0.2);
    p("2.2. O produto será entregue ");
    // inline bold
    doc.moveUp(1.2);
    doc.font("Helvetica").text("2.2. O produto será entregue ", { continued: true });
    doc.font("Helvetica-Bold").text("novo, original, lacrado na caixa, ", { continued: true });
    doc.font("Helvetica").text("em perfeito estado de funcionamento e conservação.");
    doc.moveDown(0.4);

    doc.font("Helvetica").text("2.3. O produto conta com ", { continued: true });
    doc.font("Helvetica-Bold").text("garantia Apple", { continued: true });
    doc.font("Helvetica").text(", conforme as políticas oficiais do fabricante.");
    doc.moveDown(0.4);

    // ─── III – DO PRODUTO NA TROCA (opcional) ────────────────────
    if (dados.temTroca && dados.produtoUsado) {
      titulo("III – DO PRODUTO NA TROCA");

      p("3.1. O CONTRATANTE entregará como parte do pagamento o seguinte aparelho:");
      doc.moveDown(0.2);
      campo("Produto", dados.produtoUsado);
      if (dados.storageUsado) campo("Armazenamento", dados.storageUsado);
      if (dados.corUsada) campo("Cor", dados.corUsada);
      p("Condições informadas:");
      if (dados.condicoesUsado && dados.condicoesUsado.length > 0) {
        for (const c of dados.condicoesUsado) {
          doc.fontSize(10).font("Helvetica").fillColor("#222222");
          doc.text(`• ${c}`, { indent: 15, lineGap: 2 });
        }
        if (dados.bateriaUsado) {
          doc.text(`• Saúde da bateria: `, { indent: 15, continued: true });
          doc.font("Helvetica-Bold").text(dados.bateriaUsado);
        }
      }
      doc.moveDown(0.4);

      doc.font("Helvetica").text("3.2. O aparelho foi avaliado pela CONTRATADA no valor de ", { continued: true });
      doc.font("Helvetica-Bold").text(`${fmtBRLExtenso(dados.valorUsado || 0)}.`);
      doc.moveDown(0.4);

      doc.font("Helvetica").text("3.3. O valor está condicionado à ", { continued: true });
      doc.font("Helvetica-Bold").text("conferência no ato da entrega", { continued: true });
      doc.font("Helvetica").text(", podendo sofrer ajuste caso sejam constatadas divergências nas condições informadas.");
      doc.moveDown(0.4);
    }

    // ─── IV – DO VALOR E FORMA DE PAGAMENTO ──────────────────────
    checkBreak(120);
    const secNum = dados.temTroca ? "IV" : "III";
    titulo(`${secNum} – DO VALOR E FORMA DE PAGAMENTO`);

    const clausulaNum = dados.temTroca ? "4" : "3";
    const refClausula = dados.temTroca ? "Cláusula II" : "Cláusula II";
    const prodLabel = `${dados.produtoNovo}`.trim();

    doc.font("Helvetica").text(`${clausulaNum}.1. O valor do produto novo descrito na ${refClausula} (`);
    doc.moveUp(1.2);
    doc.font("Helvetica").text(`${clausulaNum}.1. O valor do produto novo descrito na ${refClausula} (`, { continued: true });
    doc.font("Helvetica-Bold").text(prodLabel, { continued: true });
    doc.font("Helvetica").text(") é de:");
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").text(fmtBRLExtenso(dados.valorNovo) + ".");
    doc.moveDown(0.4);

    let nextClausula = 2;

    if (dados.temTroca && dados.valorUsado) {
      doc.font("Helvetica").text(`${clausulaNum}.${nextClausula}. O CONTRATANTE entregará como parte do pagamento o aparelho descrito na Cláusula III, avaliado em:`);
      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").text(fmtBRLExtenso(dados.valorUsado) + ".");
      doc.moveDown(0.4);
      nextClausula++;

      const restante = dados.valorNovo - dados.valorUsado;
      doc.font("Helvetica").text(`${clausulaNum}.${nextClausula}. Considerando a troca, o valor remanescente da negociação corresponde a:`);
      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").fillColor("#1a6e1a").text(`${fmtBRLExtenso(restante)}.`);
      doc.fillColor("#222222");
      doc.moveDown(0.4);
      nextClausula++;
    }

    // Condições de pagamento
    doc.font("Helvetica").text(`${clausulaNum}.${nextClausula}. O pagamento será realizado conforme abaixo:`);
    doc.moveDown(0.3);

    doc.font("Helvetica").text("• Na assinatura do contrato: ", { indent: 15, continued: true });
    doc.font("Helvetica-Bold").text(fmtBRLExtenso(dados.valorAssinatura), { continued: true });
    doc.font("Helvetica").text(` via ${dados.formaAssinatura}.`);
    doc.moveDown(0.2);

    if (dados.valorEntrega && dados.valorEntrega > 0) {
      doc.font("Helvetica").text("• Na entrega do produto: ", { indent: 15, continued: true });
      doc.font("Helvetica-Bold").text(fmtBRLExtenso(dados.valorEntrega), { continued: true });
      doc.font("Helvetica").text(` via ${dados.formaEntrega}.`);
      doc.moveDown(0.2);
    }
    doc.moveDown(0.4);

    // ─── V – DAS CONDIÇÕES DO PRODUTO ────────────────────────────
    checkBreak(80);
    const sec5 = dados.temTroca ? "V" : "IV";
    const cl5 = dados.temTroca ? "5" : "4";
    titulo(`${sec5} – DAS CONDIÇÕES DO PRODUTO`);

    doc.font("Helvetica").text(`${cl5}.1. O CONTRATANTE declara estar ciente de que o produto será `, { continued: true });
    doc.font("Helvetica-Bold").text("novo, lacrado de fábrica", { continued: true });
    doc.font("Helvetica").text(", nunca aberto ou utilizado.");
    doc.moveDown(0.4);

    doc.font("Helvetica").text(`${cl5}.2. O produto conta com `, { continued: true });
    doc.font("Helvetica-Bold").text("garantia Apple", { continued: true });
    doc.font("Helvetica").text(", conforme políticas oficiais do fabricante.");
    doc.moveDown(0.4);

    // ─── VI – DA RESERVA, ENCOMENDA E DESISTÊNCIA ────────────────
    checkBreak(80);
    const sec6 = dados.temTroca ? "VI" : "V";
    const cl6 = dados.temTroca ? "6" : "5";
    titulo(`${sec6} – DA RESERVA, ENCOMENDA E DESISTÊNCIA`);

    doc.font("Helvetica").text(`${cl6}.1. O pagamento integral efetuado viabiliza a `, { continued: true });
    doc.font("Helvetica-Bold").text("compra, reserva e logística do produto", { continued: true });
    doc.font("Helvetica").text(".");
    doc.moveDown(0.4);

    doc.font("Helvetica").text(`${cl6}.2. Em caso de desistência após a confirmação da encomenda, poderá ser retido valor proporcional aos `, { continued: true });
    doc.font("Helvetica-Bold").text("custos operacionais, financeiros e logísticos já incorridos", { continued: true });
    doc.font("Helvetica").text(".");
    doc.moveDown(0.4);

    // ─── VII – DO PRAZO DE ENTREGA ───────────────────────────────
    checkBreak(80);
    const sec7 = dados.temTroca ? "VII" : "VI";
    const cl7 = dados.temTroca ? "7" : "6";
    titulo(`${sec7} – DO PRAZO DE ENTREGA`);

    const prazoExtenso: Record<number, string> = {
      5: "cinco", 7: "sete", 10: "dez", 15: "quinze", 20: "vinte", 25: "vinte e cinco", 30: "trinta"
    };
    const prazoStr = prazoExtenso[dados.prazoEntrega] || String(dados.prazoEntrega);
    doc.font("Helvetica").text(`${cl7}.1. O prazo estimado para a chegada do produto é de `, { continued: true });
    doc.font("Helvetica-Bold").text(`${dados.prazoEntrega} (${prazoStr}) dias úteis`, { continued: true });
    doc.font("Helvetica").text(", contados a partir da confirmação do pagamento.");
    doc.moveDown(0.4);

    doc.font("Helvetica").text(`${cl7}.2. Após a chegada do produto, será realizado o procedimento de `, { continued: true });
    doc.font("Helvetica-Bold").text("upgrade", { continued: true });
    doc.font("Helvetica").text(", com a entrega do aparelho novo mediante a entrega do aparelho usado.");
    doc.moveDown(0.4);

    // ─── VIII – DAS PENALIDADES ───────────────────────────────────
    checkBreak(60);
    const sec8 = dados.temTroca ? "VIII" : "VII";
    const cl8 = dados.temTroca ? "8" : "7";
    titulo(`${sec8} – DAS PENALIDADES`);

    doc.font("Helvetica").text(`${cl8}.1. O descumprimento das obrigações previstas neste contrato sujeitará a parte infratora ao pagamento de `, { continued: true });
    doc.font("Helvetica-Bold").text("multa de 10% (dez por cento)", { continued: true });
    doc.font("Helvetica").text(" sobre o valor total da negociação.");
    doc.moveDown(0.4);

    // ─── IX – DO FORO ─────────────────────────────────────────────
    checkBreak(60);
    const sec9 = dados.temTroca ? "IX" : "VIII";
    const cl9 = dados.temTroca ? "9" : "8";
    titulo(`${sec9} – DO FORO`);

    doc.font("Helvetica").text(`${cl9}.1. As partes elegem o foro da `, { continued: true });
    doc.font("Helvetica-Bold").text("Comarca do Rio de Janeiro – RJ", { continued: true });
    doc.font("Helvetica").text(" para dirimir quaisquer controvérsias oriundas deste contrato.");
    doc.moveDown(0.6);

    // ─── DATA E ASSINATURAS ───────────────────────────────────────
    checkBreak(150);
    linha();
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#222222");
    doc.text(`Rio de Janeiro – RJ, ${dados.data}`);
    doc.moveDown(1.2);

    // Duas colunas de assinatura
    const col1X = 70;
    const col2X = 70 + W / 2 + 20;
    const sigY = doc.y;

    // CONTRATADO
    doc.font("Helvetica-Bold").fontSize(10).text("CONTRATADO", col1X, sigY);
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).text("Tigrão Imports LTDA", col1X);
    doc.moveDown(0.2);
    doc.text("CNPJ nº 50.139.554/0001-42", col1X);
    doc.moveDown(0.8);
    doc.moveTo(col1X, doc.y + 5).lineTo(col1X + W / 2 - 30, doc.y + 5).strokeColor("#333333").lineWidth(0.8).stroke();
    doc.moveDown(0.8);
    doc.fontSize(9).fillColor("#555555").text("Assinatura", col1X);

    // CONTRATANTE
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#222222").text("CONTRATANTE", col2X, sigY);
    doc.font("Helvetica").fontSize(10);
    doc.text(dados.clienteNome, col2X, sigY + 16);
    doc.text(`CPF nº ${dados.clienteCPF}`, col2X, sigY + 30);
    doc.moveTo(col2X, sigY + 55).lineTo(col2X + W / 2 - 30, sigY + 55).strokeColor("#333333").lineWidth(0.8).stroke();
    doc.fontSize(9).fillColor("#555555").text("Assinatura", col2X, sigY + 60);

    doc.end();
  });
}
