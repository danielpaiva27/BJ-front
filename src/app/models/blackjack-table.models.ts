import { AnalyzeHandRequest, CardValue as ApiCardValue } from "./blackjack-analysis.models";

export type CardValue = ApiCardValue;

export type CardTarget = "player" | "dealer_upcard" | "seen" | "dealer_revealed";

export type GamePhase = "table_setup" | "shoe_active" | "analysis_ready";

export interface ShoeValueCount {
  value: CardValue;
  count: number;
  initialCount: number;
  display: string;
}

export interface RegisteredCardAction {
  value: CardValue;
  target: CardTarget;
  timestamp: string;
}

export interface BlackjackTableState {
  playerCards: CardValue[];
  dealerUpcard: CardValue | null;
  seenCards: CardValue[];
  dealerRevealedCards: CardValue[];
  selectedTarget: CardTarget;
  shoeCounts: ShoeValueCount[];
  history: RegisteredCardAction[];
  gamePhase: GamePhase;
}

export interface BuildAnalyzeRequestOptions {
  rules?: AnalyzeHandRequest["rules"];
  simulations?: AnalyzeHandRequest["simulations"];
  seed?: AnalyzeHandRequest["seed"];
  bankroll?: AnalyzeHandRequest["bankroll"];
  minimum_bet?: AnalyzeHandRequest["minimum_bet"];
  risk_profile?: AnalyzeHandRequest["risk_profile"];
}

export interface RegisterCardResult {
  ok: boolean;
  state: BlackjackTableState;
  error?: string;
}

export interface UndoCardResult {
  ok: boolean;
  state: BlackjackTableState;
  error?: string;
}
