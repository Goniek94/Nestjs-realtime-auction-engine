export interface PgQueryResultLike<Row> {
  rows: Row[];
}

export interface PgClientLike {
  query<Row = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<PgQueryResultLike<Row>>;
  release(): void;
}

export interface PgPoolLike {
  connect(): Promise<PgClientLike>;
}

/** FNV-1a 32-bit, converted to a signed PostgreSQL int4. */
function hash32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash | 0;
}

function lockKeys(name: string): [number, number] {
  return [hash32(name, 0x811c9dc5), hash32(name, 0x9e3779b9)];
}

/**
 * Transaction-scoped PostgreSQL advisory lock for multi-replica schedulers.
 *
 * The callback runs while the advisory-lock transaction remains open. If the
 * callback uses its own DB transactions/connections, the advisory transaction
 * acts as a cluster-wide fence rather than a data transaction.
 */
export class PostgresAdvisoryCronLock {
  constructor(private readonly pool: PgPoolLike) {}

  async tryRun(name: string, work: () => Promise<void>): Promise<boolean> {
    const client = await this.pool.connect();
    const [keyA, keyB] = lockKeys(name);

    try {
      await client.query("BEGIN");
      const result = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_xact_lock($1::int, $2::int) AS acquired",
        [keyA, keyB],
      );

      if (!result.rows[0]?.acquired) {
        await client.query("ROLLBACK");
        return false;
      }

      await work();
      await client.query("COMMIT");
      return true;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original exception.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
