"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { supabase } from "@/lib/supabase";


export default function LoginPage() {

  const router = useRouter();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");


  async function handleLogin(
    event: React.FormEvent
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");


    try {

      const {
        error,
      } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });


      if (error) {
        throw error;
      }


      router.push(
        "/contracts"
      );


    } catch (err) {

      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not sign in."
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
            Welcome back
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Sign in to your RenewAI workspace.
          </p>

        </div>


        <form
          onSubmit={handleLogin}
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


          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-950 px-5 py-3 font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {loading
              ? "Signing in..."
              : "Sign In"}
          </button>

        </form>


        <p className="mt-6 text-center text-sm text-slate-500">

          No account yet?{" "}

          <Link
            href="/signup"
            className="font-medium text-slate-900 underline"
          >
            Create one
          </Link>

        </p>

      </div>

    </main>
  );
}