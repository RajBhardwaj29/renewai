"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { authFetch } from "@/lib/authFetch";
import { parseChatAnswer, type ChatAnswer } from "@/lib/contractAssistant";

type Turn = { id: number; question: string; answer?: ChatAnswer; error?: string };
type SourceState = "checking" | "ready" | "missing" | "error";

export function AssistantResult({ answer }: { answer: ChatAnswer }) {
  return <div className="min-w-0 rounded-2xl rounded-tl-sm border border-slate-200 bg-white p-4 [overflow-wrap:anywhere]">
    {answer.status === "guidance" ? <p className="mb-2 text-xs font-semibold text-blue-800">Decision guidance · Your team decides</p> : null}
    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{answer.answer}</p>
    {answer.citations.map((citation) => <details key={`${citation.page}-${citation.start}`} className="mt-3 border-t border-slate-100 pt-3">
      <summary className="cursor-pointer text-xs font-semibold text-blue-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">View source · Page {citation.page}</summary>
      <blockquote className="mt-3 whitespace-pre-wrap border-l-2 border-blue-200 pl-3 text-xs leading-6 text-slate-600">{citation.quote}</blockquote>
    </details>)}
  </div>;
}

const suggestions = ["What is the notice period?", "Can the price increase at renewal?", "What are the termination terms?"];

export default function ContractAssistant({ contractId, contractName }: { contractId: string; contractName: string }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<SourceState>("checking");
  const [file, setFile] = useState<File | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [running, setRunning] = useState(false);
  const active = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  useEffect(() => () => active.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    const panel = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    panel?.showModal();
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      panel?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function checkSource() {
      setSource("checking");
      try {
        const response = await authFetch(`/contracts/${encodeURIComponent(contractId)}/chat/source`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || data.contract_id !== contractId || typeof data.ready !== "boolean") throw new Error("Unavailable");
        setSource(data.ready ? "ready" : "missing");
      } catch { if (!controller.signal.aborted) setSource("error"); }
    }
    void checkSource();
    return () => controller.abort();
  }, [open, contractId]);

  useEffect(() => { if (open) tail.current?.scrollIntoView({ block: "end" }); }, [open, turns, running]);
  useEffect(() => {
    if (open && source === "ready" && !running && !connecting) input.current?.focus();
  }, [open, source, running, connecting]);

  function cancel() {
    active.current?.abort();
    active.current = null;
    setRunning(false);
    setConnecting(false);
    setTurns((previous) => previous.map((turn) => !turn.answer && !turn.error ? { ...turn, error: "Request stopped. You can send this question again." } : turn));
  }
  function close() { cancel(); setOpen(false); }
  function newChat() { cancel(); setTurns([]); setQuestion(""); input.current?.focus(); }

  async function connectPDF(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || active.current) return;
    if (file.size > 10 * 1024 * 1024 || !file.name.toLowerCase().endsWith(".pdf")) { setConnectionError("Choose the original PDF, up to 10 MiB."); return; }
    const controller = new AbortController(); active.current = controller;
    setConnecting(true); setConnectionError("");
    try {
      const body = new FormData(); body.append("file", file);
      const response = await authFetch(`/contracts/${encodeURIComponent(contractId)}/chat/source`, { method: "POST", body, signal: controller.signal, cache: "no-store" });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) { setConnectionError(typeof data.detail === "string" ? data.detail : "We couldn’t connect this PDF. Please try again."); return; }
      if (data.contract_id !== contractId || data.ready !== true) throw new Error("Invalid response");
      setSource("ready"); setFile(null); input.current?.focus();
    } catch { if (!controller.signal.aborted) setConnectionError("We couldn’t connect this PDF. Please try again."); }
    finally { if (active.current === controller) { active.current = null; setConnecting(false); } }
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = question.trim();
    if (active.current || source !== "ready" || submitted.length < 3) return;
    const id = ++sequence.current;
    const controller = new AbortController(); active.current = controller;
    const previousQuestions = turns.filter((turn) => turn.answer).slice(-6).map((turn) => turn.question);
    setTurns((previous) => [...previous.slice(-19), { id, question: submitted }]);
    setQuestion(""); setRunning(true);
    function fail(message: string) { setTurns((previous) => previous.map((turn) => turn.id === id ? { ...turn, error: message } : turn)); }
    try {
      const response = await authFetch(`/contracts/${encodeURIComponent(contractId)}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: submitted, previous_questions: previousQuestions }), signal: controller.signal, cache: "no-store",
      });
      const data: unknown = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) { const detail = (data as { detail?: unknown })?.detail; fail(typeof detail === "string" ? detail : "I couldn’t answer right now. Please try again."); return; }
      const answer = parseChatAnswer(data, contractId);
      setTurns((previous) => previous.map((turn) => turn.id === id ? { ...turn, answer } : turn));
    } catch { if (!controller.signal.aborted) fail("I couldn’t answer right now. Please try again."); }
    finally { if (active.current === controller) { active.current = null; setRunning(false); input.current?.focus(); } }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-controls="contract-assistant-panel" className="renewai-button-primary">Ask RenewAI</button>
    <dialog ref={dialog} id="contract-assistant-panel" aria-modal="true" aria-labelledby="contract-assistant-heading" aria-describedby="assistant-contract"
      onCancel={(event) => { event.preventDefault(); close(); }}
      className="fixed inset-0 m-0 h-dvh max-h-dvh w-full max-w-none overflow-hidden border-0 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/40 open:flex open:flex-col sm:left-auto sm:w-[32rem] sm:max-w-[calc(100vw_-_2rem)] sm:border-l sm:border-slate-200">
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-2"><h2 id="contract-assistant-heading" className="text-lg font-bold">Ask RenewAI</h2>
          <div className="flex gap-2"><button type="button" onClick={newChat} className="renewai-button-secondary">New chat</button><button ref={closeButton} type="button" onClick={close} className="renewai-button-secondary">Close</button></div>
        </div>
        <p id="assistant-contract" className="mt-2 text-xs font-semibold text-slate-700 [overflow-wrap:anywhere]">{contractName}</p>
        <p className="mt-1 text-xs text-slate-500">Answers from this contract. Follow-up questions welcome.</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 px-4 py-5">
        {turns.length === 0 ? <div className="space-y-4"><p className="text-sm leading-6 text-slate-700">Hi! What would you like to know about this contract? I’ll explain it simply and show the source when you need it.</p>
          <div className="flex flex-col items-start gap-2" aria-label="Suggested questions">{suggestions.map((suggestion) => <button type="button" key={suggestion} disabled={running} onClick={() => { setQuestion(suggestion); input.current?.focus(); }} className="min-h-11 rounded-xl border border-blue-100 bg-white px-3 py-2 text-left text-xs font-semibold text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600">{suggestion}</button>)}</div>
        </div> : null}
        {source === "checking" ? <p role="status" className="mt-4 text-sm text-slate-600">Connecting to your contract…</p> : null}
        {source === "error" ? <p role="alert" className="mt-4 text-sm text-red-700">I couldn’t connect to this contract. Close and reopen the chat to try again.</p> : null}
        {source === "missing" ? <form onSubmit={connectPDF} className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <label htmlFor="assistant-pdf" className="text-sm font-bold">Connect this older contract once</label>
          <p id="assistant-file-help" className="mt-2 text-xs leading-5 text-slate-600">This contract was saved before chat was available. Attach the original PDF once. We’ll securely retain its page text with the contract so you won’t need to attach it again. The PDF file itself isn’t stored.</p>
          <input id="assistant-pdf" type="file" accept="application/pdf,.pdf" required disabled={connecting} aria-describedby="assistant-file-help" className="mt-3 block w-full min-w-0 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-blue-800" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setConnectionError(""); }} />
          <button type="submit" disabled={!file || connecting} className="renewai-button-primary mt-3 disabled:opacity-50">{connecting ? "Connecting…" : "Connect PDF"}</button>
          {connectionError ? <p role="alert" className="mt-2 text-xs text-red-700">{connectionError}</p> : null}
        </form> : null}
        <div role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text" className="mt-5 space-y-5">
          {turns.map((turn) => <div key={turn.id} className="space-y-3">
            <div className="ml-8 rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-3 text-white"><span className="sr-only">You: </span><p className="whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{turn.question}</p></div>
            <div className="mr-4"><span className="sr-only">RenewAI: </span>{turn.answer ? <AssistantResult answer={turn.answer} /> : turn.error ? <div className="rounded-2xl border border-red-100 bg-white p-4"><p className="text-sm leading-6 text-red-800">{turn.error}</p><button type="button" disabled={running} onClick={() => { setQuestion(turn.question); input.current?.focus(); }} className="renewai-link mt-2 min-h-11 text-xs font-semibold">Try this question again</button></div> : <p className="text-sm text-slate-500">Reading your contract…</p>}</div>
          </div>)}
        </div><div ref={tail} />
      </div>
      <footer className="shrink-0 border-t border-slate-200 bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <form onSubmit={ask} aria-busy={running}>
          <label htmlFor="assistant-question" className="sr-only">Your message</label>
          <div className="flex items-end gap-2"><textarea ref={input} id="assistant-question" value={question} onChange={(event) => setQuestion(event.target.value)} minLength={3} maxLength={1000} required disabled={running || source !== "ready"} rows={2} placeholder="Ask about your contract…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} className="min-w-0 flex-1 resize-none rounded-xl border border-slate-300 p-3 text-sm leading-6 focus:outline-blue-600 disabled:bg-slate-50" />
            <button type="submit" aria-label="Send message" disabled={running || source !== "ready" || question.trim().length < 3} className="renewai-button-primary disabled:opacity-50">Send</button></div>
        </form>
        <p className="mt-2 text-[11px] leading-4 text-slate-500">AI can make mistakes. Check important terms against the sources. Not legal advice. Chat isn’t saved. <a href="/privacy" target="_blank" rel="noopener noreferrer" className="renewai-link">Privacy</a></p>
      </footer>
    </dialog>
  </>;
}
