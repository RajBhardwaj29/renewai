"use client";

import { useState } from "react";

// Persistent until dismissed so a success message is not lost on a short timer.
export default function Toast({ message }: { message: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-lg sm:bottom-6">
      <span aria-hidden="true" className="font-bold">✓</span>
      <p className="min-w-0 flex-1 break-words font-semibold leading-6">{message}</p>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss notification" className="shrink-0 rounded-lg px-2 py-1 font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
        Dismiss
      </button>
    </div>
  );
}
