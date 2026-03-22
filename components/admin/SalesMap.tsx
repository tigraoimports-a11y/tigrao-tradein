"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface BairroMapData {
  nome: string;
  qty: number;
  receita: number;
  lucro: number;
  ticket: number;
  lat?: number | null;
  lng?: number | null;
}

interface SalesMapProps {
  bairros: BairroMapData[];
}

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

function getColor(qty: number, maxQty: number): string {
  const ratio = maxQty > 0 ? qty / maxQty : 0;
  if (ratio >= 0.7) return "#EF4444"; // red
  if (ratio >= 0.4) return "#E8740E"; // orange
  return "#2ECC71"; // green
}

function getRadius(qty: number, maxQty: number): number {
  const minR = 8;
  const maxR = 30;
  const ratio = maxQty > 0 ? qty / maxQty : 0;
  return minR + ratio * (maxR - minR);
}

export default function SalesMap({ bairros }: SalesMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Clean up previous map instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, {
      center: [-23.0, -43.35],
      zoom: 11,
      scrollWheelZoom: true,
      zoomControl: true,
    });

    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    // Filter bairros that have coordinates
    const mappable = bairros.filter(
      (b) => b.lat != null && b.lng != null && b.nome !== "Nao informado"
    );

    if (mappable.length === 0) {
      // No data to show
      return () => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      };
    }

    const maxQty = Math.max(...mappable.map((b) => b.qty), 1);

    for (const b of mappable) {
      const color = getColor(b.qty, maxQty);
      const radius = getRadius(b.qty, maxQty);

      const circle = L.circleMarker([b.lat!, b.lng!], {
        radius,
        fillColor: color,
        color: "#fff",
        weight: 2,
        opacity: 0.9,
        fillOpacity: 0.7,
      }).addTo(map);

      circle.bindPopup(
        `<div style="font-family: system-ui, sans-serif; min-width: 160px;">
          <div style="font-weight: 700; font-size: 14px; margin-bottom: 6px; color: #1D1D1F;">${b.nome}</div>
          <div style="font-size: 12px; color: #6E6E73; line-height: 1.8;">
            <span style="font-weight: 600; color: #E8740E;">${b.qty}</span> vendas<br/>
            Faturamento: <span style="font-weight: 600; color: #1D1D1F;">${fmt(b.receita)}</span><br/>
            Lucro: <span style="font-weight: 600; color: #2ECC71;">${fmt(b.lucro)}</span><br/>
            Ticket: ${fmt(b.ticket)}
          </div>
        </div>`,
        { closeButton: true, maxWidth: 250 }
      );
    }

    // Fit bounds to markers if we have data
    if (mappable.length > 1) {
      const bounds = L.latLngBounds(
        mappable.map((b) => [b.lat!, b.lng!] as [number, number])
      );
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [bairros]);

  const mappableCount = bairros.filter(
    (b) => b.lat != null && b.lng != null && b.nome !== "Nao informado"
  ).length;

  return (
    <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold text-[#1D1D1F]">
          Mapa de Vendas
        </h2>
        <span className="text-xs text-[#86868B]">
          {mappableCount} bairros no mapa
        </span>
      </div>
      <p className="text-xs text-[#86868B] mb-3">
        Distribuicao geografica por bairro — clique nos circulos para detalhes
      </p>

      {/* Legend */}
      <div className="flex gap-4 mb-3 text-[10px] text-[#6E6E73]">
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-[#2ECC71]" />
          Poucas
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-[#E8740E]" />
          Media
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-[#EF4444]" />
          Muitas
        </div>
      </div>

      <div
        ref={mapRef}
        className="w-full rounded-xl overflow-hidden"
        style={{ height: "400px" }}
      />
    </div>
  );
}
