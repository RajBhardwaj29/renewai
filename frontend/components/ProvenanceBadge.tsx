const provenanceStyles = {
  extraction: { label: "AI extraction · review required", style: "border-blue-200 bg-blue-50 text-blue-800" },
  saved: { label: "Saved record", style: "border-slate-200 bg-slate-50 text-slate-700" },
  rules: { label: "Renewal rules", style: "border-slate-200 bg-slate-50 text-slate-700" },
  advisory: { label: "AI advisory", style: "border-blue-200 bg-blue-50 text-blue-800" },
  human: { label: "Recorded human decision", style: "border-slate-200 bg-slate-50 text-slate-700" },
} as const;

export type ProvenanceKind = keyof typeof provenanceStyles;

// Labels identify the information's source, not verified accuracy or completeness.
export default function ProvenanceBadge({ kind }: { kind: ProvenanceKind }) {
  const { label, style } = provenanceStyles[kind];
  return (
    <span className={`inline-flex w-fit max-w-full rounded-full border px-2.5 py-1 text-xs font-semibold leading-5 ${style}`}>
      {label}
    </span>
  );
}
