import { randomUUID } from "node:crypto";

import { getPostgresPool, toSqlExecutor, type SqlExecutor } from "../../database/postgres-client";
import type { ExecutionOutcome, ExecutionOutcomeStatus } from "@/types/domain";

export interface ExecutionOutcomeRepository {
  findByIdempotencyKey(idempotencyKey: string): Promise<ExecutionOutcome | null>;
  getByExecutionId(executionId: string): Promise<ExecutionOutcome | null>;
  listByActionId(actionId: string): Promise<readonly ExecutionOutcome[]>;
  /** Atomically reserves an idempotency key. A pending record is also the execution lock. */
  claim(input: Omit<ExecutionOutcome, "executionId" | "timestamp" | "status"> & { readonly status?: "pending" }): Promise<{ readonly claimed: boolean; readonly outcome: ExecutionOutcome }>;
  save(outcome: ExecutionOutcome): Promise<ExecutionOutcome>;
}

function createPendingOutcome(input: Omit<ExecutionOutcome, "executionId" | "timestamp" | "status">): ExecutionOutcome {
  return {
    ...input,
    executionId: `execution_${randomUUID()}`,
    timestamp: new Date().toISOString(),
    status: "pending",
    paypalReference: null,
    failureCategory: null,
    summary: "Execution lock reserved. No PayPal operation has been confirmed.",
  };
}

export class MemoryExecutionOutcomeRepository implements ExecutionOutcomeRepository {
  private readonly outcomes = new Map<string, ExecutionOutcome>();

  async findByIdempotencyKey(idempotencyKey: string): Promise<ExecutionOutcome | null> {
    return this.outcomes.get(idempotencyKey) ?? null;
  }
  async getByExecutionId(executionId: string): Promise<ExecutionOutcome | null> {
    return [...this.outcomes.values()].find((outcome) => outcome.executionId === executionId) ?? null;
  }
  async listByActionId(actionId: string): Promise<readonly ExecutionOutcome[]> {
    return [...this.outcomes.values()].filter((outcome) => outcome.actionId === actionId).sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  }

  async claim(input: Omit<ExecutionOutcome, "executionId" | "timestamp" | "status"> & { readonly status?: "pending" }): Promise<{ readonly claimed: boolean; readonly outcome: ExecutionOutcome }> {
    const existing = this.outcomes.get(input.idempotencyKey);
    if (existing) return { claimed: false, outcome: existing };
    const outcome = createPendingOutcome(input);
    this.outcomes.set(outcome.idempotencyKey, outcome);
    return { claimed: true, outcome };
  }

  async save(outcome: ExecutionOutcome): Promise<ExecutionOutcome> {
    this.outcomes.set(outcome.idempotencyKey, outcome);
    return outcome;
  }
}

class PostgresExecutionOutcomeRepository implements ExecutionOutcomeRepository {
  constructor(private readonly sql: SqlExecutor, private readonly merchantId: string) {}

  private async ensureMerchant(): Promise<void> {
    await this.sql.query("INSERT INTO merchants (id, name) VALUES ($1, 'PayPulse action merchant') ON CONFLICT (id) DO NOTHING", [this.merchantId]);
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<ExecutionOutcome | null> {
    const result = await this.sql.query<ExecutionRow>(
      "SELECT execution_id, action_id, source, provider, operation, status, paypal_reference, failure_category, summary, idempotency_key, updated_at FROM action_executions WHERE merchant_id = $1 AND source = 'paypal_sandbox' AND idempotency_key = $2 LIMIT 1",
      [this.merchantId, idempotencyKey],
    );
    return result.rows[0] ? toOutcome(result.rows[0]) : null;
  }
  async getByExecutionId(executionId: string): Promise<ExecutionOutcome | null> {
    const result = await this.sql.query<ExecutionRow>(
      "SELECT execution_id, action_id, source, provider, operation, status, paypal_reference, failure_category, summary, idempotency_key, updated_at FROM action_executions WHERE merchant_id = $1 AND execution_id = $2 LIMIT 1",
      [this.merchantId, executionId],
    );
    return result.rows[0] ? toOutcome(result.rows[0]) : null;
  }
  async listByActionId(actionId: string): Promise<readonly ExecutionOutcome[]> {
    const result = await this.sql.query<ExecutionRow>(
      "SELECT execution_id, action_id, source, provider, operation, status, paypal_reference, failure_category, summary, idempotency_key, updated_at FROM action_executions WHERE merchant_id = $1 AND action_id = $2 ORDER BY updated_at ASC",
      [this.merchantId, actionId],
    );
    return result.rows.map(toOutcome);
  }

  async claim(input: Omit<ExecutionOutcome, "executionId" | "timestamp" | "status"> & { readonly status?: "pending" }): Promise<{ readonly claimed: boolean; readonly outcome: ExecutionOutcome }> {
    await this.ensureMerchant();
    const outcome = createPendingOutcome(input);
    const inserted = await this.sql.query<ExecutionRow>(
      "INSERT INTO action_executions (execution_id, merchant_id, action_id, source, idempotency_key, provider, operation, status, paypal_reference, failure_category, summary, created_at, updated_at) VALUES ($1, $2, $3, 'paypal_sandbox', $4, $5, $6, 'pending', NULL, NULL, $7, $8, $8) ON CONFLICT (merchant_id, source, idempotency_key) DO NOTHING RETURNING execution_id, action_id, source, provider, operation, status, paypal_reference, failure_category, summary, idempotency_key, updated_at",
      [outcome.executionId, this.merchantId, outcome.actionId, outcome.idempotencyKey, outcome.provider, outcome.operation, outcome.summary, outcome.timestamp],
    );
    if (inserted.rows[0]) return { claimed: true, outcome: toOutcome(inserted.rows[0]) };
    const existing = await this.findByIdempotencyKey(input.idempotencyKey);
    if (!existing) throw new Error("Execution lock could not be read after a duplicate reservation.");
    return { claimed: false, outcome: existing };
  }

  async save(outcome: ExecutionOutcome): Promise<ExecutionOutcome> {
    const result = await this.sql.query<ExecutionRow>(
      "UPDATE action_executions SET status = $1, paypal_reference = $2, failure_category = $3, summary = $4, updated_at = $5 WHERE merchant_id = $6 AND execution_id = $7 RETURNING execution_id, action_id, source, provider, operation, status, paypal_reference, failure_category, summary, idempotency_key, updated_at",
      [outcome.status, outcome.paypalReference, outcome.failureCategory, outcome.summary, outcome.timestamp, this.merchantId, outcome.executionId],
    );
    if (!result.rows[0]) throw new Error("Execution outcome could not be persisted.");
    return toOutcome(result.rows[0]);
  }
}

interface ExecutionRow {
  readonly execution_id: string;
  readonly action_id: string;
  readonly source: "paypal_sandbox";
  readonly provider: "paypal_sandbox";
  readonly operation: "capture_order" | "capability_check";
  readonly status: ExecutionOutcomeStatus;
  readonly paypal_reference: string | null;
  readonly failure_category: ExecutionOutcome["failureCategory"];
  readonly summary: string;
  readonly idempotency_key: string;
  readonly updated_at: string | Date;
}

function toOutcome(row: ExecutionRow): ExecutionOutcome {
  return {
    executionId: row.execution_id,
    actionId: row.action_id,
    source: row.source,
    provider: row.provider,
    operation: row.operation,
    status: row.status,
    paypalReference: row.paypal_reference,
    timestamp: new Date(row.updated_at).toISOString(),
    summary: row.summary,
    idempotencyKey: row.idempotency_key,
    failureCategory: row.failure_category,
  };
}

const memoryStore = globalThis as typeof globalThis & { payPulseExecutionOutcomeRepository?: MemoryExecutionOutcomeRepository };

export function getExecutionOutcomeRepository(): ExecutionOutcomeRepository {
  if (process.env.DATABASE_URL?.trim()) {
    return new PostgresExecutionOutcomeRepository(
      toSqlExecutor(getPostgresPool()),
      process.env.PAYPULSE_MERCHANT_ID?.trim() || "paypal-sandbox-default",
    );
  }
  memoryStore.payPulseExecutionOutcomeRepository ??= new MemoryExecutionOutcomeRepository();
  return memoryStore.payPulseExecutionOutcomeRepository;
}
