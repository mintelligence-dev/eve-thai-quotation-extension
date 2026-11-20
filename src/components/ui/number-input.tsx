"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

/** "1234567.5" -> "1,234,567.5" (keeps a trailing dot and trailing zeros while typing). */
function group(raw: string) {
  const negative = raw.startsWith("-")
  const [int, dec] = raw.replace("-", "").split(".")
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return (negative ? "-" : "") + grouped + (dec !== undefined ? `.${dec}` : "")
}

/** Keep digits, one dot (if decimals are allowed) and a leading minus (if negatives are allowed). */
function clean(text: string, decimals: number, allowNegative: boolean) {
  const negative = allowNegative && text.trim().startsWith("-")
  let digits = text.replace(/[^\d.]/g, "")
  const dot = digits.indexOf(".")
  if (dot >= 0) digits = decimals > 0 ? digits.slice(0, dot + 1) + digits.slice(dot + 1).replace(/\./g, "").slice(0, decimals) : digits.slice(0, dot)
  // No leading zeros: "007" -> "7", but "0.5" and "0" stay.
  digits = digits.replace(/^0+(?=\d)/, "")
  return (negative ? "-" : "") + digits
}

const toNumber = (raw: string) => (raw === "" || raw === "-" || raw === "." || raw === "-." ? null : Number(raw))
const toRaw = (n: number | null | undefined, decimals: number) => (n == null || Number.isNaN(n) ? "" : String(decimals > 0 ? Number(n.toFixed(decimals)) : Math.round(n)))

/** Caret position in the formatted text after `count` significant characters (digits, dot, minus). */
function caretAfter(formatted: string, count: number) {
  if (count <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] !== ",") seen++
    if (seen === count) return i + 1
  }
  return formatted.length
}

type NumberInputProps = Omit<React.ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type" | "min" | "max" | "prefix"> & {
  /** The number, or null when the field is empty. */
  value?: number | null
  defaultValue?: number | null
  onValueChange?: (value: number | null) => void
  /** Digits after the decimal point (0 = whole numbers). */
  decimals?: number
  min?: number
  max?: number
  allowNegative?: boolean
  /** Shown before the number, e.g. "฿". */
  prefix?: React.ReactNode
  /** Shown after the number, e.g. "บาท" or "%". */
  suffix?: React.ReactNode
}

/**
 * Number or money field: thousands separators appear while typing, the caret stays in place, and the
 * value handed back is a real number (or null). Clamped to `min` / `max` when the field loses focus.
 */
function NumberInput({
  value: controlled,
  defaultValue,
  onValueChange,
  decimals = 0,
  min,
  max,
  allowNegative = false,
  prefix,
  suffix,
  className,
  onBlur,
  ...props
}: NumberInputProps) {
  const [raw, setRaw] = React.useState(() => toRaw(controlled ?? defaultValue, decimals))

  // Follow the controlled value, unless it is what the text already says ("1." and "1.0" are both 1).
  // Adjusted during render rather than in an effect, so there is no extra paint with the old text.
  const [seen, setSeen] = React.useState(controlled)
  if (controlled !== seen) {
    setSeen(controlled)
    if (controlled !== undefined && toNumber(raw) !== (controlled ?? null)) setRaw(toRaw(controlled, decimals))
  }

  const commit = (next: string) => {
    setRaw(next)
    onValueChange?.(toNumber(next))
  }

  return (
    <div data-slot="number-input" className={cn("relative", className)}>
      {prefix && (
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
          {prefix}
        </span>
      )}
      <Input
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        {...props}
        type="text"
        value={group(raw)}
        className={cn("text-right tabular-nums", prefix && "pl-8", suffix && "pr-12")}
        onChange={(e) => {
          const el = e.target
          const before = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/,/g, "").length
          const next = clean(el.value, decimals, allowNegative)
          commit(next)
          requestAnimationFrame(() => {
            const pos = caretAfter(group(next), before)
            el.setSelectionRange(pos, pos)
          })
        }}
        onBlur={(e) => {
          const n = toNumber(raw)
          if (n === null) {
            if (raw !== "") commit("")
          } else {
            // Tidy up ("12." -> "12") and bring the value inside the limits.
            const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
            const tidy = toRaw(clamped, decimals)
            if (tidy !== raw) commit(tidy)
          }
          onBlur?.(e)
        }}
      />
      {suffix && (
        <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  )
}

export { NumberInput }
