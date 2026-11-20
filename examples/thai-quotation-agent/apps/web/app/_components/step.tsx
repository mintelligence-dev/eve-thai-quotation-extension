import type { ReactNode } from "react";

/** A numbered section, the same shape on every page. */
export function Step({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-card text-card-foreground rounded-xl border shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <h2 className="font-heading flex items-center gap-2.5 font-semibold">
          <span className="bg-brand text-brand-foreground flex size-6 items-center justify-center rounded-full font-sans text-xs">
            {n}
          </span>
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** The brand gradient of Mintel UI's primary call to action. */
export const brandButton =
  "bg-[image:var(--brand-gradient)] text-brand-foreground shadow-md shadow-brand/25 hover:shadow-lg hover:shadow-brand-accent/30 hover:brightness-110";
