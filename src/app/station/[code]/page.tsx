import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import StationDetail from "@/components/StationDetail";
import type { Station, Threshold } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getStation(code: string): Promise<Station | null> {
  const rows = await sql`
    SELECT code, name, waterbody, latitude, longitude,
      current_condition, current_condition_updated_at
    FROM stations WHERE code = ${code}
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    code: r.code as string,
    name: r.name as string,
    waterbody: r.waterbody as string,
    latitude: r.latitude as number | null,
    longitude: r.longitude as number | null,
    currentCondition: r.current_condition as string | null,
    currentConditionUpdatedAt: r.current_condition_updated_at as string | null,
  };
}

async function getThresholds(code: string): Promise<Threshold[]> {
  const rows = await sql`
    SELECT parameter, label, value, unit, notes
    FROM thresholds WHERE station_code = ${code}
    ORDER BY value DESC
  `;
  return rows.map((r) => ({
    parameter: r.parameter as "level" | "flow",
    label: r.label as string,
    value: r.value as number,
    unit: r.unit as string,
    notes: r.notes as string | null,
  }));
}

export default async function StationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const station = await getStation(code);
  if (!station) notFound();

  const thresholds = await getThresholds(code);

  return <StationDetail station={station} thresholds={thresholds} />;
}
