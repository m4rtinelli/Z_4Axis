/**
 * rng.js - a seeded generator, because the cut has to be reproducible.
 *
 * Math.random() would be the obvious way to cut a rectangle at random, and
 * it would make the feature impossible: the layout is recomputed on every
 * frame, so an unseeded generator would reshuffle the composition sixty
 * times a second while you dragged the divider.
 *
 * Holding a seed instead means the subdivision is a PURE FUNCTION of
 * (seed, count, region). Nothing about the cut is stored - not one
 * rectangle - and yet it is stable across redraws, identical for the same
 * seed, and free to re-solve itself when the region changes shape. The
 * button that recuts does not generate geometry; it picks a new number.
 */

/** mulberry32 - small, fast, and good enough for laying out boxes. */
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newSeed = () => (Math.random() * 0xffffffff) >>> 0;
