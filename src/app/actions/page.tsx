import { ActionControlRoom } from "@/components/actions/action-control-room";
import { DataSourceUnavailable } from "@/components/ui/data-source-unavailable";
import {
  DataSourceError,
  getDashboardForSource,
} from "@/server/data/provider";
import { dataSourceFromSearchParams } from "@/server/data/page-source";

interface ActionsPageProps {
  readonly searchParams: Promise<{ source?: string | string[] }>;
}

export default async function ActionsPage({ searchParams }: ActionsPageProps) {
  const source = await dataSourceFromSearchParams(searchParams);
  try {
    const result = await getDashboardForSource(source);
    return <ActionControlRoom initialActions={result.data.actions} source={source} />;
  } catch (error) {
    if (error instanceof DataSourceError) {
      return <DataSourceUnavailable message={error.message} category={error.category} path="/actions" />;
    }
    throw error;
  }
}
