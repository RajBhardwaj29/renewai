"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import AppNavbar from "@/components/AppNavbar";
import ContractUploadReview, { type AnalysisResponse } from "@/components/ContractUploadReview";
import { authFetch } from "@/lib/authFetch";
import { BatchUploadQueue, UploadFailure, type UploadStatus } from "@/lib/batchUpload";

const statusLabels: Record<UploadStatus, string> = {
  queued: "Queued", analyzing: "Analyzing…", ready: "Ready for review",
  failed: "Analysis failed", duplicate: "Duplicate", saving: "Saving…",
  save_failed: "Save needs attention", saved: "Saved",
};

async function analyze(file: File, signal: AbortSignal): Promise<AnalysisResponse> {
  const body = new FormData();
  body.append("file", file);
  const response = await authFetch("/contracts/analyze", { method: "POST", body, signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]) });
  const data = await response.json();
  if (!response.ok) {
    throw new UploadFailure(typeof data.detail === "string" ? data.detail
      : response.status === 409 ? "This contract has already been saved." : "Contract analysis failed. Please try again.",
    typeof data.detail === "object" ? data.detail?.existing_contract_id : undefined, response.status === 409);
  }
  if (!data.contract || !data.renewal_intelligence || typeof data.filename !== "string") {
    throw new UploadFailure("We couldn't read the analysis result. Please try again.");
  }
  return data as AnalysisResponse;
}

export default function AnalyzeContractPage() {
  const [queue] = useState(() => new BatchUploadQueue(analyze));
  const items = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const busy = items.some(item => item.status === "analyzing" || item.status === "saving");
  const unsaved = items.some(item => item.status !== "saved" && item.status !== "duplicate");
  const activeId = selected ?? items.find(item => item.analysis)?.id;

  useEffect(() => () => queue.stop(), [queue]);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  function openReview(id: string) {
    setSelected(id);
    requestAnimationFrame(() => document.getElementById(`batch-review-${id}`)?.focus());
  }

  function newBatch() {
    if (unsaved && !window.confirm("Discard this batch's unsaved files and reviews? Saved contracts will remain in your workspace.")) return;
    if (queue.reset()) { setSelected(null); setError(""); }
  }

  return <AuthGuard>
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <AppNavbar />
      <div className="renewai-workspace">
        <header className="renewai-page-header">
          <div>
            <p className="renewai-eyebrow">Contract intelligence</p>
            <h1 className="renewai-page-title">Upload contracts</h1>
            <p className="renewai-page-description">Choose up to 10 PDFs. We’ll analyze them one at a time. Review and save each contract individually.</p>
          </div>
          <Link href="/contracts" className="renewai-button-secondary">View Contracts</Link>
        </header>
        <section className="renewai-card mb-6 p-6" aria-labelledby="batch-heading">
          <h2 id="batch-heading" className="text-lg font-bold">Contract PDFs</h2>
          <p id="batch-help" className="my-3 text-sm text-slate-600">Keep this page open until you finish reviewing and saving. Files and unsaved reviews are kept only in this page and are lost when you leave or refresh.</p>
          <p className="mb-4 text-sm text-slate-600">Text-readable PDFs only, up to 10 MiB and 200 pages each. Scanned PDFs may need OCR. Saving retains verified page text privately for Ask RenewAI.</p>
          {!items.length ? <>
            <label htmlFor="batch-pdfs" className="renewai-label">Choose 1–10 PDF contracts</label>
            <input id="batch-pdfs" type="file" multiple accept=".pdf,application/pdf" aria-describedby="batch-help"
              className="block w-full text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-brand-action file:px-4 file:py-3 file:text-white"
              onChange={event => {
                setError("");
                try { queue.select(Array.from(event.target.files ?? [])); }
                catch (err) { setError(err instanceof Error ? err.message : "Please choose your PDFs again."); }
                event.target.value = "";
              }} />
          </> : <div className="flex flex-wrap gap-3">
            <button type="button" className="renewai-button-primary" disabled={busy || !items.some(item => item.status === "queued")} onClick={() => void queue.start()}>Analyze queued PDFs</button>
            <button type="button" className="renewai-button-secondary" disabled={busy} onClick={newBatch}>Start new batch</button>
          </div>}
          {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        </section>
        {!!items.length && <section className="renewai-card mb-6 p-6" aria-labelledby="queue-heading">
          <h2 id="queue-heading" className="text-lg font-bold">Upload queue</h2>
          <p role="status" aria-live="polite" className="my-3 text-sm text-slate-600">
            {items.filter(item => item.status === "saved").length} saved · {items.filter(item => ["ready", "save_failed", "saving"].includes(item.status)).length} awaiting review or save · {items.filter(item => item.status === "failed").length} failed · {items.filter(item => item.status === "duplicate").length} duplicates · {items.filter(item => ["queued", "analyzing"].includes(item.status)).length} pending
          </p>
          <ul className="divide-y divide-slate-200">
            {items.map(item => <li key={item.id} id={`batch-row-${item.id}`} tabIndex={-1} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0 flex-1 basis-48">
                <p className="break-all font-semibold">{item.file.name}</p>
                <p className="text-sm text-slate-600">{statusLabels[item.status]}</p>
                {item.error && <p className="mt-1 break-words text-sm text-red-700">{item.error}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {item.status === "failed" && item.retryable && <button type="button" className="renewai-button-secondary" onClick={() => queue.retry(item.id)}>Retry analysis<span className="sr-only"> for {item.file.name}</span></button>}
                {item.analysis && <button type="button" className="renewai-button-secondary" aria-pressed={activeId === item.id} onClick={() => openReview(item.id)}>{item.status === "saved" ? "View saved result" : "Review"}<span className="sr-only"> {item.file.name}</span></button>}
                {item.existingId && <Link className="renewai-button-secondary" href={`/contracts/${item.existingId}`}>View existing contract</Link>}
                {item.duplicateOf && <button type="button" className="renewai-button-secondary" onClick={() => {
                  const original = items.find(candidate => candidate.id === item.duplicateOf);
                  if (original?.analysis) openReview(original.id);
                  else document.getElementById(`batch-row-${item.duplicateOf}`)?.focus();
                }}>View original in queue</button>}
              </div>
            </li>)}
          </ul>
        </section>}
        {items.map(item => item.analysis ? <div key={item.id} id={`batch-review-${item.id}`} tabIndex={-1} aria-label={`Review ${item.file.name}`} hidden={activeId !== item.id}>
          <ContractUploadReview file={item.file} initialAnalysis={item.analysis}
            onStatus={(status, existingId) => queue.update(item.id, { status, existingId })} />
        </div> : null)}
      </div>
    </main>
  </AuthGuard>;
}
