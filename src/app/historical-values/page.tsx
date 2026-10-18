import type { Metadata } from "next";
import Breadcrumbs from "@/components/Breadcrumbs";

export const metadata: Metadata = {
  title: "Understanding historical values | Harrison Water Levels",
};

export default function HistoricalValuesPage() {
  return (
    <div className="max-w-3xl">
      <Breadcrumbs current="Understanding historical values" />

      <h1 className="text-xl font-semibold">Why historical highs and lows can differ</h1>
      <p className="mt-2 text-sm leading-6 text-black/65 dark:text-white/65">
        The app shows several useful measurements, but they do not all describe the same
        thing. A value can be correct and still differ from another value shown for the same
        station or date.
      </p>

      <div className="mt-6 space-y-4">
        <Explanation
          title="Live status"
          text="The live status uses a recent reading taken at one moment. Water can briefly rise or fall well above or below the average for the whole day."
        />
        <Explanation
          title="Historical graph lines"
          text="The published minimum and maximum lines use daily means. A daily mean averages readings across the day, so it smooths out short-lived peaks and dips. Each point is the historical value for that calendar day."
        />
        <Explanation
          title="All-time record cards"
          text="The record cards use the most extreme instantaneous measurement in the station’s full record. They are not limited to the date range selected for the graph."
        />
        <Explanation
          title="Provisional values"
          text="Recent ECCC readings are provisional. They may be corrected after review, and a partial day can change before its final daily mean is available."
        />
      </div>

      <div className="mt-6 rounded-lg border border-black/10 bg-black/[0.025] p-4 text-sm leading-6 dark:border-white/10 dark:bg-white/[0.04]">
        <p className="font-medium">A simple way to compare values</p>
        <p className="mt-1 text-black/65 dark:text-white/65">
          Compare a daily mean with the historical daily lines. Compare a single live reading
          with other instantaneous readings. The selected graph range does not change the
          all-time record cards.
        </p>
      </div>

      <p className="mt-6 text-xs text-black/50 dark:text-white/50">
        Source data comes from Environment and Climate Change Canada&apos;s hydrometric
        network.
      </p>
    </div>
  );
}

function Explanation({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-black/65 dark:text-white/65">{text}</p>
    </section>
  );
}
