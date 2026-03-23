"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

type InputMode = "none" | "keyboard" | "camera";

/**
 * Barcode Scanner component — supports USB barcode readers, manual text input, and camera scanning.
 *
 * USB mode: Listens globally for fast keystrokes (< 80ms gap) typical of barcode scanners,
 * then captures the Enter key to submit. Always active when this component is mounted.
 *
 * Keyboard mode: Shows a text input field for manual Serial Number entry.
 *
 * Camera mode: Uses html5-qrcode library to scan 1D/2D barcodes via device camera.
 */
export default function BarcodeScanner({
  onScan,
  placeholder = "Digite o Serial Number...",
  autoFocus = true,
  disabled = false,
}: BarcodeScannerProps) {
  const [inputValue, setInputValue] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("none");
  const [cameraError, setCameraError] = useState("");
  const [rejectMsg, setRejectMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrcodeRef = useRef<unknown>(null);
  const lastKeystrokeRef = useRef<number>(0);
  const bufferRef = useRef<string>("");

  // Focus input when keyboard mode is activated
  useEffect(() => {
    if (inputMode === "keyboard" && autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputMode, autoFocus]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear input, show brief error, auto-dismiss, and re-focus
  const rejectAndReset = useCallback((msg: string) => {
    setInputValue("");
    bufferRef.current = "";
    setRejectMsg("❌ Código ignorado — bipe o Serial Number (S)");
    // Re-focus input for immediate next scan
    setTimeout(() => inputRef.current?.focus(), 50);
    // Auto-dismiss after 2 seconds
    if (rejectTimerRef.current) clearTimeout(rejectTimerRef.current);
    rejectTimerRef.current = setTimeout(() => setRejectMsg(""), 2000);
  }, []);

  // Cleanup reject timer on unmount
  useEffect(() => {
    return () => {
      if (rejectTimerRef.current) clearTimeout(rejectTimerRef.current);
    };
  }, []);

  const handleSubmit = useCallback(
    (code: string) => {
      let trimmed = code.trim().toUpperCase();
      // Clean Apple barcode prefixes: "(S) " or "(S)" from Serial Number barcodes
      trimmed = trimmed.replace(/^\(S\)\s*/i, "");
      // Remove any non-alphanumeric chars that scanners might add
      trimmed = trimmed.replace(/[^A-Z0-9]/g, "");
      // Strip leading "S" captured from Apple box label "(S) Serial No."
      // Valid serial = 10-12 chars. If starts with S and removing it gives valid length, strip it.
      if (trimmed.startsWith("S") && trimmed.length >= 11 && trimmed.length <= 13) {
        const candidate = trimmed.slice(1);
        if (candidate.length >= 10 && candidate.length <= 12 && /[A-Z]/.test(candidate) && /[0-9]/.test(candidate)) {
          trimmed = candidate;
        }
      }

      if (!trimmed) return;

      // Length validation: 10–12 chars
      if (trimmed.length < 10 || trimmed.length > 12) {
        const msg =
          trimmed.length === 15 && /^\d+$/.test(trimmed)
            ? "Isso é um IMEI, não Serial Number. Bipe o código que começa com (S)."
            : trimmed.length > 20
            ? "Código inválido (muito longo). Bipe apenas o Serial Number — código com (S)."
            : `Código "${trimmed}" não é Serial Number Apple (deve ter 10 a 12 caracteres com letras e números).`;
        rejectAndReset(msg);
        return;
      }

      // Must contain BOTH letters AND numbers
      const hasLetters = /[A-Z]/.test(trimmed);
      const hasNumbers = /[0-9]/.test(trimmed);
      if (!hasLetters || !hasNumbers) {
        const msg = /^\d+$/.test(trimmed)
          ? "Código só numérico detectado. Serial Number tem letras e números."
          : "Serial Number deve conter letras E números.";
        rejectAndReset(msg);
        return;
      }

      setRejectMsg("");
      onScan(trimmed);
      setInputValue("");
      bufferRef.current = "";
    },
    [onScan, rejectAndReset]
  );

  // Global keydown listener for USB barcode scanner — always active
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in the manual input field
      if (inputMode === "keyboard" && inputRef.current === document.activeElement) {
        return;
      }
      // Don't intercept if typing in other input/textarea elements
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
      }

      const now = Date.now();
      const timeSinceLastKey = now - lastKeystrokeRef.current;
      lastKeystrokeRef.current = now;

      if (e.key === "Enter") {
        if (bufferRef.current.length >= 5) {
          e.preventDefault();
          handleSubmit(bufferRef.current);
          bufferRef.current = "";
        }
        return;
      }

      // Track fast keystrokes (USB scanner pattern)
      if (e.key.length === 1) {
        if (timeSinceLastKey < 80) {
          bufferRef.current += e.key;
        } else {
          bufferRef.current = e.key;
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleSubmit, inputMode]);

  // Input field keydown handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const value = inputRef.current?.value || "";
        handleSubmit(value);
      }
    },
    [handleSubmit]
  );

  // Camera scanning
  const startCamera = useCallback(async () => {
    setCameraError("");
    setInputMode("camera");

    try {
      // Dynamic import to avoid SSR issues
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");

      // Wait for DOM element to be ready
      await new Promise((r) => setTimeout(r, 300));

      if (!scannerRef.current) {
        setCameraError("Erro ao inicializar scanner");
        setInputMode("none");
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
      setInputMode("none");
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
    setInputMode("none");
  }, []);

  return (
    <div className="space-y-3">
      {/* Mode selection buttons — shown when no mode is active */}
      {inputMode === "none" && (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setInputMode("keyboard")}
            disabled={disabled}
            className="w-full py-4 bg-[#1A1A1A] border border-[#333] rounded-lg text-white hover:border-[#E8740E] hover:bg-[#1E1208] transition-colors flex items-center justify-center gap-3 text-lg font-medium"
          >
            <span className="text-2xl">&#x2328;&#xFE0F;</span>
            Digitar Número de Série
          </button>
          <button
            onClick={startCamera}
            disabled={disabled}
            className="w-full py-4 bg-[#1A1A1A] border border-[#333] rounded-lg text-white hover:border-[#E8740E] hover:bg-[#1E1208] transition-colors flex items-center justify-center gap-3 text-lg font-medium"
          >
            <span className="text-2xl">&#x1F4F7;</span>
            Escanear Número de Série
          </button>
          <p className="text-[#555] text-xs text-center">
            Leitor USB funciona automaticamente — basta bipar o código
          </p>
        </div>
      )}

      {/* Keyboard / Manual Input mode */}
      {inputMode === "keyboard" && (
        <div className="space-y-2">
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
            </div>
            <button
              onClick={() => handleSubmit(inputValue)}
              disabled={disabled || inputValue.trim().length < 5}
              className="px-4 py-3 bg-[#E8740E] text-black font-bold rounded-lg hover:bg-[#F5A623] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              OK
            </button>
          </div>
          <button
            onClick={() => { setInputMode("none"); setInputValue(""); setRejectMsg(""); }}
            className="w-full py-2 bg-[#1A1A1A] border border-[#333] rounded-lg text-[#888] hover:text-white hover:border-[#555] transition-colors text-sm"
          >
            ← Voltar
          </button>
        </div>
      )}

      {/* Camera mode */}
      {inputMode === "camera" && (
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
            &#x2715; Fechar Câmera
          </button>
        </div>
      )}

      {/* Reject message (auto-dismisses after 2s) */}
      {rejectMsg && (
        <p className="text-red-400 text-sm bg-red-900/30 border border-red-700/50 px-3 py-2 rounded-lg animate-pulse">
          {rejectMsg}
        </p>
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
