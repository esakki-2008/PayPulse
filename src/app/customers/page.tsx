import { CustomerNetwork } from "@/components/customers/customer-network";
import { DataSourceUnavailable } from "@/components/ui/data-source-unavailable";
import {
  DataSourceError,
  getCustomersForSource,
} from "@/server/data/provider";
import { dataSourceFromSearchParams } from "@/server/data/page-source";
import { requirePageActor } from "@/server/auth/page";

interface CustomersPageProps {
  readonly searchParams: Promise<{ source?: string | string[] }>;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const [source, actor] = await Promise.all([dataSourceFromSearchParams(searchParams), requirePageActor()]);

  try {
    const result = await getCustomersForSource(source, actor.merchantId);
    return <CustomerNetwork customers={result.data} source={result.source} />;
  } catch (error) {
    if (error instanceof DataSourceError) {
      return <DataSourceUnavailable message={error.message} category={error.category} capabilities={error.capabilities} path="/customers" />;
    }
    throw error;
  }
}
