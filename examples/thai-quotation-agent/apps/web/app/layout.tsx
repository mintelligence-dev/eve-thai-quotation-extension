import type { Metadata } from "next";
import { Geist_Mono, IBM_Plex_Sans_Thai, Manrope, Rubik, Sarabun } from "next/font/google";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle, themeScript } from "@/app/_components/theme-toggle";
import { cn } from "@/lib/utils";
import "./globals.css";

// Mintel UI type: Manrope for text, Rubik for headings, IBM Plex Sans Thai for Thai.
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap" });
const rubik = Rubik({ variable: "--font-rubik", subsets: ["latin"], display: "swap" });
const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
// The printed quotation uses Sarabun, the usual face of Thai business documents.
const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Thai Quotation Desk",
  description: "Turn a customer message into a quotation priced from your catalog.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html
      className={cn(manrope.variable, rubik.variable, plexThai.variable, sarabun.variable, mono.variable)}
      lang="th"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeToggle />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
