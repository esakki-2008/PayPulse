import type { PaymentIntelligenceRepository } from "./repository";
import type {
  ActionEvent,
  ActionRecommendation,
  Customer,
  IntelligenceSignal,
  Transaction,
} from "@/types/domain";

/**
 * A bounded process-local cache for read-only Sandbox development when a
 * PostgreSQL adapter is not yet configured. It stores only normalized records,
 * is labeled as non-durable in diagnostics, and never mixes with demo data.
 */
export class SandboxMemoryRepository implements PaymentIntelligenceRepository {
  private readonly customers = new Map<string, Customer>();
  private readonly transactions = new Map<string, Transaction>();

  async listCustomers(): Promise<readonly Customer[]> {
    // Values in distinct currencies are intentionally not ordered as if FX
    // conversion had occurred. Name ordering stays deterministic and honest.
    return [...this.customers.values()].sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    return this.customers.get(customerId) ?? null;
  }

  async upsertCustomers(customers: readonly Customer[]): Promise<void> {
    for (const customer of customers) {
      this.customers.set(customer.id, customer);
    }
  }

  async listTransactions(): Promise<readonly Transaction[]> {
    return [...this.transactions.values()].sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt),
    );
  }

  async upsertTransactions(transactions: readonly Transaction[]): Promise<void> {
    for (const transaction of transactions) {
      this.transactions.set(transaction.id, transaction);
    }
  }

  async listSignals(): Promise<readonly IntelligenceSignal[]> {
    return [];
  }

  async listActions(): Promise<readonly ActionRecommendation[]> {
    return [];
  }

  async getAction(): Promise<ActionRecommendation | null> {
    return null;
  }

  async saveAction(): Promise<ActionRecommendation> {
    throw new Error("Sandbox action persistence is not available in Phase 4.");
  }

  async appendActionEvent(): Promise<void> {
    throw new Error("Sandbox action persistence is not available in Phase 4.");
  }

  async listActionEvents(): Promise<readonly ActionEvent[]> {
    return [];
  }
}

const sandboxRepositoryGlobal = globalThis as typeof globalThis & {
  payPulseSandboxMemoryRepository?: SandboxMemoryRepository;
};

export function getSandboxMemoryRepository(): SandboxMemoryRepository {
  sandboxRepositoryGlobal.payPulseSandboxMemoryRepository ??= new SandboxMemoryRepository();
  return sandboxRepositoryGlobal.payPulseSandboxMemoryRepository;
}
