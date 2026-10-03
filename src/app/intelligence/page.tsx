import { IntelligenceLab } from "@/components/intelligence/intelligence-lab";
import { DataSourceUnavailable } from "@/components/ui/data-source-unavailable";
import {
  DataSourceError,
  getDashboardForSource,
} from "@/server/data/provider";
import { dataSourceFromSearchParams } from "@/server/data/page-source";

interface IntelligencePageProps {
  readonly searchParams: Promise<{ source?: string | string[] }>;
}

export default async function IntelligencePage({ searchParams }: IntelligencePageProps) {
  const source = await dataSourceFromSearchParams(searchParams);
  try {
    const result = await getDashboardForSource(source);
    return <IntelligenceLab signals={result.data.signals} source={source} />;
  } catch (error) {
    if (error instanceof DataSourceError) {
      return <DataSourceUnavailable message={error.message} category={error.category} path="/intelligence" />;
    }
    throw error;
  }
}
