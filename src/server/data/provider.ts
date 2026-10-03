import { PayPalConfigurationError } from "../paypal/config";
import { getCachedPayPalSandboxData, type PayPalSandboxDataSnapshot } from "../paypal/data-adapter";
import { PayPalProviderError } from "../paypal/provider-error";
import { PayPalTokenRequestError } from "../paypal/token-service";
import { getDemoDashboardSnapshot } from "../dashboard/service";
import { getDemoRepository } from "../database/demo-store";
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

  const sandbox = await getSandboxDataSafely();
  return sandboxResult(sandbox, sandbox.snapshot);
}

export async function getIntelligenceForSource(
  source: DataSource,
): Promise<DataSourceResult<ReturnType<typeof buildDeterministicIntelligence>>> {
  const dashboard = await getDashboardForSource(source);
  return {
    data: buildDeterministicIntelligence(
      dashboard.data.customers,
      dashboard.data.transactions,
      source,
      new Date(dashboard.data.generatedAt),
    ),
    source: dashboard.source,
    environment: dashboard.environment,
    generatedAt: dashboard.generatedAt,
    persistence: dashboard.persistence,
  };
}

export async function getTransactionsForSource(
  source: DataSource,
): Promise<DataSourceResult<readonly Transaction[]>> {
  if (source === "demo") {
    return {
      data: await getDemoRepository().listTransactions(),
      source: "demo",
      environment: "demo",
      generatedAt: "2026-10-03T10:00:00.000Z",
    };
  }

  const sandbox = await getSandboxDataSafely();
  return sandboxResult(sandbox, sandbox.snapshot.transactions);
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

  const sandbox = await getSandboxDataSafely();
  return sandboxResult(sandbox, sandbox.snapshot.customers);
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

  const sandbox = await getSandboxDataSafely();
  return sandboxResult(
    sandbox,
    sandbox.snapshot.customers.find((customer) => customer.id === customerId) ?? null,
  );
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
  };
}

function toDataSourceError(error: unknown): DataSourceError {
  if (error instanceof PayPalConfigurationError) {
    return new DataSourceError(
      "PayPal Sandbox is not configured. Select Demo Data or configure server-side Sandbox variables.",
      "configuration",
      503,
    );
  }

  if (error instanceof PayPalTokenRequestError) {
    return new DataSourceError(
      "PayPal Sandbox authentication could not be completed safely.",
      error.category === "authentication" ? "authentication" : "network",
      error.status ?? 502,
    );
  }

  if (error instanceof PayPalProviderError) {
    return new DataSourceError(error.message, error.category, error.status ?? 502);
  }

  return new DataSourceError(
    "PayPal Sandbox data is currently unavailable.",
    "unknown",
    502,
  );
}
