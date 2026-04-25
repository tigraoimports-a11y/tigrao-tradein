import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { findCoords, haversineKm, type Coords } from "@/lib/bairro-coords";

// Item #24 — Mapa rota otimizada pra entregas.
//
// Recebe uma data + status (ou IDs explicitos) e retorna a ordem otimizada
// pra visitar as entregas, partindo da loja Tigrao (Barra da Tijuca).
//
// Algoritmo: nearest-neighbor (greedy) — comeca na loja, vai pro ponto mais
// proximo, depois pro mais proximo dali, ate visitar todos. Distancia em
// linha reta (haversine), nao por estrada — suficiente pra indicar uma
// ordem razoavel. O motoboy depois ajusta no Google Maps com transito real.
//
// POST /api/admin/entregas/otimizar-rota
// Body: { date?: "2026-04-25", ids?: string[], origem?: { lat, lng } }
//   - date: filtra entregas dessa data com status=PENDENTE ou SAIU
//   - ids: lista explicita de IDs de entregas (sobrescreve date+filtro)
//   - origem: ponto de partida (default: loja TigraoImports na Barra)
//
// Retorna:
//   - waypoints: array ORDENADO de entregas com ordem visita + lat/lng
//   - distanciaTotalKm: soma das pernas (loja → 1 → 2 → ... → ultima)
//   - semCoords: entregas que ficaram FORA porque nao temos coordenadas
//                pra elas (sem bairro reconhecido) — equipe trata manual
//   - origem: o ponto de partida usado
//
// Auth: header x-admin-password === ADMIN_PASSWORD

// Loja TigraoImports — Av. Ator Jose Wilker 400, Barra Olimpica.
// Ponto de partida default das rotas. Pode ser sobrescrito via body.origem.
const ORIGEM_LOJA: Coords = { lat: -22.9792, lng: -43.3947 };

interface Entrega {
  id: string;
  cliente: string;
  telefone: string | null;
  endereco: string | null;
  bairro: string | null;
  regiao: string | null;
  data_entrega: string;
  horario: string | null;
  status: string;
  produto: string | null;
  vendedor: string | null;
}

interface Waypoint extends Entrega {
  ordem: number;       // 1, 2, 3, ... (1 = primeira parada)
  lat: number;
  lng: number;
  distanciaDaAnteriorKm: number;
}

export async function POST(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { date?: string; ids?: string[]; origem?: Coords };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const origem: Coords = body.origem ?? ORIGEM_LOJA;

  // Carrega entregas — por IDs explicitos OU por data+status
  let entregasQuery = supabase
    .from("entregas")
    .select("id, cliente, telefone, endereco, bairro, regiao, data_entrega, horario, status, produto, vendedor");

  if (body.ids && body.ids.length > 0) {
    entregasQuery = entregasQuery.in("id", body.ids);
  } else {
    const data = body.date || new Date().toISOString().slice(0, 10);
    // Pega tudo que ainda precisa visitar nessa data
    entregasQuery = entregasQuery
      .eq("data_entrega", data)
      .in("status", ["PENDENTE", "SAIU"]);
  }

  const { data: entregas, error } = await entregasQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!entregas || entregas.length === 0) {
    return NextResponse.json({
      waypoints: [],
      distanciaTotalKm: 0,
      semCoords: [],
      origem,
      message: "Nenhuma entrega encontrada com os criterios",
    });
  }

  // Geocodifica cada entrega via lookup de bairro/cidade
  const comCoords: Array<Entrega & { coords: Coords }> = [];
  const semCoords: Entrega[] = [];

  for (const e of entregas) {
    const coords = findCoords({ bairro: e.bairro, cidade: e.regiao });
    if (coords) {
      comCoords.push({ ...e, coords });
    } else {
      semCoords.push(e);
    }
  }

  // Algoritmo nearest-neighbor (greedy):
  // 1. Comeca na origem
  // 2. Acha o ponto restante mais proximo do ATUAL
  // 3. Visita ele, marca como atual, repete
  // 4. Acaba quando todos foram visitados
  //
  // Complexidade: O(N²) — bom o suficiente pra <100 entregas.
  // Se tiver >100 num dia, podemos depois trocar por 2-opt (mais otimo,
  // ainda rapido). Mas no Tigrao tipico sao 5-30 entregas/dia.
  const waypoints: Waypoint[] = [];
  const restantes = [...comCoords];
  let atual: Coords = origem;
  let ordem = 1;
  let distanciaTotal = 0;

  while (restantes.length > 0) {
    let melhorIdx = 0;
    let melhorDist = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const d = haversineKm(atual, restantes[i].coords);
      if (d < melhorDist) {
        melhorDist = d;
        melhorIdx = i;
      }
    }
    const proximo = restantes.splice(melhorIdx, 1)[0];
    waypoints.push({
      id: proximo.id,
      cliente: proximo.cliente,
      telefone: proximo.telefone,
      endereco: proximo.endereco,
      bairro: proximo.bairro,
      regiao: proximo.regiao,
      data_entrega: proximo.data_entrega,
      horario: proximo.horario,
      status: proximo.status,
      produto: proximo.produto,
      vendedor: proximo.vendedor,
      ordem,
      lat: proximo.coords.lat,
      lng: proximo.coords.lng,
      distanciaDaAnteriorKm: Math.round(melhorDist * 10) / 10,
    });
    distanciaTotal += melhorDist;
    atual = proximo.coords;
    ordem++;
  }

  return NextResponse.json({
    waypoints,
    distanciaTotalKm: Math.round(distanciaTotal * 10) / 10,
    semCoords: semCoords.map((e) => ({
      id: e.id,
      cliente: e.cliente,
      bairro: e.bairro,
      regiao: e.regiao,
      endereco: e.endereco,
    })),
    origem,
  });
}
