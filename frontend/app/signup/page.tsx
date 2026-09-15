"use client";

import {
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import Link from "next/link";

import {
  supabase,
} from "@/lib/supabase";


export default function SignupPage() {

  const router =
    useRouter();


  const [
    email,
    setEmail,
  ] =
    useState("");


  const [
    password,
    setPassword,
  ] =
    useState("");


  const [
    loading,
    setLoading,
  ] =
    useState(false);


  const [
    error,
    setError,
  ] =
    useState("");


  const [
    success,
    setSuccess,
  ] =
    useState("");


  async function handleSignup(
    event: React.FormEvent
  ) {

    event.preventDefault();

    setLoading(true);
    setError("");
    setSuccess("");


    try {

      const {
        data,
        error:
          signUpError,
      } =
        await supabase.auth.signUp({
          email:
            email.trim(),

          password,
        });


      if (
        signUpError
      ) {

        const message =
          signUpError.message.toLowerCase();


        if (
          message.includes(
            "user already registered"
          )
        ) {

          setError(
            "An account with this email already exists. Please sign in instead."
          );

          return;
        }


        if (
          message.includes(
            "password"
          )
        ) {

          setError(
            signUpError.message
          );

          return;
        }


        setError(
          signUpError.message
        );

        return;
      }


      if (
        data.session
      ) {

        router.replace(
          "/onboarding"
        );

        router.refresh();

        return;
      }


      setSuccess(
        "Account created. Please check your email to confirm your account."
      );


    } catch {

      setError(
        "Could not create your account. Please try again."
      );


    } finally {

      setLoading(
        false
      );
    }
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
              border
              border-white/10
              bg-white
              text-sm
              font-bold
              text-slate-950
              shadow-sm
            "
          >
            R
          </div>


          <span
            className="
              text-lg
              font-bold
              tracking-tight
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

            Start your contract workspace

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
            Turn renewal risk into a system you can actually manage.
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
            Upload contracts, review extracted terms,
            track cancellation windows, and receive
            renewal reminders before deadlines become
            expensive.
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
              What RenewAI tracks
            </p>


            <div
              className="
                mt-5
                grid
                gap-4
                sm:grid-cols-2
              "
            >

              <MiniFeature
                title="Renewal dates"
                description="Know exactly when contracts renew."
              />


              <MiniFeature
                title="Cancellation windows"
                description="See when notice must be given."
              />


              <MiniFeature
                title="Contract terms"
                description="Review extracted clauses and values."
              />


              <MiniFeature
                title="Reminder timeline"
                description="Get alerts before key deadlines."
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
          Build renewal awareness into your contract workflow.
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
                tracking-tight
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
              Create workspace
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
              Create your RenewAI account
            </h2>


            <p
              className="
                mt-3
                text-[15px]
                leading-6
                text-slate-600
              "
            >
              Start monitoring renewal dates, notice periods,
              and cancellation windows in one place.
            </p>

          </div>


          <form
            onSubmit={
              handleSignup
            }
            className="
              space-y-5
            "
          >

            <div>

              <label
                htmlFor="email"
                className="
                  renewai-label
                "
              >
                Work email
              </label>


              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={
                  email
                }
                onChange={
                  (event) =>
                    setEmail(
                      event.target.value
                    )
                }
                placeholder="you@company.com"
                className="
                  renewai-input
                "
              />

            </div>


            <div>

              <label
                htmlFor="password"
                className="
                  renewai-label
                "
              >
                Password
              </label>


              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={
                  password
                }
                onChange={
                  (event) =>
                    setPassword(
                      event.target.value
                    )
                }
                placeholder="Minimum 8 characters"
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
                Use at least 8 characters.
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


                {error.includes(
                  "already exists"
                ) && (

                  <div
                    className="
                      mt-3
                    "
                  >

                    <Link
                      href="/login"
                      className="
                        font-semibold
                        text-red-900
                        underline
                        underline-offset-4
                      "
                    >
                      Go to sign in
                    </Link>

                  </div>

                )}

              </div>

            )}


            {success && (

              <div
                className="
                  rounded-xl
                  border
                  border-green-200
                  bg-green-50
                  px-4
                  py-3.5
                  text-sm
                  font-medium
                  leading-6
                  text-green-800
                "
              >
                {success}
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
                  ? "Creating account..."
                  : "Create account"
              }

            </button>

          </form>


          <div
            className="
              mt-7
              border-t
              border-slate-200
              pt-6
              text-center
            "
          >

            <p
              className="
                text-sm
                text-slate-600
              "
            >

              Already using RenewAI?{" "}

              <Link
                href="/login"
                className="
                  font-semibold
                  text-slate-950
                  underline
                  decoration-slate-300
                  underline-offset-4
                  transition
                  hover:decoration-slate-950
                "
              >
                Sign in
              </Link>

            </p>

          </div>


          <p
            className="
              mt-10
              text-center
              text-xs
              leading-5
              text-slate-500
            "
          >
            Your first workspace is created during onboarding.
          </p>

        </div>

      </section>

    </main>
  );
}


function MiniFeature({
  title,
  description,
}: {
  title: string;
  description: string;
}) {

  return (

    <div
      className="
        rounded-xl
        border
        border-white/10
        bg-white/[0.04]
        p-4
      "
    >

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
          mt-2
          text-xs
          leading-5
          text-slate-400
        "
      >
        {description}
      </p>

    </div>
  );
}