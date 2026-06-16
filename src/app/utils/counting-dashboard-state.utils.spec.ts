import { AnalyzeHandResponse } from "../models/blackjack-analysis.models";
import {
  CountingDashboardState,
  HypotheticalHandState,
} from "../models/counting-dashboard.models";
import {
  createInitialCountingDashboardState,
  getDealerUpcard,
  getPlayerTotal,
  isDecisionHandValid,
  isPlayerBust,
  registerCountingCard,
  resetCountingStaleFlags,
  resetHypotheticalHandState,
  setCountingInputMode,
  undoLastCountingCard,
} from "./counting-dashboard-state.utils";

describe("counting-dashboard-state.utils", () => {
  it("initializes neutral counting-first state", () => {
    const state = createInitialCountingDashboardState();

    expect(state.inputMode).toBe("seen-card");
    expect(state.playerHand).toEqual([]);
    expect(state.dealerCards).toEqual([]);
    expect(state.cardHistory).toEqual([]);
    expect(state.decisionAnalysis).toBeNull();
    expect(state.deepAnalysis).toBeNull();
    expect(state.isDecisionAnalysisStale).toBeFalse();
    expect(state.isDeepAnalysisStale).toBeFalse();
  });

  it("validates only complete non-bust hypothetical decision hands", () => {
    expect(isDecisionHandValid({
      playerHand: [],
      dealerCards: [],
    })).toBeFalse();
    expect(isDecisionHandValid({
      playerHand: ["10"],
      dealerCards: ["6"],
    })).toBeFalse();
    expect(isDecisionHandValid({
      playerHand: ["10", "6"],
      dealerCards: [],
    })).toBeFalse();
    expect(isDecisionHandValid({
      playerHand: ["10", "6"],
      dealerCards: ["9"],
    })).toBeTrue();
    expect(isDecisionHandValid({
      playerHand: ["10", "9", "5"],
      dealerCards: ["6"],
    })).toBeFalse();
  });

  it("exposes hypothetical hand summary helpers", () => {
    const state: HypotheticalHandState = {
      playerHand: ["A", "7"],
      dealerCards: ["10"],
    };

    expect(getPlayerTotal(state)).toBe(18);
    expect(isPlayerBust(state)).toBeFalse();
    expect(getDealerUpcard(state)).toBe("10");
  });

  it("resets hypothetical hand without clearing counting history or deep analysis", () => {
    const state: CountingDashboardState = {
      ...createInitialCountingDashboardState(),
      playerHand: ["10", "6"],
      dealerCards: ["9"],
      cardHistory: [{
        value: "2",
        inputMode: "seen-card" as const,
        destination: "counting-only",
        addedToPlayerHand: false,
        addedToDealerCards: false,
        sequence: 1,
        timestamp: "2026-06-15T00:00:00.000Z",
      }],
      decisionAnalysis: {} as AnalyzeHandResponse,
      deepAnalysis: {
        cards_seen: 1,
        cards_remaining: 311,
        decks_remaining: 5.9808,
        bankroll: 1000,
        minimum_bet: 10,
        policy: {
          policy_id: "test",
          policy_label: "Test",
        },
        systems: [],
        most_favorable_estimate_system_id: "hi_lo" as const,
      },
      isDecisionAnalysisStale: true,
      isDeepAnalysisStale: true,
    };

    const reset = resetHypotheticalHandState(state);

    expect(reset.playerHand).toEqual([]);
    expect(reset.dealerCards).toEqual([]);
    expect(reset.decisionAnalysis).toBeNull();
    expect(reset.isDecisionAnalysisStale).toBeFalse();
    expect(reset.cardHistory).toEqual(state.cardHistory);
    expect(reset.deepAnalysis).toBe(state.deepAnalysis);
    expect(reset.isDeepAnalysisStale).toBeTrue();
  });

  it("can reset stale flags independently", () => {
    const reset = resetCountingStaleFlags({
      ...createInitialCountingDashboardState(),
      isDecisionAnalysisStale: true,
      isDeepAnalysisStale: true,
    });

    expect(reset.isDecisionAnalysisStale).toBeFalse();
    expect(reset.isDeepAnalysisStale).toBeFalse();
  });

  it("registers seen-card mode without changing hypothetical hands", () => {
    const withDeepAnalysis = {
      ...createInitialCountingDashboardState(),
      deepAnalysis: {
        cards_seen: 0,
        cards_remaining: 312,
        decks_remaining: 6,
        bankroll: 1000,
        minimum_bet: 10,
        policy: {
          policy_id: "test",
          policy_label: "Test",
        },
        systems: [],
        most_favorable_estimate_system_id: "hi_lo" as const,
      },
    };

    const updated = registerCountingCard(
      withDeepAnalysis,
      "5",
      "2026-06-15T00:00:00.000Z",
    );

    expect(updated.playerHand).toEqual([]);
    expect(updated.dealerCards).toEqual([]);
    expect(updated.cardHistory).toEqual([
      {
        value: "5",
        inputMode: "seen-card",
        destination: "counting-only",
        addedToPlayerHand: false,
        addedToDealerCards: false,
        sequence: 1,
        timestamp: "2026-06-15T00:00:00.000Z",
      },
    ]);
    expect(updated.decisionAnalysis).toBeNull();
    expect(updated.isDecisionAnalysisStale).toBeFalse();
    expect(updated.isDeepAnalysisStale).toBeTrue();
  });

  it("marks decision analysis as stale when registering counting-only seen cards", () => {
    const decisionAnalysis = {} as AnalyzeHandResponse;
    const updated = registerCountingCard(
      {
        ...createInitialCountingDashboardState(),
        decisionAnalysis,
        isDecisionAnalysisStale: false,
      },
      "6",
      "2026-06-15T00:00:00.000Z",
    );

    expect(updated.decisionAnalysis).toBe(decisionAnalysis);
    expect(updated.isDecisionAnalysisStale).toBeTrue();
  });

  it("registers player/dealer mode by appending cards to hypothetical hand and sequence history", () => {
    const playerModeState = setCountingInputMode(
      {
        ...createInitialCountingDashboardState(),
        decisionAnalysis: {} as AnalyzeHandResponse,
        isDecisionAnalysisStale: true,
      },
      "player",
    );
    const afterPlayerCard = registerCountingCard(
      playerModeState,
      "8",
      "2026-06-15T00:00:01.000Z",
    );

    expect(afterPlayerCard.playerHand).toEqual(["8"]);
    expect(afterPlayerCard.dealerCards).toEqual([]);
    expect(afterPlayerCard.decisionAnalysis).toBeNull();
    expect(afterPlayerCard.isDecisionAnalysisStale).toBeFalse();
    expect(afterPlayerCard.cardHistory[0]).toEqual({
      value: "8",
      inputMode: "player",
      destination: "player",
      addedToPlayerHand: true,
      addedToDealerCards: false,
      sequence: 1,
      timestamp: "2026-06-15T00:00:01.000Z",
    });

    const dealerModeState = setCountingInputMode(afterPlayerCard, "dealer");
    const afterDealerCard = registerCountingCard(
      dealerModeState,
      "10",
      "2026-06-15T00:00:02.000Z",
    );

    expect(afterDealerCard.playerHand).toEqual(["8"]);
    expect(afterDealerCard.dealerCards).toEqual(["10"]);
    expect(afterDealerCard.cardHistory[1]).toEqual({
      value: "10",
      inputMode: "dealer",
      destination: "dealer",
      addedToPlayerHand: false,
      addedToDealerCards: true,
      sequence: 2,
      timestamp: "2026-06-15T00:00:02.000Z",
    });
  });

  it("returns an error when undo is called without history", () => {
    const state = createInitialCountingDashboardState();

    const undone = undoLastCountingCard(state);

    expect(undone.ok).toBeFalse();
    expect(undone.error).toContain("No counting card history to undo");
    expect(undone.state).toBe(state);
  });

  it("undoes seen-card history without mutating hypothetical hands", () => {
    const decisionAnalysis = {} as AnalyzeHandResponse;
    const state = registerCountingCard(
      {
        ...createInitialCountingDashboardState(),
        decisionAnalysis,
      },
      "5",
      "2026-06-15T00:00:00.000Z",
    );

    const undone = undoLastCountingCard(state);

    expect(undone.ok).toBeTrue();
    expect(undone.undoneEntry?.value).toBe("5");
    expect(undone.state.cardHistory).toEqual([]);
    expect(undone.state.playerHand).toEqual([]);
    expect(undone.state.dealerCards).toEqual([]);
    expect(undone.state.decisionAnalysis).toBe(decisionAnalysis);
    expect(undone.state.isDecisionAnalysisStale).toBeTrue();
  });

  it("undoes player/dealer history and removes only the latest matching occurrence", () => {
    const playerMode = setCountingInputMode(createInitialCountingDashboardState(), "player");
    const firstPlayer = registerCountingCard(playerMode, "8", "2026-06-15T00:00:01.000Z");
    const secondPlayer = registerCountingCard(firstPlayer, "8", "2026-06-15T00:00:02.000Z");

    const afterPlayerUndo = undoLastCountingCard(secondPlayer);

    expect(afterPlayerUndo.ok).toBeTrue();
    expect(afterPlayerUndo.state.playerHand).toEqual(["8"]);
    expect(afterPlayerUndo.state.cardHistory.length).toBe(1);

    const dealerMode = setCountingInputMode(afterPlayerUndo.state, "dealer");
    const withDealer = registerCountingCard(dealerMode, "10", "2026-06-15T00:00:03.000Z");
    const afterDealerUndo = undoLastCountingCard(withDealer);

    expect(afterDealerUndo.ok).toBeTrue();
    expect(afterDealerUndo.state.dealerCards).toEqual([]);
    expect(afterDealerUndo.state.playerHand).toEqual(["8"]);
    expect(afterDealerUndo.state.cardHistory.length).toBe(1);
  });

  it("does not fail when undoing after hypothetical hands were manually cleared", () => {
    const stateWithCards = {
      ...registerCountingCard(
        setCountingInputMode(createInitialCountingDashboardState(), "player"),
        "7",
        "2026-06-15T00:00:04.000Z",
      ),
      playerHand: [],
      dealerCards: [],
      deepAnalysis: {
        cards_seen: 1,
        cards_remaining: 311,
        decks_remaining: 5.9808,
        bankroll: 1000,
        minimum_bet: 10,
        policy: {
          policy_id: "test",
          policy_label: "Test",
        },
        systems: [],
        most_favorable_estimate_system_id: "hi_lo" as const,
      },
      isDeepAnalysisStale: false,
    };

    const undone = undoLastCountingCard(stateWithCards);

    expect(undone.ok).toBeTrue();
    expect(undone.state.cardHistory).toEqual([]);
    expect(undone.state.playerHand).toEqual([]);
    expect(undone.state.dealerCards).toEqual([]);
    expect(undone.state.isDeepAnalysisStale).toBeTrue();
  });
});
