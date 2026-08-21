"use client";

import {
  useState,
} from "react";

import Link from "next/link";

import {
  supabase,
} from "@/lib/supabase";


export default function ForgotPasswordPage() {

  const [
    email,
    setEmail,
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


  async function handleReset(
    event: React.FormEvent
  ) {

    event.preventDefault();

    setLoading(true);
    setError("");
    setSuccess("");


    try {

      const redirectTo =
        `${window.location.origin}/reset-password`;


      const {
        error:
          resetError,
      } =
        await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo,
          }
        );


      if (
        resetError
      ) {

        setError(
          resetError.message
        );

        return;
      }


      setSuccess(
        "Password reset link sent. Check your email."
      );


    } catch {

      setError(
        "Could not send password reset email. Please try again."
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

            Secure account recovery

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
            Get back to your contract workspace securely.
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
            Request a secure password reset link and
            regain access to your renewal intelligence,
            deadlines, and alerts.
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
              Account security
            </p>


            <div
              className="
                mt-5
                space-y-4
              "
            >

              <SecurityRow
                title="Secure reset link"
                description="A reset link is sent only to the email on your RenewAI account."
              />


              <SecurityRow
                title="No password sharing"
                description="RenewAI never asks you to send your password by email."
              />


              <SecurityRow
                title="Return to your workspace"
                description="Once updated, sign back in and continue where you left off."
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
          Secure access to your renewal workspace.
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
              Password recovery
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
              Reset your password
            </h2>


            <p
              className="
                mt-3
                text-[15px]
                leading-6
                text-slate-600
              "
            >
              Enter the email connected to your RenewAI
              account and we&apos;ll send you a secure reset link.
            </p>

          </div>


          <form
            onSubmit={
              handleReset
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
                Email address
              </label>


              <input
                id="email"
                type="email"
                required
                autoComplete="email"
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
                  ? "Sending reset link..."
                  : "Send reset link"
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

              Remembered your password?{" "}

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
                Back to sign in
              </Link>

            </p>

          </div>

        </div>

      </section>

    </main>
  );
}


function SecurityRow({
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
          bg-emerald-400/10
          text-xs
          font-bold
          text-emerald-300
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