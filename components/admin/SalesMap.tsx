"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";

interface BairroMapData {
  nome: string;
  qty: number;
  receita: number;
  lucro: number;
  ticket: number;
  lat?: number | null;
  lng?: number | null;
}

// Item #21 — modo de visualizacao + metrica de intensidade.
// pins: marcadores tradicionais com numero da metrica
// heatmap: gradiente difuso (tipo "calor"), ideal pra ver concentracao
export type MapMode = "pins" | "heatmap";
export type MapMetric = "qty" | "receita" | "lucro";

interface SalesMapProps {
  bairros: BairroMapData[];
  mode?: MapMode;
  metric?: MapMetric;
}

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

const METRIC_LABEL: Record<MapMetric, string> = {
  qty: "Vendas",
  receita: "Faturamento",
  lucro: "Lucro",
};

function getMetricValue(b: BairroMapData, m: MapMetric): number {
  if (m === "receita") return b.receita;
  if (m === "lucro") return b.lucro;
  return b.qty;
}

// Gradient de intensidade — laranja da marca
function getMarkerColor(value: number, max: number): { bg: string; border: string; glow: string } {
  const ratio = max > 0 ? value / max : 0;
  if (ratio >= 0.6) return { bg: "#E8740E", border: "#C45D00", glow: "rgba(232,116,14,0.4)" };
  if (ratio >= 0.3) return { bg: "#F59E0B", border: "#D97706", glow: "rgba(245,158,11,0.3)" };
  return { bg: "#86868B", border: "#6E6E73", glow: "rgba(134,134,139,0.2)" };
}

function getMarkerSize(value: number, max: number): number {
  const ratio = max > 0 ? value / max : 0;
  return 18 + ratio * 22; // 18px a 40px
}

// Formata o valor exibido dentro do pin (qty=numero, receita/lucro=K abreviado)
function fmtMarkerText(value: number, m: MapMetric): string {
  if (m === "qty") return String(value);
  // 12.345 → 12k, 123.456 → 123k, 1.234.567 → 1.2M
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
}

function createPinIcon(value: number, max: number, m: MapMetric): L.DivIcon {
  const { bg, border, glow } = getMarkerColor(value, max);
  const size = getMarkerSize(value, max);
  const fontSize = size < 24 ? 9 : size < 30 ? 10 : 12;
  const text = fmtMarkerText(value, m);

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
    ">${text}</div>`,
  });
}

export default function SalesMap({ bairros, mode = "pins", metric = "qty" }: SalesMapProps) {
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

    L.control.zoom({ position: "bottomright" }).addTo(map);

    mapInstanceRef.current = map;

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

    const max = Math.max(...mappable.map((b) => getMetricValue(b, metric)), 1);

    if (mode === "heatmap") {
      // Heatmap real via leaflet.heat: gradiente difuso "calor".
      // Cada ponto contribui com intensidade proporcional a metrica.
      // points: [lat, lng, intensity] onde intensity vai de 0 a 1.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const heatPoints: [number, number, number][] = mappable.map((b) => [
        b.lat!,
        b.lng!,
        getMetricValue(b, metric) / max,
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (L as any).heatLayer(heatPoints, {
        radius: 35,
        blur: 25,
        maxZoom: 14,
        max: 1.0,
        gradient: {
          0.0: "#86868B",  // cinza pra zonas frias
          0.3: "#F59E0B",  // laranja claro
          0.6: "#E8740E",  // laranja marca
          1.0: "#C45D00",  // laranja escuro pra hotspots
        },
      }).addTo(map);

      // Mesmo no heatmap, mantemos pins menores SO PRA ABRIR POPUP no clique
      // (heat layer nao tem popup nativo). Pin pequeno, sem texto.
      for (const b of mappable) {
        const transparentIcon = L.divIcon({
          className: "",
          iconSize: [20, 20],
          iconAnchor: [10, 10],
          html: `<div style="width:20px;height:20px;border-radius:50%;background:transparent;cursor:pointer;"></div>`,
        });
        const m = L.marker([b.lat!, b.lng!], { icon: transparentIcon, opacity: 0.0 }).addTo(map);
        m.bindPopup(buildPopup(b, metric), { closeButton: false, maxWidth: 280, className: "custom-popup" });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m as any).setOpacity?.(0.01); // garante que clique pega mas nao mostra
      }
    } else {
      // Modo pins: marcadores tradicionais com texto da metrica
      for (const b of mappable) {
        const value = getMetricValue(b, metric);
        const icon = createPinIcon(value, max, metric);
        const marker = L.marker([b.lat!, b.lng!], { icon }).addTo(map);
        marker.bindPopup(buildPopup(b, metric), { closeButton: false, maxWidth: 280, className: "custom-popup" });
      }
    }

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
  }, [bairros, mode, metric]);

  const mappableCount = bairros.filter(
    (b) => b.lat != null && b.lng != null && b.nome !== "Nao informado"
  ).length;

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2 flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#1D1D1F]">
            {mode === "heatmap" ? "Heatmap por bairro" : "Distribuicao Geografica"}
          </h2>
          <p className="text-[11px] text-[#86868B] mt-0.5">
            {mode === "heatmap" ? `Intensidade por ${METRIC_LABEL[metric].toLowerCase()} — clique nas areas pra ver detalhes` : "Clique nos marcadores para detalhes"}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-[#86868B]">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#86868B]" />
            Frias
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
            Mornas
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#E8740E]" />
            Quentes
          </span>
          <span className="text-[#86868B] font-medium ml-2">
            {mappableCount} locais
          </span>
        </div>
      </div>

      <div
        ref={mapRef}
        className="w-full"
        style={{ height: "520px" }}
      />
    </div>
  );
}

// Popup compartilhado entre modos pins e heatmap
function buildPopup(b: BairroMapData, metric: MapMetric): string {
  const highlightCss = (m: MapMetric) =>
    metric === m ? "background:#FFF5EB;border-radius:4px;padding:2px 4px;margin:-2px -4px;" : "";
  return `<div style="font-family:system-ui,sans-serif;min-width:180px;padding:4px 0;">
    <div style="font-weight:700;font-size:15px;margin-bottom:8px;color:#1D1D1F;border-bottom:2px solid #E8740E;padding-bottom:6px;">${b.nome}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:12px;color:#6E6E73;">
      <div style="${highlightCss("qty")}">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.7;">Vendas</div>
        <div style="font-weight:700;font-size:16px;color:#E8740E;">${b.qty}</div>
      </div>
      <div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.7;">Ticket</div>
        <div style="font-weight:600;color:#1D1D1F;">${fmt(b.ticket)}</div>
      </div>
      <div style="${highlightCss("receita")}">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.7;">Faturamento</div>
        <div style="font-weight:600;color:#1D1D1F;">${fmt(b.receita)}</div>
      </div>
      <div style="${highlightCss("lucro")}">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.7;">Lucro</div>
        <div style="font-weight:600;color:#2ECC71;">${fmt(b.lucro)}</div>
      </div>
    </div>
  </div>`;
}
