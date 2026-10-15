import { authFetch } from "@/lib/authFetch";

export type RenewalAIInsight = {
  action: string;
  confidence: number;
  summary: string;
  key_findings: string[];
  commercial_flags: string[];
};

export const AI_ANALYSIS_UNAVAILABLE =
  "AI analysis temporarily unavailable. Your contract is saved. Please try again.";

export async function generateRenewalAIInsight(
  contractId: string
): Promise<RenewalAIInsight> {
  let response: Response;
  try {
    response = await authFetch(
      `/contracts/${encodeURIComponent(contractId)}/ai-insight`,
      { method: "POST", signal: AbortSignal.timeout(120_000) }
    );
  } catch {
    throw new Error(AI_ANALYSIS_UNAVAILABLE);
  }

  if (response.status === 401) {
    throw new Error("Please sign in to retry AI analysis. Your contract is saved.");
  }
  if (response.status === 404) {
    throw new Error("This contract is unavailable or archived. Refresh the page before retrying.");
  }
  if (!response.ok) {
    throw new Error(AI_ANALYSIS_UNAVAILABLE);
  }

  try {
    const data = await response.json();
    const insight = data.ai_insight as RenewalAIInsight | undefined;
    if (!insight || typeof insight.action !== "string" || typeof insight.summary !== "string"
      || typeof insight.confidence !== "number" || !Array.isArray(insight.key_findings)
      || !Array.isArray(insight.commercial_flags)) {
      throw new Error(AI_ANALYSIS_UNAVAILABLE);
    }
    return insight;
  } catch {
    throw new Error(AI_ANALYSIS_UNAVAILABLE);
  }
}
