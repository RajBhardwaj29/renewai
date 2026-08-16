"use client";

import AuthGuard from "@/components/AuthGuard";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation"; 

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

  created_at: string;
};


type ContractsResponse = {
  contracts: Contract[];
  count: number;
};


export default function ContractsPage() {
  const router = useRouter();

  const [contracts, setContracts] =
    useState<Contract[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");


    useEffect(() => {
      async function loadContracts() {
        try {
          const response =
            await authFetch(
              "/contracts"
            );
    
          if (response.status === 401) {
            router.replace("/login");
            return;
          }
    
          if (response.status === 403) {
            router.replace("/onboarding");
            return;
          }
    
          const data =
            await response.json();
    
          if (!response.ok) {
            throw new Error(
              data.detail ||
              "Could not load contracts."
            );
          }
    
          const typedData =
            data as ContractsResponse;
    
          setContracts(
            typedData.contracts || []
          );
    
        } catch (err) {
          if (
            err instanceof Error &&
            err.message === "AUTH_REQUIRED"
          ) {
            router.replace("/login");
            return;
          }
    
          console.error(err);
    
          setError(
            "Could not load contracts."
          );
    
        } finally {
          setLoading(false);
        }
      }
    
      loadContracts();
    
    }, [router]);


  const filteredContracts =
    useMemo(() => {
      const query =
        search
          .toLowerCase()
          .trim();

      if (!query) {
        return contracts;
      }

      return contracts.filter(
        (contract) => {
          return (
            contract.vendor_name
              ?.toLowerCase()
              .includes(query)
            ||
            contract.contract_title
              ?.toLowerCase()
              .includes(query)
            ||
            contract.filename
              ?.toLowerCase()
              .includes(query)
          );
        }
      );

    }, [
      contracts,
      search,
    ]);


  const totalValue =
    useMemo(() => {
      return contracts.reduce(
        (total, contract) =>
          total +
          (
            contract.contract_value ||
            0
          ),
        0
      );
    }, [contracts]);


  const attentionCount =
    useMemo(() => {
      return contracts.filter(
        (contract) =>
          contract.risk_level === "attention"
          ||
          contract.risk_level === "urgent"
          ||
          contract.risk_level === "critical"
      ).length;
    }, [contracts]);


  const autoRenewCount =
    useMemo(() => {
      return contracts.filter(
        (contract) =>
          contract.auto_renewal === true
      ).length;
    }, [contracts]);


  const deadlineSoonCount =
    useMemo(() => {
      return contracts.filter(
        (contract) => {
          const days =
            contract.days_until_cancellation_deadline;

          return (
            days !== null &&
            days >= 0 &&
            days <= 30
          );
        }
      ).length;
    }, [contracts]);


  const overdueCount =
    useMemo(() => {
      return contracts.filter(
        (contract) => {
          const days =
            contract.days_until_cancellation_deadline;

          return (
            days !== null &&
            days < 0
          );
        }
      ).length;
    }, [contracts]);


  function formatCurrency(
    value: number | null,
    currency: string | null
  ) {
    if (value === null) {
      return "—";
    }

    try {
      return new Intl.NumberFormat(
        "en-IN",
        {
          style: "currency",
          currency:
            currency || "INR",
          maximumFractionDigits: 0,
        }
      ).format(value);

    } catch {
      return (
        `${currency || ""} ` +
        value.toLocaleString(
          "en-IN"
        )
      );
    }
  }


  function formatDate(
    value: string | null
  ) {
    if (!value) {
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
        day: "numeric",
        month: "short",
        year: "numeric",
      }
    );
  }


  function riskClasses(
    risk: string | null
  ) {
    switch (risk) {
      case "critical":
        return "bg-red-100 text-red-700";

      case "urgent":
        return "bg-orange-100 text-orange-700";

      case "attention":
        return "bg-yellow-100 text-yellow-800";

      case "safe":
        return "bg-green-100 text-green-700";

      default:
        return "bg-slate-100 text-slate-600";
    }
  }


  function deadlineClasses(
    days: number | null
  ) {
    if (days === null) {
      return "text-slate-500";
    }

    if (days < 0) {
      return "text-red-600";
    }

    if (days <= 30) {
      return "text-orange-600";
    }

    if (days <= 90) {
      return "text-yellow-700";
    }

    return "text-slate-900";
  }


  function deadlineLabel(
    days: number | null
  ) {
    if (days === null) {
      return "—";
    }

    if (days < 0) {
      const absolute =
        Math.abs(days);

      return (
        `${absolute} day${
          absolute === 1
            ? ""
            : "s"
        } overdue`
      );
    }

    if (days === 0) {
      return "Due today";
    }

    return (
      `${days} day${
        days === 1
          ? ""
          : "s"
      }`
    );
  }


  return (
    <AuthGuard>
    <main className="min-h-screen bg-slate-50 text-slate-900">

      <div className="mx-auto max-w-7xl px-6 py-10">

        {/* ============================================= */}
        {/* HEADER */}
        {/* ============================================= */}

        <header className="mb-8 flex flex-col justify-between gap-6 lg:flex-row lg:items-start">

          <div>

            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              RenewAI
            </p>

            <h1 className="text-4xl font-bold tracking-tight">
              Contract Workspace
            </h1>

            <p className="mt-3 max-w-2xl text-slate-600">
              Monitor your contract portfolio,
              renewal exposure and upcoming
              cancellation deadlines.
            </p>

          </div>


          <div className="flex flex-wrap gap-3">

  <Link
    href="/reminders"
    className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium transition hover:bg-slate-100"
  >
    Renewal Alerts

    {(
      deadlineSoonCount +
      overdueCount
    ) > 0 && (

      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
        {
          deadlineSoonCount +
          overdueCount
        }
      </span>

    )}

  </Link>


  <Link
    href="/settings"
    className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium transition hover:bg-slate-100"
  >
    Settings
  </Link>


  <Link
    href="/"
    className="inline-flex w-fit rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
  >
    + Analyze Contract
  </Link>

</div>

        </header>


        {/* ============================================= */}
        {/* PORTFOLIO STATS */}
        {/* ============================================= */}

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

          <StatCard
            label="Total Contracts"
            value={
              contracts.length.toString()
            }
            description="Active contracts"
          />


          <StatCard
            label="Portfolio Value"
            value={
              formatCurrency(
                totalValue,
                "INR"
              )
            }
            description="Tracked contract value"
          />


          <StatCard
            label="Need Attention"
            value={
              attentionCount.toString()
            }
            description="Risk flagged"
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
              deadlineSoonCount > 0 ||
              overdueCount > 0
            }
          />

        </section>


        {/* ============================================= */}
        {/* QUICK ACTIONS */}
        {/* ============================================= */}

        <section className="mb-8 grid gap-4 md:grid-cols-3">

          <QuickAction
            title="Analyze Contract"
            description="Upload a PDF and let RenewAI extract renewal terms and deadlines."
            href="/"
            action="Upload contract"
          />


          <QuickAction
            title="Renewal Alerts"
            description="Review upcoming cancellation deadlines and automated reminder activity."
            href="/reminders"
            action="View alerts"
          />


          <QuickAction
            title="Portfolio Review"
            description={
              attentionCount > 0
                ? `${attentionCount} contract${
                    attentionCount === 1
                      ? ""
                      : "s"
                  } currently need attention.`
                : "No contracts are currently flagged for attention."
            }
            href="#portfolio"
            action="Review portfolio"
          />

        </section>


        {/* ============================================= */}
        {/* CONTRACT PORTFOLIO */}
        {/* ============================================= */}

        <section
          id="portfolio"
          className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
        >

          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-6 md:flex-row md:items-center">

            <div>

              <h2 className="text-xl font-semibold">
                Contract Portfolio
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {
                  contracts.length
                } active contract{
                  contracts.length === 1
                    ? ""
                    : "s"
                }
              </p>

            </div>


            <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">

              <input
                type="text"
                placeholder="Search vendor, contract..."
                value={search}
                onChange={
                  (event) =>
                    setSearch(
                      event.target.value
                    )
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-slate-500 md:w-72"
              />

              {search && (

                <button
                  onClick={
                    () =>
                      setSearch("")
                  }
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:bg-slate-100"
                >
                  Clear
                </button>

              )}

            </div>

          </div>


          {/* LOADING */}

          {loading && (

            <div className="p-12 text-center">

              <div className="mx-auto mb-4 h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />

              <p className="text-sm text-slate-500">
                Loading contracts...
              </p>

            </div>

          )}


          {/* ERROR */}

          {error && (

            <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
              {error}
            </div>

          )}


          {/* EMPTY PORTFOLIO */}

          {!loading &&
            !error &&
            contracts.length === 0 && (

              <div className="p-14 text-center">

                <div className="mx-auto max-w-md">

                  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl">
                    📄
                  </div>

                  <h3 className="text-lg font-semibold">
                    No contracts yet
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Analyze your first contract
                    and RenewAI will automatically
                    extract its renewal terms,
                    cancellation deadline and
                    reminder schedule.
                  </p>

                  <Link
                    href="/"
                    className="mt-6 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Analyze First Contract
                  </Link>

                </div>

              </div>

            )}


          {/* SEARCH EMPTY */}

          {!loading &&
            !error &&
            contracts.length > 0 &&
            filteredContracts.length === 0 && (

              <div className="p-12 text-center">

                <h3 className="font-semibold">
                  No matching contracts
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  Try another vendor,
                  contract name or filename.
                </p>

                <button
                  onClick={
                    () =>
                      setSearch("")
                  }
                  className="mt-5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-100"
                >
                  Clear Search
                </button>

              </div>

            )}


          {/* TABLE */}

          {!loading &&
            !error &&
            filteredContracts.length > 0 && (

              <div className="overflow-x-auto">

                <table className="w-full text-left">

                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">

                    <tr>

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
                        Auto Renew
                      </th>

                      <th className="px-6 py-4">
                        Risk
                      </th>

                      <th className="px-6 py-4 text-right">
                        Action
                      </th>

                    </tr>

                  </thead>


                  <tbody>

                    {filteredContracts.map(
                      (contract) => (

                        <tr
                          key={
                            contract.id
                          }
                          className="border-t border-slate-100 transition hover:bg-slate-50"
                        >

                          {/* CONTRACT */}

                          <td className="px-6 py-5">

                            <Link
                              href={
                                `/contracts/${contract.id}`
                              }
                              className="block"
                            >

                              <div className="font-semibold hover:underline">
                                {
                                  contract.vendor_name ||
                                  "Unknown Vendor"
                                }
                              </div>

                              <div className="mt-1 max-w-xs truncate text-sm text-slate-500">
                                {
                                  contract.contract_title ||
                                  contract.filename
                                }
                              </div>

                            </Link>

                          </td>


                          {/* VALUE */}

                          <td className="px-6 py-5 font-medium">
                            {
                              formatCurrency(
                                contract.contract_value,
                                contract.currency
                              )
                            }
                          </td>


                          {/* RENEWAL */}

                          <td className="px-6 py-5 text-sm">
                            {
                              formatDate(
                                contract.effective_renewal_date
                              )
                            }
                          </td>


                          {/* CANCELLATION */}

                          <td className="px-6 py-5 text-sm">
                            {
                              formatDate(
                                contract.cancellation_deadline
                              )
                            }
                          </td>


                          {/* DEADLINE */}

                          <td className="px-6 py-5">

                            <span
                              className={`text-sm font-semibold ${deadlineClasses(
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


                          {/* AUTO RENEW */}

                          <td className="px-6 py-5">

                            {contract.auto_renewal === true ? (

                              <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                                Yes
                              </span>

                            ) : contract.auto_renewal === false ? (

                              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                No
                              </span>

                            ) : (

                              <span className="text-slate-400">
                                —
                              </span>

                            )}

                          </td>


                          {/* RISK */}

                          <td className="px-6 py-5">

                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${riskClasses(
                                contract.risk_level
                              )}`}
                            >
                              {
                                contract.risk_level ||
                                "unknown"
                              }
                            </span>

                          </td>


                          {/* ACTION */}

                          <td className="px-6 py-5 text-right">

                            <Link
                              href={
                                `/contracts/${contract.id}`
                              }
                              className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold transition hover:bg-slate-100"
                            >
                              View
                            </Link>

                          </td>

                        </tr>

                      )
                    )}

                  </tbody>

                </table>

              </div>

            )}

        </section>


        {/* ============================================= */}
        {/* FOOTER STATUS */}
        {/* ============================================= */}

        {!loading &&
          contracts.length > 0 && (

            <div className="mt-6 flex flex-col justify-between gap-2 text-xs text-slate-500 sm:flex-row">

              <p>
                Showing {
                  filteredContracts.length
                } of {
                  contracts.length
                } contracts
              </p>

              <p>
                RenewAI monitors cancellation
                deadlines automatically.
              </p>

            </div>

          )}

      </div>

    </main>
    </AuthGuard>
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
            ? "text-sm font-medium text-orange-700"
            : "text-sm text-slate-500"
        }
      >
        {label}
      </p>

      <p
        className={
          urgent
            ? "mt-2 text-2xl font-bold text-orange-900"
            : "mt-2 text-2xl font-bold"
        }
      >
        {value}
      </p>

      <p
        className={
          urgent
            ? "mt-1 text-xs text-orange-700"
            : "mt-1 text-xs text-slate-400"
        }
      >
        {description}
      </p>

    </div>
  );
}


function QuickAction({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >

      <h3 className="font-semibold">
        {title}
      </h3>

      <p className="mt-2 min-h-10 text-sm leading-5 text-slate-500">
        {description}
      </p>

      <p className="mt-4 text-sm font-semibold text-slate-900">
        {action}
        <span className="ml-1 inline-block transition-transform group-hover:translate-x-1">
          →
        </span>
      </p>

    </Link>
  );
}