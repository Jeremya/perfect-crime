// Tests for story B4 — the validate CLI gate and the levels.json compiler.
//
// Acceptance criteria (Gate 1 spec): the gate fails on an unsolvable level,
// a malformed level, or a period that does not divide 24. The negative
// fixtures live in tests/fixtures/validate/ and are scanned through the same
// validateAllLevels() entry point the CLI uses.
import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseLevel, YAP_TICK_PERIOD, type YapLevel } from '../../src/core/level';
import { solveLevel } from '../../src/core/solver';
import {
  collectLevelSources,
  compileLevels,
  loadLevelEntries,
  serializeLevels,
  YAP_LEVEL_DIRS,
  YAP_LEVELS_JSON_PATH,
  type YapCompiledLevels,
} from '../../tools/compile-levels';
import {
  cameraPeriod,
  checkEntityPeriods,
  formatIssue,
  guardPeriod,
  laserPeriod,
  startSeenAtTick0,
  validateAllLevels,
  validateLevel,
  validateLevelSource,
} from '../../tools/validate';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES_DIR = join(ROOT, 'tests/fixtures/validate');
const SHIPPED_DIRS = YAP_LEVEL_DIRS.map((d) => join(ROOT, d));

function fixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}

/** A minimal valid level source (same map as the tutorial). */
const VALID_MAP = [
  '########',
  '#S.....#',
  '#......#',
  '#......#',
  '#......#',
  '##.##.##',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#..L..E#',
  '########',
];

function validSource(extra: readonly string[] = []): string {
  return [
    'name: Test',
    'type: tutorial',
    'moment: ""',
    'maxPauses: 3',
    'par: 18',
    'map: |',
    ...VALID_MAP.map((row) => `  ${row}`),
    ...extra,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Shipped levels: everything under levels/ must pass the gate
// ---------------------------------------------------------------------------

describe('validate — shipped levels', () => {
  it('finds the .lvl files of levels/ in sorted order', () => {
    const sources = collectLevelSources(SHIPPED_DIRS);
    const ids = sources.map((s) => s.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids[0]).toBe('tutorial/t1');
    expect(sources[0]?.file).toContain('t1.lvl');
    // Sorted within each directory, directories in YAP_LEVEL_DIRS order.
    for (const dir of YAP_LEVEL_DIRS) {
      const inDir = ids.filter((id) => id.startsWith(`${basename(dir)}/`));
      expect(inDir).toEqual([...inDir].sort());
    }
  });

  it('accepts every shipped .lvl with zero issues', () => {
    const { entries, issues } = validateAllLevels(SHIPPED_DIRS);
    expect(issues).toEqual([]);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.map((e) => e.id)).toContain('tutorial/t1');
  });

  it('reports the solver par of each shipped level', () => {
    const { entries } = validateAllLevels(SHIPPED_DIRS);
    for (const entry of entries) {
      const solved = solveLevel(entry.level);
      expect(solved.par).toBeGreaterThanOrEqual(1);
      expect(validateLevel(entry.level, entry.file)).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Negative fixtures: the gate must fail loudly, with file and line
// ---------------------------------------------------------------------------

describe('validate — negative fixtures', () => {
  it('rejects a malformed level with its file and line', () => {
    const file = join(FIXTURES_DIR, 'malformed.lvl');
    const { level, issues } = validateLevelSource(fixture('malformed.lvl'), file);
    expect(level).toBeNull();
    expect(issues).toHaveLength(1);
    const issue = issues[0];
    expect(issue?.file).toBe(file);
    expect(issue?.line).toBe(11); // the 7-character map row
    expect(issue?.message).toContain('exactly 8 characters');
    expect(formatIssue(issue!)).toBe(`${file}:11: ${issue?.message}`);
  });

  it('rejects a period that does not divide 24, with file and line', () => {
    const file = join(FIXTURES_DIR, 'bad-period.lvl');
    const { issues } = validateLevelSource(fixture('bad-period.lvl'), file);
    expect(issues).toHaveLength(1);
    const issue = issues[0];
    expect(issue?.line).toBe(24); // the "on: 5" line
    expect(issue?.message).toContain('does not divide 24');
    expect(issue?.message).toContain('period 7');
  });

  it('rejects an unsolvable level (solver cannot clear it in 64 ticks)', () => {
    const file = join(FIXTURES_DIR, 'unsolvable.lvl');
    const { level, issues } = validateLevelSource(fixture('unsolvable.lvl'), file);
    expect(level).not.toBeNull(); // parses fine — it is the solver that rejects it
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('cannot be cleared within 64 ticks');
    expect(issues[0]?.file).toBe(file);
  });

  it('rejects a level whose start is seen at tick 0', () => {
    const file = join(FIXTURES_DIR, 'start-seen.lvl');
    const { level, issues } = validateLevelSource(fixture('start-seen.lvl'), file);
    expect(level).not.toBeNull();
    expect(startSeenAtTick0(level!)).toBe(true);
    expect(issues.some((i) => i.message.includes('seen at tick 0'))).toBe(true);
  });

  it('validateAllLevels reports every fixture and accepts none of them', () => {
    const { entries, issues } = validateAllLevels([FIXTURES_DIR]);
    expect(entries).toEqual([]);
    expect(issues.map((i) => i.file).sort()).toEqual(
      ['bad-period.lvl', 'malformed.lvl', 'start-seen.lvl', 'unsolvable.lvl'].map((n) =>
        join(FIXTURES_DIR, n),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Period checks on typed levels (patrol / camera / laser)
// ---------------------------------------------------------------------------

describe('validate — entity periods divide 24', () => {
  const route5 = [
    { x: 1, y: 2 },
    { x: 2, y: 2 },
    { x: 3, y: 2 },
    { x: 4, y: 2 },
    { x: 5, y: 2 },
  ];

  it('computes guard, camera and laser periods', () => {
    expect(guardPeriod({ id: 'g', route: route5, mode: 'loop', phase: 0, range: 3 })).toBe(5);
    expect(guardPeriod({ id: 'g', route: route5, mode: 'pingpong', phase: 0, range: 3 })).toBe(8);
    expect(
      cameraPeriod({ id: 'c', at: { x: 0, y: 1 }, dirs: ['N', 'E'], hold: 3, phase: 0, range: 3 }),
    ).toBe(6);
    expect(laserPeriod({ id: 'l', cells: [{ x: 1, y: 9 }], on: 2, off: 2, phase: 0 })).toBe(4);
  });

  it('flags a guard patrol period that does not divide 24', () => {
    const base = parseLevel(validSource());
    const level: YapLevel = {
      ...base,
      guards: [{ id: 'g1', route: route5, mode: 'loop', phase: 0, range: 3 }],
    };
    const issues = checkEntityPeriods(level, 'x.lvl');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('guard "g1" period 5 does not divide 24');
  });

  it('flags a camera period that does not divide 24', () => {
    const base = parseLevel(validSource());
    const level: YapLevel = {
      ...base,
      cameras: [{ id: 'c1', at: { x: 0, y: 1 }, dirs: ['N', 'E'], hold: 5, phase: 0, range: 3 }],
    };
    const issues = checkEntityPeriods(level, 'x.lvl');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('camera "c1" period 10');
    expect(issues[0]?.message).toContain(`does not divide ${YAP_TICK_PERIOD}`);
  });

  it('flags a laser period that does not divide 24', () => {
    const base = parseLevel(validSource());
    const level: YapLevel = {
      ...base,
      lasers: [{ id: 'l1', cells: [{ x: 1, y: 9 }], on: 5, off: 2, phase: 0 }],
    };
    const issues = checkEntityPeriods(level, 'x.lvl');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('laser "l1" period 7');
  });

  it('accepts periods that divide 24 (1, 2, 3, 4, 6, 8, 12, 24)', () => {
    const base = parseLevel(validSource());
    const level: YapLevel = {
      ...base,
      guards: [{ id: 'g1', route: route5.slice(0, 4), mode: 'loop', phase: 0, range: 3 }],
      cameras: [{ id: 'c1', at: { x: 0, y: 1 }, dirs: ['E'], hold: 24, phase: 0, range: 3 }],
      lasers: [{ id: 'l1', cells: [{ x: 1, y: 9 }], on: 8, off: 4, phase: 0 }],
    };
    expect(checkEntityPeriods(level, 'x.lvl')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// compile-levels: the generated levels.json
// ---------------------------------------------------------------------------

describe('compile-levels — generated levels.json', () => {
  it('compiles every shipped .lvl into a deterministic JSON bundle', () => {
    const entries = loadLevelEntries(SHIPPED_DIRS);
    const compiled = compileLevels(entries);
    expect(compiled.format).toBe(1);
    expect(compiled.tickPeriod).toBe(24);
    expect(compiled.levels.map((l) => l.id)).toEqual(entries.map((e) => e.id));
    expect(compiled.levels[0]?.level.name).toBe('Tutorial 1');
    // Deterministic: same input, same bytes.
    const again = serializeLevels(compileLevels(loadLevelEntries(SHIPPED_DIRS)));
    expect(serializeLevels(compiled)).toBe(again);
  });

  it('serializes to parseable JSON that round-trips the parsed levels', () => {
    const entries = loadLevelEntries(SHIPPED_DIRS);
    const parsed = JSON.parse(serializeLevels(compileLevels(entries))) as YapCompiledLevels;
    expect(parsed.levels).toHaveLength(entries.length);
    for (const [i, entry] of entries.entries()) {
      expect(parsed.levels[i]?.id).toBe(entry.id);
      expect(parsed.levels[i]?.level).toEqual(JSON.parse(JSON.stringify(entry.level)));
    }
  });

  it('levels/levels.json on disk is exactly what the compiler produces (never hand-edited)', () => {
    const onDisk = readFileSync(join(ROOT, YAP_LEVELS_JSON_PATH), 'utf8');
    const fresh = serializeLevels(compileLevels(loadLevelEntries(SHIPPED_DIRS)));
    expect(onDisk).toBe(fresh);
  });
});
