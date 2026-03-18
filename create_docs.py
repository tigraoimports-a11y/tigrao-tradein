#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para gerar documentacao tecnica PDF do TigraoImports Trade-In Calculator.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, BaseDocTemplate, PageTemplate, Frame
)
from reportlab.platypus.flowables import Flowable
from reportlab.lib.colors import HexColor

# ── Colors ───────────────────────────────────────────────────────────────────
ORANGE      = HexColor('#E8740E')
ORANGE_DARK = HexColor('#B85A08')
DARK_BG     = HexColor('#0A0A0A')
CODE_BG     = HexColor('#F0F0F0')
TEXT_MAIN   = HexColor('#1A1A1A')
TEXT_MUTED  = HexColor('#555555')
BORDER      = HexColor('#CCCCCC')
ROW_ALT     = HexColor('#FFF8F3')

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm


# ── NextPageTemplate flowable ────────────────────────────────────────────────
from reportlab.platypus import ActionFlowable

def NextPageTemplate(name):
    return ActionFlowable(('nextPageTemplate', name))


# ── Page callbacks ────────────────────────────────────────────────────────────
def on_page_cover(canvas_obj, doc):
    w, h = A4
    canvas_obj.saveState()

    # Full dark background
    canvas_obj.setFillColor(DARK_BG)
    canvas_obj.rect(0, 0, w, h, fill=True, stroke=False)

    # Top orange stripe
    canvas_obj.setFillColor(ORANGE)
    canvas_obj.rect(0, h - 30*mm, w, 30*mm, fill=True, stroke=False)

    # Bottom orange stripe
    canvas_obj.setFillColor(ORANGE)
    canvas_obj.rect(0, 0, w, 20*mm, fill=True, stroke=False)

    # Brand name in top stripe
    canvas_obj.setFillColor(colors.white)
    canvas_obj.setFont('Helvetica-Bold', 32)
    canvas_obj.drawCentredString(w/2, h - 22*mm, 'TigraoImports')
    canvas_obj.setFont('Helvetica', 13)
    canvas_obj.drawCentredString(w/2, h - 27*mm, '@tigraoimports | Barra da Tijuca, Rio de Janeiro')

    # Main title block (center of page)
    canvas_obj.setFillColor(ORANGE)
    canvas_obj.setFont('Helvetica-Bold', 24)
    canvas_obj.drawCentredString(w/2, h/2 + 42*mm, 'Trade-In Calculator')

    canvas_obj.setFillColor(colors.white)
    canvas_obj.setFont('Helvetica-Bold', 18)
    canvas_obj.drawCentredString(w/2, h/2 + 28*mm, 'Documentacao Tecnica Completa')

    # Rule
    canvas_obj.setStrokeColor(ORANGE)
    canvas_obj.setLineWidth(1.5)
    canvas_obj.line(MARGIN*2, h/2 + 21*mm, w - MARGIN*2, h/2 + 21*mm)

    # Subtitle lines
    canvas_obj.setFillColor(HexColor('#BBBBBB'))
    canvas_obj.setFont('Helvetica', 11)
    canvas_obj.drawCentredString(w/2, h/2 + 13*mm, 'Aplicacao web para simulacao autonoma de trade-in de iPhones')
    canvas_obj.drawCentredString(w/2, h/2 + 5*mm,  'Next.js 14  |  TypeScript  |  Tailwind CSS v4')
    canvas_obj.drawCentredString(w/2, h/2 - 3*mm,  'Supabase  |  Z-API  |  Google Sheets  |  Vercel')

    # Info box
    box_y = h/2 - 38*mm
    box_h = 28*mm
    canvas_obj.setFillColor(HexColor('#1C1C1C'))
    canvas_obj.roundRect(MARGIN*2, box_y, w - MARGIN*4, box_h, 4*mm, fill=True, stroke=False)
    canvas_obj.setStrokeColor(ORANGE)
    canvas_obj.setLineWidth(0.7)
    canvas_obj.roundRect(MARGIN*2, box_y, w - MARGIN*4, box_h, 4*mm, fill=False, stroke=True)

    canvas_obj.setFont('Helvetica-Bold', 9)
    canvas_obj.setFillColor(ORANGE)
    canvas_obj.drawString(MARGIN*2 + 8*mm, box_y + 20*mm, 'GITHUB:')
    canvas_obj.setFillColor(HexColor('#CCCCCC'))
    canvas_obj.setFont('Helvetica', 9)
    canvas_obj.drawString(MARGIN*2 + 8*mm, box_y + 13*mm, 'github.com/tigraoimports-a11y/tigrao-tradein')
    canvas_obj.setFont('Helvetica-Bold', 9)
    canvas_obj.setFillColor(ORANGE)
    canvas_obj.drawString(MARGIN*2 + 8*mm, box_y + 7*mm, 'DEPLOY:')
    canvas_obj.setFillColor(HexColor('#CCCCCC'))
    canvas_obj.setFont('Helvetica', 9)
    canvas_obj.drawString(MARGIN*2 + 8*mm, box_y + 1*mm, 'Vercel  |  tigrao-tradein.vercel.app  |  Versao 1.0  |  Marco 2025')

    # Bottom
    canvas_obj.setFillColor(colors.white)
    canvas_obj.setFont('Helvetica-Bold', 10)
    canvas_obj.drawCentredString(w/2, 12*mm, 'Confidencial — TigraoImports © 2025')

    canvas_obj.restoreState()


def on_page_normal(canvas_obj, doc):
    w, h = A4
    canvas_obj.saveState()

    # Top orange bar
    canvas_obj.setFillColor(ORANGE)
    canvas_obj.rect(0, h - 12*mm, w, 12*mm, fill=True, stroke=False)

    # Header text
    canvas_obj.setFillColor(colors.white)
    canvas_obj.setFont('Helvetica-Bold', 8)
    canvas_obj.drawString(MARGIN, h - 8*mm, 'TigraoImports Trade-In Calculator — Documentacao Tecnica')
    canvas_obj.setFont('Helvetica', 8)
    canvas_obj.drawRightString(w - MARGIN, h - 8*mm, f'Pagina {doc.page}')

    # Bottom rule + footer
    canvas_obj.setStrokeColor(BORDER)
    canvas_obj.setLineWidth(0.5)
    canvas_obj.line(MARGIN, 15*mm, w - MARGIN, 15*mm)
    canvas_obj.setFont('Helvetica', 7)
    canvas_obj.setFillColor(TEXT_MUTED)
    canvas_obj.drawString(MARGIN, 10*mm, 'Confidencial — TigraoImports © 2025')
    canvas_obj.drawRightString(w - MARGIN, 10*mm, 'tigraoimports.com.br')

    canvas_obj.restoreState()


# ── Styles ────────────────────────────────────────────────────────────────────
def make_styles():
    s = {}
    s['h1'] = ParagraphStyle('H1',
        fontName='Helvetica-Bold', fontSize=17, leading=22,
        textColor=ORANGE, spaceAfter=5, spaceBefore=12)
    s['h2'] = ParagraphStyle('H2',
        fontName='Helvetica-Bold', fontSize=12, leading=16,
        textColor=ORANGE_DARK, spaceAfter=4, spaceBefore=9)
    s['h3'] = ParagraphStyle('H3',
        fontName='Helvetica-Bold', fontSize=10.5, leading=14,
        textColor=TEXT_MAIN, spaceAfter=3, spaceBefore=6)
    s['body'] = ParagraphStyle('Body',
        fontName='Helvetica', fontSize=9.5, leading=14,
        textColor=TEXT_MAIN, spaceAfter=4, spaceBefore=2)
    s['bullet'] = ParagraphStyle('Bullet',
        fontName='Helvetica', fontSize=9.5, leading=14,
        textColor=TEXT_MAIN, spaceAfter=2, leftIndent=12, firstLineIndent=-8)
    s['code'] = ParagraphStyle('Code',
        fontName='Courier', fontSize=7.8, leading=11,
        textColor=HexColor('#222222'))
    s['note'] = ParagraphStyle('Note',
        fontName='Helvetica-Oblique', fontSize=8.5, leading=12,
        textColor=TEXT_MUTED, spaceAfter=4, spaceBefore=2, leftIndent=8)
    s['toc_title'] = ParagraphStyle('TocTitle',
        fontName='Helvetica-Bold', fontSize=20, leading=26,
        textColor=ORANGE, spaceAfter=14, alignment=TA_CENTER)
    s['toc_num'] = ParagraphStyle('TocNum',
        fontName='Helvetica-Bold', fontSize=10, leading=16,
        textColor=ORANGE_DARK)
    s['toc_text'] = ParagraphStyle('TocText',
        fontName='Helvetica', fontSize=10, leading=16,
        textColor=TEXT_MAIN)
    return s


# ── Helper: code block ────────────────────────────────────────────────────────
def code_block(lines, st):
    content = '<br/>'.join(
        line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace(' ', '&nbsp;')
        for line in lines
    )
    p = Paragraph(content, st['code'])
    t = Table([[p]], colWidths=[PAGE_W - 2*MARGIN])
    t.setStyle(TableStyle([
        ('BACKGROUND',   (0,0), (-1,-1), CODE_BG),
        ('BOX',          (0,0), (-1,-1), 0.5, BORDER),
        ('LEFTPADDING',  (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING',   (0,0), (-1,-1), 6),
        ('BOTTOMPADDING',(0,0), (-1,-1), 6),
    ]))
    return t


# ── Helper: section heading ───────────────────────────────────────────────────
def section_heading(num, title, st):
    bar = Table([['']], colWidths=[4], rowHeights=[20])
    bar.setStyle(TableStyle([
        ('BACKGROUND',   (0,0), (-1,-1), ORANGE),
        ('TOPPADDING',   (0,0), (-1,-1), 0),
        ('BOTTOMPADDING',(0,0), (-1,-1), 0),
    ]))
    text_p = Paragraph(f'<b>Secao {num} — {title}</b>', st['h1'])
    t = Table([[bar, text_p]], colWidths=[7, PAGE_W - 2*MARGIN - 7])
    t.setStyle(TableStyle([
        ('VALIGN',       (0,0), (-1,-1), 'MIDDLE'),
        ('LEFTPADDING',  (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING',   (0,0), (-1,-1), 0),
        ('BOTTOMPADDING',(0,0), (-1,-1), 4),
        ('LINEBELOW',    (0,0), (-1,-1), 0.8, ORANGE),
    ]))
    return t


# ── Helper: info table ────────────────────────────────────────────────────────
def info_table(headers, rows, col_widths=None):
    th_style = ParagraphStyle('TH', fontName='Helvetica-Bold', fontSize=8.5, textColor=colors.white)
    td_style = ParagraphStyle('TD', fontName='Helvetica', fontSize=8.5, leading=12, textColor=TEXT_MAIN)

    data = [[Paragraph(h, th_style) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), td_style) for c in row])

    if col_widths is None:
        available = PAGE_W - 2*MARGIN
        col_widths = [available / len(headers)] * len(headers)

    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND',    (0,0), (-1,0),  ORANGE),
        ('GRID',          (0,0), (-1,-1), 0.4, BORDER),
        ('ROWBACKGROUNDS',(0,1), (-1,-1), [colors.white, ROW_ALT]),
        ('TOPPADDING',    (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING',   (0,0), (-1,-1), 5),
        ('RIGHTPADDING',  (0,0), (-1,-1), 5),
        ('VALIGN',        (0,0), (-1,-1), 'TOP'),
    ]))
    return t


# ── Build story ───────────────────────────────────────────────────────────────
def build_story(st):
    story = []

    # ── TABLE OF CONTENTS ────────────────────────────────────────────────────
    story.append(Paragraph('Sumario', st['toc_title']))
    story.append(HRFlowable(width='100%', thickness=1.5, color=ORANGE, spaceAfter=10))

    toc_sections = [
        ('1',  'Visao Geral do Projeto'),
        ('2',  'Stack Tecnica'),
        ('3',  'Fluxo do Aplicativo (3 Etapas)'),
        ('4',  'Estrutura de Arquivos do Projeto'),
        ('5',  'Variaveis de Ambiente (.env.local)'),
        ('6',  'Banco de Dados Supabase'),
        ('7',  'Notificacoes Z-API (WhatsApp)'),
        ('8',  'Calculo de Parcelas'),
        ('9',  'Integracao Google Sheets'),
        ('10', 'Dashboard Admin'),
        ('11', 'Catalogo de Produtos'),
        ('12', 'Design System'),
        ('13', 'Deploy na Vercel'),
        ('14', 'Checklist de Setup do Zero'),
        ('15', 'Erros Comuns e Solucoes'),
    ]
    for num, title in toc_sections:
        row_t = Table(
            [[Paragraph(f'Secao {num}', st['toc_num']),
              Paragraph(title, st['toc_text'])]],
            colWidths=[28*mm, PAGE_W - 2*MARGIN - 28*mm]
        )
        row_t.setStyle(TableStyle([
            ('LINEBELOW',    (0,0), (-1,-1), 0.3, HexColor('#DDDDDD')),
            ('TOPPADDING',   (0,0), (-1,-1), 3),
            ('BOTTOMPADDING',(0,0), (-1,-1), 3),
            ('VALIGN',       (0,0), (-1,-1), 'MIDDLE'),
        ]))
        story.append(row_t)

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SECAO 1 — VISAO GERAL
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(section_heading(1, 'Visao Geral do Projeto', st))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>Sobre a TigraoImports</b>', st['h2']))
    story.append(info_table(
        ['Atributo', 'Descricao'],
        [
            ('Negocio', 'Importacao e revenda de produtos Apple (iPhones, iPads, MacBooks, Apple Watch, AirPods)'),
            ('Localizacao', 'Barra da Tijuca, Rio de Janeiro'),
            ('Canais', 'Instagram (@tigraoimports) + WhatsApp (sem loja fisica)'),
            ('Equipe', 'Andre (fundador/operador), Bianca (atendimento), Nicolas (vendas)'),
            ('Modelo de Negocio', 'Capital deposito → estoque → venda → fluxo de caixa → reinvestimento'),
            ('Diferenciais', 'Produtos lacrados, NF no nome do cliente, 1 ano de garantia Apple'),
        ],
        col_widths=[42*mm, PAGE_W - 2*MARGIN - 42*mm]
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Objetivo do Projeto</b>', st['h2']))
    story.append(Paragraph(
        'Aplicacao web (Next.js + React) para clientes da TigraoImports realizarem simulacao '
        'de trade-in de iPhones de forma autonoma, sem necessidade de interacao humana inicial. '
        'O cliente informa o aparelho usado, escolhe o novo modelo desejado, e recebe uma cotacao '
        'completa com valores Pix e parcelado. No final pode fechar o pedido diretamente via '
        'WhatsApp, agilizando o funil de vendas.',
        st['body']))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>Infraestrutura</b>', st['h2']))
    story.append(info_table(
        ['Componente', 'Descricao'],
        [
            ('Deploy', 'Vercel (vercel.app) — deploy automatico via GitHub push para main'),
            ('Repositorio', 'GitHub — organizacao tigraoimports-a11y'),
            ('Dados de Preco', 'Google Sheets publicado como CSV — atualizacao em tempo real sem novo deploy'),
            ('Banco de Dados', 'Supabase (PostgreSQL) — armazena leads e historico de simulacoes'),
            ('Notificacoes', 'Z-API — envia notificacoes WhatsApp automaticas para a equipe a cada simulacao'),
        ],
        col_widths=[42*mm, PAGE_W - 2*MARGIN - 42*mm]
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SECAO 2 — STACK TECNICA
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(section_heading(2, 'Stack Tecnica', st))
    story.append(Spacer(1, 6))

    story.append(info_table(
        ['Camada', 'Tecnologia', 'Funcao'],
        [
            ('Framework', 'Next.js 14+ (App Router)', 'Base da aplicacao web full-stack'),
            ('UI', 'React + Tailwind CSS v4', 'Interface componente + utilitarios CSS'),
            ('Linguagem', 'TypeScript', 'Tipagem estatica para maior seguranca no codigo'),
            ('Fonts', 'Sora + Outfit (Google Fonts)', 'Sora para titulos, Outfit para corpo de texto'),
            ('Deploy', 'Vercel', 'CI/CD automatico, edge functions, CDN global'),
            ('Dados', 'Google Sheets → CSV → fetch server-side', 'Cache de 5 minutos (revalidate: 300)'),
            ('CSV Parser', 'papaparse', 'Conversao de CSV para JSON tipado no servidor'),
            ('Banco de Dados', 'Supabase (PostgreSQL)', 'Armazenamento de leads e simulacoes'),
            ('Notificacoes', 'Z-API (WhatsApp Business API)', 'Notificacao automatica da equipe em tempo real'),
            ('Repositorio', 'GitHub (org tigraoimports-a11y)', 'Controle de versao e CI/CD'),
        ],
        col_widths=[38*mm, 58*mm, PAGE_W - 2*MARGIN - 96*mm]
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Instalacao de Dependencias</b>', st['h2']))
    story.append(code_block([
        '# Criar projeto Next.js com todas as flags necessarias',
        'npx create-next-app@latest tigrao-tradein \\',
        '  --typescript --tailwind --app --src-dir=false',
        '',
        '# Instalar dependencias do projeto',
        'cd tigrao-tradein',
        'npm install papaparse @supabase/supabase-js',
        'npm install -D @types/papaparse',
    ], st))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SECAO 3 — FLUXO DO APLICATIVO
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(section_heading(3, 'Fluxo do Aplicativo (3 Etapas)', st))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>Etapa 1 — Aparelho Usado do Cliente</b>', st['h2']))
    for item in [
        'Seleciona modelo do iPhone usado (lista de modelos aceitos carregada da planilha)',
        'Seleciona armazenamento disponivel para o modelo escolhido',
        'Informa saude da bateria via slider percentual (0% a 100%)',
        'Informa condicao fisica: riscos na tela, riscos laterais, descascado ou amassado',
        'Informa se possui garantia Apple ativa',
        'Sistema exibe preview da avaliacao estimada em tempo real conforme o usuario preenche',
    ]:
        story.append(Paragraph(f'• {item}', st['bullet']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Etapa 2 — Aparelho Novo Desejado</b>', st['h2']))
    for item in [
        'Seleciona modelo do iPhone novo (catalogo ativo carregado da planilha)',
        'Seleciona armazenamento — cada opcao exibe o preco Pix correspondente',
        'Seleciona cor disponivel para o modelo/storage escolhido',
        'Sistema exibe preview: preco do novo - avaliacao do usado = diferenca a pagar',
    ]:
        story.append(Paragraph(f'• {item}', st['bullet']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Etapa 3 — Cotacao Final</b>', st['h2']))
    story.append(info_table(
        ['Elemento', 'Descricao'],
        [
            ('Produto Novo', 'Modelo, storage, cor, lacrado, garantia Apple, nota fiscal'),
            ('Aparelho Usado', 'Modelo, storage, descricao das condicoes fisicas informadas'),
            ('Avaliacao do Usado', 'Valor final calculado em R$ (valor base + descontos por condicao)'),
            ('Diferenca a Pagar', 'Valores calculados: Pix, 12x, 18x e 21x com totais'),
            ('Validade', 'Cotacao valida por 24 horas a partir da geracao'),
            ('Acao: Fechar Pedido', 'Abre WhatsApp com cotacao completa pre-escrita para envio imediato'),
            ('Acao: Sair', 'Reseta todo o formulario para iniciar nova simulacao'),
        ],
        col_widths=[42*mm, PAGE_W - 2*MARGIN - 42*mm]
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SECAO 4 — ESTRUTURA DE ARQUIVOS
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(section_heading(4, 'Estrutura de Arquivos do Projeto', st))
    story.append(Spacer(1, 6))
    story.append(code_block([
        'tigrao-tradein/',
        '|-- package.json',
        '|-- next.config.js',
        '|-- tailwind.config.js',
        '|-- .env.local                      # Variaveis de ambiente (nao versionar!)',
        '|',
        '|-- app/',
        '|   |-- layout.tsx                  # Layout raiz, fontes, metadata',
        '|   |-- page.tsx                    # Pagina principal (renderiza calculator)',
        '|   |-- globals.css                 # Estilos globais + variaveis CSS',
        '|   |',
        '|   |-- api/',
        '|       |-- produtos/route.ts       # Fetch + parse planilha produtos novos',
        '|       |-- usados/route.ts         # Fetch + parse planilha avaliacao usados',
        '|       |-- config/route.ts         # Fetch + parse configuracoes',
        '|       |-- leads/route.ts          # Salvar lead no Supabase + notificar Z-API',
        '|       |-- admin/',
        '|           |-- stats/route.ts      # Dashboard admin (requer senha)',
        '|',
        '|-- components/',
        '|   |-- TradeInCalculator.tsx       # Componente principal (state machine 3 steps)',
        '|   |-- StepUsedDevice.tsx          # Etapa 1: selecao + condicao do usado',
        '|   |-- StepNewDevice.tsx           # Etapa 2: selecao do aparelho novo',
        '|   |-- StepQuote.tsx               # Etapa 3: cotacao formatada + botoes',
        '|   |-- StepBar.tsx                 # Barra de progresso das etapas',
        '|',
        '|-- lib/',
        '|   |-- types.ts                    # Interfaces TypeScript',
        '|   |-- calculations.ts             # Logica de avaliacao e calculo de parcelas',
        '|   |-- sheets.ts                   # Funcoes de fetch/parse das planilhas',
        '|   |-- supabase.ts                 # Cliente Supabase + funcoes de banco',
        '|',
        '|-- public/',
        '    |-- favicon.ico',
    ], st))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Descricao dos Arquivos Principais</b>', st['h2']))
    story.append(info_table(
        ['Arquivo', 'Funcao'],
        [
            ('app/layout.tsx', 'Layout raiz. Configura fontes Sora e Outfit via next/font/google, define metadata da pagina.'),
            ('app/page.tsx', 'Pagina principal. Renderiza o componente TradeInCalculator com Suspense boundary.'),
            ('TradeInCalculator.tsx', 'Componente central. Gerencia estado das 3 etapas, dados selecionados e transicoes.'),
            ('lib/calculations.ts', 'Funcoes puras: calcularAvaliacao(), calcularParcelas(). Nenhuma logica de UI.'),
            ('lib/sheets.ts', 'Funcoes de fetch das planilhas Google Sheets. Usa papaparse para converter CSV em JSON.'),
            ('lib/supabase.ts', 'Inicializacao do cliente Supabase e funcao salvarSimulacao().'),
            ('api/leads/route.ts', 'API route POST: recebe dados da simulacao, salva no Supabase, envia notificacao Z-API.'),
            ('api/admin/stats/route.ts', 'API route GET protegida por senha: retorna simulacoes para o dashboard admin.'),
        ],
        col_widths=[55*mm, PAGE_W - 2*MARGIN - 55*mm]
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SECAO 5 — VARIAVEIS DE AMBIENTE
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(section_heading(5, 'Variaveis de Ambiente (.env.local)', st))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        'O arquivo .env.local deve ser criado na raiz do projeto e NUNCA versionado no Git '
        '(ja esta no .gitignore por padrao). Na Vercel, configure as variaveis em '
        'Project Settings → Environment Variables.',
        st['body']))
    story.append(Spacer(1, 5))
    story.append(code_block([
        '# Google Sheets — URLs CSV publicados',
        'SHEET_PRODUTOS_URL=https://docs.google.com/spreadsheets/d/.../pub?output=csv',
        'SHEET_USADOS_BASE_URL=https://docs.google.com/spreadsheets/d/.../pub?gid=0&output=csv',
        'SHEET_USADOS_DESCONTOS_URL=https://docs.google.com/spreadsheets/d/.../pub?gid=XXX&output=csv',
        'SHEET_USADOS_EXCLUIDOS_URL=https://docs.google.com/spreadsheets/d/.../pub?gid=XXX&output=csv',
        'SHEET_CONFIG_URL=https://docs.google.com/spreadsheets/d/.../pub?gid=XXX&output=csv',
        '',
        '# WhatsApp — numero no formato 55DDD9XXXXXXXX',
        'WHATSAPP_NUMBER=5521999999999',
        '',
        '# Z-API (WhatsApp Business API)',
        'ZAPI_INSTANCE_ID=SUA_INSTANCE_ID',
        'ZAPI_TOKEN=SEU_TOKEN',
        'ZAPI_CLIENT_TOKEN=SEU_CLIENT_TOKEN   # OBRIGATORIO — Security Token no painel Z-API',
        '',
        '# Supabase',
        'NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        'SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        '',
        '# Admin Dashboard',
        'ADMIN_PASSWORD=senha_segura_aqui',
    ], st))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        'IMPORTANTE: Use sempre as chaves JWT legadas (formato eyJ...) do Supabase. '
        'Acesse: Supabase Dashboard → Project Settings → API Keys → '
        '"Legacy anon, service_role API keys". '
        'Chaves no formato sb_secret_... nao sao compativeis com o cliente JS do Supabase.',
        st['note']))
    story.append(Spacer(1, 6))
    story.append(info_table(
        ['Variavel', 'Descricao', 'Escopo'],
        [
            ('SHEET_PRODUTOS_URL', 'URL CSV da planilha de produtos novos', 'Servidor'),
            ('SHEET_USADOS_BASE_URL', 'URL CSV dos valores base de trade-in', 'Servidor'),
            ('WHATSAPP_NUMBER', 'Numero WhatsApp no formato 55DDD9XXXXXXXX', 'Servidor'),
            ('ZAPI_INSTANCE_ID', 'ID da instancia Z-API', 'Servidor'),
            ('ZAPI_TOKEN', 'Token de autenticacao Z-API', 'Servidor'),
            ('ZAPI_CLIENT_TOKEN', 'Security Token obrigatorio Z-API (Client-Token header)', 'Servidor'),
            ('NEXT_PUBLIC_SUPABASE_URL', 'URL do projeto Supabase', 'Publico'),
            ('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Chave anonima Supabase (JWT legado, formato eyJ...)', 'Publico'),
            ('SUPABASE_SERVICE_ROLE_KEY', 'Chave service role Supabase (JWT legado, formato eyJ...)', 'Servidor'),
            ('ADMIN_PASSWORD', 'Senha para acessar o dashboard admin', 'Servidor'),
        ],
        col_widths=[58*mm, PAGE_W - 2*MARGIN - 84*mm, 26*mm]
    ))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SECAO 6 — SUPABASE
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(section_heading(6, 'Banco de Dados Supabase', st))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>Como Criar o Projeto Supabase</b>', st['h2']))
    for i, step in enumerate([
        'Acesse supabase.com e crie uma conta (ou faca login)',
        'Clique em "New Project" e preencha nome, senha forte e regiao (South America - Sao Paulo)',
        'Aguarde a criacao do projeto (aproximadamente 2 minutos)',
        'Acesse Project Settings → API Keys → copie as chaves legadas (Legacy anon e service_role)',
    ], 1):
        story.append(Paragraph(f'{i}. {step}', st['bullet']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>SQL — Criar Tabela simulacoes</b>', st['h2']))
    story.append(Paragraph('Execute no SQL Editor do Supabase (Database → SQL Editor):', st['body']))
    story.append(Spacer(1, 3))
    story.append(code_block([
        'CREATE TABLE simulacoes (',
        '  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,',
        '  created_at      TIMESTAMPTZ DEFAULT NOW(),',
        '  nome            TEXT,',
        '  whatsapp        TEXT,',
        '  instagram       TEXT,',
        '  modelo_novo     TEXT NOT NULL,',
        '  storage_novo    TEXT NOT NULL,',
        '  preco_novo      NUMERIC NOT NULL,',
        '  modelo_usado    TEXT NOT NULL,',
        '  storage_usado   TEXT NOT NULL,',
        '  avaliacao_usado NUMERIC NOT NULL,',
        '  diferenca       NUMERIC NOT NULL,',
        "  status          TEXT CHECK (status IN ('GOSTEI', 'SAIR')),",
        '  forma_pagamento TEXT,',
        '  condicao_linhas TEXT[]',
        ');',
    ], st))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>SQL — Configurar Permissoes</b>', st['h2']))
    story.append(code_block([
        '-- Desabilitar Row Level Security para acesso simplificado',
        'ALTER TABLE simulacoes DISABLE ROW LEVEL SECURITY;',
        '',
        '-- Conceder acesso completo a todas as roles',
        'GRANT ALL ON TABLE simulacoes TO service_role;',
        'GRANT ALL ON TABLE simulacoes TO anon;',
        'GRANT ALL ON TABLE simulacoes TO authenticated;',
    ], st))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>lib/supabase.ts — Codigo Completo</b>', st['h2']))
    story.append(code_block([
        "import { createClient } from '@supabase/supabase-js';",
        '',
        'const supabaseUrl      = process.env.NEXT_PUBLIC_SUPABASE_URL!;',
        'const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;',
        '',
        '// service role key bypassa RLS — usar apenas no servidor',
        'export const supabase = createClient(supabaseUrl, supabaseServiceKey);',
        '',
        'export interface SimulacaoData {',
        '  nome?: string;',
        '  whatsapp?: string;',
        '  instagram?: string;',
        '  modelo_novo: string;',
        '  storage_novo: string;',
        '  preco_novo: number;',
        '  modelo_usado: string;',
        '  storage_usado: string;',
        '  avaliacao_usado: number;',
        '  diferenca: number;',
        "  status: 'GOSTEI' | 'SAIR';",
        '  forma_pagamento?: string;',
        '  condicao_linhas?: string[];',
        '}',
        '',
        'export async function salvarSimulacao(data: SimulacaoData) {',
        "  const { error } = await supabase.from('simulacoes').insert([data]);",
        '  if (error) throw error;',
        '}',
    ], st))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        'Erro comum: "permission denied for table simulacoes" (codigo 42501). '
        'Causa: RLS ativo ou permissoes insuficientes. '
        'Solucao: Execute os dois blocos SQL de permissoes acima no SQL Editor do Supabase.',
        st['note']))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SECAO 7 — Z-API
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(section_heading(7, 'Notificacoes Z-API (WhatsApp)', st))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>Como Configurar a Z-API</b>', st['h2']))
    for i, step in enumerate([
        'Acesse z-api.io e crie uma conta',
        'Crie uma nova instancia no painel',
        'Escanei o QR Code com o WhatsApp da equipe (celular do Andre ou Nicolas)',
        'Va em Security → habilite o "Security Token" e copie o Client-Token',
        'Copie Instance ID e Token na aba geral da instancia',
        'Teste enviando uma mensagem pelo painel antes de integrar ao codigo',
    ], 1):
        story.append(Paragraph(f'{i}. {step}', st['bullet']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Funcao notificarZAPI — Codigo Completo</b>', st['h2']))
    story.append(code_block([
        'async function notificarZAPI(mensagem: string): Promise<void> {',
        '  const instanceId  = process.env.ZAPI_INSTANCE_ID;',
        '  const token       = process.env.ZAPI_TOKEN;',
        '  const clientToken = process.env.ZAPI_CLIENT_TOKEN; // OBRIGATORIO',
        '  const numero      = process.env.WHATSAPP_NUMBER;',
        '',
        '  if (!instanceId || !token || !clientToken || !numero) return;',
        '',
        '  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;',
        '',
        '  await fetch(url, {',
        "    method: 'POST',",
        '    headers: {',
        "      'Content-Type': 'application/json',",
        "      'Client-Token': clientToken,  // header obrigatorio desde dez/2023",
        '    },',
        '    body: JSON.stringify({ phone: numero, message: mensagem }),',
        '  });',
        '}',
    ], st))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Formato da Notificacao — Cliente Quer Fechar (GOSTEI)</b>', st['h2']))
    story.append(code_block([
        'NOVO LEAD - TigraoImports',
        '',
        'Cliente: {nome}',
        'WhatsApp: {whatsapp}',
        'Instagram: {instagram}',
        '',
        'PRODUTO NOVO: {modelo_novo} {storage_novo} {cor}',
        'Preco Pix: R$ {preco_novo}',
        '',
        'APARELHO USADO: {modelo_usado} {storage_usado}',
        'Avaliacao: R$ {avaliacao_usado}',
        '',
        'DIFERENCA: R$ {diferenca}',
        'Forma escolhida: {forma_pagamento}',
        '',
        'Status: GOSTEI - QUER FECHAR',
    ], st))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>Formato da Notificacao — Cliente Saiu (SAIR)</b>', st['h2']))
    story.append(code_block([
        'Simulacao registrada - saiu sem fechar',
        '',
        'Cliente: {nome} | {whatsapp}',
        'Queria: {modelo_novo} {storage_novo}',
        'Tinha: {modelo_usado} {storage_usado}',
        'Avaliacao oferecida: R$ {avaliacao_usado}',
        'Diferenca: R$ {diferenca}',
        '',
        'Status: SAIR - nao fechou',
    ], st))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        'Erro comum: "your client-token is not configured". '
        'Causa: Security Token nao habilitado na Z-API ou ZAPI_CLIENT_TOKEN vazio/faltando no .env.local. '
        'Solucao: Z-API painel → sua instancia → Security → habilitar Security Token → '
        'copiar Client-Token → colar em ZAPI_CLIENT_TOKEN no .env.local → redeploy na Vercel.',
        st['note']))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SECAO 8 — CALCULO DE PARCELAS
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(section_heading(8, 'Calculo de Parcelas', st))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>Modalidades de Pagamento</b>', st['h2']))
    story.append(info_table(
        ['Modalidade', 'Taxa', 'Multiplicador', 'Formula'],
        [
            ('Pix (a vista)', '0%', '1.00', 'diferenca x 1.00'),
            ('12x', '+14%', '1.14', '(diferenca x 1.14) / 12'),
            ('18x', '+20%', '1.20', '(diferenca x 1.20) / 18'),
            ('21x', '+21%', '1.21', '(diferenca x 1.21) / 21'),
        ],
        col_widths=[38*mm, 22*mm, 34*mm, PAGE_W - 2*MARGIN - 94*mm]
    ))
    story.append(Spacer(1, 5))
    story.append(Paragraph(
        'Exibicao recomendada: valor da parcela arredondado + total entre parenteses. '
        'Exemplo: "12x de R$ 875 (total: R$ 10.500)"',
        st['note']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Regras de Desconto por Condicao Fisica do Aparelho</b>', st['h2']))
    story.append(info_table(
        ['Condicao', 'Detalhe', 'Desconto'],
        [
            ('Riscos na tela', 'Nenhum risco', 'R$ 0'),
            ('Riscos na tela', '1 risco', '-R$ 100'),
            ('Riscos na tela', '2 ou mais riscos', '-R$ 250'),
            ('Riscos laterais', 'Nenhum risco', 'R$ 0'),
            ('Riscos laterais', '1 risco', '-R$ 100'),
            ('Riscos laterais', '2 ou mais riscos', '-R$ 250'),
            ('Descascado / Amassado', 'Sem avaria', 'R$ 0'),
            ('Descascado / Amassado', 'Avaria leve', '-R$ 200'),
            ('Descascado / Amassado', 'Avaria forte', '-R$ 300'),
            ('Bateria', '>=85% de saude', 'R$ 0'),
            ('Bateria', '<85% de saude', '-R$ 200'),
            ('Garantia Apple', 'Sem garantia ativa', 'R$ 0'),
            ('Garantia Apple', 'Com garantia ativa', '+R$ 300'),
        ],
        col_widths=[48*mm, 68*mm, PAGE_W - 2*MARGIN - 116*mm]
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Formula de Calculo — lib/calculations.ts</b>', st['h2']))
    story.append(code_block([
        'export function calcularAvaliacao(params: {',
        '  valorBase: number;',
        '  screenScratch: 0 | 1 | 2;  // 0=nenhum, 1=um risco, 2=dois ou mais',
        '  sideScratch: 0 | 1 | 2;',
        "  peeling: 'none' | 'light' | 'heavy';",
        '  battery: number;            // percentual 0-100',
        '  warranty: boolean;',
        '}): number {',
        '  const descontoTela    = [0, 100, 250][params.screenScratch];',
        '  const descontoLateral = [0, 100, 250][params.sideScratch];',
        "  const descontoPeeling = params.peeling === 'heavy' ? 300",
        "                        : params.peeling === 'light'  ? 200 : 0;",
        '  const descontoBateria = params.battery < 85 ? 200 : 0;',
        '  const bonusGarantia   = params.warranty ? 300 : 0;',
        '',
        '  const avaliacao = params.valorBase',
        '    - descontoTela - descontoLateral',
        '    - descontoPeeling - descontoBateria',
        '    + bonusGarantia;',
        '',
        '  return Math.max(avaliacao, 0); // avaliacao minima = R$ 0',
        '}',
    ], st))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SECAO 9 — GOOGLE SHEETS
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(section_heading(9, 'Integracao Google Sheets', st))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>Arquitetura da Integracao</b>', st['h2']))
    for i, step in enumerate([
        'Andre mantém as planilhas atualizadas no Google Sheets (fonte unica de verdade)',
        'Cada aba e publicada como CSV publico (sem autenticacao necessaria)',
        'O app faz fetch do CSV via API route Next.js — processamento server-side',
        'Dados sao cacheados por 5 minutos (next: { revalidate: 300 })',
        'Frontend consome via endpoints internos: /api/produtos, /api/usados, /api/config',
    ], 1):
        story.append(Paragraph(f'{i}. {step}', st['bullet']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Como Publicar uma Aba como CSV no Google Sheets</b>', st['h2']))
    for i, step in enumerate([
        'Abra a planilha no Google Sheets',
        'Menu: Arquivo → Compartilhar → Publicar na web',
        'Em "Link", selecione a aba especifica (ex: "Valores Base")',
        'Em "Formato", selecione "Valores separados por virgula (.csv)"',
        'Clique em "Publicar" e confirme a publicacao',
        'Copie o link gerado e cole no .env.local na variavel correspondente',
    ], 1):
        story.append(Paragraph(f'{i}. {step}', st['bullet']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Planilha 1: Produtos Novos</b>', st['h2']))
    story.append(Paragraph('Uma linha por combinacao unica de modelo + storage + cor:', st['body']))
    story.append(info_table(
        ['Modelo', 'Armazenamento', 'Cor', 'Preco Pix'],
        [
            ('iPhone 16 Pro', '128GB', 'Titanio Natural', '8900'),
            ('iPhone 16 Pro', '256GB', 'Titanio Natural', '9500'),
            ('iPhone 16 Pro', '128GB', 'Titanio Preto', '8900'),
            ('iPhone 17 Pro Max', '512GB', 'Titanio Verde', '14900'),
        ],
        col_widths=[42*mm, 36*mm, 58*mm, PAGE_W - 2*MARGIN - 136*mm]
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Planilha 2: Avaliacao de Usados (4 abas)</b>', st['h2']))
    story.append(info_table(
        ['Aba', 'Colunas', 'Conteudo'],
        [
            ('Valores Base', 'Modelo, Armazenamento, Valor Base (R$)', 'Valor de cada iPhone em condicao perfeita'),
            ('Descontos Condicao', 'Condicao, Detalhe, Desconto (R$)', 'Regras de desconto por condicao fisica'),
            ('Modelos Excluidos', 'Modelo (nao aceito trade-in)', 'Lista de modelos nao aceitos'),
            ('Configuracoes', 'Parametro, Valor', 'Multiplicadores parcelas, validade, numero WhatsApp'),
        ],
        col_widths=[42*mm, 64*mm, PAGE_W - 2*MARGIN - 106*mm]
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>lib/sheets.ts — Funcao de Fetch</b>', st['h2']))
    story.append(code_block([
        "import Papa from 'papaparse';",
        '',
        'async function fetchSheet(url: string) {',
        '  const response = await fetch(url, {',
        '    next: { revalidate: 300 } // cache por 5 minutos',
        '  });',
        '  const csv = await response.text();',
        '  const { data } = Papa.parse(csv, {',
        '    header: true,',
        '    skipEmptyLines: true,',
        '  });',
        '  return data;',
        '}',
    ], st))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SECAO 10 — DASHBOARD ADMIN
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(section_heading(10, 'Dashboard Admin', st))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        'O dashboard admin permite a equipe TigraoImports visualizar todas as simulacoes '
        'realizadas pelos clientes, filtrar por status e entrar em contato diretamente via WhatsApp.',
        st['body']))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>Acesso e Autenticacao</b>', st['h2']))
    story.append(Paragraph(
        'URL: https://[seu-dominio].vercel.app/admin',
        st['body']))
    story.append(Paragraph(
        'Autenticacao: senha definida na variavel ADMIN_PASSWORD no .env.local e Vercel.',
        st['body']))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>Cards de KPIs (Indicadores)</b>', st['h2']))
    story.append(info_table(
        ['KPI', 'Descricao'],
        [
            ('Total de Simulacoes', 'Numero total de simulacoes realizadas desde o lancamento'),
            ('Gostei (Quer Fechar)', 'Quantidade de clientes que clicaram "Desejo fechar meu pedido"'),
            ('Taxa de Conversao', 'Percentual: (Gostei / Total) x 100'),
            ('Ticket Medio da Diferenca', 'Media do valor da diferenca a pagar nos ultimos 30 dias'),
            ('Saiu Sem Fechar', 'Clientes que completaram o fluxo mas escolheram "Nao gostei. Sair"'),
            ('Simulacoes Hoje', 'Total de simulacoes realizadas no dia atual'),
        ],
        col_widths=[52*mm, PAGE_W - 2*MARGIN - 52*mm]
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Tabela de Simulacoes</b>', st['h2']))
    for item in [
        'Abas para filtrar: Todos / Gostei / Sair',
        'Campo de busca por nome, WhatsApp ou modelo do produto',
        'Botao WhatsApp em cada linha — abre conversa com mensagem pre-preenchida da simulacao',
        'Colunas: data/hora, nome, WhatsApp, modelo novo, modelo usado, avaliacao, diferenca, status',
        'Ordenacao por data decrescente (mais recente primeiro)',
    ]:
        story.append(Paragraph(f'• {item}', st['bullet']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>API Route — api/admin/stats/route.ts</b>', st['h2']))
    story.append(code_block([
        'export async function GET(request: Request) {',
        "  const senha = request.headers.get('x-admin-password');",
        '  if (senha !== process.env.ADMIN_PASSWORD) {',
        "    return Response.json({ error: 'Unauthorized' }, { status: 401 });",
        '  }',
        '',
        "  const { data, error } = await supabase.from('simulacoes')",
        "    .select('*')",
        "    .order('created_at', { ascending: false })",
        '    .limit(500);',
        '',
        '  if (error) return Response.json({ error }, { status: 500 });',
        '  return Response.json(data);',
        '}',
    ], st))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Botao WhatsApp na Tabela de Simulacoes</b>', st['h2']))
    story.append(code_block([
        'const mensagemWhats = encodeURIComponent(',
        '  `Ola ${sim.nome}! Vi sua simulacao no site da TigraoImports.\\n\\n` +',
        '  `Voce estava interessado em: ${sim.modelo_novo} ${sim.storage_novo}\\n` +',
        '  `Dando seu: ${sim.modelo_usado} ${sim.storage_usado} na troca\\n` +',
        '  `Avaliacao: R$ ${sim.avaliacao_usado} | Diferenca: R$ ${sim.diferenca}\\n\\n` +',
        '  `Posso te ajudar a fechar o pedido?`',
        ');',
        "const url = `https://wa.me/${sim.whatsapp}?text=${mensagemWhats}`;",
        'window.open(url, "_blank");',
    ], st))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SECAO 11 — CATALOGO
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(section_heading(11, 'Catalogo de Produtos', st))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>Modelos Novos Disponiveis para Venda</b>', st['h2']))
    story.append(info_table(
        ['Modelo', 'Storages Disponiveis', 'Cores Disponiveis'],
        [
            ('iPhone 13', '128GB, 256GB', 'Meia-noite, Estelar, Azul, Rosa, Verde, (PRODUCT)RED'),
            ('iPhone 14', '128GB, 256GB, 512GB', 'Meia-noite, Estelar, Azul, Roxo, (PRODUCT)RED'),
            ('iPhone 15', '128GB, 256GB, 512GB', 'Preto, Azul, Verde, Amarelo, Rosa'),
            ('iPhone 15 Pro', '128GB, 256GB, 512GB, 1TB', 'Titanio Natural, Titanio Azul, Titanio Branco, Titanio Preto'),
            ('iPhone 15 Pro Max', '256GB, 512GB, 1TB', 'Titanio Natural, Titanio Azul, Titanio Branco, Titanio Preto'),
            ('iPhone 16', '128GB, 256GB, 512GB', 'Preto, Branco, Azul, Verde-Azulado, Rosa'),
            ('iPhone 16 Plus', '128GB, 256GB, 512GB', 'Preto, Branco, Azul, Verde-Azulado, Rosa'),
            ('iPhone 16 Pro', '128GB, 256GB, 512GB, 1TB', 'Titanio Natural, Titanio Preto, Titanio Branco, Titanio Deserto'),
            ('iPhone 16 Pro Max', '256GB, 512GB, 1TB', 'Titanio Natural, Titanio Preto, Titanio Branco, Titanio Deserto'),
            ('iPhone 17 Pro *', '256GB, 512GB, 1TB', 'Titanio Natural, Titanio Preto, Titanio Branco, Titanio Verde'),
            ('iPhone 17 Pro Max *', '256GB, 512GB, 1TB', 'Titanio Natural, Titanio Preto, Titanio Branco, Titanio Verde'),
        ],
        col_widths=[42*mm, 46*mm, PAGE_W - 2*MARGIN - 88*mm]
    ))
    story.append(Paragraph('* iPhone 17 Pro e 17 Pro Max sao eSIM-only (sem suporte a chip fisico).', st['note']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Aparelhos Usados Aceitos para Trade-In</b>', st['h2']))
    story.append(Paragraph(
        'iPhone 11, 11 Pro, 11 Pro Max, 12, 12 Pro, 12 Pro Max, 13, 13 Pro, 13 Pro Max, '
        '14, 14 Plus, 14 Pro, 14 Pro Max, 15, 15 Plus, 15 Pro, 15 Pro Max, '
        '16, 16 Plus, 16 Pro, 16 Pro Max.',
        st['body']))
    story.append(Spacer(1, 5))
    story.append(Paragraph('<b>Modelos EXCLUIDOS do Trade-In:</b>', st['h3']))
    for item in [
        'iPhone 7, 8, X, XS, XR (geracao anterior ao iPhone 11)',
        'iPhone 12 Mini e 13 Mini (linha Mini descontinuada)',
        'iPhone SE (qualquer geracao)',
        'Aparelhos danificados: tela quebrada, nao liga, touch falho',
        'CPO / Seminovo / Vitrine / Recondicionado (apenas aparelhos originais aceitos)',
    ]:
        story.append(Paragraph(f'• {item}', st['bullet']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Valores Base de Avaliacao — Condicao Perfeita</b>', st['h2']))
    story.append(info_table(
        ['Modelo', 'Storage', 'Valor Base'],
        [
            ('iPhone 11',       '64GB',  'R$ 900'),
            ('iPhone 11',       '128GB', 'R$ 1.050'),
            ('iPhone 11 Pro',   '64GB',  'R$ 1.050'),
            ('iPhone 11 Pro',   '128GB', 'R$ 1.150'),
            ('iPhone 11 Pro',   '256GB', 'R$ 1.300'),
            ('iPhone 11 Pro Max','64GB', 'R$ 1.200'),
            ('iPhone 11 Pro Max','128GB','R$ 1.350'),
            ('iPhone 11 Pro Max','256GB','R$ 1.500'),
            ('iPhone 12',       '64GB',  'R$ 1.200'),
            ('iPhone 12',       '128GB', 'R$ 1.400'),
            ('iPhone 12',       '256GB', 'R$ 1.550'),
            ('iPhone 12 Pro',   '128GB', 'R$ 1.600'),
            ('iPhone 12 Pro',   '256GB', 'R$ 1.750'),
            ('iPhone 12 Pro Max','128GB','R$ 1.750'),
            ('iPhone 12 Pro Max','256GB','R$ 1.900'),
            ('iPhone 12 Pro Max','512GB','R$ 2.100'),
            ('iPhone 13',       '128GB', 'R$ 1.700'),
            ('iPhone 13',       '256GB', 'R$ 1.900'),
            ('iPhone 13',       '512GB', 'R$ 2.100'),
            ('iPhone 13 Pro',   '128GB', 'R$ 2.000'),
            ('iPhone 13 Pro',   '256GB', 'R$ 2.200'),
            ('iPhone 13 Pro',   '512GB', 'R$ 2.400'),
            ('iPhone 13 Pro',   '1TB',   'R$ 2.600'),
            ('iPhone 13 Pro Max','128GB','R$ 2.300'),
            ('iPhone 13 Pro Max','256GB','R$ 2.500'),
            ('iPhone 13 Pro Max','512GB','R$ 2.700'),
            ('iPhone 13 Pro Max','1TB',  'R$ 2.900'),
            ('iPhone 14',       '128GB', 'R$ 2.300'),
            ('iPhone 14',       '256GB', 'R$ 2.550'),
            ('iPhone 14',       '512GB', 'R$ 2.800'),
            ('iPhone 14 Plus',  '128GB', 'R$ 2.500'),
            ('iPhone 14 Plus',  '256GB', 'R$ 2.750'),
            ('iPhone 14 Plus',  '512GB', 'R$ 3.000'),
            ('iPhone 14 Pro',   '128GB', 'R$ 2.800'),
            ('iPhone 14 Pro',   '256GB', 'R$ 3.050'),
            ('iPhone 14 Pro',   '512GB', 'R$ 3.300'),
            ('iPhone 14 Pro',   '1TB',   'R$ 3.550'),
            ('iPhone 14 Pro Max','128GB','R$ 3.100'),
            ('iPhone 14 Pro Max','256GB','R$ 3.350'),
            ('iPhone 14 Pro Max','512GB','R$ 3.600'),
            ('iPhone 14 Pro Max','1TB',  'R$ 3.850'),
            ('iPhone 15',       '128GB', 'R$ 3.000'),
            ('iPhone 15',       '256GB', 'R$ 3.250'),
            ('iPhone 15',       '512GB', 'R$ 3.500'),
            ('iPhone 15 Plus',  '128GB', 'R$ 3.300'),
            ('iPhone 15 Plus',  '256GB', 'R$ 3.550'),
            ('iPhone 15 Plus',  '512GB', 'R$ 3.800'),
            ('iPhone 15 Pro',   '128GB', 'R$ 3.600'),
            ('iPhone 15 Pro',   '256GB', 'R$ 3.900'),
            ('iPhone 15 Pro',   '512GB', 'R$ 4.200'),
            ('iPhone 15 Pro',   '1TB',   'R$ 4.500'),
            ('iPhone 15 Pro Max','256GB','R$ 4.500'),
            ('iPhone 15 Pro Max','512GB','R$ 4.800'),
            ('iPhone 15 Pro Max','1TB',  'R$ 5.100'),
            ('iPhone 16',       '128GB', 'R$ 3.800'),
            ('iPhone 16',       '256GB', 'R$ 4.100'),
            ('iPhone 16',       '512GB', 'R$ 4.400'),
            ('iPhone 16 Plus',  '128GB', 'R$ 4.200'),
            ('iPhone 16 Plus',  '256GB', 'R$ 4.500'),
            ('iPhone 16 Plus',  '512GB', 'R$ 4.800'),
            ('iPhone 16 Pro',   '128GB', 'R$ 4.600'),
            ('iPhone 16 Pro',   '256GB', 'R$ 4.900'),
            ('iPhone 16 Pro',   '512GB', 'R$ 5.300'),
            ('iPhone 16 Pro',   '1TB',   'R$ 5.700'),
            ('iPhone 16 Pro Max','256GB','R$ 5.500'),
            ('iPhone 16 Pro Max','512GB','R$ 5.900'),
            ('iPhone 16 Pro Max','1TB',  'R$ 6.300'),
        ],
        col_widths=[58*mm, 32*mm, PAGE_W - 2*MARGIN - 90*mm]
    ))
    story.append(Paragraph(
        'Atencao: Estes valores sao estimativas iniciais para o codigo. '
        'Os valores reais e definitivos sao gerenciados pelo Andre diretamente na planilha Google Sheets.',
        st['note']))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SECAO 12 — DESIGN SYSTEM
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(section_heading(12, 'Design System', st))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>Paleta de Cores</b>', st['h2']))
    story.append(info_table(
        ['Token', 'Hex', 'Uso'],
        [
            ('tigrao-bg',     '#0A0A0A', 'Background principal da aplicacao (quase preto)'),
            ('tigrao-card',   '#141414', 'Cards e paineis com borda #2A2A2A'),
            ('tigrao-orange', '#E8740E', 'Accent principal — laranja tigre (CTAs, headings, selecionados)'),
            ('—',             '#F5A623', 'Tom claro do gradiente do accent'),
            ('tigrao-text',   '#F5F5F5', 'Texto principal sobre fundo escuro'),
            ('tigrao-muted',  '#888888', 'Texto secundario / muted'),
            ('—',             '#555555', 'Texto terciario / dim'),
            ('—',             '#2ECC71', 'Sucesso: avaliacao positiva, bateria ok (>=85%)'),
            ('—',             '#E74C3C', 'Erro/alerta: bateria baixa, modelo excluido'),
            ('—',             '#1E1208', 'Background de item selecionado (fundo escuro com tom laranja)'),
        ],
        col_widths=[34*mm, 24*mm, PAGE_W - 2*MARGIN - 58*mm]
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Principios de Design</b>', st['h2']))
    story.append(info_table(
        ['Principio', 'Descricao'],
        [
            ('Mobile-first', 'Todo CSS pensado para iPhone primeiro. Max-width: 440px centralizado na tela.'),
            ('Touch targets', 'Minimo 44px de altura para todos os elementos clicaveis (botoes, cards, opcoes).'),
            ('Tipografia', 'Sora (headings e display) + Outfit (corpo de texto) carregadas via Google Fonts.'),
            ('Animacoes', 'Transicao entre steps: fade + slide up. Hover states em botoes. Glow sutil no accent.'),
            ('Performance', 'Sem bibliotecas UI pesadas. Tailwind CSS puro. Dados em cache server-side 5 minutos.'),
            ('Acessibilidade', 'Contraste adequado. Labels em todos os inputs. Keyboard navigation nos selects.'),
        ],
        col_widths=[42*mm, PAGE_W - 2*MARGIN - 42*mm]
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Tokens CSS no Tailwind Config</b>', st['h2']))
    story.append(code_block([
        '// tailwind.config.js',
        "theme: {",
        "  extend: {",
        "    colors: {",
        "      'tigrao-orange': '#E8740E',",
        "      'tigrao-bg':     '#0A0A0A',",
        "      'tigrao-card':   '#141414',",
        "      'tigrao-border': '#2A2A2A',",
        "      'tigrao-text':   '#F5F5F5',",
        "      'tigrao-muted':  '#888888',",
        "    },",
        "    fontFamily: {",
        "      sora:   ['Sora', 'sans-serif'],",
        "      outfit: ['Outfit', 'sans-serif'],",
        "    },",
        "    maxWidth: {",
        "      'mobile': '440px',",
        "    },",
        "  }",
        "}",
    ], st))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SECAO 13 — DEPLOY VERCEL
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(section_heading(13, 'Deploy na Vercel', st))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>Deploy Inicial</b>', st['h2']))
    for i, step in enumerate([
        'Acesse vercel.com e faca login com sua conta GitHub',
        'Clique em "Add New → Project" e selecione o repositorio tigrao-tradein',
        'Em "Environment Variables", adicione TODAS as variaveis listadas na Secao 5',
        'Clique em "Deploy" e aguarde o build completar (aprox. 1-3 minutos)',
        'Acesse a URL gerada (ex: tigrao-tradein.vercel.app) para validar o funcionamento',
    ], 1):
        story.append(Paragraph(f'{i}. {step}', st['bullet']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Deploy Continuo (CD)</b>', st['h2']))
    story.append(Paragraph(
        'Apos o deploy inicial, qualquer push para a branch main dispara automaticamente um '
        'novo deploy na Vercel. O processo leva aproximadamente 1-2 minutos.',
        st['body']))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>Sequencia de Comandos Git para Deploy</b>', st['h2']))
    story.append(code_block([
        '# Verificar status dos arquivos alterados',
        'git status',
        '',
        '# Adicionar arquivos modificados ao commit',
        'git add .',
        '',
        '# Criar commit com descricao clara da alteracao',
        'git commit -m "feat: descricao da alteracao realizada"',
        '',
        '# Enviar para GitHub — dispara deploy automatico na Vercel',
        'git push origin main',
        '',
        '# Acompanhar o deploy em: vercel.com → seu projeto → Deployments',
    ], st))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Gerenciar Variaveis de Ambiente na Vercel</b>', st['h2']))
    for item in [
        'Acesse: vercel.com → Seu Projeto → Settings → Environment Variables',
        'Adicione ou edite as variaveis conforme necessario',
        'IMPORTANTE: apos adicionar ou alterar variaveis de ambiente, e necessario fazer um novo deploy',
        'Use o botao "Redeploy" na aba Deployments para forcar novo deploy sem alterar o codigo',
    ]:
        story.append(Paragraph(f'• {item}', st['bullet']))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SECAO 14 — CHECKLIST SETUP
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(section_heading(14, 'Checklist de Setup do Zero', st))
    story.append(Spacer(1, 6))

    story.append(Paragraph('<b>Passo 1 — Criar Projeto Next.js</b>', st['h2']))
    story.append(code_block([
        'npx create-next-app@latest tigrao-tradein \\',
        '  --typescript --tailwind --app --src-dir=false',
        'cd tigrao-tradein',
        'npm install papaparse @supabase/supabase-js',
        'npm install -D @types/papaparse',
    ], st))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Passo 2 — Configurar Google Sheets</b>', st['h2']))
    for item in [
        'Criar Planilha 1: Produtos Novos (colunas: Modelo, Armazenamento, Cor, Preco Pix)',
        'Criar Planilha 2: Avaliacao Usados com as 4 abas conforme Secao 9',
        'Preencher os dados corretos de catalogo, valores base e descontos',
        'Publicar cada aba como CSV individualmente e copiar as URLs',
        'Colar as URLs no .env.local nas variaveis correspondentes',
    ]:
        story.append(Paragraph(f'[ ] {item}', st['bullet']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Passo 3 — Configurar Supabase</b>', st['h2']))
    for item in [
        'Criar projeto no supabase.com (regiao: South America - Sao Paulo)',
        'Executar SQL de criacao da tabela simulacoes (Secao 6)',
        'Executar SQL de permissoes: DISABLE RLS + GRANT ALL (Secao 6)',
        'Copiar URL e chaves JWT legadas para o .env.local',
    ]:
        story.append(Paragraph(f'[ ] {item}', st['bullet']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Passo 4 — Configurar Z-API</b>', st['h2']))
    for item in [
        'Criar conta em z-api.io',
        'Criar instancia e escanear QR Code com WhatsApp da equipe',
        'Habilitar Security Token no painel da instancia',
        'Copiar Instance ID, Token e Client-Token para o .env.local',
    ]:
        story.append(Paragraph(f'[ ] {item}', st['bullet']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Passo 5 — Configurar Vercel e GitHub</b>', st['h2']))
    for item in [
        'Criar repositorio no GitHub (org tigraoimports-a11y)',
        'Fazer git init, adicionar remote, push inicial',
        'Conectar repositorio na Vercel',
        'Adicionar TODAS as variaveis de ambiente na Vercel',
        'Fazer deploy e aguardar build concluir',
    ]:
        story.append(Paragraph(f'[ ] {item}', st['bullet']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Passo 6 — Validar Funcionamento</b>', st['h2']))
    for item in [
        'Abrir app em mobile (iPhone) e completar simulacao do inicio ao fim',
        'Verificar dados da planilha carregando corretamente nas etapas 1 e 2',
        'Clicar "Desejo fechar meu pedido" e confirmar WhatsApp abre com mensagem correta',
        'Verificar simulacao salva no Supabase (Table Editor → simulacoes)',
        'Verificar notificacao Z-API chegando no WhatsApp da equipe',
        'Acessar /admin com a senha e verificar simulacao no dashboard',
    ]:
        story.append(Paragraph(f'[ ] {item}', st['bullet']))
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════════
    # SECAO 15 — ERROS COMUNS
    # ═══════════════════════════════════════════════════════════════════════════
    story.append(section_heading(15, 'Erros Comuns e Solucoes', st))
    story.append(Spacer(1, 6))

    erros_data = [
        ('"your client-token is not configured"',
         'Security Token nao habilitado na Z-API ou ZAPI_CLIENT_TOKEN ausente no .env.local',
         'Painel Z-API → instancia → Security → habilitar Security Token → copiar Client-Token → colar em ZAPI_CLIENT_TOKEN no .env.local → Redeploy na Vercel'),
        ('permission denied for table simulacoes (codigo 42501)',
         'Row Level Security ativo no Supabase ou permissoes insuficientes para a role usada',
         'SQL Editor do Supabase: executar ALTER TABLE simulacoes DISABLE ROW LEVEL SECURITY; e GRANT ALL ON TABLE simulacoes TO service_role, anon, authenticated;'),
        ('Chave Supabase incompativel (formato sb_secret_...)',
         'Usando as novas chaves de API em vez das chaves JWT legadas necessarias pelo cliente JS',
         'Supabase → Project Settings → API Keys → copiar as "Legacy anon, service_role API keys" (formato eyJ...) em vez das chaves no formato sb_secret_...'),
        ('Cards congelados / estado antigo apos reset do formulario',
         'Estado React desatualizado — componentes Step nao recebem novo key ao resetar',
         'Adicionar key={resetKey} nos componentes Step e incrementar resetKey no estado do TradeInCalculator ao chamar a funcao de reset'),
        ('Emojis corrompidos ou caracteres estranhos na mensagem WhatsApp',
         'Caracteres Unicode nao codificados corretamente na URL do deeplink wa.me',
         'Usar encodeURIComponent() envolvendo toda a mensagem antes de concatenar na URL. Evitar interpolacao direta de strings com emojis na URL.'),
        ('Dados desatualizados da planilha apos edicao no Sheets',
         'Cache de 5 minutos do Next.js ainda servindo resposta antiga',
         'Aguardar ate 5 minutos para o cache expirar. Em desenvolvimento usar revalidate: 0 temporariamente. Verificar se a planilha foi salva e publicada corretamente.'),
        ('Build falha na Vercel: Cannot find module papaparse',
         'Dependencia ausente no package.json ou package-lock.json desatualizado',
         'Executar npm install papaparse e npm install -D @types/papaparse localmente. Fazer commit do package-lock.json atualizado. Push para disparar novo build.'),
        ('Fetch da planilha retorna HTML em vez de CSV',
         'URL de publicacao invalida ou planilha nao publicada corretamente no Google Sheets',
         'Arquivo → Compartilhar → Publicar na web → selecionar aba correta → formato CSV → Publicar. Testar a URL diretamente no navegador para confirmar que retorna CSV puro.'),
    ]

    err_style  = ParagraphStyle('ES', fontName='Courier-Bold', fontSize=7.5, leading=10, textColor=HexColor('#CC2222'))
    causa_style = ParagraphStyle('CS', fontName='Helvetica', fontSize=8, leading=11, textColor=TEXT_MAIN)
    sol_style   = ParagraphStyle('SS', fontName='Helvetica', fontSize=8, leading=11, textColor=TEXT_MAIN)
    th_e = ParagraphStyle('THE', fontName='Helvetica-Bold', fontSize=8.5, textColor=colors.white)

    col_w = [44*mm, 54*mm, PAGE_W - 2*MARGIN - 98*mm]
    data_e = [[Paragraph(h, th_e) for h in ['Erro / Mensagem', 'Causa', 'Solucao']]]
    for err, causa, sol in erros_data:
        data_e.append([
            Paragraph(err, err_style),
            Paragraph(causa, causa_style),
            Paragraph(sol, sol_style),
        ])

    t_erros = Table(data_e, colWidths=col_w, repeatRows=1)
    t_erros.setStyle(TableStyle([
        ('BACKGROUND',    (0,0), (-1,0),  ORANGE),
        ('GRID',          (0,0), (-1,-1), 0.4, BORDER),
        ('ROWBACKGROUNDS',(0,1), (-1,-1), [colors.white, ROW_ALT]),
        ('TOPPADDING',    (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING',   (0,0), (-1,-1), 5),
        ('RIGHTPADDING',  (0,0), (-1,-1), 5),
        ('VALIGN',        (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(t_erros)
    story.append(Spacer(1, 14))

    # ── SECAO 16: NOTIFICACOES TELEGRAM — GOOGLE APPS SCRIPT ─────────────────
    story.append(PageBreak())
    story.append(Paragraph('16. Notificacoes Telegram — Google Apps Script', st['h1']))
    story.append(Spacer(1, 6))

    story.append(Paragraph('Objetivo', st['h2']))
    story.append(Paragraph(
        'Notificar o funcionario Nicolas automaticamente no Telegram sempre que um preco '
        'for alterado na planilha Google Sheets de produtos novos. O sistema roda em segundo '
        'plano sem qualquer intervencao manual.',
        st['body']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('Como Funciona', st['h2']))
    steps16 = [
        'Google Apps Script roda automaticamente a cada 10 minutos via acionador baseado em tempo.',
        'Compara os precos atuais da planilha com os precos salvos anteriormente (PropertiesService).',
        'Se houver diferenca, envia mensagem no Telegram do Nicolas com modelo, preco antigo e preco novo.',
        'Atualiza o baseline de precos para a proxima comparacao.',
    ]
    for s in steps16:
        story.append(Paragraph(f'• {s}', st['body']))
    story.append(Spacer(1, 8))

    story.append(Paragraph('Configuracao do Bot Telegram', st['h2']))
    bot_data = [
        ['Item', 'Valor / Instrucao'],
        ['Criacao do bot', '@BotFather no Telegram → /newbot → seguir instrucoes'],
        ['Token do bot', 'Obtido ao criar o bot via @BotFather (ex: 8267667230:AAHD...)'],
        ['Chat ID do Nicolas', '6076216940 (usuario @nicolasft91)'],
        ['Requisito inicial', 'Nicolas deve enviar /start para o bot antes de receber mensagens'],
        ['Como obter Chat ID', 'Enviar mensagem ao bot → acessar api.telegram.org/bot{TOKEN}/getUpdates'],
    ]
    th16 = ParagraphStyle('TH16', fontName='Helvetica-Bold', fontSize=8.5, textColor=colors.white)
    td16 = ParagraphStyle('TD16', fontName='Helvetica', fontSize=8, leading=11, textColor=TEXT_MAIN)
    col_w16 = [55*mm, PAGE_W - 2*MARGIN - 55*mm]
    data_bot = [[Paragraph(h, th16) for h in bot_data[0]]]
    for row in bot_data[1:]:
        data_bot.append([Paragraph(row[0], ParagraphStyle('K', fontName='Helvetica-Bold', fontSize=8, textColor=TEXT_MAIN)),
                         Paragraph(row[1], td16)])
    t_bot = Table(data_bot, colWidths=col_w16)
    t_bot.setStyle(TableStyle([
        ('BACKGROUND',    (0,0), (-1,0),  ORANGE),
        ('GRID',          (0,0), (-1,-1), 0.4, BORDER),
        ('ROWBACKGROUNDS',(0,1), (-1,-1), [colors.white, ROW_ALT]),
        ('TOPPADDING',    (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING',   (0,0), (-1,-1), 5),
        ('RIGHTPADDING',  (0,0), (-1,-1), 5),
        ('VALIGN',        (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(t_bot)
    story.append(Spacer(1, 10))

    story.append(Paragraph('Codigo Google Apps Script', st['h2']))
    code16 = (
        "const BOT_TOKEN = 'SEU_TOKEN_AQUI';\n"
        "const CHAT_ID = '6076216940';\n"
        "const SHEET_CSV_URL = 'URL_DA_PLANILHA_CSV';\n\n"
        "function verificarAlteracoes() {\n"
        "  const props = PropertiesService.getScriptProperties();\n"
        "  const anterior = JSON.parse(props.getProperty('precos') || '{}');\n\n"
        "  const response = UrlFetchApp.fetch(SHEET_CSV_URL);\n"
        "  const csv = response.getContentText();\n"
        "  const linhas = Utilities.parseCsv(csv);\n\n"
        "  const atual = {};\n"
        "  const alteracoes = [];\n\n"
        "  for (let i = 1; i < linhas.length; i++) {\n"
        "    const [modelo, storage, preco] = linhas[i];\n"
        "    if (!modelo || !preco) continue;\n"
        "    const key = `${modelo} ${storage}`;\n"
        "    atual[key] = preco;\n"
        "    if (anterior[key] && anterior[key] !== preco) {\n"
        "      alteracoes.push(`${key} | Antes: R$ ${anterior[key]} | Agora: R$ ${preco}`);\n"
        "    }\n"
        "  }\n\n"
        "  if (alteracoes.length > 0) {\n"
        "    const msg = 'ALTERACAO DE PRECOS - TigraoimportsImports\\n\\n' + alteracoes.join('\\n');\n"
        "    enviarTelegram(msg);\n"
        "  }\n"
        "  props.setProperty('precos', JSON.stringify(atual));\n"
        "}\n\n"
        "function enviarTelegram(msg) {\n"
        "  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;\n"
        "  UrlFetchApp.fetch(url, {\n"
        "    method: 'post',\n"
        "    contentType: 'application/json',\n"
        "    payload: JSON.stringify({ chat_id: CHAT_ID, text: msg })\n"
        "  });\n"
        "}\n\n"
        "function inicializar() {\n"
        "  verificarAlteracoes(); // Salva baseline inicial\n"
        "}"
    )
    story.append(Paragraph(code16.replace('\n', '<br/>').replace(' ', '&nbsp;'), st['code']))
    story.append(Spacer(1, 10))

    story.append(Paragraph('Passo a Passo de Configuracao', st['h2']))
    passos16 = [
        '1. Abrir a planilha de produtos no Google Sheets.',
        '2. Clicar em Extensoes → Apps Script.',
        '3. Colar o codigo acima no editor (substituindo qualquer codigo existente).',
        '4. Substituir SEU_TOKEN_AQUI pelo token real do bot e URL_DA_PLANILHA_CSV pela URL da planilha publicada como CSV.',
        '5. Clicar em Executar → selecionar a funcao inicializar → Executar (autorizar permissoes quando solicitado). Isso salva o baseline de precos.',
        '6. Clicar no icone de relogio (Acionadores) → + Adicionar acionador.',
        '7. Configurar: Funcao = verificarAlteracoes | Origem = Baseado no tempo | Tipo = Contador de minutos | Intervalo = A cada 10 minutos.',
        '8. Salvar. Autorizar pop-up do Google se necessario (desabilitar bloqueador de pop-ups para script.google.com).',
    ]
    for p in passos16:
        story.append(Paragraph(p, st['body']))
    story.append(Spacer(1, 10))

    story.append(Paragraph('Fluxo Completo ao Alterar um Preco', st['h2']))
    story.append(Paragraph(
        'Quando Andre altera qualquer preco na planilha Google Sheets, dois sistemas '
        'sao atualizados automaticamente, sem nenhuma intervencao adicional:',
        st['body']))
    story.append(Spacer(1, 4))
    fluxo16 = [
        ['Acao', 'Sistema', 'Destino', 'Latencia'],
        ['Andre altera preco na planilha', 'Google Apps Script + Telegram', 'Nicolas (funcionario)', 'Ate 10 minutos'],
        ['Andre altera preco na planilha', 'Cache Next.js expira', 'App de trade-in (publico)', 'Ate 5 minutos'],
        ['Cliente faz simulacao', 'Z-API WhatsApp', 'Andre (lojista)', 'Imediato'],
        ['Admin clica em Whats no dashboard', 'Z-API Follow-up', 'Cliente', 'Imediato'],
    ]
    th_f = ParagraphStyle('THF', fontName='Helvetica-Bold', fontSize=8, textColor=colors.white)
    td_f = ParagraphStyle('TDF', fontName='Helvetica', fontSize=8, leading=11, textColor=TEXT_MAIN)
    col_wf = [52*mm, 52*mm, 40*mm, PAGE_W - 2*MARGIN - 144*mm]
    data_fl = [[Paragraph(h, th_f) for h in fluxo16[0]]]
    for row in fluxo16[1:]:
        data_fl.append([Paragraph(c, td_f) for c in row])
    t_fl = Table(data_fl, colWidths=col_wf)
    t_fl.setStyle(TableStyle([
        ('BACKGROUND',    (0,0), (-1,0),  ORANGE),
        ('GRID',          (0,0), (-1,-1), 0.4, BORDER),
        ('ROWBACKGROUNDS',(0,1), (-1,-1), [colors.white, ROW_ALT]),
        ('TOPPADDING',    (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING',   (0,0), (-1,-1), 5),
        ('RIGHTPADDING',  (0,0), (-1,-1), 5),
        ('VALIGN',        (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(t_fl)
    story.append(Spacer(1, 14))

    story.append(HRFlowable(width='100%', thickness=1, color=ORANGE, spaceAfter=8))
    story.append(Paragraph(
        'Documentacao gerada em Marco de 2026. Para duvidas ou atualizacoes, '
        'entre em contato com Andre via WhatsApp ou email.',
        st['note']))

    return story


# ── Main ──────────────────────────────────────────────────────────────────────
def build_pdf(output_path):
    st = make_styles()

    doc = BaseDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=18*mm,
        bottomMargin=20*mm,
        title='TigraoImports Trade-In Calculator — Documentacao Tecnica',
        author='TigraoImports',
    )

    # Frames
    frame_cover = Frame(0, 0, PAGE_W, PAGE_H,
                        leftPadding=0, rightPadding=0,
                        topPadding=0, bottomPadding=0,
                        id='cover_frame')
    frame_body  = Frame(MARGIN, 20*mm,
                        PAGE_W - 2*MARGIN, PAGE_H - 38*mm,
                        leftPadding=0, rightPadding=0,
                        topPadding=0, bottomPadding=0,
                        id='body_frame')

    pt_cover  = PageTemplate(id='cover',  frames=[frame_cover], onPage=on_page_cover)
    pt_normal = PageTemplate(id='normal', frames=[frame_body],  onPage=on_page_normal)
    doc.addPageTemplates([pt_cover, pt_normal])

    story = []
    story.append(NextPageTemplate('cover'))
    story.append(PageBreak())
    story.append(NextPageTemplate('normal'))
    story.append(PageBreak())
    story.extend(build_story(st))

    doc.build(story)
    print(f'PDF gerado com sucesso: {output_path}')


if __name__ == '__main__':
    output = "/Users/andrefelippe/Library/Mobile Documents/com~apple~CloudDocs/CLAUDE MD/tigrao-tradein/DOCUMENTACAO_TECNICA_TIGRAOIMPORTS.pdf"
    build_pdf(output)
