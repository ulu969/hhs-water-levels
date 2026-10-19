import { createSql, databaseUrl } from "./postgres";

const url = databaseUrl();
if (!url) {
  throw new Error("POSTGRES_URL or DATABASE_URL must be set");
}

export const sql = createSql(url);
