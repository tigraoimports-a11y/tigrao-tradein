// scripts/gerar-pdf-melhorias.mjs
// Gera um PDF explicativo das melhorias entregues pra enviar pra equipe.
// Uso: node scripts/gerar-pdf-melhorias.mjs
import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

const OUT_PATH = path.resolve(process.argv[2] || "/tmp/melhorias-tigrao.pdf");

// Paleta
const C = {
  primary: "#E8740E",
  primaryLight: "#FFF5EB",
  dark: "#1A1A2E",
  text: "#1D1D1F",
  textMuted: "#86868B",
  border: "#D2D2D7",
  cardBg: "#F9F9FB",
  green: "#2ECC71",
  blue: "#007AFF",
};

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 50, bottom: 50, left: 50, right: 50 },
  bufferPages: true,
  info: {
    Title: "Melhorias TigrãoImports — abril 2026",
    Author: "TigrãoImports",
    Subject: "Resumo das melhorias no sistema interno",
  },
});

doc.pipe(fs.createWriteStream(OUT_PATH));

const pageW = doc.page.width;
const contentW = pageW - 100;
const leftM = 50;

// ─── Capa ───────────────────────────────────────────────
doc.rect(0, 0, pageW, 200).fill(C.dark);
doc.fillColor("#FFFFFF").fontSize(12).font("Helvetica");
doc.text("TIGRÃO IMPORTS  //  Sistema Interno", leftM, 40, { width: contentW });

doc.fontSize(32).font("Helvetica-Bold");
doc.text("Melhorias entregues", leftM, 70, { width: contentW });

doc.fontSize(16).font("Helvetica").fillColor(C.primary);
doc.text("Abril / 2026  —  18 novas funcionalidades", leftM, 115, { width: contentW });

doc.fontSize(11).font("Helvetica").fillColor("#CCCCCC");
doc.text(
  "Este documento resume tudo que foi adicionado no sistema interno. Cada item traz uma explicação prática de como usar no dia a dia.",
  leftM, 150, { width: contentW - 20, align: "justify" }
);

doc.fillColor(C.text);
let y = 230;

// ─── Sumário visual (ícones de seção usando texto/letra em círculo laranja) ───
function sectionIcon(label) {
  // Desenha um quadrado laranja com a letra/número em branco
  const size = 26;
  doc.roundedRect(leftM, y - 2, size, size, 4).fill(C.primary);
  doc.fillColor("#FFFFFF").fontSize(13).font("Helvetica-Bold");
  doc.text(label, leftM, y + 4, { width: size, align: "center" });
}

function section(marker, title) {
  y = ensureSpace(y, 60);
  sectionIcon(marker);
  doc.fontSize(17).font("Helvetica-Bold").fillColor(C.dark);
  doc.text(title, leftM + 36, y + 3, { width: contentW - 36 });
  // Linha fina abaixo
  doc.moveTo(leftM, y + 32).lineTo(leftM + contentW, y + 32).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 44;
}

function item(title, description, howTo) {
  y = ensureSpace(y, 80);

  // Bullet laranja no início
  doc.circle(leftM + 4, y + 6, 2.5).fill(C.primary);

  doc.fontSize(11.5).font("Helvetica-Bold").fillColor(C.text);
  doc.text(title, leftM + 14, y, { width: contentW - 14 });
  y = doc.y + 4;

  doc.fontSize(10).font("Helvetica").fillColor(C.textMuted);
  doc.text(description, leftM + 14, y, { width: contentW - 14, lineGap: 2, align: "justify" });
  y = doc.y + 6;

  if (howTo) {
    const howX = leftM + 14;
    const howW = contentW - 14;
    doc.fontSize(9.5).font("Helvetica").fillColor(C.text);
    const howHeight = doc.heightOfString(howTo, { width: howW - 16, lineGap: 2 });

    doc.roundedRect(howX, y, howW, howHeight + 22, 4).fill(C.primaryLight);
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(C.primary);
    doc.text("COMO USAR", howX + 10, y + 7, { width: howW - 20 });
    doc.fontSize(9.5).font("Helvetica").fillColor(C.text);
    doc.text(howTo, howX + 10, y + 20, { width: howW - 20, lineGap: 2 });
    y = y + howHeight + 28;
  }

  y += 12;
}

function ensureSpace(curY, needed) {
  if (curY + needed > doc.page.height - 70) {
    doc.addPage();
    return 50;
  }
  return curY;
}

// ═════ CONTEÚDO ═════════════════════════════════════════════

section("1", "Estoque");

item(
  "Novos filtros (fornecedor / data / idade)",
  "Agora dá pra filtrar o estoque por fornecedor, por data de entrada (hoje / 7 dias / 30 dias) e por idade no estoque (menor que 30 dias, 30-90 dias, mais de 90 dias).",
  "Em /admin/estoque, use os 3 novos dropdowns na barra de filtros. O mais útil é \"Parado > 90 dias\" — mostra SKUs encalhados pra promover ou dar saída."
);

section("2", "Etiquetas");

item(
  "Busca no histórico",
  "Campo de busca no histórico aceita código de barras, nome do produto, serial ou IMEI.",
  "Em /admin/etiquetas > aba Histórico, use a caixa de busca no topo pra achar a etiqueta específica."
);

item(
  "Reimprimir (mantendo o mesmo código)",
  "O botão antigo \"Imprimir\" virou \"Reimprimir\" — deixa claro que não gera um código novo, apenas reimprime o existente.",
  "Se uma etiqueta se perdeu ou danificou, abra o histórico, busque pelo código ou produto, e clique em Reimprimir. Mesmo QR, mesmo código de barras."
);

section("3", "Entregas");

item(
  "Bulk (marcar várias de uma vez)",
  "Deixa marcar múltiplas entregas como entregues, atribuir motoboy ou mudar status em lote — em vez de abrir uma por uma.",
  "No topo da página, clique em \"Marcar várias entregues\". Selecione os cards que quer alterar e use os botões em lote (Finalizar, Igor/Leandro, status, etc.)."
);

item(
  "Foto do comprovante anexada no card",
  "Novo campo no modal de detalhes pra anexar a foto do comprovante (print da assinatura, foto do recebimento, etc.). Aparece como thumbnail que abre em tela cheia com clique.",
  "Abra a entrega, role até FOTO COMPROVANTE e cole o link da imagem (Drive, WhatsApp Web, etc.). A foto salva automaticamente e aparece no card."
);

section("4", "Gerador de Orçamento");

item(
  "Margem visível pro vendedor",
  "Ao adicionar produto no carrinho, aparece o custo, lucro em R$ e margem em % por linha. No rodapé mostra o lucro TOTAL estimado do orçamento (considerando desconto).",
  "Em /admin/orcamento, adicione produtos normalmente. As informações de lucro aparecem sozinhas embaixo de cada linha do carrinho."
);

item(
  "Validação de estoque em tempo real",
  "No dropdown de produtos já aparece quantas unidades temos. Se o produto está esgotado ou a quantidade pedida é maior que o estoque, mostra um aviso.",
  "Ao escolher o produto, veja o indicador: X em estoque / últimas X / ESGOTADO. Avisa mas não bloqueia — se tem chegando, pode cotar mesmo assim."
);

section("5", "Gerador de Link de Compra");

item(
  "Tag de campanha/origem",
  "Novo campo pra marcar de onde o link veio (Instagram Stories, Anúncio Meta, Indicação, Funcionário…). Os dados vão pro relatório e permitem ver qual origem converte mais.",
  "Em /admin/gerar-link, preencha o campo \"Campanha / Origem do link\" antes de gerar. Pode usar os botões de preset ou digitar texto livre."
);

item(
  "Preview WhatsApp antes de copiar",
  "Depois que o link é gerado, aparece uma bolha simulando como vai ficar no chat do cliente — com rich preview, hora e ticks azuis.",
  "Gere o link normalmente e veja a seção \"Como vai aparecer no WhatsApp\" logo abaixo. Confira o preview antes de clicar em Copiar Link."
);

item(
  "Filtro por vendedor no histórico",
  "Na aba Histórico de Links agora tem 2 filtros separados: Operador (quem criou o link) e Vendedor (quem vai atender o cliente).",
  "Em /admin/gerar-link > aba Histórico, use os dropdowns pra filtrar. Útil pra ver os links da Bianca, Laynne ou Paloma individualmente."
);

section("6", "Avisos para Clientes");

item(
  "Detecção automática de produto disponível",
  "Quando o produto que o cliente está aguardando chega no estoque, o card fica destacado em verde com a lista das cores/capacidades disponíveis agora.",
  "Em /admin/avisos-clientes, o filtro \"Disponível agora\" já vem selecionado. Os cards destacados são clientes que você pode avisar AGORA mesmo."
);

item(
  "Botão \"Avisar pelo WhatsApp\" com mensagem pronta",
  "Gera automaticamente uma mensagem personalizada com o nome do cliente, produto desejado e lista das cores disponíveis. Um clique abre o WhatsApp com tudo preenchido.",
  "Quando um card aparece como disponível, clique em Avisar pelo WhatsApp. Revise a mensagem e envie."
);

section("7", "Mostruário (site público)");

item(
  "Produtos esgotados somem automaticamente",
  "O site filtra em tempo real as variações (storage / cor) sem estoque. O cliente não vê mais opções que não temos pra vender.",
  "Funciona sozinho. Quando um SKU entra no estoque, volta a aparecer. Quando esgota, some. Não precisa mexer em nada."
);

item(
  "Preview de como o cliente vê o produto",
  "No admin do mostruário, novo botão pra abrir um modal mostrando exatamente como o card do produto aparece pro cliente no site.",
  "Em /admin/mostruario, expanda o produto e clique em Preview cliente. Útil pra conferir antes de publicar (se imagem tá boa, se preço tá certo, se está marcado como oculto)."
);

section("8", "Instagram");

item(
  "Preview do carrossel antes de postar",
  "Na tela de edição do post, mockup fiel de como o carrossel vai aparecer no feed — header da loja, slides quadrados, navegação por setas, legenda e hashtags.",
  "Em /admin/instagram/[id], role até o banner Preview Instagram e clique em Abrir preview. Navegue entre os slides pelas setas ou thumbnails de baixo."
);

section("9", "Relatórios e Analytics");

item(
  "Relatórios — período personalizado",
  "Além de Semanal/Mensal, agora tem opção Personalizado pra escolher qualquer intervalo de datas.",
  "Em /admin/relatorios, clique na aba Personalizado e escolha as datas De e Até."
);

item(
  "Analytics de Vendas — filtro por canal",
  "Dropdown pra scopear os KPIs, projeção e ranking por origem específica (FORMULÁRIO, INSTAGRAM, INDICAÇÃO, etc.).",
  "Em /admin/analytics-vendas, use o select \"Todos canais\" no topo. Escolha uma origem pra ver apenas aquelas vendas."
);

item(
  "Sazonalidade — Heatmap Dia x Hora",
  "Tabela que cruza dia da semana com hora do dia (8h-21h). Quanto mais escuro o laranja, mais vendas naquele horário específico.",
  "Em /admin/sazonalidade, role até a seção Heatmap Dia x Hora. Ajuda a decidir horário pra postar, rodar anúncio ou abordar cliente."
);

item(
  "Mapa de Vendas — Campanhas x Região",
  "Nova seção mostra onde cada campanha (Meta Ads, Instagram) converteu. Cada card expansível lista os top bairros e cidades da campanha.",
  "Em /admin/mapa-vendas, role até Campanhas x Região no final da página. Está esperando os UTMs serem configurados nas campanhas Meta — em breve começa a popular."
);

section("10", "Rastreamento (em segundo plano)");

item(
  "Tracking UTM ponta a ponta",
  "Toda simulação e venda agora rastreia de onde o cliente veio (Meta Ads, Instagram orgânico, Google, direto). Os dados vão pro banco automaticamente quando cliente chega via link com parâmetros utm_*.",
  "Não precisa fazer nada — é transparente. Depois que os UTMs das campanhas Meta estiverem configurados, os relatórios começam a mostrar conversão por origem."
);

// ─── Rodapé ─────────────────────────────────────────────
const totalPages = doc.bufferedPageRange().count;
for (let i = 0; i < totalPages; i++) {
  doc.switchToPage(i);
  doc.fontSize(9).font("Helvetica").fillColor(C.textMuted);
  doc.text(
    `Página ${i + 1} de ${totalPages}   //   TigrãoImports   //   Abril 2026`,
    leftM, doc.page.height - 35, { width: contentW, align: "center" }
  );
}

doc.end();

await new Promise((resolve) => {
  doc.on("end", resolve);
  setTimeout(resolve, 2000);
});

console.log(`✓ PDF gerado: ${OUT_PATH}`);
