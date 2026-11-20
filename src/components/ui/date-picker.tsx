"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { CalendarIcon, XIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { enUS, th } from "react-day-picker/locale"

import { cn } from "@/lib/utils"
import { Calendar, type CalendarEra } from "@/components/ui/calendar"

type PickerLocale = "th" | "en"

// Built-in UI strings. Override placeholders with the matching props.
const STRINGS = {
  th: { date: "เลือกวันที่", range: "เลือกช่วงวันที่", clear: "ล้างวันที่" },
  en: { date: "Pick a date", range: "Pick a date range", clear: "Clear date" },
} as const

const dayPickerLocale = (locale: PickerLocale) => (locale === "en" ? enUS : th)
const defaultEra = (locale: PickerLocale): CalendarEra => (locale === "th" ? "buddhist" : "gregorian")

/**
 * Formats a date for display. Thai uses the Buddhist Era (BE) by default; English uses the Common Era.
 */
function formatThaiDate(
  date: Date,
  era: CalendarEra = "buddhist",
  style: "medium" | "long" = "medium",
  locale: PickerLocale = "th"
) {
  const tag = locale === "en" ? "en-GB" : "th-TH"
  const calendar = era === "buddhist" ? "buddhist" : "gregory"
  return new Intl.DateTimeFormat(`${tag}-u-ca-${calendar}`, { dateStyle: style }).format(date)
}

const triggerClass =
  "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs outline-none transition-[color,box-shadow] " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50 " +
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20"

const contentClass =
  "z-50 max-h-(--radix-popover-content-available-height) w-auto origin-(--radix-popover-content-transform-origin) overflow-y-auto overscroll-contain rounded-xl border bg-popover p-0 text-popover-foreground shadow-lg shadow-brand/5 " +
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150 data-[state=closed]:ease-in data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-90 data-[state=open]:duration-300 data-[state=open]:ease-spring-snappy motion-reduce:animate-none"

type CommonProps = {
  /** Language of the calendar and built-in strings. Defaults to Thai. */
  locale?: PickerLocale
  /** Defaults to Buddhist Era for Thai and Common Era for English. */
  era?: CalendarEra
  placeholder?: string
  className?: string
  disabled?: boolean
  /** Show month/year dropdowns (good for birth dates). */
  dropdowns?: boolean
  fromYear?: number
  toYear?: number
  "aria-invalid"?: boolean
}

/** A real button beside the trigger (not inside it: a button in a button is invalid and unreachable by keyboard). */
function ClearButton({ onClear, label }: { onClear: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClear}
      className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <XIcon className="size-3.5" />
    </button>
  )
}

// Rendered only while the popover is open, so `new Date()` never runs during server prerender
// (Next.js cacheComponents rejects reading the current time there).
function SingleCalendar({
  era,
  locale,
  value,
  dropdowns,
  fromYear,
  toYear,
  onSelect,
}: {
  era: CalendarEra
  locale: PickerLocale
  value?: Date
  dropdowns?: boolean
  fromYear?: number
  toYear?: number
  onSelect: (d: Date | undefined) => void
}) {
  const thisYear = new Date().getFullYear()
  return (
    <Calendar
      mode="single"
      era={era}
      locale={dayPickerLocale(locale)}
      selected={value}
      defaultMonth={value}
      captionLayout={dropdowns ? "dropdown" : "label"}
      startMonth={new Date(fromYear ?? thisYear - 100, 0)}
      endMonth={new Date(toYear ?? thisYear + 10, 11)}
      onSelect={onSelect}
    />
  )
}

/** Single date picker. Displays the date in Thai with a BE year (e.g. 19 Nov 2569 BE); `value` is a normal JS Date. */
function DatePicker({
  value,
  onValueChange,
  locale = "th",
  era = defaultEra(locale),
  placeholder = STRINGS[locale].date,
  className,
  disabled,
  dropdowns,
  fromYear,
  toYear,
  ...rest
}: CommonProps & { value?: Date; onValueChange?: (date: Date | undefined) => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <div className={cn("relative", className)}>
        <PopoverPrimitive.Trigger
          data-slot="date-picker-trigger"
          disabled={disabled}
          aria-invalid={rest["aria-invalid"]}
          className={cn(triggerClass, "w-full", value && "pr-9")}
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? formatThaiDate(value, era, "medium", locale) : placeholder}
          </span>
        </PopoverPrimitive.Trigger>
        {value && !disabled && <ClearButton label={STRINGS[locale].clear} onClear={() => onValueChange?.(undefined)} />}
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content align="start" sideOffset={6} className={contentClass}>
          <SingleCalendar
            era={era}
            locale={locale}
            value={value}
            dropdowns={dropdowns}
            fromYear={fromYear}
            toYear={toYear}
            onSelect={(d) => {
              onValueChange?.(d)
              if (d) setOpen(false)
            }}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

// One month on phones, two side by side from `sm` up. Mounted only while open (no SSR mismatch).
function RangeCalendar({
  era,
  locale,
  value,
  dropdowns,
  fromYear,
  toYear,
  onSelect,
}: {
  era: CalendarEra
  locale: PickerLocale
  value?: DateRange
  dropdowns?: boolean
  fromYear?: number
  toYear?: number
  onSelect?: (range: DateRange | undefined) => void
}) {
  const [months] = React.useState(() => (window.matchMedia("(min-width: 640px)").matches ? 2 : 1))
  const thisYear = new Date().getFullYear()
  return (
    <Calendar
      mode="range"
      era={era}
      locale={dayPickerLocale(locale)}
      selected={value}
      defaultMonth={value?.from}
      numberOfMonths={months}
      onSelect={onSelect}
      // Same month/year dropdowns as the single picker.
      {...(dropdowns
        ? { captionLayout: "dropdown" as const, startMonth: new Date(fromYear ?? thisYear - 100, 0), endMonth: new Date(toYear ?? thisYear + 10, 11) }
        : {})}
    />
  )
}

/** Date range picker (two months on desktop, one on phones). */
function DateRangePicker({
  value,
  onValueChange,
  locale = "th",
  era = defaultEra(locale),
  placeholder = STRINGS[locale].range,
  className,
  disabled,
  ...rest
}: CommonProps & { value?: DateRange; onValueChange?: (range: DateRange | undefined) => void }) {
  const label = value?.from
    ? value.to
      ? `${formatThaiDate(value.from, era, "medium", locale)} – ${formatThaiDate(value.to, era, "medium", locale)}`
      : formatThaiDate(value.from, era, "medium", locale)
    : placeholder
  return (
    <PopoverPrimitive.Root>
      <div className={cn("relative", className)}>
        <PopoverPrimitive.Trigger
          data-slot="date-range-picker-trigger"
          disabled={disabled}
          aria-invalid={rest["aria-invalid"]}
          className={cn(triggerClass, "w-full", value?.from && "pr-9")}
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn("truncate", !value?.from && "text-muted-foreground")}>{label}</span>
        </PopoverPrimitive.Trigger>
        {value?.from && !disabled && <ClearButton label={STRINGS[locale].clear} onClear={() => onValueChange?.(undefined)} />}
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content align="start" sideOffset={6} className={contentClass}>
          <RangeCalendar era={era} locale={locale} value={value} dropdowns={rest.dropdowns} fromYear={rest.fromYear} toYear={rest.toYear} onSelect={onValueChange} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export { DatePicker, DateRangePicker, formatThaiDate }
