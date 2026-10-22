"use client";

import Link from "next/link";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  supabase,
} from "@/lib/supabase";


type AccountUser = {
  email: string | null;
};


export default function AppNavbar() {

  const pathname = usePathname();
  const router = useRouter();

  const accountMenuRef =
    useRef<HTMLDivElement | null>(null);

  const accountButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileButtonRef = useRef<HTMLButtonElement | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  const [
    accountUser,
    setAccountUser,
  ] = useState<AccountUser | null>(
    null
  );

  const [
    menuOpen,
    setMenuOpen,
  ] = useState(false);

  const [
    accountMenuOpen,
    setAccountMenuOpen,
  ] = useState(false);


  const navItems = [
    {
      label: "Overview",
      href: "/dashboard",
    },
    {
      label: "Contracts",
      href: "/contracts",
    },
    {
      label: "Alerts",
      href: "/reminders",
    },
  ];


  useEffect(() => {
    let mounted = true;
    async function loadUser() {
      try {
        const { data } = await supabase.auth.getUser();
        if (mounted) setAccountUser({ email: data.user?.email ?? null });
      } catch {
        // The account label is optional; navigation remains available.
      }
    }
    void loadUser();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {

    function handlePointerDown(
      event: MouseEvent
    ) {

      if (
        !accountMenuOpen
      ) {
        return;
      }

      const target =
        event.target as Node;

      if (
        accountMenuRef.current
        &&
        !accountMenuRef.current.contains(
          target
        )
      ) {
        setAccountMenuOpen(false);
      }
    }


    function handleKeyDown(
      event: KeyboardEvent
    ) {

      if (
        event.key === "Escape"
      ) {
        if (accountMenuOpen) accountButtonRef.current?.focus();
        if (menuOpen) mobileButtonRef.current?.focus();
        setAccountMenuOpen(false);
        setMenuOpen(false);
      }
    }


    document.addEventListener(
      "mousedown",
      handlePointerDown
    );

    document.addEventListener(
      "keydown",
      handleKeyDown
    );


    return () => {

      document.removeEventListener(
        "mousedown",
        handlePointerDown
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };

  }, [accountMenuOpen, menuOpen]);


  function isActive(
    href: string
  ) {

    if (
      href === "/dashboard"
    ) {
      return pathname === "/dashboard";
    }


    if (
      href === "/contracts"
    ) {
      return (
        pathname === "/contracts" ||
        pathname.startsWith(
          "/contracts/"
        )
      );
    }


    return pathname.startsWith(
      href
    );
  }


  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setAccountMenuOpen(false);
      setMenuOpen(false);
      router.replace("/login");
      router.refresh();
    } catch {
      setSignOutError("Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }


  return (

    <header className="border-b border-slate-200 bg-white">

      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:gap-8 lg:px-10 lg:py-5">


        {/* BRAND */}

        <Link
          href="/dashboard"
          aria-label="RenewAI overview"
          onClick={() => { setMenuOpen(false); setAccountMenuOpen(false); }}
          className="flex min-w-0 shrink items-center gap-3 sm:shrink-0 sm:gap-4"
        >

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-base font-bold text-white shadow-sm sm:h-14 sm:w-14 sm:rounded-2xl sm:text-xl">
            R
          </div>


          <div className="min-w-0">

            <div className="text-lg font-bold tracking-[0.18em] text-slate-800">
              RENEWAI
            </div>

            <div className="mt-1 hidden text-sm text-slate-500 sm:block">
              Contract renewal intelligence
            </div>

          </div>

        </Link>


        {/* NAVIGATION */}

        <div className="flex items-center gap-3">

          <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">

            {
              navItems.map(
                (item) => {

                  const active =
                    isActive(
                      item.href
                    );


                  return (

                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`
                        rounded-xl
                        px-5
                        py-3
                        text-sm
                        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600
                        font-semibold
                        transition-all
                        duration-200

                        ${
                          active
                            ? `
                              bg-slate-100
                              text-slate-950
                            `
                            : `
                              text-slate-600
                              hover:bg-slate-50
                              hover:text-slate-950
                            `
                        }
                      `}
                    >

                      {item.label}

                    </Link>

                  );
                }
              )
            }

          </nav>


          {/* PRIMARY CTA */}

          <Link
            href="/analyze"
            aria-current={pathname === "/analyze" ? "page" : undefined}
            className="ml-2 hidden rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-blue-700 hover:shadow-md lg:inline-flex"
          >
            + Add contract
          </Link>


          {/* DESKTOP ACCOUNT MENU */}

          <div
            ref={accountMenuRef}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setAccountMenuOpen(false);
            }}
            className="relative hidden lg:block"
          >

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setAccountMenuOpen((open) => !open);
              }}
              ref={accountButtonRef}
              aria-label={accountMenuOpen ? "Close account menu" : "Open account menu"}
              aria-controls="account-navigation"
              aria-expanded={accountMenuOpen}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 hover:bg-slate-50 hover:text-slate-950"
            >

              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950 text-xs font-bold text-white">
                R
              </span>

              <span>
                Account
              </span>

              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className={`h-4 w-4 transition-transform ${
                  accountMenuOpen
                    ? "rotate-180"
                    : ""
                }`}
                aria-hidden="true"
              >
                <path
                  d="M6 8l4 4 4-4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

            </button>


            {
              accountMenuOpen && (

                <nav id="account-navigation" aria-label="Account navigation" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">


                  {/* ACCOUNT INFO */}

                  <div className="border-b border-slate-100 px-3 py-3">

                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Signed in as
                    </p>

                    <p className="mt-1 truncate text-sm font-semibold text-slate-800">
                      {
                        accountUser?.email
                        || "RenewAI account"
                      }
                    </p>

                  </div>


                  {/* SETTINGS */}

                  <Link
                    href="/settings"
                    aria-current={pathname === "/settings" ? "page" : undefined}
                    onClick={() =>
                      setAccountMenuOpen(false)
                    }
                    className="mt-2 block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 hover:bg-slate-50 hover:text-slate-950"
                  >
                    Settings
                  </Link>


                  {signOutError && <p role="alert" className="px-3 py-2 text-sm text-red-700">{signOutError}</p>}

                  {/* SIGN OUT */}

                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 hover:bg-slate-50 hover:text-slate-950"
                  >
                    {signingOut ? "Signing out…" : "Sign out"}
                  </button>

                </nav>

              )
            }

          </div>


          {/* MOBILE MENU BUTTON */}

          <button
            type="button"
            aria-label={
              menuOpen
                ? "Close navigation menu"
                : "Open navigation menu"
            }
            ref={mobileButtonRef}
            aria-controls="mobile-navigation"
            aria-expanded={menuOpen}
            onClick={() => {
              setAccountMenuOpen(false);
              setMenuOpen((open) => !open);
            }}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 lg:hidden"
          >

            {
              menuOpen ? (

                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>

              ) : (

                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>

              )
            }

          </button>

        </div>

      </div>


      {/* MOBILE NAVIGATION */}

      {
        menuOpen && (

          <nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== mobileButtonRef.current) setMenuOpen(false);
            }}
            className="border-t border-slate-200 px-4 py-4 sm:px-6 lg:hidden"
          >

            <div className="mx-auto grid max-w-[1600px] gap-2">

              {
                navItems.map(
                  (item) => {

                    const active =
                      isActive(
                        item.href
                      );


                    return (

                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() =>
                          setMenuOpen(false)
                        }
                        className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                          active
                            ? "bg-slate-100 text-slate-950"
                            : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                        }`}
                      >
                        {item.label}
                      </Link>

                    );
                  }
                )
              }


              {/* ADD CONTRACT */}

              <Link
                href="/analyze"
                aria-current={pathname === "/analyze" ? "page" : undefined}
                onClick={() =>
                  setMenuOpen(false)
                }
                className="mt-1 rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                + Add contract
              </Link>


              <div className="my-1 border-t border-slate-200" />


              {/* MOBILE ACCOUNT INFO */}

              <div className="px-4 py-2">

                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Signed in as
                </p>

                <p className="mt-1 truncate text-sm font-semibold text-slate-700">
                  {
                    accountUser?.email
                    || "RenewAI account"
                  }
                </p>

              </div>


              {/* SETTINGS */}

              <Link
                href="/settings"
                aria-current={pathname === "/settings" ? "page" : undefined}
                onClick={() =>
                  setMenuOpen(false)
                }
                className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 hover:bg-slate-50 hover:text-slate-950"
              >
                Settings
              </Link>


              {signOutError && <p role="alert" className="px-4 py-2 text-sm text-red-700">{signOutError}</p>}

              {/* SIGN OUT */}

              <button
                type="button"
                onClick={handleSignOut}
                    disabled={signingOut}
                className="rounded-xl px-4 py-3 text-left text-sm font-semibold text-slate-700 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 hover:bg-slate-50 hover:text-slate-950"
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>

            </div>

          </nav>

        )
      }

    </header>

  );
}