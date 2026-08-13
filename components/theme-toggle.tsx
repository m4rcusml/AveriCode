"use client";

import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "avericode-theme";

export function ThemeToggle() {
  function toggleTheme() {
    const currentTheme: Theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme: Theme = currentTheme === "dark" ? "light" : "dark";

    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  return (
    <button
      aria-label="Toggle color theme"
      className="theme-toggle"
      onClick={toggleTheme}
      title="Toggle color theme"
      type="button"
    >
      <span aria-hidden className="theme-toggle-thumb">
        <Sun className="theme-toggle-symbol theme-toggle-symbol-light" size={14} />
        <Moon className="theme-toggle-symbol theme-toggle-symbol-dark" size={14} />
      </span>
    </button>
  );
}
