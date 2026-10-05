import { getPostgresPool, toSqlExecutor, type SqlExecutor } from "../../database/postgres-client";
import { assertPersistenceConfigured, canUseMemoryPersistence } from "../../runtime-config";
import type { ActionOutcome, DataSource, LearningEvent } from "@/types/domain";

/**
 * Append-only persistence for verified outcomes and deterministic learning events.
 * Payloads are safe normalized records only; they never contain OAuth material,
 * headers, or raw authenticated provider responses.
 */
export interface OutcomeLearningRepository {
  getOutcome(source: DataSource, outcomeId: string): Promise<ActionOutcome | null>;
  listOutcomes(source: DataSource, filters?: { readonly actionId?: string; readonly customerId?: string }): Promise<readonly ActionOutcome[]>;
  findOutcomeByIdempotencyKey(source: DataSource, idempotencyKey: string): Promise<ActionOutcome | null>;
  saveOutcome(outcome: ActionOutcome): Promise<{ readonly created: boolean; readonly outcome: ActionOutcome }>;
  listLearningEvents(source: DataSource, customerId?: string): Promise<readonly LearningEvent[]>;
  findLearningEventByFingerprint(source: DataSource, fingerprint: string): Promise<LearningEvent | null>;
  appendLearningEvent(event: LearningEvent): Promise<{ readonly created: boolean; readonly event: LearningEvent }>;
}

export class MemoryOutcomeLearningRepository implements OutcomeLearningRepository {
  private readonly outcomes = new Map<string, ActionOutcome>();
  private readonly outcomeIdempotency = new Map<string, string>();
  private readonly events = new Map<string, LearningEvent>();
  private readonly eventFingerprints = new Map<string, string>();

  async getOutcome(source: DataSource, outcomeId: string): Promise<ActionOutcome | null> {
    const outcome = this.outcomes.get(outcomeId);
    return outcome?.source === source ? outcome : null;
  }
  async listOutcomes(source: DataSource, filters: { readonly actionId?: string; readonly customerId?: string } = {}): Promise<readonly ActionOutcome[]> {
    return [...this.outcomes.values()]
      .filter((outcome) => outcome.source === source)
      .filter((outcome) => !filters.actionId || outcome.actionId === filters.actionId)
      .filter((outcome) => !filters.customerId || outcome.customerId === filters.customerId)
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  }
  async findOutcomeByIdempotencyKey(source: DataSource, idempotencyKey: string): Promise<ActionOutcome | null> {
    const outcomeId = this.outcomeIdempotency.get(`${source}:${idempotencyKey}`);
    return outcomeId ? this.getOutcome(source, outcomeId) : null;
  }
  async saveOutcome(outcome: ActionOutcome): Promise<{ readonly created: boolean; readonly outcome: ActionOutcome }> {
    const existing = await this.findOutcomeByIdempotencyKey(outcome.source, outcome.audit.idempotencyKey);
    if (existing) return { created: false, outcome: existing };
    if (this.outcomes.has(outcome.outcomeId)) throw new Error("Outcome identifier already exists with a different idempotency key.");
    const stored = deepFreeze(outcome);
    this.outcomes.set(stored.outcomeId, stored);
    this.outcomeIdempotency.set(`${stored.source}:${stored.audit.idempotencyKey}`, stored.outcomeId);
    return { created: true, outcome: stored };
  }
  async listLearningEvents(source: DataSource, customerId?: string): Promise<readonly LearningEvent[]> {
    return [...this.events.values()]
      .filter((event) => event.source === source && (!customerId || event.customerId === customerId))
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  }
  async findLearningEventByFingerprint(source: DataSource, fingerprint: string): Promise<LearningEvent | null> {
    const eventId = this.eventFingerprints.get(`${source}:${fingerprint}`);
    const event = eventId ? this.events.get(eventId) : null;
    return event?.source === source ? event : null;
  }
  async appendLearningEvent(event: LearningEvent): Promise<{ readonly created: boolean; readonly event: LearningEvent }> {
    const existing = await this.findLearningEventByFingerprint(event.source, event.fingerprint);
    if (existing) return { created: false, event: existing };
    if (this.events.has(event.learningEventId)) throw new Error("Learning event identifier already exists with a different fingerprint.");
    const stored = deepFreeze(event);
    this.events.set(stored.learningEventId, stored);
    this.eventFingerprints.set(`${stored.source}:${stored.fingerprint}`, stored.learningEventId);
    return { created: true, event: stored };
  }
}

class PostgresOutcomeLearningRepository implements OutcomeLearningRepository {
  constructor(private readonly sql: SqlExecutor, private readonly merchantId: string) {}
  private async ensureMerchant(): Promise<void> {
    await this.sql.query("INSERT INTO merchants (id, name) VALUES ($1, 'PayPulse action merchant') ON CONFLICT (id) DO NOTHING", [this.merchantId]);
  }
  async getOutcome(source: DataSource, outcomeId: string): Promise<ActionOutcome | null> {
    const result = await this.sql.query<{ payload: ActionOutcome | string }>(
      "SELECT payload FROM execution_outcomes WHERE merchant_id = $1 AND source = $2 AND outcome_id = $3 LIMIT 1",
      [this.merchantId, source, outcomeId],
    );
    return result.rows[0] ? parsePayload<ActionOutcome>(result.rows[0].payload) : null;
  }
  async listOutcomes(source: DataSource, filters: { readonly actionId?: string; readonly customerId?: string } = {}): Promise<readonly ActionOutcome[]> {
    const result = await this.sql.query<{ payload: ActionOutcome | string }>(
      "SELECT payload FROM execution_outcomes WHERE merchant_id = $1 AND source = $2 AND ($3::text IS NULL OR action_id = $3) AND ($4::text IS NULL OR customer_id = $4) ORDER BY recorded_at ASC",
      [this.merchantId, source, filters.actionId ?? null, filters.customerId ?? null],
    );
    return result.rows.map((row) => parsePayload<ActionOutcome>(row.payload));
  }
  async findOutcomeByIdempotencyKey(source: DataSource, idempotencyKey: string): Promise<ActionOutcome | null> {
    const result = await this.sql.query<{ payload: ActionOutcome | string }>(
      "SELECT payload FROM execution_outcomes WHERE merchant_id = $1 AND source = $2 AND idempotency_key = $3 LIMIT 1",
      [this.merchantId, source, idempotencyKey],
    );
    return result.rows[0] ? parsePayload<ActionOutcome>(result.rows[0].payload) : null;
  }
  async saveOutcome(outcome: ActionOutcome): Promise<{ readonly created: boolean; readonly outcome: ActionOutcome }> {
    await this.ensureMerchant();
    const inserted = await this.sql.query<{ payload: ActionOutcome | string }>(
      "INSERT INTO execution_outcomes (outcome_id, merchant_id, action_id, source, action_fingerprint, action_version, provider, provider_reference, status, customer_id, payment_id, failure_category, correlation, idempotency_key, payload, recorded_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16) ON CONFLICT (merchant_id, source, idempotency_key) DO NOTHING RETURNING payload",
      [outcome.outcomeId, this.merchantId, outcome.actionId, outcome.source, outcome.actionFingerprint, outcome.actionVersion, outcome.provider, outcome.providerReference, outcome.status, outcome.customerId, outcome.paymentId, outcome.failureCategory, outcome.correlation, outcome.audit.idempotencyKey, JSON.stringify(outcome), outcome.audit.recordedAt],
    );
    if (inserted.rows[0]) return { created: true, outcome: parsePayload<ActionOutcome>(inserted.rows[0].payload) };
    const existing = await this.findOutcomeByIdempotencyKey(outcome.source, outcome.audit.idempotencyKey);
    if (!existing) throw new Error("Outcome could not be read after an idempotency conflict.");
    return { created: false, outcome: existing };
  }
  async listLearningEvents(source: DataSource, customerId?: string): Promise<readonly LearningEvent[]> {
    const result = await this.sql.query<{ payload: LearningEvent | string }>(
      "SELECT payload FROM learning_events WHERE merchant_id = $1 AND source = $2 AND ($3::text IS NULL OR customer_id = $3) ORDER BY occurred_at ASC",
      [this.merchantId, source, customerId ?? null],
    );
    return result.rows.map((row) => parsePayload<LearningEvent>(row.payload));
  }
  async findLearningEventByFingerprint(source: DataSource, fingerprint: string): Promise<LearningEvent | null> {
    const result = await this.sql.query<{ payload: LearningEvent | string }>(
      "SELECT payload FROM learning_events WHERE merchant_id = $1 AND source = $2 AND fingerprint = $3 LIMIT 1",
      [this.merchantId, source, fingerprint],
    );
    return result.rows[0] ? parsePayload<LearningEvent>(result.rows[0].payload) : null;
  }
  async appendLearningEvent(event: LearningEvent): Promise<{ readonly created: boolean; readonly event: LearningEvent }> {
    await this.ensureMerchant();
    const inserted = await this.sql.query<{ payload: LearningEvent | string }>(
      "INSERT INTO learning_events (learning_event_id, merchant_id, outcome_id, action_id, source, customer_id, fingerprint, outcome_status, correlation, payload, occurred_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11) ON CONFLICT (merchant_id, source, fingerprint) DO NOTHING RETURNING payload",
      [event.learningEventId, this.merchantId, event.outcomeId, event.actionId, event.source, event.customerId, event.fingerprint, event.outcome, event.correlation, JSON.stringify(event), event.timestamp],
    );
    if (inserted.rows[0]) return { created: true, event: parsePayload<LearningEvent>(inserted.rows[0].payload) };
    const existing = await this.findLearningEventByFingerprint(event.source, event.fingerprint);
    if (!existing) throw new Error("Learning event could not be read after an idempotency conflict.");
    return { created: false, event: existing };
  }
}

function parsePayload<T>(payload: T | string): T { return typeof payload === "string" ? JSON.parse(payload) as T : payload; }
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
const memoryStore = globalThis as typeof globalThis & { payPulseOutcomeLearningRepositories?: Map<string, MemoryOutcomeLearningRepository> };
export function getOutcomeLearningRepository(merchantId?: string): OutcomeLearningRepository {
  const resolvedMerchantId = merchantId ?? (process.env.PAYPULSE_MERCHANT_ID?.trim() || "paypal-sandbox-default");
  if (process.env.DATABASE_URL?.trim()) {
    return new PostgresOutcomeLearningRepository(toSqlExecutor(getPostgresPool()), resolvedMerchantId);
  }
  assertPersistenceConfigured();
  if (!canUseMemoryPersistence()) throw new Error("Memory persistence was not explicitly enabled.");
  const repositories = memoryStore.payPulseOutcomeLearningRepositories ??= new Map();
  let repository = repositories.get(resolvedMerchantId);
  if (!repository) {
    repository = new MemoryOutcomeLearningRepository();
    repositories.set(resolvedMerchantId, repository);
  }
  return repository;
}
