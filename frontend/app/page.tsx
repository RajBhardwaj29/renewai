"use client";

import { useState } from "react";
import Link from "next/link";

import { authFetch } from "@/lib/authFetch";


type ContractData = {
  vendor_name: string | null;
  contract_title: string | null;
  contract_value: number | null;
  currency: string | null;

  start_date: string | null;
  end_date: string | null;
  renewal_date: string | null;

  initial_term_months: number | null;
  renewal_term_months: number | null;

  notice_period_days: number | null;
  auto_renewal: boolean | null;

  renewal_clause: string | null;
  termination_clause: string | null;
  payment_terms: string | null;
};


type RenewalIntelligence = {
  effective_start_date: string | null;
  effective_end_date: string | null;
  effective_renewal_date: string | null;

  derived_end_date: string | null;
  derived_renewal_date: string | null;

  cancellation_deadline: string | null;
  days_until_cancellation_deadline: number | null;

  risk_level: string;
  recommendation: string;
};


type AnalysisResponse = {
  filename: string;

  character_count: number;

  contract: ContractData;

  renewal_intelligence: RenewalIntelligence;

  database_id: string;

  organization_id?: string;

  message: string;
};


type DuplicateDetail = {
  message: string;

  existing_contract_id?: string;

  vendor_name?: string | null;
};


type ErrorResponse = {
  detail?: string | DuplicateDetail;
};


export default function Home() {

  const [file, setFile] =
    useState<File | null>(null);

  const [result, setResult] =
    useState<AnalysisResponse | null>(null);

  const [uploading, setUploading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [
    duplicateContractId,
    setDuplicateContractId,
  ] =
    useState<string | null>(null);


  async function handleUpload() {

    if (!file) {

      setError(
        "Please choose a PDF contract first."
      );

      return;
    }


    setUploading(true);

    setError("");

    setDuplicateContractId(
      null
    );

    setResult(
      null
    );


    try {

      const formData =
        new FormData();


      formData.append(
        "file",
        file
      );


      const response =
        await authFetch(
          "/contracts/upload",
          {
            method: "POST",

            body: formData,
          }
        );


      const data =
        await response.json();


      if (!response.ok) {

        const errorData =
          data as ErrorResponse;


        if (
          response.status === 409
          &&
          typeof errorData.detail === "object"
          &&
          errorData.detail !== null
        ) {

          const duplicate =
            errorData.detail as DuplicateDetail;


          const vendor =
            duplicate.vendor_name
            ||
            "This contract";


          setError(
            `${vendor} has already been analyzed.`
          );


          if (
            duplicate.existing_contract_id
          ) {

            setDuplicateContractId(
              duplicate.existing_contract_id
            );
          }


          return;
        }


        if (
          response.status === 401
        ) {

          setError(
            "Your session has expired. Please sign in again."
          );

          return;
        }


        if (
          response.status === 403
        ) {

          setError(
            "You do not belong to a RenewAI workspace yet."
          );

          return;
        }


        if (
          typeof errorData.detail === "string"
        ) {

          setError(
            errorData.detail
          );

        } else {

          setError(
            "Contract analysis failed."
          );
        }


        return;
      }


      setResult(
        data as AnalysisResponse
      );


    } catch (err) {

      console.error(
        err
      );


      if (
        err instanceof Error
        &&
        err.message === "AUTH_REQUIRED"
      ) {

        setError(
          "Please sign in before analyzing a contract."
        );

        return;
      }


      setError(
        "Could not connect to RenewAI backend. Make sure FastAPI is running."
      );


    } finally {

      setUploading(
        false
      );
    }
  }


  function formatCurrency(
    value: number | null,
    currency: string | null
  ) {

    if (
      value === null
    ) {

      return "Not found";
    }


    try {

      return new Intl.NumberFormat(
        "en-IN",
        {
          style:
            "currency",

          currency:
            currency || "INR",

          maximumFractionDigits:
            0,
        }
      ).format(
        value
      );


    } catch {

      return (
        `${currency || ""} ` +
        value.toLocaleString(
          "en-IN"
        )
      );
    }
  }


  function formatDate(
    value: string | null
  ) {

    if (!value) {

      return "Not found";
    }


    const date =
      new Date(
        `${value}T00:00:00`
      );


    if (
      Number.isNaN(
        date.getTime()
      )
    ) {

      return value;
    }


    return date.toLocaleDateString(
      "en-IN",
      {
        day:
          "numeric",

        month:
          "short",

        year:
          "numeric",
      }
    );
  }


  function riskClasses(
    risk: string
  ) {

    switch (risk) {

      case "critical":

        return (
          "bg-red-100 " +
          "text-red-700 " +
          "border-red-200"
        );


      case "urgent":

        return (
          "bg-orange-100 " +
          "text-orange-700 " +
          "border-orange-200"
        );


      case "attention":

        return (
          "bg-yellow-100 " +
          "text-yellow-800 " +
          "border-yellow-200"
        );


      case "safe":

        return (
          "bg-green-100 " +
          "text-green-700 " +
          "border-green-200"
        );


      default:

        return (
          "bg-gray-100 " +
          "text-gray-700 " +
          "border-gray-200"
        );
    }
  }


  return (

    <main className="min-h-screen bg-slate-50 text-slate-900">

      <div className="mx-auto max-w-6xl px-6 py-10">


        <header className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-start">

          <div>

            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              RenewAI
            </p>


            <h1 className="text-4xl font-bold tracking-tight">
              AI Contract Renewal Intelligence
            </h1>


            <p className="mt-3 max-w-2xl text-slate-600">
              Upload a SaaS contract and RenewAI will extract key
              renewal terms, calculate deadlines and flag renewal risk.
            </p>

          </div>


          <Link
            href="/contracts"
            className="inline-flex w-fit rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium transition hover:bg-slate-100"
          >
            View Contracts
          </Link>

        </header>


        <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">

          <div className="flex flex-col gap-5 md:flex-row md:items-end">


            <div className="flex-1">

              <label className="mb-2 block text-sm font-medium">
                SaaS contract PDF
              </label>


              <input
                type="file"

                accept="application/pdf"

                onChange={
                  (event) => {

                    setFile(
                      event.target.files?.[0]
                      ||
                      null
                    );


                    setError(
                      ""
                    );


                    setResult(
                      null
                    );


                    setDuplicateContractId(
                      null
                    );
                  }
                }

                className="block w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm"
              />


              {file && (

                <p className="mt-2 text-sm text-slate-500">
                  Selected: {file.name}
                </p>

              )}

            </div>


            <button
              onClick={
                handleUpload
              }

              disabled={
                uploading
              }

              className="rounded-xl bg-slate-950 px-6 py-3 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >

              {
                uploading
                  ? "Analyzing contract..."
                  : "Analyze Contract"
              }

            </button>

          </div>


          {error && (

            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">


              <p className="text-sm font-medium text-red-700">
                {error}
              </p>


              {duplicateContractId && (

                <Link
                  href={
                    `/contracts/${duplicateContractId}`
                  }

                  className="mt-3 inline-flex text-sm font-semibold text-red-800 underline underline-offset-4"
                >
                  View existing contract →
                </Link>

              )}

            </div>

          )}

        </section>


        {uploading && (

          <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">


            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />


            <h2 className="text-lg font-semibold">
              Reading your contract
            </h2>


            <p className="mt-2 text-sm text-slate-500">
              Extracting terms and running local renewal analysis.
            </p>

          </section>

        )}


        {result && !uploading && (

          <div className="mt-8 space-y-8">


            <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">


              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">


                <div>

                  <p className="text-sm font-medium text-slate-500">
                    Contract
                  </p>


                  <h2 className="mt-1 text-3xl font-bold">

                    {
                      result.contract.vendor_name
                      ||
                      "Unknown Vendor"
                    }

                  </h2>


                  <p className="mt-2 text-slate-600">

                    {
                      result.contract.contract_title
                      ||
                      result.filename
                    }

                  </p>

                </div>


                <div
                  className={`inline-flex w-fit rounded-full border px-4 py-2 text-sm font-semibold uppercase tracking-wide ${riskClasses(
                    result.renewal_intelligence.risk_level
                  )}`}
                >

                  {
                    result
                      .renewal_intelligence
                      .risk_level
                  }

                </div>

              </div>


              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">


                <InfoCard
                  label="Contract Value"

                  value={
                    formatCurrency(
                      result.contract.contract_value,
                      result.contract.currency
                    )
                  }
                />


                <InfoCard
                  label="Renewal Date"

                  value={
                    formatDate(
                      result
                        .renewal_intelligence
                        .effective_renewal_date
                    )
                  }
                />


                <InfoCard
                  label="Cancellation Deadline"

                  value={
                    formatDate(
                      result
                        .renewal_intelligence
                        .cancellation_deadline
                    )
                  }
                />


                <InfoCard
                  label="Notice Period"

                  value={
                    result.contract.notice_period_days !==
                    null

                      ? `${result.contract.notice_period_days} days`

                      : "Not found"
                  }
                />

              </div>

            </section>


            <section className="grid gap-6 lg:grid-cols-2">


              <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">

                <h3 className="text-xl font-semibold">
                  Renewal Intelligence
                </h3>


                <div className="mt-6 space-y-5">


                  <DetailRow
                    label="Auto Renewal"

                    value={
                      result.contract.auto_renewal ===
                      null

                        ? "Unknown"

                        : result.contract.auto_renewal

                        ? "Yes"

                        : "No"
                    }
                  />


                  <DetailRow
                    label="Effective Start"

                    value={
                      formatDate(
                        result
                          .renewal_intelligence
                          .effective_start_date
                      )
                    }
                  />


                  <DetailRow
                    label="Effective End"

                    value={
                      formatDate(
                        result
                          .renewal_intelligence
                          .effective_end_date
                      )
                    }
                  />


                  <DetailRow
                    label="Initial Term"

                    value={
                      result.contract.initial_term_months !==
                      null

                        ? `${result.contract.initial_term_months} months`

                        : "Not found"
                    }
                  />


                  <DetailRow
                    label="Renewal Term"

                    value={
                      result.contract.renewal_term_months !==
                      null

                        ? `${result.contract.renewal_term_months} months`

                        : "Not found"
                    }
                  />


                  <DetailRow
                    label="Payment Terms"

                    value={
                      result.contract.payment_terms
                      ||
                      "Not found"
                    }
                  />

                </div>

              </div>


              <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">


                <h3 className="text-xl font-semibold">
                  Recommended Action
                </h3>


                <div
                  className={`mt-5 rounded-2xl border p-5 ${riskClasses(
                    result.renewal_intelligence.risk_level
                  )}`}
                >


                  <p className="text-sm font-semibold uppercase tracking-wide">

                    {
                      result
                        .renewal_intelligence
                        .risk_level
                    }

                  </p>


                  {
                    result
                      .renewal_intelligence
                      .days_until_cancellation_deadline !==
                    null
                    &&
                    (

                      <p className="mt-2 text-2xl font-bold">

                        {
                          result
                            .renewal_intelligence
                            .days_until_cancellation_deadline
                        }

                        {" "}days

                      </p>

                    )
                  }


                  <p className="mt-3 leading-7">

                    {
                      result
                        .renewal_intelligence
                        .recommendation
                    }

                  </p>

                </div>

              </div>

            </section>


            <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">


              <h3 className="text-xl font-semibold">
                Contract Evidence
              </h3>


              <div className="mt-6 grid gap-6 lg:grid-cols-2">


                <TextBlock
                  title="Renewal Clause"

                  value={
                    result.contract.renewal_clause
                    ||
                    "No explicit renewal clause was extracted."
                  }
                />


                <TextBlock
                  title="Termination Clause"

                  value={
                    result.contract.termination_clause
                    ||
                    "No explicit termination clause was extracted."
                  }
                />

              </div>

            </section>


            <section className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center">


              <div>

                <p className="font-medium">
                  Contract saved successfully
                </p>


                <p className="mt-1 text-sm text-slate-500">
                  This analysis is now stored in your RenewAI contract portfolio.
                </p>

              </div>


              <Link
                href={
                  `/contracts/${result.database_id}`
                }

                className="inline-flex w-fit rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Open Contract
              </Link>

            </section>

          </div>

        )}

      </div>

    </main>
  );
}


function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (

    <div className="rounded-2xl bg-slate-50 p-5">

      <p className="text-sm text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-lg font-semibold">
        {value}
      </p>

    </div>

  );
}


function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (

    <div className="flex items-start justify-between gap-6 border-b border-slate-100 pb-4 last:border-0 last:pb-0">

      <span className="text-sm text-slate-500">
        {label}
      </span>

      <span className="text-right font-medium">
        {value}
      </span>

    </div>

  );
}


function TextBlock({
  title,
  value,
}: {
  title: string;
  value: string;
}) {

  return (

    <div className="rounded-2xl bg-slate-50 p-5">

      <h4 className="font-semibold">
        {title}
      </h4>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">
        {value}
      </p>

    </div>

  );
}