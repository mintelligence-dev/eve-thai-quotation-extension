"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const KEY = "quotation-desk:theme";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const isDark = () => document.documentElement.classList.contains("dark");

function setDark(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(KEY, dark ? "dark" : "light");
  } catch {
    // Storage can be blocked; the choice then lasts for this page only.
  }
  for (const listener of listeners) listener();
}

/** Runs before the page paints, so a saved dark choice does not flash light first. Light is the default. */
export const themeScript = `try{if(localStorage.getItem(${JSON.stringify(KEY)})==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  return (
    <Button
      aria-label={dark ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
      aria-pressed={dark}
      className="no-print fixed right-3 bottom-3 z-40"
      size="icon-sm"
      variant="outline"
      onClick={() => setDark(!dark)}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}
