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

import {
  useRouter,
} from "next/navigation";

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

  contracts?:
    ReminderContract | null;
};


type ContractsResponse = {
  contracts: Contract[];
  count: number;
};


type RemindersResponse = {
  reminders: Reminder[];
  count: number;
};


type MeResponse = {
  user: {
    id: string;
    email: string | null;
  };

  organization: {
    id: string;
    name: string;
    role: string;
    created_at: string;
  };
};


export default function DashboardPage() {

  const router =
    useRouter();


  const [
    contracts,
    setContracts,
  ] =
    useState<Contract[]>([]);


  const [
    reminders,
    setReminders,
  ] =
    useState<Reminder[]>([]);


  const [
    account,
    setAccount,
  ] =
    useState<MeResponse | null>(
      null
    );


  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );


  const [
    error,
    setError,
  ] =
    useState(
      ""
    );


  const loadDashboard =
    useCallback(
      async () => {

        setLoading(
          true
        );

        setError(
          ""
        );


        try {

          const [
            contractsResponse,
            remindersResponse,
            meResponse,
          ] =
            await Promise.all([
              authFetch(
                "/contracts"
              ),

              authFetch(
                "/reminders"
              ),

              authFetch(
                "/me"
              ),
            ]);


          if (
            contractsResponse.status === 401
            ||
            remindersResponse.status === 401
            ||
            meResponse.status === 401
          ) {

            router.replace(
              "/login"
            );

            return;
          }


          if (
            contractsResponse.status === 403
            ||
            remindersResponse.status === 403
            ||
            meResponse.status === 403
          ) {

            router.replace(
              "/onboarding"
            );

            return;
          }


          const [
            contractsData,
            remindersData,
            meData,
          ] =
            await Promise.all([
              contractsResponse.json(),
              remindersResponse.json(),
              meResponse.json(),
            ]);


          if (
            !contractsResponse.ok
          ) {

            throw new Error(
              typeof contractsData.detail ===
              "string"

                ? contractsData.detail

                : "Could not load contracts."
            );
          }


          if (
            !remindersResponse.ok
          ) {

            throw new Error(
              typeof remindersData.detail ===
              "string"

                ? remindersData.detail

                : "Could not load reminders."
            );
          }


          if (
            !meResponse.ok
          ) {

            throw new Error(
              typeof meData.detail ===
              "string"

                ? meData.detail

                : "Could not load workspace."
            );
          }


          const typedContracts =
            contractsData as ContractsResponse;


          const typedReminders =
            remindersData as RemindersResponse;


          setContracts(
            typedContracts.contracts
            ||
            []
          );


          setReminders(
            typedReminders.reminders
            ||
            []
          );


          setAccount(
            meData as MeResponse
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


          setError(
            err instanceof Error

              ? err.message

              : "Could not load dashboard."
          );


        } finally {

          setLoading(
            false
          );
        }
      },

      [
        router,
      ]
    );


  useEffect(
    () => {

      loadDashboard();

    },
    [
      loadDashboard,
    ]
  );


  const totalPortfolioValue =
    useMemo(
      () => {

        return contracts.reduce(
          (
            total,
            contract
          ) =>
            total
            +
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


  const riskContracts =
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
        );

      },
      [
        contracts,
      ]
    );


  const autoRenewingContracts =
    useMemo(
      () => {

        return contracts.filter(
          (
            contract
          ) =>
            contract.auto_renewal ===
            true
        );

      },
      [
        contracts,
      ]
    );


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


  const dueReminders =
    useMemo(
      () => {

        const today =
          startOfToday();


        return pendingReminders.filter(
          (
            reminder
          ) => {

            const reminderDate =
              parseDate(
                reminder.remind_on
              );


            if (
              !reminderDate
            ) {

              return false;
            }


            return (
              reminderDate.getTime()
              <=
              today.getTime()
            );
          }
        );

      },
      [
        pendingReminders,
      ]
    );


  const upcomingReminders =
    useMemo(
      () => {

        const today =
          startOfToday();


        return pendingReminders
          .filter(
            (
              reminder
            ) => {

              const reminderDate =
                parseDate(
                  reminder.remind_on
                );


              if (
                !reminderDate
              ) {

                return false;
              }


              return (
                reminderDate.getTime()
                >
                today.getTime()
              );
            }
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

      },
      [
        pendingReminders,
      ]
    );


  const recentContracts =
    useMemo(
      () => {

        return [
          ...contracts,
        ]
          .sort(
            (
              a,
              b
            ) =>
              new Date(
                b.created_at
              ).getTime()
              -
              new Date(
                a.created_at
              ).getTime()
          )
          .slice(
            0,
            5
          );

      },
      [
        contracts,
      ]
    );


  const upcomingDeadlines =
    useMemo(
      () => {

        return [
          ...contracts,
        ]
          .filter(
            (
              contract
            ) =>
              contract
                .days_until_cancellation_deadline
              !==
              null
          )
          .sort(
            (
              a,
              b
            ) =>
              (
                a.days_until_cancellation_deadline
                ??
                Number.MAX_SAFE_INTEGER
              )
              -
              (
                b.days_until_cancellation_deadline
                ??
                Number.MAX_SAFE_INTEGER
              )
          )
          .slice(
            0,
            5
          );

      },
      [
        contracts,
      ]
    );


  const renewalIntelligence =
    useMemo(
      () => {

        return contracts.reduce(
          (
            summary,
            contract
          ) => {

            const value =
              contract.contract_value
              ||
              0;


            const status =
              contract.renewal_status
              ||
              "under_review";


            const decision =
              contract.renewal_decision
              ||
              "undecided";


            if (
              status ===
              "under_review"
            ) {

              summary.underReview += 1;
              summary.underReviewValue += value;
            }


            if (
              decision !==
              "undecided"
            ) {

              summary.decisionsMade += 1;
            }


            if (
              contract.ai_action ===
              "renegotiate"
            ) {

              summary.aiRenegotiate += 1;
            }


            const days =
              contract
                .days_until_cancellation_deadline;


            if (
              days !== null
              &&
              days >= 0
              &&
              days <= 120
            ) {

              summary.upcomingExposure += value;
              summary.upcomingExposureCount += 1;
            }


            return summary;
          },
          {
            underReview: 0,
            underReviewValue: 0,
            decisionsMade: 0,
            aiRenegotiate: 0,
            upcomingExposure: 0,
            upcomingExposureCount: 0,
          }
        );

      },
      [
        contracts,
      ]
    );


  const workspaceName =
    account?.organization.name
    ||
    "Your workspace";


  return (

    <AuthGuard>

      <main
        className="
          min-h-screen
          bg-[#f6f8fb]
          text-slate-950
        "
      >

        <AppNavbar />


        <div
          className="
            mx-auto
            max-w-7xl
            px-5
            pb-16
            pt-8
            sm:px-6
            lg:px-8
            lg:pt-10
          "
        >

          {/* ==================================================
              HEADER
              ================================================== */}

          <header
            className="
              mb-8
              flex
              flex-col
              justify-between
              gap-6
              lg:flex-row
              lg:items-end
            "
          >

            <div>

              <p
                className="
                  renewai-eyebrow
                "
              >
                Workspace overview
              </p>


              <h1
                className="
                  mt-3
                  text-4xl
                  font-bold
                  tracking-[-0.04em]
                  text-slate-950
                  sm:text-5xl
                "
              >
                Dashboard
              </h1>


              <p
                className="
                  mt-3
                  max-w-2xl
                  text-[15px]
                  leading-6
                  text-slate-600
                "
              >
                Monitor renewal exposure, upcoming
                deadlines, and the contracts that need
                attention across{" "}
                <span
                  className="
                    font-semibold
                    text-slate-800
                  "
                >
                  {workspaceName}
                </span>.
              </p>

            </div>


            <div
              className="
                flex
                flex-wrap
                gap-3
              "
            >

              <Link
                href="/contracts"
                className="
                  renewai-button-secondary
                "
              >
                View contracts
              </Link>


              <Link
                href="/analyze"
                className="
                  renewai-button-primary
                "
              >
                <span
                  className="
                    text-base
                    leading-none
                  "
                >
                  +
                </span>

                Analyze contract
              </Link>

            </div>

          </header>


          {/* ==================================================
              ERROR
              ================================================== */}

          {error && (

            <div
              className="
                mb-8
                rounded-2xl
                border
                border-red-200
                bg-red-50
                p-5
                text-sm
                font-medium
                text-red-800
              "
            >
              {error}
            </div>

          )}


          {/* ==================================================
              LOADING
              ================================================== */}

          {loading && (

            <section
              className="
                renewai-card
                p-14
                text-center
              "
            >

              <div
                className="
                  mx-auto
                  mb-4
                  h-8
                  w-8
                  animate-spin
                  rounded-full
                  border-4
                  border-slate-200
                  border-t-slate-950
                "
              />


              <p
                className="
                  text-sm
                  font-medium
                  text-slate-600
                "
              >
                Loading your RenewAI dashboard...
              </p>

            </section>

          )}


          {!loading
            &&
            !error
            &&
            (

              <>

                {/* ==================================================
                    HERO STATUS
                    ================================================== */}

                <section
                  className="
                    mb-6
                    overflow-hidden
                    rounded-3xl
                    border
                    border-slate-800
                    bg-slate-950
                    p-6
                    text-white
                    shadow-sm
                    sm:p-7
                    lg:p-8
                  "
                >

                  <div
                    className="
                      flex
                      flex-col
                      justify-between
                      gap-8
                      lg:flex-row
                      lg:items-center
                    "
                  >

                    <div
                      className="
                        max-w-2xl
                      "
                    >

                      <div
                        className="
                          inline-flex
                          items-center
                          gap-2
                          rounded-full
                          border
                          border-white/10
                          bg-white/[0.06]
                          px-3
                          py-1.5
                          text-xs
                          font-semibold
                          text-slate-300
                        "
                      >

                        <span
                          className={
                            dueReminders.length > 0
                              ? `
                                h-2
                                w-2
                                rounded-full
                                bg-orange-400
                              `
                              : `
                                h-2
                                w-2
                                rounded-full
                                bg-emerald-400
                              `
                          }
                        />


                        {dueReminders.length > 0
                          ? "Action required"
                          : "Portfolio monitored"
                        }

                      </div>


                      <h2
                        className="
                          mt-5
                          max-w-2xl
                          text-2xl
                          font-bold
                          leading-tight
                          tracking-[-0.03em]
                          !text-white
                          sm:text-3xl
                        "
                      >

                        {contracts.length === 0
                          ? "Your renewal workspace is ready."
                          : dueReminders.length > 0
                          ? `${dueReminders.length} renewal alert${
                              dueReminders.length === 1
                                ? ""
                                : "s"
                            } need your attention.`
                          : "Your contract portfolio is currently under control."
                        }

                      </h2>


                      <p
                        className="
                          mt-3
                          max-w-xl
                          text-sm
                          leading-6
                          text-slate-300
                        "
                      >

                        {contracts.length === 0
                          ? "Analyze your first contract to start tracking renewal dates and cancellation deadlines."
                          : dueReminders.length > 0
                          ? "Review the alerts that have reached or passed their scheduled action date."
                          : `${contracts.length} contract${
                              contracts.length === 1
                                ? ""
                                : "s"
                            } are being tracked with ${upcomingReminders.length} upcoming reminder${
                              upcomingReminders.length === 1
                                ? ""
                                : "s"
                            }.`
                        }

                      </p>

                    </div>


                    <div
                      className="
                        grid
                        w-full
                        gap-3
                        sm:grid-cols-2
                        lg:w-auto
                        lg:min-w-[330px]
                      "
                    >

                      <HeroMetric
                        label="Portfolio value"
                        value={
                          formatCurrency(
                            totalPortfolioValue,
                            "INR"
                          )
                        }
                      />


                      <HeroMetric
                        label="Upcoming alerts"
                        value={
                          upcomingReminders.length
                            .toString()
                        }
                      />

                    </div>

                  </div>

                </section>


                {/* ==================================================
                    KPI GRID
                    ================================================== */}

                <section
                  className="
                    mb-8
                    grid
                    gap-4
                    sm:grid-cols-2
                    lg:grid-cols-5
                  "
                >

                  <StatCard
                    label="Contracts"
                    value={
                      contracts.length
                        .toString()
                    }
                    description="Active portfolio"
                  />


                  <StatCard
                    label="Portfolio Value"
                    value={
                      formatCurrency(
                        totalPortfolioValue,
                        "INR"
                      )
                    }
                    description="Tracked value"
                  />


                  <StatCard
                    label="Need Attention"
                    value={
                      riskContracts.length
                        .toString()
                    }
                    description="Risk flagged"
                    urgent={
                      riskContracts.length > 0
                    }
                  />


                  <StatCard
                    label="Auto Renewing"
                    value={
                      autoRenewingContracts.length
                        .toString()
                    }
                    description="Automatic renewals"
                  />


                  <StatCard
                    label="Due Alerts"
                    value={
                      dueReminders.length
                        .toString()
                    }
                    description="Action required"
                    urgent={
                      dueReminders.length > 0
                    }
                  />

                </section>


                {/* ==================================================
                    PORTFOLIO INTELLIGENCE
                    ================================================== */}

                <section
                  className="
                    mb-8
                    overflow-hidden
                    rounded-3xl
                    border
                    border-slate-200
                    bg-white
                    shadow-sm
                  "
                >

                  <div
                    className="
                      flex
                      flex-col
                      justify-between
                      gap-4
                      border-b
                      border-slate-200
                      px-6
                      py-6
                      lg:flex-row
                      lg:items-end
                    "
                  >

                    <div>

                      <p className="renewai-eyebrow">
                        Portfolio intelligence
                      </p>


                      <h2
                        className="
                          mt-2
                          text-2xl
                          font-bold
                          tracking-[-0.025em]
                          text-slate-950
                        "
                      >
                        Renewal decision overview
                      </h2>


                      <p
                        className="
                          mt-2
                          max-w-2xl
                          text-sm
                          leading-6
                          text-slate-600
                        "
                      >
                        A workspace-level view of human renewal
                        decisions, AI recommendations, and commercial
                        value still moving through review.
                      </p>

                    </div>


                    <Link
                      href="/contracts"
                      className="
                        shrink-0
                        text-sm
                        font-semibold
                        text-blue-700
                        transition
                        hover:text-blue-800
                      "
                    >
                      Open renewal work queue →
                    </Link>

                  </div>


                  <div
                    className="
                      grid
                      sm:grid-cols-2
                      xl:grid-cols-5
                    "
                  >

                    <IntelligenceMetric
                      label="Under review"
                      value={
                        renewalIntelligence
                          .underReview
                          .toString()
                      }
                      description="Contracts still in active review"
                    />


                    <IntelligenceMetric
                      label="Value under review"
                      value={
                        formatCurrency(
                          renewalIntelligence
                            .underReviewValue,
                          "INR"
                        )
                      }
                      description="Commercial value awaiting completion"
                    />


                    <IntelligenceMetric
                      label="AI: Renegotiate"
                      value={
                        renewalIntelligence
                          .aiRenegotiate
                          .toString()
                      }
                      description="Contracts flagged for better terms"
                    />


                    <IntelligenceMetric
                      label="Human decisions"
                      value={
                        renewalIntelligence
                          .decisionsMade
                          .toString()
                      }
                      description={`Of ${contracts.length} tracked contracts`}
                    />


                    <IntelligenceMetric
                      label="120-day exposure"
                      value={
                        formatCurrency(
                          renewalIntelligence
                            .upcomingExposure,
                          "INR"
                        )
                      }
                      description={
                        renewalIntelligence
                          .upcomingExposureCount === 0
                          ? "No cancellation windows within 120 days"
                          : `${renewalIntelligence.upcomingExposureCount} contract${
                              renewalIntelligence.upcomingExposureCount === 1
                                ? ""
                                : "s"
                            } within cancellation window`
                      }
                      urgent={
                        renewalIntelligence
                          .upcomingExposureCount > 0
                      }
                    />

                  </div>

                </section>


                {/* ==================================================
                    QUICK ACTIONS
                    ================================================== */}

                <section
                  className="
                    mb-8
                  "
                >

                  <div
                    className="
                      mb-4
                      flex
                      flex-col
                      justify-between
                      gap-3
                      sm:flex-row
                      sm:items-end
                    "
                  >

                    <div>

                      <p
                        className="
                          renewai-eyebrow
                        "
                      >
                        Quick actions
                      </p>


                      <h2
                        className="
                          mt-2
                          text-2xl
                          font-bold
                          tracking-[-0.025em]
                          text-slate-950
                        "
                      >
                        Keep your renewal portfolio moving
                      </h2>

                    </div>

                  </div>


                  <div
                    className="
                      grid
                      gap-4
                      md:grid-cols-3
                    "
                  >

                    <QuickAction
                      icon="01"
                      title="Analyze Contract"
                      description="Upload a PDF, review extracted terms, and add it to your renewal portfolio."
                      href="/analyze"
                      action="Upload contract"
                    />


                    <QuickAction
                      icon="02"
                      title="Review Portfolio"
                      description={`${contracts.length} active contract${
                        contracts.length === 1
                          ? ""
                          : "s"
                      } currently tracked across this workspace.`}
                      href="/contracts"
                      action="Open contracts"
                    />


                    <QuickAction
                      icon="03"
                      title="Renewal Alerts"
                      description={
                        dueReminders.length > 0
                          ? `${dueReminders.length} alert${
                              dueReminders.length === 1
                                ? ""
                                : "s"
                            } currently require attention.`
                          : `${upcomingReminders.length} upcoming reminder${
                              upcomingReminders.length === 1
                                ? ""
                                : "s"
                            } being monitored.`
                      }
                      href="/reminders"
                      action="View alerts"
                    />

                  </div>

                </section>


                {/* ==================================================
                    MAIN GRID
                    ================================================== */}

                <section
                  className="
                    mb-8
                    grid
                    gap-6
                    lg:grid-cols-2
                  "
                >

                  {/* DEADLINES */}

                  <DashboardPanel
                    eyebrow="Renewal risk"
                    title="Upcoming cancellation deadlines"
                    href="/contracts"
                    action="View all"
                  >

                    {upcomingDeadlines.length === 0
                      ? (

                        <EmptyState
                          title="No deadlines yet"
                          description="Analyze a contract to start tracking cancellation windows."
                        />

                      )
                      : (

                        <div
                          className="
                            divide-y
                            divide-slate-100
                          "
                        >

                          {upcomingDeadlines.map(
                            (
                              contract
                            ) => (

                              <ContractDeadlineRow
                                key={
                                  contract.id
                                }
                                contract={
                                  contract
                                }
                              />

                            )
                          )}

                        </div>

                      )
                    }

                  </DashboardPanel>


                  {/* REMINDERS */}

                  <DashboardPanel
                    eyebrow="Automation"
                    title="Next renewal alerts"
                    href="/reminders"
                    action="View all"
                  >

                    {upcomingReminders.length === 0
                      ? (

                        <EmptyState
                          title="No upcoming alerts"
                          description="RenewAI will show future renewal reminders here."
                        />

                      )
                      : (

                        <div
                          className="
                            divide-y
                            divide-slate-100
                          "
                        >

                          {upcomingReminders
                            .slice(
                              0,
                              5
                            )
                            .map(
                              (
                                reminder
                              ) => (

                                <ReminderRow
                                  key={
                                    reminder.id
                                  }
                                  reminder={
                                    reminder
                                  }
                                />

                              )
                            )
                          }

                        </div>

                      )
                    }

                  </DashboardPanel>

                </section>


                {/* ==================================================
                    RECENT CONTRACTS
                    ================================================== */}

                <section
                  className="
                    renewai-card
                    overflow-hidden
                  "
                >

                  <div
                    className="
                      flex
                      flex-col
                      justify-between
                      gap-4
                      border-b
                      border-slate-200
                      px-6
                      py-5
                      sm:flex-row
                      sm:items-center
                    "
                  >

                    <div>

                      <p
                        className="
                          renewai-eyebrow
                        "
                      >
                        Recent activity
                      </p>


                      <h2
                        className="
                          mt-2
                          text-xl
                          font-bold
                          text-slate-950
                        "
                      >
                        Recently analyzed contracts
                      </h2>

                    </div>


                    <Link
                      href="/contracts"
                      className="
                        text-sm
                        font-semibold
                        text-blue-700
                        transition
                        hover:text-blue-800
                      "
                    >
                      Open portfolio →
                    </Link>

                  </div>


                  {recentContracts.length === 0
                    ? (

                      <div
                        className="
                          px-6
                          py-14
                          text-center
                        "
                      >

                        <div
                          className="
                            mx-auto
                            flex
                            h-12
                            w-12
                            items-center
                            justify-center
                            rounded-2xl
                            bg-slate-100
                            text-sm
                            font-bold
                            text-slate-700
                          "
                        >
                          +
                        </div>


                        <h3
                          className="
                            mt-4
                            font-semibold
                            text-slate-950
                          "
                        >
                          Your workspace is empty
                        </h3>


                        <p
                          className="
                            mx-auto
                            mt-2
                            max-w-sm
                            text-sm
                            leading-6
                            text-slate-600
                          "
                        >
                          Analyze your first contract to
                          start building your renewal
                          portfolio.
                        </p>


                        <Link
                          href="/analyze"
                          className="
                            renewai-button-primary
                            mt-5
                          "
                        >
                          Analyze first contract
                        </Link>

                      </div>

                    )
                    : (

                      <div
                        className="
                          overflow-x-auto
                        "
                      >

                        <table
                          className="
                            w-full
                            min-w-[760px]
                            text-left
                          "
                        >

                          <thead
                            className="
                              bg-slate-50
                              text-xs
                              uppercase
                              tracking-[0.08em]
                              text-slate-500
                            "
                          >

                            <tr>

                              <th
                                className="
                                  px-6
                                  py-4
                                  font-semibold
                                "
                              >
                                Contract
                              </th>


                              <th
                                className="
                                  px-6
                                  py-4
                                  font-semibold
                                "
                              >
                                Value
                              </th>


                              <th
                                className="
                                  px-6
                                  py-4
                                  font-semibold
                                "
                              >
                                Renewal
                              </th>


                              <th
                                className="
                                  px-6
                                  py-4
                                  font-semibold
                                "
                              >
                                Risk
                              </th>


                              <th
                                className="
                                  px-6
                                  py-4
                                  text-right
                                  font-semibold
                                "
                              >
                                Action
                              </th>

                            </tr>

                          </thead>


                          <tbody>

                            {recentContracts.map(
                              (
                                contract
                              ) => (

                                <tr
                                  key={
                                    contract.id
                                  }
                                  className="
                                    border-t
                                    border-slate-100
                                    transition
                                    hover:bg-slate-50/70
                                  "
                                >

                                  <td
                                    className="
                                      px-6
                                      py-5
                                    "
                                  >

                                    <div
                                      className="
                                        font-semibold
                                        text-slate-950
                                      "
                                    >
                                      {contract.vendor_name
                                        ||
                                        "Unknown Vendor"
                                      }
                                    </div>


                                    <div
                                      className="
                                        mt-1
                                        max-w-xs
                                        truncate
                                        text-sm
                                        text-slate-500
                                      "
                                    >
                                      {contract.contract_title
                                        ||
                                        contract.filename
                                      }
                                    </div>

                                  </td>


                                  <td
                                    className="
                                      px-6
                                      py-5
                                      font-semibold
                                      text-slate-800
                                    "
                                  >
                                    {formatCurrency(
                                      contract.contract_value,
                                      contract.currency
                                    )}
                                  </td>


                                  <td
                                    className="
                                      px-6
                                      py-5
                                      text-sm
                                      font-medium
                                      text-slate-700
                                    "
                                  >
                                    {formatDate(
                                      contract
                                        .effective_renewal_date
                                    )}
                                  </td>


                                  <td
                                    className="
                                      px-6
                                      py-5
                                    "
                                  >

                                    <span
                                      className={`
                                        inline-flex
                                        rounded-full
                                        border
                                        px-3
                                        py-1
                                        text-xs
                                        font-bold
                                        uppercase
                                        tracking-wide
                                        ${riskClasses(
                                          contract.risk_level
                                        )}
                                      `}
                                    >
                                      {contract.risk_level
                                        ||
                                        "unknown"
                                      }
                                    </span>

                                  </td>


                                  <td
                                    className="
                                      px-6
                                      py-5
                                      text-right
                                    "
                                  >

                                    <Link
                                      href={
                                        `/contracts/${contract.id}`
                                      }
                                      className="
                                        inline-flex
                                        rounded-lg
                                        border
                                        border-slate-300
                                        bg-white
                                        px-3
                                        py-2
                                        text-xs
                                        font-semibold
                                        text-slate-800
                                        transition
                                        hover:border-slate-400
                                        hover:bg-slate-50
                                      "
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

                    )
                  }

                </section>


                {/* ==================================================
                    ACCOUNT FOOTER
                    ================================================== */}

                {account?.user.email && (

                  <div
                    className="
                      mt-5
                      flex
                      flex-col
                      justify-between
                      gap-2
                      rounded-2xl
                      border
                      border-slate-200
                      bg-white
                      px-5
                      py-4
                      text-sm
                      sm:flex-row
                      sm:items-center
                    "
                  >

                    <span
                      className="
                        text-slate-500
                      "
                    >
                      Signed in as
                    </span>


                    <span
                      className="
                        font-semibold
                        text-slate-800
                      "
                    >
                      {account.user.email}
                    </span>

                  </div>

                )}

              </>

            )
          }

        </div>

      </main>

    </AuthGuard>
  );
}


/* =========================================================
   COMPONENTS
   ========================================================= */


function HeroMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (

    <div
      className="
        rounded-2xl
        border
        border-white/10
        bg-white/[0.06]
        p-5
      "
    >

      <p
        className="
          text-xs
          font-medium
          text-slate-400
        "
      >
        {label}
      </p>


      <p
        className="
          mt-2
          text-xl
          font-bold
          !text-white
        "
      >
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
          ? `
            rounded-2xl
            border
            border-orange-200
            bg-orange-50
            p-5
            shadow-sm
          `
          : `
            rounded-2xl
            border
            border-slate-200
            bg-white
            p-5
            shadow-sm
          `
      }
    >

      <p
        className={
          urgent
            ? `
              text-sm
              font-semibold
              text-orange-800
            `
            : `
              text-sm
              font-semibold
              text-slate-600
            `
        }
      >
        {label}
      </p>


      <p
        className={
          urgent
            ? `
              mt-3
              text-2xl
              font-bold
              tracking-tight
              text-orange-950
            `
            : `
              mt-3
              text-2xl
              font-bold
              tracking-tight
              text-slate-950
            `
        }
      >
        {value}
      </p>


      <p
        className={
          urgent
            ? `
              mt-1
              text-xs
              text-orange-700
            `
            : `
              mt-1
              text-xs
              text-slate-500
            `
        }
      >
        {description}
      </p>

    </div>
  );
}


function IntelligenceMetric({
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
          ? `
            border-b
            border-orange-100
            bg-orange-50/60
            p-6
            sm:border-r
            xl:border-b-0
          `
          : `
            border-b
            border-slate-100
            bg-white
            p-6
            sm:border-r
            xl:border-b-0
          `
      }
    >

      <p
        className={
          urgent
            ? `
              text-xs
              font-bold
              uppercase
              tracking-[0.08em]
              text-orange-700
            `
            : `
              text-xs
              font-bold
              uppercase
              tracking-[0.08em]
              text-slate-500
            `
        }
      >
        {label}
      </p>


      <p
        className={
          urgent
            ? `
              mt-3
              text-2xl
              font-bold
              tracking-tight
              text-orange-950
            `
            : `
              mt-3
              text-2xl
              font-bold
              tracking-tight
              text-slate-950
            `
        }
      >
        {value}
      </p>


      <p
        className={
          urgent
            ? `
              mt-2
              text-xs
              leading-5
              text-orange-700
            `
            : `
              mt-2
              text-xs
              leading-5
              text-slate-500
            `
        }
      >
        {description}
      </p>

    </div>
  );
}


function QuickAction({
  icon,
  title,
  description,
  href,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  href: string;
  action: string;
}) {

  return (

    <Link
      href={
        href
      }
      className="
        group
        rounded-2xl
        border
        border-slate-200
        bg-white
        p-5
        shadow-sm
        transition
        hover:-translate-y-0.5
        hover:border-slate-300
        hover:shadow-md
      "
    >

      <div
        className="
          flex
          h-10
          w-10
          items-center
          justify-center
          rounded-xl
          bg-slate-950
          text-xs
          font-bold
          text-white
        "
      >
        {icon}
      </div>


      <h3
        className="
          mt-5
          font-bold
          text-slate-950
        "
      >
        {title}
      </h3>


      <p
        className="
          mt-2
          min-h-12
          text-sm
          leading-6
          text-slate-600
        "
      >
        {description}
      </p>


      <p
        className="
          mt-5
          text-sm
          font-semibold
          text-blue-700
        "
      >
        {action}

        <span
          className="
            ml-1
            inline-block
            transition-transform
            group-hover:translate-x-1
          "
        >
          →
        </span>

      </p>

    </Link>
  );
}


function DashboardPanel({
  eyebrow,
  title,
  href,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  href: string;
  action: string;
  children: React.ReactNode;
}) {

  return (

    <div
      className="
        renewai-card
        overflow-hidden
      "
    >

      <div
        className="
          flex
          items-center
          justify-between
          gap-4
          border-b
          border-slate-200
          px-6
          py-5
        "
      >

        <div>

          <p
            className="
              renewai-eyebrow
            "
          >
            {eyebrow}
          </p>


          <h2
            className="
              mt-2
              text-xl
              font-bold
              text-slate-950
            "
          >
            {title}
          </h2>

        </div>


        <Link
          href={
            href
          }
          className="
            shrink-0
            text-sm
            font-semibold
            text-blue-700
            transition
            hover:text-blue-800
          "
        >
          {action} →
        </Link>

      </div>


      {children}

    </div>
  );
}


function ContractDeadlineRow({
  contract,
}: {
  contract: Contract;
}) {

  const days =
    contract
      .days_until_cancellation_deadline;


  return (

    <Link
      href={
        `/contracts/${contract.id}`
      }
      className="
        flex
        items-center
        justify-between
        gap-5
        px-6
        py-5
        transition
        hover:bg-slate-50
      "
    >

      <div
        className="
          min-w-0
        "
      >

        <p
          className="
            font-semibold
            text-slate-950
          "
        >
          {contract.vendor_name
            ||
            "Unknown Vendor"
          }
        </p>


        <p
          className="
            mt-1
            truncate
            text-sm
            text-slate-500
          "
        >
          Cancel by{" "}
          {formatDate(
            contract.cancellation_deadline
          )}
        </p>

      </div>


      <span
        className={
          days !== null
          &&
          days <= 30

            ? `
              shrink-0
              rounded-full
              border
              border-red-200
              bg-red-50
              px-3
              py-1
              text-xs
              font-bold
              text-red-700
            `

            : `
              shrink-0
              rounded-full
              border
              border-slate-200
              bg-slate-100
              px-3
              py-1
              text-xs
              font-bold
              text-slate-600
            `
        }
      >
        {formatDaysRemaining(
          days
        )}
      </span>

    </Link>
  );
}


function ReminderRow({
  reminder,
}: {
  reminder: Reminder;
}) {

  const contract =
    reminder.contracts;


  return (

    <div
      className="
        flex
        items-center
        justify-between
        gap-5
        px-6
        py-5
      "
    >

      <div
        className="
          min-w-0
        "
      >

        <p
          className="
            font-semibold
            text-slate-950
          "
        >
          {contract?.vendor_name
            ||
            "Unknown Vendor"
          }
        </p>


        <p
          className="
            mt-1
            truncate
            text-sm
            text-slate-500
          "
        >
          {formatReminderType(
            reminder.reminder_type
          )}
        </p>

      </div>


      <div
        className="
          shrink-0
          text-right
        "
      >

        <p
          className="
            text-sm
            font-semibold
            text-slate-800
          "
        >
          {formatDate(
            reminder.remind_on
          )}
        </p>


        <p
          className="
            mt-1
            text-xs
            text-slate-500
          "
        >
          {getRelativeDate(
            reminder.remind_on
          )}
        </p>

      </div>

    </div>
  );
}


function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {

  return (

    <div
      className="
        px-8
        py-12
        text-center
      "
    >

      <div
        className="
          mx-auto
          flex
          h-10
          w-10
          items-center
          justify-center
          rounded-xl
          bg-slate-100
          text-sm
          font-bold
          text-slate-500
        "
      >
        —
      </div>


      <h3
        className="
          mt-4
          font-semibold
          text-slate-950
        "
      >
        {title}
      </h3>


      <p
        className="
          mx-auto
          mt-2
          max-w-xs
          text-sm
          leading-6
          text-slate-500
        "
      >
        {description}
      </p>

    </div>
  );
}


/* =========================================================
   HELPERS
   ========================================================= */


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


function formatDate(
  value: string | null
) {

  if (
    !value
  ) {

    return "—";
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


function formatDaysRemaining(
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

    return (
      `${Math.abs(days)}d overdue`
    );
  }


  if (
    days === 0
  ) {

    return "Today";
  }


  return `${days}d left`;
}


function riskClasses(
  risk: string | null
) {

  switch (
    risk
  ) {

    case "critical":

      return (
        "border-red-200 "
        +
        "bg-red-50 "
        +
        "text-red-700"
      );


    case "urgent":

      return (
        "border-orange-200 "
        +
        "bg-orange-50 "
        +
        "text-orange-700"
      );


    case "attention":

      return (
        "border-yellow-200 "
        +
        "bg-yellow-50 "
        +
        "text-yellow-800"
      );


    case "safe":

      return (
        "border-green-200 "
        +
        "bg-green-50 "
        +
        "text-green-700"
      );


    default:

      return (
        "border-slate-200 "
        +
        "bg-slate-100 "
        +
        "text-slate-600"
      );
  }
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


function getRelativeDate(
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

    return (
      `${Math.abs(difference)} days ago`
    );
  }


  return (
    `In ${difference} days`
  );
}