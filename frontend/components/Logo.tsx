// Adapted from RajBhardwaj29/renewai-website/src/components/brand/Logo.tsx.
// Source blob dc102bf92446fff9bf000e8dc0595214c42017dc; SVG geometry is unchanged.
function cn(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/**
 * RenewAI mark: two offset arcs forming a continuous cycle, with a node marking
 * the decision point — renewal as a loop you can intercept.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("renewai-logo-mark size-7 shrink-0", className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path
        d="M9 18.5a7 7 0 0 1 11.6-7.9"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M23 13.5a7 7 0 0 1-11.6 7.9"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeOpacity="0.55"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="22.4" cy="10.4" r="2.4" fill="var(--primary-foreground)" />
    </svg>
  );
}

export function Logo({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <span className={cn("renewai-logo inline-flex shrink-0 items-center gap-2.5", className)}>
      <LogoMark />
      <span
        className={cn(
          "text-[1.15rem] font-semibold tracking-tight",
          tone === "light" ? "text-[oklch(0.985_0.002_247.8)]" : "text-[oklch(0.21_0.032_264.7)]",
        )}
      >
        Renew<span className="text-[var(--primary)]">AI</span>
      </span>
    </span>
  );
}
