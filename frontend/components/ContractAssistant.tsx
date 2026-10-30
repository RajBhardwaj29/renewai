"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { authFetch } from "@/lib/authFetch";
import { parseAssistantAnswer, type AssistantAnswer } from "@/lib/contractAssistant";

export function AssistantResult({ answer }: { answer: AssistantAnswer }) {
  return (
    <div className="mt-5 min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-5 [overflow-wrap:anywhere]">
      <p className="font-bold text-slate-950">{answer.status === "answered" ? "Source-supported passages" : "Insufficient source support"}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{answer.status === "answered"
        ? "The PDF contains these relevant passages:"
        : "I couldn't find sufficient support in this PDF to answer that question. Try a more specific question or review the original agreement."}</p>
      {answer.citations.map((citation) => (
        <figure key={`${citation.page}-${citation.start}`} className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <figcaption className="text-xs font-bold text-blue-800">Page {citation.page} · original PDF</figcaption>
          <blockquote className="mt-3 whitespace-pre-wrap border-l-2 border-blue-200 pl-3 text-sm leading-7 text-slate-700">{citation.quote}</blockquote>
        </figure>
      ))}
      <p className="mt-4 text-xs leading-5 text-slate-600">AI selects exact passages, which may omit relevant terms or amendments. Missing support does not mean a term is absent. Check the cited pages in your original PDF. Human review required; this is not legal advice.</p>
    </div>
  );
}

export default function ContractAssistant({ contractId }: { contractId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [answeredQuestion, setAnsweredQuestion] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || !file || question.trim().length < 3) return;
    setError("");
    setAnswer(null);
    if (file.size > 10 * 1024 * 1024 || !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Choose the original PDF, up to 10 MiB.");
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setRunning(true);
    const submittedQuestion = question.trim();
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("question", submittedQuestion);
      const response = await authFetch(`/contracts/${encodeURIComponent(contractId)}/ask`, {
        method: "POST", body, signal: controller.signal, cache: "no-store",
      });
      const data: unknown = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        const detail = (data as { detail?: unknown })?.detail;
        setError(typeof detail === "string" ? detail : "Ask RenewAI is temporarily unavailable. Please try again.");
        return;
      }
      setAnswer(parseAssistantAnswer(data, contractId));
      setAnsweredQuestion(submittedQuestion);
    } catch {
      if (!controller.signal.aborted) setError("Ask RenewAI couldn't complete this request. Please try again.");
    } finally {
      active.current = null;
      if (!controller.signal.aborted) setRunning(false);
    }
  }

  return (
    <section aria-labelledby="contract-assistant-heading" className="mb-8 renewai-card min-w-0 p-6 sm:p-7">
      <p className="renewai-eyebrow">AI Contract Assistant</p>
      <h2 id="contract-assistant-heading" className="renewai-card-title mt-2">Ask RenewAI</h2>
      <p id="assistant-scope" className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Ask about this contract’s terms and see exact source passages with PDF page citations. Each question is independent. Answers don’t change your saved terms, decisions or reminders.</p>
      <form onSubmit={ask} className="mt-5 space-y-4" aria-describedby="assistant-scope" aria-busy={running}>
        <div>
          <label htmlFor="assistant-pdf" className="block text-sm font-bold text-slate-800">Original contract PDF</label>
          <p id="assistant-file-help" className="mt-1 text-xs leading-5 text-slate-600">RenewAI doesn’t retain original PDFs. Attach the same file you saved for this contract (up to 10 MiB, 200 pages). Your question and selected text are processed by the configured AI provider. This feature does not save questions or answers.</p>
          <input id="assistant-pdf" type="file" accept="application/pdf,.pdf" required disabled={running} aria-describedby="assistant-file-help"
            className="mt-2 block w-full min-w-0 rounded-xl border border-slate-300 p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-semibold file:text-blue-800"
            onChange={(event) => { setFile(event.target.files?.[0] ?? null); setAnswer(null); setError(""); }} />
        </div>
        <div>
          <label htmlFor="assistant-question" className="block text-sm font-bold text-slate-800">Your question</label>
          <textarea id="assistant-question" value={question} onChange={(event) => setQuestion(event.target.value)} minLength={3} maxLength={1000} required disabled={running}
            placeholder="For example: What notice is required to prevent renewal?" rows={3}
            className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm leading-6 focus:border-blue-600 focus:outline-blue-600" />
          <p className="mt-1 text-xs text-slate-500">{question.length}/1,000 characters · text-readable PDFs only</p>
        </div>
        <button type="submit" disabled={running || !file || question.trim().length < 3} className="renewai-button-primary disabled:cursor-not-allowed disabled:opacity-50">{running ? "Finding source passages…" : "Ask RenewAI"}</button>
      </form>
      <div role="status" aria-live="polite" aria-atomic="true">
        {running ? <p className="mt-4 text-sm text-slate-600">Checking this PDF for source support…</p> : null}
        {error ? <p className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}
        {answer ? <><p className="mt-5 whitespace-pre-wrap text-sm font-semibold text-slate-800">Question: {answeredQuestion}</p><AssistantResult answer={answer} /></> : null}
      </div>
    </section>
  );
}
