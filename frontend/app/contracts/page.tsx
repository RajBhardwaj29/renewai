"use client";

import AuthGuard from "@/components/AuthGuard";
import AppNavbar from "@/components/AppNavbar";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import Link from "next/link";

import {
  authFetch,
} from "@/lib/authFetch";


type Contract = {
  id: string;
  filename: string;

  vendor_name: string | null;
  contract_title: string | null;

  contract_value: number | null;
  currency: string | null;

  effective_renewal_date: string | null;
  cancellation_deadline: string | null;

  days_until_cancellation_deadline:
    number | null;

  auto_renewal: boolean | null;

  risk_level: string | null;

  ai_action: string | null;
  ai_confidence: number | null;

  renewal_decision: string | null;
  renewal_status: string | null;

  decision_owner: string | null;
  decision_updated_at: string | null;

  created_at: string;
};


type ContractsResponse = {
  contracts: Contract[];
  count: number;
};


export default function ContractsPage() {

  const router =
    useRouter();


  const [
    contracts,
    setContracts,
  ] =
    useState<Contract[]>([]);


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    error,
    setError,
  ] =
    useState("");


  const [
    search,
    setSearch,
  ] =
    useState("");


  useEffect(() => {

    async function loadContracts() {

      try {

        const response =
          await authFetch(
            "/contracts"
          );


        if (
          response.status === 401
        ) {

          router.replace(
            "/login"
          );

          return;
        }


        if (
          response.status === 403
        ) {

          router.replace(
            "/onboarding"
          );

          return;
        }


        const data =
          await response.json();


        if (
          !response.ok
        ) {

          throw new Error(
            typeof data.detail ===
            "string"
              ? data.detail
              : "Could not load contracts."
          );
        }


        const typedData =
          data as ContractsResponse;


        setContracts(
          typedData.contracts || []
        );


      } catch (
        err
      ) {

        if (
          err instanceof Error
          &&
          err.message ===
          "AUTH_REQUIRED"
        ) {

          router.replace(
            "/login"
          );

          return;
        }


        console.error(
          err
        );


        setError(
          "Could not load contracts."
        );


      } finally {

        setLoading(
          false
        );
      }
    }


    loadContracts();

  }, [
    router,
  ]);


  const filteredContracts =
    useMemo(
      () => {

        const query =
          search
            .toLowerCase()
            .trim();


        if (
          !query
        ) {

          return contracts;
        }


        return contracts.filter(
          (
            contract
          ) => {

            return (
              contract.vendor_name
                ?.toLowerCase()
                .includes(
                  query
                )
              ||
              contract.contract_title
                ?.toLowerCase()
                .includes(
                  query
                )
              ||
              contract.filename
                ?.toLowerCase()
                .includes(
                  query
                )
            );
          }
        );

      },
      [
        contracts,
        search,
      ]
    );


  const totalValue =
    useMemo(
      () => {

        return contracts.reduce(
          (
            total,
            contract
          ) =>
            total +
            (
              contract.contract_value
              ||
              0
            ),

          0
        );

      },
      [
        contracts,
      ]
    );


  const attentionCount =
    useMemo(
      () => {

        return contracts.filter(
          (
            contract
          ) =>
            contract.risk_level ===
              "attention"
            ||
            contract.risk_level ===
              "urgent"
            ||
            contract.risk_level ===
              "critical"
        ).length;

      },
      [
        contracts,
      ]
    );


  const autoRenewCount =
    useMemo(
      () => {

        return contracts.filter(
          (
            contract
          ) =>
            contract.auto_renewal ===
            true
        ).length;

      },
      [
        contracts,
      ]
    );


  const deadlineSoonCount =
    useMemo(
      () => {

        return contracts.filter(
          (
            contract
          ) => {

            const days =
              contract
                .days_until_cancellation_deadline;


            return (
              days !== null
              &&
              days >= 0
              &&
              days <= 30
            );
          }
        ).length;

      },
      [
        contracts,
      ]
    );


  const overdueCount =
    useMemo(
      () => {

        return contracts.filter(
          (
            contract
          ) => {

            const days =
              contract
                .days_until_cancellation_deadline;


            return (
              days !== null
              &&
              days < 0
            );
          }
        ).length;

      },
      [
        contracts,
      ]
    );


  return (

    <AuthGuard>

      <main className="min-h-screen bg-slate-50 text-slate-950">

        <AppNavbar />


        <div className="mx-auto max-w-7xl px-6 py-10 lg:py-12">


          {/* PAGE HEADER */}

          <header className="mb-8 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">

            <div>

              <p className="renewai-eyebrow">
                Contract portfolio
              </p>


              <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                Contracts
              </h1>


              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                Monitor every agreement, renewal date,
                cancellation window and contract risk
                across your workspace.
              </p>

            </div>


            <div className="flex flex-wrap gap-3">

              <Link
                href="/reminders"
                className="renewai-button-secondary"
              >
                Renewal Alerts

                {
                  (
                    deadlineSoonCount
                    +
                    overdueCount
                  ) > 0
                  &&
                  (

                    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                      {
                        deadlineSoonCount
                        +
                        overdueCount
                      }
                    </span>

                  )
                }

              </Link>


              <Link
                href="/analyze"
                className="renewai-button-primary"
              >
                + Analyze Contract
              </Link>

            </div>

          </header>


          {/* PORTFOLIO SUMMARY */}

          <section className="mb-6 overflow-hidden rounded-[1.75rem] bg-slate-950 text-white shadow-sm">

            <div className="grid gap-8 p-7 lg:grid-cols-[1.4fr_1fr] lg:items-center lg:p-8">

              <div>

                <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5">

                  <span className="h-2 w-2 rounded-full bg-emerald-400" />

                  <span className="text-xs font-semibold text-slate-300">
                    Portfolio intelligence
                  </span>

                </div>


                <h2 className="mt-5 max-w-xl text-2xl font-bold tracking-tight !text-white sm:text-3xl">

                  {
                    contracts.length === 0
                      ? "Your contract portfolio is ready to grow."
                      : attentionCount > 0
                      ? `${attentionCount} contract${
                          attentionCount === 1
                            ? ""
                            : "s"
                        } currently need attention.`
                      : "Your active contract portfolio is under control."
                  }

                </h2>


                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">

                  {
                    contracts.length === 0
                      ? "Analyze your first agreement to begin tracking renewal exposure."
                      : `${contracts.length} active contract${
                          contracts.length === 1
                            ? ""
                            : "s"
                        } monitored with ${autoRenewCount} automatic renewal${
                          autoRenewCount === 1
                            ? ""
                            : "s"
                        }.`
                  }

                </p>

              </div>


              <div className="grid grid-cols-2 gap-3">

                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">

                  <p className="text-xs font-medium text-slate-400">
                    Portfolio value
                  </p>

                  <p className="mt-2 text-2xl font-bold tracking-tight text-white">
                    {
                      formatCurrency(
                        totalValue,
                        "INR"
                      )
                    }
                  </p>

                </div>


                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">

                  <p className="text-xs font-medium text-slate-400">
                    Auto renewing
                  </p>

                  <p className="mt-2 text-2xl font-bold tracking-tight text-white">
                    {autoRenewCount}
                  </p>

                </div>

              </div>

            </div>

          </section>


          {/* STATS */}

          <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

            <StatCard
              label="Contracts"
              value={
                contracts.length.toString()
              }
              description="Active portfolio"
            />


            <StatCard
              label="Portfolio Value"
              value={
                formatCurrency(
                  totalValue,
                  "INR"
                )
              }
              description="Tracked value"
            />


            <StatCard
              label="Need Attention"
              value={
                attentionCount.toString()
              }
              description="Risk flagged"
              urgent={
                attentionCount > 0
              }
            />


            <StatCard
              label="Auto Renewing"
              value={
                autoRenewCount.toString()
              }
              description="Automatic renewals"
            />


            <StatCard
              label="Deadline ≤ 30d"
              value={
                deadlineSoonCount.toString()
              }
              description={
                overdueCount > 0
                  ? `${overdueCount} already overdue`
                  : "Cancellation windows"
              }
              urgent={
                deadlineSoonCount > 0
                ||
                overdueCount > 0
              }
            />

          </section>


          {/* PORTFOLIO TABLE */}

          <section
            id="portfolio"
            className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm"
          >

            <div className="flex flex-col justify-between gap-5 border-b border-slate-200 px-6 py-6 md:flex-row md:items-center">

              <div>

                <p className="renewai-eyebrow">
                  Workspace contracts
                </p>


                <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">
                  Contract Portfolio
                </h2>


                <p className="mt-1.5 text-sm text-slate-500">
                  {
                    contracts.length
                  } active contract{
                    contracts.length === 1
                      ? ""
                      : "s"
                  } currently being monitored
                </p>

              </div>


              <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">

                <div className="relative">

                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  >
                    <circle
                      cx="11"
                      cy="11"
                      r="8"
                    />

                    <path d="m21 21-4.3-4.3" />
                  </svg>


                  <input
                    type="text"
                    placeholder="Search contracts..."
                    value={
                      search
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setSearch(
                          event.target.value
                        )
                    }
                    className="renewai-input pl-11 md:w-80"
                  />

                </div>


                {
                  search
                  &&
                  (

                    <button
                      type="button"
                      onClick={
                        () =>
                          setSearch(
                            ""
                          )
                      }
                      className="renewai-button-secondary"
                    >
                      Clear
                    </button>

                  )
                }

              </div>

            </div>


            {loading && (

              <div className="p-16 text-center">

                <div className="mx-auto mb-4 h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-slate-950" />

                <p className="text-sm font-medium text-slate-600">
                  Loading contract portfolio...
                </p>

              </div>

            )}


            {error && (

              <div className="m-6 rounded-2xl border border-red-200 bg-red-50 p-5">

                <p className="font-semibold text-red-800">
                  Portfolio unavailable
                </p>

                <p className="mt-1 text-sm text-red-700">
                  {error}
                </p>

              </div>

            )}


            {
              !loading
              &&
              !error
              &&
              contracts.length === 0
              &&
              (

                <div className="px-6 py-16 text-center">

                  <div className="mx-auto max-w-md">

                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-xl font-bold text-white">
                      +
                    </div>


                    <h3 className="mt-5 text-xl font-bold text-slate-950">
                      Build your contract portfolio
                    </h3>


                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Analyze your first PDF and RenewAI will extract
                      its terms, calculate renewal dates, identify
                      cancellation deadlines and create reminders.
                    </p>


                    <Link
                      href="/analyze"
                      className="renewai-button-primary mt-6"
                    >
                      + Analyze First Contract
                    </Link>

                  </div>

                </div>

              )
            }


            {
              !loading
              &&
              !error
              &&
              contracts.length > 0
              &&
              filteredContracts.length === 0
              &&
              (

                <div className="px-6 py-14 text-center">

                  <div className="mx-auto max-w-sm">

                    <h3 className="text-lg font-bold text-slate-950">
                      No matching contracts
                    </h3>


                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      We couldn&apos;t find a vendor, contract title
                      or filename matching &quot;{search}&quot;.
                    </p>


                    <button
                      type="button"
                      onClick={
                        () =>
                          setSearch(
                            ""
                          )
                      }
                      className="renewai-button-secondary mt-5"
                    >
                      Clear Search
                    </button>

                  </div>

                </div>

              )
            }


            {
              !loading
              &&
              !error
              &&
              filteredContracts.length > 0
              &&
              (

                <div className="overflow-x-auto">

<table className="w-full min-w-[1480px] text-left">
                    <thead>

                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">

                        <th className="px-6 py-4">
                          Contract
                        </th>

                        <th className="px-6 py-4">
                          Value
                        </th>

                        <th className="px-6 py-4">
                          Renewal
                        </th>

                        <th className="px-6 py-4">
                          Cancel By
                        </th>

                        <th className="px-6 py-4">
                          Deadline
                        </th>

                        <th className="px-6 py-4">
                          Renewal Type
                        </th>

                        <th className="px-6 py-4">
  Risk
</th>

<th className="px-6 py-4">
  AI Recommendation
</th>

<th className="px-6 py-4">
  Human Decision
</th>

<th className="px-6 py-4">
  Status
</th>

<th className="px-6 py-4 text-right">
  Action
</th>

                      </tr>

                    </thead>


                    <tbody className="divide-y divide-slate-100">

                      {
                        filteredContracts.map(
                          (
                            contract
                          ) => (

                            <tr
                              key={
                                contract.id
                              }
                              className="group transition-colors hover:bg-slate-50/80"
                            >

                              <td className="px-6 py-5">

                                <Link
                                  href={
                                    `/contracts/${contract.id}`
                                  }
                                  className="block"
                                >

                                  <div className="flex items-center gap-3">

                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-white">
                                      {
                                        (
                                          contract.vendor_name
                                          ||
                                          contract.contract_title
                                          ||
                                          "C"
                                        )
                                          .charAt(0)
                                          .toUpperCase()
                                      }
                                    </div>


                                    <div className="min-w-0">

                                      <div className="font-bold text-slate-950 transition group-hover:text-blue-600">
                                        {
                                          contract.vendor_name
                                          ||
                                          "Unknown Vendor"
                                        }
                                      </div>


                                      <div className="mt-1 max-w-[240px] truncate text-sm text-slate-500">
                                        {
                                          contract.contract_title
                                          ||
                                          contract.filename
                                        }
                                      </div>

                                    </div>

                                  </div>

                                </Link>

                              </td>


                              <td className="px-6 py-5">

                                <div className="font-bold text-slate-900">
                                  {
                                    formatCurrency(
                                      contract.contract_value,
                                      contract.currency
                                    )
                                  }
                                </div>

                              </td>


                              <td className="px-6 py-5">

                                <div className="text-sm font-semibold text-slate-800">
                                  {
                                    formatDate(
                                      contract.effective_renewal_date
                                    )
                                  }
                                </div>

                              </td>


                              <td className="px-6 py-5">

                                <div className="text-sm font-semibold text-slate-800">
                                  {
                                    formatDate(
                                      contract.cancellation_deadline
                                    )
                                  }
                                </div>

                              </td>


                              <td className="px-6 py-5">

                                <span
                                  className={`text-sm font-bold ${deadlineClasses(
                                    contract.days_until_cancellation_deadline
                                  )}`}
                                >
                                  {
                                    deadlineLabel(
                                      contract.days_until_cancellation_deadline
                                    )
                                  }
                                </span>

                              </td>


                              <td className="px-6 py-5">

                                {
                                  contract.auto_renewal === true
                                    ? (

                                      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">

                                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />

                                        Auto renew

                                      </span>

                                    )
                                    : contract.auto_renewal === false
                                    ? (

                                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                        Manual
                                      </span>

                                    )
                                    : (

                                      <span className="text-slate-400">
                                        —
                                      </span>

                                    )
                                }

                              </td>


                              <td className="px-6 py-5">

                                <span
                                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${riskClasses(
                                    contract.risk_level
                                  )}`}
                                >
                                  {
                                    contract.risk_level
                                    ||
                                    "unknown"
                                  }
                                </span>

                              </td>

                              <td className="px-6 py-5">
  <AIActionBadge
    action={contract.ai_action}
    confidence={contract.ai_confidence}
  />
</td>

<td className="px-6 py-5">
  <HumanDecisionBadge
    decision={contract.renewal_decision}
  />
</td>

<td className="px-6 py-5">
  <WorkflowStatusBadge
    status={contract.renewal_status}
  />

  {contract.decision_owner && (
    <p className="mt-2 text-xs text-slate-500">
      Owner: {contract.decision_owner}
    </p>
  )}
</td>


                              <td className="px-6 py-5 text-right">

                                <Link
                                  href={
                                    `/contracts/${contract.id}`
                                  }
                                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 transition hover:border-slate-950 hover:bg-slate-950 hover:text-white"
                                >
                                  Open

                                  <span aria-hidden="true">
                                    →
                                  </span>

                                </Link>

                              </td>

                            </tr>

                          )
                        )
                      }

                    </tbody>

                  </table>

                </div>

              )
            }

          </section>


          {
            !loading
            &&
            contracts.length > 0
            &&
            (

              <div className="mt-5 flex flex-col justify-between gap-2 px-1 text-xs font-medium text-slate-500 sm:flex-row">

                <p>
                  Showing {
                    filteredContracts.length
                  } of {
                    contracts.length
                  } contracts
                </p>


                <p>
                  RenewAI monitors cancellation deadlines automatically.
                </p>

              </div>

            )
          }

        </div>

      </main>

    </AuthGuard>
  );
}

function AIActionBadge({
  action,
  confidence,
}: {
  action: string | null;
  confidence: number | null;
}) {

  const label =
    formatAIAction(
      action
    );


  const confidenceLabel =
    confidence !== null
      ? `${Math.round(
          Math.max(
            0,
            Math.min(
              1,
              confidence
            )
          ) * 100
        )}%`
      : null;


  return (

    <div>

      <span
        className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${aiActionClasses(
          action
        )}`}
      >
        {label}
      </span>


      {
        confidenceLabel
        &&
        (

          <p className="mt-2 text-xs text-slate-500">
            {confidenceLabel} confidence
          </p>

        )
      }

    </div>
  );
}


function HumanDecisionBadge({
  decision,
}: {
  decision: string | null;
}) {

  return (

    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${decisionClasses(
        decision
      )}`}
    >
      {
        formatDecision(
          decision
        )
      }
    </span>
  );
}


function WorkflowStatusBadge({
  status,
}: {
  status: string | null;
}) {

  return (

    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusClasses(
        status
      )}`}
    >
      {
        formatStatus(
          status
        )
      }
    </span>
  );
}

function StatCard({
  label,
  value,
  description,
  urgent = false,
}: {
  label: string;
  value: string;
  description: string;
  urgent?: boolean;
}) {

  return (

    <div
      className={
        urgent
          ? "rounded-2xl border border-orange-200 bg-orange-50 p-5 shadow-sm"
          : "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      }
    >

      <p
        className={
          urgent
            ? "text-sm font-semibold text-orange-700"
            : "text-sm font-semibold text-slate-600"
        }
      >
        {label}
      </p>


      <p
        className={
          urgent
            ? "mt-2 text-2xl font-bold tracking-tight text-orange-950"
            : "mt-2 text-2xl font-bold tracking-tight text-slate-950"
        }
      >
        {value}
      </p>


      <p
        className={
          urgent
            ? "mt-1 text-xs font-medium text-orange-700"
            : "mt-1 text-xs font-medium text-slate-500"
        }
      >
        {description}
      </p>

    </div>
  );
}


function formatCurrency(
  value: number | null,
  currency: string | null
) {

  if (
    value === null
  ) {

    return "—";
  }


  try {

    return new Intl.NumberFormat(
      "en-IN",
      {
        style:
          "currency",

        currency:
          currency
          ||
          "INR",

        maximumFractionDigits:
          0,
      }
    ).format(
      value
    );


  } catch {

    return (
      `${currency || ""} `
      +
      value.toLocaleString(
        "en-IN"
      )
    );
  }
}


function formatDate(
  value: string | null
) {

  if (
    !value
  ) {

    return "—";
  }


  const date =
    new Date(
      `${value}T00:00:00`
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return value;
  }


  return date.toLocaleDateString(
    "en-IN",
    {
      day:
        "numeric",

      month:
        "short",

      year:
        "numeric",
    }
  );
}


function riskClasses(
  risk: string | null
) {

  switch (
    risk
  ) {

    case "critical":
      return "border border-red-200 bg-red-50 text-red-700";


    case "urgent":
      return "border border-orange-200 bg-orange-50 text-orange-700";


    case "attention":
      return "border border-amber-200 bg-amber-50 text-amber-700";


    case "safe":
      return "border border-emerald-200 bg-emerald-50 text-emerald-700";


    default:
      return "border border-slate-200 bg-slate-100 text-slate-600";
  }
}


function deadlineClasses(
  days: number | null
) {

  if (
    days === null
  ) {

    return "text-slate-500";
  }


  if (
    days < 0
  ) {

    return "text-red-600";
  }


  if (
    days <= 30
  ) {

    return "text-orange-600";
  }


  if (
    days <= 90
  ) {

    return "text-amber-700";
  }


  return "text-slate-700";
}


function deadlineLabel(
  days: number | null
) {

  if (
    days === null
  ) {

    return "—";
  }


  if (
    days < 0
  ) {

    const absolute =
      Math.abs(
        days
      );


    return (
      `${absolute} day${
        absolute === 1
          ? ""
          : "s"
      } overdue`
    );
  }


  if (
    days === 0
  ) {

    return "Due today";
  }


  return (
    `${days} day${
      days === 1
        ? ""
        : "s"
    } remaining`
  );
}

function formatAIAction(
  action: string | null
) {

  switch (action) {

    case "monitor":
      return "Monitor";

    case "review":
      return "Review";

    case "renegotiate":
      return "Renegotiate";

    case "consider_cancellation":
      return "Consider cancellation";

    default:
      return "Not analyzed";
  }
}


function aiActionClasses(
  action: string | null
) {

  switch (action) {

    case "monitor":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";

    case "review":
      return "border-blue-200 bg-blue-50 text-blue-700";

    case "renegotiate":
      return "border-amber-200 bg-amber-50 text-amber-800";

    case "consider_cancellation":
      return "border-red-200 bg-red-50 text-red-700";

    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}


function formatDecision(
  decision: string | null
) {

  switch (decision) {

    case "renew":
      return "Renew";

    case "renegotiate":
      return "Renegotiate";

    case "cancel":
      return "Cancel";

    case "undecided":
    default:
      return "Undecided";
  }
}


function decisionClasses(
  decision: string | null
) {

  switch (decision) {

    case "renew":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";

    case "renegotiate":
      return "border-amber-200 bg-amber-50 text-amber-800";

    case "cancel":
      return "border-red-200 bg-red-50 text-red-700";

    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}


function formatStatus(
  status: string | null
) {

  switch (status) {

    case "decision_made":
      return "Decision made";

    case "completed":
      return "Completed";

    case "under_review":
    default:
      return "Under review";
  }
}


function statusClasses(
  status: string | null
) {

  switch (status) {

    case "decision_made":
      return "border-blue-200 bg-blue-50 text-blue-700";

    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";

    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}