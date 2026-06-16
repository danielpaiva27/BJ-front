import { CardValue } from "../models/blackjack-table.models";
import {
  CardHistoryEntry,
  CardHistoryDestination,
  CountingDashboardState,
  CountingInputMode,
  HypotheticalHandState,
} from "../models/counting-dashboard.models";
import { evaluatePlayerHand } from "./blackjack-table.utils";

export const INITIAL_COUNTING_INPUT_MODE: CountingInputMode = "seen-card";

export interface UndoLastCountingCardResult {
  ok: boolean;
  state: CountingDashboardState;
  undoneEntry?: CardHistoryEntry;
  error?: string;
}

function removeLastOccurrence(values: CardValue[], value: CardValue): CardValue[] {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] === value) {
      return [...values.slice(0, index), ...values.slice(index + 1)];
    }
  }

  return values;
}

function resolveCardHistoryDestination(inputMode: CountingInputMode): CardHistoryDestination {
  if (inputMode === "player") {
    return "player";
  }

  if (inputMode === "dealer") {
    return "dealer";
  }

  return "counting-only";
}

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

export function setCountingInputMode(
  state: CountingDashboardState,
  inputMode: CountingInputMode,
): CountingDashboardState {
  return {
    ...state,
    inputMode,
  };
}

export function registerCountingCard(
  state: CountingDashboardState,
  value: CardValue,
  timestamp: string = new Date().toISOString(),
): CountingDashboardState {
  const addToPlayerHand = state.inputMode === "player";
  const addToDealerCards = state.inputMode === "dealer";
  const updatesHypotheticalHand = addToPlayerHand || addToDealerCards;
  const hasDecisionAnalysis = state.decisionAnalysis !== null;

  return {
    ...state,
    playerHand: addToPlayerHand ? [...state.playerHand, value] : state.playerHand,
    dealerCards: addToDealerCards ? [...state.dealerCards, value] : state.dealerCards,
    cardHistory: [
      ...state.cardHistory,
      {
        value,
        inputMode: state.inputMode,
        destination: resolveCardHistoryDestination(state.inputMode),
        addedToPlayerHand: addToPlayerHand,
        addedToDealerCards: addToDealerCards,
        sequence: state.cardHistory.length + 1,
        timestamp,
      },
    ],
    decisionAnalysis: updatesHypotheticalHand ? null : state.decisionAnalysis,
    isDecisionAnalysisStale: updatesHypotheticalHand
      ? false
      : (hasDecisionAnalysis ? true : state.isDecisionAnalysisStale),
    isDeepAnalysisStale: state.deepAnalysis ? true : state.isDeepAnalysisStale,
  };
}

export function undoLastCountingCard(state: CountingDashboardState): UndoLastCountingCardResult {
  if (state.cardHistory.length === 0) {
    return {
      ok: false,
      state,
      error: "No counting card history to undo.",
    };
  }

  const undoneEntry = state.cardHistory[state.cardHistory.length - 1];
  const nextPlayerHand = undoneEntry.addedToPlayerHand
    ? removeLastOccurrence(state.playerHand, undoneEntry.value)
    : state.playerHand;
  const nextDealerCards = undoneEntry.addedToDealerCards
    ? removeLastOccurrence(state.dealerCards, undoneEntry.value)
    : state.dealerCards;
  const updatesHypotheticalHand = undoneEntry.addedToPlayerHand || undoneEntry.addedToDealerCards;
  const hasDecisionAnalysis = state.decisionAnalysis !== null;

  return {
    ok: true,
    undoneEntry,
    state: {
      ...state,
      playerHand: nextPlayerHand,
      dealerCards: nextDealerCards,
      cardHistory: state.cardHistory.slice(0, -1),
      decisionAnalysis: updatesHypotheticalHand ? null : state.decisionAnalysis,
      isDecisionAnalysisStale: updatesHypotheticalHand
        ? false
        : (hasDecisionAnalysis ? true : state.isDecisionAnalysisStale),
      isDeepAnalysisStale: state.deepAnalysis ? true : state.isDeepAnalysisStale,
    },
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
