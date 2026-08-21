"use client";

import AuthGuard from "@/components/AuthGuard";
import AppNavbar from "@/components/AppNavbar";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { authFetch } from "@/lib/authFetch";


type ReminderContract = {
  id: string;
  vendor_name: string | null;
  contract_title: string | null;
  cancellation_deadline: string | null;
  effective_renewal_date: string | null;
  risk_level: string | null;
  archived: boolean;
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

  contracts?: ReminderContract | null;
};


type ReminderResponse = {
  reminders: Reminder[];
  count: number;
};


type BackfillResponse = {
  message: string;
  contracts_processed: number;
  reminders_created: number;
  contracts_without_deadline?: number;
};


type SendDueResponse = {
  message: string;
  due_found: number;
  sent_count: number;
  failed_count: number;

  sent: Array<{
    reminder_id: string;
    vendor_name: string;
    reminder_type: string;
    recipient: string;
    status: string;
  }>;

  failed: Array<{
    reminder_id: string;
    vendor_name: string;
    reminder_type: string;
    error: string;
  }>;
};


export default function RemindersPage() {
  const router = useRouter();

  const [reminders, setReminders] =
    useState<Reminder[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [backfilling, setBackfilling] =
    useState(false);

  const [sendingEmails, setSendingEmails] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");


  const loadReminders =
    useCallback(async () => {
      setError("");

      try {
        const response =
          await authFetch(
            "/reminders"
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
        console.error(err);

        if (
          err instanceof Error &&
          err.message === "AUTH_REQUIRED"
        ) {
          router.replace("/login");
          return;
        }

        setError(
          "Could not load renewal alerts."
        );

      } finally {
        setLoading(false);
      }
    }, [router]);


  useEffect(() => {
    loadReminders();
  }, [loadReminders]);


  async function handleBackfill() {
    setBackfilling(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await authFetch(
          "/reminders/backfill",
          {
            method: "POST",
          }
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
          typeof data.detail === "string"
            ? data.detail
            : "Backfill failed."
        );
      }

      const result =
        data as BackfillResponse;

      setSuccess(
        result.reminders_created > 0
          ? `${result.reminders_created} reminders created across ${result.contracts_processed} contract(s).`
          : `All ${result.contracts_processed} contract(s) already have their reminders.`
      );

      await loadReminders();

    } catch (err) {
      console.error(err);

      if (
        err instanceof Error &&
        err.message === "AUTH_REQUIRED"
      ) {
        router.replace("/login");
        return;
      }

      setError(
        "Could not generate reminders."
      );

    } finally {
      setBackfilling(false);
    }
  }


  async function handleSendDueEmails() {
    setSendingEmails(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await authFetch(
          "/reminders/send-due",
          {
            method: "POST",
          }
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
          typeof data.detail === "string"
            ? data.detail
            : "Could not send due reminder emails."
        );
      }

      const result =
        data as SendDueResponse;

      if (
        result.sent_count === 0 &&
        result.failed_count === 0
      ) {
        setSuccess(
          "No pending due reminders need email delivery."
        );
      } else if (
        result.failed_count === 0
      ) {
        setSuccess(
          `${result.sent_count} reminder email${
            result.sent_count === 1
              ? ""
              : "s"
          } sent successfully.`
        );
      } else {
        setSuccess(
          `${result.sent_count} email${
            result.sent_count === 1
              ? ""
              : "s"
          } sent. ${result.failed_count} failed.`
        );
      }

      if (result.failed_count > 0) {
        const firstFailure =
          result.failed[0];

        setError(
          `Email failure for ${firstFailure.vendor_name}: ${firstFailure.error}`
        );
      }

      await loadReminders();

    } catch (err) {
      console.error(err);

      if (
        err instanceof Error &&
        err.message === "AUTH_REQUIRED"
      ) {
        router.replace("/login");
        return;
      }

      setError(
        err instanceof Error
          ? err.message
          : "Could not send reminder emails."
      );

    } finally {
      setSendingEmails(false);
    }
  }


  const today =
    useMemo(() => {
      const current =
        new Date();

      current.setHours(
        0,
        0,
        0,
        0
      );

      return current;
    }, []);


  const dueReminders =
    useMemo(() => {
      return reminders.filter(
        (reminder) => {
          if (
            reminder.status !== "pending"
          ) {
            return false;
          }

          const reminderDate =
            parseDate(
              reminder.remind_on
            );

          if (!reminderDate) {
            return false;
          }

          return (
            reminderDate.getTime() <=
            today.getTime()
          );
        }
      );
    }, [reminders, today]);


  const upcomingReminders =
    useMemo(() => {
      return reminders.filter(
        (reminder) => {
          if (
            reminder.status !== "pending"
          ) {
            return false;
          }

          const reminderDate =
            parseDate(
              reminder.remind_on
            );

          if (!reminderDate) {
            return false;
          }

          return (
            reminderDate.getTime() >
            today.getTime()
          );
        }
      );
    }, [reminders, today]);


  const sentReminders =
    useMemo(() => {
      return reminders.filter(
        (reminder) =>
          reminder.status === "sent"
      );
    }, [reminders]);


  const nextThirtyDays =
    useMemo(() => {
      const future =
        new Date(today);

      future.setDate(
        future.getDate() + 30
      );

      return upcomingReminders.filter(
        (reminder) => {
          const reminderDate =
            parseDate(
              reminder.remind_on
            );

          if (!reminderDate) {
            return false;
          }

          return (
            reminderDate.getTime() <=
            future.getTime()
          );
        }
      ).length;

    }, [
      upcomingReminders,
      today,
    ]);


  const nextReminder =
    useMemo(() => {
      const sorted =
        [...upcomingReminders]
          .sort(
            (a, b) =>
              (
                parseDate(
                  a.remind_on
                )?.getTime() || 0
              ) -
              (
                parseDate(
                  b.remind_on
                )?.getTime() || 0
              )
          );

      return sorted[0] || null;

    }, [upcomingReminders]);


  const activeAlerts =
    reminders.filter(
      (reminder) =>
        reminder.status ===
        "pending"
    ).length;


  return (
    <AuthGuard>

      <main className="min-h-screen bg-slate-50 text-slate-950">

        <AppNavbar />


        <div className="mx-auto max-w-7xl px-6 py-10 lg:py-12">


          {/* HEADER */}

          <header className="mb-8 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">

            <div>

              <p className="renewai-eyebrow">
                Renewal operations
              </p>

              <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                Renewal Alerts
              </h1>

              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                Monitor every renewal action before
                cancellation windows close.
              </p>

            </div>


            <div className="flex flex-wrap gap-3">

              <Link
                href="/contracts"
                className="renewai-button-secondary"
              >
                View Contracts
              </Link>

              <Link
                href="/analyze"
                className="renewai-button-primary"
              >
                + Analyze Contract
              </Link>

            </div>

          </header>


          {/* INTELLIGENCE HERO */}

          <section className="mb-6 overflow-hidden rounded-[1.75rem] bg-slate-950 p-7 shadow-sm lg:p-8">

            <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">

              <div>

                <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5">

                  <span
                    className={
                      dueReminders.length > 0
                        ? "h-2 w-2 rounded-full bg-red-400"
                        : "h-2 w-2 rounded-full bg-emerald-400"
                    }
                  />

                  <span className="text-xs font-semibold text-slate-300">
                    Reminder engine
                  </span>

                </div>


                <h2 className="mt-5 max-w-2xl text-2xl font-bold tracking-tight !text-white sm:text-3xl">

                  {
                    dueReminders.length > 0
                      ? `${dueReminders.length} renewal action${
                          dueReminders.length === 1
                            ? ""
                            : "s"
                        } require attention`
                      : activeAlerts > 0
                      ? "Your renewal schedule is being monitored"
                      : "No active renewal alerts"
                  }

                </h2>


                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">

                  {
                    dueReminders.length > 0
                      ? "One or more scheduled reminder dates have arrived or passed. Review these contracts before taking further renewal action."
                      : activeAlerts > 0
                      ? "RenewAI is tracking upcoming reminder dates across your contract portfolio."
                      : "Generate reminders for eligible contracts to start monitoring cancellation windows."
                  }

                </p>

              </div>


              <div className="grid gap-3 sm:grid-cols-2">

                <DarkMetric
                  label="Active alerts"
                  value={
                    activeAlerts.toString()
                  }
                />

                <DarkMetric
                  label="Due / overdue"
                  value={
                    dueReminders.length.toString()
                  }
                  urgent={
                    dueReminders.length > 0
                  }
                />

                <DarkMetric
                  label="Next 30 days"
                  value={
                    nextThirtyDays.toString()
                  }
                />

                <DarkMetric
                  label="Next alert"
                  value={
                    nextReminder
                      ? formatDate(
                          nextReminder.remind_on
                        )
                      : "None"
                  }
                />

              </div>

            </div>

          </section>


          {/* STATS */}

          <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

            <StatCard
              label="Active Alerts"
              value={
                activeAlerts.toString()
              }
              description="Pending actions"
            />

            <StatCard
              label="Due / Overdue"
              value={
                dueReminders.length.toString()
              }
              description="Require attention"
              urgent={
                dueReminders.length > 0
              }
            />

            <StatCard
              label="Next 30 Days"
              value={
                nextThirtyDays.toString()
              }
              description="Coming soon"
            />

            <StatCard
              label="Upcoming"
              value={
                upcomingReminders.length.toString()
              }
              description="Future alerts"
            />

            <StatCard
              label="Emails Sent"
              value={
                sentReminders.length.toString()
              }
              description="Delivered alerts"
            />

          </section>


          {/* REMINDER ENGINE */}

          <section className="mb-8 renewai-card p-6 sm:p-7">

            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">

              <div>

                <p className="renewai-eyebrow">
                  Automation
                </p>

                <h2 className="mt-2 text-xl font-bold text-slate-950">
                  Reminder Engine
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Generate missing renewal alerts and
                  deliver any reminders that are currently due.
                </p>

              </div>


              <div className="flex flex-wrap gap-3">

                <button
                  type="button"
                  onClick={
                    handleBackfill
                  }
                  disabled={
                    backfilling ||
                    sendingEmails
                  }
                  className="renewai-button-secondary"
                >
                  {
                    backfilling
                      ? "Generating..."
                      : "Generate Missing Alerts"
                  }
                </button>


                <button
                  type="button"
                  onClick={
                    handleSendDueEmails
                  }
                  disabled={
                    sendingEmails ||
                    backfilling ||
                    dueReminders.length === 0
                  }
                  className="renewai-button-primary"
                >
                  {
                    sendingEmails
                      ? "Sending Emails..."
                      : dueReminders.length > 0
                      ? `Send Due Emails (${dueReminders.length})`
                      : "No Due Emails"
                  }
                </button>

              </div>

            </div>


            {success && (

              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-800">
                {success}
              </div>

            )}


            {error && (

              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">
                {error}
              </div>

            )}

          </section>


          {/* LOADING */}

          {loading && (

            <section className="renewai-card p-12 text-center">

              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />

              <p className="text-sm font-medium text-slate-600">
                Loading renewal alerts...
              </p>

            </section>

          )}


          {/* EMPTY */}

          {!loading &&
            reminders.length === 0 && (

              <section className="renewai-card p-12 text-center">

                <div className="mx-auto max-w-lg">

                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl font-bold text-slate-500">
                    !
                  </div>

                  <h2 className="mt-5 text-xl font-bold text-slate-950">
                    No renewal alerts yet
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    Generate reminders for your existing
                    contracts to start monitoring renewal
                    and cancellation deadlines.
                  </p>

                  <button
                    type="button"
                    onClick={
                      handleBackfill
                    }
                    disabled={
                      backfilling
                    }
                    className="renewai-button-primary mt-6"
                  >
                    {
                      backfilling
                        ? "Generating..."
                        : "Generate Missing Alerts"
                    }
                  </button>

                </div>

              </section>

            )}


          {/* DUE */}

          {!loading &&
            dueReminders.length > 0 && (

              <ReminderSection
                eyebrow="Action required"
                title="Due & Overdue"
                description="These reminder dates have arrived or passed and should be reviewed now."
                reminders={
                  [...dueReminders].sort(
                    sortReminders
                  )
                }
                urgent
              />

            )}


          {/* UPCOMING */}

          {!loading &&
            upcomingReminders.length > 0 && (

              <ReminderSection
                eyebrow="Upcoming"
                title="Scheduled Renewal Alerts"
                description="Future actions RenewAI is monitoring before your cancellation deadlines."
                reminders={
                  [...upcomingReminders].sort(
                    sortReminders
                  )
                }
              />

            )}


          {/* SENT */}

          {!loading &&
            sentReminders.length > 0 && (

              <SentReminderSection
                reminders={
                  [...sentReminders].sort(
                    (a, b) =>
                      new Date(
                        b.sent_at ||
                        b.created_at
                      ).getTime()
                      -
                      new Date(
                        a.sent_at ||
                        a.created_at
                      ).getTime()
                  )
                }
              />

            )}

        </div>

      </main>

    </AuthGuard>
  );
}


/* =========================================================
   SECTIONS
   ========================================================= */


function ReminderSection({
  eyebrow,
  title,
  description,
  reminders,
  urgent = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  reminders: Reminder[];
  urgent?: boolean;
}) {

  return (

    <section className="mb-8 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">

      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 px-6 py-6 sm:flex-row sm:items-center">

        <div>

          <p
            className={
              urgent
                ? "text-xs font-bold uppercase tracking-[0.18em] text-red-600"
                : "renewai-eyebrow"
            }
          >
            {eyebrow}
          </p>

          <h2 className="mt-2 text-xl font-bold text-slate-950">
            {title}
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            {description}
          </p>

        </div>


        <span
          className={
            urgent
              ? "w-fit rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700"
              : "w-fit rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700"
          }
        >
          {reminders.length}{" "}
          {
            reminders.length === 1
              ? "alert"
              : "alerts"
          }
        </span>

      </div>


      <div className="divide-y divide-slate-100">

        {reminders.map(
          (reminder) => (

            <ReminderRow
              key={
                reminder.id
              }
              reminder={
                reminder
              }
            />

          )
        )}

      </div>

    </section>
  );
}


function SentReminderSection({
  reminders,
}: {
  reminders: Reminder[];
}) {

  return (

    <section className="mb-8 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">

      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 px-6 py-6 sm:flex-row sm:items-center">

        <div>

          <p className="renewai-eyebrow">
            Delivery history
          </p>

          <h2 className="mt-2 text-xl font-bold text-slate-950">
            Sent Reminder Emails
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Renewal alerts already delivered by RenewAI.
          </p>

        </div>


        <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
          {reminders.length} sent
        </span>

      </div>


      <div className="divide-y divide-slate-100">

        {reminders.map(
          (reminder) => {

            const contract =
              reminder.contracts;

            return (

              <div
                key={
                  reminder.id
                }
                className="flex flex-col justify-between gap-5 px-6 py-5 transition hover:bg-slate-50 md:flex-row md:items-center"
              >

                <div className="flex items-start gap-4">

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                    ✓
                  </div>


                  <div>

                    <div className="flex flex-wrap items-center gap-2">

                      <h3 className="font-bold text-slate-950">
                        {
                          contract?.vendor_name ||
                          "Unknown Vendor"
                        }
                      </h3>

                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        Delivered
                      </span>

                    </div>


                    <p className="mt-1 text-sm text-slate-500">
                      {
                        formatReminderType(
                          reminder.reminder_type
                        )
                      }
                    </p>


                    {
                      contract?.contract_title
                      &&
                      (

                        <p className="mt-1 max-w-xl truncate text-xs text-slate-400">
                          {
                            contract.contract_title
                          }
                        </p>

                      )
                    }

                  </div>

                </div>


                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">

                  <div className="sm:text-right">

                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Sent
                    </p>

                    <p className="mt-1 text-sm font-bold text-slate-800">
                      {
                        reminder.sent_at
                          ? formatDateTime(
                              reminder.sent_at
                            )
                          : "Delivered"
                      }
                    </p>

                  </div>


                  {
                    contract?.id
                    &&
                    (

                      <Link
                        href={
                          `/contracts/${contract.id}`
                        }
                        className="renewai-button-secondary !px-4 !py-2 text-sm"
                      >
                        Open Contract
                      </Link>

                    )
                  }

                </div>

              </div>
            );
          }
        )}

      </div>

    </section>
  );
}


/* =========================================================
   ROWS
   ========================================================= */


function ReminderRow({
  reminder,
}: {
  reminder: Reminder;
}) {

  const contract =
    reminder.contracts;

  const days =
    getDaysFromToday(
      reminder.remind_on
    );

  const overdue =
    days < 0;

  const dueToday =
    days === 0;


  return (

    <div className="flex flex-col justify-between gap-5 px-6 py-5 transition hover:bg-slate-50 md:flex-row md:items-center">

      <div className="flex min-w-0 items-start gap-4">

        <div
          className={
            overdue || dueToday
              ? "mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-700"
              : "mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700"
          }
        >
          {
            overdue || dueToday
              ? "!"
              : "•"
          }
        </div>


        <div className="min-w-0">

          <div className="flex flex-wrap items-center gap-2">

            <span
              className={
                overdue || dueToday
                  ? "rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700"
                  : "rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700"
              }
            >
              {
                formatReminderType(
                  reminder.reminder_type
                )
              }
            </span>


            {
              contract?.risk_level
              &&
              (

                <span
                  className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${riskClasses(
                    contract.risk_level
                  )}`}
                >
                  {
                    contract.risk_level
                  }
                </span>

              )
            }

          </div>


          <h3 className="mt-3 text-lg font-bold text-slate-950">

            {
              contract?.vendor_name ||
              "Unknown Vendor"
            }

          </h3>


          <p className="mt-1 max-w-xl truncate text-sm text-slate-500">

            {
              contract?.contract_title ||
              "Contract renewal"
            }

          </p>


          {
            contract?.cancellation_deadline
            &&
            (

              <p className="mt-2 text-xs font-medium text-slate-500">

                Cancellation deadline:{" "}

                <span className="font-bold text-slate-700">
                  {
                    formatDate(
                      contract.cancellation_deadline
                    )
                  }
                </span>

              </p>

            )
          }

        </div>

      </div>


      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">

        <div className="sm:text-right">

          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Reminder date
          </p>

          <p className="mt-1 font-bold text-slate-800">
            {
              formatDate(
                reminder.remind_on
              )
            }
          </p>

          <p
            className={
              overdue || dueToday
                ? "mt-1 text-xs font-bold text-red-600"
                : "mt-1 text-xs font-medium text-slate-500"
            }
          >
            {
              overdue
                ? `${Math.abs(days)} day${
                    Math.abs(days) === 1
                      ? ""
                      : "s"
                  } overdue`

                : dueToday
                ? "Due today"

                : `In ${days} day${
                    days === 1
                      ? ""
                      : "s"
                  }`
            }
          </p>

        </div>


        {contract?.id && (

          <Link
            href={
              `/contracts/${contract.id}`
            }
            className="renewai-button-secondary !px-4 !py-2 text-sm"
          >
            Open Contract
          </Link>

        )}

      </div>

    </div>
  );
}


/* =========================================================
   CARDS
   ========================================================= */


function DarkMetric({
  label,
  value,
  urgent = false,
}: {
  label: string;
  value: string;
  urgent?: boolean;
}) {

  return (

    <div
      className={
        urgent
          ? "rounded-2xl border border-red-900/60 bg-red-950/40 p-5"
          : "rounded-2xl border border-slate-800 bg-slate-900 p-5"
      }
    >

      <p
        className={
          urgent
            ? "text-xs font-medium text-red-300"
            : "text-xs font-medium text-slate-400"
        }
      >
        {label}
      </p>

      <p className="mt-2 text-xl font-bold !text-white">
        {value}
      </p>

    </div>
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
          ? "rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm"
          : "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      }
    >

      <p
        className={
          urgent
            ? "text-sm font-semibold text-red-700"
            : "text-sm font-semibold text-slate-600"
        }
      >
        {label}
      </p>

      <p
        className={
          urgent
            ? "mt-2 text-3xl font-bold text-red-950"
            : "mt-2 text-3xl font-bold text-slate-950"
        }
      >
        {value}
      </p>

      <p
        className={
          urgent
            ? "mt-1 text-xs text-red-600"
            : "mt-1 text-xs text-slate-500"
        }
      >
        {description}
      </p>

    </div>
  );
}


/* =========================================================
   HELPERS
   ========================================================= */


function parseDate(
  value: string
) {

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


function formatDate(
  value: string
) {

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
      day: "numeric",
      month: "short",
      year: "numeric",
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
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
  );
}


function getDaysFromToday(
  value: string
) {

  const reminderDate =
    parseDate(
      value
    );

  if (!reminderDate) {
    return 0;
  }

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  const difference =
    reminderDate.getTime()
    -
    today.getTime();

  return Math.ceil(
    difference /
      (
        1000 *
        60 *
        60 *
        24
      )
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

  return `${days}-day alert`;
}


function sortReminders(
  a: Reminder,
  b: Reminder
) {

  return (
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
}


function riskClasses(
  risk: string
) {

  switch (
    risk.toLowerCase()
  ) {

    case "critical":
      return "border-red-200 bg-red-50 text-red-700";

    case "urgent":
      return "border-orange-200 bg-orange-50 text-orange-700";

    case "attention":
      return "border-amber-200 bg-amber-50 text-amber-700";

    case "safe":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";

    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}