"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";


export default function AppNavbar() {

  const pathname = usePathname();


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

      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-8 px-6 py-5 lg:px-10">


        {/* BRAND */}

        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-4"
        >

          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-xl font-bold text-white shadow-sm">
            R
          </div>


          <div>

            <div className="text-lg font-bold tracking-[0.18em] text-slate-800">
              RENEWAI
            </div>

            <div className="mt-1 text-sm text-slate-500">
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
  className="
    ml-2
    rounded-xl
    bg-blue-600
    px-6
    py-3
    text-sm
    font-semibold
    text-white
    shadow-sm
    transition-all
    duration-200
    hover:bg-blue-700
    hover:shadow-md
  "
>
  + Analyze Contract
</Link>

        </div>

      </div>

    </header>

  );
}