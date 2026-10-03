import { Pool, type PoolClient, type QueryResultRow } from "pg";

import { assertServerRuntime } from "../runtime";

assertServerRuntime("PostgreSQL client");

export class DatabaseConfigurationError extends Error {
  override readonly name = "DatabaseConfigurationError";
}

export interface SqlExecutor {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: readonly Row[] }>;
}

let pool: Pool | undefined;

/**
 * Returns a server-only PostgreSQL pool when DATABASE_URL is configured.
 * This does not log the URL and never exposes it to client code.
 */
export function getPostgresPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    throw new DatabaseConfigurationError(
      "PostgreSQL persistence is not configured. Set DATABASE_URL on the server before enabling durable Sandbox sync.",
    );
  }

  pool ??= new Pool({
    connectionString: databaseUrl,
    max: 4,
    idleTimeoutMillis: 10_000,
  });

  return pool;
}

export function toSqlExecutor(client: Pool | PoolClient): SqlExecutor {
  return {
    query: async <Row extends QueryResultRow>(
      text: string,
      values?: readonly unknown[],
    ) => client.query<Row>(text, values as unknown[] | undefined),
  };
}
