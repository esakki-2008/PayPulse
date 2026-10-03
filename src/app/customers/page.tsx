import { CustomerNetwork } from "@/components/customers/customer-network";
import { DataSourceUnavailable } from "@/components/ui/data-source-unavailable";
import {
  DataSourceError,
  getCustomersForSource,
} from "@/server/data/provider";
import { dataSourceFromSearchParams } from "@/server/data/page-source";

interface CustomersPageProps {
  readonly searchParams: Promise<{ source?: string | string[] }>;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const source = await dataSourceFromSearchParams(searchParams);

  try {
    const result = await getCustomersForSource(source);
    return <CustomerNetwork customers={result.data} source={result.source} />;
  } catch (error) {
    if (error instanceof DataSourceError) {
      return <DataSourceUnavailable message={error.message} category={error.category} capabilities={error.capabilities} path="/customers" />;
    }
    throw error;
  }
}
