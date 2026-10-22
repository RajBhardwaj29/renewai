// Display vocabulary only. Keep persisted values and policy decisions unchanged.
const timingLabels: Record<string, string> = {
  safe: "Safe",
  attention: "Needs attention",
  urgent: "Urgent",
  critical: "Critical",
  unknown: "Unknown",
};
const decisionLabels: Record<string, string> = {
  undecided: "Undecided",
  renew: "Renew",
  renegotiate: "Renegotiate",
  cancel: "Cancel",
};
const workflowLabels: Record<string, string> = {
  under_review: "Under review",
  decision_made: "Decision made",
  completed: "Completed",
};
const adviceLabels: Record<string, string> = {
  monitor: "Continue monitoring",
  review: "Review before renewal",
  renegotiate: "Consider renegotiation",
  consider_cancellation: "Consider cancellation",
};
const analysisLabels: Record<string, string> = {
  not_started: "Not started",
  pending: "Pending",
  running: "In progress",
  completed: "Ready",
  failed: "Unavailable",
};

export function formatTimingRisk(value: string | null | undefined): string {
  return Object.hasOwn(timingLabels, value ?? "") ? timingLabels[value!] : "Unknown";
}
export function formatDecisionLabel(value: string | null | undefined): string {
  if (!value) return "Undecided";
  return Object.hasOwn(decisionLabels, value) ? decisionLabels[value] : "Unknown decision";
}
export function formatWorkflowLabel(value: string | null | undefined): string {
  if (!value) return "Under review";
  return Object.hasOwn(workflowLabels, value) ? workflowLabels[value] : "Unknown workflow";
}
export function formatAIActionLabel(value: string | null | undefined): string {
  if (!value) return "No AI advice yet";
  return Object.hasOwn(adviceLabels, value) ? adviceLabels[value] : "Unknown AI advice";
}
export function formatAIAnalysisStatus(value: string | null | undefined): string {
  return Object.hasOwn(analysisLabels, value ?? "") ? analysisLabels[value!] : "Unknown";
}
