import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai, Manrope, Rubik, Sarabun } from "next/font/google";
import "./globals.css";

// Variable names the Mintel UI theme looks for.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const rubik = Rubik({ subsets: ["latin"], variable: "--font-rubik" });
const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

/** Sarabun is the conventional typeface for Thai business documents. */
const docFont = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Thai Quotation Copilot",
  description: "Turn Thai or English customer inquiries into quotation drafts from your own price catalog.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="th"
      suppressHydrationWarning
      className={`${manrope.variable} ${rubik.variable} ${plexThai.variable} ${docFont.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
