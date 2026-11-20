"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { Command as CommandPrimitive, defaultFilter } from "cmdk"
import { CheckIcon, ChevronsUpDownIcon, SearchIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type ComboboxOption = {
  value: string
  label: string
  /** Extra text that is searchable but not shown (e.g. English name, code). */
  keywords?: string[]
  icon?: React.ReactNode
  disabled?: boolean
}

// Built-in UI strings. Override any of them with the matching prop.
const STRINGS = {
  th: { placeholder: "เลือก...", search: "ค้นหา...", empty: "ไม่พบรายการ", loading: "กำลังโหลด...", remove: "ลบ" },
  en: { placeholder: "Select...", search: "Search...", empty: "No results", loading: "Loading...", remove: "Remove" },
} as const

type BaseProps = {
  options: ComboboxOption[]
  /** Language of the built-in strings (placeholder, search, empty, loading). Defaults to Thai. */
  locale?: "th" | "en"
  loadingText?: React.ReactNode
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: React.ReactNode
  className?: string
  disabled?: boolean
  /** Show a spinner/placeholder row while options load (async search). */
  loading?: boolean
  /** Called as the user types — use it to fetch options from an API. */
  onSearchChange?: (search: string) => void
  /** Set false when filtering on the server (onSearchChange). */
  shouldFilter?: boolean
  "aria-invalid"?: boolean
  /** Id of the trigger, so a <Label htmlFor> can point at it. */
  id?: string
  "aria-labelledby"?: string
  /** Name when there is no <Label htmlFor> / aria-labelledby; defaults to the placeholder. */
  "aria-label"?: string
}

type SingleProps = BaseProps & {
  multiple?: false
  value?: string
  onValueChange?: (value: string) => void
}
type MultipleProps = BaseProps & {
  multiple: true
  value?: string[]
  onValueChange?: (value: string[]) => void
  /** Max chips shown in the trigger before "+N". */
  maxChips?: number
}

/**
 * Searchable select (single or multiple), built on Radix Popover + cmdk.
 * Thai search works out of the box; add `keywords` for English aliases.
 */
function Combobox(props: SingleProps | MultipleProps) {
  const strings = STRINGS[props.locale ?? "th"]
  const {
    options,
    placeholder = strings.placeholder,
    searchPlaceholder = strings.search,
    emptyText = strings.empty,
    loadingText = strings.loading,
    className,
    disabled,
    loading,
    onSearchChange,
    shouldFilter = true,
  } = props
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const selected: string[] = props.multiple ? (props.value ?? []) : props.value ? [props.value] : []
  const byValue = React.useMemo(() => new Map(options.map((o) => [o.value, o])), [options])

  const toggle = (v: string) => {
    if (props.multiple) {
      const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]
      props.onValueChange?.(next)
    } else {
      props.onValueChange?.(v === props.value ? "" : v)
      setOpen(false)
    }
  }

  const maxChips = props.multiple ? (props.maxChips ?? 3) : 0

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        data-slot="combobox-trigger"
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-invalid={props["aria-invalid"]}
        id={props.id}
        aria-labelledby={props["aria-labelledby"]}
        aria-label={props["aria-label"] ?? (props.id || props["aria-labelledby"] ? undefined : placeholder ?? strings.placeholder)}
        // Radix points aria-controls at the list even while it is closed (and absent from the DOM).
        {...(!open && { "aria-controls": undefined })}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs outline-none transition-[color,box-shadow]",
          props.multiple ? "min-h-9 py-1" : "h-9",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
          className
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selected.length === 0 && <span className="truncate text-muted-foreground">{placeholder}</span>}
          {!props.multiple && selected[0] && (
            <span className="flex items-center gap-2 truncate [&_svg]:size-4">
              {byValue.get(selected[0])?.icon}
              {byValue.get(selected[0])?.label ?? selected[0]}
            </span>
          )}
          {props.multiple &&
            selected.slice(0, maxChips).map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pr-1 pl-2 text-xs font-medium text-primary dark:bg-primary/20"
              >
                {byValue.get(v)?.label ?? v}
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`${strings.remove} ${byValue.get(v)?.label ?? v}`}
                  onPointerDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggle(v)
                  }}
                  className="rounded-full p-0.5 hover:bg-primary/15"
                >
                  <XIcon className="size-3" />
                </span>
              </span>
            ))}
          {props.multiple && selected.length > maxChips && (
            <span className="text-xs text-muted-foreground">+{selected.length - maxChips}</span>
          )}
        </span>
        <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className={cn(
            "z-50 w-(--radix-popover-trigger-width) min-w-56 origin-(--radix-popover-content-transform-origin) overflow-hidden rounded-xl border bg-popover p-0 text-popover-foreground shadow-lg shadow-brand/5",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150 data-[state=closed]:ease-in data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-90 data-[state=open]:duration-300 data-[state=open]:ease-spring-snappy motion-reduce:animate-none"
          )}
        >
          <CommandPrimitive
            shouldFilter={shouldFilter}
            // Match on labels and keywords only: option values are often ids, which should not be searchable.
            filter={(_value, search, keywords) => defaultFilter((keywords ?? []).join(" "), search)}
            className="flex flex-col"
          >
            <div className="flex items-center gap-2 border-b px-3">
              <SearchIcon className="size-4 shrink-0 opacity-50" />
              <CommandPrimitive.Input
                value={search}
                onValueChange={(s) => {
                  setSearch(s)
                  onSearchChange?.(s)
                }}
                placeholder={searchPlaceholder}
                // 16px on phones so iOS Safari doesn't zoom in
                className="flex h-10 w-full bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
              />
            </div>
            <CommandPrimitive.List className="max-h-72 scroll-py-1 overflow-y-auto overscroll-contain p-1">
              {loading ? (
                <CommandPrimitive.Loading>
                  <div className="py-6 text-center text-sm text-muted-foreground">{loadingText}</div>
                </CommandPrimitive.Loading>
              ) : (
                <CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground">
                  {emptyText}
                </CommandPrimitive.Empty>
              )}
              {options.map((o) => {
                const isSelected = selected.includes(o.value)
                return (
                  <CommandPrimitive.Item
                    key={o.value}
                    value={o.value}
                    keywords={[o.label, ...(o.keywords ?? [])]}
                    disabled={o.disabled}
                    onSelect={() => toggle(o.value)}
                    className="relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none pointer-coarse:py-2.5 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='size-'])]:size-4"
                  >
                    {props.multiple ? (
                      <span
                        className={cn(
                          "flex size-4 items-center justify-center rounded-[4px] border",
                          isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input"
                        )}
                      >
                        {isSelected && <CheckIcon className="size-3" strokeWidth={3} />}
                      </span>
                    ) : null}
                    {o.icon}
                    <span className="flex-1 truncate">{o.label}</span>
                    {!props.multiple && isSelected && <CheckIcon className="size-4 text-brand" />}
                  </CommandPrimitive.Item>
                )
              })}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export { Combobox }
