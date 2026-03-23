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
      const trimmed = code.trim().toUpperCase();
      if (trimmed.length >= 5) {
        onScan(trimmed);
        setInputValue("");
        bufferRef.current = "";
      }
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
      const { Html5Qrcode } = await import("html5-qrcode");

      // Wait for DOM element to be ready
      await new Promise((r) => setTimeout(r, 300));

      if (!scannerRef.current) {
        setCameraError("Erro ao inicializar scanner");
        setCameraOpen(false);
        return;
      }

      const scannerId = "barcode-scanner-camera";
      scannerRef.current.id = scannerId;

      const scanner = new Html5Qrcode(scannerId);
      html5QrcodeRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" }, // Back camera
        {
          fps: 10,
          qrbox: { width: 280, height: 120 },
          aspectRatio: 2.0,
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
