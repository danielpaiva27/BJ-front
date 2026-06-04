import { ActionAnalysis, AnalyzeHandRequest, GameRulesRequest } from "../models/blackjack-analysis.models";
import {
  BlackjackTableState,
  BuildAnalyzeRequestOptions,
  BuildPreRoundAnalysisOptions,
  CardTarget,
  CardValue,
  GuidedRoundAction,
  GuidedRoundPhase,
  PreRoundAnalysisSnapshot,
  PreRoundShoeStatus,
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

export type PlayerAction = ActionAnalysis["action"];

export interface PlayerActionStateFlags {
  hasHit: boolean;
  hasDoubled: boolean;
  hasSplit: boolean;
  hasSurrendered: boolean;
  isRoundEnded: boolean;
  splitCount: number;
}

export interface PlayerHandEvaluation {
  total: number;
  isSoft: boolean;
  isBust: boolean;
  isNaturalBlackjack: boolean;
  isPair: boolean;
}

export interface PlayerActionAvailability {
  action: PlayerAction;
  isAvailable: boolean;
  reason?: string;
}

export interface LiveShoeCounting {
  running_count: number;
  true_count: number;
  cards_remaining: number;
  decks_remaining: number;
}

export interface GetAvailablePlayerActionsInput {
  phase: GuidedRoundPhase;
  playerCards: CardValue[];
  rules?: GameRulesRequest;
  flags?: Partial<PlayerActionStateFlags>;
  handEvaluation?: PlayerHandEvaluation;
}

const PLAYER_ACTION_ORDER: readonly PlayerAction[] = ["hit", "stand", "double", "split", "surrender"];

const HILO_CARD_VALUES: Record<CardValue, number> = {
  "2": 1,
  "3": 1,
  "4": 1,
  "5": 1,
  "6": 1,
  "7": 0,
  "8": 0,
  "9": 0,
  "10": -1,
  A: -1,
};

const RISK_CAP_BY_PROFILE = {
  conservative: 0.02,
  moderate: 0.05,
  aggressive: 0.08,
} as const;

const DEFAULT_PLAYER_ACTION_FLAGS: PlayerActionStateFlags = {
  hasHit: false,
  hasDoubled: false,
  hasSplit: false,
  hasSurrendered: false,
  isRoundEnded: false,
  splitCount: 0,
};

const ROUND_PHASE_ALLOWED_ACTIONS: Record<GuidedRoundPhase, readonly GuidedRoundAction[]> = {
  SETUP: ["START_SHOE"],
  SHOE_ACTIVE: [
    "START_SEEN_CARDS_SETUP",
    "CONFIRM_BET",
    "NEW_ROUND",
    "RESET_ROUND",
    "RESET_SHOE",
    "UNDO_CARD",
  ],
  SEEN_CARDS_SETUP: ["REGISTER_SEEN_CARD", "CONFIRM_SEEN_CARDS", "RESET_ROUND", "RESET_SHOE", "UNDO_CARD"],
  BETTING_DECISION: ["START_SEEN_CARDS_SETUP", "CONFIRM_BET", "RESET_ROUND", "RESET_SHOE", "UNDO_CARD"],
  INITIAL_DEAL: ["REGISTER_INITIAL_CARD", "ANALYZE_DECISION", "RESET_ROUND", "RESET_SHOE", "UNDO_CARD"],
  PLAYER_DECISION: ["ANALYZE_DECISION", "HIT", "STAND", "DOUBLE", "SPLIT", "SURRENDER", "RESET_ROUND", "RESET_SHOE", "UNDO_CARD"],
  PLAYER_HIT_PENDING: ["REGISTER_PLAYER_HIT", "RESET_ROUND", "RESET_SHOE", "UNDO_CARD"],
  PLAYER_DOUBLE_PENDING: ["REGISTER_PLAYER_DOUBLE", "RESET_ROUND", "RESET_SHOE", "UNDO_CARD"],
  DEALER_REVEAL_PENDING: ["REVEAL_DEALER_CARD", "RESET_ROUND", "RESET_SHOE", "UNDO_CARD"],
  DEALER_TURN: ["START_DEALER_DRAW", "SHOW_ROUND_RESULT", "RESET_ROUND", "RESET_SHOE", "UNDO_CARD"],
  DEALER_DRAW_PENDING: ["REGISTER_DEALER_DRAW", "RESET_ROUND", "RESET_SHOE", "UNDO_CARD"],
  ROUND_RESULT: ["END_ROUND", "NEW_ROUND", "RESET_ROUND", "RESET_SHOE"],
  ROUND_ENDED: ["NEW_ROUND", "RESET_ROUND", "RESET_SHOE"],
};

const ROUND_PHASE_CARD_TARGETS: Record<GuidedRoundPhase, readonly CardTarget[]> = {
  SETUP: [],
  SHOE_ACTIVE: [],
  SEEN_CARDS_SETUP: ["seen"],
  BETTING_DECISION: [],
  INITIAL_DEAL: ["player", "dealer_upcard"],
  PLAYER_DECISION: [],
  PLAYER_HIT_PENDING: ["player"],
  PLAYER_DOUBLE_PENDING: ["player"],
  DEALER_REVEAL_PENDING: ["dealer_revealed"],
  DEALER_TURN: [],
  DEALER_DRAW_PENDING: ["dealer_revealed"],
  ROUND_RESULT: [],
  ROUND_ENDED: [],
};

function cardNumericValue(value: CardValue): number {
  if (value === "A") {
    return 11;
  }

  if (value === "10") {
    return 10;
  }

  return Number(value);
}

export function evaluatePlayerHand(cards: CardValue[]): PlayerHandEvaluation {
  let total = 0;
  let aceCount = 0;

  for (const value of cards) {
    total += cardNumericValue(value);
    if (value === "A") {
      aceCount += 1;
    }
  }

  while (total > 21 && aceCount > 0) {
    total -= 10;
    aceCount -= 1;
  }

  return {
    total,
    isSoft: aceCount > 0 && total <= 21,
    isBust: total > 21,
    isNaturalBlackjack: cards.length === 2 && cards.includes("A") && cards.includes("10"),
    isPair: cards.length === 2 && cards[0] === cards[1],
  };
}

export function shouldDealerHit(handEvaluation: PlayerHandEvaluation, dealerHitsSoft17: boolean): boolean {
  if (handEvaluation.isBust) {
    return false;
  }

  if (handEvaluation.total < 17) {
    return true;
  }

  if (handEvaluation.total > 17) {
    return false;
  }

  return dealerHitsSoft17 && handEvaluation.isSoft;
}

function resolveGlobalPlayerActionBlockReason(
  phase: GuidedRoundPhase,
  flags: PlayerActionStateFlags,
  handEvaluation: PlayerHandEvaluation,
): string | null {
  if (phase !== "PLAYER_DECISION") {
    return "Acoes do jogador so ficam disponiveis na fase de decisao.";
  }

  if (handEvaluation.isNaturalBlackjack) {
    return "Blackjack natural: nenhuma acao normal disponivel.";
  }

  if (handEvaluation.isBust) {
    return "Mao estourada: nenhuma acao normal disponivel.";
  }

  if (flags.hasSurrendered || flags.isRoundEnded) {
    return "Rodada encerrada: nenhuma acao normal disponivel.";
  }

  return null;
}

function buildUnavailablePlayerAction(action: PlayerAction, reason: string): PlayerActionAvailability {
  return {
    action,
    isAvailable: false,
    reason,
  };
}

export function getAvailablePlayerActions(input: GetAvailablePlayerActionsInput): PlayerActionAvailability[] {
  const flags: PlayerActionStateFlags = {
    ...DEFAULT_PLAYER_ACTION_FLAGS,
    ...(input.flags ?? {}),
  };
  const handEvaluation = input.handEvaluation ?? evaluatePlayerHand(input.playerCards);
  const hasTwoCards = input.playerCards.length === 2;
  const maxSplits = Math.max(0, Math.floor(input.rules?.max_splits ?? 0));
  const initialDecisionState =
    hasTwoCards &&
    !flags.hasHit &&
    !flags.hasDoubled &&
    !flags.hasSplit &&
    !flags.hasSurrendered;
  const globalBlockReason = resolveGlobalPlayerActionBlockReason(input.phase, flags, handEvaluation);

  if (globalBlockReason) {
    return PLAYER_ACTION_ORDER.map((action) => buildUnavailablePlayerAction(action, globalBlockReason));
  }

  return PLAYER_ACTION_ORDER.map((action) => {
    if (action === "hit" || action === "stand") {
      if (flags.hasDoubled) {
        return buildUnavailablePlayerAction(action, "Depois do Double, a mao do jogador fica encerrada.");
      }

      return { action, isAvailable: true };
    }

    if (action === "double") {
      if (!input.rules?.double_allowed) {
        return buildUnavailablePlayerAction(action, "Regra da mesa: Dobrar desativado.");
      }

      if (!initialDecisionState) {
        return buildUnavailablePlayerAction(action, "Dobrar so esta disponivel na decisao inicial.");
      }

      return { action, isAvailable: true };
    }

    if (action === "split") {
      if (maxSplits <= 0) {
        return buildUnavailablePlayerAction(action, "Regra da mesa: Split desativado.");
      }

      if (flags.splitCount >= maxSplits) {
        return buildUnavailablePlayerAction(action, "Limite de Split atingido nesta rodada.");
      }

      if (!initialDecisionState) {
        return buildUnavailablePlayerAction(action, "Split so esta disponivel na decisao inicial.");
      }

      if (!handEvaluation.isPair) {
        return buildUnavailablePlayerAction(action, "Split so esta disponivel com pares.");
      }

      return { action, isAvailable: true };
    }

    if (!input.rules?.surrender_allowed) {
      return buildUnavailablePlayerAction(action, "Regra da mesa: Surrender desativado.");
    }

    if (!initialDecisionState) {
      return buildUnavailablePlayerAction(action, "Surrender so esta disponivel antes de qualquer acao do jogador.");
    }

    return { action, isAvailable: true };
  });
}

export function getAllowedRoundActions(phase: GuidedRoundPhase): readonly GuidedRoundAction[] {
  return ROUND_PHASE_ALLOWED_ACTIONS[phase];
}

export function isGuidedRoundActionAllowed(phase: GuidedRoundPhase, action: GuidedRoundAction): boolean {
  return getAllowedRoundActions(phase).includes(action);
}

export function getAllowedCardTargetsForRoundPhase(phase: GuidedRoundPhase): readonly CardTarget[] {
  return ROUND_PHASE_CARD_TARGETS[phase];
}

export function isCardTargetAllowedForRoundPhase(phase: GuidedRoundPhase, target: CardTarget): boolean {
  return getAllowedCardTargetsForRoundPhase(phase).includes(target);
}

export function transitionGuidedRoundPhase(phase: GuidedRoundPhase, action: GuidedRoundAction): GuidedRoundPhase {
  if (!isGuidedRoundActionAllowed(phase, action)) {
    return phase;
  }

  if (action === "START_SHOE" || action === "NEW_ROUND" || action === "RESET_ROUND" || action === "RESET_SHOE") {
    return "SHOE_ACTIVE";
  }

  if (action === "START_SEEN_CARDS_SETUP") {
    return "SEEN_CARDS_SETUP";
  }

  if (action === "CONFIRM_SEEN_CARDS") {
    return "BETTING_DECISION";
  }

  if (action === "CONFIRM_BET") {
    return "INITIAL_DEAL";
  }

  if (action === "ANALYZE_DECISION" || action === "REGISTER_PLAYER_HIT") {
    return "PLAYER_DECISION";
  }

  if (action === "HIT") {
    return "PLAYER_HIT_PENDING";
  }

  if (action === "DOUBLE") {
    return "PLAYER_DOUBLE_PENDING";
  }

  if (action === "STAND" || action === "REGISTER_PLAYER_DOUBLE") {
    return "DEALER_REVEAL_PENDING";
  }

  if (action === "REVEAL_DEALER_CARD" || action === "REGISTER_DEALER_DRAW") {
    return "DEALER_TURN";
  }

  if (action === "START_DEALER_DRAW") {
    return "DEALER_DRAW_PENDING";
  }

  if (action === "SHOW_ROUND_RESULT") {
    return "ROUND_RESULT";
  }

  if (action === "SURRENDER") {
    return "ROUND_RESULT";
  }

  if (action === "END_ROUND") {
    return "ROUND_ENDED";
  }

  return phase;
}

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
    roundPhase: "SETUP",
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
  const knownRoundCards: CardValue[] = [
    ...state.playerCards,
    ...(state.dealerUpcard ? [state.dealerUpcard] : []),
  ];

  const nextState: BlackjackTableState = {
    ...state,
    playerCards: [],
    dealerUpcard: null,
    seenCards: [...state.seenCards, ...knownRoundCards],
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

function computeRunningCount(seenCards: CardValue[]): number {
  return seenCards.reduce((total, cardValue) => total + HILO_CARD_VALUES[cardValue], 0);
}

export function computeLiveShoeCounting(state: BlackjackTableState): LiveShoeCounting {
  const cardsRemaining = Math.max(0, getTotalRemainingCards(state));
  const decksRemaining = cardsRemaining > 0 ? cardsRemaining / 52 : 0;
  const runningCount = computeRunningCount(state.seenCards);
  const trueCountRaw = decksRemaining > 0 ? runningCount / decksRemaining : 0;
  const trueCount = Number.isFinite(trueCountRaw) ? Number(trueCountRaw.toFixed(4)) : 0;

  return {
    running_count: runningCount,
    true_count: trueCount,
    cards_remaining: cardsRemaining,
    decks_remaining: Number(decksRemaining.toFixed(4)),
  };
}

function resolveShoeStatus(trueCount: number): { shoeStatus: PreRoundShoeStatus; deckStatus: string } {
  if (trueCount <= -2) {
    return {
      shoeStatus: "muito_desfavoravel",
      deckStatus: "Muito desfavoravel",
    };
  }

  if (trueCount < 0) {
    return {
      shoeStatus: "desfavoravel",
      deckStatus: "Desfavoravel",
    };
  }

  if (trueCount < 1) {
    return {
      shoeStatus: "neutro",
      deckStatus: "Neutro / favoravel baixo",
    };
  }

  if (trueCount < 2) {
    return {
      shoeStatus: "neutro_favoravel_leve",
      deckStatus: "Neutro para favoravel leve",
    };
  }

  if (trueCount < 4) {
    return {
      shoeStatus: "favoravel",
      deckStatus: "Favoravel",
    };
  }

  return {
    shoeStatus: "muito_favoravel",
    deckStatus: "Muito favoravel",
  };
}

function resolveTheoreticalUnits(trueCount: number, riskProfile: BuildPreRoundAnalysisOptions["risk_profile"]): number {
  if (riskProfile === "conservative") {
    if (trueCount >= 4) {
      return 3;
    }

    if (trueCount >= 2) {
      return 2;
    }

    return 1;
  }

  if (riskProfile === "aggressive") {
    if (trueCount >= 5) {
      return 8;
    }

    if (trueCount >= 3) {
      return 6;
    }

    if (trueCount >= 2) {
      return 3;
    }

    return 1;
  }

  if (trueCount >= 5) {
    return 6;
  }

  if (trueCount >= 3) {
    return 4;
  }

  if (trueCount >= 2) {
    return 2;
  }

  return 1;
}

function resolvePreRoundRecommendation(trueCount: number): { entryAdvice: string; recommendation: string } {
  if (trueCount <= 0) {
    return {
      entryAdvice: "Entrada conservadora: nao aumentar exposicao teorica.",
      recommendation:
        "Shoe nao favoravel. Se a mesa permitir, a postura mais conservadora seria observar e nao aumentar exposicao. Se for participar, usar apenas a unidade base.",
    };
  }

  if (trueCount < 2) {
    return {
      entryAdvice: "Entrada possivel com unidade base.",
      recommendation: "Shoe proximo do neutro. Exposicao teorica sugerida: unidade base.",
    };
  }

  return {
    entryAdvice: "Entrada favoravel: considerar exposicao teorica maior dentro do perfil de risco.",
    recommendation:
      "Shoe favoravel. O modelo sugere aumentar a exposicao teorica conforme o perfil de risco, sempre dentro do limite simulado da banca.",
  };
}

export function buildPreRoundAnalysis(
  state: BlackjackTableState,
  options: BuildPreRoundAnalysisOptions,
): PreRoundAnalysisSnapshot {
  const configuredDecks = Math.max(1, Math.floor(options.number_of_decks));
  const configuredTotalCards = configuredDecks * 52;
  const cardsRemaining = Math.max(0, Math.min(getTotalRemainingCards(state), configuredTotalCards));
  const runningCount = computeRunningCount(state.seenCards);
  const decksRemaining = cardsRemaining > 0 ? cardsRemaining / 52 : 0;
  const trueCountRaw = decksRemaining > 0 ? runningCount / decksRemaining : 0;
  const trueCount = Number(trueCountRaw.toFixed(4));
  const shoeStatus = resolveShoeStatus(trueCount);
  const theoreticalUnits = resolveTheoreticalUnits(trueCount, options.risk_profile);
  const minimumBet = Math.max(0, options.minimum_bet);
  const bankroll = Math.max(0, options.bankroll);
  const capPercent = RISK_CAP_BY_PROFILE[options.risk_profile];
  const maxSafeExposure = Number((bankroll * capPercent).toFixed(2));
  const rawSuggestedBet = Number((theoreticalUnits * minimumBet).toFixed(2));
  const suggestedBet = Number(Math.min(rawSuggestedBet, maxSafeExposure).toFixed(2));
  const capApplied = rawSuggestedBet > maxSafeExposure;
  const effectiveBetUnits = minimumBet > 0 ? Number((suggestedBet / minimumBet).toFixed(2)) : 0;
  const recommendationText = resolvePreRoundRecommendation(trueCount);
  const capExplanation = capApplied
    ? ` Limite de seguranca aplicado para o perfil: maximo de ${(capPercent * 100).toFixed(0)}% da banca simulada.`
    : "";

  return {
    counting: {
      running_count: runningCount,
      true_count: trueCount,
      cards_remaining: cardsRemaining,
      decks_remaining: Number(decksRemaining.toFixed(4)),
      deck_status: shoeStatus.deckStatus,
      shoe_status: shoeStatus.shoeStatus,
    },
    betting: {
      suggested_bet: suggestedBet,
      bet_units: effectiveBetUnits,
      risk_profile: options.risk_profile,
      explanation:
        `Exposicao simulada calculada com unidade base ${minimumBet.toFixed(2)} e ${theoreticalUnits.toFixed(2)} unidades teoricas.` +
        capExplanation,
      max_safe_exposure: maxSafeExposure,
      cap_percent: capPercent,
      cap_applied: capApplied,
    },
    recommendation: recommendationText.recommendation,
    entry_advice: recommendationText.entryAdvice,
    generated_at: options.generated_at ?? new Date().toISOString(),
    is_auto_generated: options.is_auto_generated ?? false,
  };
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
