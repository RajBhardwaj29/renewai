export const clauseFields = [
  "renewal_clause", "termination_clause", "payment_terms",
  "pricing_clause", "minimum_commitment", "refund_clause",
] as const;

export type ClauseField = typeof clauseFields[number];
export type SavedClauses = Record<ClauseField, string | null>;
export type EvidenceStatus = "grounded" | "ambiguous" | "unverified" | "missing" | "unavailable";
type SourceSpan = { page: number; start: number; end: number; quote: string };
export type ClauseView = { field: ClauseField; status: EvidenceStatus; spans: SourceSpan[] };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();

function validSpan(value: unknown): value is SourceSpan {
  if (!record(value)) return false;
  return Number.isSafeInteger(value.page) && (value.page as number) >= 1
    && Number.isSafeInteger(value.start) && (value.start as number) >= 0
    && Number.isSafeInteger(value.end) && (value.end as number) > (value.start as number)
    && typeof value.quote === "string" && normalize(value.quote).length > 0
    // Python offsets count Unicode code points, rather than JavaScript UTF-16 units.
    && Array.from(value.quote).length === (value.end as number) - (value.start as number);
}

/** Fail closed for unsupported evidence, stale clause text and malformed spans.
 * This checks display consistency only; it cannot re-verify the original PDF.
 */
export function clauseEvidenceViews(evidence: unknown, saved: SavedClauses): ClauseView[] {
  const supported = record(evidence)
    && evidence.schema_version === "renewai.evidence.v1"
    && evidence.method === "literal-whitespace-v1"
    && evidence.stage === "reviewed_submission"
    && evidence.requires_human_review === true
    && typeof evidence.document_sha256 === "string" && /^[a-f0-9]{64}$/.test(evidence.document_sha256)
    && typeof evidence.text_sha256 === "string" && /^[a-f0-9]{64}$/.test(evidence.text_sha256)
    && Array.isArray(evidence.clauses);
  const candidates: unknown[] = supported ? evidence.clauses as unknown[] : [];
  return clauseFields.map((field) => {
    const fallback: ClauseView = { field, status: supported ? "unverified" : "unavailable", spans: [] };
    if (!supported) return fallback;
    const matches = candidates.filter((value) => record(value) && value.field === field);
    if (matches.length !== 1) return fallback;
    const clause = matches[0];
    if (!record(clause) || clause.text !== saved[field] || !Array.isArray(clause.source_spans)) return fallback;
    const text = normalize(saved[field] ?? "");
    if (clause.status === "missing" && !text && clause.source_spans.length === 0) {
      return { field, status: "missing", spans: [] };
    }
    if (!text) return fallback;
    if ((clause.status === "ambiguous" || clause.status === "unverified") && clause.source_spans.length === 0) {
      return { field, status: clause.status, spans: [] };
    }
    if (clause.status !== "grounded" || clause.source_spans.length === 0 || !clause.source_spans.every(validSpan)) return fallback;
    const spans = clause.source_spans;
    if (normalize(spans.map((span) => span.quote).join(" ")) !== text) return fallback;
    // A text-readable clause can cross a blank PDF page, so gaps are allowed.
    if (spans.some((span, index) => index > 0 && span.page <= spans[index - 1].page)) return fallback;
    return { field, status: "grounded", spans };
  });
}
