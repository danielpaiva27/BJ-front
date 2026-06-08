import { CardValue } from "../models/blackjack-table.models";
import {
  buildAnalyzeHandRequest,
  computeLiveShoeCounting,
  createInitialShoeCounts,
  createInitialTableState,
  evaluatePlayerHand,
  getAvailablePlayerActions,
  getTotalRemainingCards,
  isCardTargetAllowedForRoundPhase,
  isGuidedRoundActionAllowed,
  registerCardAction,
  resetRound,
  resetShoe,
  shouldDealerHit,
  startNewRoundKeepingShoe,
  transitionGuidedRoundPhase,
  undoLastRegisteredCard,
} from "./blackjack-table.utils";

describe("blackjack-table.utils", () => {
  function availableActionsFromResult(
    result: ReturnType<typeof getAvailablePlayerActions>,
  ): Array<ReturnType<typeof getAvailablePlayerActions>[number]["action"]> {
    return result.filter((item) => item.isAvailable).map((item) => item.action);
  }

  it("initializes shoe counts for one deck", () => {
    const shoeCounts = createInitialShoeCounts(1);
    const ten = shoeCounts.find((item) => item.value === "10");
    const ace = shoeCounts.find((item) => item.value === "A");

    expect(ten?.count).toBe(16);
    expect(ten?.display).toBe("10/J/Q/K");
    expect(ace?.count).toBe(4);
    expect(shoeCounts.length).toBe(10);
  });

  it("initializes shoe counts for six decks", () => {
    const shoeCounts = createInitialShoeCounts(6);
    const ten = shoeCounts.find((item) => item.value === "10");
    const ace = shoeCounts.find((item) => item.value === "A");

    expect(ten?.count).toBe(96);
    expect(ace?.count).toBe(24);
  });

  it("registers a card and decrements shoe count", () => {
    const state = createInitialTableState(1);
    const result = registerCardAction(state, "A", "player", "2026-06-02T00:00:00.000Z");

    expect(result.ok).toBeTrue();
    expect(state.roundPhase).toBe("SETUP");
    expect(result.state.playerCards).toEqual(["A"]);
    expect(result.state.history.length).toBe(1);
    expect(result.state.shoeCounts.find((item) => item.value === "A")?.count).toBe(3);
  });

  it("defines guided round phase permissions", () => {
    expect(isGuidedRoundActionAllowed("SETUP", "START_SHOE")).toBeTrue();
    expect(isGuidedRoundActionAllowed("SETUP", "HIT")).toBeFalse();
    expect(isGuidedRoundActionAllowed("SHOE_ACTIVE", "START_SEEN_CARDS_SETUP")).toBeTrue();
    expect(isGuidedRoundActionAllowed("SHOE_ACTIVE", "REGISTER_INITIAL_CARD")).toBeFalse();
    expect(isGuidedRoundActionAllowed("BETTING_DECISION", "START_SEEN_CARDS_SETUP")).toBeTrue();
    expect(isGuidedRoundActionAllowed("BETTING_DECISION", "REGISTER_SEEN_CARD")).toBeFalse();
    expect(isGuidedRoundActionAllowed("PLAYER_DECISION", "HIT")).toBeTrue();
    expect(isGuidedRoundActionAllowed("PLAYER_HIT_PENDING", "DOUBLE")).toBeFalse();
  });

  it("defines card targets by guided round phase", () => {
    expect(isCardTargetAllowedForRoundPhase("SHOE_ACTIVE", "seen")).toBeFalse();
    expect(isCardTargetAllowedForRoundPhase("SEEN_CARDS_SETUP", "seen")).toBeTrue();
    expect(isCardTargetAllowedForRoundPhase("SEEN_CARDS_SETUP", "player")).toBeFalse();
    expect(isCardTargetAllowedForRoundPhase("BETTING_DECISION", "seen")).toBeFalse();
    expect(isCardTargetAllowedForRoundPhase("PLAYER_DOUBLE_PENDING", "player")).toBeTrue();
    expect(isCardTargetAllowedForRoundPhase("PLAYER_DECISION", "player")).toBeFalse();
  });

  it("transitions guided round phases for core actions", () => {
    expect(transitionGuidedRoundPhase("SETUP", "START_SHOE")).toBe("SHOE_ACTIVE");
    expect(transitionGuidedRoundPhase("SHOE_ACTIVE", "START_SEEN_CARDS_SETUP")).toBe("SEEN_CARDS_SETUP");
    expect(transitionGuidedRoundPhase("SHOE_ACTIVE", "CONFIRM_BET")).toBe("INITIAL_DEAL");
    expect(transitionGuidedRoundPhase("SEEN_CARDS_SETUP", "CONFIRM_SEEN_CARDS")).toBe("BETTING_DECISION");
    expect(transitionGuidedRoundPhase("BETTING_DECISION", "START_SEEN_CARDS_SETUP")).toBe("SEEN_CARDS_SETUP");
    expect(transitionGuidedRoundPhase("BETTING_DECISION", "CONFIRM_BET")).toBe("INITIAL_DEAL");
    expect(transitionGuidedRoundPhase("PLAYER_DECISION", "HIT")).toBe("PLAYER_HIT_PENDING");
    expect(transitionGuidedRoundPhase("PLAYER_DECISION", "STAND")).toBe("DEALER_REVEAL_PENDING");
    expect(transitionGuidedRoundPhase("PLAYER_DECISION", "SURRENDER")).toBe("ROUND_RESULT");
  });

  it("returns an error when trying to draw unavailable card value", () => {
    let state = createInitialTableState(1);

    for (let i = 0; i < 4; i += 1) {
      const okResult = registerCardAction(state, "A", "seen");
      state = okResult.state;
    }

    const failedResult = registerCardAction(state, "A", "seen");
    expect(failedResult.ok).toBeFalse();
    expect(failedResult.error).toContain("not available");
    expect(failedResult.state.shoeCounts.find((item) => item.value === "A")?.count).toBe(0);
  });

  it("undoes the last registered card", () => {
    const state = createInitialTableState(1);
    const first = registerCardAction(state, "10", "player").state;
    const second = registerCardAction(first, "9", "seen").state;

    const undone = undoLastRegisteredCard(second);

    expect(undone.ok).toBeTrue();
    expect(undone.state.seenCards).toEqual([]);
    expect(undone.state.history.length).toBe(1);
    expect(undone.state.shoeCounts.find((item) => item.value === "9")?.count).toBe(4);
  });

  it("resets current round and keeps shoe depletion", () => {
    const state = createInitialTableState(1);
    const withCards = registerCardAction(state, "10", "player").state;
    const withDealer = registerCardAction(withCards, "A", "dealer_upcard").state;
    const withRevealed = registerCardAction(withDealer, "9", "dealer_revealed").state;

    const reset = resetRound(withRevealed);

    expect(reset.playerCards).toEqual([]);
    expect(reset.dealerUpcard).toBeNull();
    expect(reset.dealerRevealedCards).toEqual([]);
    expect(reset.seenCards).toEqual([]);
    expect(reset.shoeCounts.find((item) => item.value === "10")?.count).toBe(16);
    expect(reset.shoeCounts.find((item) => item.value === "A")?.count).toBe(4);
    expect(reset.shoeCounts.find((item) => item.value === "9")?.count).toBe(4);
  });

  it("starts a new round keeping the depleted shoe", () => {
    const state = createInitialTableState(1);
    const withCards = registerCardAction(state, "10", "player").state;
    const withDealer = registerCardAction(withCards, "A", "dealer_upcard").state;

    const nextRound = startNewRoundKeepingShoe(withDealer);

    expect(nextRound.playerCards).toEqual([]);
    expect(nextRound.dealerUpcard).toBeNull();
    expect(nextRound.seenCards).toEqual(["10", "A"]);
    expect(nextRound.shoeCounts.find((item) => item.value === "10")?.count).toBe(15);
    expect(nextRound.shoeCounts.find((item) => item.value === "A")?.count).toBe(3);
    expect(nextRound.gamePhase).toBe("shoe_active");

    const nextRoundAgain = startNewRoundKeepingShoe(nextRound);
    expect(nextRoundAgain.seenCards).toEqual(["10", "A"]);
    expect(nextRoundAgain.shoeCounts.find((item) => item.value === "10")?.count).toBe(15);
    expect(nextRoundAgain.shoeCounts.find((item) => item.value === "A")?.count).toBe(3);
  });

  it("does not duplicate dealer revealed cards already present in seen cards when starting next round", () => {
    const state = createInitialTableState(1);
    const withPlayerOne = registerCardAction(state, "10", "player").state;
    const withPlayerTwo = registerCardAction(withPlayerOne, "7", "player").state;
    const withDealerUpcard = registerCardAction(withPlayerTwo, "6", "dealer_upcard").state;
    const withDealerReveal = registerCardAction(withDealerUpcard, "8", "dealer_revealed").state;

    expect(withDealerReveal.seenCards).toEqual(["8"]);

    const nextRound = startNewRoundKeepingShoe(withDealerReveal);

    expect(nextRound.seenCards).toEqual(["8", "10", "7", "6"]);
    expect(nextRound.dealerRevealedCards).toEqual([]);
    expect(nextRound.playerCards).toEqual([]);
    expect(nextRound.dealerUpcard).toBeNull();
  });

  it("resets the entire shoe to initial state", () => {
    const state = createInitialTableState(6);
    const withSeen = registerCardAction(state, "10", "seen").state;
    const withSeenAgain = registerCardAction(withSeen, "A", "seen").state;

    const reset = resetShoe(withSeenAgain);

    expect(reset.history).toEqual([]);
    expect(reset.seenCards).toEqual([]);
    expect(reset.playerCards).toEqual([]);
    expect(reset.dealerUpcard).toBeNull();
    expect(reset.shoeCounts.find((item) => item.value === "10")?.count).toBe(96);
    expect(reset.shoeCounts.find((item) => item.value === "A")?.count).toBe(24);
  });

  it("computes total remaining cards", () => {
    const state = createInitialTableState(1);
    const withOneCard = registerCardAction(state, "2", "seen").state;

    expect(getTotalRemainingCards(state)).toBe(52);
    expect(getTotalRemainingCards(withOneCard)).toBe(51);
  });

  it("computes lightweight live Hi-Lo counting without pre-round betting analysis", () => {
    let state = createInitialTableState(6);
    state = registerCardAction(state, "2", "seen").state;
    state = registerCardAction(state, "3", "seen").state;
    state = registerCardAction(state, "10", "seen").state;

    const counting = computeLiveShoeCounting(state);

    expect(counting.running_count).toBe(1);
    expect(counting.cards_remaining).toBe(309);
    expect(counting.decks_remaining).toBeCloseTo(309 / 52, 4);
    expect(counting.true_count).toBeCloseTo(1 / (309 / 52), 4);
  });

  it("keeps live true count safe when the shoe is empty", () => {
    const state = createInitialTableState(1);
    const emptyShoeState = {
      ...state,
      seenCards: ["2"] as CardValue[],
      shoeCounts: state.shoeCounts.map((item) => ({
        ...item,
        count: 0,
      })),
    };

    const counting = computeLiveShoeCounting(emptyShoeState);

    expect(counting.cards_remaining).toBe(0);
    expect(counting.decks_remaining).toBe(0);
    expect(counting.true_count).toBe(0);
    expect(Number.isFinite(counting.true_count)).toBeTrue();
  });

  it("builds analyze payload from current table state", () => {
    let state = createInitialTableState(1);
    state = registerCardAction(state, "10", "player").state;
    state = registerCardAction(state, "6", "player").state;
    state = registerCardAction(state, "10", "dealer_upcard").state;
    state = registerCardAction(state, "5", "seen").state;
    state = registerCardAction(state, "9", "dealer_revealed").state;

    const payload = buildAnalyzeHandRequest(state, {
      simulations: 50000,
      seed: 42,
      bankroll: 1000,
      minimum_bet: 10,
      risk_profile: "moderate",
      rules: {
        number_of_decks: 1,
        dealer_hits_soft_17: false,
        blackjack_payout: "3:2",
        double_allowed: true,
        double_after_split: true,
        surrender_allowed: false,
        max_splits: 3,
        dealer_peek: true,
      },
    });

    expect(payload).not.toBeNull();
    expect(payload?.player_hand).toEqual(["10", "6"] as CardValue[]);
    expect(payload?.dealer_upcard).toBe("10");
    expect(payload?.seen_cards).toEqual(["5", "9"] as CardValue[]);
    expect(payload?.simulations).toBe(50000);
  });

  it("adds dealer_revealed cards to seen cards", () => {
    const state = createInitialTableState(1);
    const updated = registerCardAction(state, "8", "dealer_revealed").state;

    expect(updated.dealerRevealedCards).toEqual(["8"]);
    expect(updated.seenCards).toEqual(["8"]);
  });

  it("returns null payload when state is not ready", () => {
    const state = createInitialTableState(1);
    const payload = buildAnalyzeHandRequest(state);

    expect(payload).toBeNull();
  });

  it("returns only executable player actions in a valid initial decision", () => {
    const result = getAvailablePlayerActions({
      phase: "PLAYER_DECISION",
      playerCards: ["10", "6"],
      rules: {
        double_allowed: true,
        surrender_allowed: false,
        max_splits: 3,
      },
    });

    expect(availableActionsFromResult(result)).toEqual(["hit", "stand", "double"]);
  });

  it("hides Double when table rule double_allowed is disabled", () => {
    const result = getAvailablePlayerActions({
      phase: "PLAYER_DECISION",
      playerCards: ["5", "6"],
      rules: {
        double_allowed: false,
        surrender_allowed: false,
        max_splits: 3,
      },
    });

    expect(availableActionsFromResult(result)).toEqual(["hit", "stand"]);
    expect(result.find((item) => item.action === "double")?.reason).toContain("Dobrar desativado");
  });

  it("hides Double when player has more than two cards", () => {
    const result = getAvailablePlayerActions({
      phase: "PLAYER_DECISION",
      playerCards: ["5", "3", "2"],
      rules: {
        double_allowed: true,
        surrender_allowed: false,
        max_splits: 3,
      },
      flags: {
        hasHit: true,
      },
    });

    expect(availableActionsFromResult(result)).toEqual(["hit", "stand"]);
    expect(result.find((item) => item.action === "double")?.reason).toContain("decisao inicial");
  });

  it("enables split only when pair and split rule are valid", () => {
    const pairResult = getAvailablePlayerActions({
      phase: "PLAYER_DECISION",
      playerCards: ["8", "8"],
      rules: {
        double_allowed: true,
        surrender_allowed: false,
        max_splits: 3,
      },
    });

    const nonPairResult = getAvailablePlayerActions({
      phase: "PLAYER_DECISION",
      playerCards: ["9", "7"],
      rules: {
        double_allowed: true,
        surrender_allowed: false,
        max_splits: 3,
      },
    });

    expect(availableActionsFromResult(pairResult)).toContain("split");
    expect(availableActionsFromResult(nonPairResult)).not.toContain("split");
    expect(nonPairResult.find((item) => item.action === "split")?.reason).toContain("pares");
  });

  it("hides split after double state is active", () => {
    const result = getAvailablePlayerActions({
      phase: "PLAYER_DECISION",
      playerCards: ["8", "8"],
      rules: {
        double_allowed: true,
        surrender_allowed: true,
        max_splits: 3,
      },
      flags: {
        hasDoubled: true,
      },
    });

    expect(availableActionsFromResult(result)).toEqual([]);
    expect(result.find((item) => item.action === "split")?.reason).toContain("decisao inicial");
  });

  it("hides split after surrender state is active", () => {
    const result = getAvailablePlayerActions({
      phase: "PLAYER_DECISION",
      playerCards: ["8", "8"],
      rules: {
        double_allowed: true,
        surrender_allowed: true,
        max_splits: 3,
      },
      flags: {
        hasSurrendered: true,
      },
    });

    expect(availableActionsFromResult(result)).toEqual([]);
    expect(result.find((item) => item.action === "split")?.reason).toContain("Rodada encerrada");
  });

  it("hides all normal actions for natural blackjack", () => {
    const result = getAvailablePlayerActions({
      phase: "PLAYER_DECISION",
      playerCards: ["A", "10"],
      rules: {
        double_allowed: true,
        surrender_allowed: true,
        max_splits: 3,
      },
    });

    expect(availableActionsFromResult(result)).toEqual([]);
  });

  it("hides all normal actions after bust", () => {
    const result = getAvailablePlayerActions({
      phase: "PLAYER_DECISION",
      playerCards: ["10", "9", "5"],
      rules: {
        double_allowed: true,
        surrender_allowed: true,
        max_splits: 3,
      },
    });

    expect(availableActionsFromResult(result)).toEqual([]);
  });

  it("removes double, split and surrender after a hit", () => {
    const result = getAvailablePlayerActions({
      phase: "PLAYER_DECISION",
      playerCards: ["10", "6", "2"],
      rules: {
        double_allowed: true,
        surrender_allowed: true,
        max_splits: 3,
      },
      flags: {
        hasHit: true,
      },
    });

    expect(availableActionsFromResult(result)).toEqual(["hit", "stand"]);
  });

  it("follows surrender table rule toggle", () => {
    const surrenderEnabled = getAvailablePlayerActions({
      phase: "PLAYER_DECISION",
      playerCards: ["10", "6"],
      rules: {
        double_allowed: true,
        surrender_allowed: true,
        max_splits: 3,
      },
    });
    const surrenderDisabled = getAvailablePlayerActions({
      phase: "PLAYER_DECISION",
      playerCards: ["10", "6"],
      rules: {
        double_allowed: true,
        surrender_allowed: false,
        max_splits: 3,
      },
    });

    expect(availableActionsFromResult(surrenderEnabled)).toContain("surrender");
    expect(availableActionsFromResult(surrenderDisabled)).not.toContain("surrender");
  });

  it("hides surrender after double state is active", () => {
    const result = getAvailablePlayerActions({
      phase: "PLAYER_DECISION",
      playerCards: ["10", "6", "5"],
      rules: {
        double_allowed: true,
        surrender_allowed: true,
        max_splits: 3,
      },
      flags: {
        hasDoubled: true,
      },
    });

    expect(availableActionsFromResult(result)).toEqual([]);
    expect(result.find((item) => item.action === "surrender")?.reason).toContain("antes de qualquer acao");
  });

  it("evaluates soft hands with ace and detects bust correctly", () => {
    const softHand = evaluatePlayerHand(["5", "3", "A"]);
    const bustedHand = evaluatePlayerHand(["10", "6", "10"]);

    expect(softHand.total).toBe(19);
    expect(softHand.isSoft).toBeTrue();
    expect(softHand.isBust).toBeFalse();

    expect(bustedHand.total).toBe(26);
    expect(bustedHand.isSoft).toBeFalse();
    expect(bustedHand.isBust).toBeTrue();
  });

  it("applies dealer soft-17 rule correctly", () => {
    const soft17 = evaluatePlayerHand(["A", "6"]);
    const hard17 = evaluatePlayerHand(["10", "7"]);

    expect(shouldDealerHit(soft17, true)).toBeTrue();
    expect(shouldDealerHit(soft17, false)).toBeFalse();
    expect(shouldDealerHit(hard17, true)).toBeFalse();
    expect(shouldDealerHit(hard17, false)).toBeFalse();
  });
});
