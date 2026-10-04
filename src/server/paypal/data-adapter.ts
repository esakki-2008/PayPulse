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
const PAYMENT_INTELLIGENCE_HISTORY_DAYS = 180;
const TRANSACTION_SEARCH_RANGE_DAYS = 31;
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
    const ranges = buildBoundedSearchRanges(endDate);
    const results = [];
    // Transaction Search accepts a 31-day maximum. Keep the broader Payment
    // DNA lookback honest by issuing a small, sequential set of documented,
    // non-overlapping range requests behind the shared 60-second cache.
    for (const range of ranges) {
      results.push(await this.transactionService.listTransactions({
        startDate: range.startDate,
        endDate: range.endDate,
        pageSize: 100,
        maxPages: 3,
      }));
    }
    const details = results.flatMap((result) => result.transactionDetails);
    const transactions = deduplicateTransactions(normalizePayPalSandboxTransactions(details));
    const customers = normalizePayPalSandboxCustomers(details, transactions);

    await this.repository.upsertCustomers(customers);
    await this.repository.upsertTransactions(transactions);

    // The snapshot is intentionally bounded to this 180-day provider lookback.
    // The repository remains durable, but older persisted history is not
    // presented as though it were in the current evidence window.
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
      totalProviderItems: results.reduce((total, result) => total + result.totalItems, 0),
      totalProviderPages: results.reduce((total, result) => total + result.totalPages, 0),
    };
  }
}

function buildBoundedSearchRanges(endDate: Date): readonly { readonly startDate: Date; readonly endDate: Date }[] {
  const earliest = new Date(endDate.getTime() - PAYMENT_INTELLIGENCE_HISTORY_DAYS * 24 * 60 * 60 * 1_000);
  const ranges: { startDate: Date; endDate: Date }[] = [];
  let cursor = endDate;
  while (cursor > earliest) {
    const startDate = new Date(Math.max(earliest.getTime(), cursor.getTime() - TRANSACTION_SEARCH_RANGE_DAYS * 24 * 60 * 60 * 1_000));
    ranges.push({ startDate, endDate: cursor });
    // Avoid inclusive-boundary duplicates. The normalizer also de-duplicates
    // reporting identities because the provider documents non-unique IDs.
    cursor = new Date(startDate.getTime() - 1);
  }
  return ranges.reverse();
}

function deduplicateTransactions<T extends { readonly id: string }>(transactions: readonly T[]): readonly T[] {
  return [...new Map(transactions.map((transaction) => [transaction.id, transaction])).values()];
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
