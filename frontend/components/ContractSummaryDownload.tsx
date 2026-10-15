"use client";

import { useEffect, useRef, useState } from "react";
import { authFetchWithRetry } from "@/lib/authFetch";

const FAILURE = "We couldn't generate this summary right now. Please try again.";

export default function ContractSummaryDownload({ contractId }: { contractId: string }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  async function downloadSummary() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setGenerating(true);
    setError("");
    setDownloaded(false);
    try {
      const response = await authFetchWithRetry(
        `/contracts/${encodeURIComponent(contractId)}/summary.pdf`,
        { signal: controller.signal, cache: "no-store" },
      );
      if (!response.ok) {
        const message = response.status === 401
          ? "Your session has expired. Please sign in again."
          : response.status === 404
            ? "This contract is unavailable. Return to Contracts and try again."
            : FAILURE;
        throw new Error(message);
      }
      if (!response.headers.get("Content-Type")?.startsWith("application/pdf")) {
        throw new Error(FAILURE);
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error(FAILURE);
      if (controller.signal.aborted) return;
      const filename = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1];
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename?.replace(/[^a-zA-Z0-9._-]/g, "-") || "RenewAI-contract-summary.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloaded(true);
    } catch (failure) {
      if (!controller.signal.aborted) {
        // Only our known recovery messages can appear here, never a network exception.
        setError(failure instanceof Error && [FAILURE,
          "Your session has expired. Please sign in again.",
          "This contract is unavailable. Return to Contracts and try again.",
        ].includes(failure.message) ? failure.message : FAILURE);
      }
    } finally {
      if (!controller.signal.aborted) setGenerating(false);
      request.current = null;
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={downloadSummary}
        disabled={generating}
        aria-busy={generating}
        className="renewai-button-secondary disabled:cursor-wait disabled:opacity-60"
        title="Download saved terms, dates, insights and reminders. Internal notes and owner are excluded."
      >
        {generating ? "Generating PDF..." : "Download summary PDF"}
      </button>
      {error && <p role="alert" className="max-w-xs text-sm text-red-700">{error}</p>}
      {downloaded && <p role="status" className="max-w-xs text-xs text-slate-500">Summary downloaded. Internal notes and owner excluded.</p>}
    </div>
  );
}
