"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

/**
 * Barcode Scanner component — supports both USB barcode readers and camera scanning.
 *
 * USB mode: Detects fast keystrokes (< 80ms gap) typical of barcode scanners,
 * then captures the Enter key to submit.
 *
 * Camera mode: Uses html5-qrcode library to scan 1D/2D barcodes via device camera.
 */
export default function BarcodeScanner({
  onScan,
  placeholder = "Bipe ou digite o Serial Number...",
  autoFocus = true,
  disabled = false,
}: BarcodeScannerProps) {
  const [inputValue, setInputValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [rejectMsg, setRejectMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrcodeRef = useRef<unknown>(null);
  const lastKeystrokeRef = useRef<number>(0);
  const bufferRef = useRef<string>("");

  // Focus input on mount
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = useCallback(
    (code: string) => {
      let trimmed = code.trim().toUpperCase();
      // Clean Apple barcode prefixes: "(S) " or "(S)" from Serial Number barcodes
      trimmed = trimmed.replace(/^\(S\)\s*/i, "");
      // Remove any non-alphanumeric chars that scanners might add
      trimmed = trimmed.replace(/[^A-Z0-9]/g, "");
      // Strip leading "S" captured from Apple box label "(S) Serial No."
      // e.g. scanner reads "SH2LTJNWP6M" (11 chars) → "H2LTJNWP6M" (10 chars)
      if (trimmed.length === 11 && trimmed.startsWith("S")) {
        trimmed = trimmed.slice(1);
      }

      if (!trimmed) return;

      // Apple Serial Number validation:
      // - Novos (2021+): 10 chars alfanuméricos
      // - Antigos: 11 ou 12 chars alfanuméricos
      // Reject: IMEI (15 digits), EID (32 digits), UPC (12-13 digits only)
      const isAppleSerial =
        (trimmed.length >= 10 && trimmed.length <= 12) &&   // 10, 11 or 12 chars
        /[A-Z]/.test(trimmed) &&                            // must have letters
        /[0-9]/.test(trimmed);                              // must have numbers

      if (!isAppleSerial) {
        setRejectMsg(
          trimmed.length === 15 && /^\d+$/.test(trimmed)
            ? "⚠️ Isso é um IMEI, não Serial Number. Bipe o código que começa com (S)."
            : trimmed.length > 20
            ? "⚠️ Código inválido (muito longo). Bipe apenas o Serial Number — código com (S)."
            : /^\d+$/.test(trimmed)
            ? "⚠️ Código só numérico detectado. Serial Number tem letras e números."
            : `⚠️ Código "${trimmed}" não é Serial Number Apple (deve ter 10 a 12 caracteres com letras e números).`
        );
        return;
      }

      setRejectMsg("");
      onScan(trimmed);
      setInputValue("");
      bufferRef.current = "";
    },
    [onScan]
  );

  // Detect USB barcode scanner (fast typing pattern)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const now = Date.now();
      const timeSinceLastKey = now - lastKeystrokeRef.current;
      lastKeystrokeRef.current = now;

      if (e.key === "Enter") {
        e.preventDefault();
        // If fast typing detected (scanner) or manual entry
        const value = inputRef.current?.value || "";
        handleSubmit(value);
        return;
      }

      // Track if this looks like scanner input (very fast)
      if (timeSinceLastKey < 80 && e.key.length === 1) {
        bufferRef.current += e.key;
      } else if (e.key.length === 1) {
        bufferRef.current = e.key;
      }
    },
    [handleSubmit]
  );

  // Camera scanning
  const startCamera = useCallback(async () => {
    setCameraError("");
    setCameraOpen(true);

    try {
      // Dynamic import to avoid SSR issues
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");

      // Wait for DOM element to be ready
      await new Promise((r) => setTimeout(r, 300));

      if (!scannerRef.current) {
        setCameraError("Erro ao inicializar scanner");
        setCameraOpen(false);
        return;
      }

      const scannerId = "barcode-scanner-camera";
      scannerRef.current.id = scannerId;

      // Enable all 1D barcode formats used by Apple
      const scanner = new Html5Qrcode(scannerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
        verbose: false,
      });
      html5QrcodeRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" }, // Back camera
        {
          fps: 15,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            // Wider scanning area for 1D barcodes
            const w = Math.min(viewfinderWidth * 0.9, 400);
            const h = Math.min(viewfinderHeight * 0.3, 150);
            return { width: Math.round(w), height: Math.round(h) };
          },
          aspectRatio: 1.5,
          disableFlip: false,
        },
        (decodedText: string) => {
          // Barcode detected
          handleSubmit(decodedText);
          stopCamera();
        },
        () => {
          // Scan error (expected, keep scanning)
        }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao acessar câmera";
      setCameraError(
        msg.includes("NotAllowedError") || msg.includes("Permission")
          ? "Permissão de câmera negada. Libere nas configurações do navegador."
          : `Erro: ${msg}`
      );
      setCameraOpen(false);
    }
  }, [handleSubmit]);

  const stopCamera = useCallback(async () => {
    try {
      const scanner = html5QrcodeRef.current as { stop?: () => Promise<void>; clear?: () => void } | null;
      if (scanner && scanner.stop) {
        await scanner.stop();
        scanner.clear?.();
      }
    } catch {
      // Ignore cleanup errors
    }
    html5QrcodeRef.current = null;
    setCameraOpen(false);
  }, []);

  return (
    <div className="space-y-3">
      {/* USB Scanner / Manual Input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#333] rounded-lg text-white text-lg font-mono focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E] outline-none transition-colors placeholder:text-[#555]"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] text-xs">
            📟 USB / Enter
          </div>
        </div>
        <button
          onClick={() => handleSubmit(inputValue)}
          disabled={disabled || inputValue.trim().length < 5}
          className="px-4 py-3 bg-[#E8740E] text-black font-bold rounded-lg hover:bg-[#F5A623] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          OK
        </button>
      </div>

      {/* Reject message */}
      {rejectMsg && (
        <p className="text-amber-600 text-sm bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
          {rejectMsg}
        </p>
      )}

      {/* Camera Toggle */}
      {!cameraOpen ? (
        <button
          onClick={startCamera}
          disabled={disabled}
          className="w-full py-3 bg-[#1A1A1A] border border-[#333] rounded-lg text-[#888] hover:text-white hover:border-[#E8740E] transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-xl">📸</span>
          Abrir Câmera para Escanear
        </button>
      ) : (
        <div className="space-y-2">
          <div
            ref={scannerRef}
            className="w-full rounded-lg overflow-hidden bg-black"
            style={{ minHeight: 250 }}
          />
          <button
            onClick={stopCamera}
            className="w-full py-2 bg-red-900/30 border border-red-700 rounded-lg text-red-400 hover:bg-red-900/50 transition-colors text-sm"
          >
            ✕ Fechar Câmera
          </button>
        </div>
      )}

      {/* Camera Error */}
      {cameraError && (
        <p className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded-lg">
          {cameraError}
        </p>
      )}
    </div>
  );
}
