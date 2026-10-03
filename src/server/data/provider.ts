import {
  capabilitiesForTransactionSearchError,
  PAYPAL_SANDBOX_DATA_CAPABILITIES_AVAILABLE,
  PAYPAL_SANDBOX_DATA_CAPABILITIES_UNAVAILABLE,
  PAYPAL_SANDBOX_REPORTING_UNSUPPORTED,
  type PayPalSandboxCapabilityStatus,
} from "../paypal/capabilities";
import { PayPalConfigurationError } from "../paypal/config";
import { getCachedPayPalSandboxData, type PayPalSandboxDataSnapshot } from "../paypal/data-adapter";
import { PayPalProviderError } from "../paypal/provider-error";
import { PayPalTokenRequestError } from "../paypal/token-service";
import { calculateDashboardMetrics } from "../dashboard/metrics";
import { getDemoDashboardSnapshot } from "../dashboard/service";
import { getDemoRepository } from "../database/demo-store";
import { getLearningProjection } from "../actions/learning/engine";
import { buildDeterministicIntelligence } from "../intelligence/deterministic-intelligence";
import type {
  Customer,
  DashboardSnapshot,
  DataSource,
  Transaction,
} from "@/types/domain";

export type DataSourceErrorCategory =
  | "configuration"
  | "authentication"
  | "authorization"
  | "not_found"
  | "rate_limited"
  | "provider"
  | "network"
  | "malformed_response"
  | "unsupported_capability"
  | "unknown";

export class DataSourceError extends Error {
  override readonly name = "DataSourceError";

  constructor(
    message: string,
    readonly category: DataSourceErrorCategory,
    readonly status: number,
    readonly capabilities: PayPalSandboxCapabilityStatus = PAYPAL_SANDBOX_DATA_CAPABILITIES_UNAVAILABLE,
  ) {
    super(message);
  }
}

export interface DataSourceResult<T> {
  readonly data: T;
  readonly source: DataSource;
  readonly environment: "demo" | "sandbox";
  readonly generatedAt: string;
  readonly persistence?: "memory_cache" | "postgres";
  /** Present only for the explicitly selected PayPal Sandbox source. */
  readonly capabilities?: PayPalSandboxCapabilityStatus;
}

export function parseDataSource(value: string | undefined): DataSource {
  if (value === "demo") return "demo";
  return "paypal_sandbox";
}

export async function getDashboardForSource(
  source: DataSource,
): Promise<DataSourceResult<DashboardSnapshot>> {
  if (source === "demo") {
    const data = await getDemoDashboardSnapshot();
    return {
      data,
      source: "demo",
      environment: "demo",
      generatedAt: data.generatedAt,
    };
  }

  try {
    const sandbox = await getSandboxDataSafely();
    return sandboxResult(sandbox, sandbox.snapshot);
  } catch (error) {
    if (error instanceof DataSourceError && error.category === "unsupported_capability") {
      return knownOrdersFallback();
    }
    throw error;
  }
}

export async function getIntelligenceForSource(
  source: DataSource,
): Promise<DataSourceResult<ReturnType<typeof buildDeterministicIntelligence>>> {
  const dashboard = await getDashboardForSource(source);
  const projection = await getLearningProjection(source);
  const transactions = mergeVerifiedTransactions(dashboard.data.transactions, projection.derivedTransactions);
  return {
    data: buildDeterministicIntelligence(
      dashboard.data.customers,
      transactions,
      source,
      new Date(dashboard.data.generatedAt),
      projection.outcomeHistoryByCustomer,
    ),
    source: dashboard.source,
    environment: dashboard.environment,
    generatedAt: dashboard.generatedAt,
    persistence: dashboard.persistence,
    capabilities: dashboard.capabilities,
  };
}

export async function getTransactionsForSource(
  source: DataSource,
): Promise<DataSourceResult<readonly Transaction[]>> {
  if (source === "demo") {
    const [transactions, projection] = await Promise.all([getDemoRepository().listTransactions(), getLearningProjection(source)]);
    return {
      data: mergeVerifiedTransactions(transactions, projection.derivedTransactions),
      source: "demo",
      environment: "demo",
      generatedAt: "2026-10-03T10:00:00.000Z",
    };
  }

  try {
    const sandbox = await getSandboxDataSafely();
    const projection = await getLearningProjection(source);
    return sandboxResult(sandbox, mergeVerifiedTransactions(sandbox.snapshot.transactions, projection.derivedTransactions));
  } catch (error) {
    if (error instanceof DataSourceError && error.category === "unsupported_capability") {
      const fallback = await knownOrdersFallback();
      return { ...fallback, data: fallback.data.transactions };
    }
    throw error;
  }
}

export async function getCustomersForSource(
  source: DataSource,
): Promise<DataSourceResult<readonly Customer[]>> {
  if (source === "demo") {
    return {
      data: await getDemoRepository().listCustomers(),
      source: "demo",
      environment: "demo",
      generatedAt: "2026-10-03T10:00:00.000Z",
    };
  }

  try {
    const sandbox = await getSandboxDataSafely();
    return sandboxResult(sandbox, sandbox.snapshot.customers);
  } catch (error) {
    if (error instanceof DataSourceError && error.category === "unsupported_capability") {
      const fallback = await knownOrdersFallback();
      return { ...fallback, data: fallback.data.customers };
    }
    throw error;
  }
}

export async function getCustomerForSource(
  source: DataSource,
  customerId: string,
): Promise<DataSourceResult<Customer | null>> {
  if (source === "demo") {
    return {
      data: await getDemoRepository().getCustomer(customerId),
      source: "demo",
      environment: "demo",
      generatedAt: "2026-10-03T10:00:00.000Z",
    };
  }

  try {
    const sandbox = await getSandboxDataSafely();
    return sandboxResult(
      sandbox,
      sandbox.snapshot.customers.find((customer) => customer.id === customerId) ?? null,
    );
  } catch (error) {
    if (error instanceof DataSourceError && error.category === "unsupported_capability") {
      const fallback = await knownOrdersFallback();
      return { ...fallback, data: fallback.data.customers.find((customer) => customer.id === customerId) ?? null };
    }
    throw error;
  }
}

function mergeVerifiedTransactions(base: readonly Transaction[], learned: readonly Transaction[]): readonly Transaction[] {
  return [...new Map([...base, ...learned].map((transaction) => [transaction.id, transaction])).values()];
}

/**
 * Orders v2 fallback is intentionally narrow: it exposes only provider-verified
 * payments from known PayPulse-created orders already stored by Phase 8. It is
 * never labelled or treated as Transaction Search / merchant-wide history.
 */
async function knownOrdersFallback(): Promise<DataSourceResult<DashboardSnapshot>> {
  const projection = await getLearningProjection("paypal_sandbox");
  if (projection.derivedTransactions.length === 0) {
    throw new DataSourceError(
      "PayPal Sandbox transaction reporting is unavailable and no verified PayPulse-created order payment is stored.",
      "unsupported_capability",
      403,
      PAYPAL_SANDBOX_REPORTING_UNSUPPORTED,
    );
  }
  const customers = customersFromKnownOrderTransactions(projection.derivedTransactions);
  const generatedAt = new Date().toISOString();
  return {
    data: {
      source: "paypal_sandbox",
      environment: "sandbox",
      generatedAt,
      coreState: "analyzing",
      metrics: calculateDashboardMetrics(projection.derivedTransactions, customers, new Date(generatedAt)),
      customers,
      transactions: projection.derivedTransactions,
      signals: [],
      actionPlan: null,
      actions: [],
    },
    source: "paypal_sandbox",
    environment: "sandbox",
    generatedAt,
    capabilities: PAYPAL_SANDBOX_REPORTING_UNSUPPORTED,
  };
}

function customersFromKnownOrderTransactions(transactions: readonly Transaction[]): readonly Customer[] {
  const byCustomer = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    if (!transaction.customerId) continue;
    const entries = byCustomer.get(transaction.customerId) ?? [];
    entries.push(transaction);
    byCustomer.set(transaction.customerId, entries);
  }
  return [...byCustomer.entries()].map(([customerId, entries]) => {
    const completed = entries.filter((entry) => entry.status === "completed" && entry.amount > 0);
    const valueByCurrency = Object.fromEntries([...new Set(completed.map((entry) => entry.currency))].sort().map((currency) => [currency, completed.filter((entry) => entry.currency === currency).reduce((total, entry) => total + entry.amount, 0)]));
    const currencies = Object.keys(valueByCurrency);
    const payerReference = customerId.replace(/^paypal_sandbox:payer:/, "");
    return {
      id: customerId,
      paypalCustomerId: null,
      payerReference,
      name: null,
      displayName: `Sandbox payer •${payerReference.slice(-6)}`,
      initials: "SP",
      email: null,
      country: null,
      segment: completed.length > 1 ? "repeat" : "new",
      relationshipValue: currencies.length === 1 ? valueByCurrency[currencies[0]!] ?? null : null,
      totalPayments: completed.length,
      totalValue: currencies.length === 1 ? valueByCurrency[currencies[0]!] ?? null : null,
      primaryCurrency: currencies.length === 1 ? currencies[0] ?? null : null,
      valueByCurrency,
      firstSeenAt: completed.map((entry) => entry.occurredAt).sort().at(0) ?? null,
      lastPaymentAt: completed.map((entry) => entry.occurredAt).sort().at(-1) ?? null,
      source: "paypal_sandbox" as const,
    } satisfies Customer;
  }).sort((left, right) => left.id.localeCompare(right.id));
}

async function getSandboxDataSafely(): Promise<PayPalSandboxDataSnapshot> {
  try {
    return await getCachedPayPalSandboxData();
  } catch (error) {
    throw toDataSourceError(error);
  }
}

function sandboxResult<T>(
  sandbox: PayPalSandboxDataSnapshot,
  data: T,
): DataSourceResult<T> {
  return {
    data,
    source: "paypal_sandbox",
    environment: "sandbox",
    generatedAt: sandbox.snapshot.generatedAt,
    persistence: sandbox.persistence,
    capabilities: PAYPAL_SANDBOX_DATA_CAPABILITIES_AVAILABLE,
  };
}

function toDataSourceError(error: unknown): DataSourceError {
  if (error instanceof PayPalConfigurationError) {
    return new DataSourceError(
      "PayPal Sandbox is not configured. Select Demo Data or configure server-side Sandbox variables.",
      "configuration",
      503,
      PAYPAL_SANDBOX_DATA_CAPABILITIES_UNAVAILABLE,
    );
  }

  if (error instanceof PayPalTokenRequestError) {
    return new DataSourceError(
      "PayPal Sandbox authentication could not be completed safely.",
      error.category === "authentication" ? "authentication" : "network",
      error.status ?? 502,
      PAYPAL_SANDBOX_DATA_CAPABILITIES_UNAVAILABLE,
    );
  }

  if (error instanceof PayPalProviderError) {
    return new DataSourceError(
      error.message,
      error.category,
      error.status ?? 502,
      capabilitiesForTransactionSearchError(error.category),
    );
  }

  return new DataSourceError(
    "PayPal Sandbox data is currently unavailable.",
    "unknown",
    502,
    PAYPAL_SANDBOX_DATA_CAPABILITIES_UNAVAILABLE,
  );
}
