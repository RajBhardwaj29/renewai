// Never render arbitrary API/proxy error text, including from an older backend.
const VALIDATION_MESSAGES = new Set([
  "Only PDF files are supported.",
  "Uploaded PDF is empty.",
  "The uploaded file does not appear to be a valid PDF.",
  "No readable text was found. This document may require OCR.",
  "Invalid renewal decision.",
  "Invalid renewal status.",
  "Some reviewed contract details are invalid. Review them and try again.",
  "We couldn't calculate renewal dates. Review the dates and notice terms, then try again.",
]);

export function requestFailureMessage(path: string): string {
  if (path.endsWith("/ai-insight")) {
    return "AI analysis temporarily unavailable. Your contract is saved. Please try again.";
  }
  if (path.endsWith("/contracts/save")) {
    return "We couldn't confirm whether your contract was saved. Check Contracts before trying again.";
  }
  if (path.endsWith("/contracts/analyze")) {
    return "We couldn't analyze this PDF right now. Please try again.";
  }
  return "We couldn't connect to RenewAI right now. Please try again.";
}

export async function safeErrorResponse(path: string, response: Response): Promise<Response> {
  if (response.ok) return response;

  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    // Gateways can return HTML or an empty body instead of JSON.
  }

  let detail: string | Record<string, unknown> = requestFailureMessage(path);
  if (response.status === 401) {
    detail = "Your session has expired. Please sign in again.";
  } else if (response.status === 403) {
    detail = "You don't have access to this RenewAI workspace.";
  } else if (response.status === 404) {
    detail = "This item doesn't exist or you don't have access to it.";
  } else if (response.status === 409 && data.detail && typeof data.detail === "object") {
    const duplicate = data.detail as Record<string, unknown>;
    detail = {
      message: "This contract has already been saved.",
      existing_contract_id: typeof duplicate.existing_contract_id === "string"
        ? duplicate.existing_contract_id : undefined,
      vendor_name: typeof duplicate.vendor_name === "string" ? duplicate.vendor_name : undefined,
    };
  } else if (response.status === 400 || response.status === 422) {
    detail = typeof data.detail === "string" && VALIDATION_MESSAGES.has(data.detail)
      ? data.detail : "Some details are missing or invalid. Review them and try again.";
  } else if (response.status === 413) {
    detail = "This PDF is too large. Please choose a smaller file.";
  } else if (response.status === 429) {
    detail = "RenewAI is busy. Please wait a moment and try again.";
  }

  return new Response(JSON.stringify({ detail }), {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}
