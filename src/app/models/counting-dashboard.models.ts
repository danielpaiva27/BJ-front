import { AnalyzeHandResponse } from "./blackjack-analysis.models";
import { CardValue } from "./blackjack-table.models";
import { PreRoundAnalysisResponse } from "./pre-round-analysis.models";

export type CountingInputMode = "seen-card" | "player" | "dealer";

export type CardHistoryDestination = "counting-only" | "player" | "dealer";

export type LiveCountingSystemId = "hi-lo" | "hi-opt-ii" | "wong-halves";

export type LiveCountingStatus = "neutral" | "favorable" | "unfavorable";

export interface LiveCountingAceSideCount {
  seenAces: number;
  remainingAces: number;
}

export interface LiveCountingSystemSummary {
  system: LiveCountingSystemId;
  label: string;
  runningCount: number;
  trueCount: number | null;
  cardsRemaining: number;
  decksRemaining: number;
  status: LiveCountingStatus;
  notes?: string[];
  aceSideCount?: LiveCountingAceSideCount;
}

export interface CardHistoryEntry {
  value: CardValue;
  inputMode: CountingInputMode;
  destination: CardHistoryDestination;
  addedToPlayerHand: boolean;
  addedToDealerCards: boolean;
  sequence: number;
  timestamp: string;
}

export interface HypotheticalHandState {
  playerHand: CardValue[];
  dealerCards: CardValue[];
}

export interface CountingDashboardState extends HypotheticalHandState {
  inputMode: CountingInputMode;
  cardHistory: CardHistoryEntry[];
  decisionAnalysis: AnalyzeHandResponse | null;
  deepAnalysis: PreRoundAnalysisResponse | null;
  isDecisionAnalysisStale: boolean;
  isDeepAnalysisStale: boolean;
}
