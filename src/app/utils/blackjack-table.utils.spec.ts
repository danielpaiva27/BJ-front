import { CardValue } from "../models/blackjack-table.models";
import {
  buildAnalyzeHandRequest,
  createInitialShoeCounts,
  createInitialTableState,
  getTotalRemainingCards,
  registerCardAction,
  resetRound,
  resetShoe,
  undoLastRegisteredCard,
} from "./blackjack-table.utils";

describe("blackjack-table.utils", () => {
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
    expect(result.state.playerCards).toEqual(["A"]);
    expect(result.state.history.length).toBe(1);
    expect(result.state.shoeCounts.find((item) => item.value === "A")?.count).toBe(3);
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

    const reset = resetRound(withDealer);

    expect(reset.playerCards).toEqual([]);
    expect(reset.dealerUpcard).toBeNull();
    expect(reset.dealerRevealedCards).toEqual([]);
    expect(reset.shoeCounts.find((item) => item.value === "10")?.count).toBe(15);
    expect(reset.shoeCounts.find((item) => item.value === "A")?.count).toBe(3);
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

  it("returns null payload when state is not ready", () => {
    const state = createInitialTableState(1);
    const payload = buildAnalyzeHandRequest(state);

    expect(payload).toBeNull();
  });
});
