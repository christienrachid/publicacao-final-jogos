// Port of JSBSim src/math/FGTable.cpp (linear/bilinear lookup); LGPL-2.1, JSBSim-Team.
export interface Table2D {
  rows: number[];
  columns: number[];
  values: number[][];
}

function interval(axis: number[], value: number): number {
  let i = 0;
  while (i < axis.length - 2 && value > axis[i + 1]) i++;
  return i;
}

function fraction(a: number, b: number, value: number): number {
  return Math.max(0, Math.min(1, (value - a) / (b - a)));
}

export function lookup1(table: number[][], value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Non-finite table input');
  let i = 0;
  while (i < table.length - 2 && value > table[i + 1][0]) i++;
  const t = fraction(table[i][0], table[i + 1][0], value);
  return table[i][1] + t * (table[i + 1][1] - table[i][1]);
}

export function lookup2(table: Table2D, row: number, column: number): number {
  if (!Number.isFinite(row) || !Number.isFinite(column)) throw new RangeError('Non-finite table input');
  const r = interval(table.rows, row);
  const c = interval(table.columns, column);
  const tr = fraction(table.rows[r], table.rows[r + 1], row);
  const tc = fraction(table.columns[c], table.columns[c + 1], column);
  const a = table.values[r][c] + tc * (table.values[r][c + 1] - table.values[r][c]);
  const b = table.values[r + 1][c] + tc * (table.values[r + 1][c + 1] - table.values[r + 1][c]);
  return a + tr * (b - a);
}
