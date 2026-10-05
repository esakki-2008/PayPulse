"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode, useEffect, useState } from "react";

import { CoreFallback } from "./core-fallback";
import type { IntelligenceStage } from "@/components/ui/intelligence-lifecycle";
import type { CoreState, Customer } from "@/types/domain";

const IntelligenceScene = dynamic(() => import("./intelligence-scene"), {
  ssr: false,
  loading: () => <CoreFallback state="analyzing" />,
});

class SceneErrorBoundary extends Component<{ readonly children: ReactNode; readonly state: CoreState }, { readonly failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { readonly failed: boolean } { return { failed: true }; }
  render(): ReactNode { return this.state.failed ? <CoreFallback state={this.props.state} /> : this.props.children; }
}

function supportsWebGl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function IntelligenceCore({
  state,
  customers,
  customerStates,
  onCustomerSelect,
  onStageSelect,
}: {
  readonly state: CoreState;
  readonly customers: readonly Customer[];
  readonly customerStates?: Readonly<Record<string, "stable" | "declining" | "growing" | "irregular" | "inactive" | "insufficient_data">>;
  readonly onCustomerSelect?: (customerId: string) => void;
  readonly onStageSelect?: (stage: IntelligenceStage) => void;
}) {
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    setWebglAvailable(supportsWebGl());
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const viewport = window.matchMedia("(max-width: 760px)");
    const updatePreference = () => setReducedMotion(motion.matches);
    const updateViewport = () => setCompact(viewport.matches);
    updatePreference();
    updateViewport();
    motion.addEventListener("change", updatePreference);
    viewport.addEventListener("change", updateViewport);

    return () => {
      motion.removeEventListener("change", updatePreference);
      viewport.removeEventListener("change", updateViewport);
    };
  }, []);

  if (webglAvailable === false || reducedMotion) return <CoreFallback state={state} reducedMotion={reducedMotion} />;
  if (webglAvailable === null) return <CoreFallback state={state} />;

  return (
    <SceneErrorBoundary state={state}>
      <IntelligenceScene
        state={state}
        customers={customers}
        customerStates={customerStates}
        onCustomerSelect={onCustomerSelect}
        onStageSelect={onStageSelect}
        compact={compact}
      />
    </SceneErrorBoundary>
  );
}
