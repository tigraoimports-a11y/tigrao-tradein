#!/usr/bin/env python3
"""
Exporta planilhas Numbers de vendas (Jan 2025 → Fev 2026) para JSON.
Formato compatível com a tabela `vendas` do Supabase.

Uso: python3 scripts/export-numbers-to-json.py
Saída: scripts/vendas-historicas.json
"""

import numbers_parser
import json
import os
import re
import warnings

warnings.filterwarnings("ignore")

# Mapeamento de meses
MESES = {
    "JANEIRO": "01", "FEVEREIRO": "02", "MARÇO": "03", "MARCO": "03",
    "ABRIL": "04", "MAIO": "05", "JUNHO": "06",
    "JULHO": "07", "AGOSTO": "08", "SETEMBRO": "09",
    "OUTUBRO": "10", "NOVEMBRO": "11", "DEZEMBRO": "12",
}

# Arquivos a processar, em ordem cronológica
# (path, year, month)
BASE_2025 = "/Users/andrefelippe/Library/Mobile Documents/com~apple~Numbers/Documents/VENDAS 2025/"
BASE_ROOT = "/Users/andrefelippe/Library/Mobile Documents/com~apple~Numbers/Documents/"

FILES = [
    (BASE_2025 + "VENDAS JANEIRO 2025.numbers", 2025, 1),
    (BASE_2025 + "VENDAS FEVEREIRO.numbers", 2025, 2),
    (BASE_2025 + "VENDAS MARÇO 2025.numbers", 2025, 3),
    (BASE_2025 + "VENDA ABRIL 2025.numbers", 2025, 4),
    (BASE_2025 + "VENDAS MAIO 2025.numbers", 2025, 5),
    (BASE_2025 + "VENDA JUNHO 2025.numbers", 2025, 6),
    (BASE_2025 + "VENDA JULHO 2.025.numbers", 2025, 7),
    (BASE_2025 + "VENDAS AGOSTO 2025.numbers", 2025, 8),
    (BASE_2025 + "VENDAS SETEMBRO 2025.numbers", 2025, 9),
    (BASE_2025 + "VENDA OUTUBRO 2.025.numbers", 2025, 10),
    (BASE_2025 + "Vendas Novembro 2025.numbers", 2025, 11),
    (BASE_2025 + "Vendas Dezembro 2025.numbers", 2025, 12),
    (BASE_ROOT + "VENDAS JANEIRO 2.026.numbers", 2026, 1),
    (BASE_ROOT + "VENDAS FEVEREIRO 2026.numbers", 2026, 2),
]

# Colunas do header que queremos mapear (case-insensitive, stripped)
# O index das colunas varia entre planilhas, então buscar pelo header
COL_MAP = {
    "CLIENTE": "cliente",
    "FONTE": "origem",
    "TIPO": "tipo",
    "DATA": "dia",
    "PRODUTO": "produto",
    "FORNECEDOR": "fornecedor",
    "CUSTO": "custo",
    "PRECO VENDIDO": "preco_vendido",
    "PREÇO VENDIDO": "preco_vendido",
    "LUCRO": "lucro",
    "MARGEM %": "margem_pct",
    "LOCAL": "local",
    "VENDEDOR": "vendedor",
    # Colunas de gastos (capturar separadamente)
    "CUSTOS EMPRESA": "gasto_valor",
    "DESTINO": "gasto_destino",
    "MOTOBOY": "gasto_motoboy",
    "MOTOBOY RJ": "gasto_motoboy_rj",
    "MOTOBOY SP": "gasto_motoboy_sp",
    "CORREIOS": "gasto_correios",
    "MARKETING": "gasto_marketing",
}


def normalize_header(h):
    """Normaliza um header para busca no COL_MAP"""
    h = h.strip().upper().replace("Ç", "C").replace("É", "E").replace("Ã", "A").replace("Á", "A").replace("Õ", "O").replace("Ó", "O")
    return h


def find_col_indices(table):
    """Encontra os índices das colunas pelo header"""
    indices = {}
    for c in range(table.num_cols):
        val = table.cell(0, c).value
        if val is None:
            continue
        h = normalize_header(str(val))
        for key, mapped in COL_MAP.items():
            if normalize_header(key) == h:
                indices[mapped] = c
                break
    return indices


def safe_float(val):
    """Converte valor para float, retorna 0.0 se falhar"""
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def safe_str(val):
    """Converte valor para string limpa"""
    if val is None:
        return ""
    s = str(val).strip()
    if s.lower() in ("none", "nan", ""):
        return ""
    return s


def normalize_tipo(tipo):
    """Normaliza o tipo de venda"""
    t = tipo.upper().strip()
    if t in ("VENDA", "VENDAS"):
        return "VENDA"
    if t in ("UPGRADE", "TROCA"):
        return "UPGRADE"
    if t in ("ATACADO",):
        return "ATACADO"
    return "VENDA"


def normalize_origem(origem):
    """Normaliza a origem"""
    o = origem.upper().strip()
    if "ANUNC" in o or "ANÚNC" in o:
        return "ANUNCIO"
    if "RECOMPRA" in o:
        return "RECOMPRA"
    if "INDICAC" in o or "INDICAÇ" in o:
        return "INDICACAO"
    if "ATACADO" in o:
        return "ATACADO"
    return "ANUNCIO"


def normalize_local(local):
    """Normaliza o local"""
    l = local.upper().strip()
    if "ENTREGA" in l:
        return "ENTREGA"
    if "RETIRADA" in l:
        return "RETIRADA"
    if "CORREIO" in l or "ENVIO" in l:
        return "CORREIO"
    if "ATACADO" in l:
        return "ENTREGA"
    return ""


def process_file(path, year, month):
    """Processa uma planilha e retorna lista de vendas e gastos"""
    vendas = []
    gastos = []

    try:
        doc = numbers_parser.Document(path)
    except Exception as e:
        print(f"  ERRO ao abrir: {e}")
        return vendas, gastos

    sheet = doc.sheets[0]
    table = sheet.tables[0]
    indices = find_col_indices(table)

    if "cliente" not in indices or "produto" not in indices:
        print(f"  ERRO: colunas essenciais não encontradas. Indices: {indices}")
        return vendas, gastos

    count_vendas = 0
    count_gastos = 0

    for r in range(1, table.num_rows):
        cliente = safe_str(table.cell(r, indices.get("cliente", 0)).value)
        produto = safe_str(table.cell(r, indices.get("produto", 0)).value) if "produto" in indices else ""

        # Pular linhas vazias ou de totais
        if not cliente and not produto:
            continue
        if not cliente:
            continue

        # Pegar o dia
        dia_raw = safe_float(table.cell(r, indices.get("dia", 0)).value) if "dia" in indices else 0
        dia = int(dia_raw) if dia_raw > 0 and dia_raw <= 31 else 0
        if dia == 0:
            continue  # Linha sem data válida = não é venda

        # Construir data ISO
        data = f"{year}-{month:02d}-{dia:02d}"

        # Valores
        custo = safe_float(table.cell(r, indices["custo"]).value) if "custo" in indices else 0
        preco = safe_float(table.cell(r, indices["preco_vendido"]).value) if "preco_vendido" in indices else 0

        # Se não tem preço vendido, pular (não é venda real)
        if preco == 0 and custo == 0:
            continue

        tipo = safe_str(table.cell(r, indices.get("tipo", 0)).value) if "tipo" in indices else "VENDA"
        origem = safe_str(table.cell(r, indices.get("origem", 0)).value) if "origem" in indices else "ANUNCIO"
        fornecedor = safe_str(table.cell(r, indices.get("fornecedor", 0)).value) if "fornecedor" in indices else ""
        local = safe_str(table.cell(r, indices.get("local", 0)).value) if "local" in indices else ""

        lucro = preco - custo
        margem = (lucro / preco * 100) if preco > 0 else 0

        venda = {
            "data": data,
            "cliente": cliente,
            "origem": normalize_origem(origem),
            "tipo": normalize_tipo(tipo),
            "produto": produto,
            "fornecedor": fornecedor if fornecedor else None,
            "custo": round(custo, 2),
            "preco_vendido": round(preco, 2),
            "banco": "ITAU",  # Default — não temos essa info nas planilhas antigas
            "forma": "PIX",  # Default
            "recebimento": "D+0",  # Default
            "local": normalize_local(local) if local else None,
            "status_pagamento": "FINALIZADO",  # Vendas históricas já foram pagas
        }

        vendas.append(venda)
        count_vendas += 1

        # Extrair gastos das colunas extras
        gasto_valor = 0
        gasto_dest = ""
        if "gasto_valor" in indices:
            gasto_valor = safe_float(table.cell(r, indices["gasto_valor"]).value)
            # Pegar o destino (pode estar em col seguinte ou na col 'gasto_destino')
            if "gasto_destino" in indices:
                gasto_dest = safe_str(table.cell(r, indices["gasto_destino"]).value)

        # Gastos individuais: motoboy, correios, marketing
        for gasto_key, gasto_col in [
            ("MOTOBOY", "gasto_motoboy"),
            ("MOTOBOY RJ", "gasto_motoboy_rj"),
            ("MOTOBOY SP", "gasto_motoboy_sp"),
            ("CORREIOS", "gasto_correios"),
            ("MARKETING", "gasto_marketing"),
        ]:
            if gasto_col in indices:
                val = safe_float(table.cell(r, indices[gasto_col]).value)
                if val > 0:
                    gastos.append({
                        "data": data,
                        "tipo": "SAIDA",
                        "categoria": gasto_key.replace(" ", "_"),
                        "descricao": gasto_key,
                        "valor": round(val, 2),
                        "banco": "ITAU",
                    })
                    count_gastos += 1

        # Gasto principal (CUSTOS EMPRESA + DESTINO)
        if gasto_valor > 0 and gasto_dest:
            gastos.append({
                "data": data,
                "tipo": "SAIDA",
                "categoria": "EMPRESA",
                "descricao": gasto_dest,
                "valor": round(gasto_valor, 2),
                "banco": "ITAU",
            })
            count_gastos += 1

    print(f"  → {count_vendas} vendas, {count_gastos} gastos")
    return vendas, gastos


def main():
    all_vendas = []
    all_gastos = []

    print("=" * 60)
    print("EXPORTAÇÃO DE PLANILHAS NUMBERS → JSON")
    print("=" * 60)

    for path, year, month in FILES:
        filename = os.path.basename(path)
        print(f"\n📄 {filename} ({year}-{month:02d})")

        if not os.path.exists(path):
            print(f"  ⚠️  Arquivo não encontrado, pulando...")
            continue

        vendas, gastos = process_file(path, year, month)
        all_vendas.extend(vendas)
        all_gastos.extend(gastos)

    # Resumo
    print("\n" + "=" * 60)
    print(f"TOTAL: {len(all_vendas)} vendas, {len(all_gastos)} gastos")

    # Resumo por mês
    by_month = {}
    for v in all_vendas:
        m = v["data"][:7]
        by_month[m] = by_month.get(m, 0) + 1
    print("\nVendas por mês:")
    for m in sorted(by_month.keys()):
        print(f"  {m}: {by_month[m]} vendas")

    # Salvar
    output_dir = os.path.dirname(os.path.abspath(__file__))

    vendas_path = os.path.join(output_dir, "vendas-historicas.json")
    with open(vendas_path, "w", encoding="utf-8") as f:
        json.dump(all_vendas, f, ensure_ascii=False, indent=2)
    print(f"\n✅ Vendas salvas em: {vendas_path}")

    gastos_path = os.path.join(output_dir, "gastos-historicos.json")
    with open(gastos_path, "w", encoding="utf-8") as f:
        json.dump(all_gastos, f, ensure_ascii=False, indent=2)
    print(f"✅ Gastos salvos em: {gastos_path}")

    # Quick stats
    total_vendido = sum(v["preco_vendido"] for v in all_vendas)
    total_lucro = sum(v["preco_vendido"] - v["custo"] for v in all_vendas)
    print(f"\n📊 Total vendido: R$ {total_vendido:,.0f}")
    print(f"📊 Total lucro: R$ {total_lucro:,.0f}")


if __name__ == "__main__":
    main()
