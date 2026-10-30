// Golden tests for story F2 — the five tutorial heists (Gate 1 spec, Tests:
// "Golden: for every level, simulating the optimal plan wins in exactly par
// ticks"). One golden trace per tutorial level lives next to this file as
// t<N>.json; the trace stores the solver's canonical optimal plan and
// metrics, and this test checks that (a) the trace is still up to date with
// the .lvl file and the solver, (b) the declared par equals the solver par,
// (c) simulating the golden plan wins in exactly par ticks, and (d) each
// tutorial keeps the single idea it teaches (spec, Content section).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { YapLevel } from '../../src/core/level';
import { run, type YapMove } from '../../src/core/sim';
import { solveLevel, type YapSolveResult } from '../../src/core/solver';
import { validateLevelSource } from '../../tools/validate';

/** One golden trace: the canonical optimal plan of a tutorial level. */
interface YapGoldenTrace {
  readonly level: string;
  readonly file: string;
  readonly declaredPar: number;
  readonly par: number;
  readonly minPauses: number;
  readonly tension: number;
  readonly optimalPlans: number;
  readonly plan: readonly YapMove[];
  readonly outcome: { readonly kind: 'won'; readonly tick: number };
  readonly lootTick: number | null;
}

const TUTORIAL_DIR = fileURLToPath(new URL('../../levels/tutorial/', import.meta.url));
const GOLDEN_DIR = fileURLToPath(new URL('.', import.meta.url));

/** Target par range per tutorial level (Gate 1 spec, Content — Tutorial). */
const TARGET_PAR: Record<string, readonly [number, number]> = {
  t1: [8, 12],
  t2: [10, 14],
  t3: [12, 18],
  t4: [12, 18],
  t5: [14, 20],
};

function tutorialFiles(): string[] {
  return readdirSync(TUTORIAL_DIR)
    .filter((n) => n.endsWith('.lvl'))
    .sort()
    .map((n) => join(TUTORIAL_DIR, n));
}

function loadLevel(file: string): YapLevel {
  const source = readFileSync(file, 'utf8');
  const check = validateLevelSource(source, file);
  expect(check.issues, `validate issues in ${file}`).toEqual([]);
  if (check.level === null) throw new Error(`unparseable level ${file}`);
  return check.level;
}

function loadTrace(id: string): YapGoldenTrace {
  return JSON.parse(readFileSync(join(GOLDEN_DIR, `${id}.json`), 'utf8')) as YapGoldenTrace;
}

describe('F2 — tutorial golden traces', () => {
  const files = tutorialFiles();
  it('finds exactly the five tutorial levels t1..t5', () => {
    expect(files.map((f) => f.slice(-6))).toEqual([
      't1.lvl',
      't2.lvl',
      't3.lvl',
      't4.lvl',
      't5.lvl',
    ]);
  });

  for (const file of files) {
    const id = file.slice(-6, -4); // "t1".."t5"
    it(`${id}: declared par equals the solver par, inside the spec target, and the golden plan wins in exactly par ticks`, () => {
      const level = loadLevel(file);
      const solved: YapSolveResult = solveLevel(level);

      // The declared par is what the game shows; it must be the solver's par.
      expect(level.par, `${id} declared par`).toBe(solved.par);
      const [lo, hi] = TARGET_PAR[id] ?? [1, 64];
      expect(solved.par, `${id} par in [${lo}, ${hi}]`).toBeGreaterThanOrEqual(lo);
      expect(solved.par, `${id} par in [${lo}, ${hi}]`).toBeLessThanOrEqual(hi);

      // The golden trace must be up to date with the level and the solver.
      const trace = loadTrace(id);
      expect(trace.level).toBe(`tutorial/${id}`);
      expect(trace.file).toBe(`levels/tutorial/${id}.lvl`);
      expect(trace.declaredPar).toBe(level.par);
      expect(trace.par).toBe(solved.par);
      expect(trace.minPauses).toBe(solved.minPauses);
      expect(trace.tension).toBe(solved.tension);
      expect(trace.optimalPlans).toBe(solved.optimalPlans);
      expect(trace.plan).toEqual([...solved.plan]);

      // Golden criterion: simulating the optimal plan wins in exactly par ticks.
      expect(trace.plan.length).toBe(solved.par);
      const res = run(level, trace.plan);
      expect(res.outcome).toEqual({ kind: 'won', tick: solved.par });
      expect(trace.outcome).toEqual({ kind: 'won', tick: solved.par });
      expect(res.lootTick).toBe(trace.lootTick);
    });
  }

  it('t1 teaches only the plan: no guard, camera or laser', () => {
    const level = loadLevel(join(TUTORIAL_DIR, 't1.lvl'));
    expect(level.guards).toEqual([]);
    expect(level.cameras).toEqual([]);
    expect(level.lasers).toEqual([]);
    expect(solveLevel(level).minPauses).toBe(0);
  });

  it('t2 teaches the gaze: exactly one static guard', () => {
    const level = loadLevel(join(TUTORIAL_DIR, 't2.lvl'));
    expect(level.guards.length).toBe(1);
    expect(level.guards[0]?.route.length).toBe(1);
    expect(level.guards[0]?.face).toBeDefined();
    expect(level.cameras).toEqual([]);
    expect(level.lasers).toEqual([]);
  });

  it('t3 teaches the patrol: exactly one moving guard', () => {
    const level = loadLevel(join(TUTORIAL_DIR, 't3.lvl'));
    expect(level.guards.length).toBe(1);
    expect((level.guards[0]?.route.length ?? 0) > 1).toBe(true);
    expect(level.cameras).toEqual([]);
    expect(level.lasers).toEqual([]);
  });

  it('t4 teaches the pause: one guard and a mandatory pause in the optimal plan', () => {
    const level = loadLevel(join(TUTORIAL_DIR, 't4.lvl'));
    expect(level.guards.length).toBe(1);
    expect(level.cameras).toEqual([]);
    expect(level.lasers).toEqual([]);
    expect(solveLevel(level).minPauses).toBeGreaterThanOrEqual(1);
  });

  it('t5 teaches the camera: one rotating camera plus one guard', () => {
    const level = loadLevel(join(TUTORIAL_DIR, 't5.lvl'));
    expect(level.cameras.length).toBe(1);
    expect((level.cameras[0]?.dirs.length ?? 0) > 1).toBe(true); // rotating cone
    expect(level.guards.length).toBe(1);
    expect(level.lasers).toEqual([]);
  });
});
