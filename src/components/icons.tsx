/** Small stroke icons shared by the app; one stroke weight, currentColor. */
type IconProps = { className?: string };

export const ChevronIcon = ({ className = "size-4 shrink-0 text-slate-500" }: IconProps) => (
  <svg viewBox="0 0 16 16" aria-hidden className={className}>
    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CheckIcon = ({ className = "size-4 shrink-0" }: IconProps) => (
  <svg viewBox="0 0 16 16" aria-hidden className={className}>
    <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CrossIcon = ({ className = "size-4" }: IconProps) => (
  <svg viewBox="0 0 16 16" aria-hidden className={className}>
    <path d="M4.5 4.5l7 7m0-7l-7 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
