import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6">

        {/* NAVBAR */}
        <header className="flex items-center justify-between py-6">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight !text-white"
          >
            RenewAI
          </Link>

          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-xl px-4 py-2 text-sm font-semibold !text-slate-200 transition hover:bg-white/10 hover:!text-white"
            >
              Log In
            </Link>

            <Link
              href="/signup"
              className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold !text-slate-950 transition hover:bg-slate-200"
            >
              Get Started
            </Link>
          </nav>
        </header>

        {/* HERO */}
        <section className="grid min-h-[75vh] items-center gap-12 py-16 lg:grid-cols-2">
          <div>
            <div className="mb-6 inline-flex rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm !text-slate-200">
              AI-powered contract renewal intelligence
            </div>

            <h1 className="max-w-4xl text-5xl font-bold tracking-tight !text-white sm:text-6xl lg:text-7xl">
              Never miss a{" "}
              <span className="!text-slate-300">
                renewal deadline
              </span>{" "}
              again.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 !text-slate-300">
              RenewAI reads your contracts, extracts renewal terms,
              calculates cancellation windows, and alerts your team
              before expensive auto-renewals happen.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/signup"
                className="rounded-xl bg-white px-6 py-3 font-semibold !text-slate-950 transition hover:bg-slate-200"
              >
                Start Free
              </Link>

              <Link
                href="/login"
                className="rounded-xl border border-white/25 px-6 py-3 font-semibold !text-white transition hover:bg-white/10"
              >
                Log In
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-6 text-sm !text-slate-300">
              <span>✓ AI contract extraction</span>
              <span>✓ Renewal alerts</span>
              <span>✓ Automatic reminders</span>
            </div>
          </div>

          {/* PRODUCT PREVIEW */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl">
            <div className="rounded-2xl bg-white p-6 !text-slate-900">

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] !text-slate-500">
                    Contract Intelligence
                  </p>

                  <h2 className="mt-2 text-2xl font-bold !text-slate-950">
                    Acme Software Pvt Ltd
                  </h2>

                  <p className="mt-1 text-sm !text-slate-600">
                    Enterprise Software Subscription
                  </p>
                </div>

                <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold uppercase !text-yellow-800">
                  Attention
                </span>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <PreviewCard
                  label="Contract Value"
                  value="₹4,80,000"
                />

                <PreviewCard
                  label="Renewal Date"
                  value="1 Jan 2027"
                />

                <PreviewCard
                  label="Cancel By"
                  value="2 Nov 2026"
                />

                <PreviewCard
                  label="Notice Period"
                  value="60 days"
                />
              </div>

              <div className="mt-5 rounded-2xl border border-yellow-200 bg-yellow-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide !text-yellow-800">
                  RenewAI Recommendation
                </p>

                <p className="mt-2 font-semibold !text-yellow-950">
                  Begin renewal review
                </p>

                <p className="mt-2 text-sm leading-6 !text-yellow-800">
                  Evaluate usage, pricing and alternatives before the
                  cancellation window closes.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="border-t border-white/10 py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] !text-slate-400">
              How it works
            </p>

            <h2 className="mt-3 text-4xl font-bold tracking-tight !text-white">
              From PDF to renewal intelligence in minutes.
            </h2>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <StepCard
              number="01"
              title="Upload"
              description="Upload a SaaS or vendor contract as a PDF."
            />

            <StepCard
              number="02"
              title="Extract"
              description="AI identifies renewal terms, notice periods, dates and values."
            />

            <StepCard
              number="03"
              title="Monitor"
              description="RenewAI calculates cancellation deadlines and renewal risk."
            />

            <StepCard
              number="04"
              title="Alert"
              description="Automatic reminders help your team act before renewal windows close."
            />
          </div>
        </section>

        {/* FEATURES */}
        <section className="border-t border-white/10 py-24">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] !text-slate-400">
                Contract operations
              </p>

              <h2 className="mt-3 text-4xl font-bold tracking-tight !text-white">
                One place to understand what renews, when, and why it matters.
              </h2>

              <p className="mt-5 max-w-xl text-lg leading-8 !text-slate-300">
                Instead of manually reading agreements and tracking dates in
                spreadsheets, RenewAI turns contract language into an
                actionable renewal workspace.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FeatureCard
                title="Renewal intelligence"
                description="Extract term length, renewal dates, auto-renewal clauses and notice periods."
              />

              <FeatureCard
                title="Cancellation windows"
                description="Calculate the last day your team can act before a renewal becomes unavoidable."
              />

              <FeatureCard
                title="Risk visibility"
                description="See which contracts are safe, need attention, or require immediate action."
              />

              <FeatureCard
                title="Automated reminders"
                description="Generate 90, 60, 30, 14 and 7-day renewal alerts automatically."
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-white/10 py-24">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center sm:p-16">

            <h2 className="text-4xl font-bold tracking-tight !text-white">
              Stop discovering renewals after it&apos;s too late.
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-lg !text-slate-300">
              Upload your contracts and let RenewAI monitor the renewal
              deadlines your team cannot afford to miss.
            </p>

            <div className="mt-8 flex justify-center gap-4">
              <Link
                href="/signup"
                className="rounded-xl bg-white px-6 py-3 font-semibold !text-slate-950 transition hover:bg-slate-200"
              >
                Get Started
              </Link>

              <Link
                href="/login"
                className="rounded-xl border border-white/25 px-6 py-3 font-semibold !text-white transition hover:bg-white/10"
              >
                Log In
              </Link>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="flex flex-col justify-between gap-3 border-t border-white/10 py-8 text-sm !text-slate-400 sm:flex-row">
          <p>© 2026 RenewAI</p>
          <p>AI-powered contract renewal intelligence</p>
        </footer>

      </div>
    </main>
  );
}

function PreviewCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs !text-slate-500">
        {label}
      </p>

      <p className="mt-1 font-semibold !text-slate-950">
        {value}
      </p>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <p className="text-sm font-semibold !text-slate-400">
        {number}
      </p>

      <h3 className="mt-6 text-xl font-semibold !text-white">
        {title}
      </h3>

      <p className="mt-3 text-sm leading-6 !text-slate-300">
        {description}
      </p>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h3 className="font-semibold !text-white">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 !text-slate-300">
        {description}
      </p>
    </div>
  );
}