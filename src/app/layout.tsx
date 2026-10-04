import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SiteHeader from "@/components/SiteHeader";
import { sql } from "@/lib/db";
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

export const dynamic = "force-dynamic";

async function getNavigationStations() {
  const rows = await sql`
    SELECT code, name
    FROM stations
    ORDER BY name
  `;
  return rows.map((row) => ({
    code: row.code as string,
    name: row.name as string,
  }));
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const stations = await getNavigationStations();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader stations={stations} />
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
