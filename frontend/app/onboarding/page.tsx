"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";


export default function OnboardingPage() {

  const router = useRouter();

  const [
    organizationName,
    setOrganizationName,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    checkingAuth,
    setCheckingAuth,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");


  useEffect(() => {

    async function checkUser() {

      const {
        data: {
          user,
        },
      } =
        await supabase.auth.getUser();


      if (!user) {

        router.replace(
          "/login"
        );

        return;
      }


      setCheckingAuth(
        false
      );
    }


    checkUser();

  }, [router]);


  async function createOrganization(
    event: React.FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();


    const cleanedName =
      organizationName.trim();


    if (!cleanedName) {

      setError(
        "Please enter your organization name."
      );

      return;
    }


    setLoading(true);

    setError("");


    try {

      const {
        data: {
          user,
        },
        error: userError,
      } =
        await supabase.auth.getUser();


      if (
        userError ||
        !user
      ) {

        throw new Error(
          "You must be signed in."
        );
      }


      const {
        data: organizationId,
        error: organizationError,
      } =
        await supabase.rpc(
          "create_organization",
          {
            organization_name:
              cleanedName,
          }
        );


      if (
        organizationError
      ) {

        throw organizationError;
      }


      if (
        !organizationId
      ) {

        throw new Error(
          "Organization was not created."
        );
      }


      router.push(
        "/contracts"
      );

      router.refresh();


    } catch (err) {

      console.error(err);


      if (
        err instanceof Error
      ) {

        setError(
          err.message
        );

      } else {

        setError(
          "Could not create organization."
        );
      }


    } finally {

      setLoading(false);

    }
  }


  if (
    checkingAuth
  ) {

    return (

      <main className="flex min-h-screen items-center justify-center bg-slate-50">

        <div className="text-center">

          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />

          <p className="text-slate-600">
            Loading RenewAI...
          </p>

        </div>

      </main>
    );
  }


  return (

    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">

      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">

        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          RenewAI
        </p>


        <h1 className="mt-3 text-3xl font-bold text-slate-950">
          Create your workspace
        </h1>


        <p className="mt-3 text-slate-600">
          Your workspace keeps your
          company's contracts, renewal
          deadlines and insights together.
        </p>


        <form
          onSubmit={
            createOrganization
          }
          className="mt-8 space-y-5"
        >

          <div>

            <label className="mb-2 block text-sm font-medium text-slate-900">
              Organization name
            </label>


            <input
              type="text"
              required
              value={
                organizationName
              }
              onChange={
                (event) =>
                  setOrganizationName(
                    event.target.value
                  )
              }
              placeholder="e.g. Acme Technologies"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none placeholder:text-slate-400 focus:border-slate-600"
            />

          </div>


          {error && (

            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>

          )}


          <button
            type="submit"
            disabled={
              loading
            }
            className="w-full rounded-xl bg-slate-950 px-5 py-3 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >

            {loading
              ? "Creating workspace..."
              : "Create Workspace"}

          </button>

        </form>

      </div>

    </main>
  );
}