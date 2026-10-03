import type { QueryResultRow } from "pg";

import type { SqlExecutor } from "./postgres-client";
import type { PaymentIntelligenceRepository } from "./repository";
import type {
  ActionEvent,
  ActionRecommendation,
  Customer,
  IntelligenceSignal,
  Transaction,
  TransactionStatus,
} from "@/types/domain";

interface CustomerRow extends QueryResultRow {
  id: string;
  paypal_customer_id: string | null;
  payer_reference: string | null;
  display_name: string;
  name: string | null;
  initials: string;
  email: string | null;
  country: string | null;
  segment: Customer["segment"];
  total_payments: number | string;
  total_value: number | string;
  primary_currency: string | null;
  value_by_currency: Record<string, number | string> | string;
  first_seen_at: Date | string | null;
  last_payment_at: Date | string | null;
  source: "paypal_sandbox";
}

interface TransactionRow extends QueryResultRow {
  id: string;
  paypal_transaction_id: string | null;
  paypal_order_id: string | null;
  customer_id: string | null;
  amount: number | string;
  currency: string;
  status: TransactionStatus;
  payment_method: string | null;
  payer_reference: string | null;
  raw_reference: string | null;
  occurred_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
  relationship: Transaction["relationship"];
  source: "paypal_sandbox";
}

/**
 * Durable PostgreSQL implementation for normalized Sandbox entities. It uses
 * provider IDs plus source as upsert keys to make repeated read-only syncs
 * idempotent. Action/insight persistence remains a later phase.
 */
export class PostgresPaymentIntelligenceRepository
  implements PaymentIntelligenceRepository
{
  constructor(
    private readonly sql: SqlExecutor,
    private readonly merchantId: string,
  ) {}

  async ensureMerchant(): Promise<void> {
    await this.sql.query(
      `INSERT INTO merchants (id, name)
       VALUES ($1, 'PayPal Sandbox Merchant')
       ON CONFLICT (id) DO NOTHING`,
      [this.merchantId],
    );
  }

  async listCustomers(): Promise<readonly Customer[]> {
    const result = await this.sql.query<CustomerRow>(
      `SELECT id, paypal_customer_id, payer_reference, display_name, name, initials,
              email, country, segment, total_payments, total_value, primary_currency,
              value_by_currency, first_seen_at, last_payment_at, source
       FROM customers
       WHERE merchant_id = $1 AND source = 'paypal_sandbox'
       ORDER BY display_name ASC`,
      [this.merchantId],
    );
    return result.rows.map(toCustomer);
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    const result = await this.sql.query<CustomerRow>(
      `SELECT id, paypal_customer_id, payer_reference, display_name, name, initials,
              email, country, segment, total_payments, total_value, primary_currency,
              value_by_currency, first_seen_at, last_payment_at, source
       FROM customers
       WHERE merchant_id = $1 AND id = $2 AND source = 'paypal_sandbox'
       LIMIT 1`,
      [this.merchantId, customerId],
    );
    return result.rows[0] ? toCustomer(result.rows[0]) : null;
  }

  async upsertCustomers(customers: readonly Customer[]): Promise<void> {
    await this.ensureMerchant();
    for (const customer of customers) {
      await this.sql.query(
        `INSERT INTO customers (
          id, merchant_id, paypal_customer_id, payer_reference, display_name, name,
          initials, email, country, segment, total_payments, total_value, primary_currency,
          value_by_currency, first_seen_at, last_payment_at, source
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'paypal_sandbox'
        )
        ON CONFLICT (merchant_id, source, payer_reference) DO UPDATE SET
          paypal_customer_id = EXCLUDED.paypal_customer_id,
          display_name = EXCLUDED.display_name,
          name = EXCLUDED.name,
          initials = EXCLUDED.initials,
          email = EXCLUDED.email,
          country = EXCLUDED.country,
          segment = EXCLUDED.segment,
          total_payments = EXCLUDED.total_payments,
          total_value = EXCLUDED.total_value,
          primary_currency = EXCLUDED.primary_currency,
          value_by_currency = EXCLUDED.value_by_currency,
          first_seen_at = EXCLUDED.first_seen_at,
          last_payment_at = EXCLUDED.last_payment_at`,
        [
          customer.id,
          this.merchantId,
          customer.paypalCustomerId,
          customer.payerReference,
          customer.displayName,
          customer.name,
          customer.initials,
          customer.email,
          customer.country,
          customer.segment,
          customer.totalPayments,
          customer.totalValue ?? 0,
          customer.primaryCurrency,
          JSON.stringify(customer.valueByCurrency),
          customer.firstSeenAt,
          customer.lastPaymentAt,
        ],
      );
    }
  }

  async listTransactions(): Promise<readonly Transaction[]> {
    const result = await this.sql.query<TransactionRow>(
      `SELECT id, paypal_transaction_id, paypal_order_id, customer_id, amount,
              currency, status, payment_method, payer_reference, raw_reference,
              occurred_at, created_at, updated_at, relationship, source
       FROM transactions
       WHERE merchant_id = $1 AND source = 'paypal_sandbox'
       ORDER BY occurred_at DESC`,
      [this.merchantId],
    );
    return result.rows.map(toTransaction);
  }

  async upsertTransactions(transactions: readonly Transaction[]): Promise<void> {
    await this.ensureMerchant();
    for (const transaction of transactions) {
      await this.sql.query(
        `INSERT INTO transactions (
          id, merchant_id, paypal_transaction_id, paypal_order_id, customer_id,
          amount, currency, status, payment_method, payer_reference, raw_reference,
          occurred_at, created_at, updated_at, relationship, source
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'paypal_sandbox'
        )
        ON CONFLICT (merchant_id, source, raw_reference) DO UPDATE SET
          paypal_transaction_id = EXCLUDED.paypal_transaction_id,
          paypal_order_id = EXCLUDED.paypal_order_id,
          customer_id = EXCLUDED.customer_id,
          amount = EXCLUDED.amount,
          currency = EXCLUDED.currency,
          status = EXCLUDED.status,
          payment_method = EXCLUDED.payment_method,
          payer_reference = EXCLUDED.payer_reference,
          occurred_at = EXCLUDED.occurred_at,
          updated_at = EXCLUDED.updated_at,
          relationship = EXCLUDED.relationship`,
        [
          transaction.id,
          this.merchantId,
          transaction.paypalTransactionId,
          transaction.paypalOrderId,
          transaction.customerId,
          transaction.amount,
          transaction.currency,
          transaction.status,
          transaction.paymentMethod,
          transaction.payerReference,
          transaction.rawReference,
          transaction.occurredAt,
          transaction.createdAt,
          transaction.updatedAt,
          transaction.relationship,
        ],
      );
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
    throw new Error("Action persistence is not enabled in Phase 4.");
  }

  async appendActionEvent(): Promise<void> {
    throw new Error("Action persistence is not enabled in Phase 4.");
  }

  async listActionEvents(): Promise<readonly ActionEvent[]> {
    return [];
  }
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    paypalCustomerId: row.paypal_customer_id,
    payerReference: row.payer_reference,
    name: row.name,
    displayName: row.display_name,
    initials: row.initials,
    email: row.email,
    country: row.country,
    segment: row.segment,
    relationshipValue: row.primary_currency ? Number(row.total_value) : null,
    totalPayments: Number(row.total_payments),
    totalValue: row.primary_currency ? Number(row.total_value) : null,
    primaryCurrency: row.primary_currency,
    valueByCurrency: toCurrencyTotals(row.value_by_currency),
    firstSeenAt: toIso(row.first_seen_at),
    lastPaymentAt: toIso(row.last_payment_at),
    paymentDna: undefined,
    risk: undefined,
    source: "paypal_sandbox",
  };
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    paypalTransactionId: row.paypal_transaction_id,
    paypalOrderId: row.paypal_order_id,
    customerId: row.customer_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    paymentMethod: row.payment_method,
    payerReference: row.payer_reference,
    rawReference: row.raw_reference,
    occurredAt: toIso(row.occurred_at) ?? new Date(0).toISOString(),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
    relationship: row.relationship,
    source: "paypal_sandbox",
    aiInterpretation: null,
  };
}

function toCurrencyTotals(
  value: Record<string, number | string> | string,
): Readonly<Record<string, number>> {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  return Object.fromEntries(
    Object.entries(parsed).flatMap(([currency, total]) => {
      const numericTotal = Number(total);
      return Number.isFinite(numericTotal) ? [[currency, numericTotal]] : [];
    }),
  );
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
