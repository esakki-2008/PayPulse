import { calculateDashboardMetrics } from "../dashboard/metrics";
import { getPostgresPool, toSqlExecutor } from "../database/postgres-client";
import { PostgresPaymentIntelligenceRepository } from "../database/postgres-repository";
import type { PaymentIntelligenceRepository } from "../database/repository";
import { getSandboxMemoryRepository } from "../database/sandbox-memory-repository";
import { normalizePayPalSandboxCustomers, normalizePayPalSandboxTransactions } from "./normalizer";
import {
  PayPalTransactionService,
  type PayPalTransactionReader,
} from "./transaction-service";
import { assertServerRuntime } from "../runtime";
import type { DashboardSnapshot } from "@/types/domain";

assertServerRuntime("PayPal Sandbox data adapter");

const SANDBOX_CACHE_TTL_MS = 60_000;
const DEFAULT_MERCHANT_ID = "paypal-sandbox-default";

export type SandboxPersistence = "memory_cache" | "postgres";

export interface PayPalSandboxDataSnapshot {
  readonly snapshot: DashboardSnapshot;
  readonly persistence: SandboxPersistence;
  readonly fetchedAt: string;
  readonly totalProviderItems: number;
  readonly totalProviderPages: number;
}

export interface PayPalSandboxDataAdapterOptions {
  readonly transactionService?: PayPalTransactionReader;
  readonly repository?: PaymentIntelligenceRepository;
  readonly now?: () => Date;
  readonly persistence?: SandboxPersistence;
}

/**
 * Read-only adapter: Transaction Search → normalization → repository →
 * PayPulse snapshot. It never creates or mutates a PayPal resource.
 */
export class PayPalSandboxDataAdapter {
  private readonly transactionService: PayPalTransactionReader;
  private readonly repository: PaymentIntelligenceRepository;
  private readonly now: () => Date;
  private readonly persistence: SandboxPersistence;

  constructor(options: PayPalSandboxDataAdapterOptions = {}) {
    const selectedRepository = resolveSelectedRepository(options);
    this.transactionService = options.transactionService ?? new PayPalTransactionService();
    this.repository = selectedRepository.repository;
    this.persistence = selectedRepository.persistence;
    this.now = options.now ?? (() => new Date());
  }

  async syncRecentTransactions(): Promise<PayPalSandboxDataSnapshot> {
    const endDate = this.now();
    const startDate = new Date(endDate.getTime() - 31 * 24 * 60 * 60 * 1_000);
    const result = await this.transactionService.listTransactions({
      startDate,
      endDate,
      pageSize: 100,
      maxPages: 3,
    });
    const transactions = normalizePayPalSandboxTransactions(result.transactionDetails);
    const customers = normalizePayPalSandboxCustomers(
      result.transactionDetails,
      transactions,
    );

    await this.repository.upsertCustomers(customers);
    await this.repository.upsertTransactions(transactions);

    // The snapshot is intentionally bounded to this provider response. The
    // repository remains a durable normalized record store, but old persisted
    // history is not presented as though it were in the current 31-day query.
    const metrics = calculateDashboardMetrics(transactions, customers, endDate);

    return {
      snapshot: {
        source: "paypal_sandbox",
        environment: "sandbox",
        generatedAt: endDate.toISOString(),
        coreState: transactions.length > 0 ? "analyzing" : "idle",
        metrics,
        customers,
        transactions,
        signals: [],
        actionPlan: null,
        actions: [],
      },
      persistence: this.persistence,
      fetchedAt: endDate.toISOString(),
      totalProviderItems: result.totalItems,
      totalProviderPages: result.totalPages,
    };
  }
}

interface CachedSandboxSnapshot {
  readonly value: PayPalSandboxDataSnapshot;
  readonly expiresAtMs: number;
}

const sandboxCache = globalThis as typeof globalThis & {
  payPulseSandboxSnapshot?: CachedSandboxSnapshot;
  payPulseSandboxSync?: Promise<PayPalSandboxDataSnapshot>;
};

/**
 * Short server-side cache avoids reporting API calls on every page/API render.
 * There is no browser polling and no data is fabricated on failure.
 */
export async function getCachedPayPalSandboxData(): Promise<PayPalSandboxDataSnapshot> {
  const now = Date.now();
  const cached = sandboxCache.payPulseSandboxSnapshot;
  if (cached && cached.expiresAtMs > now) {
    return cached.value;
  }

  if (sandboxCache.payPulseSandboxSync) {
    return sandboxCache.payPulseSandboxSync;
  }

  const sync = new PayPalSandboxDataAdapter().syncRecentTransactions();
  sandboxCache.payPulseSandboxSync = sync;

  try {
    const value = await sync;
    sandboxCache.payPulseSandboxSnapshot = {
      value,
      expiresAtMs: Date.now() + SANDBOX_CACHE_TTL_MS,
    };
    return value;
  } finally {
    sandboxCache.payPulseSandboxSync = undefined;
  }
}

function resolveSelectedRepository(
  options: PayPalSandboxDataAdapterOptions,
): {
  readonly repository: PaymentIntelligenceRepository;
  readonly persistence: SandboxPersistence;
} {
  if (options.repository) {
    return {
      repository: options.repository,
      persistence: options.persistence ?? "memory_cache",
    };
  }

  return resolveSandboxRepository();
}

function resolveSandboxRepository(): {
  readonly repository: PaymentIntelligenceRepository;
  readonly persistence: SandboxPersistence;
} {
  if (process.env.DATABASE_URL?.trim()) {
    const repository = new PostgresPaymentIntelligenceRepository(
      toSqlExecutor(getPostgresPool()),
      process.env.PAYPULSE_MERCHANT_ID?.trim() || DEFAULT_MERCHANT_ID,
    );
    return { repository, persistence: "postgres" };
  }

  return {
    repository: getSandboxMemoryRepository(),
    persistence: "memory_cache",
  };
}
