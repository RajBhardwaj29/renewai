"use client";

import AuthGuard from "@/components/AuthGuard";

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
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
  const router =
    useRouter();


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
    useState(true);


  const [
    signingOut,
    setSigningOut,
  ] =
    useState(false);


  const [
    error,
    setError,
  ] =
    useState("");


  useEffect(() => {
    async function loadAccount() {
      try {
        const response =
          await authFetch(
            "/me"
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
              : "Could not load account."
          );
        }


        setAccount(
          data as MeResponse
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
          "Could not load account settings."
        );


      } finally {
        setLoading(
          false
        );
      }
    }


    loadAccount();

  }, [router]);


  async function handleSignOut() {
    setSigningOut(
      true
    );

    setError(
      ""
    );


    try {
      const {
        error,
      } =
        await supabase.auth.signOut();


      if (error) {
        throw error;
      }


      router.replace(
        "/login"
      );

      router.refresh();


    } catch (err) {
      console.error(
        err
      );


      setError(
        "Could not sign out."
      );


    } finally {
      setSigningOut(
        false
      );
    }
  }


  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50">

        <div className="mx-auto max-w-5xl px-6 py-20 text-center">

          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />

          <p className="text-slate-500">
            Loading settings...
          </p>

        </div>

      </main>
    );
  }


  return (
    <AuthGuard>
    <main className="min-h-screen bg-slate-50 text-slate-900">

      <div className="mx-auto max-w-5xl px-6 py-10">


        <header className="mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-start">

          <div>

            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              RenewAI
            </p>

            <h1 className="text-4xl font-bold tracking-tight">
              Settings
            </h1>

            <p className="mt-3 text-slate-600">
              Manage your account, workspace
              and reminder configuration.
            </p>

          </div>


          <div className="flex flex-wrap gap-3">

            <Link
              href="/contracts"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium transition hover:bg-slate-100"
            >
              Contracts
            </Link>


            <Link
              href="/reminders"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium transition hover:bg-slate-100"
            >
              Renewal Alerts
            </Link>

          </div>

        </header>


        {error && (

          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </div>

        )}


        <div className="space-y-6">


          {/* ACCOUNT */}

          <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">

            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
              Account
            </p>

            <h2 className="mt-2 text-xl font-semibold">
              User Profile
            </h2>


            <div className="mt-6 space-y-5">

              <SettingRow
                label="Email"
                value={
                  account?.user.email ||
                  "Not available"
                }
              />


              <SettingRow
                label="User ID"
                value={
                  account?.user.id ||
                  "Not available"
                }
              />

            </div>

          </section>


          {/* WORKSPACE */}

          <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">

            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
              Workspace
            </p>

            <h2 className="mt-2 text-xl font-semibold">
              Organization
            </h2>


            <div className="mt-6 space-y-5">

              <SettingRow
                label="Workspace Name"
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
                label="Workspace ID"
                value={
                  account?.organization.id ||
                  "Not available"
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

            </div>

          </section>


          {/* NOTIFICATIONS */}

          <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">

            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">

              <div>

                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
                  Notifications
                </p>

                <h2 className="mt-2 text-xl font-semibold">
                  Renewal Reminders
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  RenewAI automatically checks
                  pending reminders and delivers
                  due renewal notifications.
                </p>

              </div>


              <span className="inline-flex w-fit rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                Automatic
              </span>

            </div>


            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

              <ReminderSetting
                days="90"
              />

              <ReminderSetting
                days="60"
              />

              <ReminderSetting
                days="30"
              />

              <ReminderSetting
                days="14"
              />

              <ReminderSetting
                days="7"
              />

            </div>


            <div className="mt-6 rounded-2xl bg-slate-50 p-5">

              <p className="text-sm font-medium">
                Delivery Status
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Local development emails are
                currently delivered through
                Mailpit. Production delivery
                will be configured during
                deployment.
              </p>

            </div>

          </section>


          {/* SECURITY */}

          <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">

            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
              Security
            </p>

            <h2 className="mt-2 text-xl font-semibold">
              Session
            </h2>


            <div className="mt-6 flex flex-col justify-between gap-5 rounded-2xl border border-slate-200 p-5 sm:flex-row sm:items-center">

              <div>

                <p className="font-medium">
                  Signed in
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  {
                    account?.user.email ||
                    "Authenticated RenewAI user"
                  }
                </p>

              </div>


              <button
                onClick={
                  handleSignOut
                }

                disabled={
                  signingOut
                }

                className="w-fit rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {
                  signingOut
                    ? "Signing out..."
                    : "Sign Out"
                }
              </button>

            </div>

          </section>


        </div>

      </div>

    </main>
    </AuthGuard>
  );
}


function SettingRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col justify-between gap-2 border-b border-slate-100 pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-start">

      <span className="text-sm text-slate-500">
        {label}
      </span>

      <span className="max-w-xl break-all text-sm font-medium sm:text-right">
        {value}
      </span>

    </div>
  );
}


function ReminderSetting({
  days,
}: {
  days: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">

      <p className="text-2xl font-bold">
        {days}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        days before
      </p>

    </div>
  );
}


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