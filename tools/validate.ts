// Level validation CLI (story B4) — the Gate 1 build gate, wired into
// `npm run validate`, `npm run build` and CI. For every .lvl file under
// levels/ it:
//   1. parses it with the strict parser from src/core/level.ts (a malformed
//      file is reported with its file and 1-based line);
//   2. checks that every patrol / camera / laser period divides
//      YAP_TICK_PERIOD (24), so the world repeats at least every 24 ticks;
//   3. checks that the start cell is not seen at tick 0 (the build rejects
//      such files — Gate 1 spec, "Level format");
//   4. checks solvability with the solver from src/core/solver.ts (a level
//      that cannot be cleared within YAP_MAX_TICKS ticks fails);
// and, when everything is valid, compiles the generated levels/levels.json
// through tools/compile-levels.ts (never hand-edited).
//
// Any problem exits non-zero, so CI fails on an unsolvable level, a malformed
// level, or a period that does not divide 24.
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  parseLevel,
  YAP_TICK_PERIOD,
  YapLevelError,
  type YapCamera,
  type YapGuard,
  type YapLaser,
  type YapLevel,
} from '../src/core/level';
import { createInitialState } from '../src/core/sim';
import { solveLevel, YapSolverError } from '../src/core/solver';
import {
  collectLevelSources,
  compileLevels,
  writeLevelsJson,
  YAP_LEVEL_DIRS,
  type YapLevelEntry,
} from './compile-levels';

/** One validation problem, with the 1-based source line (0 = whole file). */
export interface YapValidationIssue {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

/** Format an issue like a compiler diagnostic: "file:line: message". */
export function formatIssue(issue: YapValidationIssue): string {
  const at = issue.line > 0 ? `${issue.file}:${issue.line}` : issue.file;
  return `${at}: ${issue.message}`;
}

/** Patrol period of a guard in ticks (loop: route length, pingpong: out and back). */
export function guardPeriod(guard: YapGuard): number {
  return guard.mode === 'loop'
    ? guard.route.length
    : guard.route.length >= 2
      ? 2 * guard.route.length - 2
      : 1;
}

/** Camera cycle period in ticks (hold per direction). */
export function cameraPeriod(camera: YapCamera): number {
  return camera.hold * camera.dirs.length;
}

/** Laser cycle period in ticks (on + off). */
export function laserPeriod(laser: YapLaser): number {
  return laser.on + laser.off;
}

/**
 * Check that every patrol / camera / laser period of a parsed level divides
 * YAP_TICK_PERIOD. The strict parser already rejects bad periods with a line
 * number; this is the gate's own check on the typed level (defense in depth,
 * and the path exercised for levels built programmatically).
 */
export function checkEntityPeriods(level: YapLevel, file: string): YapValidationIssue[] {
  const issues: YapValidationIssue[] = [];
  for (const guard of level.guards) {
    const period = guardPeriod(guard);
    if (period <= 0 || YAP_TICK_PERIOD % period !== 0) {
      issues.push({
        file,
        line: 0,
        message: `guard "${guard.id}" period ${period} does not divide ${YAP_TICK_PERIOD}`,
      });
    }
  }
  for (const camera of level.cameras) {
    const period = cameraPeriod(camera);
    if (period <= 0 || YAP_TICK_PERIOD % period !== 0) {
      issues.push({
        file,
        line: 0,
        message: `camera "${camera.id}" period ${period} (hold ${camera.hold} x ${camera.dirs.length} dirs) does not divide ${YAP_TICK_PERIOD}`,
      });
    }
  }
  for (const laser of level.lasers) {
    const period = laserPeriod(laser);
    if (period <= 0 || YAP_TICK_PERIOD % period !== 0) {
      issues.push({
        file,
        line: 0,
        message: `laser "${laser.id}" period ${period} (on ${laser.on} + off ${laser.off}) does not divide ${YAP_TICK_PERIOD}`,
      });
    }
  }
  return issues;
}

/** True when the start cell is seen by a guard or camera, or on an active laser, at tick 0. */
export function startSeenAtTick0(level: YapLevel): boolean {
  const state = createInitialState(level);
  const s = level.start;
  const sameCell = (c: { x: number; y: number }): boolean => c.x === s.x && c.y === s.y;
  if (state.guards.some((g) => g.seen.some(sameCell))) return true;
  if (state.cameras.some((c) => c.seen.some(sameCell))) return true;
  return state.lasers.some((l) => l.active && l.cells.some(sameCell));
}

/**
 * Validate one parsed level: periods divide 24, start not seen at tick 0,
 * solvable within YAP_MAX_TICKS ticks. Returns the issues (empty = valid).
 */
export function validateLevel(level: YapLevel, file: string): YapValidationIssue[] {
  const issues = checkEntityPeriods(level, file);
  if (startSeenAtTick0(level)) {
    issues.push({
      file,
      line: 0,
      message: `the start [${level.start.x}, ${level.start.y}] is seen at tick 0`,
    });
  }
  try {
    solveLevel(level);
  } catch (e) {
    if (e instanceof YapSolverError) {
      issues.push({ file, line: 0, message: e.message });
    } else {
      throw e;
    }
  }
  return issues;
}

export interface YapLevelCheck {
  /** The parsed level, null when parsing failed. */
  readonly level: YapLevel | null;
  readonly issues: readonly YapValidationIssue[];
}

/** Parse and validate one .lvl source string. */
export function validateLevelSource(source: string, file: string): YapLevelCheck {
  let level: YapLevel;
  try {
    level = parseLevel(source, file);
  } catch (e) {
    if (e instanceof YapLevelError) {
      return { level: null, issues: [{ file, line: e.line, message: e.rawMessage }] };
    }
    throw e;
  }
  return { level, issues: validateLevel(level, file) };
}

export interface YapValidationResult {
  /** Entries that passed every check, in scan order. */
  readonly entries: readonly YapLevelEntry[];
  readonly issues: readonly YapValidationIssue[];
}

/** Validate every .lvl file under `dirs` (default: the shipped levels/). */
export function validateAllLevels(dirs: readonly string[] = YAP_LEVEL_DIRS): YapValidationResult {
  const entries: YapLevelEntry[] = [];
  const issues: YapValidationIssue[] = [];
  for (const source of collectLevelSources(dirs)) {
    const check = validateLevelSource(source.source, source.file);
    if (check.issues.length > 0 || check.level === null) {
      issues.push(...check.issues);
      continue;
    }
    entries.push({ id: source.id, file: source.file, level: check.level });
  }
  return { entries, issues };
}

function main(): void {
  const { entries, issues } = validateAllLevels();
  for (const entry of entries) {
    const level = entry.level;
    const solved = solveLevel(level);
    console.log(
      `ok ${entry.file} — ${level.name} (type ${level.type}, par ${level.par}, ` +
        `solver par ${solved.par}, ${level.guards.length} guard(s), ` +
        `${level.cameras.length} camera(s), ${level.lasers.length} laser(s))`,
    );
  }
  for (const issue of issues) {
    console.error(`error ${formatIssue(issue)}`);
  }
  if (issues.length > 0) {
    console.error(`validate: ${issues.length} problem(s) — no levels.json written`);
    process.exitCode = 1;
    return;
  }
  const path = writeLevelsJson(compileLevels([...entries]));
  console.log(`validate: ${entries.length} level file(s) valid, compiled ${path}`);
}

const invokedAsScript =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) main();
