"use client";

import AuthGuard from "@/components/AuthGuard";
import AppNavbar from "@/components/AppNavbar";

import {
  useState,
} from "react";

import Link from "next/link";

import {
  authFetch,
} from "@/lib/authFetch";


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

  days_until_cancellation_deadline:
    number | null;

  risk_level: string;

  recommendation: string;
};


type AnalysisResponse = {
  filename: string;
  character_count: number;

  contract: ContractData;

  renewal_intelligence:
    RenewalIntelligence;

  message: string;
};


type SaveResponse = {
  filename: string;
  character_count: number;

  contract: ContractData;

  renewal_intelligence:
    RenewalIntelligence;

  database_id: string;

  organization_id?: string;

  reminder_count?: number;

  message: string;
};


type DuplicateDetail = {
  message: string;

  existing_contract_id?: string;

  vendor_name?: string | null;
};


type ErrorResponse = {
  detail?:
    | string
    | DuplicateDetail;
};


export default function AnalyzeContractPage() {

  const [
    file,
    setFile,
  ] =
    useState<File | null>(
      null
    );


  const [
    analysis,
    setAnalysis,
  ] =
    useState<AnalysisResponse | null>(
      null
    );


  const [
    reviewedContract,
    setReviewedContract,
  ] =
    useState<ContractData | null>(
      null
    );


  const [
    savedResult,
    setSavedResult,
  ] =
    useState<SaveResponse | null>(
      null
    );


  const [
    analyzing,
    setAnalyzing,
  ] =
    useState(
      false
    );


  const [
    saving,
    setSaving,
  ] =
    useState(
      false
    );


  const [
    error,
    setError,
  ] =
    useState(
      ""
    );


  const [
    duplicateContractId,
    setDuplicateContractId,
  ] =
    useState<string | null>(
      null
    );


  function resetAnalysis() {

    setAnalysis(
      null
    );

    setReviewedContract(
      null
    );

    setSavedResult(
      null
    );

    setError(
      ""
    );

    setDuplicateContractId(
      null
    );
  }


  function handleApiError(
    responseStatus: number,
    data: ErrorResponse,
    fallbackMessage: string
  ) {

    if (
      responseStatus === 409
      &&
      typeof data.detail ===
        "object"
      &&
      data.detail !== null
    ) {

      const duplicate =
        data.detail as DuplicateDetail;


      const vendor =
        duplicate.vendor_name
        ||
        "This contract";


      setError(
        `${vendor} has already been saved.`
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
      responseStatus === 401
    ) {

      setError(
        "Your session has expired. Please sign in again."
      );

      return;
    }


    if (
      responseStatus === 403
    ) {

      setError(
        "You do not belong to a RenewAI workspace yet."
      );

      return;
    }


    if (
      typeof data.detail ===
      "string"
    ) {

      setError(
        data.detail
      );

      return;
    }


    setError(
      fallbackMessage
    );
  }


  async function handleAnalyze() {

    if (
      !file
    ) {

      setError(
        "Please choose a PDF contract first."
      );

      return;
    }


    setAnalyzing(
      true
    );

    setError(
      ""
    );

    setDuplicateContractId(
      null
    );

    setAnalysis(
      null
    );

    setReviewedContract(
      null
    );

    setSavedResult(
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
          "/contracts/analyze",
          {
            method:
              "POST",

            body:
              formData,
          }
        );


      const data =
        await response.json();


      if (
        !response.ok
      ) {

        handleApiError(
          response.status,
          data as ErrorResponse,
          "Contract analysis failed."
        );

        return;
      }


      const typedData =
        data as AnalysisResponse;


      setAnalysis(
        typedData
      );


      setReviewedContract({
        ...typedData.contract,
      });


    } catch (
      err
    ) {

      if (
        err instanceof Error
        &&
        err.message ===
          "AUTH_REQUIRED"
      ) {

        setError(
          "Please sign in before analyzing a contract."
        );

        return;
      }


      console.error(
        "Contract analysis error:",
        err
      );


      setError(
        "Could not connect to RenewAI backend."
      );


    } finally {

      setAnalyzing(
        false
      );
    }
  }


  async function handleSave() {

    if (
      !file
      ||
      !reviewedContract
    ) {

      setError(
        "There is no reviewed contract to save."
      );

      return;
    }


    setSaving(
      true
    );

    setError(
      ""
    );

    setDuplicateContractId(
      null
    );


    try {

      const formData =
        new FormData();


      formData.append(
        "file",
        file
      );


      formData.append(
        "contract_json",
        JSON.stringify(
          reviewedContract
        )
      );


      const response =
        await authFetch(
          "/contracts/save",
          {
            method:
              "POST",

            body:
              formData,
          }
        );


      const data =
        await response.json();


      if (
        !response.ok
      ) {

        handleApiError(
          response.status,
          data as ErrorResponse,
          "Contract could not be saved."
        );

        return;
      }


      setSavedResult(
        data as SaveResponse
      );


    } catch (
      err
    ) {

      if (
        err instanceof Error
        &&
        err.message ===
          "AUTH_REQUIRED"
      ) {

        setError(
          "Please sign in before saving this contract."
        );

        return;
      }


      console.error(
        "Contract save error:",
        err
      );


      setError(
        "Could not save the reviewed contract."
      );


    } finally {

      setSaving(
        false
      );
    }
  }


  function updateTextField(
    field: keyof ContractData,
    value: string
  ) {

    if (
      !reviewedContract
    ) {
      return;
    }


    setReviewedContract({
      ...reviewedContract,

      [field]:
        value.trim() === ""
          ? null
          : value,
    });
  }


  function updateNumberField(
    field: keyof ContractData,
    value: string
  ) {

    if (
      !reviewedContract
    ) {
      return;
    }


    if (
      value === ""
    ) {

      setReviewedContract({
        ...reviewedContract,

        [field]:
          null,
      });

      return;
    }


    const numberValue =
      Number(
        value
      );


    if (
      Number.isNaN(
        numberValue
      )
    ) {
      return;
    }


    setReviewedContract({
      ...reviewedContract,

      [field]:
        numberValue,
    });
  }


  function updateBooleanField(
    value: string
  ) {

    if (
      !reviewedContract
    ) {
      return;
    }


    let parsedValue:
      boolean | null =
      null;


    if (
      value === "true"
    ) {

      parsedValue =
        true;

    } else if (
      value === "false"
    ) {

      parsedValue =
        false;
    }


    setReviewedContract({
      ...reviewedContract,

      auto_renewal:
        parsedValue,
    });
  }


  function formatDate(
    value: string | null
  ) {

    if (
      !value
    ) {

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

    switch (
      risk
    ) {

      case "critical":

        return (
          "border-red-200 " +
          "bg-red-50 " +
          "text-red-700"
        );


      case "urgent":

        return (
          "border-orange-200 " +
          "bg-orange-50 " +
          "text-orange-700"
        );


      case "attention":

        return (
          "border-amber-200 " +
          "bg-amber-50 " +
          "text-amber-800"
        );


      case "safe":

        return (
          "border-emerald-200 " +
          "bg-emerald-50 " +
          "text-emerald-700"
        );


      default:

        return (
          "border-slate-200 " +
          "bg-slate-100 " +
          "text-slate-700"
        );
    }
  }


  return (

    <AuthGuard>

      <main className="min-h-screen bg-slate-50 text-slate-950">

        <AppNavbar />


        <div className="mx-auto max-w-7xl px-6 py-10 lg:py-12">


          {/* HEADER */}

          <header className="mb-8 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">

            <div>

              <p className="renewai-eyebrow">
                Contract intelligence
              </p>


              <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                Analyze Contract
              </h1>


              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                Upload a PDF, review the information extracted by AI,
                correct anything that needs attention and save the
                final contract to your workspace.
              </p>

            </div>


            <div className="flex flex-wrap gap-3">

              <Link
                href="/contracts"
                className="renewai-button-secondary"
              >
                View Contracts
              </Link>


              <Link
                href="/reminders"
                className="renewai-button-secondary"
              >
                Renewal Alerts
              </Link>

            </div>

          </header>


          {/* WORKFLOW HERO */}

          <section className="mb-6 overflow-hidden rounded-[1.75rem] bg-slate-950 p-7 text-white shadow-sm lg:p-8">

            <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">

              <div>

                <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5">

                  <span className="h-2 w-2 rounded-full bg-blue-400" />

                  <span className="text-xs font-semibold text-slate-300">
                    Human-reviewed AI extraction
                  </span>

                </div>


                <h2 className="mt-5 max-w-xl text-2xl font-bold tracking-tight !text-white sm:text-3xl">
                  Turn a contract PDF into actionable renewal intelligence.
                </h2>


                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
                  RenewAI extracts key commercial terms, calculates renewal
                  deadlines and lets you verify every important field before
                  anything is saved.
                </p>

              </div>


              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">

                <WorkflowPoint
                  number="01"
                  title="Upload"
                  description="Choose a readable PDF."
                />


                <WorkflowPoint
                  number="02"
                  title="Review"
                  description="Verify AI-extracted terms."
                />


                <WorkflowPoint
                  number="03"
                  title="Save"
                  description="Create reminders automatically."
                />

              </div>

            </div>

          </section>


          {/* STEP INDICATOR */}

          <section className="mb-6 grid gap-3 sm:grid-cols-3">

            <StepCard
              number="1"
              title="Upload & Analyze"
              active={
                !analysis
                &&
                !savedResult
              }
              complete={
                !!analysis
              }
            />


            <StepCard
              number="2"
              title="Review Details"
              active={
                !!analysis
                &&
                !savedResult
              }
              complete={
                !!savedResult
              }
            />


            <StepCard
              number="3"
              title="Save Contract"
              active={
                !!savedResult
              }
              complete={
                !!savedResult
              }
            />

          </section>


          {/* UPLOAD */}

          <section className="renewai-card overflow-hidden">

            <div className="border-b border-slate-200 px-6 py-5 sm:px-7">

              <p className="renewai-eyebrow">
                Step 1
              </p>


              <h2 className="mt-2 text-xl font-bold text-slate-950">
                Upload contract PDF
              </h2>


              <p className="mt-2 text-sm leading-6 text-slate-600">
                RenewAI currently supports text-readable PDF contracts.
              </p>

            </div>


            <div className="p-6 sm:p-7">

              <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">

                <div>

                  <label className="renewai-label">
                    Contract PDF
                  </label>


                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 transition hover:border-slate-400">

                    <input
                      type="file"
                      accept="application/pdf"

                      disabled={
                        analyzing
                        ||
                        saving
                      }

                      onChange={
                        (event) => {

                          setFile(
                            event.target.files?.[0]
                            ||
                            null
                          );

                          resetAnalysis();
                        }
                      }

                      className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-950 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800"
                    />


                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      PDF only. Scanned image-only contracts may require OCR.
                    </p>

                  </div>


                  {
                    file
                    &&
                    (

                      <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">

                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">
                          PDF
                        </div>


                        <div className="min-w-0">

                          <p className="truncate text-sm font-semibold text-slate-900">
                            {file.name}
                          </p>


                          <p className="mt-0.5 text-xs text-slate-500">
                            Ready for analysis
                          </p>

                        </div>

                      </div>

                    )
                  }

                </div>


                <button
                  type="button"

                  onClick={
                    handleAnalyze
                  }

                  disabled={
                    analyzing
                    ||
                    saving
                    ||
                    !file
                  }

                  className="renewai-button-primary min-w-[170px]"
                >

                  {
                    analyzing
                      ? "Analyzing..."
                      : analysis
                      ? "Analyze Again"
                      : "Analyze Contract"
                  }

                </button>

              </div>


              {
                error
                &&
                (

                  <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5">

                    <p className="text-sm font-semibold text-red-800">
                      {error}
                    </p>


                    {
                      duplicateContractId
                      &&
                      (

                        <Link
                          href={
                            `/contracts/${duplicateContractId}`
                          }

                          className="mt-3 inline-flex text-sm font-bold text-red-900 underline underline-offset-4"
                        >
                          View existing contract →
                        </Link>

                      )
                    }

                  </div>

                )
              }

            </div>

          </section>


          {/* ANALYZING */}

          {
            analyzing
            &&
            (

              <section className="mt-6 renewai-card p-12 text-center">

                <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />


                <h2 className="text-lg font-bold text-slate-950">
                  Reading your contract
                </h2>


                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Extracting commercial terms, renewal language,
                  cancellation requirements and renewal intelligence.
                </p>

              </section>

            )
          }


          {/* REVIEW */}

          {
            analysis
            &&
            reviewedContract
            &&
            !savedResult
            &&
            !analyzing
            &&
            (

              <div className="mt-6 space-y-6">


                <section className="rounded-[1.5rem] border border-blue-200 bg-blue-50 p-6 sm:p-7">

                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">

                    <div>

                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                        Review required
                      </p>


                      <h2 className="mt-2 text-xl font-bold text-blue-950">
                        Verify the AI-extracted information
                      </h2>


                      <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-800">
                        AI can make mistakes. Correct any field that does not
                        match the uploaded agreement. RenewAI recalculates
                        renewal intelligence after your reviewed values are saved.
                      </p>

                    </div>


                    <span className="inline-flex w-fit rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-bold text-blue-700">
                      Human review
                    </span>

                  </div>

                </section>


                {/* CONTRACT INFORMATION */}

                <ReviewSection
                  eyebrow="Commercial terms"
                  title="Contract Information"
                  description="Confirm the core business information extracted from the agreement."
                >

                  <div className="grid gap-5 md:grid-cols-2">

                    <FormField
                      label="Vendor Name"
                    >

                      <input
                        type="text"

                        value={
                          reviewedContract.vendor_name
                          ??
                          ""
                        }

                        onChange={
                          (event) =>
                            updateTextField(
                              "vendor_name",
                              event.target.value
                            )
                        }

                        className="renewai-input"
                      />

                    </FormField>


                    <FormField
                      label="Contract Title"
                    >

                      <input
                        type="text"

                        value={
                          reviewedContract.contract_title
                          ??
                          ""
                        }

                        onChange={
                          (event) =>
                            updateTextField(
                              "contract_title",
                              event.target.value
                            )
                        }

                        className="renewai-input"
                      />

                    </FormField>


                    <FormField
                      label="Contract Value"
                    >

                      <input
                        type="number"
                        min="0"
                        step="0.01"

                        value={
                          reviewedContract.contract_value
                          ??
                          ""
                        }

                        onChange={
                          (event) =>
                            updateNumberField(
                              "contract_value",
                              event.target.value
                            )
                        }

                        className="renewai-input"
                      />

                    </FormField>


                    <FormField
                      label="Currency"
                    >

                      <input
                        type="text"
                        placeholder="INR, USD, EUR..."

                        value={
                          reviewedContract.currency
                          ??
                          ""
                        }

                        onChange={
                          (event) =>
                            updateTextField(
                              "currency",
                              event.target.value.toUpperCase()
                            )
                        }

                        className="renewai-input"
                      />

                    </FormField>

                  </div>

                </ReviewSection>


                {/* DATES */}

                <ReviewSection
                  eyebrow="Contract timeline"
                  title="Dates"
                  description="Review dates explicitly stated in the agreement."
                >

                  <div className="grid gap-5 md:grid-cols-3">

                    <FormField
                      label="Start Date"
                    >

                      <input
                        type="date"

                        value={
                          reviewedContract.start_date
                          ??
                          ""
                        }

                        onChange={
                          (event) =>
                            updateTextField(
                              "start_date",
                              event.target.value
                            )
                        }

                        className="renewai-input"
                      />

                    </FormField>


                    <FormField
                      label="End Date"
                    >

                      <input
                        type="date"

                        value={
                          reviewedContract.end_date
                          ??
                          ""
                        }

                        onChange={
                          (event) =>
                            updateTextField(
                              "end_date",
                              event.target.value
                            )
                        }

                        className="renewai-input"
                      />

                    </FormField>


                    <FormField
                      label="Explicit Renewal Date"
                    >

                      <input
                        type="date"

                        value={
                          reviewedContract.renewal_date
                          ??
                          ""
                        }

                        onChange={
                          (event) =>
                            updateTextField(
                              "renewal_date",
                              event.target.value
                            )
                        }

                        className="renewai-input"
                      />

                    </FormField>

                  </div>

                </ReviewSection>


                {/* RENEWAL TERMS */}

                <ReviewSection
                  eyebrow="Renewal mechanics"
                  title="Renewal Terms"
                  description="These fields drive RenewAI's cancellation deadline and reminder calculations."
                >

                  <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">

                    <FormField
                      label="Initial Term (months)"
                    >

                      <input
                        type="number"
                        min="0"
                        step="1"

                        value={
                          reviewedContract.initial_term_months
                          ??
                          ""
                        }

                        onChange={
                          (event) =>
                            updateNumberField(
                              "initial_term_months",
                              event.target.value
                            )
                        }

                        className="renewai-input"
                      />

                    </FormField>


                    <FormField
                      label="Renewal Term (months)"
                    >

                      <input
                        type="number"
                        min="0"
                        step="1"

                        value={
                          reviewedContract.renewal_term_months
                          ??
                          ""
                        }

                        onChange={
                          (event) =>
                            updateNumberField(
                              "renewal_term_months",
                              event.target.value
                            )
                        }

                        className="renewai-input"
                      />

                    </FormField>


                    <FormField
                      label="Notice Period (days)"
                    >

                      <input
                        type="number"
                        min="0"
                        step="1"

                        value={
                          reviewedContract.notice_period_days
                          ??
                          ""
                        }

                        onChange={
                          (event) =>
                            updateNumberField(
                              "notice_period_days",
                              event.target.value
                            )
                        }

                        className="renewai-input"
                      />

                    </FormField>


                    <FormField
                      label="Auto Renewal"
                    >

                      <select
                        value={
                          reviewedContract.auto_renewal === null

                            ? "unknown"

                            : reviewedContract.auto_renewal

                            ? "true"

                            : "false"
                        }

                        onChange={
                          (event) =>
                            updateBooleanField(
                              event.target.value
                            )
                        }

                        className="renewai-input"
                      >

                        <option value="unknown">
                          Unknown
                        </option>

                        <option value="true">
                          Yes
                        </option>

                        <option value="false">
                          No
                        </option>

                      </select>

                    </FormField>

                  </div>

                </ReviewSection>


                {/* CONTRACT LANGUAGE */}

                <ReviewSection
                  eyebrow="Contract evidence"
                  title="Extracted Contract Language"
                  description="Keep these fields aligned with the actual language in the agreement."
                >

                  <div className="space-y-6">

                    <FormField
                      label="Renewal Clause"
                    >

                      <textarea
                        rows={5}

                        value={
                          reviewedContract.renewal_clause
                          ??
                          ""
                        }

                        onChange={
                          (event) =>
                            updateTextField(
                              "renewal_clause",
                              event.target.value
                            )
                        }

                        className="renewai-input resize-y"
                      />

                    </FormField>


                    <FormField
                      label="Termination / Cancellation Clause"
                    >

                      <textarea
                        rows={5}

                        value={
                          reviewedContract.termination_clause
                          ??
                          ""
                        }

                        onChange={
                          (event) =>
                            updateTextField(
                              "termination_clause",
                              event.target.value
                            )
                        }

                        className="renewai-input resize-y"
                      />

                    </FormField>


                    <FormField
                      label="Payment Terms"
                    >

                      <textarea
                        rows={3}

                        value={
                          reviewedContract.payment_terms
                          ??
                          ""
                        }

                        onChange={
                          (event) =>
                            updateTextField(
                              "payment_terms",
                              event.target.value
                            )
                        }

                        className="renewai-input resize-y"
                      />

                    </FormField>

                  </div>

                </ReviewSection>


                {/* AI PREVIEW */}

                <section className="grid gap-6 lg:grid-cols-2">

                  <div className="renewai-card p-6 sm:p-7">

                    <p className="renewai-eyebrow">
                      Calculated dates
                    </p>


                    <h2 className="mt-2 text-xl font-bold text-slate-950">
                      AI Analysis Preview
                    </h2>


                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      These values were calculated from the original extraction.
                      They will be recalculated after your reviewed values are saved.
                    </p>


                    <div className="mt-6 space-y-5">

                      <DetailRow
                        label="Effective Start"
                        value={
                          formatDate(
                            analysis
                              .renewal_intelligence
                              .effective_start_date
                          )
                        }
                      />


                      <DetailRow
                        label="Effective End"
                        value={
                          formatDate(
                            analysis
                              .renewal_intelligence
                              .effective_end_date
                          )
                        }
                      />


                      <DetailRow
                        label="Renewal Date"
                        value={
                          formatDate(
                            analysis
                              .renewal_intelligence
                              .effective_renewal_date
                          )
                        }
                      />


                      <DetailRow
                        label="Cancellation Deadline"
                        value={
                          formatDate(
                            analysis
                              .renewal_intelligence
                              .cancellation_deadline
                          )
                        }
                      />

                    </div>

                  </div>


                  <div className="renewai-card p-6 sm:p-7">

                    <p className="renewai-eyebrow">
                      Renewal decision
                    </p>


                    <h2 className="mt-2 text-xl font-bold text-slate-950">
                      AI Recommendation
                    </h2>


                    <div
                      className={`mt-5 rounded-2xl border p-5 ${riskClasses(
                        analysis
                          .renewal_intelligence
                          .risk_level
                      )}`}
                    >

                      <p className="text-xs font-bold uppercase tracking-[0.14em]">
                        {
                          analysis
                            .renewal_intelligence
                            .risk_level
                        }
                      </p>


                      {
                        analysis
                          .renewal_intelligence
                          .days_until_cancellation_deadline
                        !== null
                        &&
                        (

                          <p className="mt-2 text-3xl font-bold tracking-tight">
                            {
                              analysis
                                .renewal_intelligence
                                .days_until_cancellation_deadline
                            }{" "}
                            days
                          </p>

                        )
                      }


                      <p className="mt-3 text-sm leading-7">
                        {
                          analysis
                            .renewal_intelligence
                            .recommendation
                        }
                      </p>

                    </div>

                  </div>

                </section>


                {/* SAVE */}

                <section className="rounded-[1.5rem] bg-slate-950 p-6 text-white shadow-sm sm:p-7">

                  <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">

                    <div>

                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
                        Final review
                      </p>


                      <h2 className="mt-2 text-xl font-bold !text-white">
                        Ready to save this contract?
                      </h2>


                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                        RenewAI will use your reviewed values to recalculate
                        renewal dates, cancellation deadlines, risk level
                        and reminder schedules before saving.
                      </p>

                    </div>


                    <div className="flex flex-wrap gap-3">

                      <button
                        type="button"

                        onClick={
                          () => {

                            setAnalysis(
                              null
                            );

                            setReviewedContract(
                              null
                            );

                            setError(
                              ""
                            );
                          }
                        }

                        disabled={
                          saving
                        }

                        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
                      >
                        Start Over
                      </button>


                      <button
                        type="button"

                        onClick={
                          handleSave
                        }

                        disabled={
                          saving
                        }

                        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >

                        {
                          saving
                            ? "Saving Contract..."
                            : "Confirm & Save Contract"
                        }

                      </button>

                    </div>

                  </div>

                </section>

              </div>

            )
          }


          {/* SAVING */}

          {
            saving
            &&
            (

              <section className="mt-6 renewai-card p-12 text-center">

                <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />


                <h2 className="text-lg font-bold text-slate-950">
                  Saving reviewed contract
                </h2>


                <p className="mt-2 text-sm text-slate-500">
                  Recalculating renewal intelligence and creating reminders.
                </p>

              </section>

            )
          }


          {/* SAVED RESULT */}

          {
            savedResult
            &&
            !saving
            &&
            (

              <div className="mt-6 space-y-6">


                <section className="overflow-hidden rounded-[1.5rem] border border-emerald-200 bg-emerald-50">

                  <div className="p-6 sm:p-7">

                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">

                      <div>

                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                          Contract saved
                        </p>


                        <h2 className="mt-2 text-3xl font-bold tracking-tight text-emerald-950">

                          {
                            savedResult.contract.vendor_name
                            ||
                            "Contract"
                          }

                        </h2>


                        <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-800">
                          Your reviewed contract has been saved and its renewal
                          intelligence has been recalculated.
                        </p>

                      </div>


                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-bold text-white">
                        ✓
                      </div>

                    </div>


                    {
                      typeof savedResult.reminder_count ===
                      "number"
                      &&
                      (

                        <div className="mt-5 inline-flex rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700">

                          {
                            savedResult.reminder_count
                          }{" "}
                          reminder{
                            savedResult.reminder_count === 1
                              ? ""
                              : "s"
                          } created

                        </div>

                      )
                    }

                  </div>

                </section>


                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

                  <InfoCard
                    label="Renewal Date"
                    value={
                      formatDate(
                        savedResult
                          .renewal_intelligence
                          .effective_renewal_date
                      )
                    }
                  />


                  <InfoCard
                    label="Cancel By"
                    value={
                      formatDate(
                        savedResult
                          .renewal_intelligence
                          .cancellation_deadline
                      )
                    }
                  />


                  <InfoCard
                    label="Notice Period"
                    value={
                      savedResult
                        .contract
                        .notice_period_days
                      !== null

                        ? `${savedResult.contract.notice_period_days} days`

                        : "Not found"
                    }
                  />


                  <InfoCard
                    label="Risk"
                    value={
                      savedResult
                        .renewal_intelligence
                        .risk_level
                    }
                  />

                </section>


                <section className="renewai-card flex flex-col justify-between gap-5 p-6 md:flex-row md:items-center">

                  <div>

                    <p className="renewai-eyebrow">
                      Next step
                    </p>


                    <h3 className="mt-2 font-bold text-slate-950">
                      Contract is now in your RenewAI workspace
                    </h3>


                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Open it to review full renewal intelligence and
                      the reminder timeline.
                    </p>

                  </div>


                  <div className="flex flex-wrap gap-3">

                    <Link
                      href="/contracts"
                      className="renewai-button-secondary"
                    >
                      View Contracts
                    </Link>


                    <Link
                      href={
                        `/contracts/${savedResult.database_id}`
                      }
                      className="renewai-button-primary"
                    >
                      Open Contract →
                    </Link>

                  </div>

                </section>

              </div>

            )
          }

        </div>

      </main>

    </AuthGuard>
  );
}


function WorkflowPoint({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {

  return (

    <div className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">

      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-bold text-slate-950">
        {number}
      </div>


      <div>

        <p className="text-sm font-bold text-white">
          {title}
        </p>


        <p className="mt-0.5 text-xs text-slate-400">
          {description}
        </p>

      </div>

    </div>
  );
}


function StepCard({
  number,
  title,
  active,
  complete,
}: {
  number: string;
  title: string;
  active: boolean;
  complete: boolean;
}) {

  return (

    <div
      className={
        active
          ? "rounded-2xl border border-blue-600 bg-blue-600 p-4 text-white shadow-sm"
          : complete
          ? "rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"
          : "rounded-2xl border border-slate-200 bg-white p-4 text-slate-600"
      }
    >

      <div className="flex items-center gap-3">

        <span
          className={
            active
              ? "flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-blue-700"
              : complete
              ? "flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white"
              : "flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600"
          }
        >

          {
            complete
              ? "✓"
              : number
          }

        </span>


        <span className="text-sm font-bold">
          {title}
        </span>

      </div>

    </div>
  );
}


function ReviewSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {

  return (

    <section className="renewai-card p-6 sm:p-7">

      <div>

        <p className="renewai-eyebrow">
          {eyebrow}
        </p>


        <h2 className="mt-2 text-xl font-bold text-slate-950">
          {title}
        </h2>


        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          {description}
        </p>

      </div>


      <div className="mt-7">
        {children}
      </div>

    </section>
  );
}


function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {

  return (

    <div>

      <label className="renewai-label">
        {label}
      </label>


      {children}

    </div>
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

    <div className="renewai-card p-5">

      <p className="text-sm font-medium text-slate-500">
        {label}
      </p>


      <p className="mt-2 break-words text-lg font-bold text-slate-950">
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

      <span className="text-sm font-medium text-slate-500">
        {label}
      </span>


      <span className="max-w-sm text-right text-sm font-bold text-slate-800">
        {value}
      </span>

    </div>
  );
}