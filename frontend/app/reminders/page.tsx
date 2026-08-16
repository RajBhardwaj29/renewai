"use client";

import AuthGuard from "@/components/AuthGuard";

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


  return (
    <AuthGuard>
    <main className="min-h-screen bg-slate-50 text-slate-900">

      <div className="mx-auto max-w-7xl px-6 py-10">

        <header className="mb-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-start">

          <div>

            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              RenewAI
            </p>

            <h1 className="text-4xl font-bold tracking-tight">
              Renewal Alerts
            </h1>

            <p className="mt-3 max-w-2xl text-slate-600">
              Track upcoming renewal actions
              before cancellation windows close.
            </p>

          </div>


          <div className="flex flex-wrap gap-3">

            <Link
              href="/contracts"
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium transition hover:bg-slate-100"
            >
              Contracts
            </Link>

            <Link
              href="/"
              className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              + Analyze Contract
            </Link>

          </div>

        </header>


        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

          <StatCard
            label="Active Alerts"
            value={
              reminders.filter(
                (reminder) =>
                  reminder.status ===
                  "pending"
              ).length.toString()
            }
          />

          <StatCard
            label="Due / Overdue"
            value={
              dueReminders.length.toString()
            }
          />

          <StatCard
            label="Next 30 Days"
            value={
              nextThirtyDays.toString()
            }
          />

          <StatCard
            label="Upcoming"
            value={
              upcomingReminders.length.toString()
            }
          />

          <StatCard
            label="Emails Sent"
            value={
              sentReminders.length.toString()
            }
          />

        </section>


        <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">

            <div>

              <h2 className="text-lg font-semibold">
                Reminder Engine
              </h2>

              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Generate missing alerts and deliver
                any currently due reminders by email.
              </p>

            </div>


            <div className="flex flex-wrap gap-3">

              <button
                onClick={
                  handleBackfill
                }
                disabled={
                  backfilling ||
                  sendingEmails
                }
                className="w-fit rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {
                  backfilling
                    ? "Generating..."
                    : "Generate Missing Alerts"
                }
              </button>


              <button
                onClick={
                  handleSendDueEmails
                }
                disabled={
                  sendingEmails ||
                  backfilling ||
                  dueReminders.length === 0
                }
                className="w-fit rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
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
            <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-700">
              {success}
            </div>
          )}


          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

        </section>


        {loading && (
          <section className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">

            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />

            <p className="text-sm text-slate-500">
              Loading renewal alerts...
            </p>

          </section>
        )}


        {!loading &&
          reminders.length === 0 && (

            <section className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">

              <div className="mx-auto max-w-lg">

                <h2 className="text-xl font-semibold">
                  No renewal alerts yet
                </h2>

                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Click Generate Missing Alerts
                  to create reminders for your
                  existing contracts.
                </p>

              </div>

            </section>

          )}


        {!loading &&
          dueReminders.length > 0 && (

            <ReminderSection
              title="Due & Overdue"
              description="These reminder dates have arrived or passed and require attention."
              reminders={
                dueReminders
              }
              urgent
            />

          )}


        {!loading &&
          upcomingReminders.length > 0 && (

            <ReminderSection
              title="Upcoming Alerts"
              description="Future actions scheduled before your cancellation deadlines."
              reminders={
                upcomingReminders
              }
            />

          )}


        {!loading &&
          sentReminders.length > 0 && (

            <SentReminderSection
              reminders={
                sentReminders
              }
            />

          )}

      </div>

    </main>
    </AuthGuard>
  );
}


function ReminderSection({
  title,
  description,
  reminders,
  urgent = false,
}: {
  title: string;
  description: string;
  reminders: Reminder[];
  urgent?: boolean;
}) {
  return (
    <section className="mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">

      <div className="border-b border-slate-200 p-6">

        <div className="flex items-center gap-3">

          <h2 className="text-xl font-semibold">
            {title}
          </h2>

          <span
            className={
              urgent
                ? "rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700"
                : "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
            }
          >
            {reminders.length}
          </span>

        </div>

        <p className="mt-2 text-sm text-slate-500">
          {description}
        </p>

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
    <section className="mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">

      <div className="border-b border-slate-200 p-6">

        <div className="flex items-center gap-3">

          <h2 className="text-xl font-semibold">
            Sent Emails
          </h2>

          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
            {reminders.length}
          </span>

        </div>

        <p className="mt-2 text-sm text-slate-500">
          Reminder emails already delivered.
        </p>

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
                className="flex flex-col justify-between gap-5 p-6 md:flex-row md:items-center"
              >

                <div>

                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                    Sent
                  </span>

                  <h3 className="mt-3 text-lg font-semibold">
                    {
                      contract?.vendor_name ||
                      "Unknown Vendor"
                    }
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    {
                      formatReminderType(
                        reminder.reminder_type
                      )
                    }
                  </p>

                </div>


                <div className="md:text-right">

                  <p className="text-sm text-slate-500">
                    Sent at
                  </p>

                  <p className="font-semibold">
                    {
                      reminder.sent_at
                        ? formatDateTime(
                            reminder.sent_at
                          )
                        : "Sent"
                    }
                  </p>

                </div>

              </div>
            );
          }
        )}

      </div>

    </section>
  );
}


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
    <div className="flex flex-col justify-between gap-5 p-6 transition hover:bg-slate-50 md:flex-row md:items-center">

      <div className="min-w-0">

        <div className="flex flex-wrap items-center gap-2">

          <span
            className={
              overdue ||
              dueToday
                ? "rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700"
                : "rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
            }
          >
            {
              formatReminderType(
                reminder.reminder_type
              )
            }
          </span>


          {contract?.risk_level && (

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase text-slate-600">
              {
                contract.risk_level
              }
            </span>

          )}

        </div>


        <h3 className="mt-3 text-lg font-semibold">

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

      </div>


      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">

        <div className="sm:text-right">

          <p className="text-sm text-slate-500">
            Reminder date
          </p>

          <p className="font-semibold">
            {
              formatDate(
                reminder.remind_on
              )
            }
          </p>

          <p
            className={
              overdue
                ? "mt-1 text-xs font-medium text-red-600"
                : dueToday
                ? "mt-1 text-xs font-medium text-red-600"
                : "mt-1 text-xs text-slate-500"
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
            className="inline-flex w-fit rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-100"
          >
            Open Contract
          </Link>

        )}

      </div>

    </div>
  );
}


function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

      <p className="text-sm text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-3xl font-bold">
        {value}
      </p>

    </div>
  );
}


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
    parseDate(value);

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
    new Date(value);

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
    parseDate(value);

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
    reminderDate.getTime() -
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