"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";


export default function AppNavbar() {

  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);


  const navItems = [
    {
      label: "Dashboard",
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
    {
      label: "Settings",
      href: "/settings",
    },
  ];


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


  return (

    <header className="border-b border-slate-200 bg-white">

      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:gap-8 lg:px-10 lg:py-5">


        {/* BRAND */}

        <Link
          href="/dashboard"
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

          <nav className="hidden items-center gap-1 lg:flex">

            {
              navItems.map(
                (item) => {

                  const active =
                    isActive(
                      item.href
                    );


                  return (

                    <Link
                      key={
                        item.href
                      }
                      href={
                        item.href
                      }
                      className={
                        `
                        rounded-xl
                        px-5
                        py-3
                        text-sm
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
                        `
                      }
                    >

                      {
                        item.label
                      }

                    </Link>

                  );
                }
              )
            }

          </nav>


          {/* PRIMARY CTA */}

          <Link
            href="/analyze"
            className="ml-2 hidden rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-blue-700 hover:shadow-md lg:inline-flex"
          >
            + Analyze Contract
          </Link>

          <button
            type="button"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-controls="mobile-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 lg:hidden"
          >
            {menuOpen ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>

        </div>

      </div>

      {menuOpen && (
        <nav id="mobile-navigation" aria-label="Mobile navigation" className="border-t border-slate-200 px-4 py-4 sm:px-6 lg:hidden">
          <div className="mx-auto grid max-w-[1600px] gap-2">
            {navItems.map((item) => {
              const active = isActive(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    active
                      ? "bg-slate-100 text-slate-950"
                      : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            <Link
              href="/analyze"
              onClick={() => setMenuOpen(false)}
              className="mt-1 rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              + Analyze Contract
            </Link>
          </div>
        </nav>
      )}

    </header>

  );
}
