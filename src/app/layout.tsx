import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Harrison Water Levels",
  description:
    "Real-time water level and flow data for the lakes and rivers around Harrison Hot Springs, BC.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-black/10 dark:border-white/10">
          <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight">
              Harrison Water Levels
            </Link>
            <span className="text-xs text-black/50 dark:text-white/50">
              Data: Environment and Climate Change Canada
            </span>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">
          {children}
        </main>
        <footer className="border-t border-black/10 dark:border-white/10 py-4">
          <div className="mx-auto max-w-6xl px-4 text-xs text-black/50 dark:text-white/50">
            Provisional data from the ECCC real-time hydrometric network.
            Not for navigation or emergency decision-making — consult
            official sources during flood events.
          </div>
        </footer>
      </body>
    </html>
  );
}
