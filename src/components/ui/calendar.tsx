"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { DayPicker, getDefaultClassNames, type DayPickerProps } from "react-day-picker"
import { th } from "react-day-picker/locale"

import { cn } from "@/lib/utils"

export type CalendarEra = "buddhist" | "gregorian"

const yearOf = (d: Date, era: CalendarEra) => d.getFullYear() + (era === "buddhist" ? 543 : 0)

/**
 * Calendar in Thai by default, with Buddhist Era (BE) years in the caption and year dropdown.
 * Pass `era="gregorian"` for Common Era (CE) years, or any react-day-picker `locale` for other languages
 * (non-Thai locales default to CE).
 * Dates you receive are normal JS Dates (Gregorian) — the era only changes what is displayed.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  era,
  locale = th,
  formatters,
  labels,
  ...props
}: DayPickerProps & { era?: CalendarEra }) {
  // Buddhist Era by default for Thai, Common Era for every other locale.
  const resolvedEra: CalendarEra = era ?? (locale?.code?.startsWith("th") ? "buddhist" : "gregorian")
  const d = getDefaultClassNames()
  const monthName = (date: Date) =>
    new Intl.DateTimeFormat(locale?.code ?? "th", { month: "long" }).format(date)
  const monthShort = (date: Date) =>
    new Intl.DateTimeFormat(locale?.code ?? "th", { month: "short" }).format(date)

  // Screen readers must hear the same year the caption shows, and "today" / "selected" in the page's language.
  const thai = (locale?.code ?? "th").startsWith("th")
  const fullDate = (date: Date) =>
    new Intl.DateTimeFormat(`${locale?.code ?? "th"}-u-ca-${resolvedEra === "buddhist" ? "buddhist" : "gregory"}`, { dateStyle: "full" }).format(date)
  const dayLabel = (date: Date, modifiers?: { today?: boolean; selected?: boolean }) => {
    let label = fullDate(date)
    if (modifiers?.today) label = `${thai ? "วันนี้" : "Today"}, ${label}`
    if (modifiers?.selected) label = `${label}, ${thai ? "เลือกแล้ว" : "selected"}`
    return label
  }

  return (
    <DayPicker
      labels={{
        labelGrid: (date) => `${monthName(date)} ${yearOf(date, resolvedEra)}`,
        labelDayButton: (date, modifiers) => dayLabel(date, modifiers),
        labelGridcell: (date, modifiers) => dayLabel(date, modifiers),
        ...labels,
      }}
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      locale={locale}
      className={cn("bg-background p-3 [--cell-size:--spacing(9)] pointer-coarse:[--cell-size:--spacing(11)]", className)}
      formatters={{
        formatCaption: (date) => `${monthName(date)} ${yearOf(date, resolvedEra)}`,
        formatYearDropdown: (date) => String(yearOf(date, resolvedEra)),
        formatMonthDropdown: (date) => monthShort(date),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", d.root),
        months: cn("relative flex flex-col gap-4 md:flex-row", d.months),
        month: cn("flex w-full flex-col gap-4", d.month),
        nav: cn("absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1", d.nav),
        button_previous: cn(
          "inline-flex size-(--cell-size) items-center justify-center rounded-md p-0 select-none hover:bg-accent hover:text-accent-foreground aria-disabled:opacity-50",
          d.button_previous
        ),
        button_next: cn(
          "inline-flex size-(--cell-size) items-center justify-center rounded-md p-0 select-none hover:bg-accent hover:text-accent-foreground aria-disabled:opacity-50",
          d.button_next
        ),
        month_caption: cn("flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)", d.month_caption),
        dropdowns: cn("flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium", d.dropdowns),
        dropdown_root: cn(
          "relative rounded-md border border-input shadow-xs has-focus:border-ring has-focus:ring-[3px] has-focus:ring-ring/50",
          d.dropdown_root
        ),
        dropdown: cn("absolute inset-0 bg-popover opacity-0", d.dropdown),
        caption_label: cn(
          "font-heading font-semibold select-none",
          captionLayout === "label"
            ? "text-sm"
            : "flex h-8 items-center gap-1 rounded-md pr-1 pl-2 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
          d.caption_label
        ),
        month_grid: "w-full border-collapse",
        weekdays: cn("flex", d.weekdays),
        weekday: cn("flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none", d.weekday),
        week: cn("mt-2 flex w-full", d.week),
        day: cn(
          "group/day relative aspect-square h-full w-full p-0 text-center select-none [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md",
          d.day
        ),
        range_start: cn("rounded-l-md bg-accent", d.range_start),
        range_middle: cn("rounded-none", d.range_middle),
        range_end: cn("rounded-r-md bg-accent", d.range_end),
        today: cn("rounded-md bg-accent text-accent-foreground data-[selected=true]:rounded-none", d.today),
        outside: cn("text-muted-foreground aria-selected:text-muted-foreground", d.outside),
        disabled: cn("text-muted-foreground opacity-50", d.disabled),
        hidden: cn("invisible", d.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className, ...p }) =>
          orientation === "left" ? (
            <ChevronLeftIcon className={cn("size-4", className)} {...p} />
          ) : (
            <ChevronRightIcon className={cn("size-4", className)} {...p} />
          ),
        DayButton: CalendarDayButton,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<"button"> & { day: { date: Date }; modifiers: Record<string, boolean> }) {
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "flex aspect-square size-auto w-full min-w-(--cell-size) items-center justify-center rounded-md text-sm leading-none font-normal outline-none",
        "transition-[background-color,transform] duration-300 ease-spring-snappy hover:bg-accent hover:text-accent-foreground active:scale-90 motion-reduce:transition-none",
        "group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50",
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:font-semibold data-[selected-single=true]:text-primary-foreground",
        "data-[range-start=true]:rounded-md data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground",
        "data-[range-end=true]:rounded-md data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground",
        "data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
