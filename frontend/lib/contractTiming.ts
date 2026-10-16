// Calendar dates and renewal urgency use UTC, matching PDF exports/reminders.
const DAY_MS = 86_400_000;

export function utcDay(now = Date.now()): number {
  return Math.floor(now / DAY_MS);
}

export function deadlineDay(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return null;
  return utcDay(timestamp);
}

type TimingContract = {
  cancellation_deadline: string | null;
  days_until_cancellation_deadline: number | null;
  risk_level: string | null;
  recommendation?: string | null;
};

export function currentContractTiming<T extends TimingContract>(contract: T, today: number): T {
  const deadline = deadlineDay(contract.cancellation_deadline);
  const days = deadline === null ? null : deadline - today;
  // Unknown may represent business-day calendars or incomplete notice windows.
  // A saved date alone is not enough to remove those qualifications.
  if (days === null || !contract.risk_level || contract.risk_level === 'unknown') {
    return { ...contract, days_until_cancellation_deadline: null, risk_level: 'unknown',
      ...('recommendation' in contract ? { recommendation: (contract.risk_level === 'unknown' ? contract.recommendation : null) ||
        'Renewal risk cannot yet be determined because required contract dates or notice terms are missing.' } : {}) };
  }
  const [risk, guidance] = days < 0
    ? ['critical', 'The contractual cancellation or non-renewal deadline has already passed.']
    : days <= 14
      ? ['critical', 'The contractual cancellation or non-renewal deadline is imminent. Immediate review is required.']
      : days <= 30
        ? ['urgent', 'The contractual cancellation or non-renewal deadline is approaching. Review promptly.']
        : days <= 90
          ? ['attention', 'The contractual cancellation or non-renewal deadline is within the next 90 days.']
          : ['safe', 'No immediate action required. Continue monitoring.'];
  return { ...contract, days_until_cancellation_deadline: days, risk_level: risk,
    ...('recommendation' in contract ? { recommendation: guidance } : {}) };
}

// Extracted from the hook to test real timer/listener behavior without a live clock.
export function observeUtcDay(onDay: (day: number) => void, environment: {
  now: () => number;
  setTimer: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
}) {
  let timer: ReturnType<typeof setTimeout>;
  function refresh() {
    environment.clearTimer(timer);
    const now = environment.now();
    onDay(utcDay(now));
    timer = environment.setTimer(refresh, DAY_MS - (now % DAY_MS));
  }
  function visible() {
    if (environment.document.visibilityState === 'visible') refresh();
  }
  environment.window.addEventListener('focus', refresh);
  environment.document.addEventListener('visibilitychange', visible);
  refresh();
  return () => {
    environment.clearTimer(timer);
    environment.window.removeEventListener('focus', refresh);
    environment.document.removeEventListener('visibilitychange', visible);
  };
}
