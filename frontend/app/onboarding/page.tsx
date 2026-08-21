"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import Link from "next/link";

import {
  supabase,
} from "@/lib/supabase";


export default function OnboardingPage() {

  const router =
    useRouter();


  const [
    organizationName,
    setOrganizationName,
  ] =
    useState("");


  const [
    loading,
    setLoading,
  ] =
    useState(false);


  const [
    checkingAuth,
    setCheckingAuth,
  ] =
    useState(true);


  const [
    error,
    setError,
  ] =
    useState("");


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

  }, [
    router,
  ]);


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


    setLoading(
      true
    );

    setError(
      ""
    );


    try {

      const {
        data: {
          user,
        },

        error:
          userError,
      } =
        await supabase.auth.getUser();


      if (
        userError
        ||
        !user
      ) {

        throw new Error(
          "You must be signed in."
        );
      }


      const {
        data:
          organizationId,

        error:
          organizationError,
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


    } catch (
      err
    ) {

      console.error(
        err
      );


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

      setLoading(
        false
      );
    }
  }


  if (
    checkingAuth
  ) {

    return (

      <main
        className="
          flex
          min-h-screen
          items-center
          justify-center
          bg-[#f6f8fb]
          px-6
        "
      >

        <div
          className="
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
            Loading RenewAI...
          </p>

        </div>

      </main>
    );
  }


  return (

    <main
      className="
        min-h-screen
        bg-[#f6f8fb]
        lg:grid
        lg:grid-cols-[1fr_1fr]
      "
    >

      {/* LEFT */}

      <section
        className="
          relative
          hidden
          overflow-hidden
          bg-slate-950
          px-12
          py-10
          text-white
          lg:flex
          lg:min-h-screen
          lg:flex-col
          lg:justify-between
          xl:px-16
          xl:py-12
        "
      >

        <div
          className="
            pointer-events-none
            absolute
            -right-32
            -top-32
            h-96
            w-96
            rounded-full
            bg-blue-500/10
            blur-3xl
          "
        />


        <div
          className="
            pointer-events-none
            absolute
            -bottom-40
            -left-40
            h-[28rem]
            w-[28rem]
            rounded-full
            bg-blue-600/10
            blur-3xl
          "
        />


        <Link
          href="/"
          className="
            relative
            z-10
            inline-flex
            w-fit
            items-center
            gap-3
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
              bg-white
              text-sm
              font-bold
              text-slate-950
            "
          >
            R
          </div>


          <span
            className="
              text-lg
              font-bold
              text-white
            "
          >
            RenewAI
          </span>

        </Link>


        <div
          className="
            relative
            z-10
            max-w-xl
          "
        >

          <div
            className="
              mb-6
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
              className="
                h-2
                w-2
                rounded-full
                bg-blue-400
              "
            />

            Workspace setup

          </div>


          <h1
            className="
              max-w-lg
              text-4xl
              font-bold
              leading-[1.12]
              tracking-[-0.04em]
              !text-white
              xl:text-5xl
            "
          >
            Create the workspace that will hold your contract portfolio.
          </h1>


          <p
            className="
              mt-6
              max-w-lg
              text-base
              leading-7
              text-slate-300
              xl:text-lg
              xl:leading-8
            "
          >
            Your RenewAI workspace keeps contracts,
            renewal deadlines, reminders, and intelligence
            grouped securely under one organization.
          </p>


          <div
            className="
              mt-10
              max-w-lg
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
                font-semibold
                uppercase
                tracking-[0.14em]
                text-slate-400
              "
            >
              Workspace foundation
            </p>


            <div
              className="
                mt-5
                space-y-4
              "
            >

              <WorkspaceRow
                title="Separate contract portfolio"
                description="Your organization only sees its own contracts and renewal data."
              />


              <WorkspaceRow
                title="Shared renewal visibility"
                description="The workspace becomes the home for deadlines, alerts, and contract intelligence."
              />


              <WorkspaceRow
                title="Built for team access"
                description="Additional workspace collaboration can be added as RenewAI grows."
              />

            </div>

          </div>

        </div>


        <p
          className="
            relative
            z-10
            text-xs
            text-slate-500
          "
        >
          One workspace. One renewal portfolio.
        </p>

      </section>


      {/* RIGHT */}

      <section
        className="
          flex
          min-h-screen
          items-center
          justify-center
          px-5
          py-10
          sm:px-8
          lg:px-12
        "
      >

        <div
          className="
            w-full
            max-w-md
          "
        >

          <Link
            href="/"
            className="
              mb-10
              inline-flex
              items-center
              gap-3
              lg:hidden
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
                text-sm
                font-bold
                text-white
              "
            >
              R
            </div>


            <span
              className="
                text-lg
                font-bold
                text-slate-950
              "
            >
              RenewAI
            </span>

          </Link>


          <div
            className="
              mb-8
            "
          >

            <p
              className="
                renewai-eyebrow
              "
            >
              Workspace setup
            </p>


            <h2
              className="
                mt-3
                text-3xl
                font-bold
                tracking-[-0.035em]
                text-slate-950
                sm:text-4xl
              "
            >
              Create your workspace
            </h2>


            <p
              className="
                mt-3
                text-[15px]
                leading-6
                text-slate-600
              "
            >
              Give your workspace the company or team name
              you want to use across RenewAI.
            </p>

          </div>


          <div
            className="
              mb-6
              rounded-2xl
              border
              border-blue-200
              bg-blue-50
              p-4
            "
          >

            <p
              className="
                text-sm
                font-semibold
                text-blue-950
              "
            >
              One workspace, one contract portfolio
            </p>


            <p
              className="
                mt-1
                text-sm
                leading-6
                text-blue-800
              "
            >
              Contracts, reminders, and renewal intelligence
              are scoped to this workspace.
            </p>

          </div>


          <form
            onSubmit={
              createOrganization
            }
            className="
              space-y-5
            "
          >

            <div>

              <label
                htmlFor="organizationName"
                className="
                  renewai-label
                "
              >
                Organization name
              </label>


              <input
                id="organizationName"
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
                className="
                  renewai-input
                "
              />


              <p
                className="
                  mt-2
                  text-xs
                  leading-5
                  text-slate-500
                "
              >
                Use your company, team, or workspace name.
              </p>

            </div>


            {error && (

              <div
                role="alert"
                className="
                  rounded-xl
                  border
                  border-red-200
                  bg-red-50
                  px-4
                  py-3.5
                  text-sm
                  font-medium
                  leading-6
                  text-red-800
                "
              >
                {error}
              </div>

            )}


            <button
              type="submit"
              disabled={
                loading
              }
              className="
                renewai-button-primary
                !mt-7
                w-full
              "
            >

              {
                loading
                  ? "Creating workspace..."
                  : "Create workspace"
              }

            </button>

          </form>


          <div
            className="
              mt-7
              border-t
              border-slate-200
              pt-6
            "
          >

            <p
              className="
                text-center
                text-xs
                leading-5
                text-slate-500
              "
            >
              RenewAI separates contract data by workspace
              so organizations only see their own portfolio.
            </p>

          </div>

        </div>

      </section>

    </main>
  );
}


function WorkspaceRow({
  title,
  description,
}: {
  title: string;
  description: string;
}) {

  return (

    <div
      className="
        flex
        gap-3
      "
    >

      <div
        className="
          mt-1
          flex
          h-7
          w-7
          shrink-0
          items-center
          justify-center
          rounded-full
          bg-blue-400/10
          text-xs
          font-bold
          text-blue-300
        "
      >
        ✓
      </div>


      <div>

        <p
          className="
            text-sm
            font-semibold
            text-white
          "
        >
          {title}
        </p>


        <p
          className="
            mt-1
            text-xs
            leading-5
            text-slate-400
          "
        >
          {description}
        </p>

      </div>

    </div>
  );
}