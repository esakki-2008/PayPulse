import { ActionControlRoom } from "@/components/actions/action-control-room";
import { listActionEventsForSource, listActionsForSource } from "@/server/actions/engine";
import { getAgentActionRepository } from "@/server/actions/repository";
import { getOutcomeLearningRepository } from "@/server/actions/learning/repository";
import { requirePageActor } from "@/server/auth/page";
import { DataSourceError, getIntelligenceForSource } from "@/server/data/provider";
import { dataSourceFromSearchParams } from "@/server/data/page-source";
import type { DataSource, DeterministicIntelligence } from "@/types/domain";

interface ActionsPageProps { readonly searchParams: Promise<{ source?: string | string[] }>; }

/** The action flow stays available even when optional merchant-wide reporting is not. */
export default async function ActionsPage({ searchParams }: ActionsPageProps) {
  const [source, actor] = await Promise.all([dataSourceFromSearchParams(searchParams), requirePageActor()]);
  const actionsRepository = getAgentActionRepository(actor.merchantId);
  const outcomes = getOutcomeLearningRepository(actor.merchantId);
  const [actions, events, verifiedOutcomes, learningEvents] = await Promise.all([
    listActionsForSource(source, actionsRepository),
    listActionEventsForSource(source, actionsRepository),
    outcomes.listOutcomes(source),
    outcomes.listLearningEvents(source),
  ]);

  let intelligence: DeterministicIntelligence;
  let reportingNotice: string | null = null;
  try {
    intelligence = (await getIntelligenceForSource(source, actor.merchantId)).data;
  } catch (error) {
    if (!(error instanceof DataSourceError)) throw error;
    intelligence = emptyIntelligence(source);
    reportingNotice = error.message;
  }

  return <ActionControlRoom initialActions={actions} initialEvents={events} intelligence={intelligence} source={source} initialOutcomes={verifiedOutcomes} initialLearningEvents={learningEvents} reportingNotice={reportingNotice} />;
}

function emptyIntelligence(source: DataSource): DeterministicIntelligence {
  return {
    source,
    generatedAt: new Date().toISOString(),
    methodology: "Merchant-wide reporting is unavailable. No payment intelligence, customer activity, or recommendation has been inferred from absent provider data.",
    customerProfiles: [],
    revenueByCurrency: [],
    insights: [],
    customerActivityCount: 0,
    repeatCustomerActivityCount: 0,
  };
}
