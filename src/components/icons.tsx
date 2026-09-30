/**
 * VentureCoach AI — icon set.
 * One <Icon name="…" /> component, 24×24 stroke icons drawn on a grid so they
 * optically match at any size. All inherit `currentColor`; sizes come from
 * className (e.g. `h-4 w-4`). Keep icons minimal — if an icon needs >6 paths,
 * it's probably an illustration, not an icon.
 */
import type { ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10.5h18M9 14.5l2 2 4-4" />
    </>
  ),
  "scan-search": (
    <>
      <path d="M3 7.5v-2A2.5 2.5 0 0 1 5.5 3h2M16.5 3h2A2.5 2.5 0 0 1 21 5.5v2M21 16.5v2a2.5 2.5 0 0 1-2.5 2.5h-2M7.5 21h-2A2.5 2.5 0 0 1 3 18.5v-2" />
      <circle cx="11" cy="11" r="3.2" />
      <path d="M16 16l-2.2-2.2" />
    </>
  ),
  "git-branch": (
    <>
      <path d="M6 3v12" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </>
  ),
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  flask: (
    <>
      <path d="M9.5 3h5M10.5 3v5.2L5 17.5A2.2 2.2 0 0 0 7 21h10a2.2 2.2 0 0 0 2-3.5L13.5 8.2V3" />
      <path d="M7.5 14.5h9" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20.5a7 7 0 0 1 14 0" />
    </>
  ),
  gauge: (
    <>
      <path d="M4.5 16.5a8 8 0 1 1 15 0" />
      <path d="M12 14.5 15.5 10" />
      <circle cx="12" cy="15" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  "arrow-right": <path d="M4 12h15M13 5l7 7-7 7" />,
  loop: (
    <>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.99 6.36 2.64L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  spark: (
    <path d="M12 2.5l2.1 7.4 7.4 2.1-7.4 2.1L12 21.5l-2.1-7.4-7.4-2.1 7.4-2.1z" />
  ),
  message: (
    <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.55 0-3-.4-4.3-1.2L3 20l1.2-5.2A8.5 8.5 0 1 1 21 11.5Z" />
  ),
  bot: (
    <>
      <rect x="4.5" y="8.5" width="15" height="11" rx="2.5" />
      <path d="M12 8.5V5.5" />
      <circle cx="12" cy="3.8" r="1.4" />
      <circle cx="9.3" cy="13.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="13.5" r="1" fill="currentColor" stroke="none" />
      <path d="M9.5 17h5" />
    </>
  ),
  spinner: (
    <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M5.6 5.6l2.5 2.5M15.9 15.9l2.5 2.5M18.4 5.6l-2.5 2.5M8.1 15.9l-2.5 2.5" />
  ),
  map: (
    <>
      <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  bolt: <path d="M13 2 4 14h6.5L9 22l11-12h-6.5L13 2Z" />,
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 2.5h6V6H9z" />
      <path d="M9 13.5l2 2 4-4.5" />
    </>
  ),
  layers: (
    <>
      <path d="M12 2.5 21.5 8 12 13.5 2.5 8 12 2.5Z" />
      <path d="M2.5 12.5 12 18l9.5-5.5M2.5 17 12 22.5 21.5 17" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
};

export type IconName = keyof typeof paths;

export function Icon({
  name,
  className = "h-5 w-5",
  strokeWidth = 1.8,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {paths[name]}
    </svg>
  );
}
