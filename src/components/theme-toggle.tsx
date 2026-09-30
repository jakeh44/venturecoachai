import { useEffect, useState } from "react";
import { Icon } from "~/components/icons";
/**
 * Dark/light switch. The site ships dark by default (see the pre-paint script
 * in __root.tsx, which sets the `dark` class on <html> before first paint).
 * This toggle flips the class and persists the choice to localStorage("vc-theme").
 * Rendered only after mount so SSR markup always matches the pre-paint default.
 */
const THEME_COLOR = { dark: "#0a0c12", light: "#f7f8fb" };

/** Keep the browser chrome (mobile address bar) in step with the theme. */
function syncThemeColor(isDark: boolean) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDark ? THEME_COLOR.dark : THEME_COLOR.light);
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean | null>(null);
  useEffect(() => {
    const dark = document.documentElement.classList.contains("dark");
    setIsDark(dark);
    syncThemeColor(dark);
  }, []);
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("vc-theme", next ? "dark" : "light");
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
    syncThemeColor(next);
    setIsDark(next);
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="btn-ghost inline-flex h-9 w-9 items-center justify-center rounded-sm"
    >
      {isDark === null ? (
        <span className="h-[18px] w-[18px]" />
      ) : (
        <Icon name={isDark ? "sun" : "moon"} className="h-[18px] w-[18px]" strokeWidth={1.6} />
      )}
    </button>
  );
}
