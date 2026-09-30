/**
 * VentureCoach AI — brand lockups.
 *
 * The mark: a rounded tile in the brand gradient carrying the "coached loop"
 * spiral (Decision → Action → Metric → Feedback) with an emerald status dot —
 * the signal that a metric shipped. `Mark` renders it inline and adapts to
 * dark/light automatically (the tile is self-colored; nothing depends on the
 * surrounding theme). `Wordmark` is the full lockup: mark + typeset name.
 */
export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient
          id="vc-mark-g"
          x1="3"
          y1="2"
          x2="29"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#7c7ff8" />
          <stop offset="0.55" stopColor="#4a4ee0" />
          <stop offset="1" stopColor="#2b2e7a" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8.5" fill="url(#vc-mark-g)" />
      <path
        d="M10 20 C10 11 23 11 23 17.5 C23 22 14.5 22.5 14.5 18 C14.5 14.8 20 14.8 20 17.6"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="23.5" cy="8.5" r="2.1" fill="#34d399" />
    </svg>
  );
}

export function Wordmark({
  className = "",
  markClassName = "h-7 w-7",
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark className={markClassName} />
      <span className="font-display text-[17px] font-semibold tracking-tight whitespace-nowrap">
        VentureCoach{" "}
        <span className="text-gradient font-bold">AI</span>
      </span>
    </span>
  );
}
