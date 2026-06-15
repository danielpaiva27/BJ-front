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
  resetCountingStaleFlags,
  resetHypotheticalHandState,
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
});
