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


export default function LoginPage() {

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


  async function handleLogin(
    event: React.FormEvent
  ) {

    event.preventDefault();

    setLoading(true);
    setError("");


    try {

      const {
        error:
          signInError,
      } =
        await supabase.auth.signInWithPassword({
          email:
            email.trim(),

          password,
        });


      if (
        signInError
      ) {

        const message =
          signInError.message.toLowerCase();


        if (
          message.includes(
            "invalid login credentials"
          )
        ) {

          setError(
            "Invalid email or password."
          );

          return;
        }


        if (
          message.includes(
            "email not confirmed"
          )
        ) {

          setError(
            "Please confirm your email before signing in."
          );

          return;
        }


        setError(
          signInError.message
        );

        return;
      }


      router.replace(
        "/dashboard"
      );

      router.refresh();


    } catch {

      setError(
        "Could not sign in. Please try again."
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

      {/* ==================================================
          LEFT — PRODUCT / BRAND
          ================================================== */}

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

        {/* Decorative glow */}

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


        {/* Brand */}

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


        {/* Product message */}

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
                bg-emerald-400
              "
            />

            Contract renewal intelligence

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
            Never discover a renewal deadline too late.
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
            Turn contracts into clear renewal dates,
            cancellation deadlines, and actionable
            reminders before your window closes.
          </p>


          {/* Mini intelligence card */}

          <div
            className="
              mt-10
              max-w-lg
              rounded-2xl
              border
              border-white/10
              bg-white/[0.06]
              p-5
              backdrop-blur-sm
            "
          >

            <div
              className="
                flex
                items-center
                justify-between
                gap-4
              "
            >

              <div>

                <p
                  className="
                    text-xs
                    font-semibold
                    uppercase
                    tracking-[0.14em]
                    text-slate-400
                  "
                >
                  Renewal intelligence
                </p>


                <p
                  className="
                    mt-2
                    text-sm
                    font-semibold
                    text-white
                  "
                >
                  Nimbus Analytics
                </p>

              </div>


              <span
                className="
                  rounded-full
                  border
                  border-emerald-400/20
                  bg-emerald-400/10
                  px-3
                  py-1
                  text-xs
                  font-bold
                  text-emerald-300
                "
              >
                SAFE
              </span>

            </div>


            <div
              className="
                mt-5
                grid
                grid-cols-2
                gap-4
                border-t
                border-white/10
                pt-5
              "
            >

              <div>

                <p
                  className="
                    text-xs
                    text-slate-400
                  "
                >
                  Renewal date
                </p>

                <p
                  className="
                    mt-1
                    text-sm
                    font-semibold
                    text-slate-100
                  "
                >
                  1 Sep 2027
                </p>

              </div>


              <div>

                <p
                  className="
                    text-xs
                    text-slate-400
                  "
                >
                  Cancel by
                </p>

                <p
                  className="
                    mt-1
                    text-sm
                    font-semibold
                    text-slate-100
                  "
                >
                  3 Jul 2027
                </p>

              </div>

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
          Contract clarity before deadlines become
          expensive.
        </p>

      </section>


      {/* ==================================================
          RIGHT — LOGIN
          ================================================== */}

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

          {/* Mobile brand */}

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


          {/* Heading */}

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
              Welcome back
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
              Sign in to RenewAI
            </h2>


            <p
              className="
                mt-3
                text-[15px]
                leading-6
                text-slate-600
              "
            >
              Access your contracts, renewal intelligence,
              and upcoming deadlines.
            </p>

          </div>


          {/* Login form */}

          <form
            onSubmit={
              handleLogin
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

              <div
                className="
                  mb-2
                  flex
                  items-center
                  justify-between
                  gap-4
                "
              >

                <label
                  htmlFor="password"
                  className="
                    text-sm
                    font-semibold
                    text-slate-700
                  "
                >
                  Password
                </label>


                <Link
                  href="/forgot-password"
                  className="
                    text-sm
                    font-semibold
                    text-blue-700
                    transition
                    hover:text-blue-800
                    hover:underline
                    hover:underline-offset-4
                  "
                >
                  Forgot password?
                </Link>

              </div>


              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={
                  password
                }
                onChange={
                  (event) =>
                    setPassword(
                      event.target.value
                    )
                }
                placeholder="Enter your password"
                className="
                  renewai-input
                "
              />

            </div>


            {/* Error */}

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

              {loading
                ? "Signing in..."
                : "Sign in"
              }

            </button>

          </form>


          {/* Signup */}

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

              New to RenewAI?{" "}

              <Link
                href="/signup"
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
                Create an account
              </Link>

            </p>

          </div>


          {/* Footer */}

          <p
            className="
              mt-10
              text-center
              text-xs
              leading-5
              text-slate-500
            "
          >
            Keep renewal dates, notice periods, and
            cancellation deadlines visible in one place.
          </p>

        </div>

      </section>

    </main>
  );
}