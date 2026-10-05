import { getPostgresPool, toSqlExecutor, type SqlExecutor } from "../database/postgres-client";
import { assertPersistenceConfigured, canUseMemoryPersistence } from "../runtime-config";
import type {
  ActionCandidate,
  AgentActionEvent,
  AgentActionPlan,
  DataSource,
} from "@/types/domain";

export interface AgentActionRepository {
  listActions(source: DataSource): Promise<readonly ActionCandidate[]>;
  getAction(source: DataSource, actionId: string): Promise<ActionCandidate | null>;
  saveAction(action: ActionCandidate): Promise<ActionCandidate>;
  listEvents(source: DataSource, actionId?: string): Promise<readonly AgentActionEvent[]>;
  appendEvent(event: AgentActionEvent): Promise<void>;
  /** Atomically creates/restarts a non-active action and records its creation event once. */
  saveActionWithEventIfInactive(action: ActionCandidate, event: AgentActionEvent): Promise<{ readonly action: ActionCandidate; readonly created: boolean }>;
  /** Compare-and-swap any action state plus its audit event in one repository operation. */
  transitionAction(action: ActionCandidate, event: AgentActionEvent): Promise<ActionCandidate | null>;
  /** Legacy-named execution boundary; it shares the same compare-and-swap invariant. */
  transitionExecutionAction(action: ActionCandidate, event: AgentActionEvent): Promise<ActionCandidate | null>;
  getPlan(source: DataSource, planId: string): Promise<AgentActionPlan | null>;
  findPlanByFingerprint(source: DataSource, fingerprint: string): Promise<AgentActionPlan | null>;
  savePlan(plan: AgentActionPlan): Promise<AgentActionPlan>;
  findActiveActionByFingerprint(source: DataSource, fingerprint: string): Promise<ActionCandidate | null>;
}

export class MemoryAgentActionRepository implements AgentActionRepository {
  private readonly actions = new Map<string, ActionCandidate>();
  private readonly plans = new Map<string, AgentActionPlan>();
  private readonly events: AgentActionEvent[] = [];

  async listActions(source: DataSource): Promise<readonly ActionCandidate[]> {
    return [...this.actions.values()]
      .filter((action) => action.source === source)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
  async getAction(source: DataSource, actionId: string): Promise<ActionCandidate | null> {
    const action = this.actions.get(actionId);
    return action?.source === source ? action : null;
  }
  async saveAction(action: ActionCandidate): Promise<ActionCandidate> { this.actions.set(action.id, action); return action; }
  async listEvents(source: DataSource, actionId?: string): Promise<readonly AgentActionEvent[]> {
    return this.events.filter((event) => event.source === source && (!actionId || event.actionId === actionId));
  }
  async appendEvent(event: AgentActionEvent): Promise<void> {
    if (!this.events.some((existing) => existing.id === event.id)) this.events.push(event);
  }
  async saveActionWithEventIfInactive(action: ActionCandidate, event: AgentActionEvent): Promise<{ readonly action: ActionCandidate; readonly created: boolean }> {
    const current = this.actions.get(action.id);
    if (current && current.source === action.source && isActiveActionStatus(current.status)) return { action: current, created: false };
    this.actions.set(action.id, action);
    await this.appendEvent(event);
    return { action, created: true };
  }
  async transitionAction(action: ActionCandidate, event: AgentActionEvent): Promise<ActionCandidate | null> {
    const current = this.actions.get(action.id);
    if (!current || current.source !== action.source || current.status !== event.previousStatus || current.version !== action.version - 1) return null;
    this.actions.set(action.id, action);
    await this.appendEvent(event);
    return action;
  }
  async transitionExecutionAction(action: ActionCandidate, event: AgentActionEvent): Promise<ActionCandidate | null> {
    return this.transitionAction(action, event);
  }
  async getPlan(source: DataSource, planId: string): Promise<AgentActionPlan | null> {
    const plan = this.plans.get(planId); return plan?.source === source ? plan : null;
  }
  async findPlanByFingerprint(source: DataSource, fingerprint: string): Promise<AgentActionPlan | null> {
    return [...this.plans.values()].find((plan) => plan.source === source && plan.fingerprint === fingerprint) ?? null;
  }
  async savePlan(plan: AgentActionPlan): Promise<AgentActionPlan> { this.plans.set(plan.id, plan); return plan; }
  async findActiveActionByFingerprint(source: DataSource, fingerprint: string): Promise<ActionCandidate | null> {
    return [...this.actions.values()].find((action) => action.source === source && action.fingerprint === fingerprint && isActiveActionStatus(action.status)) ?? null;
  }
  async findLatestActionByFingerprint(source: DataSource, fingerprint: string): Promise<ActionCandidate | null> {
    return [...this.actions.values()]
      .filter((action) => action.source === source && action.fingerprint === fingerprint)
      .sort((left, right) => right.attempt - left.attempt || right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  }
}

export class PostgresAgentActionRepository implements AgentActionRepository {
  constructor(private readonly sql: SqlExecutor, private readonly merchantId: string) {}
  private async ensureMerchant(): Promise<void> {
    await this.sql.query(`INSERT INTO merchants (id, name) VALUES ($1, 'PayPulse action merchant') ON CONFLICT (id) DO NOTHING`, [this.merchantId]);
  }
  async listActions(source: DataSource): Promise<readonly ActionCandidate[]> {
    const result = await this.sql.query<{ payload: ActionCandidate | string }>(`SELECT payload FROM actions WHERE merchant_id = $1 AND payload->>'source' = $2 ORDER BY created_at DESC`, [this.merchantId, source]);
    return result.rows.map((row) => parsePayload<ActionCandidate>(row.payload));
  }
  async getAction(source: DataSource, actionId: string): Promise<ActionCandidate | null> {
    const result = await this.sql.query<{ payload: ActionCandidate | string }>(`SELECT payload FROM actions WHERE merchant_id = $1 AND id = $2 AND payload->>'source' = $3 LIMIT 1`, [this.merchantId, actionId, source]);
    return result.rows[0] ? parsePayload<ActionCandidate>(result.rows[0].payload) : null;
  }
  async saveAction(action: ActionCandidate): Promise<ActionCandidate> {
    await this.ensureMerchant();
    await this.sql.query(`INSERT INTO actions (id, merchant_id, payload, status, version) VALUES ($1, $2, $3::jsonb, $4, $5) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, status = EXCLUDED.status, version = EXCLUDED.version, updated_at = NOW() WHERE actions.merchant_id = $2`, [action.id, this.merchantId, JSON.stringify(action), action.status, action.version]);
    return action;
  }
  async listEvents(source: DataSource, actionId?: string): Promise<readonly AgentActionEvent[]> {
    const result = await this.sql.query<{ payload: AgentActionEvent | string }>(`SELECT event.payload FROM action_events AS event JOIN actions AS action ON action.id = event.action_id WHERE action.merchant_id = $1 AND ($2::text IS NULL OR event.action_id = $2) AND event.payload->>'source' = $3 ORDER BY event.created_at ASC`, [this.merchantId, actionId ?? null, source]);
    return result.rows.map((row) => parsePayload<AgentActionEvent>(row.payload));
  }
  async appendEvent(event: AgentActionEvent): Promise<void> {
    await this.sql.query(`INSERT INTO action_events (id, action_id, payload) SELECT $1, action.id, $3::jsonb FROM actions AS action WHERE action.id = $2 AND action.merchant_id = $4 ON CONFLICT (id) DO NOTHING`, [event.id, event.actionId, JSON.stringify(event), this.merchantId]);
  }
  async saveActionWithEventIfInactive(action: ActionCandidate, event: AgentActionEvent): Promise<{ readonly action: ActionCandidate; readonly created: boolean }> {
    await this.ensureMerchant();
    const result = await this.sql.query<{ payload: ActionCandidate | string; created: boolean }>(`WITH stored AS (
      INSERT INTO actions (id, merchant_id, payload, status, version)
      VALUES ($1, $2, $3::jsonb, $4, $5)
      ON CONFLICT (id) DO UPDATE
        SET payload = EXCLUDED.payload, status = EXCLUDED.status, version = EXCLUDED.version, updated_at = NOW()
        WHERE actions.merchant_id = $2 AND actions.status NOT IN ('proposed', 'approved', 'ready_for_execution', 'executing', 'unknown')
      RETURNING payload, TRUE AS created
    ), recorded AS (
      INSERT INTO action_events (id, action_id, payload)
      SELECT $6, $1, $7::jsonb FROM stored
      ON CONFLICT (id) DO NOTHING
    )
    SELECT payload, created FROM stored
    UNION ALL
    SELECT payload, FALSE AS created FROM actions
    WHERE merchant_id = $2 AND id = $1 AND NOT EXISTS (SELECT 1 FROM stored)
    LIMIT 1`, [action.id, this.merchantId, JSON.stringify(action), action.status, action.version, event.id, JSON.stringify(event)]);
    const row = result.rows[0];
    if (row) return { action: parsePayload<ActionCandidate>(row.payload), created: row.created };

    // A concurrent INSERT can be visible to ON CONFLICT before it is visible to this
    // statement snapshot. Read again so a repeated Prepare request remains idempotent.
    const existing = await this.sql.query<{ payload: ActionCandidate | string }>(`SELECT payload FROM actions WHERE merchant_id = $1 AND id = $2 LIMIT 1`, [this.merchantId, action.id]);
    if (existing.rows[0]) return { action: parsePayload<ActionCandidate>(existing.rows[0].payload), created: false };
    throw new Error("Action creation state could not be read after persistence.");
  }
  async transitionAction(action: ActionCandidate, event: AgentActionEvent): Promise<ActionCandidate | null> {
    const result = await this.sql.query<{ id: string }>(`WITH updated AS (
      UPDATE actions SET payload = $1::jsonb, status = $2, version = $3, updated_at = NOW()
      WHERE merchant_id = $4 AND id = $5 AND status = $6 AND version = $7
      RETURNING id
    )
    INSERT INTO action_events (id, action_id, payload)
    SELECT $8, id, $9::jsonb FROM updated
    ON CONFLICT (id) DO NOTHING
    RETURNING action_id AS id`, [JSON.stringify(action), action.status, action.version, this.merchantId, action.id, event.previousStatus, action.version - 1, event.id, JSON.stringify(event)]);
    return result.rows[0] ? action : null;
  }
  async transitionExecutionAction(action: ActionCandidate, event: AgentActionEvent): Promise<ActionCandidate | null> {
    return this.transitionAction(action, event);
  }
  async getPlan(source: DataSource, planId: string): Promise<AgentActionPlan | null> {
    const result = await this.sql.query<{ payload: AgentActionPlan | string }>(`SELECT payload FROM action_plans WHERE merchant_id = $1 AND id = $2 AND payload->>'source' = $3 LIMIT 1`, [this.merchantId, planId, source]);
    return result.rows[0] ? parsePayload<AgentActionPlan>(result.rows[0].payload) : null;
  }
  async findPlanByFingerprint(source: DataSource, fingerprint: string): Promise<AgentActionPlan | null> {
    const result = await this.sql.query<{ payload: AgentActionPlan | string }>(`SELECT payload FROM action_plans WHERE merchant_id = $1 AND payload->>'source' = $2 AND payload->>'fingerprint' = $3 LIMIT 1`, [this.merchantId, source, fingerprint]);
    return result.rows[0] ? parsePayload<AgentActionPlan>(result.rows[0].payload) : null;
  }
  async savePlan(plan: AgentActionPlan): Promise<AgentActionPlan> {
    await this.ensureMerchant();
    await this.sql.query(`INSERT INTO action_plans (id, merchant_id, payload) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload`, [plan.id, this.merchantId, JSON.stringify(plan)]);
    return plan;
  }
  async findActiveActionByFingerprint(source: DataSource, fingerprint: string): Promise<ActionCandidate | null> {
    const result = await this.sql.query<{ payload: ActionCandidate | string }>(`SELECT payload FROM actions WHERE merchant_id = $1 AND payload->>'source' = $2 AND payload->>'fingerprint' = $3 AND status IN ('proposed', 'approved', 'ready_for_execution', 'executing', 'unknown') ORDER BY created_at DESC LIMIT 1`, [this.merchantId, source, fingerprint]);
    return result.rows[0] ? parsePayload<ActionCandidate>(result.rows[0].payload) : null;
  }
  async findLatestActionByFingerprint(source: DataSource, fingerprint: string): Promise<ActionCandidate | null> {
    const result = await this.sql.query<{ payload: ActionCandidate | string }>(`SELECT payload FROM actions WHERE merchant_id = $1 AND payload->>'source' = $2 AND payload->>'fingerprint' = $3 ORDER BY created_at DESC LIMIT 1`, [this.merchantId, source, fingerprint]);
    return result.rows[0] ? parsePayload<ActionCandidate>(result.rows[0].payload) : null;
  }
}

function isActiveActionStatus(status: ActionCandidate["status"]): boolean {
  return ["proposed", "approved", "ready_for_execution", "executing", "unknown"].includes(status);
}

function parsePayload<T>(payload: T | string): T { return typeof payload === "string" ? JSON.parse(payload) as T : payload; }
const memoryStore = globalThis as typeof globalThis & { payPulseAgentActionRepositories?: Map<string, MemoryAgentActionRepository> };
export function getAgentActionRepository(merchantId?: string): AgentActionRepository {
  const resolvedMerchantId = merchantId ?? (process.env.PAYPULSE_MERCHANT_ID?.trim() || "paypal-sandbox-default");
  if (process.env.DATABASE_URL?.trim()) return new PostgresAgentActionRepository(toSqlExecutor(getPostgresPool()), resolvedMerchantId);
  assertPersistenceConfigured();
  if (!canUseMemoryPersistence()) throw new Error("Memory persistence was not explicitly enabled.");
  const repositories = memoryStore.payPulseAgentActionRepositories ??= new Map();
  let repository = repositories.get(resolvedMerchantId);
  if (!repository) {
    repository = new MemoryAgentActionRepository();
    repositories.set(resolvedMerchantId, repository);
  }
  return repository;
}
