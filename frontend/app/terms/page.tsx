import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <Link href="/" className="text-sm font-semibold text-blue-700 hover:text-blue-800">
          ← Back to RenewAI
        </Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          Private beta · Effective 15 September 2026
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Terms of Use</h1>
        <p className="mt-5 leading-7 text-slate-600">
          These terms describe the limited private-beta use of RenewAI. By using the
          beta, you agree to use it only for lawful contract-renewal workflows that you
          are authorized to manage.
        </p>

        <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700">
          <section>
            <h2 className="text-lg font-bold text-slate-950">Beta service</h2>
            <p className="mt-2">
              RenewAI is provided for evaluation and may change, experience interruptions,
              or contain errors. Access may be limited or withdrawn while the beta is refined.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-950">Your responsibilities</h2>
            <p className="mt-2">
              You are responsible for your account security, the legality and accuracy of
              uploaded content, and independently reviewing extracted dates, clauses,
              recommendations, and reminders before acting on them.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-950">No legal advice</h2>
            <p className="mt-2">
              RenewAI provides operational assistance and AI-generated analysis, not legal,
              financial, or procurement advice. Contract terms and deadlines must be verified
              against the source agreement and, where appropriate, qualified advisors.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-950">Acceptable use</h2>
            <p className="mt-2">
              You may not misuse the service, interfere with its security, attempt unauthorized
              access, or upload malicious, unlawful, or third-party content without permission.
            </p>
          </section>
          <p className="rounded-2xl bg-slate-100 p-4 text-slate-600">
            These private-beta terms require legal review and company-specific provisions
            before a public or paid launch, including governing law, warranties, liability,
            billing, termination, and formal contact details.
          </p>
        </div>
      </article>
    </main>
  );
}
