import { LiveCountingSystemSummary } from "../models/counting-dashboard.models";
import {
  createInitialTableState,
  registerCardAction,
  resetShoe,
  undoLastRegisteredCard,
} from "./blackjack-table.utils";
import { computeLiveCountingSystems } from "./card-counting-systems.utils";

describe("card-counting-systems.utils", () => {
  function getSystem(
    summaries: LiveCountingSystemSummary[],
    system: LiveCountingSystemSummary["system"],
  ): LiveCountingSystemSummary {
    const summary = summaries.find((item) => item.system === system);
    expect(summary).withContext(`${system} summary should exist`).toBeDefined();
    return summary as LiveCountingSystemSummary;
  }

  it("initializes all live counting systems from a neutral shoe", () => {
    const state = createInitialTableState(6);
    const summaries = computeLiveCountingSystems(state);

    expect(getSystem(summaries, "hi-lo").runningCount).toBe(0);
    expect(getSystem(summaries, "hi-opt-ii").runningCount).toBe(0);
    expect(getSystem(summaries, "wong-halves").runningCount).toBe(0);
    expect(getSystem(summaries, "hi-opt-ii").aceSideCount).toEqual({
      seenAces: 0,
      remainingAces: 24,
    });
  });

  it("computes 2, 5, 10, A across Hi-Lo, Hi-Opt II and Wong Halves", () => {
    let state = createInitialTableState(1);

    for (const card of ["2", "5", "10", "A"] as const) {
      state = registerCardAction(state, card, "seen").state;
    }

    const summaries = computeLiveCountingSystems(state);

    expect(getSystem(summaries, "hi-lo").runningCount).toBe(0);
    expect(getSystem(summaries, "hi-opt-ii").runningCount).toBe(1);
    expect(getSystem(summaries, "hi-opt-ii").aceSideCount).toEqual({
      seenAces: 1,
      remainingAces: 3,
    });
    expect(getSystem(summaries, "wong-halves").runningCount).toBe(0);
  });

  it("differentiates systems for 3, 4, 7, 9", () => {
    let state = createInitialTableState(1);

    for (const card of ["3", "4", "7", "9"] as const) {
      state = registerCardAction(state, card, "seen").state;
    }

    const summaries = computeLiveCountingSystems(state);

    expect(getSystem(summaries, "hi-lo").runningCount).toBe(2);
    expect(getSystem(summaries, "hi-opt-ii").runningCount).toBe(4);
    expect(getSystem(summaries, "wong-halves").runningCount).toBe(2);
  });

  it("calculates true count from remaining decks and returns null for an empty shoe", () => {
    let state = createInitialTableState(1);
    state = registerCardAction(state, "2", "seen").state;

    const hiLo = getSystem(computeLiveCountingSystems(state), "hi-lo");

    expect(hiLo.cardsRemaining).toBe(51);
    expect(hiLo.decksRemaining).toBeCloseTo(51 / 52, 4);
    expect(hiLo.trueCount).toBeCloseTo(1 / (51 / 52), 4);

    const emptyShoeState = {
      ...state,
      shoeCounts: state.shoeCounts.map((item) => ({
        ...item,
        count: 0,
      })),
    };
    const emptyHiLo = getSystem(computeLiveCountingSystems(emptyShoeState), "hi-lo");

    expect(emptyHiLo.cardsRemaining).toBe(0);
    expect(emptyHiLo.decksRemaining).toBe(0);
    expect(emptyHiLo.trueCount).toBeNull();
  });

  it("resets live counting systems with a new shoe", () => {
    let state = createInitialTableState(6);
    state = registerCardAction(state, "2", "seen").state;
    state = registerCardAction(state, "A", "seen").state;

    const reset = resetShoe(state);
    const summaries = computeLiveCountingSystems(reset);

    expect(getSystem(summaries, "hi-lo").runningCount).toBe(0);
    expect(getSystem(summaries, "hi-opt-ii").runningCount).toBe(0);
    expect(getSystem(summaries, "wong-halves").runningCount).toBe(0);
    expect(getSystem(summaries, "hi-opt-ii").aceSideCount).toEqual({
      seenAces: 0,
      remainingAces: 24,
    });
  });

  it("updates all systems after undoing a seen card", () => {
    let state = createInitialTableState(1);
    state = registerCardAction(state, "2", "seen").state;
    state = registerCardAction(state, "5", "seen").state;
    state = registerCardAction(state, "10", "seen").state;

    state = undoLastRegisteredCard(state).state;

    const summaries = computeLiveCountingSystems(state);

    expect(getSystem(summaries, "hi-lo").runningCount).toBe(2);
    expect(getSystem(summaries, "hi-opt-ii").runningCount).toBe(3);
    expect(getSystem(summaries, "wong-halves").runningCount).toBe(2);
  });
});
