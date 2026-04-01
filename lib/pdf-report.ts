// lib/pdf-report.ts — Geração de PDF com gráficos para relatórios TigrãoImports
import PDFDocument from "pdfkit";

// ============================================
// Types
// ============================================

export interface VendaSemana {
  data: string;
  cliente: string;
  produto: string;
  preco_vendido: number;
  custo: number;
  lucro: number;
  tipo: string; // VENDA, UPGRADE, ATACADO
  origem: string; // ANUNCIO, RECOMPRA, INDICACAO
  forma: string; // PIX, CARTAO, FIADO, DINHEIRO
  banco: string; // ITAU, INFINITE, MERCADO_PAGO
  parcelas: number;
  status_pagamento: string;
}

export interface GastoSemana {
  data: string;
  valor: number;
  tipo: string;
  categoria: string;
  descricao: string;
  banco: string;
}

export interface EstoqueItem {
  produto: string;
  quantidade: number;
  custo_unitario: number;
  categoria: string;
}

export interface SemanaData {
  label: string; // "SEMANA 1: 02/03 a 08/03"
  inicio: string; // ISO date
  fim: string;
  vendas: VendaSemana[];
  gastos: GastoSemana[];
  estoque: EstoqueItem[];
}

export interface ReportConfig {
  titulo: string; // "TIGRAOIMPORTS"
  subtitulo: string; // "SEMANA 1: 02/03 a 08/03"
  semanas: SemanaData[];
  comparativo?: boolean;
}

// ============================================
// Colors
// ============================================

const COLORS = {
  bg: "#FFFFFF",
  headerBg: "#1A1A2E",
  headerText: "#FFFFFF",
  accent: "#E8740E",
  accentLight: "#F5A623",
  blue: "#4A90D9",
  blueLight: "#6BB5FF",
  green: "#4CAF50",
  greenLight: "#81C784",
  red: "#E74C3C",
  redLight: "#FF6B6B",
  purple: "#9B59B6",
  orange: "#FF9800",
  teal: "#26A69A",
  gray: "#666666",
  grayLight: "#999999",
  grayBorder: "#E0E0E0",
  text: "#333333",
  textLight: "#666666",
  textMuted: "#999999",
};

const TIPO_COLORS: Record<string, string> = {
  "CF": "#4A90D9",
  "VENDA": "#4A90D9",
  "Atacado": "#9B59B6",
  "ATACADO": "#9B59B6",
  "Upgrade": "#4CAF50",
  "UPGRADE": "#4CAF50",
};

const BANCO_COLORS: Record<string, string> = {
  "ITAU": "#003DA5",
  "INFINITE": "#26A69A",
  "INFINITEPAY": "#26A69A",
  "MERCADO_PAGO": "#00B1EA",
  "ESPECIE": "#FF9800",
};

const DIA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

// ============================================
// Helpers
// ============================================

function fmtBRL(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtBRLShort(v: number): string {
  if (Math.abs(v) >= 1000) {
    return `R$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  }
  return `R$${Math.round(v)}`;
}

function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

function hexToRGB(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function dateToDiaSemana(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return DIA_SEMANA[d.getDay()];
}

function dateToDay(dateStr: string): string {
  return dateStr.split("-")[2];
}

function formatDateBR(dateStr: string): string {
  const parts = dateStr.split("-");
  return `${parts[2]}/${parts[1]}`;
}

// ============================================
// Chart Drawing Functions
// ============================================

function drawBarChart(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  data: { label: string; sublabel: string; fat: number; lucro: number; margem: number }[],
  title: string
) {
  const chartX = x + 50;
  const chartY = y + 25;
  const chartW = width - 80;
  const chartH = height - 55;

  // Title
  doc.fontSize(9).fillColor(COLORS.text).font("Helvetica-Bold");
  doc.text(title, x, y, { width, align: "center" });

  // Find max value for scale
  const maxVal = Math.max(...data.map(d => d.fat), 1);
  const maxMargem = Math.max(...data.map(d => d.margem), 1);
  const yScale = chartH / (maxVal * 1.15);
  const barWidth = Math.min(35, (chartW / data.length) * 0.6);
  const barSpacing = chartW / data.length;

  // Y-axis labels (faturamento)
  doc.fontSize(6).font("Helvetica").fillColor(COLORS.textMuted);
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const val = (maxVal * 1.15 * i) / ySteps;
    const yPos = chartY + chartH - (val * yScale);
    doc.text(fmtBRLShort(val), x, yPos - 4, { width: 45, align: "right" });
    // Grid line
    doc.strokeColor(COLORS.grayBorder).lineWidth(0.3)
      .moveTo(chartX, yPos).lineTo(chartX + chartW, yPos).stroke();
  }

  // Bars
  data.forEach((d, i) => {
    const barX = chartX + (i * barSpacing) + (barSpacing - barWidth) / 2;

    // Faturamento bar (blue)
    const fatH = d.fat * yScale;
    const fatY = chartY + chartH - fatH;
    doc.rect(barX, fatY, barWidth, fatH).fill(COLORS.blue);

    // Lucro bar (green, overlaid smaller)
    const lucroH = d.lucro * yScale;
    const lucroY = chartY + chartH - lucroH;
    doc.rect(barX + 2, lucroY, barWidth - 4, lucroH).fill(COLORS.green);

    // X labels
    doc.fontSize(7).font("Helvetica-Bold").fillColor(COLORS.text);
    doc.text(d.label, barX - 5, chartY + chartH + 3, { width: barWidth + 10, align: "center" });
    doc.fontSize(6).font("Helvetica").fillColor(COLORS.textMuted);
    doc.text(d.sublabel, barX - 5, chartY + chartH + 13, { width: barWidth + 10, align: "center" });
  });

  // Margem line (right Y-axis)
  doc.fontSize(6).font("Helvetica").fillColor(COLORS.red);
  const margemScale = chartH / (maxMargem * 1.5);
  const points: { x: number; y: number }[] = [];
  data.forEach((d, i) => {
    const px = chartX + (i * barSpacing) + barSpacing / 2;
    const py = chartY + chartH - (d.margem * margemScale);
    points.push({ x: px, y: py });
  });

  if (points.length > 1) {
    doc.strokeColor(COLORS.red).lineWidth(1.5);
    doc.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      doc.lineTo(points[i].x, points[i].y);
    }
    doc.stroke();

    // Dots on line
    points.forEach(p => {
      doc.circle(p.x, p.y, 3).fill(COLORS.red);
    });
  }

  // Right Y-axis label
  doc.fontSize(6).fillColor(COLORS.red);
  for (let i = 0; i <= 3; i++) {
    const val = (maxMargem * 1.5 * i) / 3;
    const yPos = chartY + chartH - (val * margemScale);
    doc.text(fmtPct(val), chartX + chartW + 3, yPos - 4, { width: 30 });
  }

  // Legend
  const legendY = y + 13;
  doc.rect(x + 10, legendY, 8, 8).fill(COLORS.blue);
  doc.fontSize(6).fillColor(COLORS.text).font("Helvetica");
  doc.text("Faturamento", x + 21, legendY + 1);
  doc.rect(x + 65, legendY, 8, 8).fill(COLORS.green);
  doc.text("Lucro", x + 76, legendY + 1);
  doc.circle(x + 115, legendY + 4, 3).fill(COLORS.red);
  doc.text("Margem %", x + 121, legendY + 1);
}

function drawPieChart(
  doc: PDFKit.PDFDocument,
  cx: number,
  cy: number,
  radius: number,
  data: { label: string; value: number; color: string }[],
  title: string
) {
  // Title
  doc.fontSize(9).fillColor(COLORS.text).font("Helvetica-Bold");
  doc.text(title, cx - radius - 20, cy - radius - 20, { width: (radius + 20) * 2, align: "center" });

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return;

  let startAngle = -Math.PI / 2;
  data.forEach((d) => {
    const sliceAngle = (d.value / total) * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;

    // Draw slice using path
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);

    doc.save();
    doc.fillColor(d.color);
    doc.moveTo(cx, cy);
    doc.lineTo(x1, y1);

    // Draw arc with small steps
    const steps = Math.max(20, Math.ceil(sliceAngle * 30));
    for (let i = 1; i <= steps; i++) {
      const angle = startAngle + (sliceAngle * i) / steps;
      doc.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    }
    doc.lineTo(cx, cy);
    doc.fill();
    doc.restore();

    // Label
    const midAngle = startAngle + sliceAngle / 2;
    const labelR = radius + 15;
    const lx = cx + labelR * Math.cos(midAngle);
    const ly = cy + labelR * Math.sin(midAngle);
    const pct = ((d.value / total) * 100).toFixed(0);

    doc.fontSize(7).font("Helvetica-Bold").fillColor(d.color);
    const labelText = `${d.label} (${d.value})`;
    const pctText = `${pct}%`;

    if (midAngle > Math.PI / 2 || midAngle < -Math.PI / 2) {
      // Left side
      doc.text(labelText, lx - 70, ly - 5, { width: 68, align: "right" });
      doc.text(pctText, lx - 70, ly + 5, { width: 68, align: "right" });
    } else {
      // Right side
      doc.text(labelText, lx + 2, ly - 5, { width: 68 });
      doc.text(pctText, lx + 2, ly + 5, { width: 68 });
    }

    startAngle = endAngle;
  });
}

function drawHorizontalBarChart(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  data: { label: string; fat: number; lucro: number }[],
  title: string
) {
  doc.fontSize(9).fillColor(COLORS.text).font("Helvetica-Bold");
  doc.text(title, x, y, { width, align: "center" });

  const chartX = x + 130;
  const chartY = y + 20;
  const chartW = width - 160;
  const barH = Math.min(22, (height - 30) / data.length - 5);
  const barSpacing = (height - 30) / data.length;
  const maxVal = Math.max(...data.map(d => d.fat), 1);

  data.forEach((d, i) => {
    const barY = chartY + i * barSpacing;

    // Label
    doc.fontSize(6).font("Helvetica").fillColor(COLORS.text);
    doc.text(d.label, x, barY + barH / 2 - 4, { width: 125, align: "right" });

    // Fat bar
    const fatW = (d.fat / maxVal) * chartW;
    doc.rect(chartX, barY, fatW, barH / 2).fill(COLORS.blue);
    doc.fontSize(6).fillColor(COLORS.blue).font("Helvetica-Bold");
    doc.text(fmtBRLShort(d.fat), chartX + fatW + 3, barY + 1);

    // Lucro bar
    const lucroW = (d.lucro / maxVal) * chartW;
    doc.rect(chartX, barY + barH / 2 + 1, lucroW, barH / 2).fill(COLORS.green);
    doc.fontSize(6).fillColor(COLORS.green).font("Helvetica-Bold");
    doc.text(fmtBRLShort(d.lucro), chartX + lucroW + 3, barY + barH / 2 + 2);
  });

  // Legend
  doc.rect(chartX + chartW - 60, chartY + height - 50, 8, 8).fill(COLORS.blue);
  doc.fontSize(6).fillColor(COLORS.text).font("Helvetica");
  doc.text("Faturamento", chartX + chartW - 49, chartY + height - 49);
  doc.rect(chartX + chartW - 60, chartY + height - 38, 8, 8).fill(COLORS.green);
  doc.text("Lucro", chartX + chartW - 49, chartY + height - 37);
}

// ============================================
// KPI Header
// ============================================

function drawKPIHeader(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  kpis: { label: string; value: string; delta?: string; deltaPositive?: boolean }[]
) {
  const cardW = width / kpis.length;

  kpis.forEach((kpi, i) => {
    const cx = x + i * cardW;

    // Card background
    doc.rect(cx + 2, y, cardW - 4, 45).fill("#F8F9FA");

    // Label
    doc.fontSize(7).font("Helvetica").fillColor(COLORS.textMuted);
    doc.text(kpi.label, cx + 5, y + 5, { width: cardW - 10, align: "center" });

    // Value
    doc.fontSize(11).font("Helvetica-Bold").fillColor(COLORS.text);
    doc.text(kpi.value, cx + 5, y + 17, { width: cardW - 10, align: "center" });

    // Delta
    if (kpi.delta) {
      const deltaColor = kpi.deltaPositive ? COLORS.green : COLORS.red;
      const arrow = kpi.deltaPositive ? "↑" : "↓";
      doc.fontSize(7).font("Helvetica").fillColor(deltaColor);
      doc.text(`${arrow} ${kpi.delta}`, cx + 5, y + 33, { width: cardW - 10, align: "center" });
    }
  });
}

// ============================================
// Main: Generate Weekly Report
// ============================================

function computeWeekStats(sem: SemanaData) {
  const v = sem.vendas;
  const g = sem.gastos;

  const fat = v.reduce((s, x) => s + Number(x.preco_vendido || 0), 0);
  const custo = v.reduce((s, x) => s + Number(x.custo || 0), 0);
  const lucro = v.reduce((s, x) => s + Number(x.lucro || 0), 0);
  const margem = fat > 0 ? (lucro / fat) * 100 : 0;
  const ticket = v.length > 0 ? fat / v.length : 0;

  const gastosOp = g.filter(x => x.tipo === "SAIDA" && x.categoria !== "FORNECEDOR")
    .reduce((s, x) => s + Number(x.valor || 0), 0);
  const fornecedor = g.filter(x => x.tipo === "SAIDA" && x.categoria === "FORNECEDOR")
    .reduce((s, x) => s + Number(x.valor || 0), 0);

  // By tipo
  const atacado = v.filter(x => x.tipo === "ATACADO" || x.origem === "ATACADO");
  const upgrade = v.filter(x => x.tipo === "UPGRADE");
  const cf = v.filter(x => x.tipo !== "ATACADO" && x.origem !== "ATACADO" && x.tipo !== "UPGRADE");

  // By forma
  const pix = v.filter(x => x.forma === "PIX" || x.forma === "DINHEIRO");
  const cartao1x = v.filter(x => x.forma === "CARTAO" && (x.parcelas === 1 || !x.parcelas));
  const parcelado = v.filter(x => x.forma === "CARTAO" && x.parcelas > 1);
  const dinheiro = v.filter(x => x.forma === "DINHEIRO_ESPECIE");
  const mediaParcelas = parcelado.length > 0
    ? parcelado.reduce((s, x) => s + (x.parcelas || 1), 0) / parcelado.length
    : 0;

  // By banco
  const porBanco: Record<string, { fat: number; lucro: number }> = {};
  for (const x of v) {
    const b = x.banco || "OUTRO";
    if (!porBanco[b]) porBanco[b] = { fat: 0, lucro: 0 };
    porBanco[b].fat += Number(x.preco_vendido || 0);
    porBanco[b].lucro += Number(x.lucro || 0);
  }

  // By day
  const porDia: Record<string, { vendas: VendaSemana[]; fat: number; lucro: number; margem: number }> = {};
  // Generate all days in range
  const d = new Date(sem.inicio + "T12:00:00");
  const end = new Date(sem.fim + "T12:00:00");
  while (d <= end) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    porDia[iso] = { vendas: [], fat: 0, lucro: 0, margem: 0 };
    d.setDate(d.getDate() + 1);
  }
  for (const x of v) {
    if (!porDia[x.data]) porDia[x.data] = { vendas: [], fat: 0, lucro: 0, margem: 0 };
    porDia[x.data].vendas.push(x);
    porDia[x.data].fat += Number(x.preco_vendido || 0);
    porDia[x.data].lucro += Number(x.lucro || 0);
  }
  for (const [, info] of Object.entries(porDia)) {
    info.margem = info.fat > 0 ? (info.lucro / info.fat) * 100 : 0;
  }

  // Top modelos
  const porModelo: Record<string, { qty: number; fat: number; lucro: number; margem: number }> = {};
  for (const x of v) {
    const p = x.produto || "Desconhecido";
    if (!porModelo[p]) porModelo[p] = { qty: 0, fat: 0, lucro: 0, margem: 0 };
    porModelo[p].qty++;
    porModelo[p].fat += Number(x.preco_vendido || 0);
    porModelo[p].lucro += Number(x.lucro || 0);
  }
  for (const [, info] of Object.entries(porModelo)) {
    info.margem = info.fat > 0 ? (info.lucro / info.fat) * 100 : 0;
  }
  const topModelos = Object.entries(porModelo)
    .sort((a, b) => b[1].lucro - a[1].lucro);

  // Clientes únicos
  const clientesUnicos = new Set(v.map(x => x.cliente)).size;

  // Gastos por categoria
  const catGastos: Record<string, number> = {};
  g.filter(x => x.tipo === "SAIDA" && x.categoria !== "FORNECEDOR").forEach(x => {
    catGastos[x.categoria || "OUTROS"] = (catGastos[x.categoria || "OUTROS"] || 0) + Number(x.valor || 0);
  });

  // Estoque crítico: produtos vendidos na semana que estão com estoque 0
  const produtosVendidos = new Set(v.map(x => x.produto));
  const estoqueCritico = sem.estoque
    .filter(e => produtosVendidos.has(e.produto) && e.quantidade === 0)
    .map(e => e.produto);

  // Todos os produtos com estoque 0 (que existem no catálogo)
  const todosZerados = sem.estoque
    .filter(e => e.quantidade === 0)
    .map(e => e.produto);

  return {
    vendas: v.length, fat, custo, lucro, margem, ticket, gastosOp, fornecedor,
    atacado, upgrade, cf, pix, cartao1x, parcelado, dinheiro, mediaParcelas,
    porBanco, porDia, topModelos, clientesUnicos, catGastos,
    estoqueCritico, todosZerados,
  };
}

export async function generateWeeklyPDF(config: ReportConfig): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 30,
      info: {
        Title: config.titulo,
        Author: "TigrãoImports",
      },
    });

    const buffers: Uint8Array[] = [];
    doc.on("data", (chunk: Uint8Array) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const pageW = 595.28; // A4 width in points
    const margin = 30;
    const contentW = pageW - margin * 2;

    for (let si = 0; si < config.semanas.length; si++) {
      const sem = config.semanas[si];
      const stats = computeWeekStats(sem);

      if (si > 0) doc.addPage();

      // ============================================
      // PAGE 1: Charts page
      // ============================================

      // Header bar
      doc.rect(0, 0, pageW, 60).fill(COLORS.headerBg);
      doc.fontSize(18).font("Helvetica-Bold").fillColor(COLORS.accent);
      doc.text("TIGRAOIMPORTS", margin, 12, { width: contentW, align: "center" });
      doc.fontSize(10).fillColor(COLORS.headerText).font("Helvetica");
      doc.text(sem.label, margin, 34, { width: contentW, align: "center" });

      // KPI cards
      const prevStats = si > 0 ? computeWeekStats(config.semanas[si - 1]) : null;

      const kpis = [
        {
          label: "Vendas",
          value: String(stats.vendas),
          delta: prevStats ? `${stats.vendas - prevStats.vendas}` : undefined,
          deltaPositive: prevStats ? stats.vendas >= prevStats.vendas : undefined,
        },
        {
          label: "Faturamento",
          value: fmtBRL(stats.fat),
          delta: prevStats ? fmtBRL(stats.fat - prevStats.fat) : undefined,
          deltaPositive: prevStats ? stats.fat >= prevStats.fat : undefined,
        },
        {
          label: "Lucro",
          value: fmtBRL(stats.lucro),
          delta: prevStats ? fmtBRL(stats.lucro - prevStats.lucro) : undefined,
          deltaPositive: prevStats ? stats.lucro >= prevStats.lucro : undefined,
        },
      ];

      drawKPIHeader(doc, margin, 70, contentW / 2, kpis);

      const kpis2 = [
        {
          label: "Margem %",
          value: fmtPct(stats.margem),
          delta: prevStats ? `${(stats.margem - prevStats.margem).toFixed(1)}pp` : undefined,
          deltaPositive: prevStats ? stats.margem >= prevStats.margem : undefined,
        },
        {
          label: "Gastos",
          value: fmtBRL(stats.gastosOp + stats.fornecedor),
          delta: prevStats ? fmtBRL((stats.gastosOp + stats.fornecedor) - (prevStats.gastosOp + prevStats.fornecedor)) : undefined,
          deltaPositive: prevStats ? (stats.gastosOp + stats.fornecedor) <= (prevStats.gastosOp + prevStats.fornecedor) : undefined,
        },
        {
          label: "Ticket Médio",
          value: fmtBRL(stats.ticket),
          delta: prevStats ? fmtBRL(stats.ticket - prevStats.ticket) : undefined,
          deltaPositive: prevStats ? stats.ticket >= prevStats.ticket : undefined,
        },
      ];

      drawKPIHeader(doc, margin + contentW / 2, 70, contentW / 2, kpis2);

      // Bar chart: Faturamento, Lucro e Margem por Dia
      const diasOrdenados = Object.entries(stats.porDia).sort(([a], [b]) => a.localeCompare(b));
      const barData = diasOrdenados.map(([data, info]) => ({
        label: dateToDiaSemana(data),
        sublabel: dateToDay(data),
        fat: info.fat,
        lucro: info.lucro,
        margem: info.margem,
      }));

      drawBarChart(doc, margin, 130, contentW * 0.6, 200, barData, "Faturamento, Lucro e Margem por Dia");

      // Pie chart: Distribuição por Tipo
      const tipoData = [
        { label: "Atacado", value: stats.atacado.length, color: TIPO_COLORS["ATACADO"] },
        { label: "CF", value: stats.cf.length, color: TIPO_COLORS["CF"] },
        { label: "Upgrade", value: stats.upgrade.length, color: TIPO_COLORS["UPGRADE"] },
      ].filter(d => d.value > 0);

      drawPieChart(doc, margin + contentW * 0.8, 210, 55, tipoData, "Distribuição por Tipo");

      // Top 5 Modelos horizontal bar chart
      const top5 = stats.topModelos.slice(0, 5).map(([label, info]) => ({
        label: label.substring(0, 28),
        fat: info.fat,
        lucro: info.lucro,
      }));

      drawHorizontalBarChart(doc, margin, 345, contentW * 0.6, 170, top5, "Top 5 Modelos (Fat + Lucro)");

      // Pie chart: Distribuição por Banco
      const bancoData = Object.entries(stats.porBanco)
        .map(([banco, info]) => ({
          label: banco === "INFINITE" ? "InfinitePay" : banco === "MERCADO_PAGO" ? "Mercado Pago" : banco === "ITAU" ? "Itaú" : banco,
          value: info.fat,
          color: BANCO_COLORS[banco] || COLORS.gray,
        }))
        .filter(d => d.value > 0)
        .sort((a, b) => b.value - a.value);

      drawPieChart(doc, margin + contentW * 0.8, 430, 55, bancoData, "Distribuição por Banco");

      // Footer
      const now = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      doc.fontSize(7).font("Helvetica").fillColor(COLORS.textMuted);
      doc.text(`Gerado em ${now} — Tigrão Imports`, margin, 800, { width: contentW, align: "center" });

      // ============================================
      // PAGE 2: Detailed text page
      // ============================================
      doc.addPage();

      // Header
      doc.rect(0, 0, pageW, 35).fill(COLORS.headerBg);
      doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.accent);
      doc.text(`${sem.label} Detalhamento`, margin, 10, { width: contentW, align: "center" });

      let ty = 50;
      const lineH = 12;

      const addSection = (title: string) => {
        if (ty > 750) { doc.addPage(); ty = 40; }
        doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.accent);
        doc.text(title, margin, ty, { width: contentW });
        ty += lineH + 2;
      };

      const addLine = (text: string, bold = false, color = COLORS.text) => {
        if (ty > 780) { doc.addPage(); ty = 40; }
        doc.fontSize(8).font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(color);
        doc.text(text, margin, ty, { width: contentW });
        ty += lineH;
      };

      const addDivider = () => {
        if (ty > 770) { doc.addPage(); ty = 40; }
        ty += 3;
        doc.strokeColor(COLORS.grayBorder).lineWidth(0.5)
          .moveTo(margin, ty).lineTo(margin + contentW, ty).stroke();
        ty += 8;
      };

      // RESUMO
      addSection("RESUMO");
      addLine(`Vendas: ${stats.vendas} | Fat: ${fmtBRL(stats.fat)} | Lucro: ${fmtBRL(stats.lucro)}`, true);
      addLine(`Margem: ${fmtPct(stats.margem)} | Gastos Op: ${fmtBRL(stats.gastosOp)} | Pgto Fornec: ${fmtBRL(stats.fornecedor)} | Ticket: ${fmtBRL(stats.ticket)}`);

      addDivider();

      // CLIENTES E FORMAS DE PAGAMENTO
      addSection("CLIENTES E FORMAS DE PAGAMENTO");
      addLine(`> Clientes únicos: ${stats.clientesUnicos} | Ticket médio: ${fmtBRL(stats.ticket)}`);
      addLine(`> PIX: ${stats.pix.length} (${stats.vendas > 0 ? Math.round(stats.pix.length / stats.vendas * 100) : 0}%) | Cartão 1x: ${stats.cartao1x.length} (${stats.vendas > 0 ? Math.round(stats.cartao1x.length / stats.vendas * 100) : 0}%)`);
      addLine(`> Parcelado: ${stats.parcelado.length} (${stats.vendas > 0 ? Math.round(stats.parcelado.length / stats.vendas * 100) : 0}%, média ${stats.mediaParcelas.toFixed(1)}x) | Dinheiro: ${stats.dinheiro.length}`);

      addDivider();

      // POR TIPO
      addSection("POR TIPO");
      const atacadoLucro = stats.atacado.reduce((s, x) => s + Number(x.lucro || 0), 0);
      const atacadoFat = stats.atacado.reduce((s, x) => s + Number(x.preco_vendido || 0), 0);
      const cfLucro = stats.cf.reduce((s, x) => s + Number(x.lucro || 0), 0);
      const cfFat = stats.cf.reduce((s, x) => s + Number(x.preco_vendido || 0), 0);
      const upgLucro = stats.upgrade.reduce((s, x) => s + Number(x.lucro || 0), 0);
      const upgFat = stats.upgrade.reduce((s, x) => s + Number(x.preco_vendido || 0), 0);

      addLine(`> Atacado: ${stats.atacado.length} vendas | Fat: ${fmtBRL(atacadoFat)} | Lucro: ${fmtBRL(atacadoLucro)} | M: ${atacadoFat > 0 ? fmtPct(atacadoLucro / atacadoFat * 100) : "0%"}`, false, COLORS.purple);
      addLine(`> Cliente Final: ${stats.cf.length} vendas | Fat: ${fmtBRL(cfFat)} | Lucro: ${fmtBRL(cfLucro)} | M: ${cfFat > 0 ? fmtPct(cfLucro / cfFat * 100) : "0%"}`, false, COLORS.blue);
      addLine(`> Upgrade: ${stats.upgrade.length} vendas | Fat: ${fmtBRL(upgFat)} | Lucro: ${fmtBRL(upgLucro)} | M: ${upgFat > 0 ? fmtPct(upgLucro / upgFat * 100) : "0%"}`, false, COLORS.green);

      addDivider();

      // MELHOR E PIOR DIA
      addSection("MELHOR E PIOR DIA");
      const diasComVendas = diasOrdenados.filter(([, info]) => info.vendas.length > 0);
      if (diasComVendas.length > 0) {
        const melhor = diasComVendas.reduce((a, b) => a[1].fat > b[1].fat ? a : b);
        const pior = diasComVendas.reduce((a, b) => a[1].fat < b[1].fat ? a : b);
        addLine(`>>> Melhor: ${dateToDiaSemana(melhor[0])} ${dateToDay(melhor[0])} | Fat: ${fmtBRL(melhor[1].fat)} | Lucro: ${fmtBRL(melhor[1].lucro)}`, true, COLORS.green);
        addLine(`>>> Pior: ${dateToDiaSemana(pior[0])} ${dateToDay(pior[0])} | Fat: ${fmtBRL(pior[1].fat)} | Lucro: ${fmtBRL(pior[1].lucro)}`, true, COLORS.red);
      }

      addDivider();

      // POR DIA
      addSection("POR DIA");
      for (const [data, info] of diasOrdenados) {
        const m = info.fat > 0 ? fmtPct(info.margem) : "0.0%";
        addLine(`> ${dateToDiaSemana(data)} ${dateToDay(data)}: ${info.vendas.length} vendas | Fat: ${fmtBRL(info.fat)} | Lucro: ${fmtBRL(info.lucro)} | M: ${m}`);
      }

      addDivider();

      // TOP 10 MODELOS MAIS VENDIDOS
      addSection("TOP 10 MODELOS MAIS VENDIDOS");
      const top10 = stats.topModelos.slice(0, 10);
      top10.forEach(([modelo, info], i) => {
        addLine(`${i + 1}. ${modelo} | ${info.qty}x | Lucro: ${fmtBRL(info.lucro)} | M: ${Math.round(info.margem)}%`);
      });

      addDivider();

      // ESTOQUE CRÍTICO
      if (stats.estoqueCritico.length > 0) {
        addSection("ESTOQUE CRÍTICO (produtos vendidos na semana)");
        for (const p of stats.estoqueCritico.slice(0, 15)) {
          addLine(`>>> ${p}: 0 un.`, false, COLORS.red);
        }
        if (stats.estoqueCritico.length > 15) {
          addLine(` + ${stats.estoqueCritico.length - 15} outros produtos zerados (não vendidos na semana)`, false, COLORS.textMuted);
        }
        addDivider();
      }

      // POR BANCO
      addSection("POR BANCO");
      for (const [banco, info] of Object.entries(stats.porBanco).sort((a, b) => b[1].fat - a[1].fat)) {
        const label = banco === "INFINITE" ? "InfinitePay" : banco === "MERCADO_PAGO" ? "Mercado Pago" : banco === "ITAU" ? "Itaú" : banco;
        addLine(`> ${label}: ${fmtBRL(info.fat)} | Lucro: ${fmtBRL(info.lucro)}`);
      }

      // Footer
      doc.fontSize(7).font("Helvetica").fillColor(COLORS.textMuted);
      doc.text(`Gerado em ${now} — Tigrão Imports`, margin, 800, { width: contentW, align: "center" });
    }

    // ============================================
    // COMPARATIVE PAGE (if multiple weeks)
    // ============================================
    if (config.semanas.length >= 2 && config.comparativo) {
      doc.addPage();

      doc.rect(0, 0, pageW, 35).fill(COLORS.headerBg);
      doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.accent);
      doc.text("ANÁLISE COMPARATIVA", margin, 10, { width: contentW, align: "center" });

      let ty = 50;
      const lineH = 12;

      const allStats = config.semanas.map(s => computeWeekStats(s));

      // INSIGHTS PRINCIPAIS
      doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.text);
      doc.text("INSIGHTS PRINCIPAIS", margin, ty); ty += 18;

      if (allStats.length >= 2) {
        const s1 = allStats[allStats.length - 2];
        const s2 = allStats[allStats.length - 1];

        const fatDelta = s2.fat - s1.fat;
        const fatPct = s1.fat > 0 ? ((fatDelta / s1.fat) * 100).toFixed(1) : "0";
        const fatColor = fatDelta >= 0 ? COLORS.green : COLORS.red;
        doc.fontSize(8).font("Helvetica-Bold").fillColor(fatColor);
        doc.text(`► Faturamento: ${fmtBRL(s2.fat)} (S1: ${fmtBRL(s1.fat)}) | Delta: ${fmtBRL(fatDelta)} (${fatPct}%)`, margin + 5, ty, { width: contentW - 10 });
        ty += lineH + 4;

        // Mix alterado
        const atacadoPctS1 = s1.vendas > 0 ? Math.round(s1.atacado.length / s1.vendas * 100) : 0;
        const atacadoPctS2 = s2.vendas > 0 ? Math.round(s2.atacado.length / s2.vendas * 100) : 0;
        if (Math.abs(atacadoPctS2 - atacadoPctS1) >= 5) {
          doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.orange);
          doc.text(`► Mix alterado: Atacado S1=${atacadoPctS1}% -> S2=${atacadoPctS2}% | Shift de ${Math.abs(atacadoPctS2 - atacadoPctS1)}pp`, margin + 5, ty, { width: contentW - 10 });
          ty += lineH + 4;
        }

        // Projeção mensal
        const diasComVendasTotal = allStats.reduce((s, st) => {
          const dias = Object.values(st.porDia).filter(d => d.vendas.length > 0).length;
          return s + dias;
        }, 0);
        const fatTotal = allStats.reduce((s, st) => s + st.fat, 0);
        const lucroTotal = allStats.reduce((s, st) => s + st.lucro, 0);
        const projecaoFat = diasComVendasTotal > 0 ? (fatTotal / diasComVendasTotal) * 30 : 0;
        const projecaoLucro = diasComVendasTotal > 0 ? (lucroTotal / diasComVendasTotal) * 30 : 0;

        doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.blue);
        doc.text(`► Projeção mensal: ${fmtBRL(projecaoFat)} faturamento, ${fmtBRL(projecaoLucro)} lucro (base ${diasComVendasTotal} dias com vendas)`, margin + 5, ty, { width: contentW - 10 });
        ty += lineH + 8;

        // TOP 3 MODELOS POR LUCRO
        doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.text);
        doc.text("TOP 3 MODELOS POR LUCRO", margin, ty); ty += 18;

        for (let wi = 0; wi < allStats.length; wi++) {
          const st = allStats[wi];
          doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.text);
          doc.text(`Semana ${wi + 1}:`, margin + 5, ty); ty += lineH;

          const top3 = st.topModelos.slice(0, 3);
          for (const [modelo, info] of top3) {
            doc.fontSize(8).font("Helvetica").fillColor(COLORS.text);
            doc.text(`    ${modelo} | Lucro: ${fmtBRL(info.lucro)} | Fat: ${fmtBRL(info.fat)} | M: ${Math.round(info.margem)}%`, margin + 10, ty, { width: contentW - 20 });
            ty += lineH;
          }
          ty += 4;
        }

        ty += 8;

        // TABELA COMPARATIVA DE KPIs
        doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.text);
        doc.text("TABELA COMPARATIVA DE KPIs", margin, ty); ty += 18;

        // Table header
        const cols = [120, 100, 100, 90, 60];
        const headers = ["Métrica", "S1", "S2", "Delta", "Var %"];
        doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.blue);
        let tx = margin;
        headers.forEach((h, i) => {
          doc.text(h, tx, ty, { width: cols[i] });
          tx += cols[i];
        });
        ty += lineH + 4;

        // Divider
        doc.strokeColor(COLORS.grayBorder).lineWidth(0.5)
          .moveTo(margin, ty - 2).lineTo(margin + contentW, ty - 2).stroke();

        const rows = [
          { m: "Faturamento", v1: fmtBRL(s1.fat), v2: fmtBRL(s2.fat), d: fmtBRL(fatDelta), p: `${fatPct}%` },
          { m: "Lucro", v1: fmtBRL(s1.lucro), v2: fmtBRL(s2.lucro), d: fmtBRL(s2.lucro - s1.lucro), p: `${s1.lucro > 0 ? ((s2.lucro - s1.lucro) / s1.lucro * 100).toFixed(1) : 0}%` },
          { m: "Vendas", v1: String(s1.vendas), v2: String(s2.vendas), d: String(s2.vendas - s1.vendas), p: `${s1.vendas > 0 ? ((s2.vendas - s1.vendas) / s1.vendas * 100).toFixed(1) : 0}%` },
          { m: "Margem %", v1: fmtPct(s1.margem), v2: fmtPct(s2.margem), d: `${(s2.margem - s1.margem).toFixed(1)}pp`, p: "" },
          { m: "Ticket Médio", v1: fmtBRL(s1.ticket), v2: fmtBRL(s2.ticket), d: fmtBRL(s2.ticket - s1.ticket), p: `${s1.ticket > 0 ? ((s2.ticket - s1.ticket) / s1.ticket * 100).toFixed(1) : 0}%` },
          { m: "Gastos", v1: fmtBRL(s1.gastosOp + s1.fornecedor), v2: fmtBRL(s2.gastosOp + s2.fornecedor), d: fmtBRL((s2.gastosOp + s2.fornecedor) - (s1.gastosOp + s1.fornecedor)), p: `${(s1.gastosOp + s1.fornecedor) > 0 ? (((s2.gastosOp + s2.fornecedor) - (s1.gastosOp + s1.fornecedor)) / (s1.gastosOp + s1.fornecedor) * 100).toFixed(1) : 0}%` },
        ];

        doc.font("Helvetica").fontSize(8);
        for (const row of rows) {
          tx = margin;
          doc.fillColor(COLORS.text).text(row.m, tx, ty, { width: cols[0] }); tx += cols[0];
          doc.text(row.v1, tx, ty, { width: cols[1] }); tx += cols[1];
          doc.text(row.v2, tx, ty, { width: cols[2] }); tx += cols[2];

          const deltaVal = parseFloat(row.d.replace(/[^0-9.,-]/g, "").replace(",", "."));
          doc.fillColor(deltaVal >= 0 ? COLORS.green : COLORS.red);
          doc.text(row.d, tx, ty, { width: cols[3] }); tx += cols[3];
          doc.text(row.p, tx, ty, { width: cols[4] });
          doc.fillColor(COLORS.text);
          ty += lineH;
        }

        ty += 12;

        // SUGESTÕES DE AÇÃO
        doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.text);
        doc.text("SUGESTÕES DE AÇÃO", margin, ty); ty += 18;

        doc.fontSize(8).font("Helvetica");
        if (fatDelta < 0) {
          doc.fillColor(COLORS.red);
          doc.text(`[!] Queda de ${Math.abs(parseFloat(fatPct)).toFixed(1)}% no faturamento: Investigar causas — menos vendas, ticket menor ou mix diferente?`, margin + 5, ty, { width: contentW - 10 });
          ty += lineH + 2;
        }

        const lucroDelta = s2.lucro - s1.lucro;
        if (lucroDelta < 0) {
          doc.fillColor(COLORS.red);
          const lucroPct = s1.lucro > 0 ? (lucroDelta / s1.lucro * 100).toFixed(1) : "0";
          doc.text(`[!] Lucro caiu ${Math.abs(parseFloat(lucroPct))}%: Revisar margem dos top produtos e descontos concedidos`, margin + 5, ty, { width: contentW - 10 });
          ty += lineH + 2;
        }

        if (s2.clientesUnicos < s1.clientesUnicos) {
          doc.fillColor(COLORS.orange);
          doc.text(`[!] Menos clientes únicos: ${s2.clientesUnicos} vs ${s1.clientesUnicos} — verificar captação`, margin + 5, ty, { width: contentW - 10 });
          ty += lineH + 2;
        }

        const s2Stats = allStats[allStats.length - 1];
        if (s2Stats.estoqueCritico.length > 0) {
          doc.fillColor(COLORS.orange);
          doc.text(`[!] ${s2Stats.estoqueCritico.length} produtos vendidos na semana estão zerados em estoque — reabastecer urgente`, margin + 5, ty, { width: contentW - 10 });
          ty += lineH + 2;
        }
      }

      // Footer
      const now = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      doc.fontSize(7).font("Helvetica").fillColor(COLORS.textMuted);
      doc.text(`Gerado em ${now} — Tigrão Imports`, margin, 800, { width: contentW, align: "center" });
    }

    doc.end();
  });
}

// ============================================
// Monthly Report — PDF Completo
// ============================================

export interface MonthlyReportData {
  mes: string; // "Marco 2026"
  vendas: VendaSemana[];
  gastos: GastoSemana[];
  patrimonio?: { produtos: number; itau: number; infinite: number; mp: number; especie: number };
  retiradaLucro?: number;
}

export async function generateMonthlyPDF(data: MonthlyReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 30, info: { Title: `Relatorio Mensal - ${data.mes}`, Author: "TigraoImports" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 535; // content width (A4 - 2*30)
    const margin = 30;

    // Aggregations
    const totalVendas = data.vendas.length;
    const totalFat = data.vendas.reduce((s, v) => s + v.preco_vendido, 0);
    const totalCusto = data.vendas.reduce((s, v) => s + v.custo, 0);
    const totalLucro = data.vendas.reduce((s, v) => s + v.lucro, 0);
    const margemMedia = totalFat > 0 ? (totalLucro / totalFat * 100) : 0;

    // Gastos sem fornecedor e sem retirada
    const fornecedor = data.gastos.filter(g => g.categoria === "FORNECEDOR").reduce((s, g) => s + g.valor, 0);
    const transferencias = data.gastos.filter(g => g.categoria === "TRANSFERENCIA").reduce((s, g) => s + g.valor, 0);
    const retirada = data.retiradaLucro || 0;
    const gastosSemFornecedor = data.gastos.reduce((s, g) => s + g.valor, 0) - fornecedor;
    const gastosOperacionais = gastosSemFornecedor - retirada - transferencias;
    const lucroLiquido = totalLucro - gastosOperacionais;

    // By type
    const byTipo: Record<string, { qty: number; fat: number; lucro: number }> = {};
    data.vendas.forEach(v => {
      const t = v.tipo || "VENDA";
      if (!byTipo[t]) byTipo[t] = { qty: 0, fat: 0, lucro: 0 };
      byTipo[t].qty++; byTipo[t].fat += v.preco_vendido; byTipo[t].lucro += v.lucro;
    });

    // By forma
    const byForma: Record<string, number> = {};
    data.vendas.forEach(v => { byForma[v.forma || "OUTRO"] = (byForma[v.forma || "OUTRO"] || 0) + 1; });

    // By origem
    const byOrigem: Record<string, number> = {};
    data.vendas.forEach(v => { byOrigem[v.origem || "N/I"] = (byOrigem[v.origem || "N/I"] || 0) + 1; });

    // Top 10 produtos
    const byProduto: Record<string, number> = {};
    data.vendas.forEach(v => { const p = (v.produto || "").replace(/\s+(VC|LL|J|BE|BR|HN).*$/i, "").trim(); byProduto[p] = (byProduto[p] || 0) + 1; });
    const top10Prod = Object.entries(byProduto).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Top clientes CF vs Atacado
    const clientesCF: Record<string, { qty: number; lucro: number; fat: number }> = {};
    const clientesAT: Record<string, { qty: number; lucro: number; fat: number }> = {};
    data.vendas.forEach(v => {
      const c = (v.cliente || "Desconhecido").toUpperCase().trim();
      const target = v.tipo === "ATACADO" ? clientesAT : clientesCF;
      if (!target[c]) target[c] = { qty: 0, lucro: 0, fat: 0 };
      target[c].qty++; target[c].lucro += v.lucro; target[c].fat += v.preco_vendido;
    });
    const top10CF = Object.entries(clientesCF).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
    const top10AT = Object.entries(clientesAT).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);

    // By day
    const byDay: Record<string, { qty: number; fat: number; lucro: number }> = {};
    data.vendas.forEach(v => {
      if (!byDay[v.data]) byDay[v.data] = { qty: 0, fat: 0, lucro: 0 };
      byDay[v.data].qty++; byDay[v.data].fat += v.preco_vendido; byDay[v.data].lucro += v.lucro;
    });

    // Regiões (bairro) — só cliente final e upgrade (exclui atacado e sem bairro)
    const byRegiao: Record<string, { qty: number; fat: number; lucro: number }> = {};
    data.vendas.forEach(v => {
      if (v.tipo === "ATACADO") return;
      const bairro = ((v as unknown as { bairro?: string }).bairro || "").trim().toUpperCase();
      if (!bairro || bairro === "-" || bairro === "N/A") return;
      if (!byRegiao[bairro]) byRegiao[bairro] = { qty: 0, fat: 0, lucro: 0 };
      byRegiao[bairro].qty++; byRegiao[bairro].fat += v.preco_vendido; byRegiao[bairro].lucro += v.lucro;
    });
    const topRegioes = Object.entries(byRegiao).sort((a, b) => b[1].qty - a[1].qty).slice(0, 12);

    // Gastos by category
    const gastosByCat: Record<string, number> = {};
    data.gastos.forEach(g => {
      if (g.categoria === "FORNECEDOR" || g.categoria === "TRANSFERENCIA") return;
      const cat = g.categoria === "SALARIO" ? (g.descricao?.toUpperCase().includes("RETIRADA") ? "RETIRADA" : "SALARIO FUNC") : g.categoria;
      if (cat === "RETIRADA") return;
      gastosByCat[cat] = (gastosByCat[cat] || 0) + g.valor;
    });

    // Helpers
    const fmt = (n: number) => fmtBRL(n);
    const fmtS = (n: number) => fmtBRLShort(n);
    let pageNum = 0;

    function header(title: string) {
      pageNum++;
      if (pageNum > 1) doc.addPage();
      // Orange bar
      doc.save();
      doc.rect(0, 0, 595, 55).fill(COLORS.accent);
      doc.fontSize(18).font("Helvetica-Bold").fillColor("#FFFFFF").text("TigraoImports", margin, 12);
      doc.fontSize(9).font("Helvetica").text(`Relatorio Financeiro — ${data.mes}`, margin, 33);
      doc.fontSize(11).font("Helvetica-Bold").text(title, 595 - margin - 200, 20, { width: 200, align: "right" });
      doc.restore();
      doc.y = 70;
    }

    function footer() {
      const now = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      doc.fontSize(7).font("Helvetica").fillColor(COLORS.textMuted);
      doc.text(`Gerado em ${now} — TigraoImports — Confidencial`, margin, 810, { width: W, align: "center" });
      doc.text(`Pagina ${pageNum}`, margin, 810, { width: W, align: "right" });
    }

    function section(title: string) {
      if (doc.y > 750) { footer(); header(title); }
      doc.fontSize(12).font("Helvetica-Bold").fillColor(COLORS.text).text(title, margin, doc.y + 5);
      doc.moveTo(margin, doc.y + 3).lineTo(margin + title.length * 6.5, doc.y + 3).lineWidth(2).strokeColor(COLORS.accent).stroke();
      doc.y += 10;
      doc.lineWidth(1);
    }

    function kpiRow(items: { label: string; value: string; color?: string }[]) {
      const cardW = W / items.length - 5;
      const y0 = doc.y;
      items.forEach((item, i) => {
        const x = margin + i * (cardW + 5);
        doc.save();
        doc.roundedRect(x, y0, cardW, 48, 4).lineWidth(0.5).strokeColor(COLORS.grayBorder).fillAndStroke("#FAFAFA", COLORS.grayBorder);
        doc.fontSize(7).font("Helvetica").fillColor(COLORS.textMuted).text(item.label, x + 8, y0 + 6, { width: cardW - 16 });
        doc.fontSize(14).font("Helvetica-Bold").fillColor(item.color || COLORS.text).text(item.value, x + 8, y0 + 20, { width: cardW - 16 });
        doc.restore();
      });
      doc.y = y0 + 55;
    }

    function tableRow(cols: { text: string; width: number; bold?: boolean; color?: string; align?: string }[]) {
      const y0 = doc.y;
      cols.forEach(col => {
        doc.fontSize(8).font(col.bold ? "Helvetica-Bold" : "Helvetica").fillColor(col.color || COLORS.text);
        const x = margin + cols.slice(0, cols.indexOf(col)).reduce((s, c) => s + c.width, 0);
        if (col.align === "right") {
          doc.text(col.text, x, y0, { width: col.width - 5, align: "right" });
        } else {
          doc.text(col.text, x, y0, { width: col.width });
        }
      });
      doc.y = y0 + 14;
    }

    function hLine() {
      doc.moveTo(margin, doc.y).lineTo(margin + W, doc.y).strokeColor(COLORS.grayBorder).stroke();
      doc.y += 5;
    }

    function barInline(x: number, y: number, w: number, h: number, ratio: number, color: string) {
      doc.save();
      doc.roundedRect(x, y, w, h, 3).fill("#F0F0F0");
      if (ratio > 0) doc.roundedRect(x, y, Math.max(w * ratio, 6), h, 3).fill(color);
      doc.restore();
    }

    // ===== PAGE 1: RESUMO EXECUTIVO =====
    header("Resumo Executivo");

    kpiRow([
      { label: "Faturamento", value: fmtS(totalFat), color: COLORS.blue },
      { label: "Custo Total", value: fmtS(totalCusto) },
      { label: "Lucro Bruto", value: fmt(totalLucro), color: COLORS.green },
      { label: "Lucro Liquido", value: fmt(lucroLiquido), color: lucroLiquido > 0 ? COLORS.green : COLORS.red },
    ]);

    kpiRow([
      { label: "Total Vendas", value: String(totalVendas) },
      { label: "Ticket Medio", value: fmt(totalFat / (totalVendas || 1)) },
      { label: "Margem Media", value: fmtPct(margemMedia) },
      { label: "Media Diaria Lucro", value: fmt(totalLucro / 31), color: COLORS.green },
    ]);

    // Tipos de venda
    section("Resultado por Tipo de Venda");
    const tipoLabels: Record<string, string> = { VENDA: "Venda Normal", ATACADO: "Atacado", UPGRADE: "Upgrade (Troca)" };
    const tipoColors: Record<string, string> = { VENDA: COLORS.blue, ATACADO: COLORS.purple, UPGRADE: COLORS.green };
    for (const tipo of ["VENDA", "UPGRADE", "ATACADO"]) {
      const info = byTipo[tipo] || { qty: 0, fat: 0, lucro: 0 };
      tableRow([
        { text: tipoLabels[tipo] || tipo, width: 160, bold: true },
        { text: `${info.qty} vendas`, width: 80 },
        { text: `Fat: ${fmt(info.fat)}`, width: 130 },
        { text: `Lucro: ${fmt(info.lucro)}`, width: 130, bold: true, color: COLORS.green },
      ]);
    }
    doc.y += 5;

    // Formas de pagamento
    section("Formas de Pagamento");
    const maxForma = Math.max(...Object.values(byForma));
    for (const [forma, qty] of Object.entries(byForma).sort((a, b) => b[1] - a[1])) {
      const pct = qty / totalVendas * 100;
      const y0 = doc.y;
      doc.fontSize(9).font("Helvetica").fillColor(COLORS.text).text(forma, margin, y0, { width: 100 });
      doc.text(`${qty} (${pct.toFixed(0)}%)`, margin + 100, y0, { width: 80 });
      barInline(margin + 200, y0, 200, 12, qty / maxForma, COLORS.blue);
      doc.y = y0 + 17;
    }
    doc.y += 5;

    // Origens
    section("Origem das Vendas");
    const origLabels: Record<string, string> = { RECOMPRA: "Recompra", ATACADO: "Atacado", INDICACAO: "Indicacao", ANUNCIO: "Anuncio", NAO_INFORMARAM: "N/I" };
    const maxOrig = Math.max(...Object.values(byOrigem));
    for (const [orig, qty] of Object.entries(byOrigem).sort((a, b) => b[1] - a[1])) {
      const y0 = doc.y;
      doc.fontSize(9).font("Helvetica").fillColor(COLORS.text).text(origLabels[orig] || orig, margin, y0, { width: 120 });
      doc.text(`${qty} (${(qty / totalVendas * 100).toFixed(0)}%)`, margin + 120, y0, { width: 80 });
      barInline(margin + 220, y0, 180, 12, qty / maxOrig, COLORS.accent);
      doc.y = y0 + 17;
    }

    footer();

    // ===== PAGE 2: PRODUTOS E GASTOS =====
    header("Produtos e Gastos");

    section("Top 10 Produtos Mais Vendidos");
    const maxProdQty = top10Prod[0]?.[1] || 1;
    top10Prod.forEach(([nome, qty], i) => {
      const y0 = doc.y;
      doc.fontSize(8).font(i < 3 ? "Helvetica-Bold" : "Helvetica").fillColor(COLORS.text);
      doc.text(`${i + 1}. ${nome.substring(0, 42)}`, margin, y0, { width: 320 });
      doc.text(`${qty}x`, margin + 330, y0, { width: 30 });
      barInline(margin + 370, y0, 130, 11, qty / maxProdQty, i < 3 ? COLORS.accent : COLORS.grayBorder);
      doc.y = y0 + 15;
    });
    doc.y += 10;

    // Gastos
    section("Gastos Operacionais");
    const maxGasto = Math.max(...Object.values(gastosByCat), 1);
    for (const [cat, val] of Object.entries(gastosByCat).sort((a, b) => b[1] - a[1])) {
      const y0 = doc.y;
      doc.fontSize(8).font("Helvetica").fillColor(COLORS.text).text(cat, margin, y0, { width: 140 });
      doc.text(fmt(val), margin + 150, y0, { width: 80, align: "right" });
      barInline(margin + 250, y0, 200, 11, val / maxGasto, COLORS.red);
      doc.y = y0 + 15;
    }
    doc.y += 3;
    hLine();
    doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.text).text("Total Gastos Operacionais", margin, doc.y);
    doc.fillColor(COLORS.red).text(fmt(gastosOperacionais), margin + 150, doc.y - 12, { width: 80, align: "right" });
    doc.y += 15;

    // DRE
    section("DRE Simplificado");
    const dreItems: [string, number, string][] = [
      ["(+) Faturamento Bruto", totalFat, COLORS.text],
      ["(-) Custo dos Produtos", totalCusto, COLORS.textLight],
      ["(=) Lucro Bruto", totalLucro, COLORS.green],
      ["(-) Gastos Operacionais", gastosOperacionais, COLORS.red],
      ["(=) LUCRO LIQUIDO", lucroLiquido, lucroLiquido > 0 ? COLORS.green : COLORS.red],
    ];
    if (retirada > 0) {
      dreItems.push(["", 0, ""]);
      dreItems.push(["(-) Distribuicao de Lucros", retirada, COLORS.accent]);
      dreItems.push(["(=) RESULTADO FINAL", lucroLiquido - retirada, (lucroLiquido - retirada) >= 0 ? COLORS.green : COLORS.red]);
    }
    for (const [label, val, color] of dreItems) {
      if (!label) { doc.y += 5; continue; }
      const bold = label.includes("LUCRO") || label.includes("Bruto") || label.includes("RESULTADO");
      doc.fontSize(bold ? 10 : 9).font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(color);
      doc.text(label, margin, doc.y, { continued: false });
      doc.text(fmt(Math.abs(val)), margin + 250, doc.y - 12, { width: 150, align: "right" });
      if (bold) { doc.moveTo(margin, doc.y + 2).lineTo(margin + 400, doc.y + 2).strokeColor(COLORS.accent).stroke(); }
      doc.y += 5;
    }

    footer();

    // ===== PAGE 3: CLIENTES =====
    header("Clientes");

    section("Top 10 Clientes — Cliente Final");
    tableRow([
      { text: "#", width: 20, bold: true, color: COLORS.textMuted },
      { text: "CLIENTE", width: 220, bold: true, color: COLORS.textMuted },
      { text: "QTD", width: 40, bold: true, color: COLORS.textMuted },
      { text: "FATURAMENTO", width: 100, bold: true, color: COLORS.textMuted, align: "right" },
      { text: "LUCRO", width: 100, bold: true, color: COLORS.textMuted, align: "right" },
    ]);
    hLine();
    top10CF.forEach(([nome, info], i) => {
      tableRow([
        { text: `${i + 1}`, width: 20, bold: i < 3 },
        { text: nome.substring(0, 35), width: 220, bold: i < 3 },
        { text: `${info.qty}x`, width: 40 },
        { text: fmt(info.fat), width: 100, align: "right" },
        { text: fmt(info.lucro), width: 100, bold: true, color: COLORS.green, align: "right" },
      ]);
    });
    doc.y += 15;

    section("Top 10 Clientes — Atacado");
    tableRow([
      { text: "#", width: 20, bold: true, color: COLORS.textMuted },
      { text: "CLIENTE", width: 220, bold: true, color: COLORS.textMuted },
      { text: "QTD", width: 40, bold: true, color: COLORS.textMuted },
      { text: "FATURAMENTO", width: 100, bold: true, color: COLORS.textMuted, align: "right" },
      { text: "LUCRO", width: 100, bold: true, color: COLORS.textMuted, align: "right" },
    ]);
    hLine();
    top10AT.forEach(([nome, info], i) => {
      tableRow([
        { text: `${i + 1}`, width: 20, bold: i < 3 },
        { text: nome.substring(0, 35), width: 220, bold: i < 3 },
        { text: `${info.qty}x`, width: 40 },
        { text: fmt(info.fat), width: 100, align: "right" },
        { text: fmt(info.lucro), width: 100, bold: true, color: COLORS.accent, align: "right" },
      ]);
    });

    footer();

    // ===== PAGE 4: VENDAS DIARIAS =====
    header("Vendas Diarias");
    section(`Desempenho Diario — ${data.mes}`);

    tableRow([
      { text: "DIA", width: 70, bold: true, color: COLORS.textMuted },
      { text: "QTD", width: 40, bold: true, color: COLORS.textMuted },
      { text: "FATURAMENTO", width: 100, bold: true, color: COLORS.textMuted, align: "right" },
      { text: "LUCRO", width: 100, bold: true, color: COLORS.textMuted, align: "right" },
      { text: "MARGEM", width: 60, bold: true, color: COLORS.textMuted },
      { text: "", width: 130 },
    ]);
    hLine();

    const maxDayFat = Math.max(...Object.values(byDay).map(d => d.fat), 1);
    for (const [dia, dados] of Object.entries(byDay).sort()) {
      if (doc.y > 760) { footer(); header("Vendas Diarias (cont.)"); }
      const mg = dados.fat > 0 ? (dados.lucro / dados.fat * 100) : 0;
      const y0 = doc.y;
      doc.fontSize(8).font("Helvetica").fillColor(COLORS.text);
      doc.text(`${dia.split("-")[2]}/${dia.split("-")[1]} ${dateToDiaSemana(dia)}`, margin, y0, { width: 70 });
      doc.text(String(dados.qty), margin + 70, y0, { width: 40 });
      doc.text(fmt(dados.fat), margin + 110, y0, { width: 100, align: "right" });
      doc.fillColor(dados.lucro > 0 ? COLORS.green : COLORS.red).text(fmt(dados.lucro), margin + 210, y0, { width: 100, align: "right" });
      doc.fillColor(COLORS.text).text(fmtPct(mg), margin + 310, y0, { width: 60 });
      barInline(margin + 380, y0, 120, 10, dados.fat / maxDayFat, COLORS.accent);
      doc.y = y0 + 14;
    }

    // Patrimônio (if available)
    if (data.patrimonio) {
      if (doc.y > 650) { footer(); header("Patrimonio"); }
      doc.y += 10;
      section(`Patrimonio — Inicio ${data.mes.split(" ")[0] === "Marco" ? "Abril" : ""} 2026`);
      const p = data.patrimonio;
      const totalContas = p.itau + p.infinite + p.mp + p.especie;
      const totalPat = p.produtos + totalContas;
      const patItems: [string, string][] = [
        ["Capital em Produtos", fmt(p.produtos)],
        ["Saldo Itau", fmt(p.itau)],
        ["Saldo InfinitePay", fmt(p.infinite)],
        ["Saldo Mercado Pago", fmt(p.mp)],
        ["Saldo Especie", fmt(p.especie)],
        ["Total em Contas", fmt(totalContas)],
        ["PATRIMONIO TOTAL", fmt(totalPat)],
      ];
      for (const [label, value] of patItems) {
        const isPat = label.includes("PATRIMONIO");
        const isTot = label.includes("Total em Contas");
        doc.fontSize(isPat ? 11 : 9).font(isPat || isTot ? "Helvetica-Bold" : "Helvetica");
        doc.fillColor(isPat ? COLORS.accent : isTot ? COLORS.blue : COLORS.text);
        doc.text(label, margin, doc.y, { continued: false });
        doc.text(value, margin + 250, doc.y - (isPat ? 14 : 12), { width: 150, align: "right" });
        if (isPat) { doc.moveTo(margin, doc.y + 2).lineTo(margin + 400, doc.y + 2).lineWidth(2).strokeColor(COLORS.accent).stroke(); doc.lineWidth(1); }
        doc.y += 3;
      }
    }

    footer();
    doc.end();
  });
}
