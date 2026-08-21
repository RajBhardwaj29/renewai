import type {
  Metadata,
} from "next";

import {
  Geist,
  Geist_Mono,
} from "next/font/google";

import "./globals.css";


const geistSans =
  Geist({
    variable:
      "--font-geist-sans",

    subsets: [
      "latin",
    ],
  });


const geistMono =
  Geist_Mono({
    variable:
      "--font-geist-mono",

    subsets: [
      "latin",
    ],
  });


export const metadata:
  Metadata = {

  title: {
    default:
      "RenewAI",

    template:
      "%s | RenewAI",
  },

  description:
    "Contract renewal intelligence that helps teams track renewal dates, cancellation deadlines, and upcoming contract actions.",
};


export default function RootLayout({
  children,
}: Readonly<{
  children:
    React.ReactNode;
}>) {

  return (

    <html
      lang="en"

      className={
        `${geistSans.variable} ${geistMono.variable}`
      }
    >

      <body>
        {children}
      </body>

    </html>
  );
}