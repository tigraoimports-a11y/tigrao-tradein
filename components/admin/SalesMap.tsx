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

// Gradient de intensidade — laranja da marca
function getMarkerColor(qty: number, maxQty: number): { bg: string; border: string; glow: string } {
  const ratio = maxQty > 0 ? qty / maxQty : 0;
  if (ratio >= 0.6) return { bg: "#E8740E", border: "#C45D00", glow: "rgba(232,116,14,0.4)" };
  if (ratio >= 0.3) return { bg: "#F59E0B", border: "#D97706", glow: "rgba(245,158,11,0.3)" };
  return { bg: "#86868B", border: "#6E6E73", glow: "rgba(134,134,139,0.2)" };
}

function getMarkerSize(qty: number, maxQty: number): number {
  const ratio = maxQty > 0 ? qty / maxQty : 0;
  return 18 + ratio * 22; // 18px a 40px
}

function createPinIcon(qty: number, maxQty: number): L.DivIcon {
  const { bg, border, glow } = getMarkerColor(qty, maxQty);
  const size = getMarkerSize(qty, maxQty);
  const fontSize = size < 24 ? 9 : size < 30 ? 10 : 12;

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${bg};
      border:2px solid ${border};
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-weight:700;font-size:${fontSize}px;
      font-family:system-ui,sans-serif;
      box-shadow:0 0 ${size/2}px ${glow}, 0 2px 8px rgba(0,0,0,0.15);
      transition:transform 0.2s;
      cursor:pointer;
    ">${qty}</div>`,
  });
}

export default function SalesMap({ bairros }: SalesMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, {
      center: [-22.5, -43.2],
      zoom: 9,
      scrollWheelZoom: true,
      zoomControl: false,
    });

    // Zoom control no canto direito
    L.control.zoom({ position: "bottomright" }).addTo(map);

    mapInstanceRef.current = map;

    // Mapa clean dark — CartoDB Dark Matter
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map);

    const mappable = bairros.filter(
      (b) => b.lat != null && b.lng != null && b.nome !== "Nao informado"
    );

    if (mappable.length === 0) {
      return () => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
      };
    }

    const maxQty = Math.max(...mappable.map((b) => b.qty), 1);

    for (const b of mappable) {
      const icon = createPinIcon(b.qty, maxQty);

      const marker = L.marker([b.lat!, b.lng!], { icon }).addTo(map);

      marker.bindPopup(
        `<div style="font-family:system-ui,sans-serif;min-width:180px;padding:4px 0;">
          <div style="font-weight:700;font-size:15px;margin-bottom:8px;color:#1D1D1F;border-bottom:2px solid #E8740E;padding-bottom:6px;">${b.nome}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:12px;color:#6E6E73;">
            <div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.7;">Vendas</div>
              <div style="font-weight:700;font-size:16px;color:#E8740E;">${b.qty}</div>
            </div>
            <div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.7;">Ticket</div>
              <div style="font-weight:600;color:#1D1D1F;">${fmt(b.ticket)}</div>
            </div>
            <div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.7;">Faturamento</div>
              <div style="font-weight:600;color:#1D1D1F;">${fmt(b.receita)}</div>
            </div>
            <div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.7;">Lucro</div>
              <div style="font-weight:600;color:#2ECC71;">${fmt(b.lucro)}</div>
            </div>
          </div>
        </div>`,
        { closeButton: false, maxWidth: 280, className: "custom-popup" }
      );
    }

    // Fit bounds — incluir todo estado do RJ (lat -21 a -24, lng -41 a -45)
    // Mas se tem vendas fora do RJ, incluir também
    const allPoints = mappable.map((b) => [b.lat!, b.lng!] as [number, number]);
    if (allPoints.length > 1) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    } else if (allPoints.length === 1) {
      map.setView(allPoints[0], 12);
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

  const totalVendas = bairros.reduce((s, b) => s + b.qty, 0);

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-2xl overflow-hidden shadow-sm">
      {/* Header sobre o mapa */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
        <div>
          <h2 className="text-sm font-semibold text-[#1D1D1F]">
            Distribuicao Geografica
          </h2>
          <p className="text-[11px] text-[#86868B] mt-0.5">
            Clique nos marcadores para detalhes
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-[#86868B]">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#86868B]" />
            Poucas
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
            Media
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#E8740E]" />
            Muitas
          </span>
          <span className="text-[#86868B] font-medium ml-2">
            {mappableCount} locais
          </span>
        </div>
      </div>

      {/* Mapa */}
      <div
        ref={mapRef}
        className="w-full"
        style={{ height: "520px" }}
      />
    </div>
  );
}
