import { createContext, useContext, useEffect, useMemo, useState } from "react";

const THEME_STORAGE_KEY = "taskflow_theme";
const ThemeContext = createContext(null);

function readStoredTheme() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      mode: parsed?.mode === "dark" ? "dark" : "light",
      accent: parsed?.accent || "indigo",
    };
  } catch (error) {
    return null;
  }
}

export function ThemeProvider({ children }) {
  const stored = readStoredTheme();
  const [mode, setMode] = useState(stored?.mode || "light");
  const [accent, setAccent] = useState(stored?.accent || "indigo");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", mode === "dark");
    root.setAttribute("data-accent", accent);
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ mode, accent }));
  }, [mode, accent]);

  const value = useMemo(
    () => ({
      mode,
      accent,
      toggleMode: () => setMode((current) => (current === "dark" ? "light" : "dark")),
      setAccent,
    }),
    [mode, accent]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
