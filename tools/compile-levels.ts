// Compile every .lvl file under levels/ into the generated levels/levels.json
// (story B4). The JSON file is machine-written only: never edit it by hand —
// edit the .lvl files and rerun `npm run validate` (which calls this compiler).
//
// The output is deterministic: directories and file names are sorted, and the
// JSON is serialized with a fixed key order, so a clean tree always compiles
// to the exact same bytes (CI checks this with `git diff --exit-code`).
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseLevel, YAP_TICK_PERIOD, YapLevelError, type YapLevel } from '../src/core/level';

/** Directories scanned for .lvl files, relative to the repository root. */
export const YAP_LEVEL_DIRS: readonly string[] = ['levels/tutorial', 'levels/daily'];
/** Where the compiled bundle is written. */
export const YAP_LEVELS_JSON_PATH = 'levels/levels.json';
/** Bump when the shape of the compiled JSON changes. */
export const YAP_LEVELS_JSON_FORMAT = 1;

/** A .lvl file on disk, before parsing. */
export interface YapLevelSource {
  /** Stable id used in levels.json, e.g. "tutorial/t1". */
  readonly id: string;
  /** Path as scanned, e.g. "levels/tutorial/t1.lvl". */
  readonly file: string;
  readonly source: string;
}

/** A parsed level ready for compilation. */
export interface YapLevelEntry {
  readonly id: string;
  readonly file: string;
  readonly level: YapLevel;
}

/** Shape of the generated levels.json. */
export interface YapCompiledLevels {
  readonly format: number;
  readonly tickPeriod: number;
  readonly levels: readonly YapCompiledLevel[];
}

export interface YapCompiledLevel {
  readonly id: string;
  readonly level: YapLevel;
}

/**
 * Scan `dirs` for .lvl files (sorted per directory, directories in order) and
 * read their sources. Throws YapLevelError when a directory is missing.
 */
export function collectLevelSources(dirs: readonly string[] = YAP_LEVEL_DIRS): YapLevelSource[] {
  const out: YapLevelSource[] = [];
  for (const dir of dirs) {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      throw new YapLevelError(`missing level directory: ${dir}`, 0, dir);
    }
    const kind = basename(dir);
    for (const name of names.sort()) {
      if (!name.endsWith('.lvl')) continue;
      const file = join(dir, name);
      if (!statSync(file).isFile()) continue;
      out.push({
        id: `${kind}/${name.slice(0, -'.lvl'.length)}`,
        file,
        source: readFileSync(file, 'utf8'),
      });
    }
  }
  return out;
}

/** Parse every collected .lvl source; the first YapLevelError propagates. */
export function loadLevelEntries(dirs: readonly string[] = YAP_LEVEL_DIRS): YapLevelEntry[] {
  return collectLevelSources(dirs).map((s) => ({
    id: s.id,
    file: s.file,
    level: parseLevel(s.source, s.file),
  }));
}

/** Build the compiled bundle from parsed entries. */
export function compileLevels(entries: readonly YapLevelEntry[]): YapCompiledLevels {
  return {
    format: YAP_LEVELS_JSON_FORMAT,
    tickPeriod: YAP_TICK_PERIOD,
    levels: entries.map((e) => ({ id: e.id, level: e.level })),
  };
}

/** Deterministic serialization: 2-space indent, trailing newline. */
export function serializeLevels(compiled: YapCompiledLevels): string {
  return `${JSON.stringify(compiled, null, 2)}\n`;
}

/** Write the compiled bundle to `path` (default levels/levels.json). */
export function writeLevelsJson(
  compiled: YapCompiledLevels,
  path: string = YAP_LEVELS_JSON_PATH,
): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeLevels(compiled));
  return path;
}

function main(): void {
  try {
    const entries = loadLevelEntries();
    const path = writeLevelsJson(compileLevels(entries));
    console.log(`compile-levels: wrote ${path} (${entries.length} level(s))`);
  } catch (e) {
    if (e instanceof YapLevelError) {
      console.error(`error ${e.message}`);
    } else {
      throw e;
    }
    process.exitCode = 1;
  }
}

const invokedAsScript =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) main();
