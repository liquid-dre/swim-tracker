/*
  Which row each threshold label sits on, so near-neighbours do not overlap.

  Gala cuts for one event at one age sit close together by nature: a
  14-year-old's L2/L3/SANJ 100 Free cuts land within a few seconds of each
  other, which at plot scale is a few dozen pixels, against labels roughly 60px
  wide. On one row they collide in exactly the case the overlay exists for.

  Alternating by INDEX was the obvious fix and the wrong one — with three
  thresholds, indices 0 and 2 land on the same row, which is the /compare case
  precisely. Comparing positions handles any count, and leaves well-spaced
  labels all on row 0, where they read best.
*/

/** Rough width of a `◆ SANJ`-sized label; below this two labels touch. */
export const LABEL_MIN_GAP = 64;

/** Number of rows available above the plot. */
const ROWS = 2;

/**
 * @param positions Label centres along the value axis, ASCENDING.
 * @returns The row index for each position, in the same order.
 */
export function assignLabelRows(
  positions: ReadonlyArray<number>,
  minGap: number = LABEL_MIN_GAP,
): number[] {
  const lastOnRow = new Array<number>(ROWS).fill(-Infinity);

  return positions.map((at) => {
    for (let row = 0; row < ROWS; row++) {
      if (at - lastOnRow[row] >= minGap) {
        lastOnRow[row] = at;
        return row;
      }
    }
    // Too crowded for either row: take the one with more room behind it, so the
    // overlap that cannot be avoided is at least the smallest one available.
    const row = lastOnRow[0] <= lastOnRow[1] ? 0 : 1;
    lastOnRow[row] = at;
    return row;
  });
}
