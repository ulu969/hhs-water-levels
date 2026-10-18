import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getStationSnapshots } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const [stations, thresholds] = await Promise.all([
    getStationSnapshots(),
    sql`
      SELECT station_code, parameter, label, value, unit, notes
      FROM thresholds
      ORDER BY value DESC
    `,
  ]);

  const result = [...stations]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({
      ...s,
      thresholds: thresholds
        .filter((t) => t.station_code === s.code)
        .map((t) => ({
          parameter: t.parameter as "level" | "flow",
          label: t.label as string,
          value: t.value as number,
          unit: t.unit as string,
          notes: t.notes as string | null,
        })),
    }));

  return NextResponse.json(result);
}
