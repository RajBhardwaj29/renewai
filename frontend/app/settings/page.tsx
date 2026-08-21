"use client";

import AuthGuard from "@/components/AuthGuard";

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import {
  authFetch,
} from "@/lib/authFetch";

import {
  supabase,
} from "@/lib/supabase";


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


export default function SettingsPage() {
  const router = useRouter();

  const [
    account,
    setAccount,
  ] = useState<MeResponse | null>(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    signingOut,
    setSigningOut,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");


  useEffect(() => {
    async function loadAccount() {
      try {
        const response =
          await authFetch("/me");


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
              : "Could not load account."
          );
        }


        setAccount(
          data as MeResponse
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
          "Could not load account settings."
        );


      } finally {
        setLoading(false);
      }
    }


    loadAccount();

  }, [router]);


  async function handleSignOut() {
    setSigningOut(true);
    setError("");


    try {
      const {
        error,
      } =
        await supabase.auth.signOut();


      if (error) {
        throw error;
      }


      router.replace("/login");
      router.refresh();


    } catch (err) {
      console.error(err);

      setError(
        "Could not sign out."
      );


    } finally {
      setSigningOut(false);
    }
  }


  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">

        <div className="text-center">

          <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-slate-950" />

          <p className="text-sm font-medium text-slate-600">
            Loading settings...
          </p>

        </div>

      </main>
    );
  }


  return (
    <AuthGuard>

      <main className="min-h-screen bg-slate-50 text-slate-950">

        <AppHeader />


        <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-14">


          {/* PAGE HEADER */}

          <div className="mb-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">

            <div>

              <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-600">
                Workspace Configuration
              </p>

              <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                Settings
              </h1>

              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                Manage your RenewAI account, workspace information,
                renewal monitoring and security.
              </p>

            </div>


            <div className="flex flex-wrap gap-3">

              <Link
                href="/contracts"
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:border-slate-400 hover:bg-slate-50"
              >
                View Contracts
              </Link>


              <Link
  href="/reminders"
  className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold !text-white transition hover:bg-slate-800"
>
  Renewal Alerts
</Link>

            </div>

          </div>


          {/* ERROR */}

          {error && (

            <div className="mb-7 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
              {error}
            </div>

          )}


          {/* WORKSPACE HERO */}

          <section className="mb-6 overflow-hidden rounded-[28px] bg-[#020817] p-8 text-white shadow-sm lg:p-10">

            <div className="grid gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">

              <div>

                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300">

                  <span className="h-2 w-2 rounded-full bg-emerald-400" />

                  Workspace active

                </div>

                <h2 className="max-w-2xl text-3xl font-bold tracking-tight !text-white">
                  {account?.organization.name || "RenewAI Workspace"}
                </h2>


                <p className="mt-3 max-w-xl text-sm leading-6 !text-slate-300">
  Your contract portfolio, renewal intelligence and
  reminder activity are connected to this workspace.
</p>

              </div>


              <div className="grid gap-4 sm:grid-cols-2">

                <DarkMetric
                  label="Workspace role"
                  value={
                    formatRole(
                      account?.organization.role
                    )
                  }
                />

                <DarkMetric
                  label="Reminder engine"
                  value="Automatic"
                />

              </div>

            </div>

          </section>


          {/* SUMMARY CARDS */}

          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

            <SummaryCard
              label="Account"
              value="Active"
              detail="Authenticated user"
            />

            <SummaryCard
              label="Workspace"
              value={
                account?.organization.name ||
                "Available"
              }
              detail="Current organization"
            />

            <SummaryCard
              label="Role"
              value={
                formatRole(
                  account?.organization.role
                )
              }
              detail="Workspace access"
            />

            <SummaryCard
              label="Renewal Alerts"
              value="Automatic"
              detail="Reminder monitoring"
            />

          </div>


          {/* ACCOUNT + WORKSPACE */}

          <div className="mb-6 grid gap-6 lg:grid-cols-2">


            {/* ACCOUNT */}

            <section className="rounded-[26px] border border-slate-200 bg-white shadow-sm">

              <div className="border-b border-slate-100 px-7 py-6">

                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-600">
                  Account
                </p>

                <h2 className="mt-2 text-xl font-bold text-slate-950">
                  User Profile
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Account information associated with your RenewAI login.
                </p>

              </div>


              <div className="px-7 py-2">

                <SettingRow
                  label="Email"
                  value={
                    account?.user.email ||
                    "Not available"
                  }
                />


                <SettingRow
                  label="Account status"
                  value="Active"
                />


                <SettingRow
                  label="User ID"
                  value={
                    account?.user.id ||
                    "Not available"
                  }
                  mono
                />

              </div>

            </section>


            {/* WORKSPACE */}

            <section className="rounded-[26px] border border-slate-200 bg-white shadow-sm">

              <div className="border-b border-slate-100 px-7 py-6">

                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-600">
                  Workspace
                </p>

                <h2 className="mt-2 text-xl font-bold text-slate-950">
                  Organization
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Workspace information used to separate your
                  organization&apos;s contract portfolio.
                </p>

              </div>


              <div className="px-7 py-2">

                <SettingRow
                  label="Workspace name"
                  value={
                    account?.organization.name ||
                    "Not available"
                  }
                />


                <SettingRow
                  label="Role"
                  value={
                    formatRole(
                      account?.organization.role
                    )
                  }
                />


                <SettingRow
                  label="Created"
                  value={
                    account?.organization.created_at
                      ? formatDateTime(
                          account.organization.created_at
                        )
                      : "Not available"
                  }
                />


                <SettingRow
                  label="Workspace ID"
                  value={
                    account?.organization.id ||
                    "Not available"
                  }
                  mono
                />

              </div>

            </section>

          </div>


          {/* REMINDER ENGINE */}

          <section className="mb-6 overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">

            <div className="flex flex-col justify-between gap-5 border-b border-slate-100 px-7 py-6 sm:flex-row sm:items-start">

              <div>

                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-600">
                  Automation
                </p>

                <h2 className="mt-2 text-xl font-bold text-slate-950">
                  Renewal Reminder Engine
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  RenewAI monitors upcoming cancellation deadlines
                  and schedules alerts before action is required.
                </p>

              </div>


              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">

                <span className="h-2 w-2 rounded-full bg-emerald-500" />

                Automatic

              </span>

            </div>


            <div className="p-7">

              <p className="mb-4 text-sm font-semibold text-slate-950">
                Default alert schedule
              </p>


              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

                <ReminderSetting
                  days="90"
                  label="Early review"
                />

                <ReminderSetting
                  days="60"
                  label="Notice window"
                />

                <ReminderSetting
                  days="30"
                  label="Action reminder"
                />

                <ReminderSetting
                  days="14"
                  label="Urgent review"
                />

                <ReminderSetting
                  days="7"
                  label="Final alert"
                />

              </div>


              <div className="mt-6 flex flex-col justify-between gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center">

                <div>

                  <p className="text-sm font-bold text-slate-950">
                    Email delivery
                  </p>

                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                    Development reminders are currently delivered
                    through Mailpit. Production email delivery can be
                    configured during deployment.
                  </p>

                </div>


                <div className="shrink-0">

                  <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">
                    Development
                  </span>

                </div>

              </div>

            </div>

          </section>


          {/* SECURITY */}

          <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">

            <div className="border-b border-slate-100 px-7 py-6">

              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-600">
                Security
              </p>

              <h2 className="mt-2 text-xl font-bold text-slate-950">
                Account Session
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Manage the authenticated session for this device.
              </p>

            </div>


            <div className="p-7">

              <div className="flex flex-col justify-between gap-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center">

                <div className="flex items-center gap-4">

                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-white">
                    {getInitial(
                      account?.user.email
                    )}
                  </div>


                  <div>

                    <div className="flex items-center gap-2">

                      <p className="font-bold text-slate-950">
                        Signed in
                      </p>

                      <span className="h-2 w-2 rounded-full bg-emerald-500" />

                    </div>


                    <p className="mt-1 text-sm text-slate-600">
                      {
                        account?.user.email ||
                        "Authenticated RenewAI user"
                      }
                    </p>

                  </div>

                </div>


                <button
                  onClick={
                    handleSignOut
                  }

                  disabled={
                    signingOut
                  }

                  className="w-fit rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-bold text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {
                    signingOut
                      ? "Signing out..."
                      : "Sign Out"
                  }
                </button>

              </div>

            </div>

          </section>


        </div>

      </main>

    </AuthGuard>
  );
}


/* =========================================================
   HEADER
   ========================================================= */

function AppHeader() {
  const pathname =
    usePathname();


  const navItems = [
    {
      label: "Dashboard",
      href: "/dashboard",
    },
    {
      label: "Contracts",
      href: "/contracts",
    },
    {
      label: "Alerts",
      href: "/reminders",
    },
    {
      label: "Settings",
      href: "/settings",
    },
  ];


  return (
    <header className="border-b border-slate-200 bg-white">

      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-6 px-6 py-4 lg:px-10">

        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-4"
        >

          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-base font-bold text-white shadow-sm">
            R
          </div>


          <div>

            <p className="text-base font-bold tracking-[0.18em] text-slate-950">
              RENEWAI
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Contract renewal intelligence
            </p>

          </div>

        </Link>


        <nav className="hidden items-center gap-2 md:flex">

          {navItems.map(
            (item) => {

              const active =
                pathname === item.href;


              return (
                <Link
                  key={
                    item.href
                  }

                  href={
                    item.href
                  }

                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    active
                      ? "bg-slate-100 text-slate-950"
                      : "text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            }
          )}


          <Link
            href="/analyze"
            className="ml-3 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            + Analyze Contract
          </Link>

        </nav>


        <Link
          href="/analyze"
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white md:hidden"
        >
          + Analyze
        </Link>

      </div>

    </header>
  );
}


/* =========================================================
   COMPONENTS
   ========================================================= */

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

      <p className="mt-2 break-words text-xl font-bold text-white">
        {value}
      </p>

    </div>
  );
}


function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

      <p className="text-sm font-semibold text-slate-600">
        {label}
      </p>

      <p className="mt-2 truncate text-xl font-bold text-slate-950">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {detail}
      </p>

    </div>
  );
}


function SettingRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col justify-between gap-2 border-b border-slate-100 py-5 last:border-0 sm:flex-row sm:items-start">

      <span className="text-sm font-medium text-slate-600">
        {label}
      </span>


      <span
        className={`max-w-[70%] break-all text-sm font-semibold text-slate-950 sm:text-right ${
          mono
            ? "font-mono text-xs"
            : ""
        }`}
      >
        {value}
      </span>

    </div>
  );
}


function ReminderSetting({
  days,
  label,
}: {
  days: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">

      <div className="flex items-center justify-between gap-3">

        <p className="text-2xl font-bold text-slate-950">
          {days}
        </p>

        <span className="h-2 w-2 rounded-full bg-blue-500" />

      </div>


      <p className="mt-1 text-xs font-medium text-slate-500">
        days before
      </p>


      <p className="mt-4 text-xs font-semibold text-slate-700">
        {label}
      </p>

    </div>
  );
}


/* =========================================================
   HELPERS
   ========================================================= */

function formatRole(
  role?: string
) {
  if (!role) {
    return "Not available";
  }


  return (
    role.charAt(0).toUpperCase()
    +
    role.slice(1)
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


function getInitial(
  email?: string | null
) {
  if (!email) {
    return "R";
  }

  return email
    .charAt(0)
    .toUpperCase();
}