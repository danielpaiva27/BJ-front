import { BlackjackTableState, CardValue } from "../models/blackjack-table.models";
import {
  LiveCountingStatus,
  LiveCountingSystemId,
  LiveCountingSystemSummary,
} from "../models/counting-dashboard.models";
import { getTotalRemainingCards } from "./blackjack-table.utils";

interface CountingSystemDefinition {
  system: LiveCountingSystemId;
  label: string;
  cardValues: Record<CardValue, number>;
  notes?: string[];
  usesAceSideCount?: boolean;
  valueDivisor?: number;
}

const HI_LO_VALUES: Record<CardValue, number> = {
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

const HI_OPT_II_VALUES: Record<CardValue, number> = {
  "2": 1,
  "3": 1,
  "4": 2,
  "5": 2,
  "6": 1,
  "7": 1,
  "8": 0,
  "9": 0,
  "10": -2,
  A: 0,
};

const WONG_HALVES_HALF_UNIT_VALUES: Record<CardValue, number> = {
  "2": 1,
  "3": 2,
  "4": 2,
  "5": 3,
  "6": 2,
  "7": 1,
  "8": 0,
  "9": -1,
  "10": -2,
  A: -2,
};

const COUNTING_SYSTEMS: CountingSystemDefinition[] = [
  {
    system: "hi-lo",
    label: "Hi-Lo",
    cardValues: HI_LO_VALUES,
    notes: ["Sistema balanceado", "Atualizado conforme cartas vistas"],
  },
  {
    system: "hi-opt-ii",
    label: "Hi-Opt II",
    cardValues: HI_OPT_II_VALUES,
    notes: ["Sistema balanceado", "Ace side count separado"],
    usesAceSideCount: true,
  },
  {
    system: "wong-halves",
    label: "Wong Halves",
    cardValues: WONG_HALVES_HALF_UNIT_VALUES,
    notes: ["Sistema balanceado", "Meias unidades calculadas internamente"],
    valueDivisor: 2,
  },
];

export function computeLiveCountingSystems(
  state: BlackjackTableState,
): LiveCountingSystemSummary[] {
  const cardsRemaining = Math.max(0, getTotalRemainingCards(state));
  const decksRemaining = Number((cardsRemaining / 52).toFixed(4));
  const aceCount = getAceSideCount(state);

  return COUNTING_SYSTEMS.map((definition) => {
    const runningCount = computeRunningCount(state.seenCards, definition);
    const trueCount = computeTrueCount(runningCount, decksRemaining);

    return {
      system: definition.system,
      label: definition.label,
      runningCount,
      trueCount,
      cardsRemaining,
      decksRemaining,
      status: resolveCountingStatus(trueCount, runningCount),
      notes: definition.notes ? [...definition.notes] : undefined,
      aceSideCount: definition.usesAceSideCount ? aceCount : undefined,
    };
  });
}

function computeRunningCount(
  seenCards: CardValue[],
  definition: CountingSystemDefinition,
): number {
  const rawCount = seenCards.reduce(
    (total, cardValue) => total + definition.cardValues[cardValue],
    0,
  );

  return definition.valueDivisor ? rawCount / definition.valueDivisor : rawCount;
}

function computeTrueCount(runningCount: number, decksRemaining: number): number | null {
  if (decksRemaining <= 0) {
    return null;
  }

  const trueCount = runningCount / decksRemaining;
  return Number.isFinite(trueCount) ? Number(trueCount.toFixed(4)) : null;
}

function resolveCountingStatus(
  trueCount: number | null,
  runningCount: number,
): LiveCountingStatus {
  const statusBasis = trueCount ?? runningCount;

  if (statusBasis > 0.5) {
    return "favorable";
  }

  if (statusBasis < -0.5) {
    return "unfavorable";
  }

  return "neutral";
}

function getAceSideCount(state: BlackjackTableState) {
  const aceShoeCount = state.shoeCounts.find((item) => item.value === "A");
  const remainingAces = aceShoeCount?.count ?? 0;
  const initialAces = aceShoeCount?.initialCount ?? remainingAces;

  return {
    seenAces: Math.max(0, initialAces - remainingAces),
    remainingAces,
  };
}
