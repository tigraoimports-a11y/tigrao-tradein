#!/usr/bin/env python3
"""
Relatório PDF Semanal + Mensal — TigrãoImports
Gera um PDF completo com dados de vendas, gastos, saldos e estoque.
"""

import os, sys, json
from datetime import datetime, timedelta, date
from collections import defaultdict

# ── Supabase ────────────────────────────────────────────────
from supabase import create_client

SUPABASE_URL = "https://fohhlehrqtwruzxjzrql.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvaGhsZWhycXR3cnV6eGp6cnFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg1OTI1MiwiZXhwIjoyMDg5NDM1MjUyfQ.l0655fvNwRljhyDZl8ODW5H2HS3PH7rZb1Kjx5TJXvg"

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── ReportLab ───────────────────────────────────────────────
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

# ── Cores da marca ──────────────────────────────────────────
ORANGE = HexColor("#E8740E")
DARK = HexColor("#1D1D1F")
GRAY = HexColor("#86868B")
LIGHT_BG = HexColor("#F5F5F7")
GREEN = HexColor("#2ECC71")
RED = HexColor("#E74C3C")
WHITE = white

# ── Helpers ─────────────────────────────────────────────────
def fmt(v):
    """Formata número como R$ X.XXX"""
    if v is None: v = 0
    v = float(v)
    sign = "-" if v < 0 else ""
    v = abs(v)
    intpart = int(round(v))
    s = f"{intpart:,}".replace(",", ".")
    return f"{sign}R$ {s}"

def fmt2(v):
    """Formata com 2 casas decimais"""
    if v is None: v = 0
    v = float(v)
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def pct(v):
    if v is None: return "0%"
    return f"{float(v):.1f}%"

def data_br(iso):
    if not iso: return "—"
    try:
        d = datetime.strptime(str(iso)[:10], "%Y-%m-%d")
        return d.strftime("%d/%m/%Y")
    except: return str(iso)

def dia_semana(iso):
    dias = ["Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo"]
    try:
        d = datetime.strptime(str(iso)[:10], "%Y-%m-%d")
        return dias[d.weekday()]
    except: return ""

# ── Buscar dados ────────────────────────────────────────────
print("Buscando dados do Supabase...")

hoje = date.today()
inicio_mes = hoje.replace(day=1)
fim_mes = hoje

# Semana atual (seg-dom)
dia_semana_idx = hoje.weekday()  # 0=seg
inicio_semana = hoje - timedelta(days=dia_semana_idx)
fim_semana = inicio_semana + timedelta(days=6)

# Semana anterior
inicio_semana_ant = inicio_semana - timedelta(days=7)
fim_semana_ant = inicio_semana - timedelta(days=1)

def fetch_all(table, query_fn):
    """Paginate through all results"""
    all_data = []
    offset = 0
    batch = 1000
    while True:
        q = query_fn(sb.table(table))
        resp = q.range(offset, offset + batch - 1).execute()
        if not resp.data:
            break
        all_data.extend(resp.data)
        if len(resp.data) < batch:
            break
        offset += batch
    return all_data

# Vendas do mês
vendas_mes = fetch_all("vendas", lambda q: (
    q.select("*")
    .gte("data", inicio_mes.isoformat())
    .lte("data", fim_mes.isoformat())
    .neq("status_pagamento", "CANCELADO")
))
print(f"  Vendas mes: {len(vendas_mes)}")

# Gastos do mês (excluir transferências)
gastos_mes_raw = fetch_all("gastos", lambda q: (
    q.select("*")
    .gte("data", inicio_mes.isoformat())
    .lte("data", fim_mes.isoformat())
    .eq("tipo", "SAIDA")
))
gastos_mes = [g for g in gastos_mes_raw if not g.get("is_dep_esp")]
print(f"  Gastos mes: {len(gastos_mes)}")

# Saldos (último registro)
saldos_resp = sb.table("saldos_bancarios").select("*").order("data", desc=True).limit(2).execute()
saldos = saldos_resp.data if saldos_resp.data else []
print(f"  Saldos: {len(saldos)} registros")

# Estoque
estoque_resp = sb.table("estoque").select("produto, qnt, custo_unitario, categoria, status, tipo").eq("status", "EM ESTOQUE").execute()
estoque = estoque_resp.data or []
print(f"  Estoque: {len(estoque)} itens")

# ── Processar dados ─────────────────────────────────────────
print("Processando dados...")

# --- MES ---
vendas_count = len(vendas_mes)
faturamento = sum(float(v.get("preco_vendido") or 0) for v in vendas_mes)
custo_total = sum(float(v.get("custo") or 0) for v in vendas_mes)
lucro_total = sum(float(v.get("lucro") or 0) for v in vendas_mes)
margem_media = (lucro_total / faturamento * 100) if faturamento > 0 else 0
ticket_medio = faturamento / vendas_count if vendas_count > 0 else 0
gastos_total = sum(float(g.get("valor") or 0) for g in gastos_mes)
lucro_liquido = lucro_total - gastos_total

# Por tipo
por_tipo = defaultdict(lambda: {"qty": 0, "receita": 0, "lucro": 0})
for v in vendas_mes:
    t = v.get("tipo") or "VENDA"
    por_tipo[t]["qty"] += 1
    por_tipo[t]["receita"] += float(v.get("preco_vendido") or 0)
    por_tipo[t]["lucro"] += float(v.get("lucro") or 0)

# Por origem
por_origem = defaultdict(lambda: {"qty": 0, "receita": 0})
for v in vendas_mes:
    o = v.get("origem") or "NAO_INFORMARAM"
    por_origem[o]["qty"] += 1
    por_origem[o]["receita"] += float(v.get("preco_vendido") or 0)

# Por forma de pagamento
por_forma = defaultdict(lambda: {"qty": 0, "receita": 0})
for v in vendas_mes:
    f = v.get("forma") or "—"
    por_forma[f]["qty"] += 1
    por_forma[f]["receita"] += float(v.get("preco_vendido") or 0)

# Por banco
por_banco = defaultdict(lambda: {"qty": 0, "receita": 0})
for v in vendas_mes:
    b = v.get("banco") or "—"
    por_banco[b]["qty"] += 1
    por_banco[b]["receita"] += float(v.get("preco_vendido") or 0)

# Gastos por categoria
gastos_por_cat = defaultdict(float)
for g in gastos_mes:
    cat = g.get("categoria") or "OUTROS"
    gastos_por_cat[cat] += float(g.get("valor") or 0)

# Por dia da semana
por_dia = defaultdict(lambda: {"qty": 0, "receita": 0, "lucro": 0})
for v in vendas_mes:
    ds = dia_semana(v.get("data"))
    por_dia[ds]["qty"] += 1
    por_dia[ds]["receita"] += float(v.get("preco_vendido") or 0)
    por_dia[ds]["lucro"] += float(v.get("lucro") or 0)

# Por dia (timeline)
por_data = defaultdict(lambda: {"qty": 0, "receita": 0, "lucro": 0, "custo": 0})
for v in vendas_mes:
    d = v.get("data", "")[:10]
    por_data[d]["qty"] += 1
    por_data[d]["receita"] += float(v.get("preco_vendido") or 0)
    por_data[d]["lucro"] += float(v.get("lucro") or 0)
    por_data[d]["custo"] += float(v.get("custo") or 0)

# Top produtos
top_produtos = defaultdict(lambda: {"qty": 0, "receita": 0, "lucro": 0})
for v in vendas_mes:
    p = v.get("produto") or "—"
    top_produtos[p]["qty"] += 1
    top_produtos[p]["receita"] += float(v.get("preco_vendido") or 0)
    top_produtos[p]["lucro"] += float(v.get("lucro") or 0)
top_prod_sorted = sorted(top_produtos.items(), key=lambda x: x[1]["qty"], reverse=True)[:15]

# Top clientes
top_clientes = defaultdict(lambda: {"qty": 0, "total": 0, "lucro": 0})
for v in vendas_mes:
    c = (v.get("cliente") or "").strip().upper()
    if not c: continue
    top_clientes[c]["qty"] += 1
    top_clientes[c]["total"] += float(v.get("preco_vendido") or 0)
    top_clientes[c]["lucro"] += float(v.get("lucro") or 0)
top_cli_sorted = sorted(top_clientes.items(), key=lambda x: x[1]["total"], reverse=True)[:10]

# Estoque resumo
estoque_valor = sum(float(e.get("custo_unitario") or 0) * int(e.get("qnt") or 0) for e in estoque)
estoque_qtd = sum(int(e.get("qnt") or 0) for e in estoque)
estoque_por_cat = defaultdict(lambda: {"qty": 0, "valor": 0})
for e in estoque:
    cat = e.get("categoria") or "OUTROS"
    q = int(e.get("qnt") or 0)
    val = float(e.get("custo_unitario") or 0) * q
    estoque_por_cat[cat]["qty"] += q
    estoque_por_cat[cat]["valor"] += val

# Saldos bancários
saldo_atual = saldos[0] if saldos else {}
saldo_itau = float(saldo_atual.get("esp_itau") or 0)
saldo_inf = float(saldo_atual.get("esp_inf") or 0)
saldo_mp = float(saldo_atual.get("esp_mp") or 0)
saldo_esp = float(saldo_atual.get("esp_especie") or 0)
saldo_total = saldo_itau + saldo_inf + saldo_mp + saldo_esp

# Semana atual vs anterior
vendas_semana = [v for v in vendas_mes if inicio_semana.isoformat() <= v.get("data", "")[:10] <= fim_semana.isoformat()]
vendas_semana_ant_list = fetch_all("vendas", lambda q: (
    q.select("preco_vendido, lucro, custo, tipo")
    .gte("data", inicio_semana_ant.isoformat())
    .lte("data", fim_semana_ant.isoformat())
    .neq("status_pagamento", "CANCELADO")
))

sem_qty = len(vendas_semana)
sem_fat = sum(float(v.get("preco_vendido") or 0) for v in vendas_semana)
sem_lucro = sum(float(v.get("lucro") or 0) for v in vendas_semana)

sem_ant_qty = len(vendas_semana_ant_list)
sem_ant_fat = sum(float(v.get("preco_vendido") or 0) for v in vendas_semana_ant_list)
sem_ant_lucro = sum(float(v.get("lucro") or 0) for v in vendas_semana_ant_list)

# ── GERAR PDF ───────────────────────────────────────────────
print("Gerando PDF...")

OUTPUT = os.path.expanduser(f"~/Desktop/TigraoImports_Relatorio_{hoje.strftime('%Y-%m-%d')}.pdf")

doc = SimpleDocTemplate(
    OUTPUT, pagesize=A4,
    topMargin=1.5*cm, bottomMargin=1.5*cm,
    leftMargin=1.5*cm, rightMargin=1.5*cm,
    title=f"TigraoImports - Relatorio {hoje.strftime('%d/%m/%Y')}",
    author="TigraoImports"
)

styles = getSampleStyleSheet()

# Custom styles
styles.add(ParagraphStyle("TigraoTitle", parent=styles["Title"], fontSize=22, textColor=ORANGE, spaceAfter=4*mm))
styles.add(ParagraphStyle("TigraoH1", parent=styles["Heading1"], fontSize=16, textColor=DARK, spaceBefore=8*mm, spaceAfter=4*mm, borderWidth=0))
styles.add(ParagraphStyle("TigraoH2", parent=styles["Heading2"], fontSize=13, textColor=ORANGE, spaceBefore=6*mm, spaceAfter=3*mm))
styles.add(ParagraphStyle("TigraoBody", parent=styles["Normal"], fontSize=9, textColor=DARK, leading=13))
styles.add(ParagraphStyle("TigraoSmall", parent=styles["Normal"], fontSize=8, textColor=GRAY, leading=10))
styles.add(ParagraphStyle("TigraoRight", parent=styles["Normal"], fontSize=9, textColor=DARK, alignment=TA_RIGHT))
styles.add(ParagraphStyle("TigraoCenter", parent=styles["Normal"], fontSize=9, textColor=DARK, alignment=TA_CENTER))
styles.add(ParagraphStyle("KpiValue", parent=styles["Normal"], fontSize=18, textColor=ORANGE, alignment=TA_CENTER, leading=22))
styles.add(ParagraphStyle("KpiLabel", parent=styles["Normal"], fontSize=8, textColor=GRAY, alignment=TA_CENTER, leading=10))

story = []

# ── HEADER ──────────────────────────────────────────────────
story.append(Paragraph("TigraoImports", styles["TigraoTitle"]))
story.append(Paragraph(f"Relatorio Gerencial — {hoje.strftime('%d/%m/%Y')}", styles["TigraoBody"]))
story.append(Paragraph(f"Periodo: {data_br(inicio_mes)} a {data_br(fim_mes)}", styles["TigraoSmall"]))
story.append(Spacer(1, 8*mm))

# ── KPIs MENSAIS ────────────────────────────────────────────
story.append(Paragraph("RESUMO DO MES", styles["TigraoH1"]))

kpi_data = [
    [Paragraph("VENDAS", styles["KpiLabel"]),
     Paragraph("FATURAMENTO", styles["KpiLabel"]),
     Paragraph("LUCRO BRUTO", styles["KpiLabel"]),
     Paragraph("MARGEM", styles["KpiLabel"]),
     Paragraph("TICKET MEDIO", styles["KpiLabel"])],
    [Paragraph(str(vendas_count), styles["KpiValue"]),
     Paragraph(fmt(faturamento), styles["KpiValue"]),
     Paragraph(fmt(lucro_total), styles["KpiValue"]),
     Paragraph(pct(margem_media), styles["KpiValue"]),
     Paragraph(fmt(ticket_medio), styles["KpiValue"])],
]
kpi_table = Table(kpi_data, colWidths=[doc.width/5]*5)
kpi_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
    ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#D2D2D7")),
    ("INNERGRID", (0, 0), (-1, -1), 0.25, HexColor("#D2D2D7")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 4*mm),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4*mm),
]))
story.append(kpi_table)
story.append(Spacer(1, 3*mm))

# Gastos e lucro líquido
kpi2_data = [
    [Paragraph("GASTOS OPERACIONAIS", styles["KpiLabel"]),
     Paragraph("LUCRO LIQUIDO", styles["KpiLabel"]),
     Paragraph("CUSTO TOTAL", styles["KpiLabel"])],
    [Paragraph(fmt(gastos_total), ParagraphStyle("kv2", parent=styles["KpiValue"], textColor=RED)),
     Paragraph(fmt(lucro_liquido), ParagraphStyle("kv3", parent=styles["KpiValue"], textColor=GREEN if lucro_liquido > 0 else RED)),
     Paragraph(fmt(custo_total), styles["KpiValue"])],
]
kpi2_table = Table(kpi2_data, colWidths=[doc.width/3]*3)
kpi2_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
    ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#D2D2D7")),
    ("INNERGRID", (0, 0), (-1, -1), 0.25, HexColor("#D2D2D7")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 4*mm),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4*mm),
]))
story.append(kpi2_table)

# ── TIPOS DE VENDA ──────────────────────────────────────────
story.append(Paragraph("VENDAS POR TIPO", styles["TigraoH2"]))
tipo_data = [["Tipo", "Qtd", "Faturamento", "Lucro", "Margem"]]
for t, d in sorted(por_tipo.items(), key=lambda x: x[1]["receita"], reverse=True):
    m = (d["lucro"] / d["receita"] * 100) if d["receita"] > 0 else 0
    tipo_data.append([t, str(d["qty"]), fmt(d["receita"]), fmt(d["lucro"]), pct(m)])
story.append(_make_table(tipo_data, [doc.width*0.25, doc.width*0.12, doc.width*0.25, doc.width*0.22, doc.width*0.16]))

# ── ORIGENS ─────────────────────────────────────────────────
story.append(Paragraph("VENDAS POR ORIGEM", styles["TigraoH2"]))
orig_data = [["Origem", "Qtd", "Faturamento", "% do Total"]]
for o, d in sorted(por_origem.items(), key=lambda x: x[1]["qty"], reverse=True):
    p = (d["qty"] / vendas_count * 100) if vendas_count > 0 else 0
    orig_data.append([o, str(d["qty"]), fmt(d["receita"]), pct(p)])
story.append(_make_table(orig_data, [doc.width*0.30, doc.width*0.15, doc.width*0.30, doc.width*0.25]))

# ── FORMAS DE PAGAMENTO ─────────────────────────────────────
story.append(Paragraph("FORMAS DE PAGAMENTO", styles["TigraoH2"]))
forma_data = [["Forma", "Qtd", "Faturamento", "% do Total"]]
for f, d in sorted(por_forma.items(), key=lambda x: x[1]["receita"], reverse=True):
    p = (d["receita"] / faturamento * 100) if faturamento > 0 else 0
    forma_data.append([f, str(d["qty"]), fmt(d["receita"]), pct(p)])
story.append(_make_table(forma_data, [doc.width*0.30, doc.width*0.15, doc.width*0.30, doc.width*0.25]))

# ── BANCOS ──────────────────────────────────────────────────
story.append(Paragraph("VENDAS POR BANCO", styles["TigraoH2"]))
banco_data = [["Banco", "Qtd", "Faturamento", "% do Total"]]
for b, d in sorted(por_banco.items(), key=lambda x: x[1]["receita"], reverse=True):
    p = (d["receita"] / faturamento * 100) if faturamento > 0 else 0
    banco_data.append([b, str(d["qty"]), fmt(d["receita"]), pct(p)])
story.append(_make_table(banco_data, [doc.width*0.30, doc.width*0.15, doc.width*0.30, doc.width*0.25]))

# ── GASTOS POR CATEGORIA ────────────────────────────────────
story.append(PageBreak())
story.append(Paragraph("GASTOS POR CATEGORIA", styles["TigraoH1"]))
gasto_data = [["Categoria", "Valor", "% do Total"]]
for cat, val in sorted(gastos_por_cat.items(), key=lambda x: x[1], reverse=True):
    p = (val / gastos_total * 100) if gastos_total > 0 else 0
    gasto_data.append([cat, fmt(val), pct(p)])
gasto_data.append(["TOTAL", fmt(gastos_total), "100%"])
story.append(_make_table(gasto_data, [doc.width*0.45, doc.width*0.30, doc.width*0.25], highlight_last=True))

# ── TOP 15 PRODUTOS ─────────────────────────────────────────
story.append(Paragraph("TOP 15 PRODUTOS MAIS VENDIDOS", styles["TigraoH2"]))
prod_data = [["#", "Produto", "Qtd", "Faturamento", "Lucro"]]
for i, (nome, d) in enumerate(top_prod_sorted):
    prod_data.append([str(i+1), nome[:50], str(d["qty"]), fmt(d["receita"]), fmt(d["lucro"])])
story.append(_make_table(prod_data, [doc.width*0.06, doc.width*0.44, doc.width*0.10, doc.width*0.20, doc.width*0.20]))

# ── TOP 10 CLIENTES ─────────────────────────────────────────
story.append(Paragraph("TOP 10 CLIENTES", styles["TigraoH2"]))
cli_data = [["#", "Cliente", "Compras", "Total Gasto", "Lucro"]]
for i, (nome, d) in enumerate(top_cli_sorted):
    cli_data.append([str(i+1), nome[:40], str(d["qty"]), fmt(d["total"]), fmt(d["lucro"])])
story.append(_make_table(cli_data, [doc.width*0.06, doc.width*0.38, doc.width*0.12, doc.width*0.22, doc.width*0.22]))

# ── VENDAS POR DIA DA SEMANA ────────────────────────────────
story.append(PageBreak())
story.append(Paragraph("VENDAS POR DIA DA SEMANA", styles["TigraoH1"]))
dias_ordem = ["Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo"]
dia_data = [["Dia", "Qtd", "Faturamento", "Lucro", "Ticket Medio"]]
for ds in dias_ordem:
    d = por_dia.get(ds, {"qty": 0, "receita": 0, "lucro": 0})
    tk = d["receita"] / d["qty"] if d["qty"] > 0 else 0
    dia_data.append([ds, str(d["qty"]), fmt(d["receita"]), fmt(d["lucro"]), fmt(tk)])
story.append(_make_table(dia_data, [doc.width*0.20, doc.width*0.12, doc.width*0.25, doc.width*0.22, doc.width*0.21]))

# ── VENDAS DIÁRIAS ──────────────────────────────────────────
story.append(Paragraph("VENDAS POR DIA (TIMELINE)", styles["TigraoH2"]))
timeline_data = [["Data", "Dia", "Qtd", "Faturamento", "Custo", "Lucro"]]
for d_iso in sorted(por_data.keys()):
    d = por_data[d_iso]
    ds = dia_semana(d_iso)
    timeline_data.append([data_br(d_iso), ds[:3], str(d["qty"]), fmt(d["receita"]), fmt(d["custo"]), fmt(d["lucro"])])
story.append(_make_table(timeline_data, [doc.width*0.17, doc.width*0.10, doc.width*0.08, doc.width*0.22, doc.width*0.22, doc.width*0.21]))

# ── COMPARATIVO SEMANAL ─────────────────────────────────────
story.append(PageBreak())
story.append(Paragraph("COMPARATIVO SEMANAL", styles["TigraoH1"]))
story.append(Paragraph(f"Semana atual: {data_br(inicio_semana)} a {data_br(fim_semana)}", styles["TigraoSmall"]))
story.append(Paragraph(f"Semana anterior: {data_br(inicio_semana_ant)} a {data_br(fim_semana_ant)}", styles["TigraoSmall"]))
story.append(Spacer(1, 4*mm))

def var_pct(atual, anterior):
    if anterior == 0: return "—"
    v = ((atual - anterior) / anterior) * 100
    sinal = "+" if v > 0 else ""
    return f"{sinal}{v:.1f}%"

comp_data = [
    ["Metrica", "Semana Anterior", "Semana Atual", "Variacao"],
    ["Vendas", str(sem_ant_qty), str(sem_qty), var_pct(sem_qty, sem_ant_qty)],
    ["Faturamento", fmt(sem_ant_fat), fmt(sem_fat), var_pct(sem_fat, sem_ant_fat)],
    ["Lucro", fmt(sem_ant_lucro), fmt(sem_lucro), var_pct(sem_lucro, sem_ant_lucro)],
    ["Ticket Medio", fmt(sem_ant_fat/sem_ant_qty if sem_ant_qty else 0), fmt(sem_fat/sem_qty if sem_qty else 0), ""],
]
story.append(_make_table(comp_data, [doc.width*0.25, doc.width*0.25, doc.width*0.25, doc.width*0.25]))

# ── SALDOS BANCÁRIOS ────────────────────────────────────────
story.append(Paragraph("SALDOS BANCARIOS", styles["TigraoH1"]))
story.append(Paragraph(f"Data referencia: {data_br(saldo_atual.get('data', ''))}", styles["TigraoSmall"]))
story.append(Spacer(1, 3*mm))

saldo_data = [
    ["Banco", "Saldo"],
    ["Itau", fmt2(saldo_itau)],
    ["Infinite", fmt2(saldo_inf)],
    ["Mercado Pago", fmt2(saldo_mp)],
    ["Especie", fmt2(saldo_esp)],
    ["TOTAL", fmt2(saldo_total)],
]
story.append(_make_table(saldo_data, [doc.width*0.50, doc.width*0.50], highlight_last=True))

# ── ESTOQUE ─────────────────────────────────────────────────
story.append(Paragraph("ESTOQUE ATUAL", styles["TigraoH2"]))
story.append(Paragraph(f"{estoque_qtd} unidades | Valor total: {fmt(estoque_valor)}", styles["TigraoBody"]))
story.append(Spacer(1, 3*mm))

est_data = [["Categoria", "Qtd", "Valor Total", "% do Estoque"]]
for cat, d in sorted(estoque_por_cat.items(), key=lambda x: x[1]["valor"], reverse=True):
    p = (d["valor"] / estoque_valor * 100) if estoque_valor > 0 else 0
    est_data.append([cat, str(d["qty"]), fmt(d["valor"]), pct(p)])
est_data.append(["TOTAL", str(estoque_qtd), fmt(estoque_valor), "100%"])
story.append(_make_table(est_data, [doc.width*0.35, doc.width*0.15, doc.width*0.30, doc.width*0.20], highlight_last=True))

# ── PATRIMÔNIO ──────────────────────────────────────────────
story.append(Paragraph("PATRIMONIO TOTAL", styles["TigraoH2"]))
patrimonio = saldo_total + estoque_valor
pat_data = [
    ["Componente", "Valor", "% do Total"],
    ["Saldos Bancarios", fmt2(saldo_total), pct(saldo_total/patrimonio*100 if patrimonio > 0 else 0)],
    ["Estoque", fmt(estoque_valor), pct(estoque_valor/patrimonio*100 if patrimonio > 0 else 0)],
    ["PATRIMONIO TOTAL", fmt2(patrimonio), "100%"],
]
story.append(_make_table(pat_data, [doc.width*0.40, doc.width*0.35, doc.width*0.25], highlight_last=True))

# ── Rodapé ──────────────────────────────────────────────────
story.append(Spacer(1, 10*mm))
story.append(Paragraph(f"Gerado automaticamente em {datetime.now().strftime('%d/%m/%Y as %H:%M')}", styles["TigraoSmall"]))
story.append(Paragraph("TigraoImports — Sistema de Gestao", styles["TigraoSmall"]))

# ── Build ───────────────────────────────────────────────────
doc.build(story)
print(f"\nPDF gerado com sucesso: {OUTPUT}")
