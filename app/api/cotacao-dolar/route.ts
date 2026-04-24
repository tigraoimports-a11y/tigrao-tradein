// app/api/cotacao-dolar/route.ts
// Retorna a cotação atual do dólar (USD-BRL) usando a AwesomeAPI (gratuita,
// sem auth). Cache de 10 min pra não martelar a API externa.
//
// Resposta:
//   { cotacao: 5.73, cotacaoCompra: 5.72, cotacaoVenda: 5.74,
//     atualizadoEm: "2026-04-24T15:00:00", variacao: 0.25, fonte: "AwesomeAPI" }

import { NextResponse } from "next/server";

export const revalidate = 600; // 10 minutos

interface AwesomeResp {
  USDBRL?: {
    bid: string;       // venda (cotacao de venda)
    ask: string;       // compra
    high: string;
    low: string;
    pctChange: string; // variacao %
    create_date: string;
    timestamp: string;
  };
}

export async function GET() {
  try {
    const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", {
      next: { revalidate: 600 },
    });
    if (!res.ok) throw new Error(`Fonte retornou ${res.status}`);
    const data = (await res.json()) as AwesomeResp;
    const q = data.USDBRL;
    if (!q) throw new Error("Resposta sem USDBRL");

    const venda = parseFloat(q.bid);   // valor mais comum de referência
    const compra = parseFloat(q.ask);
    const media = (venda + compra) / 2;

    return NextResponse.json(
      {
        cotacao: Math.round(media * 100) / 100,
        cotacaoCompra: compra,
        cotacaoVenda: venda,
        maxima: parseFloat(q.high),
        minima: parseFloat(q.low),
        variacao: parseFloat(q.pctChange),
        atualizadoEm: q.create_date,
        fonte: "AwesomeAPI",
      },
      {
        headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" },
      },
    );
  } catch (err) {
    console.error("[cotacao-dolar] erro:", err);
    return NextResponse.json(
      { error: String(err), cotacao: null },
      { status: 502 },
    );
  }
}
