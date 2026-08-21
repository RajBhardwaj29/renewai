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


export default function ResetPasswordPage() {

  const router =
    useRouter();


  const [
    password,
    setPassword,
  ] =
    useState("");


  const [
    confirmPassword,
    setConfirmPassword,
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


  async function handleUpdatePassword(
    event: React.FormEvent
  ) {

    event.preventDefault();

    setError("");
    setSuccess("");


    if (
      password.length < 6
    ) {

      setError(
        "Password must be at least 6 characters."
      );

      return;
    }


    if (
      password !==
      confirmPassword
    ) {

      setError(
        "Passwords do not match."
      );

      return;
    }


    setLoading(
      true
    );


    try {

      const {
        error:
          updateError,
      } =
        await supabase.auth.updateUser({
          password,
        });


      if (
        updateError
      ) {

        setError(
          updateError.message
        );

        return;
      }


      setSuccess(
        "Password updated successfully. Redirecting you to login..."
      );


      setTimeout(
        () => {

          router.replace(
            "/login"
          );

        },
        1500
      );


    } catch {

      setError(
        "Could not update password. Please request a new reset link."
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
                bg-emerald-400
              "
            />

            Secure password update

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
            Set a new password and return to your workspace.
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
            Choose a new password for your RenewAI account.
            Once updated, you&apos;ll be able to sign back in
            and continue managing your contracts.
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
              Password checklist
            </p>


            <div
              className="
                mt-5
                space-y-4
              "
            >

              <SecurityRow
                title="At least 6 characters"
                description="Use a password long enough to meet the current RenewAI minimum."
              />


              <SecurityRow
                title="Confirm before saving"
                description="Both password fields must match before your account is updated."
              />


              <SecurityRow
                title="Sign in again"
                description="After the update, RenewAI will return you to the login page."
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
          Secure access to your contract workspace.
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
              Account security
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
              Create a new password
            </h2>


            <p
              className="
                mt-3
                text-[15px]
                leading-6
                text-slate-600
              "
            >
              Choose and confirm a new password for your
              RenewAI account.
            </p>

          </div>


          <form
            onSubmit={
              handleUpdatePassword
            }
            className="
              space-y-5
            "
          >

            <div>

              <label
                htmlFor="password"
                className="
                  renewai-label
                "
              >
                New password
              </label>


              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={
                  password
                }
                onChange={
                  (event) =>
                    setPassword(
                      event.target.value
                    )
                }
                placeholder="Minimum 6 characters"
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
                Use at least 6 characters.
              </p>

            </div>


            <div>

              <label
                htmlFor="confirmPassword"
                className="
                  renewai-label
                "
              >
                Confirm password
              </label>


              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={
                  confirmPassword
                }
                onChange={
                  (event) =>
                    setConfirmPassword(
                      event.target.value
                    )
                }
                placeholder="Enter the same password again"
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
                  ? "Updating password..."
                  : "Update password"
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

              Return to{" "}

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
                sign in
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