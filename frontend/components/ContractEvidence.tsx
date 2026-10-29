import { clauseEvidenceViews, type EvidenceStatus, type SavedClauses } from "@/lib/contractEvidence";

const presentation: Record<EvidenceStatus, { label: string; description: string; style: string }> = {
  grounded: {
    label: "Grounded · text found",
    description: "This wording was found in the uploaded PDF. Review the surrounding terms and amendments.",
    style: "border-blue-200 bg-blue-50 text-blue-800",
  },
  ambiguous: {
    label: "Ambiguous",
    description: "This wording occurs more than once. Confirm which occurrence applies in the agreement.",
    style: "border-amber-200 bg-amber-50 text-amber-900",
  },
  unverified: {
    label: "Unverified",
    description: "Source support could not be confirmed for this saved wording. Check the original agreement.",
    style: "border-amber-200 bg-amber-50 text-amber-900",
  },
  missing: {
    label: "Missing",
    description: "No clause text was saved. This does not mean the agreement has no such term.",
    style: "border-slate-200 bg-slate-100 text-slate-700",
  },
  unavailable: {
    label: "Source evidence unavailable",
    description: "Page references and source quotes are unavailable for this record. Check your original agreement.",
    style: "border-slate-200 bg-slate-100 text-slate-700",
  },
};

const groups = [
  { title: "Renewal & termination", fields: ["renewal_clause", "termination_clause"] },
  { title: "Renewal economics & commitments", fields: ["pricing_clause", "minimum_commitment", "refund_clause"] },
  { title: "Payment terms", fields: ["payment_terms"] },
] as const;
const titles = {
  renewal_clause: "Renewal clause", termination_clause: "Termination clause",
  pricing_clause: "Pricing clause", minimum_commitment: "Minimum commitment",
  refund_clause: "Refund clause", payment_terms: "Payment terms",
};

export default function ContractEvidence({ contract }: {
  contract: SavedClauses & { source_evidence?: unknown };
}) {
  const views = clauseEvidenceViews(contract.source_evidence, contract);
  return (
    <section aria-labelledby="contract-evidence-heading" className="mb-8 renewai-card min-w-0 p-6 sm:p-7">
      <p className="renewai-eyebrow">Saved terms & source support</p>
      <h2 id="contract-evidence-heading" className="renewai-card-title mt-2">Contract Evidence</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        Saved clause text may have been edited during review. Source quotes show wording from the uploaded PDF at the time of saving.
      </p>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <p className="font-bold">Human review required</p>
        <p>A text match does not establish completeness, applicability or legal accuracy. Check qualifications and amendments against your signed agreement.</p>
      </div>
      {views.every((view) => view.status === "unavailable") ? (
        <p className="mt-4 text-sm leading-6 text-slate-600">Source evidence unavailable. Older records may not have source quotes or page references.</p>
      ) : null}
      {groups.map((group) => (
        <div key={group.title} className="mt-7 border-t border-slate-100 pt-6">
          <h3 className="mb-4 text-sm font-bold text-slate-800">{group.title}</h3>
          <div className="grid gap-5 lg:grid-cols-2">
            {group.fields.map((field) => {
              const view = views.find((item) => item.field === field)!;
              const status = presentation[view.status];
              return (
                <article key={field} aria-labelledby={`evidence-${field}`} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-5 [overflow-wrap:anywhere]">
                  <h4 id={`evidence-${field}`} className="font-bold text-slate-950">{titles[field]}</h4>
                  <span className={`mt-3 inline-flex max-w-full rounded-lg border px-2.5 py-1 text-xs font-bold ${status.style}`}>{status.label}</span>
                  <p className="mt-3 text-xs leading-5 text-slate-600">{status.description}</p>
                  <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Saved clause text</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{contract[field]?.trim() ? contract[field] : "No clause text saved."}</p>
                  {view.spans.length > 0 ? (
                    <details className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                      <summary className="cursor-pointer text-sm font-bold text-blue-800 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700">
                        Source quotes · {view.spans.map((span) => `Page ${span.page}`).join(", ")}
                      </summary>
                      <div className="mt-3 space-y-4">
                        {view.spans.map((span) => (
                          <figure key={`${span.page}-${span.start}-${span.end}`}>
                            <figcaption className="text-xs font-bold text-slate-600">Page {span.page} · uploaded PDF</figcaption>
                            <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-blue-200 pl-3 text-sm leading-7 text-slate-700">{span.quote}</blockquote>
                          </figure>
                        ))}
                        <p className="text-xs leading-5 text-slate-500">Page numbers refer to the uploaded PDF. Open your own copy to review context; the original PDF is not stored in RenewAI.</p>
                      </div>
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
