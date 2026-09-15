import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <Link href="/" className="text-sm font-semibold text-blue-700 hover:text-blue-800">
          ← Back to RenewAI
        </Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          Private beta · Effective 15 September 2026
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Privacy Notice</h1>
        <p className="mt-5 leading-7 text-slate-600">
          RenewAI uses the account, workspace, and contract information you submit
          to provide contract extraction, renewal tracking, reminders, and account
          security during the private beta.
        </p>

        <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700">
          <section>
            <h2 className="text-lg font-bold text-slate-950">Information we process</h2>
            <p className="mt-2">
              This may include your email address, workspace name, uploaded contract
              files and extracted contract data, renewal decisions, reminder records,
              and basic technical logs needed to keep the service reliable and secure.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-950">How we use it</h2>
            <p className="mt-2">
              We use this information only to operate and improve RenewAI, authenticate
              users, analyze contracts at your request, calculate renewal dates, and
              send requested renewal communications. We do not sell personal information.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-950">Service providers</h2>
            <p className="mt-2">
              RenewAI relies on hosting, authentication, database, AI-processing, and
              email-delivery providers. Information is shared with them only as needed
              to deliver the service and is subject to their security and privacy terms.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-950">Your choices</h2>
            <p className="mt-2">
              Do not upload information you are not authorized to process. Private-beta
              users can request access, correction, export, or deletion through their
              existing RenewAI invitation or support channel.
            </p>
          </section>
          <p className="rounded-2xl bg-slate-100 p-4 text-slate-600">
            This private-beta notice should be reviewed and replaced with final legal
            terms, company details, retention periods, and jurisdiction-specific rights
            before a public launch.
          </p>
        </div>
      </article>
    </main>
  );
}
