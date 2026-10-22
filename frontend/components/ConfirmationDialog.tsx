"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  requiredText?: string;
  destructive?: boolean;
};

function ConfirmationDialog({ options, onFinish }: {
  options: ConfirmationOptions;
  onFinish: (confirmed: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [confirmationText, setConfirmationText] = useState("");
  const canConfirm = !options.requiredText || confirmationText === options.requiredText;

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  return (
    <dialog ref={dialogRef} aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={(event) => { event.preventDefault(); onFinish(false); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>("input:not([disabled]), button:not([disabled])");
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }}
      className="renewai-confirmation fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-[1.5rem] border border-slate-200 bg-white p-6 text-slate-950 shadow-xl backdrop:bg-slate-950/50 sm:p-7">
      <form onSubmit={(event) => { event.preventDefault(); if (canConfirm) onFinish(true); }}>
        <h2 id={`${id}-title`} className="[overflow-wrap:anywhere] break-words text-xl font-bold tracking-tight">{options.title}</h2>
        <p id={`${id}-description`} className="[overflow-wrap:anywhere] mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{options.description}</p>
        {options.requiredText && (
          <div className="mt-5">
            <label htmlFor={`${id}-confirmation`} className="renewai-label">Type {options.requiredText} to confirm</label>
            <input id={`${id}-confirmation`} value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} autoComplete="off" spellCheck={false} className="renewai-input" />
          </div>
        )}
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
          <button ref={cancelRef} type="button" onClick={() => onFinish(false)} className="renewai-touch-target renewai-button-secondary">Cancel</button>
          <button type="submit" disabled={!canConfirm} className={options.destructive
            ? "inline-flex items-center justify-center rounded-xl bg-red-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            : "renewai-button-primary"}>{options.confirmLabel}</button>
        </div>
      </form>
    </dialog>
  );
}

export function useConfirmation() {
  const [options, setOptions] = useState<ConfirmationOptions | null>(null);
  const pending = useRef<((confirmed: boolean) => void) | null>(null);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);

  const requestConfirmation = useCallback((next: ConfirmationOptions): Promise<boolean> => {
    if (pending.current) return Promise.resolve(false);
    return new Promise((resolve) => { pending.current = resolve; setOptions(next); });
  }, []);
  const finish = useCallback((confirmed: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setOptions(null);
    resolve?.(confirmed);
  }, []);

  return {
    requestConfirmation,
    confirmationDialog: options ? <ConfirmationDialog options={options} onFinish={finish} /> : null,
  };
}
