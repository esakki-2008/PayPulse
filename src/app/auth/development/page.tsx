import { redirect } from "next/navigation";

import { isDevelopmentAuthEnabled } from "@/server/auth/auth";

import { DevelopmentAccessForm } from "./development-access-form";

export default function DevelopmentAccessPage(): React.JSX.Element {
  if (!isDevelopmentAuthEnabled()) redirect("/");
  return <DevelopmentAccessForm />;
}
