// Level validation CLI (stories B1/B4). Wired into `npm run build` and CI.
// Parses every .lvl file under levels/ with the strict parser from
// src/core/level.ts; any invalid file is reported with its line and fails
// the build.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseLevel, YapLevelError } from '../src/core/level';

const LEVEL_DIRS = ['levels/tutorial', 'levels/daily'];

let count = 0;
let failures = 0;
for (const dir of LEVEL_DIRS) {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    console.error(`missing level directory: ${dir}`);
    process.exit(1);
  }
  for (const entry of entries.sort()) {
    if (entry.endsWith('.lvl') && statSync(join(dir, entry)).isFile()) {
      const path = `${dir}/${entry}`;
      const source = readFileSync(join(dir, entry), 'utf8');
      try {
        const level = parseLevel(source, path);
        count += 1;
        console.log(
          `ok ${path} — ${level.name} (type ${level.type}, par ${level.par}, ` +
            `${level.guards.length} guard(s), ${level.cameras.length} camera(s), ` +
            `${level.lasers.length} laser(s))`,
        );
      } catch (e) {
        failures += 1;
        if (e instanceof YapLevelError) {
          console.error(`error ${e.message}`);
        } else {
          throw e;
        }
      }
    }
  }
}

if (failures > 0) {
  console.error(`validate: ${failures} invalid level file(s)`);
  process.exit(1);
}
console.log(`validate: ${count} level file(s) parsed`);
