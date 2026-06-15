import { CardValue } from "../models/blackjack-table.models";
import {
  CountingDashboardState,
  CountingInputMode,
  HypotheticalHandState,
} from "../models/counting-dashboard.models";
import { evaluatePlayerHand } from "./blackjack-table.utils";

export const INITIAL_COUNTING_INPUT_MODE: CountingInputMode = "seen-card";

export function createInitialCountingDashboardState(): CountingDashboardState {
  return {
    inputMode: INITIAL_COUNTING_INPUT_MODE,
    playerHand: [],
    dealerCards: [],
    cardHistory: [],
    decisionAnalysis: null,
    deepAnalysis: null,
    isDecisionAnalysisStale: false,
    isDeepAnalysisStale: false,
  };
}

export function getPlayerTotal(state: HypotheticalHandState): number {
  return evaluatePlayerHand(state.playerHand).total;
}

export function isPlayerBust(state: HypotheticalHandState): boolean {
  return evaluatePlayerHand(state.playerHand).isBust;
}

export function getDealerUpcard(state: HypotheticalHandState): CardValue | null {
  return state.dealerCards[0] ?? null;
}

export function isDecisionHandValid(state: HypotheticalHandState): boolean {
  return (
    state.playerHand.length >= 2
    && getDealerUpcard(state) !== null
    && !isPlayerBust(state)
  );
}

export function resetHypotheticalHandState(
  state: CountingDashboardState,
): CountingDashboardState {
  return {
    ...state,
    playerHand: [],
    dealerCards: [],
    decisionAnalysis: null,
    isDecisionAnalysisStale: false,
  };
}

export function resetCountingStaleFlags(
  state: CountingDashboardState,
): CountingDashboardState {
  return {
    ...state,
    isDecisionAnalysisStale: false,
    isDeepAnalysisStale: false,
  };
}
