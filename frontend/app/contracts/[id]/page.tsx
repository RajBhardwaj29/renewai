"use client";

import AuthGuard from "@/components/AuthGuard";
import AppNavbar from "@/components/AppNavbar";

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

  pricing_clause: string | null;
  minimum_commitment: string | null;
  refund_clause: string | null;

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

  /*
   * AI renewal intelligence.
   *
   * These are separate from the deterministic
   * renewal engine above.
   */
  ai_action: string | null;
  ai_confidence: number | null;
  ai_summary: string | null;
  ai_key_findings: string[] | null;
  ai_commercial_flags: string[] | null;

  /*
   * Human renewal decision workflow.
   *
   * This remains separate from the AI recommendation.
   */
  renewal_decision: string | null;
  renewal_status: string | null;
  decision_owner: string | null;
  decision_notes: string | null;
  decision_updated_at: string | null;

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


  const [
    renewalDecision,
    setRenewalDecision,
  ] =
    useState("undecided");


  const [
    renewalStatus,
    setRenewalStatus,
  ] =
    useState("under_review");


  const [
    decisionOwner,
    setDecisionOwner,
  ] =
    useState("");


  const [
    decisionNotes,
    setDecisionNotes,
  ] =
    useState("");


  const [
    savingDecision,
    setSavingDecision,
  ] =
    useState(false);


  const [
    decisionSuccess,
    setDecisionSuccess,
  ] =
    useState("");


  const [
    decisionError,
    setDecisionError,
  ] =
    useState("");


  useEffect(() => {

    async function loadContract() {

      try {

        setError("");


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
          ||
          response.status === 404
        ) {

          setContract(
            null
          );


          setError(
            "This contract doesn't exist or you don't have access to it."
          );


          return;
        }


        const data =
          await response.json();


        if (
          !response.ok
        ) {

          setContract(
            null
          );


          setError(
            typeof data.detail ===
            "string"

              ? data.detail

              : "Could not load this contract."
          );


          return;
        }


        const loadedContract =
          data.contract as Contract;


        setContract(
          loadedContract
        );


        setRenewalDecision(
          loadedContract.renewal_decision
          ||
          "undecided"
        );


        setRenewalStatus(
          loadedContract.renewal_status
          ||
          "under_review"
        );


        setDecisionOwner(
          loadedContract.decision_owner
          ||
          ""
        );


        setDecisionNotes(
          loadedContract.decision_notes
          ||
          ""
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
          "Unexpected contract loading error:",
          err
        );


        setContract(
          null
        );


        setError(
          "Could not connect to RenewAI. Please try again."
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


        if (
          !response.ok
        ) {

          throw new Error(
            typeof data.detail ===
            "string"

              ? data.detail

              : "Could not load reminders."
          );
        }


        const typedData =
          data as ReminderResponse;


        setReminders(
          typedData.reminders || []
        );


      } catch (
        err
      ) {

        console.error(
          err
        );


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


        setReminderError(
          "Could not load this contract's reminder timeline."
        );


      } finally {

        setRemindersLoading(
          false
        );
      }
    }


    if (
      id
    ) {

      loadContract();

      loadReminders();
    }

  }, [
    id,
    router,
  ]);


  const pendingReminders =
    useMemo(
      () => {

        return reminders.filter(
          (
            reminder
          ) =>
            reminder.status ===
            "pending"
        );

      },
      [
        reminders,
      ]
    );


  const sentReminders =
    useMemo(
      () => {

        return reminders.filter(
          (
            reminder
          ) =>
            reminder.status ===
            "sent"
        );

      },
      [
        reminders,
      ]
    );


  const nextReminder =
    useMemo(
      () => {

        const pending =
          [
            ...pendingReminders,
          ]
            .filter(
              (
                reminder
              ) =>
                parseDate(
                  reminder.remind_on
                ) !==
                null
            )
            .sort(
              (
                a,
                b
              ) =>
                (
                  parseDate(
                    a.remind_on
                  )?.getTime()
                  ||
                  0
                )
                -
                (
                  parseDate(
                    b.remind_on
                  )?.getTime()
                  ||
                  0
                )
            );


        const today =
          startOfToday();


        return (
          pending.find(
            (
              reminder
            ) => {

              const date =
                parseDate(
                  reminder.remind_on
                );


              return (
                date !== null
                &&
                date.getTime()
                >=
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

      },
      [
        pendingReminders,
      ]
    );


  async function handleSaveDecision() {

    if (
      !contract
    ) {

      return;
    }


    setSavingDecision(
      true
    );

    setDecisionSuccess(
      ""
    );

    setDecisionError(
      ""
    );


    try {

      const response =
        await authFetch(
          `/contracts/${contract.id}/decision`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                renewal_decision:
                  renewalDecision,

                renewal_status:
                  renewalStatus,

                decision_owner:
                  decisionOwner.trim()
                  ||
                  null,

                decision_notes:
                  decisionNotes.trim()
                  ||
                  null,
              }),
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


      if (
        !response.ok
      ) {

        throw new Error(
          typeof data.detail ===
          "string"

            ? data.detail

            : "Could not save renewal decision."
        );
      }


      const updatedContract =
        data.contract as Contract;


      setContract(
        updatedContract
      );


      setRenewalDecision(
        updatedContract.renewal_decision
        ||
        "undecided"
      );


      setRenewalStatus(
        updatedContract.renewal_status
        ||
        "under_review"
      );


      setDecisionOwner(
        updatedContract.decision_owner
        ||
        ""
      );


      setDecisionNotes(
        updatedContract.decision_notes
        ||
        ""
      );


      setDecisionSuccess(
        "Renewal decision saved."
      );


    } catch (
      err
    ) {

      console.error(
        err
      );


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


      setDecisionError(
        err instanceof Error
          ? err.message
          : "Could not save renewal decision."
      );


    } finally {

      setSavingDecision(
        false
      );
    }
  }


  async function handleArchive() {

    if (
      !contract
    ) {

      return;
    }


    const confirmed =
      window.confirm(
        `Archive ${
          contract.vendor_name
          ||
          "this contract"
        }?`
      );


    if (
      !confirmed
    ) {

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


      if (
        !response.ok
      ) {

        throw new Error(
          typeof data.detail ===
          "string"

            ? data.detail

            : "Could not archive contract."
        );
      }


      router.push(
        "/contracts"
      );


      router.refresh();


    } catch (
      err
    ) {

      console.error(
        err
      );


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


      setError(
        "Could not archive contract."
      );


    } finally {

      setArchiving(
        false
      );
    }
  }


  if (
    loading
  ) {

    return (

      <main className="min-h-screen bg-slate-50">

        <AppNavbar />


        <div className="mx-auto max-w-7xl px-6 py-20 text-center">

          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />


          <p className="text-sm font-medium text-slate-600">
            Loading contract intelligence...
          </p>

        </div>

      </main>
    );
  }


  if (
    error
    ||
    !contract
  ) {

    return (

      <main className="min-h-screen bg-slate-50">

        <AppNavbar />


        <div className="mx-auto max-w-6xl px-6 py-20">

          <div className="rounded-3xl border border-red-200 bg-red-50 p-8">

            <h1 className="text-xl font-bold text-red-900">
              Contract unavailable
            </h1>


            <p className="mt-2 text-red-800">
              {
                error
                ||
                "Contract could not be found."
              }
            </p>


            <Link
              href="/contracts"
              className="mt-6 inline-flex font-semibold text-red-900 underline underline-offset-4"
            >
              ← Back to Contracts
            </Link>

          </div>

        </div>

      </main>
    );
  }


  const deadlineStatus =
    getDeadlineStatus(
      contract
        .days_until_cancellation_deadline
    );


  const hasAIInsight =
    Boolean(
      contract.ai_action
      ||
      contract.ai_summary
      ||
      (
        contract.ai_key_findings
        &&
        contract.ai_key_findings.length > 0
      )
      ||
      (
        contract.ai_commercial_flags
        &&
        contract.ai_commercial_flags.length > 0
      )
    );


  return (

    <AuthGuard>

      <main className="min-h-screen bg-slate-50 text-slate-950">

        <AppNavbar />


        <div className="mx-auto max-w-7xl px-6 py-10 lg:py-12">


          {/* TOP NAVIGATION */}

          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

            <Link
              href="/contracts"
              className="text-sm font-semibold text-slate-500 transition hover:text-slate-950"
            >
              ← Back to Contracts
            </Link>


            <div className="flex flex-wrap gap-3">

              <Link
                href="/reminders"
                className="renewai-button-secondary"
              >
                Renewal Alerts
              </Link>


              <button
                type="button"

                onClick={
                  handleArchive
                }

                disabled={
                  archiving
                }

                className="renewai-button-danger"
              >
                {
                  archiving
                    ? "Archiving..."
                    : "Archive Contract"
                }
              </button>

            </div>

          </div>


          {/* HEADER */}

          <header className="mb-8 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">

            <div>

              <p className="renewai-eyebrow">
                Contract intelligence
              </p>


              <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                {
                  contract.vendor_name
                  ||
                  "Unknown Vendor"
                }
              </h1>


              <p className="mt-3 max-w-2xl text-lg text-slate-600">
                {
                  contract.contract_title
                  ||
                  contract.filename
                }
              </p>


              <div className="mt-5 flex flex-wrap gap-2">

                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${riskClasses(
                    contract.risk_level
                  )}`}
                >
                  {
                    contract.risk_level
                    ||
                    "unknown risk"
                  }
                </span>


                {
                  contract.auto_renewal ===
                  true
                  &&
                  (

                    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">

                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />

                      Auto-renewing

                    </span>

                  )
                }


                {
                  contract.auto_renewal ===
                  false
                  &&
                  (

                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      Manual renewal
                    </span>

                  )
                }

              </div>

            </div>


            <Link
              href="/analyze"
              className="renewai-button-primary"
            >
              + Analyze Another Contract
            </Link>

          </header>


          {/* DETERMINISTIC RENEWAL POSITION */}

          <section className="mb-6 overflow-hidden rounded-[1.75rem] bg-slate-950 p-7 text-white shadow-sm lg:p-8">

            <div className="grid gap-8 lg:grid-cols-[1.45fr_1fr] lg:items-center">

              <div>

                <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5">

                  <span
                    className={
                      deadlineStatus ===
                      "urgent"

                        ? "h-2 w-2 rounded-full bg-orange-400"

                        : "h-2 w-2 rounded-full bg-emerald-400"
                    }
                  />


                  <span className="text-xs font-semibold text-slate-300">
                    Renewal position
                  </span>

                </div>


                <h2 className="mt-5 max-w-2xl text-2xl font-bold tracking-tight !text-white sm:text-3xl">

                  {
                    recommendationHeading(
                      contract.risk_level,
                      contract
                        .days_until_cancellation_deadline
                    )
                  }

                </h2>


                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">

                  {
                    contract.recommendation
                    ||
                    "Review the contract terms and renewal position before the cancellation deadline."
                  }

                </p>

              </div>


              <div className="grid gap-3 sm:grid-cols-2">

                <DarkMetric
                  label="Renewal date"
                  value={
                    formatDate(
                      contract
                        .effective_renewal_date
                    )
                  }
                />


                <DarkMetric
                  label="Cancel by"
                  value={
                    formatDate(
                      contract
                        .cancellation_deadline
                    )
                  }
                />


                <DarkMetric
                  label="Time until deadline"
                  value={
                    formatDeadline(
                      contract
                        .days_until_cancellation_deadline
                    )
                  }
                />


                <DarkMetric
                  label="Notice period"
                  value={
                    contract
                      .notice_period_days
                    !==
                    null

                      ? `${contract.notice_period_days} days`

                      : "Not found"
                  }
                />

              </div>

            </div>

          </section>


          {/* EXECUTIVE CARDS */}

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
                  contract
                    .effective_renewal_date
                )
              }

              description="Next renewal"
            />


            <InfoCard
              label="Cancel By"

              value={
                formatDate(
                  contract
                    .cancellation_deadline
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
                  contract
                    .days_until_cancellation_deadline
                )
              }

              description={
                contract
                  .days_until_cancellation_deadline
                !==
                null
                &&
                contract
                  .days_until_cancellation_deadline
                <
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
                contract
                  .notice_period_days
                !==
                null

                  ? `${contract.notice_period_days} days`

                  : "Not found"
              }

              description="Required notice"
            />

          </section>


          {/* AI RENEWAL INTELLIGENCE */}

          {
            hasAIInsight
            &&
            (

              <section className="mb-8 overflow-hidden rounded-[1.75rem] border border-blue-200 bg-white shadow-sm">

                <div className="border-b border-blue-100 bg-blue-50/70 p-6 sm:p-7">

                  <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">

                    <div>

                      <div className="flex flex-wrap items-center gap-3">

                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
                          AI Renewal Intelligence
                        </p>


                        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-bold text-blue-700">

                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />

                          AI analysis

                        </span>

                      </div>


                      <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
                        {
                          formatAIAction(
                            contract.ai_action
                          )
                        }
                      </h2>


                      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">
                        {
                          contract.ai_summary
                          ||
                          "RenewAI analyzed the reviewed contract for renewal and commercial considerations."
                        }
                      </p>

                    </div>


                    <div className="shrink-0 rounded-2xl border border-blue-200 bg-white px-5 py-4">

                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        AI confidence
                      </p>


                      <p className="mt-1 text-2xl font-bold text-slate-950">
                        {
                          formatConfidence(
                            contract.ai_confidence
                          )
                        }
                      </p>

                    </div>

                  </div>

                </div>


                <div className="grid gap-0 lg:grid-cols-2">

                  <AIInsightList
                    eyebrow="Why"
                    title="Key Findings"
                    items={
                      contract.ai_key_findings
                      ||
                      []
                    }
                    emptyText="No additional key findings were identified."
                  />


                  <AIInsightList
                    eyebrow="Commercial review"
                    title="Commercial Flags"
                    items={
                      contract.ai_commercial_flags
                      ||
                      []
                    }
                    emptyText="No material commercial flags were identified."
                    flagged
                  />

                </div>


                <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 sm:px-7">

                  <p className="text-xs leading-5 text-slate-500">
                    AI intelligence is generated from the human-reviewed
                    contract and RenewAI&apos;s deterministic renewal
                    calculations. Verify important commercial or legal
                    conclusions before acting.
                  </p>

                </div>

              </section>

            )
          }


          {/* RENEWAL DECISION WORKSPACE */}

          <section className="mb-8 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">

            <div className="border-b border-slate-200 px-6 py-6 sm:px-7">

              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">

                <div>

                  <p className="renewai-eyebrow">
                    Human decision
                  </p>


                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                    Renewal Decision Workspace
                  </h2>


                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                    Record the organization&apos;s actual renewal decision,
                    owner and working notes. The AI recommendation remains
                    advisory and is never changed by this workflow.
                  </p>

                </div>


                <div className="shrink-0">

                  <DecisionStatusBadge
                    status={
                      renewalStatus
                    }
                  />

                </div>

              </div>

            </div>


            <div className="grid gap-0 lg:grid-cols-[0.8fr_1.2fr]">

              {/* AI RECOMMENDATION CONTEXT */}

              <div className="border-b border-slate-100 bg-slate-50 p-6 sm:p-7 lg:border-b-0 lg:border-r">

                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                  RenewAI recommendation
                </p>


                <h3 className="mt-3 text-xl font-bold text-slate-950">
                  {
                    formatAIAction(
                      contract.ai_action
                    )
                  }
                </h3>


                <div className="mt-4 flex flex-wrap gap-2">

                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${decisionActionClasses(
                      contract.ai_action
                    )}`}
                  >
                    AI suggestion
                  </span>


                  {
                    contract.ai_confidence
                    !==
                    null
                    &&
                    (

                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
                        {
                          formatConfidence(
                            contract.ai_confidence
                          )
                        } confidence
                      </span>

                    )
                  }

                </div>


                <p className="mt-5 text-sm leading-7 text-slate-600">
                  {
                    contract.ai_summary
                    ||
                    "No AI renewal recommendation is available for this contract."
                  }
                </p>


                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">

                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Decision principle
                  </p>


                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    RenewAI recommends. Your organization decides.
                    A human decision may intentionally differ from
                    the AI suggestion.
                  </p>

                </div>

              </div>


              {/* HUMAN DECISION FORM */}

              <div className="p-6 sm:p-7">

                <div className="grid gap-5 sm:grid-cols-2">

                  <div>

                    <label
                      htmlFor="renewalDecision"
                      className="renewai-label"
                    >
                      Renewal decision
                    </label>


                    <select
                      id="renewalDecision"

                      value={
                        renewalDecision
                      }

                      onChange={
                        (
                          event
                        ) => {

                          setRenewalDecision(
                            event.target.value
                          );

                          setDecisionSuccess(
                            ""
                          );
                        }
                      }

                      className="renewai-input"
                    >
                      <option value="undecided">
                        Undecided
                      </option>

                      <option value="renew">
                        Renew
                      </option>

                      <option value="renegotiate">
                        Renegotiate
                      </option>

                      <option value="cancel">
                        Cancel
                      </option>
                    </select>

                  </div>


                  <div>

                    <label
                      htmlFor="renewalStatus"
                      className="renewai-label"
                    >
                      Workflow status
                    </label>


                    <select
                      id="renewalStatus"

                      value={
                        renewalStatus
                      }

                      onChange={
                        (
                          event
                        ) => {

                          setRenewalStatus(
                            event.target.value
                          );

                          setDecisionSuccess(
                            ""
                          );
                        }
                      }

                      className="renewai-input"
                    >
                      <option value="under_review">
                        Under review
                      </option>

                      <option value="decision_made">
                        Decision made
                      </option>

                      <option value="completed">
                        Completed
                      </option>
                    </select>

                  </div>

                </div>


                <div className="mt-5">

                  <label
                    htmlFor="decisionOwner"
                    className="renewai-label"
                  >
                    Decision owner
                  </label>


                  <input
                    id="decisionOwner"

                    type="text"

                    value={
                      decisionOwner
                    }

                    onChange={
                      (
                        event
                      ) => {

                        setDecisionOwner(
                          event.target.value
                        );

                        setDecisionSuccess(
                          ""
                        );
                      }
                    }

                    placeholder="e.g. Raj, Finance Team, Procurement"

                    className="renewai-input"
                  />

                </div>


                <div className="mt-5">

                  <label
                    htmlFor="decisionNotes"
                    className="renewai-label"
                  >
                    Decision notes
                  </label>


                  <textarea
                    id="decisionNotes"

                    rows={5}

                    value={
                      decisionNotes
                    }

                    onChange={
                      (
                        event
                      ) => {

                        setDecisionNotes(
                          event.target.value
                        );

                        setDecisionSuccess(
                          ""
                        );
                      }
                    }

                    placeholder="Capture negotiation targets, internal context, next steps or the reason behind the decision."

                    className="renewai-input resize-y"
                  />

                </div>


                {
                  contract.decision_updated_at
                  &&
                  (

                    <p className="mt-4 text-xs text-slate-500">
                      Last updated{" "}
                      <span className="font-semibold text-slate-700">
                        {
                          formatDateTime(
                            contract.decision_updated_at
                          )
                        }
                      </span>
                    </p>

                  )
                }


                {
                  decisionSuccess
                  &&
                  (

                    <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                      {decisionSuccess}
                    </div>

                  )
                }


                {
                  decisionError
                  &&
                  (

                    <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                      {decisionError}
                    </div>

                  )
                }


                <div className="mt-6 flex flex-col justify-between gap-4 border-t border-slate-100 pt-6 sm:flex-row sm:items-center">

                  <div>

                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Current human decision
                    </p>


                    <p className="mt-1 text-sm font-bold text-slate-950">
                      {
                        formatHumanDecision(
                          renewalDecision
                        )
                      }
                    </p>

                  </div>


                  <button
                    type="button"

                    onClick={
                      handleSaveDecision
                    }

                    disabled={
                      savingDecision
                    }

                    className="renewai-button-primary"
                  >
                    {
                      savingDecision
                        ? "Saving Decision..."
                        : "Save Decision"
                    }
                  </button>

                </div>

              </div>

            </div>

          </section>


          {/* MAIN GRID */}

          <section className="mb-8 grid gap-6 lg:grid-cols-2">

            <Panel
              eyebrow="Agreement"
              title="Contract Terms"
            >

              <DetailRow
                label="Effective Start"
                value={
                  formatDate(
                    contract
                      .effective_start_date
                  )
                }
              />


              <DetailRow
                label="Effective End"
                value={
                  formatDate(
                    contract
                      .effective_end_date
                  )
                }
              />


              <DetailRow
                label="Initial Term"
                value={
                  contract
                    .initial_term_months
                  !==
                  null

                    ? `${contract.initial_term_months} months`

                    : "Not found"
                }
              />


              <DetailRow
                label="Renewal Term"
                value={
                  contract
                    .renewal_term_months
                  !==
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
                  contract
                    .notice_period_days
                  !==
                  null

                    ? `${contract.notice_period_days} days`

                    : "Not found"
                }
              />


              <DetailRow
                label="Payment Terms"
                value={
                  contract.payment_terms
                  ||
                  "Not found"
                }
              />

            </Panel>


            <Panel
              eyebrow="Date engine"
              title="Renewal Calculation"
            >

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
                  contract.derived_end_date
                    ? formatDate(
                        contract.derived_end_date
                      )
                    : "Not required"
                }
              />


              <DetailRow
                label="Derived Renewal Date"
                value={
                  contract.derived_renewal_date
                    ? formatDate(
                        contract.derived_renewal_date
                      )
                    : "Not required"
                }
              />


              <DetailRow
                label="Effective Renewal Date"
                value={
                  formatDate(
                    contract
                      .effective_renewal_date
                  )
                }
              />


              <DetailRow
                label="Cancellation Deadline"
                value={
                  formatDate(
                    contract
                      .cancellation_deadline
                  )
                }
              />

            </Panel>

          </section>


          {/* REMINDER TIMELINE */}

          <section className="mb-8 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">

            <div className="flex flex-col justify-between gap-4 border-b border-slate-200 px-6 py-6 sm:flex-row sm:items-center">

              <div>

                <p className="renewai-eyebrow">
                  Automation
                </p>


                <h2 className="mt-2 text-xl font-bold text-slate-950">
                  Renewal Reminder Timeline
                </h2>


                <p className="mt-2 text-sm text-slate-500">
                  RenewAI automatically monitors these alert dates.
                </p>

              </div>


              <div className="flex flex-wrap gap-2">

                <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  {
                    pendingReminders.length
                  } pending
                </span>


                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  {
                    sentReminders.length
                  } sent
                </span>

              </div>

            </div>


            {
              remindersLoading
              &&
              (

                <div className="p-10 text-center">

                  <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />


                  <p className="text-sm text-slate-500">
                    Loading reminder timeline...
                  </p>

                </div>

              )
            }


            {
              reminderError
              &&
              (

                <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                  {reminderError}
                </div>

              )
            }


            {
              !remindersLoading
              &&
              !reminderError
              &&
              reminders.length === 0
              &&
              (

                <div className="p-12 text-center">

                  <h3 className="font-bold text-slate-950">
                    No reminders generated
                  </h3>


                  <p className="mt-2 text-sm text-slate-500">
                    This contract does not currently have a reminder schedule.
                  </p>


                  <Link
                    href="/reminders"
                    className="renewai-button-secondary mt-5"
                  >
                    Open Renewal Alerts
                  </Link>

                </div>

              )
            }


            {
              !remindersLoading
              &&
              !reminderError
              &&
              reminders.length > 0
              &&
              (

                <div className="divide-y divide-slate-100">

                  {
                    [
                      ...reminders,
                    ]
                      .sort(
                        (
                          a,
                          b
                        ) =>
                          (
                            parseDate(
                              a.remind_on
                            )?.getTime()
                            ||
                            0
                          )
                          -
                          (
                            parseDate(
                              b.remind_on
                            )?.getTime()
                            ||
                            0
                          )
                      )
                      .map(
                        (
                          reminder
                        ) => (

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

              )
            }

          </section>


                    {/* EVIDENCE */}

                    <section className="mb-8 renewai-card p-6 sm:p-7">

<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">

  <div>

    <p className="renewai-eyebrow">
      Extracted evidence
    </p>


    <h2 className="mt-2 text-xl font-bold text-slate-950">
      Contract Evidence
    </h2>


    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
      Source terms extracted from the agreement and used
      by RenewAI to generate renewal and commercial intelligence.
    </p>

  </div>


  <span className="inline-flex w-fit rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
    AI extracted
  </span>

</div>


{/* CORE RENEWAL TERMS */}

<div className="mt-7">

  <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
    Renewal & termination
  </p>


  <div className="grid gap-6 lg:grid-cols-2">

    <EvidenceBlock
      title="Renewal Clause"
      value={
        contract.renewal_clause
        ||
        "No renewal clause extracted."
      }
      type="renewal"
    />


    <EvidenceBlock
      title="Termination Clause"
      value={
        contract.termination_clause
        ||
        "No termination clause extracted."
      }
      type="termination"
    />

  </div>

</div>


{/* COMMERCIAL TERMS */}

<div className="mt-8 border-t border-slate-100 pt-7">

  <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">

    <div>

      <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
        Commercial intelligence
      </p>


      <h3 className="mt-2 text-lg font-bold text-slate-950">
        Renewal Economics & Commitments
      </h3>

    </div>


    <p className="text-xs text-slate-500">
      Used by AI renewal analysis
    </p>

  </div>


  <div className="grid gap-5 lg:grid-cols-3">

    <EvidenceBlock
      title="Pricing Clause"
      value={
        contract.pricing_clause
        ||
        "No renewal pricing or price adjustment clause extracted."
      }
      type="pricing"
    />


    <EvidenceBlock
      title="Minimum Commitment"
      value={
        contract.minimum_commitment
        ||
        "No minimum licence, spend or volume commitment extracted."
      }
      type="commitment"
    />


    <EvidenceBlock
      title="Refund Clause"
      value={
        contract.refund_clause
        ||
        "No refund or non-refundable payment clause extracted."
      }
      type="refund"
    />

  </div>

</div>


{/* PAYMENT TERMS */}

<div className="mt-8 border-t border-slate-100 pt-7">

  <EvidenceBlock
    title="Payment Terms"
    value={
      contract.payment_terms
      ||
      "No payment terms extracted."
    }
    type="payment"
  />

</div>

</section>


          {/* METADATA */}

          <section className="renewai-card p-6 sm:p-7">

            <p className="renewai-eyebrow">
              System
            </p>


            <h2 className="mt-2 text-xl font-bold text-slate-950">
              Analysis Metadata
            </h2>


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


/* =========================================================
   COMPONENTS
   ========================================================= */


function DecisionStatusBadge({
  status,
}: {
  status: string;
}) {

  const label =
    status === "decision_made"
      ? "Decision made"
      : status === "completed"
      ? "Completed"
      : "Under review";


  const classes =
    status === "completed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "decision_made"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-amber-200 bg-amber-50 text-amber-700";


  return (

    <span
      className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-bold ${classes}`}
    >
      {label}
    </span>
  );
}


function AIInsightList({
  eyebrow,
  title,
  items,
  emptyText,
  flagged = false,
}: {
  eyebrow: string;
  title: string;
  items: string[];
  emptyText: string;
  flagged?: boolean;
}) {

  return (

    <div className="p-6 sm:p-7">

      <p
        className={
          flagged
            ? "text-xs font-bold uppercase tracking-[0.16em] text-amber-700"
            : "text-xs font-bold uppercase tracking-[0.16em] text-slate-500"
        }
      >
        {eyebrow}
      </p>


      <h3 className="mt-2 text-lg font-bold text-slate-950">
        {title}
      </h3>


      {
        items.length > 0
          ? (

            <div className="mt-5 space-y-3">

              {
                items.map(
                  (
                    item,
                    index
                  ) => (

                    <div
                      key={`${item}-${index}`}
                      className={
                        flagged
                          ? "flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4"
                          : "flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                      }
                    >

                      <div
                        className={
                          flagged
                            ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500"
                            : "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500"
                        }
                      />


                      <p
                        className={
                          flagged
                            ? "text-sm leading-6 text-amber-900"
                            : "text-sm leading-6 text-slate-700"
                        }
                      >
                        {item}
                      </p>

                    </div>

                  )
                )
              }

            </div>

          )
          : (

            <p className="mt-4 text-sm leading-6 text-slate-500">
              {emptyText}
            </p>

          )
      }

    </div>
  );
}


function DarkMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (

    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">

      <p className="text-xs font-medium text-slate-400">
        {label}
      </p>


      <p className="mt-2 text-lg font-bold !text-white">
        {value}
      </p>

    </div>
  );
}


function Panel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {

  return (

    <div className="renewai-card p-6 sm:p-7">

      <p className="renewai-eyebrow">
        {eyebrow}
      </p>


      <h2 className="mt-2 text-xl font-bold text-slate-950">
        {title}
      </h2>


      <div className="mt-6 space-y-5">
        {children}
      </div>

    </div>
  );
}


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
            ? "text-sm font-semibold text-red-700"
            : "text-sm font-semibold text-slate-600"
        }
      >
        {label}
      </p>


      <p
        className={
          urgent
            ? "mt-2 text-lg font-bold text-red-950"
            : "mt-2 text-lg font-bold text-slate-950"
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


function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (

    <div className="flex items-start justify-between gap-6 border-b border-slate-100 pb-4 last:border-0 last:pb-0">

      <span className="text-sm font-medium text-slate-500">
        {label}
      </span>


      <span className="max-w-sm break-words text-right text-sm font-bold text-slate-800">
        {value}
      </span>

    </div>
  );
}


function EvidenceBlock({
  title,
  value,
  type,
}: {
  title: string;
  value: string;
  type:
    | "renewal"
    | "termination"
    | "pricing"
    | "commitment"
    | "refund"
    | "payment";
}) {

  const styles = {
    renewal: {
      badge:
        "border-blue-200 bg-blue-50 text-blue-700",

      dot:
        "bg-blue-500",
    },

    termination: {
      badge:
        "border-slate-200 bg-slate-100 text-slate-700",

      dot:
        "bg-slate-500",
    },

    pricing: {
      badge:
        "border-violet-200 bg-violet-50 text-violet-700",

      dot:
        "bg-violet-500",
    },

    commitment: {
      badge:
        "border-amber-200 bg-amber-50 text-amber-700",

      dot:
        "bg-amber-500",
    },

    refund: {
      badge:
        "border-orange-200 bg-orange-50 text-orange-700",

      dot:
        "bg-orange-500",
    },

    payment: {
      badge:
        "border-emerald-200 bg-emerald-50 text-emerald-700",

      dot:
        "bg-emerald-500",
    },
  };


  const style =
    styles[type];


  return (

    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">

      <div className="flex items-center justify-between gap-3">

        <h3 className="font-bold text-slate-950">
          {title}
        </h3>


        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${style.badge}`}
        >

          <span
            className={`h-1.5 w-1.5 rounded-full ${style.dot}`}
          />

          Extracted

        </span>

      </div>


      <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">
        {value}
      </p>

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

    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">

      <h3 className="font-bold text-slate-950">
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

    <div className="flex flex-col justify-between gap-5 px-6 py-5 transition hover:bg-slate-50 sm:flex-row sm:items-center">

      <div className="flex items-start gap-4">

        <div
          className={
            isSent
              ? "mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700"
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

            <h3 className="font-bold text-slate-950">
              {
                formatReminderType(
                  reminder.reminder_type
                )
              }
            </h3>


            {
              isNext
              &&
              !isSent
              &&
              (

                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                  Next
                </span>

              )
            }


            {
              isSent
              &&
              (

                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                  Email sent
                </span>

              )
            }


            {
              !isSent
              &&
              isPast
              &&
              (

                <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
                  Overdue
                </span>

              )
            }


            {
              !isSent
              &&
              isToday
              &&
              (

                <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700">
                  Due today
                </span>

              )
            }

          </div>


          <p className="mt-1 text-sm text-slate-500">
            Scheduled for{" "}
            {
              formatDate(
                reminder.remind_on
              )
            }
          </p>

        </div>

      </div>


      <div className="sm:text-right">

        <p className="text-sm font-bold text-slate-800">
          {
            isSent
              ? "Delivered"
              : "Pending"
          }
        </p>


        <p className="mt-1 text-xs text-slate-500">

          {
            isSent
            &&
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


/* =========================================================
   HELPERS
   ========================================================= */


function parseDate(
  value: string | null
) {

  if (
    !value
  ) {

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

  if (
    !value
  ) {

    return "Not found";
  }


  const date =
    parseDate(
      value
    );


  if (
    !date
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


  if (
    !date
  ) {

    return "";
  }


  const today =
    startOfToday();


  const difference =
    Math.round(
      (
        date.getTime()
        -
        today.getTime()
      )
      /
      (
        1000
        *
        60
        *
        60
        *
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


  return (
    `${days}-day renewal alert`
  );
}


function riskClasses(
  risk: string | null
) {

  switch (
    risk
  ) {

    case "critical":

      return (
        "bg-red-50 "
        +
        "text-red-700 "
        +
        "border-red-200"
      );


    case "urgent":

      return (
        "bg-orange-50 "
        +
        "text-orange-700 "
        +
        "border-orange-200"
      );


    case "attention":

      return (
        "bg-amber-50 "
        +
        "text-amber-700 "
        +
        "border-amber-200"
      );


    case "safe":

      return (
        "bg-emerald-50 "
        +
        "text-emerald-700 "
        +
        "border-emerald-200"
      );


    default:

      return (
        "bg-slate-100 "
        +
        "text-slate-600 "
        +
        "border-slate-200"
      );
  }
}


function recommendationHeading(
  risk: string | null,
  days: number | null
) {

  if (
    days !== null
    &&
    days < 0
  ) {

    return (
      "Cancellation deadline has passed"
    );
  }


  switch (
    risk
  ) {

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


function formatHumanDecision(
  decision: string | null
) {

  switch (
    decision
  ) {

    case "renew":
      return "Renew";

    case "renegotiate":
      return "Renegotiate";

    case "cancel":
      return "Cancel";

    default:
      return "Undecided";
  }
}


function decisionActionClasses(
  action: string | null
) {

  switch (
    action
  ) {

    case "renegotiate":
      return "border-violet-200 bg-violet-50 text-violet-700";

    case "consider_cancellation":
      return "border-red-200 bg-red-50 text-red-700";

    case "review":
      return "border-amber-200 bg-amber-50 text-amber-700";

    case "monitor":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";

    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}


function formatAIAction(
  action: string | null
) {

  switch (
    action
  ) {

    case "monitor":

      return "Continue monitoring";


    case "review":

      return "Review before renewal";


    case "renegotiate":

      return "Consider renegotiation";


    case "consider_cancellation":

      return "Evaluate cancellation options";


    default:

      return "AI renewal assessment";
  }
}


function formatConfidence(
  confidence: number | null
) {

  if (
    confidence === null
    ||
    Number.isNaN(
      confidence
    )
  ) {

    return "Not available";
  }


  const normalized =
    Math.max(
      0,
      Math.min(
        1,
        confidence
      )
    );


  return `${Math.round(
    normalized * 100
  )}%`;
}