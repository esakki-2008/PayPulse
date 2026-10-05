import { notFound } from "next/navigation";

import { CustomerIntelligence } from "@/components/customers/customer-intelligence";
import { DataSourceUnavailable } from "@/components/ui/data-source-unavailable";
import {
  DataSourceError,
  getCustomerForSource,
  getIntelligenceForSource,
  getTransactionsForSource,
} from "@/server/data/provider";
import { dataSourceFromSearchParams } from "@/server/data/page-source";
import { requirePageActor } from "@/server/auth/page";

interface CustomerPageProps {
  readonly params: Promise<{ customerId: string }>;
  readonly searchParams: Promise<{ source?: string | string[] }>;
}

export default async function CustomerPage({ params, searchParams }: CustomerPageProps) {
  const [{ customerId }, source, actor] = await Promise.all([params, dataSourceFromSearchParams(searchParams), requirePageActor()]);
  try {
    const [customerResult, transactionsResult, intelligenceResult] = await Promise.all([
      getCustomerForSource(source, customerId, actor.merchantId),
      getTransactionsForSource(source, actor.merchantId),
      getIntelligenceForSource(source, actor.merchantId),
    ]);
    if (!customerResult.data) notFound();
    const profile = intelligenceResult.data.customerProfiles.find((candidate) => candidate.customerId === customerId);
    if (!profile) notFound();
    return <CustomerIntelligence customer={customerResult.data} transactions={transactionsResult.data} profile={profile} insights={intelligenceResult.data.insights.filter((insight) => insight.affectedCustomerIds.includes(customerId))} source={source} />;
  } catch (error) {
    if (error instanceof DataSourceError) {
      return <DataSourceUnavailable message={error.message} category={error.category} capabilities={error.capabilities} path="/customers" />;
    }
    throw error;
  }
}
