import { AnalyzeHandRequest, CardValue as ApiCardValue, RiskProfile } from "./blackjack-analysis.models";

export type CardValue = ApiCardValue;

export type CardTarget = "player" | "dealer_upcard" | "seen" | "dealer_revealed";

export type GamePhase = "table_setup" | "shoe_active" | "analysis_ready";

export type GuidedRoundPhase =
  | "SETUP"
  | "SHOE_ACTIVE"
  | "SEEN_CARDS_SETUP"
  | "BETTING_DECISION"
  | "INITIAL_DEAL"
  | "PLAYER_DECISION"
  | "PLAYER_HIT_PENDING"
  | "PLAYER_DOUBLE_PENDING"
  | "DEALER_REVEAL_PENDING"
  | "DEALER_TURN"
  | "DEALER_DRAW_PENDING"
  | "ROUND_RESULT"
  | "ROUND_ENDED";

export type GuidedRoundAction =
  | "START_SHOE"
  | "START_SEEN_CARDS_SETUP"
  | "REGISTER_SEEN_CARD"
  | "CONFIRM_SEEN_CARDS"
  | "CONFIRM_BET"
  | "REGISTER_INITIAL_CARD"
  | "ANALYZE_DECISION"
  | "HIT"
  | "STAND"
  | "DOUBLE"
  | "SPLIT"
  | "SURRENDER"
  | "REGISTER_PLAYER_HIT"
  | "REGISTER_PLAYER_DOUBLE"
  | "REVEAL_DEALER_CARD"
  | "START_DEALER_DRAW"
  | "REGISTER_DEALER_DRAW"
  | "SHOW_ROUND_RESULT"
  | "END_ROUND"
  | "NEW_ROUND"
  | "RESET_ROUND"
  | "RESET_SHOE"
  | "UNDO_CARD";

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
  roundPhase: GuidedRoundPhase;
}

export interface BuildAnalyzeRequestOptions {
  rules?: AnalyzeHandRequest["rules"];
  simulations?: AnalyzeHandRequest["simulations"];
  seed?: AnalyzeHandRequest["seed"];
  bankroll?: AnalyzeHandRequest["bankroll"];
  minimum_bet?: AnalyzeHandRequest["minimum_bet"];
  risk_profile?: AnalyzeHandRequest["risk_profile"];
}

export type PreRoundShoeStatus =
  | "muito_desfavoravel"
  | "desfavoravel"
  | "neutro"
  | "neutro_favoravel_leve"
  | "favoravel"
  | "muito_favoravel";

export interface PreRoundCountingAnalysis {
  running_count: number;
  true_count: number;
  cards_remaining: number;
  decks_remaining: number;
  deck_status: string;
  shoe_status: PreRoundShoeStatus;
}

export interface PreRoundBettingAnalysis {
  suggested_bet: number;
  bet_units: number;
  risk_profile: RiskProfile;
  explanation: string;
  max_safe_exposure: number;
  cap_percent: number;
  cap_applied: boolean;
}

export interface PreRoundAnalysisSnapshot {
  counting: PreRoundCountingAnalysis;
  betting: PreRoundBettingAnalysis;
  recommendation: string;
  entry_advice: string;
  generated_at: string;
  is_auto_generated: boolean;
}

export interface BuildPreRoundAnalysisOptions {
  number_of_decks: number;
  bankroll: number;
  minimum_bet: number;
  risk_profile: RiskProfile;
  generated_at?: string;
  is_auto_generated?: boolean;
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
