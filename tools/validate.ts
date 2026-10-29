// Level validation CLI (story B4). Wired into `npm run build` and CI.
// Until the parser (B1) and solver (B3) land, this only checks that the
// level directories exist and reports the .lvl files found.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LEVEL_DIRS = ['levels/tutorial', 'levels/daily'];

let count = 0;
for (const dir of LEVEL_DIRS) {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    console.error(`missing level directory: ${dir}`);
    process.exit(1);
  }
  for (const entry of entries) {
    if (entry.endsWith('.lvl') && statSync(join(dir, entry)).isFile()) {
      count += 1;
      console.log(`found ${dir}/${entry}`);
    }
  }
}

console.log(`validate: ${count} level file(s) found`);
