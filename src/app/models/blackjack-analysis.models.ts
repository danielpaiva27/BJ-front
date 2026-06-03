export type CardValue = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";

export type BlackjackPayout = "3:2" | "6:5";

export type RiskProfile = "conservative" | "moderate" | "aggressive";

export interface GameRulesRequest {
  number_of_decks?: number;
  dealer_hits_soft_17?: boolean;
  blackjack_payout?: BlackjackPayout;
  double_allowed?: boolean;
  double_after_split?: boolean;
  surrender_allowed?: boolean;
  max_splits?: number;
  dealer_peek?: boolean;
}

export interface AnalyzeHandRequest {
  player_hand: CardValue[];
  dealer_upcard: CardValue;
  seen_cards?: CardValue[];
  rules?: GameRulesRequest;
  simulations?: number;
  seed?: number | null;
  bankroll?: number;
  minimum_bet?: number;
  risk_profile?: RiskProfile;
}

export interface HandAnalysis {
  cards: CardValue[];
  total: number;
  is_soft: boolean;
  is_bust: boolean;
  is_blackjack: boolean;
  is_pair: boolean;
  can_split: boolean;
}

export interface CountingAnalysis {
  running_count: number;
  true_count: number;
  cards_remaining: number;
  deck_status: string;
}

export interface ActionAnalysis {
  action: "hit" | "stand" | "double" | "split" | "surrender";
  ev: number;
  win_rate: number;
  lose_rate: number;
  push_rate: number;
  simulations: number;
  wins: number;
  losses: number;
  pushes: number;
  std_dev: number;
  standard_error: number;
  confidence_interval_95: [number, number];
}

export interface RecommendationAnalysis {
  best_action: ActionAnalysis["action"];
  monte_carlo_action: ActionAnalysis["action"];
  basic_strategy_action: ActionAnalysis["action"];
  strategy_agreement: boolean;
  confidence: number;
  explanation: string;
}

export interface BettingAnalysis {
  suggested_bet: number;
  bet_units: number;
  risk_profile: RiskProfile;
  explanation: string;
}

export interface MetadataAnalysis {
  engine_version: string;
  simulation_seed: number | null;
  simulations: number;
  execution_time_ms: number;
}

export interface AnalyzeHandResponse {
  input?: {
    player: CardValue[];
    dealer: CardValue;
    seen: CardValue[];
  };
  rules?: GameRulesRequest & {
    blackjack_payout_multiplier?: number;
    hit_split_aces?: boolean;
    resplit_aces?: boolean;
  };
  hand_analysis?: HandAnalysis;
  counting?: CountingAnalysis;
  actions?: ActionAnalysis[];
  recommendation?: RecommendationAnalysis;
  betting?: BettingAnalysis;
  metadata?: MetadataAnalysis;
}
