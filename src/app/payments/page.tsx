import { PaymentUniverse } from "@/components/payments/payment-universe";
import { DataSourceUnavailable } from "@/components/ui/data-source-unavailable";
import {
  DataSourceError,
  getDashboardForSource,
} from "@/server/data/provider";
import { dataSourceFromSearchParams } from "@/server/data/page-source";

interface PaymentsPageProps {
  readonly searchParams: Promise<{ source?: string | string[] }>;
}

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const source = await dataSourceFromSearchParams(searchParams);

  try {
    const result = await getDashboardForSource(source);
    return <PaymentUniverse snapshot={result.data} />;
  } catch (error) {
    if (error instanceof DataSourceError) {
      return <DataSourceUnavailable message={error.message} category={error.category} path="/payments" />;
    }
    throw error;
  }
}
