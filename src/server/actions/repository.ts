import { getPostgresPool, toSqlExecutor, type SqlExecutor } from "../database/postgres-client";
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
  /** Compare-and-swap action state plus audit event in one repository operation. */
  transitionExecutionAction(action: ActionCandidate, event: AgentActionEvent): Promise<ActionCandidate | null>;
  getPlan(source: DataSource, planId: string): Promise<AgentActionPlan | null>;
  findPlanByFingerprint(source: DataSource, fingerprint: string): Promise<AgentActionPlan | null>;
  savePlan(plan: AgentActionPlan): Promise<AgentActionPlan>;
  findActiveActionByFingerprint(source: DataSource, fingerprint: string): Promise<ActionCandidate | null>;
}

class MemoryAgentActionRepository implements AgentActionRepository {
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
  async appendEvent(event: AgentActionEvent): Promise<void> { this.events.push(event); }
  async transitionExecutionAction(action: ActionCandidate, event: AgentActionEvent): Promise<ActionCandidate | null> {
    const current = this.actions.get(action.id);
    if (!current || current.source !== action.source || current.status !== event.previousStatus || current.version !== action.version - 1) return null;
    this.actions.set(action.id, action);
    this.events.push(event);
    return action;
  }
  async getPlan(source: DataSource, planId: string): Promise<AgentActionPlan | null> {
    const plan = this.plans.get(planId); return plan?.source === source ? plan : null;
  }
  async findPlanByFingerprint(source: DataSource, fingerprint: string): Promise<AgentActionPlan | null> {
    return [...this.plans.values()].find((plan) => plan.source === source && plan.fingerprint === fingerprint) ?? null;
  }
  async savePlan(plan: AgentActionPlan): Promise<AgentActionPlan> { this.plans.set(plan.id, plan); return plan; }
  async findActiveActionByFingerprint(source: DataSource, fingerprint: string): Promise<ActionCandidate | null> {
    return [...this.actions.values()].find((action) => action.source === source && action.fingerprint === fingerprint && ["proposed", "approved", "ready_for_execution"].includes(action.status)) ?? null;
  }
}

class PostgresAgentActionRepository implements AgentActionRepository {
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
    await this.sql.query(`INSERT INTO actions (id, merchant_id, payload, status, version) VALUES ($1, $2, $3::jsonb, $4, $5) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, status = EXCLUDED.status, version = EXCLUDED.version, updated_at = NOW()`, [action.id, this.merchantId, JSON.stringify(action), action.status, action.version]);
    return action;
  }
  async listEvents(source: DataSource, actionId?: string): Promise<readonly AgentActionEvent[]> {
    const result = await this.sql.query<{ payload: AgentActionEvent | string }>(`SELECT payload FROM action_events WHERE ($1::text IS NULL OR action_id = $1) AND payload->>'source' = $2 ORDER BY created_at ASC`, [actionId ?? null, source]);
    return result.rows.map((row) => parsePayload<AgentActionEvent>(row.payload));
  }
  async appendEvent(event: AgentActionEvent): Promise<void> {
    await this.sql.query(`INSERT INTO action_events (id, action_id, payload) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO NOTHING`, [event.id, event.actionId, JSON.stringify(event)]);
  }
  async transitionExecutionAction(action: ActionCandidate, event: AgentActionEvent): Promise<ActionCandidate | null> {
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
    const result = await this.sql.query<{ payload: ActionCandidate | string }>(`SELECT payload FROM actions WHERE merchant_id = $1 AND payload->>'source' = $2 AND payload->>'fingerprint' = $3 AND status IN ('proposed', 'approved', 'ready_for_execution') LIMIT 1`, [this.merchantId, source, fingerprint]);
    return result.rows[0] ? parsePayload<ActionCandidate>(result.rows[0].payload) : null;
  }
}

function parsePayload<T>(payload: T | string): T { return typeof payload === "string" ? JSON.parse(payload) as T : payload; }
const memoryStore = globalThis as typeof globalThis & { payPulseAgentActionRepository?: MemoryAgentActionRepository };
export function getAgentActionRepository(): AgentActionRepository {
  if (process.env.DATABASE_URL?.trim()) return new PostgresAgentActionRepository(toSqlExecutor(getPostgresPool()), process.env.PAYPULSE_MERCHANT_ID?.trim() || "paypal-sandbox-default");
  memoryStore.payPulseAgentActionRepository ??= new MemoryAgentActionRepository();
  return memoryStore.payPulseAgentActionRepository;
}
