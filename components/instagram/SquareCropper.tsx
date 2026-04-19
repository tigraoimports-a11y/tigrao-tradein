"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  file: File;
  onCancel: () => void;
  onCrop: (cropped: File) => void;
  outputSize?: number;
  title?: string;
  aspectLabel?: "circulo" | "quadrado";
}

const BOX = 360; // tamanho do preview em px

export default function SquareCropper({
  file,
  onCancel,
  onCrop,
  outputSize = 800,
  title = "Ajustar foto",
  aspectLabel = "circulo",
}: Props) {
  const [imgUrl, setImgUrl] = useState<string>("");
  const [imgW, setImgW] = useState(0);
  const [imgH, setImgH] = useState(0);
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    const img = new window.Image();
    img.onload = () => {
      setImgW(img.width);
      setImgH(img.height);
      const ms = Math.max(BOX / img.width, BOX / img.height);
      setMinScale(ms);
      setScale(ms);
      // Centraliza
      setOffset({
        x: (BOX - img.width * ms) / 2,
        y: (BOX - img.height * ms) / 2,
      });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Limita offset pra imagem nao sair do quadrado.
  const clampOffset = useCallback(
    (x: number, y: number, s: number) => {
      const w = imgW * s;
      const h = imgH * s;
      const minX = BOX - w;
      const minY = BOX - h;
      return {
        x: Math.min(0, Math.max(minX, x)),
        y: Math.min(0, Math.max(minY, y)),
      };
    },
    [imgW, imgH]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setOffset(clampOffset(dragRef.current.ox + dx, dragRef.current.oy + dy, scale));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    dragRef.current = null;
  };

  const handleScaleChange = (newScale: number) => {
    // Zoom mantendo o centro do BOX fixo.
    const cx = BOX / 2;
    const cy = BOX / 2;
    const imgCX = (cx - offset.x) / scale;
    const imgCY = (cy - offset.y) / scale;
    const newOx = cx - imgCX * newScale;
    const newOy = cy - imgCY * newScale;
    setScale(newScale);
    setOffset(clampOffset(newOx, newOy, newScale));
  };

  const handleSave = async () => {
    if (!imgW || !imgH) return;
    setSaving(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas ctx indisponivel");

      // Coordenadas do pedaco da imagem original visivel no BOX.
      const sx = -offset.x / scale;
      const sy = -offset.y / scale;
      const sSize = BOX / scale;

      const img = new window.Image();
      img.src = imgUrl;
      await new Promise<void>((resolve, reject) => {
        if (img.complete) resolve();
        else {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("falha ao carregar img"));
        }
      });

      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, outputSize, outputSize);

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob null"))),
          "image/jpeg",
          0.9
        );
      });
      const baseName = file.name.replace(/\.[^.]+$/, "");
      const cropped = new File([blob], `${baseName}-crop.jpg`, { type: "image/jpeg" });
      onCrop(cropped);
    } catch (err) {
      console.error("[SquareCropper]", err);
      alert("Erro ao aplicar crop: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-[#1D1D1F]">{title}</h2>
          <button onClick={onCancel} className="text-[#86868B] hover:text-[#1D1D1F] text-xl leading-none">&times;</button>
        </div>
        <p className="text-xs text-[#86868B] mb-3">
          Arraste a imagem pra ajustar. Use o slider pra dar zoom. O {aspectLabel === "circulo" ? "círculo branco" : "quadrado branco"} mostra como vai aparecer.
        </p>
        <div className="flex justify-center">
          <div
            ref={boxRef}
            className="relative overflow-hidden bg-[#F5F5F7] touch-none select-none cursor-grab active:cursor-grabbing"
            style={{ width: BOX, height: BOX, borderRadius: 12 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {imgUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgUrl}
                alt="crop"
                draggable={false}
                style={{
                  position: "absolute",
                  left: offset.x,
                  top: offset.y,
                  width: imgW * scale,
                  height: imgH * scale,
                  maxWidth: "none",
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              />
            )}
            {/* Overlay indicando a area visivel */}
            <div className="absolute inset-0 pointer-events-none">
              <div
                className={`w-full h-full ${aspectLabel === "circulo" ? "rounded-full" : ""} border-2 border-white`}
                style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }}
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs text-[#86868B] w-10 text-center">-</span>
          <input
            type="range"
            min={minScale}
            max={minScale * 4}
            step={0.01}
            value={scale}
            onChange={e => handleScaleChange(parseFloat(e.target.value))}
            className="flex-1 accent-[#E8740E]"
          />
          <span className="text-xs text-[#86868B] w-10 text-center">+</span>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-xl border border-[#D2D2D7] text-sm text-[#6E6E73] hover:bg-[#F5F5F7] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !imgW}
            className="flex-1 px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] disabled:opacity-50"
          >
            {saving ? "Processando..." : "Salvar crop"}
          </button>
        </div>
      </div>
    </div>
  );
}
