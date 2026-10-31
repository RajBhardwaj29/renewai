export type AssistantCitation = { page: number; start: number; end: number; quote: string };
export type AssistantAnswer = {
  status: "answered" | "abstained";
  contract_id: string;
  document_sha256: string;
  citations: AssistantCitation[];
};

export type ChatAnswer = Omit<AssistantAnswer, "status"> & { status: "answered" | "abstained" | "guidance"; answer: string };

export function parseChatAnswer(value: unknown, contractId: string): ChatAnswer {
  if (!value || typeof value !== "object") throw new Error("Invalid chat answer");
  const raw = value as Record<string, unknown>;
  const guidance = raw.status === "guidance";
  const parsed = parseAssistantAnswer(guidance
    ? { ...raw, status: Array.isArray(raw.citations) && raw.citations.length ? "answered" : "abstained" }
    : value, contractId);
  const answer = (value as Record<string, unknown>).answer;
  if (typeof answer !== "string" || !answer.trim() || answer.length > 900) throw new Error("Invalid chat answer");
  return { ...parsed, status: guidance ? "guidance" : parsed.status, answer: answer.trim() };
}

export function parseAssistantAnswer(value: unknown, contractId: string): AssistantAnswer {
  if (!value || typeof value !== "object") throw new Error("Invalid assistant response");
  const data = value as Record<string, unknown>;
  if (data.contract_id !== contractId || data.requires_human_review !== true ||
      typeof data.document_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(data.document_sha256) ||
      !Array.isArray(data.citations) || data.citations.length > 3 ||
      (data.status !== "answered" && data.status !== "abstained") ||
      (data.status === "answered" ? data.citations.length === 0 : data.citations.length !== 0)) {
    throw new Error("Invalid assistant response");
  }
  const citations = data.citations.map((value: unknown): AssistantCitation => {
    if (!value || typeof value !== "object") throw new Error("Invalid citation");
    const span = value as Record<string, unknown>;
    const { page, start, end, quote } = span;
    if (typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > 200 ||
        typeof start !== "number" || !Number.isInteger(start) || start < 0 ||
        typeof end !== "number" || !Number.isInteger(end) || end <= start ||
        typeof quote !== "string" || !quote.trim() || Array.from(quote).length > 1800 ||
        end - start !== Array.from(quote).length) throw new Error("Invalid citation");
    return { page, start, end, quote };
  });
  return { status: data.status, contract_id: contractId, document_sha256: data.document_sha256, citations };
}
