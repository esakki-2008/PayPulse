import { z } from "zod";

import { getPayPalSandboxConfig } from "./config";
import { PayPalProviderError } from "./provider-error";
import { getSharedPayPalOAuthTokenService } from "./token-service";
import { assertServerRuntime } from "../runtime";

assertServerRuntime("PayPal transaction service");

const MAX_PAGE_SIZE = 100;
const MAX_PAGES_PER_SYNC = 3;
const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1_000;

const amountSchema = z.object({
  currency_code: z.string().trim().min(3).max(3),
  value: z.string().trim().min(1),
});

const transactionDetailSchema = z.object({
  transaction_info: z.object({
    transaction_id: z.string().trim().min(1),
    paypal_reference_id: z.string().trim().min(1).optional(),
    paypal_reference_id_type: z.string().trim().min(1).optional(),
    transaction_event_code: z.string().trim().min(1).optional(),
    transaction_initiation_date: z.string().datetime({ offset: true }),
    transaction_updated_date: z.string().datetime({ offset: true }).optional(),
    transaction_amount: amountSchema.optional(),
    transaction_status: z.string().trim().min(1).optional(),
    payment_method_type: z.string().trim().min(1).optional(),
    instrument_type: z.string().trim().min(1).optional(),
  }),
  payer_info: z
    .object({
      account_id: z.string().trim().min(1).optional(),
      payer_id: z.string().trim().min(1).optional(),
      email_address: z.string().trim().email().optional(),
      country_code: z.string().trim().min(2).max(2).optional(),
      payer_name: z
        .object({
          full_name: z.string().trim().min(1).optional(),
          given_name: z.string().trim().min(1).optional(),
          surname: z.string().trim().min(1).optional(),
        })
        .optional(),
    })
    .optional(),
});

const transactionSearchResponseSchema = z.object({
  transaction_details: z.array(transactionDetailSchema).default([]),
  page: z.number().int().nonnegative().optional(),
  total_pages: z.number().int().nonnegative().optional(),
  total_items: z.number().int().nonnegative().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  last_refreshed_datetime: z.string().optional(),
});

export type PayPalTransactionDetail = z.infer<typeof transactionDetailSchema>;

export interface PayPalTransactionSearchResult {
  /** Safe first-page status; no provider headers or body are retained. */
  readonly httpStatus: number;
  readonly transactionDetails: readonly PayPalTransactionDetail[];
  readonly page: number;
  readonly totalPages: number;
  readonly totalItems: number;
}

export interface PayPalTransactionQuery {
  readonly startDate: Date;
  readonly endDate: Date;
  readonly pageSize?: number;
  readonly maxPages?: number;
}

export interface PayPalTransactionReader {
  listTransactions(query: PayPalTransactionQuery): Promise<PayPalTransactionSearchResult>;
}

export type PayPalFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export interface PayPalAccessTokenProvider {
  getAccessToken(): Promise<string>;
}

export class PayPalTransactionService {
  constructor(
    private readonly tokenService: PayPalAccessTokenProvider = getSharedPayPalOAuthTokenService(),
    private readonly fetchImplementation: PayPalFetch = globalThis.fetch,
  ) {}

  /**
   * Reads the documented Transaction Search endpoint only. The query is bounded
   * to 31 days and a small page count to avoid unbounded reporting traffic.
   */
  async listTransactions(
    query: PayPalTransactionQuery,
  ): Promise<PayPalTransactionSearchResult> {
    validateDateRange(query.startDate, query.endDate);
    const pageSize = Math.min(Math.max(query.pageSize ?? MAX_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const maxPages = Math.min(Math.max(query.maxPages ?? MAX_PAGES_PER_SYNC, 1), MAX_PAGES_PER_SYNC);
    const firstPage = await this.fetchPage(query.startDate, query.endDate, 1, pageSize);
    const details = [...firstPage.transactionDetails];
    const totalPages = Math.max(firstPage.totalPages, 1);

    for (let page = 2; page <= Math.min(totalPages, maxPages); page += 1) {
      const nextPage = await this.fetchPage(query.startDate, query.endDate, page, pageSize);
      details.push(...nextPage.transactionDetails);
    }

    return {
      httpStatus: firstPage.httpStatus,
      transactionDetails: details,
      page: firstPage.page,
      totalPages,
      totalItems: firstPage.totalItems,
    };
  }

  private async fetchPage(
    startDate: Date,
    endDate: Date,
    page: number,
    pageSize: number,
  ): Promise<PayPalTransactionSearchResult> {
    const config = getPayPalSandboxConfig();
    const token = await this.tokenService.getAccessToken();
    const search = new URLSearchParams({
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      fields: "transaction_info,payer_info",
      page: String(page),
      page_size: String(pageSize),
    });

    let response: Response;
    try {
      response = await this.fetchImplementation(
        `${config.apiBaseUrl}/v1/reporting/transactions?${search.toString()}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            "PayPal-Enforce-ISO8601-Format": "true",
          },
          cache: "no-store",
        },
      );
    } catch {
      throw new PayPalProviderError(
        "Unable to reach PayPal Sandbox transaction reporting.",
        "network",
      );
    }

    if (!response.ok) {
      throw toSafeProviderError(response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new PayPalProviderError(
        "PayPal Sandbox returned an unreadable transaction response.",
        "malformed_response",
      );
    }

    const parsed = transactionSearchResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new PayPalProviderError(
        "PayPal Sandbox returned an unsupported transaction response shape.",
        "malformed_response",
      );
    }

    return {
      httpStatus: response.status,
      transactionDetails: parsed.data.transaction_details,
      page: parsed.data.page ?? page,
      totalPages: parsed.data.total_pages ?? 0,
      totalItems: parsed.data.total_items ?? parsed.data.transaction_details.length,
    };
  }
}

function validateDateRange(startDate: Date, endDate: Date): void {
  const duration = endDate.getTime() - startDate.getTime();
  if (Number.isNaN(duration) || duration <= 0 || duration > MAX_RANGE_MS) {
    throw new PayPalProviderError(
      "Transaction Search requires a valid date range no longer than 31 days.",
      "configuration",
    );
  }
}

function toSafeProviderError(status: number): PayPalProviderError {
  if (status === 401) {
    return new PayPalProviderError("PayPal Sandbox rejected authentication.", "authentication", status);
  }
  if (status === 403) {
    return new PayPalProviderError(
      "PayPal Sandbox transaction reporting is unavailable for this app or account.",
      "unsupported_capability",
      status,
    );
  }
  if (status === 404) {
    return new PayPalProviderError("PayPal Sandbox reporting endpoint was not found.", "not_found", status);
  }
  if (status === 429) {
    return new PayPalProviderError("PayPal Sandbox reporting is rate limited. Try again later.", "rate_limited", status);
  }
  return new PayPalProviderError(
    `PayPal Sandbox transaction reporting failed (HTTP ${status}).`,
    "provider",
    status,
  );
}
