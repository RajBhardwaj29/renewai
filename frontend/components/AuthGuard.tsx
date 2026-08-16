"use client";

import {
  ReactNode,
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  supabase,
} from "@/lib/supabase";


type AuthGuardProps = {
  children: ReactNode;
};


export default function AuthGuard({
  children,
}: AuthGuardProps) {

  const router =
    useRouter();


  const [
    checking,
    setChecking,
  ] =
    useState(true);


  const [
    authenticated,
    setAuthenticated,
  ] =
    useState(false);


  useEffect(() => {

    let mounted = true;


    async function checkSession() {

      const {
        data: {
          session,
        },
      } =
        await supabase.auth.getSession();


      if (!mounted) {
        return;
      }


      if (!session) {

        setAuthenticated(
          false
        );

        setChecking(
          false
        );


        router.replace(
          "/login"
        );

        return;
      }


      setAuthenticated(
        true
      );

      setChecking(
        false
      );
    }


    checkSession();


    const {
      data: {
        subscription,
      },
    } =
      supabase.auth.onAuthStateChange(
        (
          event,
          session
        ) => {

          if (!mounted) {
            return;
          }


          if (
            event === "SIGNED_OUT"
            ||
            !session
          ) {

            setAuthenticated(
              false
            );

            router.replace(
              "/login"
            );

          } else {

            setAuthenticated(
              true
            );

          }
        }
      );


    return () => {

      mounted = false;

      subscription.unsubscribe();

    };

  }, [
    router,
  ]);


  if (
    checking
  ) {

    return (

      <main className="flex min-h-screen items-center justify-center bg-slate-50">

        <div className="text-center">

          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />

          <p className="text-sm text-slate-500">
            Loading RenewAI...
          </p>

        </div>

      </main>
    );
  }


  if (
    !authenticated
  ) {

    return null;
  }


  return (
    <>
      {children}
    </>
  );
}