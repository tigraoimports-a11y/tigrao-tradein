"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as Record<string, unknown>).MSStream;
}

function ScannerContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [scannedSerial, setScannedSerial] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manualSerial, setManualSerial] = useState("");
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrcodeRef = useRef<unknown>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = async () => {
    try {
      const scanner = html5QrcodeRef.current as { stop?: () => Promise<void>; clear?: () => void } | null;
      if (scanner?.stop) { await scanner.stop(); scanner.clear?.(); }
    } catch { /* ignore */ }
    html5QrcodeRef.current = null;
  };

  const submitSerial = async (serial: string) => {
    const cleaned = serial.trim().toUpperCase().replace(/^\(S\)\s*/i, "");
    if (!cleaned) return;
    setScannedSerial(cleaned);
    setStatus("scanning");
    setMsg("Enviando...");
    try {
      const res = await fetch("/api/scan-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, serial: cleaned }),
      });
      if (res.ok) {
        setStatus("success");
        setMsg(cleaned);
      } else {
        const j = await res.json().catch(() => ({}));
        setStatus("error");
        setMsg(j.error === "expired" ? "Sessão expirada. Gere um novo QR no Mac." : "Erro ao enviar. Tente novamente.");
      }
    } catch {
      setStatus("error");
      setMsg("Sem conexão. Verifique o Wi-Fi.");
    }
  };

  // ── iOS: captura foto e decodifica com Html5Qrcode.scanFile ──────────────
  const handleFileCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // reset para permitir nova captura
    e.target.value = "";

    setStatus("scanning");
    setMsg("Analisando imagem...");

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const tmpId = "ios-qr-reader";
      let tmpDiv = document.getElementById(tmpId);
      if (!tmpDiv) {
        tmpDiv = document.createElement("div");
        tmpDiv.id = tmpId;
        tmpDiv.style.display = "none";
        document.body.appendChild(tmpDiv);
      }
      const reader = new Html5Qrcode(tmpId, { verbose: false });
      const decoded = await reader.scanFile(file, /* showImage */ false);
      await reader.clear?.();
      await submitSerial(decoded);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.toLowerCase().includes("no qr code") || errMsg.toLowerCase().includes("no multi format")) {
        setStatus("error");
        setMsg("QR code não encontrado na foto. Tente novamente com melhor enquadramento.");
      } else {
        setStatus("error");
        setMsg(`Erro ao ler imagem: ${errMsg}`);
      }
    }
  };

  // ── Desktop / Android: stream via câmera ────────────────────────────────
  const startCamera = async () => {
    if (!token) { setStatus("error"); setMsg("Token inválido."); return; }
    setStatus("scanning");
    setMsg("");
    setShowManual(false);
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      await new Promise((r) => setTimeout(r, 300));
      if (!scannerRef.current) { setStatus("error"); setMsg("Erro ao inicializar câmera."); return; }

      const id = "iphone-qr-scanner";
      scannerRef.current.id = id;

      const scanner = new Html5Qrcode(id, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
        verbose: false,
      });
      html5QrcodeRef.current = scanner;

      await scanner.start(
        { facingMode: { ideal: "environment" } },
        {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          disableFlip: false,
        },
        async (decoded: string) => {
          await stopCamera();
          await submitSerial(decoded);
        },
        () => { /* frame sem leitura */ }
      );
    } catch (err) {
      await stopCamera();
      const errMsg = err instanceof Error ? err.message : String(err);
      setStatus("error");
      setMsg(
        errMsg.includes("NotAllowedError") || errMsg.includes("Permission")
          ? "Permissão de câmera negada. Vá em Configurações > Safari > Câmera e permita o acesso."
          : `Erro: ${errMsg}`
      );
    }
  };

  const handleOpenCamera = () => {
    if (!token) { setStatus("error"); setMsg("Token inválido."); return; }
    if (isIOS()) {
      // iOS: dispara o input de arquivo (câmera nativa)
      fileInputRef.current?.click();
    } else {
      startCamera();
    }
  };

  useEffect(() => { return () => { stopCamera(); }; }, []);

  if (!token) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-6 text-center">
        <p className="text-4xl mb-4">⚠️</p>
        <p className="text-lg font-semibold">Link inválido</p>
        <p className="text-sm text-gray-400 mt-2">Gere um novo QR code no sistema do Mac.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0A] text-white">
      {/* Input oculto para iOS */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileCapture}
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-12 pb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#E8740E" }}>
          <span className="text-white text-lg">🐯</span>
        </div>
        <div>
          <p className="text-sm font-bold text-white">TigrãoImports</p>
          <p className="text-xs text-gray-400">Scanner remoto</p>
        </div>
      </div>

      <div className="flex-1 px-5 pb-8">

        {/* Success */}
        {status === "success" && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="w-24 h-24 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center">
              <span className="text-5xl">✅</span>
            </div>
            <div>
              <p className="text-xl font-bold text-green-400">Escaneado!</p>
              <p className="text-base font-mono text-white mt-2 bg-[#1A1A1A] px-4 py-2 rounded-xl">{scannedSerial}</p>
              <p className="text-sm text-gray-400 mt-3">O produto foi preenchido automaticamente no Mac.</p>
            </div>
            <button
              onClick={() => { setStatus("idle"); setScannedSerial(""); setMsg(""); }}
              className="mt-2 px-6 py-3 rounded-2xl font-semibold text-white text-sm"
              style={{ background: "#E8740E" }}
            >
              Escanear outro
            </button>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="w-24 h-24 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center">
              <span className="text-5xl">❌</span>
            </div>
            <div>
              <p className="text-lg font-semibold text-red-400">Ops!</p>
              <p className="text-sm text-gray-300 mt-2 max-w-xs">{msg}</p>
            </div>
            <button onClick={() => { setStatus("idle"); setMsg(""); }} className="px-6 py-3 rounded-2xl font-semibold text-white text-sm" style={{ background: "#E8740E" }}>
              Tentar novamente
            </button>
          </div>
        )}

        {/* Idle */}
        {status === "idle" && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div>
              <p className="text-2xl font-bold text-white">Pronto para escanear</p>
              <p className="text-sm text-gray-400 mt-2">Aponte a câmera para o QR code da etiqueta</p>
            </div>
            <button
              onClick={handleOpenCamera}
              className="w-full max-w-xs py-5 rounded-2xl font-bold text-white text-lg flex items-center justify-center gap-3 active:scale-95 transition-transform"
              style={{ background: "#E8740E" }}
            >
              📷 Abrir câmera
            </button>

            {/* Fallback: digitar serial manualmente */}
            {!showManual ? (
              <button onClick={() => setShowManual(true)} className="text-sm text-gray-500 underline underline-offset-2">
                Digitar serial manualmente
              </button>
            ) : (
              <div className="w-full max-w-xs space-y-3">
                <input
                  type="text"
                  value={manualSerial}
                  onChange={e => setManualSerial(e.target.value.toUpperCase())}
                  placeholder="Ex: CV4FFWYKNQ"
                  autoCapitalize="characters"
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#333] rounded-xl text-white font-mono text-center text-lg outline-none focus:border-[#E8740E]"
                />
                <button
                  onClick={() => { if (manualSerial.trim()) submitSerial(manualSerial); }}
                  disabled={manualSerial.trim().length < 5}
                  className="w-full py-3 rounded-2xl font-bold text-white disabled:opacity-40"
                  style={{ background: "#E8740E" }}
                >
                  Confirmar
                </button>
              </div>
            )}

            <p className="text-xs text-gray-600">Sessão válida por 10 minutos</p>
          </div>
        )}

        {/* Scanning */}
        {status === "scanning" && (
          <div className="flex flex-col gap-4">
            <div className="text-center pt-2 space-y-1">
              <p className="text-sm text-gray-300 font-medium">
                {msg || "Aponte para o QR code da etiqueta"}
              </p>
              {!msg && <p className="text-xs text-gray-500">📏 Mantenha o QR centralizado e a ~10cm de distância</p>}
            </div>

            {/* iOS mostra spinner enquanto analisa, não o div do scanner */}
            {isIOS() ? (
              <div className="flex flex-col items-center justify-center gap-4 py-16">
                <div className="w-14 h-14 border-4 border-[#E8740E] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-400">{msg || "Analisando..."}</p>
                <button
                  onClick={() => { setStatus("idle"); setMsg(""); }}
                  className="mt-4 px-6 py-3 rounded-2xl font-semibold text-sm border border-gray-700 text-gray-400"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <>
                <div
                  ref={scannerRef}
                  className="w-full rounded-2xl overflow-hidden bg-black"
                  style={{ minHeight: 340 }}
                />
                <button
                  onClick={async () => { await stopCamera(); setStatus("idle"); setMsg(""); }}
                  className="w-full py-3 rounded-2xl font-semibold text-sm border border-gray-700 text-gray-400"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => { await stopCamera(); setStatus("idle"); setShowManual(true); }}
                  className="text-sm text-gray-600 underline underline-offset-2 text-center"
                >
                  Câmera não reconhece? Digitar manual
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        <p>Carregando...</p>
      </div>
    }>
      <ScannerContent />
    </Suspense>
  );
}
