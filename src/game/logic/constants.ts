// Numbers from reference/times-tables.html. See docs/behavior-inventory.md.

export const MIN = 2;                 // no ×1 problems: too easy
export const MAX = 12;
export const RARE_CHANCE = 0.05;
export const REVIEW_AFTER = 3;        // problems since the last review before another can come up
export const REVIEW_CHANCE = 0.55;
export const MISS_OWED = 2;           // a miss sets the fact to owe this many (sets, not adds)
export const NO_REPEAT_TRIES = 12;
export const MAX_DIGITS = 3;
export const RESPONSE_CAP_MS = 60_000;

export const DELAY = {
  nextRare: 1100,
  nextNew: 820,
  nextRepeat: 660,
  nextInQuest: 520,
  winScreen: 700,
  endAfterClaim: 900,
  flyCleanup: 560,
} as const;
