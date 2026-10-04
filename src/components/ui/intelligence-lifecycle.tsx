"use client";

import {
  BrainCircuit,
  CheckCircle2,
  Eye,
  Lightbulb,
  Orbit,
  Play,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import type { CoreState } from "@/types/domain";

export interface IntelligenceStage {
  readonly id: "observe" | "understand" | "predict" | "recommend" | "approve" | "act" | "learn";
  readonly label: string;
  readonly detail: string;
  readonly icon: LucideIcon;
}

export const intelligenceStages: readonly IntelligenceStage[] = [
  { id: "observe", label: "Observe", detail: "Payment signals enter", icon: Eye },
  { id: "understand", label: "Understand", detail: "Payment DNA updates", icon: BrainCircuit },
  { id: "predict", label: "Predict", detail: "Pattern is assessed", icon: Orbit },
  { id: "recommend", label: "Recommend", detail: "Next step is proposed", icon: Lightbulb },
  { id: "approve", label: "Approve", detail: "Human decision required", icon: ShieldCheck },
  { id: "act", label: "Act", detail: "Sandbox action is gated", icon: Play },
  { id: "learn", label: "Learn", detail: "Verified outcome returns", icon: Sparkles },
] as const;

export function intelligenceStageIndex(state: CoreState): number {
  switch (state) {
    case "analyzing": return 1;
    case "insight_detected": return 2;
    case "recommending": return 3;
    case "awaiting_approval":
    case "approved": return 4;
    case "executing": return 5;
    case "completed":
    case "learning": return 6;
    case "failed": return 5;
    case "idle": return 0;
  }
}

export function IntelligenceLifecycle({
  state,
  selectedStage,
  onSelect,
  compact = false,
}: {
  readonly state: CoreState;
  readonly selectedStage?: IntelligenceStage["id"] | null;
  readonly onSelect?: (stage: IntelligenceStage) => void;
  readonly compact?: boolean;
}) {
  const activeIndex = intelligenceStageIndex(state);

  return (
    <ol aria-label="PayPulse intelligence lifecycle" className={`intelligence-lifecycle ${compact ? "intelligence-lifecycle--compact" : ""}`}>
      {intelligenceStages.map((stage, index) => {
        const Icon = stage.icon;
        const active = index === activeIndex;
        const passed = index < activeIndex || state === "learning";
        const selected = selectedStage === stage.id;
        return (
          <li key={stage.id} className={`intelligence-lifecycle__stage ${active ? "is-active" : ""} ${passed ? "is-passed" : ""} ${selected ? "is-selected" : ""}`}>
            <button
              type="button"
              onClick={() => onSelect?.(stage)}
              className="focus-ring intelligence-lifecycle__button"
              aria-pressed={selected}
            >
              <span className="intelligence-lifecycle__glyph"><Icon size={compact ? 13 : 15} aria-hidden="true" /></span>
              <span className="intelligence-lifecycle__copy">
                <span>{stage.label}</span>
                {!compact ? <small>{stage.detail}</small> : null}
              </span>
              {passed ? <CheckCircle2 size={12} className="intelligence-lifecycle__check" aria-label="Stage complete" /> : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
