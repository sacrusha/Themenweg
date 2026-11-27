// The leg geometry walking help leans on (geo.ts onLine): where a walker is
// along a line, and that a line passing close to itself keeps them on their
// fold; and where the map cuts a line that passes beneath something
// (underPieces). Run by `npm test` (node --test).

import { test } from "node:test";
import assert from "node:assert/strict";
import { distance, onLine, toLocal, underPieces } from "../app/geo.ts";
import type { LngLat } from "../app/trail-types.ts";

const O: LngLat = [10, 46];
/** The point x metres east and y metres north of O. */
function at(x: number, y: number): LngLat {
  return [O[0] + x / (111_132 * Math.cos((O[1] * Math.PI) / 180)), O[1] + y / 111_132];
}
const near = (a: number, b: number, tol = 0.1) => assert.ok(Math.abs(a - b) < tol, `${a} is not within ${tol} of ${b}`);

// A switchback: 50 m east, then back west 3 m further north (along 0–50, 50–53, 53–103).
const fold: LngLat[] = [at(0, 0), at(50, 0), at(50, 3), at(0, 3)];

test("toLocal reads the test grid back", () => {
  const [x, y] = toLocal(O, at(30, -20));
  near(x, 30);
  near(y, -20);
});

test("onLine without a history takes the nearest fold", () => {
  const o = onLine(at(25, 1), fold, 30)!;
  near(o.along, 25);
  near(o.off, 1);
  near(o.length, 103);
});

test("onLine keeps the fold the walker was on against a slightly nearer one", () => {
  // On the way back (along 78 above x = 25), a fix 1 m nearer the outward fold.
  const o = onLine(at(25, 1), fold, 30, 75)!;
  near(o.along, 78);
  near(o.off, 2);
});

test("onLine lets a real move along the line win over the history", () => {
  const o = onLine(at(40, 0), fold, 30, 10)!;
  near(o.along, 40);
  near(o.off, 0);
});

test("onLine's point ahead stops at the line's end", () => {
  const o = onLine(at(10, 3), fold, 30, 90)!; // along 93; 30 m ahead passes the end at 103
  const [x, y] = toLocal(O, o.ahead);
  near(x, 0);
  near(y, 3);
});

test("underPieces cuts at the stretches beneath, also across a vertex and from the start", () => {
  const line = [at(0, 0), at(50, 0), at(100, 0)];
  const length = (l: LngLat[]) => l.slice(1).reduce((sum, p, i) => sum + distance(l[i], p), 0);
  const pieces = underPieces(line, [[10, 20], [45, 60]]);
  assert.deepEqual(pieces.map((p) => p.under), [false, true, false, true, false]);
  [10, 10, 25, 15, 40].forEach((m, i) => near(length(pieces[i].line), m, 0.5));
  assert.equal(pieces[3].line.length, 3); // through the vertex at 50 m
  assert.deepEqual(underPieces(line, [[0, 5]]).map((p) => p.under), [true, false]);
});
