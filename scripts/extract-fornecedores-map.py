#!/usr/bin/env python3
"""Extrai mapa serial/imei → fornecedor das Entradas da planilha de exportação."""
import numbers_parser
import json
import warnings
warnings.filterwarnings("ignore")

PATH = "/Users/Nicolas/Library/Mobile Documents/com~apple~CloudDocs/Downloads/EXPORTAÇÃO-OUTUBRO_25 ATÉ 27_03_26.numbers"

doc = numbers_parser.Document(PATH)
t = doc.sheets[0].tables[0]

# Header indices
headers = {}
for c in range(t.num_cols):
    v = t.cell(0, c).value
    if v is not None:
        headers[str(v).strip()] = c

idx_tipo_op = headers["Tipo de Operação"]
idx_contato = headers["Contato"]
idx_serial = headers["Número de Série"]
idx_imei = headers["IMEI"]
idx_data = headers["Data"]
idx_produto = headers["Produto"]
idx_preco_compra = headers["Preço de Compra"]
idx_preco_unit = headers["Preço Unitário"]

def s(v):
    if v is None: return ""
    return str(v).strip()

def parse_data(d):
    """26/03/2026 → 2026-03-26"""
    if not d: return ""
    parts = d.split("/")
    if len(parts) == 3:
        return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
    return ""

# Mapa: serial → fornecedor, imei → fornecedor
# Também guarda lista detalhada por fornecedor pra debug
serial_map = {}
imei_map = {}
entries = []
sem_serial_sem_imei = 0

for r in range(1, t.num_rows):
    tipo_op = s(t.cell(r, idx_tipo_op).value)
    if tipo_op != "Entrada":
        continue
    contato = s(t.cell(r, idx_contato).value)
    if not contato:
        continue
    serial = s(t.cell(r, idx_serial).value)
    imei = s(t.cell(r, idx_imei).value)
    data = parse_data(s(t.cell(r, idx_data).value))
    produto = s(t.cell(r, idx_produto).value)

    if serial:
        serial_map[serial.upper()] = contato
    if imei:
        imei_map[imei] = contato
    if not serial and not imei:
        sem_serial_sem_imei += 1

    entries.append({
        "fornecedor": contato,
        "serial": serial,
        "imei": imei,
        "data": data,
        "produto": produto,
    })

print(f"Total entradas: {len(entries)}")
print(f"Sem serial/imei: {sem_serial_sem_imei}")
print(f"Map por serial: {len(serial_map)}")
print(f"Map por imei: {len(imei_map)}")

# Distribuição por fornecedor
from collections import Counter
fc = Counter(e["fornecedor"] for e in entries)
print(f"\nTop 20 fornecedores:")
for f, c in fc.most_common(20):
    print(f"  {f}: {c}")

# Cristiano específico
cristiano = [e for e in entries if "CRISTIANO" in e["fornecedor"].upper()]
print(f"\nCristiano: {len(cristiano)} entradas")

out = {
    "serial_to_forn": serial_map,
    "imei_to_forn": imei_map,
    "entries": entries,
}
with open("scripts/fornecedores-map.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print("\n✅ Salvo em scripts/fornecedores-map.json")
