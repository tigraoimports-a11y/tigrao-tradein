"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Item #24 — visualiza rota otimizada de entregas no mapa.
// Marcadores numerados (1, 2, 3...) na ordem otima + linha conectando todos
// + ponto de origem (loja) destacado em vermelho. Usado dentro do modal de
// "Otimizar Rota" no /admin/entregas.

export interface RouteWaypoint {
  ordem: number;
  cliente: string;
  bairro: string | null;
  endereco: string | null;
  entregador?: string | null;
  horario?: string | null;
  lat: number;
  lng: number;
  distanciaDaAnteriorKm: number;
}

interface RouteMapProps {
  origem: { lat: number; lng: number };
  waypoints: RouteWaypoint[];
  height?: number;
}

function createNumberedIcon(numero: number): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
    html: `<div style="
      width:30px;height:30px;
      background:#E8740E;
      border:3px solid #fff;
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-weight:700;font-size:13px;
      font-family:system-ui,sans-serif;
      box-shadow:0 2px 8px rgba(0,0,0,0.25);
      cursor:pointer;
    ">${numero}</div>`,
  });
}

function createOriginIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
    html: `<div style="
      width:36px;height:36px;
      background:#1D1D1F;
      border:3px solid #fff;
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-weight:700;font-size:16px;
      font-family:system-ui,sans-serif;
      box-shadow:0 2px 12px rgba(0,0,0,0.35);
    ">🏠</div>`,
  });
}

export default function RouteMap({ origem, waypoints, height = 480 }: RouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, {
      center: [origem.lat, origem.lng],
      zoom: 12,
      scrollWheelZoom: true,
      zoomControl: false,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map);

    // Origem (loja)
    const originMarker = L.marker([origem.lat, origem.lng], { icon: createOriginIcon() }).addTo(map);
    originMarker.bindPopup("<b>Loja TigraoImports</b><br/>Ponto de partida", { closeButton: false });

    // Waypoints numerados
    for (const wp of waypoints) {
      const marker = L.marker([wp.lat, wp.lng], { icon: createNumberedIcon(wp.ordem) }).addTo(map);
      marker.bindPopup(
        `<div style="font-family:system-ui,sans-serif;min-width:180px;">
          <div style="font-weight:700;font-size:14px;color:#E8740E;margin-bottom:4px;">
            Parada ${wp.ordem}${wp.horario ? ` · ${wp.horario}` : ""}
          </div>
          <div style="font-weight:600;color:#1D1D1F;font-size:13px;">${wp.cliente}</div>
          ${wp.bairro ? `<div style="color:#6E6E73;font-size:12px;margin-top:2px;">${wp.bairro}</div>` : ""}
          ${wp.endereco ? `<div style="color:#86868B;font-size:11px;margin-top:2px;">${wp.endereco}</div>` : ""}
          ${wp.entregador ? `<div style="color:#6E6E73;font-size:11px;margin-top:4px;">🛵 ${wp.entregador}</div>` : ""}
          <div style="color:#86868B;font-size:11px;margin-top:6px;border-top:1px solid #E5E5E5;padding-top:4px;">
            ${wp.distanciaDaAnteriorKm} km da parada anterior
          </div>
        </div>`,
        { closeButton: false, maxWidth: 280 }
      );
    }

    // Linha da rota: origem → 1 → 2 → ... → ultima
    if (waypoints.length > 0) {
      const polylinePoints: [number, number][] = [
        [origem.lat, origem.lng],
        ...waypoints.map((w) => [w.lat, w.lng] as [number, number]),
      ];
      L.polyline(polylinePoints, {
        color: "#E8740E",
        weight: 3,
        opacity: 0.7,
        dashArray: "8, 6",
      }).addTo(map);

      // Fit bounds incluindo origem + todos waypoints
      const bounds = L.latLngBounds(polylinePoints);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [origem, waypoints]);

  return (
    <div
      ref={mapRef}
      className="w-full rounded-xl border border-[#E5E5E5] overflow-hidden"
      style={{ height: `${height}px` }}
    />
  );
}
