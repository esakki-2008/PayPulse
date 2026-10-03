import type { ReactNode } from "react";

export function Panel({
  children,
  className = "",
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <section className={`glass-panel ${className}`}>{children}</section>;
}
