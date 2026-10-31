"use client";

import { formatTimingRisk, formatAIAnalysisStatus } from "@/lib/statusLabels";

import ProvenanceBadge from "@/components/ProvenanceBadge";

import {
  useId,
  useRef,
  useState,
} from "react";

import Link from "next/link";

import {
  authFetch,
} from "@/lib/authFetch";

import {
  AI_ANALYSIS_UNAVAILABLE,
  generateRenewalAIInsight,
} from "@/lib/renewalAI";


type ContractData = {
  vendor_name: string | null;
  customer_name?: string | null;
  contract_title: string | null;

  contract_value: number | null;
  currency: string | null;

  start_date: string | null;
  end_date: string | null;
  renewal_date: string | null;

  cancellation_deadline: string | null;

  initial_term_months: number | null;
  renewal_term_months: number | null;

  renewal_structure:
  | "fixed_term"
  | "fixed_term_auto_renewal"
  | "evergreen_indefinite"
  | null;

  notice_period_days: number | null;

  notice_period_value: number | null;
  notice_period_unit: string | null;

  notice_window_start_value: number | null;
  notice_window_start_unit: string | null;
  notice_window_end_value: number | null;
  notice_window_end_unit: string | null;

  notice_period_anchor: string | null;

  auto_renewal: boolean | null;

  renewal_clause: string | null;
  termination_clause: string | null;
  payment_terms: string | null;

  pricing_clause: string | null;
  minimum_commitment: string | null;
  refund_clause: string | null;
};


type RenewalIntelligence = {
  effective_start_date: string | null;
  effective_end_date: string | null;
  effective_renewal_date: string | null;

  derived_end_date: string | null;
  derived_renewal_date: string | null;

  notice_window_open_date: string | null;
  notice_window_close_date: string | null;

  cancellation_deadline: string | null;

  days_until_cancellation_deadline:
    number | null;

  risk_level: string;

  recommendation: string;
};


export type AnalysisResponse = {
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

  reminder_count?: number | null;
  reminder_warning?: string | null;

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


export default function ContractUploadReview({ file, initialAnalysis, onStatus }: {
  file: File;
  initialAnalysis: AnalysisResponse;
  onStatus: (status: "saving" | "save_failed" | "saved" | "duplicate", existingId?: string) => void;
}) {
  const reviewId = useId();
  const saveLock = useRef(false);
  const [aiStatus, setAIStatus] = useState<
    "not_started" | "running" | "completed" | "failed"
  >("not_started");
  const [aiError, setAIError] = useState("");
  const aiRequestId = useRef(0);

  const analysis = initialAnalysis;

  const [
    reviewedContract,
    setReviewedContract,
  ] =
    useState<ContractData | null>(() => ({ ...initialAnalysis.contract }));


  const [
    savedResult,
    setSavedResult,
  ] =
    useState<SaveResponse | null>(
      null
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


  async function runSavedAIAnalysis(contractId: string) {
    const requestId = ++aiRequestId.current;
    setAIStatus("running");
    setAIError("");

    try {
      await generateRenewalAIInsight(contractId);
      if (aiRequestId.current === requestId) {
        setAIStatus("completed");
      }
    } catch (err) {
      if (aiRequestId.current === requestId) {
        setAIStatus("failed");
        setAIError(err instanceof Error ? err.message : AI_ANALYSIS_UNAVAILABLE);
      }
    }
  }

  async function handleSave() {
    if (saveLock.current || savedResult || duplicateContractId) return;
    saveLock.current = true;
    onStatus("saving");

    if (
      !file
      ||
      !reviewedContract
    ) {

      setError(
        "There is no reviewed contract to save."
      );

      saveLock.current = false;
      onStatus("save_failed");
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
        onStatus(response.status === 409 ? "duplicate" : "save_failed",
          typeof data.detail === "object" ? data.detail?.existing_contract_id : undefined);

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

      onStatus("saved");

      // Saving is complete. The separate AI request owns its own failure state.
      setSaving(false);
      void runSavedAIAnalysis((data as SaveResponse).database_id);


    } catch (
      err
    ) {
      onStatus("save_failed");

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
        "We couldn't confirm whether your contract was saved. Check Contracts before trying again."
      );


    } finally {
      saveLock.current = false;

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

  function updateRenewalStructure(
    value: string
  ) {

    if (
      !reviewedContract
    ) {
      return;
    }


    const structure =
      value === "unknown"
        ? null
        : value as
            | "fixed_term"
            | "fixed_term_auto_renewal"
            | "evergreen_indefinite";


    setReviewedContract(
      (current) => {

        if (!current) {
          return current;
        }


        if (
          structure ===
          "fixed_term_auto_renewal"
        ) {

          return {
            ...current,

            renewal_structure:
              structure,

            auto_renewal:
              true,
          };
        }


        if (
          structure ===
          "fixed_term"
        ) {

          return {
            ...current,

            renewal_structure:
              structure,

            auto_renewal:
              false,

            renewal_term_months:
              null,

            renewal_date:
              null,
          };
        }


        if (
          structure ===
          "evergreen_indefinite"
        ) {

          return {
            ...current,

            renewal_structure:
              structure,

            auto_renewal:
              false,

            renewal_term_months:
              null,

            renewal_date:
              null,

            notice_period_anchor:
              null,
          };
        }


        return {
          ...current,

          renewal_structure:
            null,
        };
      }
    );
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


    setReviewedContract(
      (current) => {

        if (!current) {
          return current;
        }


        if (
          parsedValue === true
        ) {

          return {
            ...current,

            auto_renewal:
              true,

            renewal_structure:
              "fixed_term_auto_renewal",
          };
        }


        if (
          parsedValue === false
        ) {

          return {
            ...current,

            auto_renewal:
              false,

            renewal_structure:
              current.renewal_structure ===
              "evergreen_indefinite"
                ? "evergreen_indefinite"
                : "fixed_term",
          };
        }


        return {
          ...current,

          auto_renewal:
            null,

          renewal_structure:
            null,
        };
      }
    );
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
    <fieldset disabled={saving || !!duplicateContractId} className="min-w-0">
      <legend className="mb-3 break-all text-lg font-bold">{file.name}</legend>
              {
                error
                &&
                (

                  <div role="alert" className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5">

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


          {/* SAVING */}

          {
            saving
            &&
            (

              <section role="status" aria-live="polite" className="mb-6 renewai-card p-8 text-center">

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


          {/* REVIEW */}

          {
            analysis
            &&
            reviewedContract
            &&
            !savedResult
            &&
            (

              <div className="mt-6 space-y-6">


                <section className="rounded-[1.5rem] border border-blue-200 bg-blue-50 p-6 sm:p-7">

                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">

                    <div>

                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                        Step 2 · Review required
                      </p>


                      <h2 className="renewai-card-title mt-2 text-blue-950">
                        Review the terms before saving
                      </h2>


                      <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-800">
                        Start with dates, notice requirements and value, then confirm
                        the contract language. AI can make mistakes. Blank fields
                        may be unknown or not applicable; verify them in your agreement
                        and leave unknown terms blank.
                      </p>

                    </div>


                    <ProvenanceBadge kind="extraction" />

                  </div>

                </section>


                <p role="status" className="text-sm font-semibold text-slate-700">
                  Extraction complete. Your contract has not been saved yet.
                </p>
                <nav aria-label="Review sections" className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-brand-link">
                  <a href={`#${reviewId}-review-dates`} className="renewai-link renewai-touch-target underline underline-offset-4">Dates & value</a>
                  <a href={`#${reviewId}-review-renewal`} className="renewai-link renewai-touch-target underline underline-offset-4">Renewal & notice</a>
                  <a href={`#${reviewId}-review-identity`} className="renewai-link renewai-touch-target underline underline-offset-4">Contract identity</a>
                  <a href={`#${reviewId}-review-evidence`} className="renewai-link renewai-touch-target underline underline-offset-4">Contract language</a>
                  <a href={`#${reviewId}-review-preview`} className="renewai-link renewai-touch-target underline underline-offset-4">Calculation preview</a>
                  <a href={`#${reviewId}-review-save`} className="renewai-link renewai-touch-target underline underline-offset-4">Save contract</a>
                </nav>


                {/* DATES AND VALUE */}

                <ReviewSection
                  id={`${reviewId}-review-dates`}
                  eyebrow="Key facts"
                  title="Dates & value"
                  description="Check the agreement's explicit dates and contract value. Calculated dates appear in the preview below."
                >
                  <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                    <FormField htmlFor={`${reviewId}-review-explicit-renewal-date`} help="Only enter a renewal date explicitly stated in the agreement."
                      label="Explicit Renewal Date"
                    >

                      <input id={`${reviewId}-review-explicit-renewal-date`} aria-describedby={`${reviewId}-review-explicit-renewal-date-hint`}
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

                    <FormField htmlFor={`${reviewId}-review-explicit-cancellation-deadline`} help="Only enter an explicit deadline from the agreement. Calculated deadlines appear in the preview."
  label="Explicit Cancellation Deadline"
>
  <input id={`${reviewId}-review-explicit-cancellation-deadline`} aria-describedby={`${reviewId}-review-explicit-cancellation-deadline-hint`}
    type="date"

    value={
      reviewedContract.cancellation_deadline
      ??
      ""
    }

    onChange={
      (event) =>
        updateTextField(
          "cancellation_deadline",
          event.target.value
        )
    }

    className="renewai-input"
  />
</FormField>

                    <FormField htmlFor={`${reviewId}-review-contract-value`} help="Keep the stated amount; do not assume it is annual."
                      label="Contract Value"
                    >

                      <input id={`${reviewId}-review-contract-value`} aria-describedby={`${reviewId}-review-contract-value-hint`}
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

                    <FormField htmlFor={`${reviewId}-review-currency`} help="Use the currency stated in the agreement."
                      label="Currency"
                    >

                      <input id={`${reviewId}-review-currency`} aria-describedby={`${reviewId}-review-currency-hint`}
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

                    <FormField htmlFor={`${reviewId}-review-start-date`}
                      label="Start Date"
                    >

                      <input id={`${reviewId}-review-start-date`}
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

                    <FormField htmlFor={`${reviewId}-review-end-date`}
                      label="End Date"
                    >

                      <input id={`${reviewId}-review-end-date`}
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
                  </div>
                </ReviewSection>


                {/* RENEWAL TERMS */}

                <ReviewSection
                  id={`${reviewId}-review-renewal`}
                  eyebrow="Renewal mechanics"
                  title="Renewal & notice terms"
                  description="These fields drive RenewAI's cancellation deadline and reminder calculations."
                >

                  <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">

                    <FormField htmlFor={`${reviewId}-review-renewal-structure`}
                      label="Renewal Structure"
                    >

                      <select id={`${reviewId}-review-renewal-structure`}
                        value={
                          reviewedContract
                            .renewal_structure
                          ??
                          "unknown"
                        }

                        onChange={
                          (event) =>
                            updateRenewalStructure(
                              event.target.value
                            )
                        }

                        className="renewai-input"
                      >

                        <option value="unknown">
                          Not found
                        </option>

                        <option value="fixed_term">
                          Fixed Term
                        </option>

                        <option value="fixed_term_auto_renewal">
                          Fixed-Term Auto Renewal
                        </option>

                        <option value="evergreen_indefinite">
                          Evergreen / Indefinite
                        </option>

                      </select>

                    </FormField>

                    <FormField htmlFor={`${reviewId}-review-auto-renewal`}
                      label="Auto Renewal"
                    >

                      <select id={`${reviewId}-review-auto-renewal`}
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








                    {(
  reviewedContract.notice_window_start_value !== null
  ||
  reviewedContract.notice_window_end_value !== null
) && (
  <div className="space-y-4 md:col-span-2">
    <div className="text-sm font-medium text-slate-700">
      Notice Window
    </div>

    <FormField htmlFor={`${reviewId}-review-window-opens`} label="Window Opens">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <input id={`${reviewId}-review-window-opens`}
          type="number"
          min="0"
          step="1"
          value={
            reviewedContract.notice_window_start_value
            ?? ""
          }
          onChange={(event) => {
            const value =
              event.target.value === ""
                ? null
                : Number(event.target.value);

            setReviewedContract(
              (current) =>
                current
                  ? {
                      ...current,
                      notice_window_start_value: value,
                    }
                  : current
            );
          }}
          className="renewai-input"
        />

        <select id={`${reviewId}-review-window-opens-unit`} aria-label="Window Opens unit"
          value={
            reviewedContract.notice_window_start_unit
            ?? "unknown"
          }
          onChange={(event) => {
            const unit =
              event.target.value === "unknown"
                ? null
                : event.target.value;

            setReviewedContract(
              (current) =>
                current
                  ? {
                      ...current,
                      notice_window_start_unit: unit,
                    }
                  : current
            );
          }}
          className="renewai-input"
        >
          <option value="unknown">
            Unit
          </option>

          <option value="days">
            Days
          </option>

          <option value="months">
            Months
          </option>

          <option value="business_days">
            Business Days
          </option>
        </select>
      </div>
    </FormField>

    <FormField htmlFor={`${reviewId}-review-window-closes`} label="Window Closes">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <input id={`${reviewId}-review-window-closes`}
          type="number"
          min="0"
          step="1"
          value={
            reviewedContract.notice_window_end_value
            ?? ""
          }
          onChange={(event) => {
            const value =
              event.target.value === ""
                ? null
                : Number(event.target.value);

            setReviewedContract(
              (current) =>
                current
                  ? {
                      ...current,
                      notice_window_end_value: value,
                    }
                  : current
            );
          }}
          className="renewai-input"
        />

        <select id={`${reviewId}-review-window-closes-unit`} aria-label="Window Closes unit"
          value={
            reviewedContract.notice_window_end_unit
            ?? "unknown"
          }
          onChange={(event) => {
            const unit =
              event.target.value === "unknown"
                ? null
                : event.target.value;

            setReviewedContract(
              (current) =>
                current
                  ? {
                      ...current,
                      notice_window_end_unit: unit,
                    }
                  : current
            );
          }}
          className="renewai-input"
        >
          <option value="unknown">
            Unit
          </option>

          <option value="days">
            Days
          </option>

          <option value="months">
            Months
          </option>

          <option value="business_days">
            Business Days
          </option>
        </select>
      </div>
    </FormField>
  </div>
)}

{!(
  reviewedContract.notice_window_start_value !== null
  ||
  reviewedContract.notice_window_end_value !== null
) && (
<FormField htmlFor={`${reviewId}-review-notice-period`} help="Check the value and unit. Months and business days have distinct meanings."
  label="Notice Period"
>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">

                      <input id={`${reviewId}-review-notice-period`} aria-describedby={`${reviewId}-review-notice-period-hint`}
                        type="number"
                        min="0"
                        step="1"

                        value={
                          reviewedContract.notice_period_value
                          ??
                          reviewedContract.notice_period_days
                          ??
                          ""
                        }

                        onChange={
                          (event) => {
                            const value =
                              event.target.value === ""
                                ? null
                                : Number(event.target.value);

                            setReviewedContract(
                              (current) =>
                                current
                                  ? {
                                      ...current,

                                      notice_period_value:
                                        value,

                                      notice_period_days:
                                        (
                                          current.notice_period_unit === "months"
                                        )
                                          ? null
                                          : value,
                                    }
                                  : current
                            );
                          }
                        }

                        className="renewai-input"
                      />


                      <select id={`${reviewId}-review-notice-period-unit`} aria-label="Notice Period unit" aria-describedby={`${reviewId}-review-notice-period-hint`}
                        value={
                          reviewedContract.notice_period_unit
                          ??
                          (
                            reviewedContract.notice_period_days !== null
                              ? "days"
                              : "unknown"
                          )
                        }

                        onChange={
                          (event) => {
                            const unit =
                              event.target.value === "unknown"
                                ? null
                                : event.target.value;

                            setReviewedContract(
                              (current) => {
                                if (!current) {
                                  return current;
                                }

                                const value =
                                  current.notice_period_value
                                  ??
                                  current.notice_period_days;

                                return {
                                  ...current,

                                  notice_period_unit:
                                    unit,

                                  notice_period_value:
                                    value,

                                  notice_period_days:
                                    unit === "days"
                                      ? value
                                      : null,
                                };
                              }
                            );
                          }
                        }

                        className="renewai-input"
                      >
                        <option value="unknown">
                          Unit
                        </option>

                        <option value="days">
                          Days
                        </option>

                        <option value="months">
                          Months
                        </option>

                        <option value="business_days">
                          Business Days
                        </option>
                      </select>

                    </div>
                  </FormField>
                )}

                    <FormField htmlFor={`${reviewId}-review-notice-based-on`} help="Confirm which date the notice period is counted back from."
  label="Notice Based On"
>
  <select id={`${reviewId}-review-notice-based-on`} aria-describedby={`${reviewId}-review-notice-based-on-hint`}
    value={
      reviewedContract.notice_period_anchor
      ?? "unknown"
    }

    onChange={
      (event) =>
        setReviewedContract(
          (current) =>
            current
              ? {
                  ...current,
                  notice_period_anchor:
                    event.target.value === "unknown"
                      ? null
                      : event.target.value,
                }
              : current
        )
    }

    className="renewai-input"
  >
    <option value="unknown">
      Not found
    </option>

    <option value="end_date">
      Contract / Term End Date
    </option>

    <option value="renewal_date">
      Renewal Date
    </option>
  </select>
</FormField>




                    <FormField htmlFor={`${reviewId}-review-initial-term-months`}
                      label="Initial Term (months)"
                    >

                      <input id={`${reviewId}-review-initial-term-months`}
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

                    <FormField htmlFor={`${reviewId}-review-renewal-term-months`}
                      label="Renewal Term (months)"
                    >

                      <input id={`${reviewId}-review-renewal-term-months`}
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

                  </div>

                </ReviewSection>


                {/* CONTRACT INFORMATION */}

                <ReviewSection
                  id={`${reviewId}-review-identity`}
                  eyebrow="Agreement"
                  title="Contract identity"
                  description="Confirm the core business information extracted from the agreement."
                >

                  <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">

                    <FormField htmlFor={`${reviewId}-review-vendor-name`}
                      label="Vendor Name"
                    >

                      <input id={`${reviewId}-review-vendor-name`}
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


                    <FormField htmlFor={`${reviewId}-review-customer-name`} label="Customer Name">
                      <input id={`${reviewId}-review-customer-name`}
                        type="text"
                        aria-label="Customer Name"
                        value={reviewedContract.customer_name ?? ""}
                        onChange={(event) => updateTextField("customer_name", event.target.value)}
                        className="renewai-input"
                      />
                    </FormField>

                    <FormField htmlFor={`${reviewId}-review-contract-title`}
                      label="Contract Title"
                    >

                      <input id={`${reviewId}-review-contract-title`}
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







                  </div>

                </ReviewSection>


                {/* CONTRACT LANGUAGE */}

                <ReviewSection
                  id={`${reviewId}-review-evidence`}
                  eyebrow="Contract evidence"
                  title="Extracted Contract Language"
                  description="Keep these fields aligned with the actual language in the agreement."
                >

                  <div className="space-y-6">

                    <FormField htmlFor={`${reviewId}-review-renewal-clause`}
                      label="Renewal Clause"
                    >

                      <textarea id={`${reviewId}-review-renewal-clause`}
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


                    <FormField htmlFor={`${reviewId}-review-termination-cancellation-clause`}
                      label="Termination / Cancellation Clause"
                    >

                      <textarea id={`${reviewId}-review-termination-cancellation-clause`}
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


                    <FormField htmlFor={`${reviewId}-review-payment-terms`}
                      label="Payment Terms"
                    >

                      <textarea id={`${reviewId}-review-payment-terms`}
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

                    <FormField htmlFor={`${reviewId}-review-pricing-clause`}
                      label="Pricing Clause"
                    >

                      <textarea id={`${reviewId}-review-pricing-clause`}
                        rows={4}

                        value={
                          reviewedContract.pricing_clause
                          ??
                          ""
                        }

                        onChange={
                          (event) =>
                            updateTextField(
                              "pricing_clause",
                              event.target.value
                            )
                        }

                        className="renewai-input resize-y"
                      />

                    </FormField>


                    <FormField htmlFor={`${reviewId}-review-minimum-commitment`}
                      label="Minimum Commitment"
                    >

                      <textarea id={`${reviewId}-review-minimum-commitment`}
                        rows={4}

                        value={
                          reviewedContract.minimum_commitment
                          ??
                          ""
                        }

                        onChange={
                          (event) =>
                            updateTextField(
                              "minimum_commitment",
                              event.target.value
                            )
                        }

                        className="renewai-input resize-y"
                      />

                    </FormField>


                    <FormField htmlFor={`${reviewId}-review-refund-clause`}
                      label="Refund Clause"
                    >

                      <textarea id={`${reviewId}-review-refund-clause`}
                        rows={4}

                        value={
                          reviewedContract.refund_clause
                          ??
                          ""
                        }

                        onChange={
                          (event) =>
                            updateTextField(
                              "refund_clause",
                              event.target.value
                            )
                        }

                        className="renewai-input resize-y"
                      />

                    </FormField>

                  </div>

                </ReviewSection>


                {/* AI PREVIEW */}

                <section id={`${reviewId}-review-preview`} tabIndex={-1} aria-label="Calculation preview" className="grid scroll-mt-6 gap-6 lg:grid-cols-2">

                  <div className="renewai-card p-6 sm:p-7">

                    <p className="renewai-eyebrow">
                      Calculated dates
                    </p>


                    <h2 className="renewai-card-title mt-2">
                      Calculation preview
                    </h2>
                    <div className="mt-3"><ProvenanceBadge kind="rules" /></div>


                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      This preview uses the original extraction and does not update as you edit.
                      Saving recalculates the dates and timing risk from your reviewed terms.
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


{(
  analysis.contract.notice_window_start_value !== null
  ||
  analysis.contract.notice_window_end_value !== null
) && (
  <>
    <DetailRow
      label="Notice Window Opens"
      value={
        formatDate(
          analysis
            .renewal_intelligence
            .notice_window_open_date
        )
      }
    />

    <DetailRow
      label="Notice Window Closes"
      value={
        formatDate(
          analysis
            .renewal_intelligence
            .notice_window_close_date
        )
      }
    />
  </>
)}

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
  Deadline intelligence
</p>

<h2 className="renewai-card-title mt-2">
  Renewal Deadline Risk
</h2>


                    <div
                      className={`mt-5 rounded-2xl border p-5 ${riskClasses(
                        analysis
                          .renewal_intelligence
                          .risk_level
                      )}`}
                    >

                      <p className="text-xs font-bold">
                        {
                          formatTimingRisk(analysis.renewal_intelligence.risk_level)
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

                <section id={`${reviewId}-review-save`} tabIndex={-1} aria-label="Save reviewed contract" className="scroll-mt-6 rounded-[1.5rem] bg-slate-950 p-6 text-white shadow-sm sm:p-7">

                  <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">

                    <div>

                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
                        Step 3 · Save reviewed terms
                      </p>


                      <h2 className="renewai-card-title mt-2 !text-white">
                        Ready to save this contract?
                      </h2>


                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                      Save the reviewed terms and recalculate renewal dates and deadlines.
                      Reminder creation and AI renewal analysis have their own status
                      after the contract is saved.
                      </p>

                    </div>


                    <div className="flex flex-wrap gap-3">

                      <button
                        type="button"

                        onClick={
                          () => {

                            if (!window.confirm("Discard edits for this contract and restore the extracted terms?")) return;
                            setReviewedContract({ ...initialAnalysis.contract });

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
                        Reset review edits
                      </button>


                      <button
                        type="button"

                        onClick={
                          handleSave
                        }

                        disabled={
                          saving
                        }

                        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-action px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
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
                        <div className="mt-3"><ProvenanceBadge kind="saved" /></div>


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
                      savedResult.reminder_warning && (
                        <div role="status" className="mt-5 text-sm leading-6 text-amber-900">
                          {savedResult.reminder_warning}{" "}
                          <Link href="/reminders" className="renewai-link font-semibold underline">
                            Open Reminders
                          </Link>
                        </div>
                      )
                    }

                    <div role="status" aria-live="polite" className="mt-5 text-sm leading-6 text-emerald-900">
                      <p className="mb-2 text-xs font-semibold">AI analysis: {formatAIAnalysisStatus(aiStatus)}</p>
                      {aiStatus === "running" && "Your contract is saved. AI renewal analysis is in progress."}
                      {aiStatus === "completed" && "AI renewal analysis is ready. Open the contract to view it."}
                      {aiStatus === "failed" && aiError}
                      {(aiStatus === "failed" || aiStatus === "not_started") && (
                        <button
                          type="button"
                          onClick={() => void runSavedAIAnalysis(savedResult.database_id)}
                          className="renewai-button-secondary mt-3 block"
                        >
                          Retry AI analysis
                        </button>
                      )}
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

                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

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
  label={
    savedResult.contract.notice_window_start_value !== null
    || savedResult.contract.notice_window_end_value !== null
      ? "Notice Window"
      : "Notice Period"
  }
  value={
    savedResult.contract.notice_window_start_value !== null
    && savedResult.contract.notice_window_end_value !== null

      ? `${savedResult.contract.notice_window_start_value} ${
          savedResult.contract.notice_window_start_unit === "business_days"
            ? "business days"
            : savedResult.contract.notice_window_start_unit ?? ""
        } → ${savedResult.contract.notice_window_end_value} ${
          savedResult.contract.notice_window_end_unit === "business_days"
            ? "business days"
            : savedResult.contract.notice_window_end_unit ?? ""
        }`

      : savedResult.contract.notice_period_value !== null

        ? `${savedResult.contract.notice_period_value} ${
            savedResult.contract.notice_period_unit === "business_days"
              ? "business days"
              : savedResult.contract.notice_period_unit ?? ""
          }`

        : savedResult.contract.notice_period_days !== null

          ? `${savedResult.contract.notice_period_days} days`

          : "Not found"
  }
/>


                                    <InfoCard
                    label="Renewal Structure"
                    value={
                      savedResult.contract
                        .renewal_structure ===
                      "fixed_term_auto_renewal"
                        ? "Fixed-Term Auto Renewal"

                        : savedResult.contract
                            .renewal_structure ===
                          "evergreen_indefinite"
                        ? "Evergreen / Indefinite"

                        : savedResult.contract
                            .renewal_structure ===
                          "fixed_term"
                        ? "Fixed Term"

                        : "Not found"
                    }
                  />


                  <InfoCard
                    label="Timing risk"
                    value={
                      formatTimingRisk(savedResult.renewal_intelligence.risk_level)
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

    </fieldset>
  );
}


function ReviewSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {

  return (

    <section id={id} tabIndex={-1} aria-labelledby={`${id}-heading`} className="renewai-card scroll-mt-6 p-6 sm:p-7">

      <div>

        <p className="renewai-eyebrow">
          {eyebrow}
        </p>


        <h2 id={`${id}-heading`} className="renewai-card-title mt-2">
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
  htmlFor,
  label,
  help,
  children,
}: {
  htmlFor: string;
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="renewai-label">{label}</label>
      {children}
      {help && <p id={`${htmlFor}-hint`} className="mt-2 text-xs leading-5 text-slate-500">{help}</p>}
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

    <div className="renewai-wrap-value renewai-card p-5">

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

    <div className="flex min-w-0 flex-col items-start justify-between gap-1 border-b border-slate-100 pb-4 last:border-0 last:pb-0 sm:flex-row sm:gap-6">

      <span className="text-sm font-medium text-slate-500">
        {label}
      </span>


      <span className="min-w-0 max-w-full [overflow-wrap:anywhere] text-sm font-bold text-slate-800 sm:max-w-sm sm:text-right">
        {value}
      </span>

    </div>
  );
}
