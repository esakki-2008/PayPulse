"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { CoreFallback } from "./core-fallback";
import type { CoreState, Customer } from "@/types/domain";

const IntelligenceScene = dynamic(() => import("./intelligence-scene"), {
  ssr: false,
  loading: () => <CoreFallback state="analyzing" />,
});

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
  onCustomerSelect,
}: {
  readonly state: CoreState;
  readonly customers: readonly Customer[];
  readonly onCustomerSelect?: (customerId: string) => void;
}) {
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setWebglAvailable(supportsWebGl());
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener("change", updatePreference);

    return () => media.removeEventListener("change", updatePreference);
  }, []);

  if (webglAvailable === false || reducedMotion) {
    return <CoreFallback state={state} reducedMotion={reducedMotion} />;
  }

  if (webglAvailable === null) {
    return <CoreFallback state={state} />;
  }

  return (
    <IntelligenceScene
      state={state}
      customers={customers}
      onCustomerSelect={onCustomerSelect}
    />
  );
}
