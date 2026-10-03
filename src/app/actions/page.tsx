import { ActionControlRoom } from "@/components/actions/action-control-room";
import { DataSourceUnavailable } from "@/components/ui/data-source-unavailable";
import { listActionEventsForSource, listActionsForSource } from "@/server/actions/engine";
import { getOutcomeLearningRepository } from "@/server/actions/learning/repository";
import { DataSourceError, getIntelligenceForSource } from "@/server/data/provider";
import { dataSourceFromSearchParams } from "@/server/data/page-source";

interface ActionsPageProps { readonly searchParams: Promise<{ source?: string | string[] }>; }

export default async function ActionsPage({ searchParams }: ActionsPageProps) {
  const source = await dataSourceFromSearchParams(searchParams);
  try {
    const outcomes = getOutcomeLearningRepository();
    const [intelligence, actions, events, verifiedOutcomes, learningEvents] = await Promise.all([
      getIntelligenceForSource(source),
      listActionsForSource(source),
      listActionEventsForSource(source),
      outcomes.listOutcomes(source),
      outcomes.listLearningEvents(source),
    ]);
    return <ActionControlRoom initialActions={actions} initialEvents={events} intelligence={intelligence.data} source={source} initialOutcomes={verifiedOutcomes} initialLearningEvents={learningEvents} />;
  } catch (error) {
    if (error instanceof DataSourceError) return <DataSourceUnavailable message={error.message} category={error.category} capabilities={error.capabilities} path="/actions" />;
    throw error;
  }
}
