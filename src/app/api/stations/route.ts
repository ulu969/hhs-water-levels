import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const stations = await sql`
    SELECT
      s.code, s.name, s.waterbody, s.latitude, s.longitude,
      lvl.value AS level_value, lvl.unit AS level_unit, lvl.observed_at AS level_observed_at,
      flow.value AS flow_value, flow.unit AS flow_unit, flow.observed_at AS flow_observed_at
    FROM stations s
    LEFT JOIN LATERAL (
      SELECT value, unit, observed_at FROM readings
      WHERE station_code = s.code AND parameter = 'level'
      ORDER BY observed_at DESC LIMIT 1
    ) lvl ON true
    LEFT JOIN LATERAL (
      SELECT value, unit, observed_at FROM readings
      WHERE station_code = s.code AND parameter = 'flow'
      ORDER BY observed_at DESC LIMIT 1
    ) flow ON true
    ORDER BY s.name
  `;

  const thresholds = await sql`
    SELECT station_code, parameter, label, value, unit, notes
    FROM thresholds
    ORDER BY value DESC
  `;

  const result = stations.map((s) => ({
    code: s.code as string,
    name: s.name as string,
    waterbody: s.waterbody as string,
    latitude: s.latitude as number | null,
    longitude: s.longitude as number | null,
    level: s.level_value != null
      ? { value: s.level_value as number, unit: s.level_unit as string, observedAt: s.level_observed_at as string }
      : null,
    flow: s.flow_value != null
      ? { value: s.flow_value as number, unit: s.flow_unit as string, observedAt: s.flow_observed_at as string }
      : null,
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
