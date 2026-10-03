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

interface CustomerPageProps {
  readonly params: Promise<{ customerId: string }>;
  readonly searchParams: Promise<{ source?: string | string[] }>;
}

export default async function CustomerPage({ params, searchParams }: CustomerPageProps) {
  const [{ customerId }, source] = await Promise.all([params, dataSourceFromSearchParams(searchParams)]);
  try {
    const [customerResult, transactionsResult, intelligenceResult] = await Promise.all([
      getCustomerForSource(source, customerId),
      getTransactionsForSource(source),
      getIntelligenceForSource(source),
    ]);
    if (!customerResult.data) notFound();
    const profile = intelligenceResult.data.customerProfiles.find((candidate) => candidate.customerId === customerId);
    if (!profile) notFound();
    return <CustomerIntelligence customer={customerResult.data} transactions={transactionsResult.data} profile={profile} insights={intelligenceResult.data.insights.filter((insight) => insight.affectedCustomerIds.includes(customerId))} source={source} />;
  } catch (error) {
    if (error instanceof DataSourceError) {
      return <DataSourceUnavailable message={error.message} category={error.category} path="/customers" />;
    }
    throw error;
  }
}
