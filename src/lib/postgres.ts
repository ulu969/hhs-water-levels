import postgres from "postgres";

export type Sql = postgres.Sql;

// The Vercel Supabase integration sets POSTGRES_URL (Supabase's pooled
// connection). DATABASE_URL still works for local development, CI and the
// scripts, and is the fallback when POSTGRES_URL isn't set.
export function databaseUrl(): string | undefined {
  return process.env.POSTGRES_URL || process.env.DATABASE_URL;
}

export function createSql(url: string, options: { max?: number } = {}): Sql {
  const parsed = new URL(url);
  // Supabase adds `supa=base-pooler.x` to its pooled URLs as a marker. The
  // postgres library would send unknown URL params to the server as startup
  // settings, and the pooler rejects that one.
  parsed.searchParams.delete("supa");

  return postgres(parsed.toString(), {
    // Supabase's pooled connection (port 6543) runs in transaction mode,
    // which can't keep prepared statements between queries.
    prepare: false,
    // Each serverless instance only needs a few connections; the pooler
    // shares them across instances.
    max: options.max ?? 3,
    idle_timeout: 20,
    connect_timeout: 15,
  });
}
