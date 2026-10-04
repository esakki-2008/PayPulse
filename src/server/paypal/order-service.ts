import { z } from "zod";

import { getPayPalSandboxConfig, getPayPalSandboxOrderConfig } from "./config";
import { PayPalProviderError } from "./provider-error";
import { getSharedPayPalOAuthTokenService } from "./token-service";
import { assertServerRuntime } from "../runtime";

assertServerRuntime("PayPal order service");

const orderIdSchema = z.string().trim().regex(/^[A-Z0-9]{1,36}$/);
const moneySchema = z.object({
  currency_code: z.string().trim().regex(/^[A-Z]{3}$/),
  value: z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/),
});
const linkSchema = z.object({
  href: z.string().url(),
  rel: z.string().trim().min(1),
  // PayPal Orders v2 normally includes GET, but HATEOAS method metadata can
  // be omitted in a minimal representation. Browser navigation is GET-only.
  method: z.string().trim().min(1).optional(),
});
const captureSchema = z.object({
  id: z.string().trim().min(1),
  status: z.string().trim().min(1),
  amount: moneySchema.optional(),
  create_time: z.string().datetime({ offset: true }).optional(),
  update_time: z.string().datetime({ offset: true }).optional(),
});
const orderResponseSchema = z.object({
  id: orderIdSchema,
  status: z.string().trim().min(1),
  intent: z.string().trim().min(1).optional(),
  create_time: z.string().datetime({ offset: true }),
  update_time: z.string().datetime({ offset: true }).optional(),
  links: z.array(linkSchema).default([]),
  payer: z.object({
    payer_id: z.string().trim().min(1).optional(),
  }).optional(),
  purchase_units: z.array(z.object({
    amount: moneySchema.optional(),
    payments: z.object({ captures: z.array(captureSchema).default([]) }).optional(),
  })).min(1),
});


export type PayPalOrderStatus = "CREATED" | "SAVED" | "APPROVED" | "COMPLETED" | "VOIDED" | "PAYER_ACTION_REQUIRED" | "UNKNOWN";

/** A safe, normalized Orders v2 representation; no raw authenticated payload. */
export interface PayPalSandboxOrder {
  readonly orderId: string;
  readonly status: PayPalOrderStatus;
  readonly providerStatus: string;
  readonly intent: string | null;
  readonly approvalUrl: string | null;
  readonly amount: number | null;
  readonly currency: string | null;
  readonly payerId: string | null;
  readonly capture: {
    readonly id: string;
    readonly status: string;
    readonly amount: number | null;
    readonly currency: string | null;
    readonly occurredAt: string | null;
  } | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;
}

export interface PayPalOrderCreateResult {
  readonly order: PayPalSandboxOrder;
  readonly httpStatus: number;
}

export interface PayPalOrderGateway {
  createVerificationOrder(input: { readonly actionId: string; readonly idempotencyKey: string }): Promise<PayPalOrderCreateResult>;
  getOrderById(orderId: string): Promise<PayPalSandboxOrder>;
  captureOrder(orderId: string, idempotencyKey: string): Promise<PayPalSandboxOrder>;
}

export type PayPalOrderFetch = (input: string, init: RequestInit) => Promise<Response>;
export interface PayPalOrderTokenProvider { getAccessToken(): Promise<string>; }

/**
 * Pinned Orders v2 adapter for known PayPulse-created Sandbox orders only.
 * It is not a merchant-wide history API and never accepts resource, amount,
 * currency, method, endpoint, or idempotency values from the browser.
 */
export class PayPalOrderService implements PayPalOrderGateway {
  constructor(
    private readonly tokenService: PayPalOrderTokenProvider = getSharedPayPalOAuthTokenService(),
    private readonly fetchImplementation: PayPalOrderFetch = globalThis.fetch,
  ) {}

  async createVerificationOrder(input: { readonly actionId: string; readonly idempotencyKey: string }): Promise<PayPalOrderCreateResult> {
    const config = getPayPalSandboxOrderConfig();
    const token = await this.tokenService.getAccessToken();
    const response = await this.request(`${config.apiBaseUrl}/v2/checkout/orders`, token, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Prefer: "return=representation",
        "PayPal-Request-Id": input.idempotencyKey,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: `paypulse-${input.actionId}`.slice(0, 127),
          custom_id: input.actionId.slice(0, 255),
          description: "PayPulse Sandbox payment verification — no real money.",
          amount: { currency_code: config.currency, value: config.amount },
        }],
        application_context: {
          brand_name: "PayPulse Sandbox",
          landing_page: "LOGIN",
          user_action: "PAY_NOW",
          return_url: config.returnUrl,
          cancel_url: config.cancelUrl,
        },
      }),
    });
    return { order: parseOrder(response.payload), httpStatus: response.status };
  }

  async getOrderById(orderId: string): Promise<PayPalSandboxOrder> {
    const validatedOrderId = validateOrderId(orderId);
    const config = getPayPalSandboxConfig();
    const token = await this.tokenService.getAccessToken();
    const response = await this.request(`${config.apiBaseUrl}/v2/checkout/orders/${validatedOrderId}`, token, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    return parseOrder(response.payload);
  }

  async captureOrder(orderId: string, idempotencyKey: string): Promise<PayPalSandboxOrder> {
    const validatedOrderId = validateOrderId(orderId);
    const config = getPayPalSandboxConfig();
    const token = await this.tokenService.getAccessToken();
    const response = await this.request(`${config.apiBaseUrl}/v2/checkout/orders/${validatedOrderId}/capture`, token, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Prefer: "return=representation",
        "PayPal-Request-Id": idempotencyKey,
      },
      body: "{}",
    });
    return parseOrder(response.payload);
  }

  private async request(url: string, token: string, init: RequestInit): Promise<{ readonly status: number; readonly payload: unknown }> {
    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } catch {
      throw new PayPalProviderError("Unable to reach PayPal Sandbox Orders.", "network");
    }
    if (!response.ok) throw toSafeOrderError(response.status);
    try {
      return { status: response.status, payload: await response.json() };
    } catch {
      throw new PayPalProviderError("PayPal Sandbox returned an unreadable Orders response.", "malformed_response", response.status);
    }
  }
}

/** Only a completed order plus a completed capture establishes payment success. */
export function isCompletedSandboxCapture(order: PayPalSandboxOrder): boolean {
  return order.status === "COMPLETED"
    && order.capture?.status === "COMPLETED"
    && order.capture.amount !== null
    && order.capture.amount > 0
    && order.capture.currency !== null
    && order.capture.occurredAt !== null;
}

function parseOrder(payload: unknown): PayPalSandboxOrder {
  const parsed = orderResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new PayPalProviderError("PayPal Sandbox returned an unsupported Orders response shape.", "malformed_response");
  }
  const order = parsed.data;
  const firstUnit = order.purchase_units[0];
  const captures = firstUnit?.payments?.captures ?? [];
  const capture = captures.at(-1) ?? null;
  const orderAmount = toSafeAmount(firstUnit?.amount);
  const captureAmount = toSafeAmount(capture?.amount);
  return {
    orderId: order.id,
    status: normalizeStatus(order.status),
    providerStatus: order.status,
    intent: order.intent ?? null,
    approvalUrl: approvalLink(order.links),
    amount: captureAmount.amount ?? orderAmount.amount,
    currency: captureAmount.currency ?? orderAmount.currency,
    payerId: order.payer?.payer_id ?? null,
    capture: capture ? {
      id: capture.id,
      status: capture.status,
      amount: captureAmount.amount,
      currency: captureAmount.currency,
      occurredAt: capture.create_time ?? capture.update_time ?? null,
    } : null,
    createdAt: order.create_time,
    updatedAt: order.update_time ?? null,
  };
}

function toSafeAmount(value: z.infer<typeof moneySchema> | undefined): { readonly amount: number | null; readonly currency: string | null } {
  if (!value) return { amount: null, currency: null };
  const amount = Number.parseFloat(value.value);
  return Number.isFinite(amount) && amount > 0
    ? { amount, currency: value.currency_code }
    : { amount: null, currency: null };
}

function normalizeStatus(status: string): PayPalOrderStatus {
  return ["CREATED", "SAVED", "APPROVED", "COMPLETED", "VOIDED", "PAYER_ACTION_REQUIRED"].includes(status)
    ? status as PayPalOrderStatus : "UNKNOWN";
}

function approvalLink(links: readonly z.infer<typeof linkSchema>[]): string | null {
  const approval = links.find((link) => {
    const relation = link.rel.toLowerCase();
    const method = link.method?.toUpperCase();
    return (relation === "approve" || relation === "payer-action") && (method === undefined || method === "GET");
  });
  if (!approval) return null;
  try {
    const url = new URL(approval.href);
    const paypalSandboxHost = url.hostname === "sandbox.paypal.com" || url.hostname.endsWith(".sandbox.paypal.com");
    return url.protocol === "https:" && paypalSandboxHost && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function validateOrderId(orderId: string): string {
  const parsed = orderIdSchema.safeParse(orderId);
  if (!parsed.success) throw new PayPalProviderError("The stored PayPal Sandbox order reference is invalid.", "malformed_response");
  return parsed.data;
}

function toSafeOrderError(status: number): PayPalProviderError {
  if (status === 401) return new PayPalProviderError("PayPal Sandbox rejected Orders authentication.", "authentication", status);
  if (status === 403) return new PayPalProviderError("PayPal Sandbox Orders is not authorized for this app or account.", "authorization", status);
  if (status === 404) return new PayPalProviderError("The known PayPal Sandbox order was not found.", "not_found", status);
  if (status === 429) return new PayPalProviderError("PayPal Sandbox Orders is rate limited. Try again later.", "rate_limited", status);
  return new PayPalProviderError(`PayPal Sandbox Orders failed (HTTP ${status}).`, "provider", status);
}
