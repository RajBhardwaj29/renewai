"use client";

import AuthGuard from "@/components/AuthGuard";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useParams,
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

  start_date: string | null;
  end_date: string | null;
  renewal_date: string | null;

  initial_term_months: number | null;
  renewal_term_months: number | null;

  notice_period_days: number | null;
  auto_renewal: boolean | null;

  renewal_clause: string | null;
  termination_clause: string | null;
  payment_terms: string | null;

  effective_start_date: string | null;
  effective_end_date: string | null;
  effective_renewal_date: string | null;

  derived_end_date: string | null;
  derived_renewal_date: string | null;

  cancellation_deadline: string | null;

  days_until_cancellation_deadline:
    number | null;

  risk_level: string | null;

  recommendation: string | null;

  character_count: number | null;

  archived: boolean;

  created_at: string;
};


type Reminder = {
  id: string;
  organization_id: string;
  contract_id: string;

  reminder_type: string;
  remind_on: string;

  status: string;

  created_at: string;
  sent_at: string | null;
};


type ReminderResponse = {
  reminders: Reminder[];
  count: number;
};


export default function ContractDetailPage() {
  const params =
    useParams();

  const router =
    useRouter();

  const id =
    params.id as string;


  const [
    contract,
    setContract,
  ] =
    useState<Contract | null>(
      null
    );


  const [
    reminders,
    setReminders,
  ] =
    useState<Reminder[]>([]);


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    remindersLoading,
    setRemindersLoading,
  ] =
    useState(true);


  const [
    archiving,
    setArchiving,
  ] =
    useState(false);


  const [
    error,
    setError,
  ] =
    useState("");


  const [
    reminderError,
    setReminderError,
  ] =
    useState("");


  useEffect(() => {
    async function loadContract() {
      try {
        const response =
          await authFetch(
            `/contracts/${id}`
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


        if (!response.ok) {
          throw new Error(
            typeof data.detail === "string"
              ? data.detail
              : "Could not load contract."
          );
        }


        setContract(
          data.contract
        );


      } catch (err) {
        console.error(
          err
        );


        if (
          err instanceof Error &&
          err.message ===
          "AUTH_REQUIRED"
        ) {
          router.replace(
            "/login"
          );

          return;
        }


        setError(
          "Could not load this contract."
        );


      } finally {
        setLoading(
          false
        );
      }
    }


    async function loadReminders() {
      try {
        const response =
          await authFetch(
            `/contracts/${id}/reminders`
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


        if (!response.ok) {
          throw new Error(
            typeof data.detail === "string"
              ? data.detail
              : "Could not load reminders."
          );
        }


        const typedData =
          data as ReminderResponse;


        setReminders(
          typedData.reminders || []
        );


      } catch (err) {
        console.error(
          err
        );


        if (
          err instanceof Error &&
          err.message ===
          "AUTH_REQUIRED"
        ) {
          router.replace(
            "/login"
          );

          return;
        }


        setReminderError(
          "Could not load this contract's reminder timeline."
        );


      } finally {
        setRemindersLoading(
          false
        );
      }
    }


    if (id) {
      loadContract();
      loadReminders();
    }

  }, [
    id,
    router,
  ]);


  const pendingReminders =
    useMemo(() => {
      return reminders.filter(
        (reminder) =>
          reminder.status ===
          "pending"
      );
    }, [reminders]);


  const sentReminders =
    useMemo(() => {
      return reminders.filter(
        (reminder) =>
          reminder.status ===
          "sent"
      );
    }, [reminders]);


  const nextReminder =
    useMemo(() => {
      const pending =
        [...pendingReminders]
          .filter(
            (reminder) =>
              parseDate(
                reminder.remind_on
              ) !== null
          )
          .sort(
            (a, b) =>
              (
                parseDate(
                  a.remind_on
                )?.getTime() || 0
              )
              -
              (
                parseDate(
                  b.remind_on
                )?.getTime() || 0
              )
          );


      const today =
        startOfToday();


      return (
        pending.find(
          (reminder) => {
            const date =
              parseDate(
                reminder.remind_on
              );

            return (
              date !== null &&
              date.getTime() >=
              today.getTime()
            );
          }
        )
        ||
        pending[
          pending.length - 1
        ]
        ||
        null
      );

    }, [
      pendingReminders,
    ]);


  async function handleArchive() {
    if (!contract) {
      return;
    }


    const confirmed =
      window.confirm(
        `Archive ${
          contract.vendor_name ||
          "this contract"
        }?`
      );


    if (!confirmed) {
      return;
    }


    setArchiving(
      true
    );

    setError(
      ""
    );


    try {
      const response =
        await authFetch(
          `/contracts/${contract.id}/archive`,
          {
            method:
              "PATCH",
          }
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


      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Could not archive contract."
        );
      }


      router.push(
        "/contracts"
      );


      router.refresh();


    } catch (err) {
      console.error(
        err
      );


      if (
        err instanceof Error &&
        err.message ===
        "AUTH_REQUIRED"
      ) {
        router.replace(
          "/login"
        );

        return;
      }


      setError(
        "Could not archive contract."
      );


    } finally {
      setArchiving(
        false
      );
    }
  }


  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50">

        <div className="mx-auto max-w-7xl px-6 py-20 text-center">

          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />

          <p className="text-slate-500">
            Loading contract intelligence...
          </p>

        </div>

      </main>
    );
  }


  if (
    error ||
    !contract
  ) {
    return (
      <main className="min-h-screen bg-slate-50">

        <div className="mx-auto max-w-6xl px-6 py-20">

          <div className="rounded-3xl border border-red-200 bg-red-50 p-8">

            <h1 className="text-xl font-semibold text-red-800">
              Contract unavailable
            </h1>

            <p className="mt-2 text-red-700">
              {
                error ||
                "Contract could not be found."
              }
            </p>

            <Link
              href="/contracts"
              className="mt-6 inline-block font-medium underline"
            >
              Back to Contracts
            </Link>

          </div>

        </div>

      </main>
    );
  }


  const deadlineStatus =
    getDeadlineStatus(
      contract.days_until_cancellation_deadline
    );


  return (
    <AuthGuard>
    <main className="min-h-screen bg-slate-50 text-slate-900">

      <div className="mx-auto max-w-7xl px-6 py-10">


        {/* ========================================= */}
        {/* NAVIGATION */}
        {/* ========================================= */}

        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

          <Link
            href="/contracts"
            className="text-sm font-medium text-slate-500 transition hover:text-slate-900"
          >
            ← Back to Contracts
          </Link>


          <div className="flex flex-wrap gap-3">

            <Link
              href="/reminders"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium transition hover:bg-slate-100"
            >
              Renewal Alerts
            </Link>


            <button
              onClick={
                handleArchive
              }

              disabled={
                archiving
              }

              className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {
                archiving
                  ? "Archiving..."
                  : "Archive Contract"
              }
            </button>

          </div>

        </div>


        {/* ========================================= */}
        {/* HEADER */}
        {/* ========================================= */}

        <header className="mb-8 flex flex-col justify-between gap-6 lg:flex-row lg:items-start">

          <div>

            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Contract Intelligence
            </p>


            <h1 className="text-4xl font-bold tracking-tight">

              {
                contract.vendor_name ||
                "Unknown Vendor"
              }

            </h1>


            <p className="mt-3 text-lg text-slate-600">

              {
                contract.contract_title ||
                contract.filename
              }

            </p>


            <div className="mt-4 flex flex-wrap gap-2">

              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${riskClasses(
                  contract.risk_level
                )}`}
              >

                {
                  contract.risk_level ||
                  "unknown risk"
                }

              </span>


              {contract.auto_renewal === true && (

                <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  Auto-renewing
                </span>

              )}


              {contract.auto_renewal === false && (

                <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  Manual renewal
                </span>

              )}

            </div>

          </div>


          <Link
            href="/"
            className="inline-flex w-fit rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            + Analyze Another Contract
          </Link>

        </header>


        {/* ========================================= */}
        {/* EXECUTIVE CARDS */}
        {/* ========================================= */}

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

          <InfoCard
            label="Contract Value"

            value={
              formatCurrency(
                contract.contract_value,
                contract.currency
              )
            }

            description="Tracked value"
          />


          <InfoCard
            label="Renewal Date"

            value={
              formatDate(
                contract.effective_renewal_date
              )
            }

            description="Next renewal"
          />


          <InfoCard
            label="Cancel By"

            value={
              formatDate(
                contract.cancellation_deadline
              )
            }

            description="Notice deadline"

            urgent={
              deadlineStatus ===
              "urgent"
            }
          />


          <InfoCard
            label="Deadline"

            value={
              formatDeadline(
                contract.days_until_cancellation_deadline
              )
            }

            description={
              contract.days_until_cancellation_deadline !==
                null &&
              contract.days_until_cancellation_deadline <
                0
                ? "Window already passed"
                : "Time remaining"
            }

            urgent={
              deadlineStatus ===
              "urgent"
            }
          />


          <InfoCard
            label="Notice Period"

            value={
              contract.notice_period_days !==
              null

                ? `${contract.notice_period_days} days`

                : "Not found"
            }

            description="Required notice"
          />

        </section>


        {/* ========================================= */}
        {/* RECOMMENDATION */}
        {/* ========================================= */}

        <section
          className={`mb-8 rounded-3xl border p-7 shadow-sm ${riskPanelClasses(
            contract.risk_level
          )}`}
        >

          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">

            <div className="max-w-3xl">

              <p className="text-sm font-semibold uppercase tracking-[0.15em]">
                RenewAI Recommendation
              </p>


              <h2 className="mt-3 text-2xl font-bold">

                {
                  recommendationHeading(
                    contract.risk_level,
                    contract.days_until_cancellation_deadline
                  )
                }

              </h2>


              <p className="mt-4 leading-7">

                {
                  contract.recommendation ||
                  "Review the contract terms and renewal position before the cancellation deadline."
                }

              </p>

            </div>


            {contract.days_until_cancellation_deadline !==
              null && (

              <div className="min-w-48 rounded-2xl bg-white/70 p-5">

                <p className="text-sm font-medium opacity-70">
                  Cancellation window
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {
                    formatDeadline(
                      contract.days_until_cancellation_deadline
                    )
                  }
                </p>

              </div>

            )}

          </div>

        </section>


        {/* ========================================= */}
        {/* MAIN GRID */}
        {/* ========================================= */}

        <section className="mb-8 grid gap-6 lg:grid-cols-2">


          {/* CONTRACT TERMS */}

          <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">

            <div>

              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
                Agreement
              </p>

              <h2 className="mt-2 text-xl font-semibold">
                Contract Terms
              </h2>

            </div>


            <div className="mt-6 space-y-5">

              <DetailRow
                label="Effective Start"

                value={
                  formatDate(
                    contract.effective_start_date
                  )
                }
              />


              <DetailRow
                label="Effective End"

                value={
                  formatDate(
                    contract.effective_end_date
                  )
                }
              />


              <DetailRow
                label="Initial Term"

                value={
                  contract.initial_term_months !==
                  null

                    ? `${contract.initial_term_months} months`

                    : "Not found"
                }
              />


              <DetailRow
                label="Renewal Term"

                value={
                  contract.renewal_term_months !==
                  null

                    ? `${contract.renewal_term_months} months`

                    : "Not found"
                }
              />


              <DetailRow
                label="Auto Renewal"

                value={
                  contract.auto_renewal ===
                  null

                    ? "Unknown"

                    : contract.auto_renewal

                    ? "Yes"

                    : "No"
                }
              />


              <DetailRow
                label="Notice Period"

                value={
                  contract.notice_period_days !==
                  null

                    ? `${contract.notice_period_days} days`

                    : "Not found"
                }
              />


              <DetailRow
                label="Payment Terms"

                value={
                  contract.payment_terms ||
                  "Not found"
                }
              />

            </div>

          </div>


          {/* DATE INTELLIGENCE */}

          <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">

            <div>

              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
                Date Engine
              </p>

              <h2 className="mt-2 text-xl font-semibold">
                Renewal Calculation
              </h2>

            </div>


            <div className="mt-6 space-y-5">

              <DetailRow
                label="Extracted Start Date"

                value={
                  formatDate(
                    contract.start_date
                  )
                }
              />


              <DetailRow
                label="Extracted End Date"

                value={
                  formatDate(
                    contract.end_date
                  )
                }
              />


              <DetailRow
                label="Extracted Renewal Date"

                value={
                  formatDate(
                    contract.renewal_date
                  )
                }
              />


              <DetailRow
                label="Derived End Date"

                value={
                  formatDate(
                    contract.derived_end_date
                  )
                }
              />


              <DetailRow
                label="Derived Renewal Date"

                value={
                  formatDate(
                    contract.derived_renewal_date
                  )
                }
              />


              <DetailRow
                label="Effective Renewal Date"

                value={
                  formatDate(
                    contract.effective_renewal_date
                  )
                }
              />


              <DetailRow
                label="Cancellation Deadline"

                value={
                  formatDate(
                    contract.cancellation_deadline
                  )
                }
              />

            </div>

          </div>

        </section>


        {/* ========================================= */}
        {/* REMINDER TIMELINE */}
        {/* ========================================= */}

        <section className="mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">

          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-7 sm:flex-row sm:items-center">

            <div>

              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
                Automation
              </p>

              <h2 className="mt-2 text-xl font-semibold">
                Renewal Reminder Timeline
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                RenewAI automatically monitors
                these alert dates.
              </p>

            </div>


            <div className="flex flex-wrap gap-2">

              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {
                  pendingReminders.length
                } pending
              </span>

              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                {
                  sentReminders.length
                } sent
              </span>

            </div>

          </div>


          {remindersLoading && (

            <div className="p-10 text-center">

              <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />

              <p className="text-sm text-slate-500">
                Loading reminder timeline...
              </p>

            </div>

          )}


          {reminderError && (

            <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {reminderError}
            </div>

          )}


          {!remindersLoading &&
            !reminderError &&
            reminders.length === 0 && (

              <div className="p-10 text-center">

                <h3 className="font-semibold">
                  No reminders generated
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  This contract does not currently
                  have a reminder schedule.
                </p>

                <Link
                  href="/reminders"
                  className="mt-5 inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-100"
                >
                  Open Renewal Alerts
                </Link>

              </div>

            )}


          {!remindersLoading &&
            !reminderError &&
            reminders.length > 0 && (

              <div className="divide-y divide-slate-100">

                {
                  [...reminders]
                    .sort(
                      (a, b) =>
                        (
                          parseDate(
                            a.remind_on
                          )?.getTime() || 0
                        )
                        -
                        (
                          parseDate(
                            b.remind_on
                          )?.getTime() || 0
                        )
                    )
                    .map(
                      (reminder) => (

                        <ReminderTimelineRow
                          key={
                            reminder.id
                          }

                          reminder={
                            reminder
                          }

                          isNext={
                            nextReminder?.id ===
                            reminder.id
                          }
                        />

                      )
                    )
                }

              </div>

            )}

        </section>


        {/* ========================================= */}
        {/* CONTRACT EVIDENCE */}
        {/* ========================================= */}

        <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">

          <div>

            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
              Extracted Evidence
            </p>

            <h2 className="mt-2 text-xl font-semibold">
              Contract Clauses
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Source language extracted from
              the uploaded agreement.
            </p>

          </div>


          <div className="mt-6 grid gap-6 lg:grid-cols-2">


            <TextBlock
              title="Renewal Clause"

              value={
                contract.renewal_clause ||
                "No renewal clause extracted."
              }
            />


            <TextBlock
              title="Termination Clause"

              value={
                contract.termination_clause ||
                "No termination clause extracted."
              }
            />

          </div>

        </section>


        {/* ========================================= */}
        {/* METADATA */}
        {/* ========================================= */}

        <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">

          <div>

            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
              System
            </p>

            <h2 className="mt-2 text-xl font-semibold">
              Analysis Metadata
            </h2>

          </div>


          <div className="mt-6 grid gap-x-10 gap-y-5 md:grid-cols-2">


            <DetailRow
              label="Filename"

              value={
                contract.filename
              }
            />


            <DetailRow
              label="Extracted Characters"

              value={
                contract.character_count !==
                null

                  ? contract.character_count.toLocaleString(
                      "en-IN"
                    )

                  : "Unknown"
              }
            />


            <DetailRow
              label="Analyzed"

              value={
                formatDateTime(
                  contract.created_at
                )
              }
            />


            <DetailRow
              label="Contract ID"

              value={
                contract.id
              }
            />

          </div>

        </section>

      </div>

    </main>
    </AuthGuard>
  );
}


/* =============================================== */
/* COMPONENTS */
/* =============================================== */


function InfoCard({
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
          ? "rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm"
          : "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      }
    >

      <p
        className={
          urgent
            ? "text-sm font-medium text-red-700"
            : "text-sm text-slate-500"
        }
      >
        {label}
      </p>

      <p
        className={
          urgent
            ? "mt-2 text-lg font-bold text-red-900"
            : "mt-2 text-lg font-semibold"
        }
      >
        {value}
      </p>

      <p
        className={
          urgent
            ? "mt-1 text-xs text-red-600"
            : "mt-1 text-xs text-slate-400"
        }
      >
        {description}
      </p>

    </div>
  );
}


function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (
    <div className="flex items-start justify-between gap-6 border-b border-slate-100 pb-4 last:border-0 last:pb-0">

      <span className="text-sm text-slate-500">
        {label}
      </span>

      <span className="max-w-sm break-words text-right font-medium">
        {value}
      </span>

    </div>
  );
}


function TextBlock({
  title,
  value,
}: {
  title: string;
  value: string;
}) {

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6">

      <h3 className="font-semibold">
        {title}
      </h3>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">
        {value}
      </p>

    </div>
  );
}


function ReminderTimelineRow({
  reminder,
  isNext,
}: {
  reminder: Reminder;
  isNext: boolean;
}) {

  const reminderDate =
    parseDate(
      reminder.remind_on
    );


  const today =
    startOfToday();


  const isPast =
    reminderDate
      ? reminderDate.getTime() <
        today.getTime()
      : false;


  const isToday =
    reminderDate
      ? reminderDate.getTime() ===
        today.getTime()
      : false;


  const isSent =
    reminder.status ===
    "sent";


  return (
    <div className="flex flex-col justify-between gap-5 p-6 transition hover:bg-slate-50 sm:flex-row sm:items-center">

      <div className="flex items-start gap-4">

        <div
          className={
            isSent
              ? "mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700"
              : isPast || isToday
              ? "mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-700"
              : "mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600"
          }
        >
          {
            isSent
              ? "✓"
              : "•"
          }
        </div>


        <div>

          <div className="flex flex-wrap items-center gap-2">

            <h3 className="font-semibold">
              {
                formatReminderType(
                  reminder.reminder_type
                )
              }
            </h3>


            {isNext &&
              !isSent && (

                <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                  Next
                </span>

              )}


            {isSent && (

              <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                Email sent
              </span>

            )}


            {!isSent &&
              isPast && (

                <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                  Overdue
                </span>

              )}


            {!isSent &&
              isToday && (

                <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700">
                  Due today
                </span>

              )}

          </div>


          <p className="mt-1 text-sm text-slate-500">
            Scheduled for {
              formatDate(
                reminder.remind_on
              )
            }
          </p>

        </div>

      </div>


      <div className="sm:text-right">

        <p className="text-sm font-medium">
          {
            isSent
              ? "Delivered"
              : "Pending"
          }
        </p>


        <p className="mt-1 text-xs text-slate-500">

          {
            isSent &&
            reminder.sent_at

              ? formatDateTime(
                  reminder.sent_at
                )

              : getRelativeReminderDate(
                  reminder.remind_on
                )
          }

        </p>

      </div>

    </div>
  );
}


/* =============================================== */
/* HELPERS */
/* =============================================== */


function parseDate(
  value: string | null
) {
  if (!value) {
    return null;
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
    return null;
  }


  return date;
}


function startOfToday() {
  const today =
    new Date();


  today.setHours(
    0,
    0,
    0,
    0
  );


  return today;
}


function formatDate(
  value: string | null
) {
  if (!value) {
    return "Not found";
  }


  const date =
    parseDate(
      value
    );


  if (!date) {
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


function formatDateTime(
  value: string
) {
  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }


  return date.toLocaleString(
    "en-IN",
    {
      day:
        "numeric",

      month:
        "short",

      year:
        "numeric",

      hour:
        "numeric",

      minute:
        "2-digit",
    }
  );
}


function formatCurrency(
  value: number | null,
  currency: string | null
) {
  if (
    value === null
  ) {
    return "Not found";
  }


  try {
    return new Intl.NumberFormat(
      "en-IN",
      {
        style:
          "currency",

        currency:
          currency || "INR",

        maximumFractionDigits:
          0,
      }
    ).format(
      value
    );


  } catch {
    return (
      `${currency || ""} ` +
      value.toLocaleString(
        "en-IN"
      )
    );
  }
}


function formatDeadline(
  days: number | null
) {
  if (
    days === null
  ) {
    return "Unknown";
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
    } left`
  );
}


function getDeadlineStatus(
  days: number | null
) {
  if (
    days === null
  ) {
    return "unknown";
  }


  if (
    days <= 30
  ) {
    return "urgent";
  }


  return "normal";
}


function getRelativeReminderDate(
  value: string
) {
  const date =
    parseDate(
      value
    );


  if (!date) {
    return "";
  }


  const today =
    startOfToday();


  const difference =
    Math.round(
      (
        date.getTime() -
        today.getTime()
      )
      /
      (
        1000 *
        60 *
        60 *
        24
      )
    );


  if (
    difference === 0
  ) {
    return "Today";
  }


  if (
    difference < 0
  ) {
    const absolute =
      Math.abs(
        difference
      );


    return (
      `${absolute} day${
        absolute === 1
          ? ""
          : "s"
      } ago`
    );
  }


  return (
    `In ${difference} day${
      difference === 1
        ? ""
        : "s"
    }`
  );
}


function formatReminderType(
  value: string
) {
  const days =
    value.replace(
      "_day",
      ""
    );


  return `${days}-day renewal alert`;
}


function riskClasses(
  risk: string | null
) {
  switch (risk) {

    case "critical":
      return (
        "bg-red-100 " +
        "text-red-700 " +
        "border-red-200"
      );


    case "urgent":
      return (
        "bg-orange-100 " +
        "text-orange-700 " +
        "border-orange-200"
      );


    case "attention":
      return (
        "bg-yellow-100 " +
        "text-yellow-800 " +
        "border-yellow-200"
      );


    case "safe":
      return (
        "bg-green-100 " +
        "text-green-700 " +
        "border-green-200"
      );


    default:
      return (
        "bg-slate-100 " +
        "text-slate-600 " +
        "border-slate-200"
      );
  }
}


function riskPanelClasses(
  risk: string | null
) {
  switch (risk) {

    case "critical":
      return (
        "border-red-200 " +
        "bg-red-50 " +
        "text-red-900"
      );


    case "urgent":
      return (
        "border-orange-200 " +
        "bg-orange-50 " +
        "text-orange-900"
      );


    case "attention":
      return (
        "border-yellow-200 " +
        "bg-yellow-50 " +
        "text-yellow-900"
      );


    case "safe":
      return (
        "border-green-200 " +
        "bg-green-50 " +
        "text-green-900"
      );


    default:
      return (
        "border-slate-200 " +
        "bg-white " +
        "text-slate-900"
      );
  }
}


function recommendationHeading(
  risk: string | null,
  days: number | null
) {
  if (
    days !== null &&
    days < 0
  ) {
    return (
      "Cancellation deadline has passed"
    );
  }


  switch (risk) {

    case "critical":
      return (
        "Immediate renewal action required"
      );


    case "urgent":
      return (
        "Renewal decision required soon"
      );


    case "attention":
      return (
        "Begin renewal review"
      );


    case "safe":
      return (
        "Contract currently within a safe window"
      );


    default:
      return (
        "Review renewal position"
      );
  }
}