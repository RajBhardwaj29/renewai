"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { supabase } from "@/lib/supabase";


export default function SignupPage() {

  const router = useRouter();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");


  async function handleSignup(
    event: React.FormEvent
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setMessage("");

    try {

      const {
        data,
        error,
      } =
        await supabase.auth.signUp({
          email,
          password,
        });


      if (error) {
        throw error;
      }


      if (
        data.user &&
        !data.session
      ) {
        setMessage(
          "Account created. Check your email to confirm your account."
        );

        return;
      }


      router.push(
        "/onboarding"
      );


    } catch (err) {

      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not create account."
      );

    } finally {

      setLoading(false);
    }
  }


  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">

      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">

        <div className="mb-8">

          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            RenewAI
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Create your account
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Start monitoring your SaaS contracts and renewal deadlines.
          </p>

        </div>


        <form
          onSubmit={handleSignup}
          className="space-y-5"
        >

          <div>

            <label className="mb-2 block text-sm font-medium">
              Email
            </label>

            <input
              type="email"
              required
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value
                )
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
            />

          </div>


          <div>

            <label className="mb-2 block text-sm font-medium">
              Password
            </label>

            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
            />

          </div>


          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}


          {message && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              {message}
            </div>
          )}


          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-950 px-5 py-3 font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {loading
              ? "Creating account..."
              : "Create Account"}
          </button>

        </form>


        <p className="mt-6 text-center text-sm text-slate-500">

          Already have an account?{" "}

          <Link
            href="/login"
            className="font-medium text-slate-900 underline"
          >
            Sign in
          </Link>

        </p>

      </div>

    </main>
  );
}