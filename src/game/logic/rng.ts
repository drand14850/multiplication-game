/** A source of uniform numbers in [0, 1), like Math.random. */
export type Rng = () => number;

export const defaultRng: Rng = () => Math.random();

/** Deterministic rng for tests (mulberry32). */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
