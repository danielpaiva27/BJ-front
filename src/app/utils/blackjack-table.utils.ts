import { AnalyzeHandRequest } from "../models/blackjack-analysis.models";
import {
  BlackjackTableState,
  BuildAnalyzeRequestOptions,
  CardTarget,
  CardValue,
  RegisteredCardAction,
  ShoeValueCount,
  RegisterCardResult,
  UndoCardResult,
} from "../models/blackjack-table.models";

const CARD_VALUE_ORDER: CardValue[] = ["A", "10", "9", "8", "7", "6", "5", "4", "3", "2"];

const CARD_VALUE_DISPLAY: Record<CardValue, string> = {
  A: "A",
  "10": "10/J/Q/K",
  "9": "9",
  "8": "8",
  "7": "7",
  "6": "6",
  "5": "5",
  "4": "4",
  "3": "3",
  "2": "2",
};

function initialCountForValue(value: CardValue, numberOfDecks: number): number {
  if (value === "10") {
    return 16 * numberOfDecks;
  }
  return 4 * numberOfDecks;
}

export function createInitialShoeCounts(numberOfDecks: number): ShoeValueCount[] {
  const decks = Math.max(1, Math.floor(numberOfDecks));

  return CARD_VALUE_ORDER.map((value) => {
    const initialCount = initialCountForValue(value, decks);
    return {
      value,
      count: initialCount,
      initialCount,
      display: CARD_VALUE_DISPLAY[value],
    };
  });
}

export function createInitialTableState(numberOfDecks: number): BlackjackTableState {
  return {
    playerCards: [],
    dealerUpcard: null,
    seenCards: [],
    dealerRevealedCards: [],
    selectedTarget: "player",
    shoeCounts: createInitialShoeCounts(numberOfDecks),
    history: [],
    gamePhase: "table_setup",
  };
}

export function canRegisterCard(state: BlackjackTableState, value: CardValue): boolean {
  const shoeValue = state.shoeCounts.find((item) => item.value === value);
  return Boolean(shoeValue && shoeValue.count > 0);
}

function decrementShoeCount(shoeCounts: ShoeValueCount[], value: CardValue): ShoeValueCount[] {
  return shoeCounts.map((item) => {
    if (item.value !== value) {
      return item;
    }

    return {
      ...item,
      count: Math.max(0, item.count - 1),
    };
  });
}

function appendToTarget(state: BlackjackTableState, target: CardTarget, value: CardValue): BlackjackTableState {
  if (target === "player") {
    return { ...state, playerCards: [...state.playerCards, value] };
  }

  if (target === "dealer_upcard") {
    return { ...state, dealerUpcard: value };
  }

  if (target === "seen") {
    return { ...state, seenCards: [...state.seenCards, value] };
  }

  return {
    ...state,
    seenCards: [...state.seenCards, value],
    dealerRevealedCards: [...state.dealerRevealedCards, value],
  };
}

function removeLastFromList(values: CardValue[], value: CardValue): CardValue[] {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] === value) {
      return [...values.slice(0, index), ...values.slice(index + 1)];
    }
  }
  return values;
}

function removeFromTarget(state: BlackjackTableState, target: CardTarget, value: CardValue): BlackjackTableState {
  if (target === "player") {
    return { ...state, playerCards: removeLastFromList(state.playerCards, value) };
  }

  if (target === "dealer_upcard") {
    if (state.dealerUpcard === value) {
      return { ...state, dealerUpcard: null };
    }
    return state;
  }

  if (target === "seen") {
    return { ...state, seenCards: removeLastFromList(state.seenCards, value) };
  }

  return {
    ...state,
    seenCards: removeLastFromList(state.seenCards, value),
    dealerRevealedCards: removeLastFromList(state.dealerRevealedCards, value),
  };
}

function incrementShoeCount(shoeCounts: ShoeValueCount[], value: CardValue): ShoeValueCount[] {
  return shoeCounts.map((item) => {
    if (item.value !== value) {
      return item;
    }

    return {
      ...item,
      count: Math.min(item.initialCount, item.count + 1),
    };
  });
}

function incrementShoeCountByValue(
  shoeCounts: ShoeValueCount[],
  value: CardValue,
  amount: number,
): ShoeValueCount[] {
  let next = shoeCounts;
  for (let index = 0; index < amount; index += 1) {
    next = incrementShoeCount(next, value);
  }
  return next;
}

function removeValueOccurrences(values: CardValue[], value: CardValue, occurrences: number): CardValue[] {
  let next = values;
  for (let index = 0; index < occurrences; index += 1) {
    next = removeLastFromList(next, value);
  }
  return next;
}

function computeGamePhase(state: BlackjackTableState): BlackjackTableState["gamePhase"] {
  if (state.playerCards.length >= 2 && state.dealerUpcard) {
    return "analysis_ready";
  }

  if (state.history.length > 0) {
    return "shoe_active";
  }

  return "table_setup";
}

export function registerCardAction(
  state: BlackjackTableState,
  value: CardValue,
  target: CardTarget,
  timestamp: string = new Date().toISOString(),
): RegisterCardResult {
  if (!canRegisterCard(state, value)) {
    return {
      ok: false,
      state,
      error: `Card value ${value} is not available in the shoe.`,
    };
  }

  if (target === "dealer_upcard" && state.dealerUpcard !== null) {
    return {
      ok: false,
      state,
      error: "Dealer upcard is already defined for the current round.",
    };
  }

  const withTarget = appendToTarget(state, target, value);
  const historyEntry: RegisteredCardAction = { value, target, timestamp };
  const nextState: BlackjackTableState = {
    ...withTarget,
    selectedTarget: target,
    shoeCounts: decrementShoeCount(withTarget.shoeCounts, value),
    history: [...withTarget.history, historyEntry],
  };

  const resolvedState = {
    ...nextState,
    gamePhase: computeGamePhase(nextState),
  };

  return {
    ok: true,
    state: resolvedState,
  };
}

export function undoLastRegisteredCard(state: BlackjackTableState): UndoCardResult {
  if (state.history.length === 0) {
    return {
      ok: false,
      state,
      error: "No card registration to undo.",
    };
  }

  const lastEntry = state.history[state.history.length - 1];
  const withoutTarget = removeFromTarget(state, lastEntry.target, lastEntry.value);
  const nextState: BlackjackTableState = {
    ...withoutTarget,
    shoeCounts: incrementShoeCount(withoutTarget.shoeCounts, lastEntry.value),
    history: withoutTarget.history.slice(0, -1),
  };

  return {
    ok: true,
    state: {
      ...nextState,
      gamePhase: computeGamePhase(nextState),
    },
  };
}

export function resetRound(state: BlackjackTableState): BlackjackTableState {
  let restoredShoeCounts = state.shoeCounts;
  const restoreCards: CardValue[] = [
    ...state.playerCards,
    ...(state.dealerUpcard ? [state.dealerUpcard] : []),
    ...state.dealerRevealedCards,
  ];

  for (const cardValue of restoreCards) {
    restoredShoeCounts = incrementShoeCount(restoredShoeCounts, cardValue);
  }

  let nextSeenCards = state.seenCards;
  const revealedByValue = state.dealerRevealedCards.reduce<Record<CardValue, number>>(
    (accumulator, value) => ({
      ...accumulator,
      [value]: (accumulator[value] ?? 0) + 1,
    }),
    {} as Record<CardValue, number>,
  );
  const revealedValues = Object.entries(revealedByValue) as Array<[CardValue, number]>;

  for (const [value, occurrences] of revealedValues) {
    nextSeenCards = removeValueOccurrences(nextSeenCards, value, occurrences);
  }

  const nextState: BlackjackTableState = {
    ...state,
    playerCards: [],
    dealerUpcard: null,
    seenCards: nextSeenCards,
    dealerRevealedCards: [],
    selectedTarget: "player",
    shoeCounts: restoredShoeCounts,
    history: state.history.filter((entry) => entry.target === "seen"),
  };

  return {
    ...nextState,
    gamePhase: computeGamePhase(nextState),
  };
}

export function startNewRoundKeepingShoe(state: BlackjackTableState): BlackjackTableState {
  const nextState: BlackjackTableState = {
    ...state,
    playerCards: [],
    dealerUpcard: null,
    dealerRevealedCards: [],
    selectedTarget: "player",
  };

  return {
    ...nextState,
    gamePhase: "shoe_active",
  };
}

export function resetShoe(state: BlackjackTableState): BlackjackTableState {
  const nextState: BlackjackTableState = {
    ...createInitialTableState(1),
    selectedTarget: "player",
    shoeCounts: state.shoeCounts.map((item) => ({
      ...item,
      count: item.initialCount,
    })),
  };

  return {
    ...nextState,
    gamePhase: computeGamePhase(nextState),
  };
}

export function getTotalRemainingCards(state: BlackjackTableState): number {
  return state.shoeCounts.reduce((total, item) => total + item.count, 0);
}

export function buildAnalyzeHandRequest(
  state: BlackjackTableState,
  options: BuildAnalyzeRequestOptions = {},
): AnalyzeHandRequest | null {
  if (state.playerCards.length < 2 || !state.dealerUpcard) {
    return null;
  }

  return {
    player_hand: state.playerCards,
    dealer_upcard: state.dealerUpcard,
    seen_cards: state.seenCards,
    rules: options.rules,
    simulations: options.simulations,
    seed: options.seed,
    bankroll: options.bankroll,
    minimum_bet: options.minimum_bet,
    risk_profile: options.risk_profile,
  };
}
