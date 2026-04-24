"use client";

import { createRoot } from "react-dom/client";
import { useEffect } from "react";

// Modal de confirmacao global. Substitui o confirm()/alert() nativo do browser
// por algo mais amigavel. API imperativa pra substituir 1-pra-1:
//
//   if (confirm("Deletar?")) { ... }
//   ->
//   if (await confirmar({ title: "Deletar?" })) { ... }
//
// Pra acoes com mais de 2 opcoes (ex: cancelar atacado: creditar / nao creditar
// / voltar), usar `perguntar()` que retorna a string da opcao escolhida.

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
}

interface QuestionOption {
  label: string;
  value: string;
  variant?: "default" | "primary" | "danger";
}

interface QuestionOptions {
  title: string;
  body?: string;
  options: QuestionOption[];
}

function mount<T>(render: (resolve: (v: T) => void) => React.ReactElement): Promise<T> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const cleanup = (v: T) => {
      setTimeout(() => {
        root.unmount();
        container.remove();
      }, 150);
      resolve(v);
    };
    root.render(render(cleanup));
  });
}

export function confirmar(opts: ConfirmOptions): Promise<boolean> {
  return mount<boolean>((resolve) => (
    <ConfirmDialog
      title={opts.title}
      body={opts.body}
      confirmLabel={opts.confirmLabel || "Confirmar"}
      cancelLabel={opts.cancelLabel || "Cancelar"}
      variant={opts.variant || "default"}
      onConfirm={() => resolve(true)}
      onCancel={() => resolve(false)}
    />
  ));
}

export function perguntar(opts: QuestionOptions): Promise<string | null> {
  return mount<string | null>((resolve) => (
    <QuestionDialog
      title={opts.title}
      body={opts.body}
      options={opts.options}
      onChoose={(v) => resolve(v)}
      onCancel={() => resolve(null)}
    />
  ));
}

// Substitui alert() nativo. Modal com so um OK.
export function avisar(opts: { title: string; body?: string }): Promise<void> {
  return mount<void>((resolve) => (
    <ConfirmDialog
      title={opts.title}
      body={opts.body}
      confirmLabel="OK"
      cancelLabel=""
      variant="default"
      onConfirm={() => resolve()}
      onCancel={() => resolve()}
    />
  ));
}

// ============================================================================
// Componentes
// ============================================================================

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  variant,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscToClose(onCancel);
  const confirmClass = variant === "danger"
    ? "bg-red-500 text-white hover:bg-red-600"
    : "bg-[#E8740E] text-white hover:bg-[#F5A623]";
  return (
    <Backdrop onClose={onCancel}>
      <h3 className="text-base font-semibold text-[#1D1D1F] mb-1">{title}</h3>
      {body && <p className="text-sm text-[#86868B] whitespace-pre-line mb-5">{body}</p>}
      <div className="flex gap-2 justify-end">
        {cancelLabel && (
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-semibold text-[#86868B] border border-[#D2D2D7] hover:bg-[#F5F5F7] transition-colors">
            {cancelLabel}
          </button>
        )}
        <button onClick={onConfirm} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${confirmClass}`}>
          {confirmLabel}
        </button>
      </div>
    </Backdrop>
  );
}

function QuestionDialog({
  title,
  body,
  options,
  onChoose,
  onCancel,
}: {
  title: string;
  body?: string;
  options: QuestionOption[];
  onChoose: (value: string) => void;
  onCancel: () => void;
}) {
  useEscToClose(onCancel);
  return (
    <Backdrop onClose={onCancel}>
      <h3 className="text-base font-semibold text-[#1D1D1F] mb-1">{title}</h3>
      {body && <p className="text-sm text-[#86868B] whitespace-pre-line mb-5">{body}</p>}
      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const cls = opt.variant === "danger"
            ? "bg-red-500 text-white hover:bg-red-600"
            : opt.variant === "primary"
              ? "bg-[#E8740E] text-white hover:bg-[#F5A623]"
              : "bg-white text-[#1D1D1F] border border-[#D2D2D7] hover:bg-[#F5F5F7]";
          return (
            <button key={opt.value} onClick={() => onChoose(opt.value)} className={`w-full px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${cls}`}>
              {opt.label}
            </button>
          );
        })}
      </div>
    </Backdrop>
  );
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-150">
        {children}
      </div>
    </div>
  );
}

function useEscToClose(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}
