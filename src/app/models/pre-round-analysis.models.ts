import { CardValue } from './blackjack-analysis.models';

export type PreRoundSystemId = 'hi_lo' | 'hi_opt_ii' | 'wong_halves';

export type PreRoundRecommendationStatus =
  | 'observe'
  | 'marginal_observe'
  | 'positive_edge_minimum_bet_exceeds_risk_cap'
  | 'minimum_unit'
  | 'favorable_risk_capped'
  | 'favorable_controlled'
  | 'favorable_bankroll_limited'
  | 'invalid_bankroll'
  | 'invalid_minimum_bet'
  | 'insufficient_bankroll';

export interface PreRoundRules {
  blackjack_payout?: '3:2' | '6:5' | number;
  dealer_hits_soft_17?: boolean;
  double_after_split?: boolean;
  surrender_allowed?: boolean;
  dealer_peek?: boolean;
  double_allowed?: boolean;
  max_splits?: number;
}

export interface PreRoundAnalysisRequest {
  number_of_decks: number;
  seen_cards: CardValue[];
  bankroll: number;
  minimum_bet: number;
  rules?: PreRoundRules;
  systems?: PreRoundSystemId[];
}

export interface BankrollPolicyInfo {
  policy_id: string;
  policy_label: string;
  description?: string;
  variance_per_unit?: number;
  safety_kelly_fraction?: number;
  max_bankroll_exposure?: number;
  risk_of_ruin_limit?: number;
  max_single_round_exposure?: number;
  risk_model?: string;
}

export interface AceSideCount {
  total_aces: number;
  seen_aces: number;
  aces_remaining: number;
  expected_aces_remaining: number;
  excess_aces: number;
}

export interface PreRoundSystemResult {
  system_id: PreRoundSystemId;
  label: string;
  level: number;
  balanced: boolean;
  ace_reckoned: boolean;
  fractional: boolean;
  requires_ace_side_count: boolean;
  running_count: number;
  true_count: number;
  betting_true_count: number;
  estimated_player_edge: number;
  should_enter: boolean;
  suggested_units: number;
  suggested_amount: number;
  bankroll_exposure_percent: number;
  max_protected_amount?: number;
  estimated_risk_of_ruin: number;
  risk_of_ruin_limit: number;
  risk_model: string;
  variance_per_unit: number;
  max_bet_by_risk: number;
  max_single_round_exposure: number;
  max_bet_by_exposure: number;
  selected_bet_fraction: number;
  kelly_fraction: number;
  risk_limited_fraction: number;
  risk_if_minimum_bet?: number | null;
  minimum_bankroll_required_for_minimum_bet?: number | null;
  minimum_bet_exceeds_risk_cap?: boolean;
  recommendation_status: PreRoundRecommendationStatus;
  recommendation_text: string;
  warnings?: string[];
  playing_running_count?: number;
  playing_true_count?: number;
  betting_running_count?: number;
  ace_adjustment_factor?: number;
  ace_side_count?: AceSideCount;
  scaled_running_count?: number;
  scale?: number;
}

export interface PreRoundAnalysisResponse {
  cards_seen: number;
  cards_remaining: number;
  decks_remaining: number;
  bankroll: number;
  minimum_bet: number;
  policy: BankrollPolicyInfo;
  systems: PreRoundSystemResult[];
  most_favorable_estimate_system_id: PreRoundSystemId;
}

export type MachineEvEngineMode =
  | 'legacy'
  | 'deterministic'
  | 'hybrid'
  | 'monte_carlo';

export interface MachineEvPreRoundRequest {
  number_of_decks: number;
  seen_cards: CardValue[];
  bankroll?: number | null;
  minimum_bet?: number | null;
  rules?: PreRoundRules;
  engine_mode?: MachineEvEngineMode | null;
  include_debug_metrics?: boolean;
  max_duration_ms?: number | null;
}

export interface MachineEvPreRoundResponse {
  model_id: 'machine_ev';
  label: 'Machine EV';
  model_type: 'composition_ev';
  is_human_replicable: false;
  estimated_next_hand_edge: number;
  risk_if_minimum_bet: number | null;
  minimum_bankroll_required_for_minimum_bet: number | null;
  minimum_bet_exceeds_risk_cap?: boolean | null;
  risk_of_ruin_limit?: number | null;
  recommendation_status: string;
  recommendation_text: string;
}

export interface RoundPreBetAnalysisSnapshot extends PreRoundAnalysisResponse {
  snapshot_stale: boolean;
  captured_at: string;
}
