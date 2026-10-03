import { ActionControlRoom } from "@/components/actions/action-control-room";
import { getDemoRepository } from "@/server/database/demo-store";

export default async function ActionsPage() {
  const actions = await getDemoRepository().listActions();
  return <ActionControlRoom initialActions={actions} />;
}
