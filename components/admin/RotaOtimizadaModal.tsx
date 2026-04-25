"use client";

import { useEffect, useState, useCallback } from "react";
import RouteMap, { type RouteWaypoint } from "@/components/admin/RouteMap";

// Item #24 — modal completo de rota otimizada pra entregas.
// Mostra controles (data + recalcular) + mapa com pontos numerados + lista
// lateral ordenada das paradas. Usa /api/admin/entregas/otimizar-rota.

interface RotaOtimizadaModalProps {
  password: string;
  onClose: () => void;
}

interface RotaResponse {
  waypoints: RouteWaypoint[];
  distanciaTotalKm: number;
  semCoords: Array<{ id: string; cliente: string; bairro: string | null; endereco: string | null; regiao: string | null; entregador: string | null }>;
  entregadores: Array<{ nome: string; qtd: number }>;
  origem: { lat: number; lng: number };
  message?: string;
}

function hojeBR(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

export default function RotaOtimizadaModal({ password, onClose }: RotaOtimizadaModalProps) {
  const [date, setDate] = useState<string>(hojeBR());
  // Filtro motoboy: cada motoboy tem rota propria. "" = sem filtro (todos).
  const [filtroEntregador, setFiltroEntregador] = useState<string>("");
  const [data, setData] = useState<RotaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const calcular = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/entregas/otimizar-rota", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ date, entregador: filtroEntregador || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error || "Erro ao calcular rota");
        setData(null);
      } else {
        setData(json);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro de rede");
    }
    setLoading(false);
  }, [password, date, filtroEntregador]);

  useEffect(() => {
    calcular();
  }, [calcular]);

  // Botao "Abrir no Google Maps" — gera URL com origem + waypoints na ordem
  const googleMapsUrl = data && data.waypoints.length > 0
    ? (() => {
        const origem = `${data.origem.lat},${data.origem.lng}`;
        const dest = `${data.waypoints[data.waypoints.length - 1].lat},${data.waypoints[data.waypoints.length - 1].lng}`;
        const intermediarios = data.waypoints.slice(0, -1).map((w) => `${w.lat},${w.lng}`).join("|");
        const base = `https://www.google.com/maps/dir/?api=1&origin=${origem}&destination=${dest}`;
        return intermediarios ? `${base}&waypoints=${intermediarios}` : base;
      })()
    : "";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E5E5E5]">
          <div>
            <h2 className="text-base font-bold text-[#1D1D1F]">🗺️ Rota Otimizada</h2>
            <p className="text-xs text-[#86868B]">
              Ordem otima das entregas pendentes (saindo do escritorio na Barra Olimpica)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#86868B] hover:text-[#1D1D1F] text-2xl leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[#E5E5E5] bg-[#FAFAFA] flex-wrap">
          <label className="text-xs font-medium text-[#6E6E73]">Data:</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-[#D2D2D7] text-sm focus:border-[#E8740E] focus:outline-none"
          />
          {/* Filtro motoboy — cada motoboy tem rota propria, faz sentido
              otimizar separado em vez de juntar todas entregas do dia. */}
          <label className="text-xs font-medium text-[#6E6E73] ml-2">Motoboy:</label>
          <select
            value={filtroEntregador}
            onChange={(e) => setFiltroEntregador(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-[#D2D2D7] text-sm focus:border-[#E8740E] focus:outline-none bg-white"
          >
            <option value="">Todos</option>
            {(data?.entregadores || []).map((ent) => (
              <option key={ent.nome} value={ent.nome}>
                {ent.nome} ({ent.qtd})
              </option>
            ))}
          </select>
          <button
            onClick={calcular}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-[#E8740E] text-white text-xs font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
          >
            {loading ? "Calculando..." : "🔄 Recalcular"}
          </button>
          {data && data.waypoints.length > 0 && (
            <>
              <span className="text-xs text-[#86868B] ml-auto">
                <strong className="text-[#1D1D1F]">{data.waypoints.length}</strong> paradas ·{" "}
                <strong className="text-[#E8740E]">{data.distanciaTotalKm} km</strong> total
              </span>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg border border-[#34A853] text-[#34A853] text-xs font-semibold hover:bg-[#F0FFF4] transition-colors"
              >
                📍 Abrir no Google Maps
              </a>
            </>
          )}
        </div>

        {/* Conteudo */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Mapa */}
          <div className="flex-1 p-3 min-h-[400px]">
            {erro ? (
              <div className="h-full flex items-center justify-center text-center text-[#E74C3C] text-sm">
                {erro}
              </div>
            ) : !data || data.waypoints.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-[#86868B] text-sm">
                {loading ? "Calculando rota..." : data?.message || "Nenhuma entrega encontrada nessa data"}
              </div>
            ) : (
              <RouteMap origem={data.origem} waypoints={data.waypoints} height={460} />
            )}
          </div>

          {/* Lista lateral */}
          <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-[#E5E5E5] overflow-y-auto bg-[#FAFAFA] max-h-[460px]">
            {data && data.waypoints.length > 0 && (
              <ul className="divide-y divide-[#E5E5E5]">
                {data.waypoints.map((wp) => (
                  <li key={wp.ordem} className="p-3 hover:bg-white transition-colors">
                    <div className="flex items-start gap-2">
                      <span className="inline-flex w-6 h-6 rounded-full bg-[#E8740E] text-white text-xs font-bold items-center justify-center shrink-0">
                        {wp.ordem}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-[#1D1D1F] truncate">{wp.cliente}</div>
                          {wp.horario && (
                            <span className="text-[10px] text-[#86868B] shrink-0">{wp.horario}</span>
                          )}
                        </div>
                        {wp.bairro && (
                          <div className="text-xs text-[#6E6E73]">{wp.bairro}</div>
                        )}
                        {wp.endereco && (
                          <div className="text-[10px] text-[#86868B] truncate">{wp.endereco}</div>
                        )}
                        <div className="flex items-center justify-between mt-1 gap-2">
                          <span className="text-[10px] text-[#86868B]">
                            {wp.distanciaDaAnteriorKm} km da anterior
                          </span>
                          {wp.entregador && (
                            <span className="text-[10px] text-[#6E6E73] truncate" title={`Motoboy: ${wp.entregador}`}>
                              🛵 {wp.entregador}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {data && data.semCoords.length > 0 && (
              <div className="p-3 border-t border-[#E5E5E5] bg-[#FFF5F5]">
                <p className="text-xs font-semibold text-[#E74C3C] mb-2">
                  ⚠️ {data.semCoords.length} entrega(s) sem coordenadas
                </p>
                <p className="text-[10px] text-[#86868B] mb-2">
                  Sem bairro reconhecido. Tratar manual:
                </p>
                <ul className="space-y-1">
                  {data.semCoords.map((s) => (
                    <li key={s.id} className="text-xs text-[#6E6E73]">
                      • {s.cliente} <span className="text-[#86868B]">({s.bairro || s.regiao || "sem bairro"})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
