"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/** Modal simples pra substituir window.confirm/prompt/alert com UI consistente
 *  e que nao bloqueia o thread. Uso:
 *
 *    const { confirm, alert, prompt, modal } = useConfirmModal();
 *    if (await confirm({ title: "Excluir?", description: "Nao da pra desfazer." })) { ... }
 *    const nome = await prompt({ title: "Novo nome", placeholder: "Ex: iPad A16" });
 *    await alert({ title: "Erro", description: "falha ao salvar" });
 *
 *  E renderizar `{modal}` dentro do JSX do componente. */

export type ConfirmOpts = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" → botao vermelho pra operacoes destrutivas. */
  variant?: "default" | "danger";
};

export type PromptOpts = {
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

export type AlertOpts = {
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: "default" | "danger";
};

type ModalState =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void }
  | { kind: "alert"; opts: AlertOpts; resolve: () => void }
  | null;

export function useConfirmModal() {
  const [state, setState] = useState<ModalState>(null);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const confirm = useCallback((opts: ConfirmOpts) => {
    return new Promise<boolean>((resolve) => setState({ kind: "confirm", opts, resolve }));
  }, []);

  const prompt = useCallback((opts: PromptOpts) => {
    return new Promise<string | null>((resolve) => {
      setInputValue(opts.defaultValue ?? "");
      setState({ kind: "prompt", opts, resolve });
    });
  }, []);

  const alert = useCallback((opts: AlertOpts) => {
    return new Promise<void>((resolve) => setState({ kind: "alert", opts, resolve }));
  }, []);

  useEffect(() => {
    if (state?.kind === "prompt") {
      // Foca o input no proximo tick pra esperar o portal renderizar.
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [state]);

  const close = useCallback(() => setState(null), []);

  const handleConfirm = () => {
    if (!state) return;
    if (state.kind === "confirm") state.resolve(true);
    else if (state.kind === "prompt") state.resolve(inputValue.trim() || null);
    else state.resolve();
    close();
  };

  const handleCancel = () => {
    if (!state) return;
    if (state.kind === "confirm") state.resolve(false);
    else if (state.kind === "prompt") state.resolve(null);
    else state.resolve();
    close();
  };

  const modal = state ? (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={handleCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-[16px] text-[#1D1D1F]">{state.opts.title}</h3>
        {state.opts.description && (
          <p className="text-[13px] text-[#6E6E73] whitespace-pre-wrap">{state.opts.description}</p>
        )}
        {state.kind === "prompt" && (
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirm();
              if (e.key === "Escape") handleCancel();
            }}
            placeholder={state.opts.placeholder || ""}
            className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm focus:outline-none focus:border-[#E8740E]"
          />
        )}
        <div className="flex justify-end gap-2 pt-1">
          {state.kind !== "alert" && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg text-sm text-[#6E6E73] border border-[#D2D2D7] hover:bg-[#F5F5F7] transition-colors"
            >
              {state.kind === "prompt" ? (state.opts.cancelLabel || "Cancelar") : ((state.opts as ConfirmOpts).cancelLabel || "Cancelar")}
            </button>
          )}
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
              (state.kind === "confirm" || state.kind === "alert") && state.opts.variant === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-[#E8740E] hover:bg-[#F5A623]"
            }`}
          >
            {state.kind === "confirm"
              ? ((state.opts as ConfirmOpts).confirmLabel || "Confirmar")
              : state.kind === "prompt"
              ? ((state.opts as PromptOpts).confirmLabel || "OK")
              : ((state.opts as AlertOpts).confirmLabel || "OK")}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, prompt, alert, modal };
}
