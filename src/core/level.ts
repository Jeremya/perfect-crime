// .lvl level format — strict parser producing typed YapLevel objects.
//
// One .lvl file per level: an ASCII map (12 rows x 8 columns, `#` wall,
// `.` floor, `S` start, `L` loot, `E` exit — each exactly once) plus entities
// in a small YAML subset (guards, cameras, lasers). Every patrol and cycle
// period must divide YAP_TICK_PERIOD so the world repeats at least every 24
// ticks (Gate 1 spec).
//
// src/core is pure and deterministic: integers only, no Math.random, no
// Date, no performance.now, no floats.

export const YAP_GRID_WIDTH = 8;
export const YAP_GRID_HEIGHT = 12;
/** Every patrol / camera / laser period must divide this (1,2,3,4,6,8,12,24). */
export const YAP_TICK_PERIOD = 24;
/** Solver bound: a level must be clearable within this many ticks. */
export const YAP_MAX_TICKS = 64;
/** Solver state space allows 0..3 pauses left. */
export const YAP_MAX_PAUSES = 3;

export type YapLevelType = 'normal' | 'signature' | 'tutorial';
export type YapDir = 'N' | 'E' | 'S' | 'W';
export type YapGuardMode = 'loop' | 'pingpong';

export interface YapCell {
  readonly x: number;
  readonly y: number;
}

export interface YapGuard {
  readonly id: string;
  readonly route: readonly YapCell[];
  readonly mode: YapGuardMode;
  readonly phase: number;
  readonly range: number;
  /** Facing for waits and static guards; required for single-cell routes. */
  readonly face?: YapDir;
}

export interface YapCamera {
  readonly id: string;
  /** Mounted on a wall cell. */
  readonly at: YapCell;
  readonly dirs: readonly YapDir[];
  readonly hold: number;
  readonly phase: number;
  readonly range: number;
}

export interface YapLaser {
  readonly id: string;
  readonly cells: readonly YapCell[];
  readonly on: number;
  readonly off: number;
  readonly phase: number;
}

export interface YapLevel {
  readonly name: string;
  readonly type: YapLevelType;
  /** One sentence; mandatory (non-empty) for signature heists. */
  readonly moment: string;
  readonly maxPauses: number;
  readonly par: number;
  readonly width: number;
  readonly height: number;
  /** `height` rows of `width` characters, from the literal block. */
  readonly map: readonly string[];
  readonly start: YapCell;
  readonly loot: YapCell;
  readonly exit: YapCell;
  readonly guards: readonly YapGuard[];
  readonly cameras: readonly YapCamera[];
  readonly lasers: readonly YapLaser[];
}

/** Parse error with the 1-based line of the offending source line (0 = file). */
export class YapLevelError extends Error {
  readonly line: number;
  readonly file: string;
  readonly rawMessage: string;
  constructor(message: string, line: number, file = '') {
    super(formatLevelError(message, line, file));
    this.name = 'YapLevelError';
    this.rawMessage = message;
    this.line = line;
    this.file = file;
  }
}

function formatLevelError(message: string, line: number, file: string): string {
  if (file !== '') return `${file}:${line > 0 ? line : ''}: ${message}`;
  if (line > 0) return `line ${line}: ${message}`;
  return message;
}

// ---------------------------------------------------------------------------
// Raw syntax tree (internal)
// ---------------------------------------------------------------------------

interface YapRawStr {
  kind: 'str';
  value: string;
  line: number;
}
interface YapRawInt {
  kind: 'int';
  value: number;
  line: number;
}
interface YapRawWord {
  kind: 'word';
  value: string;
  line: number;
}
interface YapRawSeq {
  kind: 'seq';
  items: YapRaw[];
  line: number;
}
interface YapRawMap {
  kind: 'map';
  entries: YapMapEntry[];
  line: number;
}
interface YapRawBlock {
  kind: 'block';
  lines: string[];
  line: number;
}
type YapRaw = YapRawStr | YapRawInt | YapRawWord | YapRawSeq | YapRawMap | YapRawBlock;

interface YapMapEntry {
  key: string;
  value: YapRaw;
  line: number;
}

interface RawLine {
  text: string;
  no: number;
}

interface LogicalLine {
  indent: number;
  text: string;
  raw: string;
  line: number;
  rawIndex: number;
}

interface ParseState {
  lines: LogicalLine[];
  rawLines: RawLine[];
  i: number;
}

interface YapGrid {
  rows: string[];
  start: YapCell;
  loot: YapCell;
  exit: YapCell;
  isWall: (x: number, y: number) => boolean;
}

const LEVEL_TYPES: readonly string[] = ['normal', 'signature', 'tutorial'];
const DIRS: readonly string[] = ['N', 'E', 'S', 'W'];
const GUARD_MODES: readonly string[] = ['loop', 'pingpong'];
const MAP_CHARS = '#.SLE';
const TOP_KEYS: readonly string[] = [
  'name',
  'type',
  'moment',
  'maxPauses',
  'par',
  'map',
  'guards',
  'cameras',
  'lasers',
];
const GUARD_KEYS: readonly string[] = ['id', 'route', 'mode', 'phase', 'range', 'face'];
const CAMERA_KEYS: readonly string[] = ['id', 'at', 'dirs', 'hold', 'phase', 'range'];
const LASER_KEYS: readonly string[] = ['id', 'cells', 'on', 'off', 'phase'];
const KEY_RE = /^[A-Za-z][A-Za-z0-9]*$/;
const INT_RE = /^-?\d+$/;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function countIndent(s: string): number {
  let n = 0;
  while (n < s.length && s.charAt(n) === ' ') n += 1;
  return n;
}

/** Strip a trailing `#` comment, ignoring `#` inside double quotes. */
function stripComment(line: string): string {
  let quote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line.charAt(i);
    if (quote) {
      if (ch === '\\') {
        i += 1;
      } else if (ch === '"') {
        quote = false;
      }
    } else if (ch === '"') {
      quote = true;
    } else if (ch === '#') {
      const prev = i > 0 ? line.charAt(i - 1) : ' ';
      if (i === 0 || prev === ' ' || prev === '\t') return line.slice(0, i);
    }
  }
  return line;
}

function tokenize(rawLines: RawLine[]): LogicalLine[] {
  const out: LogicalLine[] = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const r = rawLines[i];
    if (r === undefined) continue;
    const noComment = stripComment(r.text);
    const trimmed = noComment.trim();
    if (trimmed === '') continue;
    const indent = countIndent(noComment);
    if (noComment.charAt(indent) === '\t') {
      throw new YapLevelError('tab indentation is not allowed', r.no);
    }
    out.push({ indent, text: trimmed, raw: r.text, line: r.no, rawIndex: i });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Syntax parser (restricted YAML subset)
// ---------------------------------------------------------------------------

function isItemText(text: string): boolean {
  return text === '-' || text.startsWith('- ');
}

function skipWs(text: string, pos: { p: number }): void {
  while (pos.p < text.length && /\s/.test(text.charAt(pos.p))) pos.p += 1;
}

function parseQuotedAt(text: string, line: number, pos: { p: number }): YapRawStr {
  pos.p += 1; // opening quote
  let out = '';
  while (pos.p < text.length) {
    const ch = text.charAt(pos.p);
    if (ch === '\\') {
      const next = pos.p + 1 < text.length ? text.charAt(pos.p + 1) : '';
      if (next === '"' || next === '\\') {
        out += next;
        pos.p += 2;
      } else {
        throw new YapLevelError(`unsupported escape "\\${next}"`, line);
      }
    } else if (ch === '"') {
      pos.p += 1;
      return { kind: 'str', value: out, line };
    } else {
      out += ch;
      pos.p += 1;
    }
  }
  throw new YapLevelError('unterminated quoted string', line);
}

function parseFlow(text: string, line: number, pos: { p: number }): YapRaw {
  skipWs(text, pos);
  const ch = pos.p < text.length ? text.charAt(pos.p) : '';
  if (ch === '[') {
    pos.p += 1;
    const items: YapRaw[] = [];
    skipWs(text, pos);
    if (pos.p < text.length && text.charAt(pos.p) === ']') {
      pos.p += 1;
      return { kind: 'seq', items, line };
    }
    for (;;) {
      items.push(parseFlow(text, line, pos));
      skipWs(text, pos);
      const c = pos.p < text.length ? text.charAt(pos.p) : '';
      if (c === ',') {
        pos.p += 1;
      } else if (c === ']') {
        pos.p += 1;
        return { kind: 'seq', items, line };
      } else {
        throw new YapLevelError('expected "," or "]" in flow sequence', line);
      }
    }
  }
  if (ch === '"') return parseQuotedAt(text, line, pos);
  const start = pos.p;
  while (
    pos.p < text.length &&
    text.charAt(pos.p) !== ',' &&
    text.charAt(pos.p) !== ']' &&
    !/\s/.test(text.charAt(pos.p))
  ) {
    pos.p += 1;
  }
  const tok = text.slice(start, pos.p);
  if (tok === '') throw new YapLevelError('empty item in flow sequence', line);
  if (INT_RE.test(tok)) {
    const value = parseInt(tok, 10);
    if (!Number.isSafeInteger(value)) {
      throw new YapLevelError(`integer out of range: "${tok}"`, line);
    }
    return { kind: 'int', value, line };
  }
  return { kind: 'word', value: tok, line };
}

function parseInline(text: string, line: number): YapRaw {
  const t = text.trim();
  if (t.startsWith('[')) {
    const pos = { p: 0 };
    const v = parseFlow(t, line, pos);
    skipWs(t, pos);
    if (pos.p !== t.length) {
      throw new YapLevelError('trailing characters after flow sequence', line);
    }
    return v;
  }
  if (t.startsWith('"')) {
    const pos = { p: 0 };
    const v = parseQuotedAt(t, line, pos);
    skipWs(t, pos);
    if (pos.p !== t.length) {
      throw new YapLevelError('trailing characters after quoted string', line);
    }
    return v;
  }
  if (t === '') throw new YapLevelError('empty value', line);
  if (INT_RE.test(t)) {
    const value = parseInt(t, 10);
    if (!Number.isSafeInteger(value)) {
      throw new YapLevelError(`integer out of range: "${t}"`, line);
    }
    return { kind: 'int', value, line };
  }
  return { kind: 'word', value: t, line };
}

/** Collect a literal block scalar (`key: |`) from the raw lines. */
function collectBlock(
  rawLines: RawLine[],
  keyRawIndex: number,
  keyIndent: number,
  keyLine: number,
): { raw: YapRawBlock; endRawIndex: number } {
  const collected: { text: string; no: number }[] = [];
  let j = keyRawIndex + 1;
  while (j < rawLines.length) {
    const r = rawLines[j];
    if (r === undefined) break;
    if (r.text.trim() === '') {
      collected.push({ text: '', no: r.no });
      j += 1;
      continue;
    }
    const ind = countIndent(r.text);
    if (r.text.charAt(ind) === '\t') {
      throw new YapLevelError('tab indentation is not allowed', r.no);
    }
    if (ind <= keyIndent) break;
    collected.push({ text: r.text, no: r.no });
    j += 1;
  }
  while (collected.length > 0) {
    const last = collected[collected.length - 1];
    if (last !== undefined && last.text === '') collected.pop();
    else break;
  }
  if (collected.length === 0) throw new YapLevelError('empty block scalar', keyLine);
  const first = collected[0];
  if (first === undefined) throw new YapLevelError('empty block scalar', keyLine);
  const blockIndent = countIndent(first.text);
  const lines: string[] = [];
  for (const c of collected) {
    if (c.text === '') throw new YapLevelError('blank line inside block scalar', c.no);
    if (countIndent(c.text) < blockIndent) {
      throw new YapLevelError('inconsistent indentation in block scalar', c.no);
    }
    lines.push(c.text.slice(blockIndent));
  }
  return { raw: { kind: 'block', lines, line: first.no }, endRawIndex: j };
}

function parseSequence(st: ParseState, indent: number): YapRawSeq {
  const items: YapRaw[] = [];
  const first = st.lines[st.i];
  const startLine = first !== undefined ? first.line : 0;
  while (st.i < st.lines.length) {
    const cur = st.lines[st.i];
    if (cur === undefined || cur.indent !== indent || !isItemText(cur.text)) break;
    const after = cur.text === '-' ? '' : cur.text.slice(2);
    if (after === '') {
      st.i += 1;
      const next = st.lines[st.i];
      if (next !== undefined && next.indent > indent) {
        items.push(parseNode(st, next.indent));
      } else {
        throw new YapLevelError('list item needs content', cur.line);
      }
    } else {
      st.lines[st.i] = {
        indent: indent + 2,
        text: after,
        raw: cur.raw,
        line: cur.line,
        rawIndex: cur.rawIndex,
      };
      items.push(parseMapping(st, indent + 2));
    }
  }
  return { kind: 'seq', items, line: startLine };
}

function parseMapping(st: ParseState, indent: number): YapRawMap {
  const entries: YapMapEntry[] = [];
  const first = st.lines[st.i];
  const startLine = first !== undefined ? first.line : 0;
  while (st.i < st.lines.length) {
    const cur = st.lines[st.i];
    if (cur === undefined || cur.indent < indent || isItemText(cur.text)) break;
    if (cur.indent > indent) {
      throw new YapLevelError('unexpected indentation', cur.line);
    }
    const colon = cur.text.indexOf(':');
    if (colon <= 0) {
      throw new YapLevelError(`expected "key: value", got "${cur.text}"`, cur.line);
    }
    const key = cur.text.slice(0, colon);
    if (!KEY_RE.test(key)) {
      throw new YapLevelError(`invalid key "${key}"`, cur.line);
    }
    if (entries.some((e) => e.key === key)) {
      throw new YapLevelError(`duplicate key "${key}"`, cur.line);
    }
    const rest = cur.text.slice(colon + 1).trim();
    const keyLine = cur.line;
    const keyRawIndex = cur.rawIndex;
    st.i += 1;
    let value: YapRaw;
    if (rest === '|') {
      const block = collectBlock(st.rawLines, keyRawIndex, indent, keyLine);
      while (st.i < st.lines.length) {
        const l = st.lines[st.i];
        if (l === undefined || l.rawIndex >= block.endRawIndex) break;
        st.i += 1;
      }
      value = block.raw;
    } else if (rest !== '') {
      value = parseInline(rest, keyLine);
    } else {
      const next = st.lines[st.i];
      if (next !== undefined && isItemText(next.text) && next.indent >= indent) {
        value = parseSequence(st, next.indent);
      } else if (next !== undefined && next.indent > indent) {
        value = parseNode(st, next.indent);
      } else {
        throw new YapLevelError(`key "${key}" needs a value`, keyLine);
      }
    }
    entries.push({ key, value, line: keyLine });
  }
  return { kind: 'map', entries, line: startLine };
}

function parseNode(st: ParseState, indent: number): YapRaw {
  const cur = st.lines[st.i];
  if (cur === undefined) throw new YapLevelError('unexpected end of file', 0);
  if (isItemText(cur.text)) return parseSequence(st, indent);
  return parseMapping(st, indent);
}

// ---------------------------------------------------------------------------
// Raw tree -> typed YapLevel
// ---------------------------------------------------------------------------

function entriesOf(v: YapRaw, what: string): YapMapEntry[] {
  if (v.kind !== 'map') throw new YapLevelError(`${what} must be a mapping`, v.line);
  return v.entries;
}

function field(entries: YapMapEntry[], key: string): YapRaw | undefined {
  return entries.find((e) => e.key === key)?.value;
}

function reqField(entries: YapMapEntry[], key: string, what: string, line: number): YapRaw {
  const v = field(entries, key);
  if (v === undefined) {
    throw new YapLevelError(`${what} is missing required key "${key}"`, line);
  }
  return v;
}

function checkKeys(entries: YapMapEntry[], allowed: readonly string[], what: string): void {
  for (const e of entries) {
    if (!allowed.includes(e.key)) {
      throw new YapLevelError(`unknown key "${e.key}" in ${what}`, e.line);
    }
  }
}

function asStr(v: YapRaw, what: string): string {
  if (v.kind === 'str' || v.kind === 'word') return v.value;
  throw new YapLevelError(`${what} must be a string`, v.line);
}

function asInt(v: YapRaw, what: string): number {
  if (v.kind !== 'int') throw new YapLevelError(`${what} must be an integer`, v.line);
  return v.value;
}

function asWord(v: YapRaw, what: string, allowed: readonly string[]): string {
  if (v.kind !== 'word' || !allowed.includes(v.value)) {
    throw new YapLevelError(
      `${what} must be one of ${allowed.join(', ')}, got ${v.kind === 'word' ? `"${v.value}"` : v.kind}`,
      v.line,
    );
  }
  return v.value;
}

function asSeq(v: YapRaw, what: string): YapRaw[] {
  if (v.kind !== 'seq') throw new YapLevelError(`${what} must be a list`, v.line);
  return v.items;
}

function asCell(v: YapRaw, what: string): YapCell {
  if (v.kind !== 'seq' || v.items.length !== 2) {
    throw new YapLevelError(`${what} must be an [x, y] pair`, v.line);
  }
  const xi = v.items[0];
  const yi = v.items[1];
  if (xi === undefined || yi === undefined) {
    throw new YapLevelError(`${what} must be an [x, y] pair`, v.line);
  }
  return { x: asInt(xi, `${what} x`), y: asInt(yi, `${what} y`) };
}

function dividesTickPeriod(period: number): boolean {
  return period > 0 && YAP_TICK_PERIOD % period === 0;
}

function parseMap(block: YapRawBlock): YapGrid {
  const rows = block.lines;
  if (rows.length !== YAP_GRID_HEIGHT) {
    throw new YapLevelError(
      `map must have exactly ${YAP_GRID_HEIGHT} rows, got ${rows.length}`,
      block.line,
    );
  }
  let start: YapCell | undefined;
  let loot: YapCell | undefined;
  let exit: YapCell | undefined;
  for (const [y, row] of rows.entries()) {
    const line = block.line + y;
    if (row.length !== YAP_GRID_WIDTH) {
      throw new YapLevelError(
        `map row ${y + 1} must have exactly ${YAP_GRID_WIDTH} characters, got ${row.length}`,
        line,
      );
    }
    for (let x = 0; x < row.length; x += 1) {
      const ch = row.charAt(x);
      if (!MAP_CHARS.includes(ch)) {
        throw new YapLevelError(
          `invalid map character "${ch}" in row ${y + 1} (allowed: # . S L E)`,
          line,
        );
      }
      if (ch === 'S') {
        if (start !== undefined) {
          throw new YapLevelError(`map has more than one start (S) in row ${y + 1}`, line);
        }
        start = { x, y };
      } else if (ch === 'L') {
        if (loot !== undefined) {
          throw new YapLevelError(`map has more than one loot (L) in row ${y + 1}`, line);
        }
        loot = { x, y };
      } else if (ch === 'E') {
        if (exit !== undefined) {
          throw new YapLevelError(`map has more than one exit (E) in row ${y + 1}`, line);
        }
        exit = { x, y };
      }
    }
  }
  if (start === undefined) throw new YapLevelError('map has no start (S)', block.line);
  if (loot === undefined) throw new YapLevelError('map has no loot (L)', block.line);
  if (exit === undefined) throw new YapLevelError('map has no exit (E)', block.line);
  const isWall = (x: number, y: number): boolean => {
    if (x < 0 || x >= YAP_GRID_WIDTH || y < 0 || y >= rows.length) return true;
    return rows[y]?.charAt(x) === '#';
  };
  return { rows, start, loot, exit, isWall };
}

function checkCellInGrid(c: YapCell, what: string, line: number, grid: YapGrid): void {
  if (c.x < 0 || c.x >= YAP_GRID_WIDTH || c.y < 0 || c.y >= YAP_GRID_HEIGHT) {
    throw new YapLevelError(`${what} [${c.x}, ${c.y}] is outside the grid`, line);
  }
  if (grid.isWall(c.x, c.y)) {
    throw new YapLevelError(`${what} [${c.x}, ${c.y}] is on a wall`, line);
  }
}

function optInt(
  entries: YapMapEntry[],
  key: string,
  fallback: number,
  what: string,
  line: number,
): { value: number; line: number } {
  const v = field(entries, key);
  if (v === undefined) return { value: fallback, line };
  return { value: asInt(v, `${what} ${key}`), line: v.line };
}

function buildGuard(v: YapRaw, grid: YapGrid): YapGuard {
  const entries = entriesOf(v, 'guard');
  checkKeys(entries, GUARD_KEYS, 'guard');
  const idV = reqField(entries, 'id', 'guard', v.line);
  const id = asStr(idV, 'guard id');
  if (id === '') throw new YapLevelError('guard id must not be empty', idV.line);
  const routeV = reqField(entries, 'route', 'guard', v.line);
  const routeItems = asSeq(routeV, 'guard route');
  if (routeItems.length < 1) {
    throw new YapLevelError('guard route must have at least one cell', routeV.line);
  }
  const route = routeItems.map((c) => asCell(c, 'guard route cell'));
  for (const c of route) checkCellInGrid(c, 'guard route cell', routeV.line, grid);
  for (let k = 1; k < route.length; k += 1) {
    const prev = route[k - 1];
    const cur = route[k];
    if (prev === undefined || cur === undefined) break;
    const d = Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
    if (d > 1) {
      throw new YapLevelError(
        `guard route cells [${prev.x}, ${prev.y}] and [${cur.x}, ${cur.y}] are not adjacent (a repeated cell is a wait)`,
        routeV.line,
      );
    }
  }
  const modeV = field(entries, 'mode');
  const mode = (
    modeV === undefined ? 'loop' : asWord(modeV, 'guard mode', GUARD_MODES)
  ) as YapGuardMode;
  const faceV = field(entries, 'face');
  const face = faceV === undefined ? undefined : (asWord(faceV, 'guard face', DIRS) as YapDir);
  if (route.length === 1 && face === undefined) {
    throw new YapLevelError('a static guard (single-cell route) needs a "face"', routeV.line);
  }
  const period = mode === 'loop' ? route.length : route.length >= 2 ? 2 * route.length - 2 : 1;
  if (mode === 'loop' && route.length >= 2) {
    const first = route[0];
    const last = route[route.length - 1];
    if (first !== undefined && last !== undefined) {
      const d = Math.abs(last.x - first.x) + Math.abs(last.y - first.y);
      if (d !== 1) {
        throw new YapLevelError(
          'loop route must close: the last cell must be adjacent to the first',
          routeV.line,
        );
      }
    }
  }
  if (!dividesTickPeriod(period)) {
    throw new YapLevelError(
      `guard period ${period} does not divide ${YAP_TICK_PERIOD}`,
      routeV.line,
    );
  }
  const phase = optInt(entries, 'phase', 0, 'guard', routeV.line);
  if (phase.value < 0 || phase.value >= period) {
    throw new YapLevelError(
      `guard phase must be in [0, ${period}), got ${phase.value}`,
      phase.line,
    );
  }
  const range = optInt(entries, 'range', 3, 'guard', routeV.line);
  if (range.value < 1) {
    throw new YapLevelError(`guard range must be >= 1, got ${range.value}`, range.line);
  }
  const base = { id, route, mode, phase: phase.value, range: range.value };
  return face === undefined ? base : { ...base, face };
}

function buildCamera(v: YapRaw, grid: YapGrid): YapCamera {
  const entries = entriesOf(v, 'camera');
  checkKeys(entries, CAMERA_KEYS, 'camera');
  const idV = reqField(entries, 'id', 'camera', v.line);
  const id = asStr(idV, 'camera id');
  if (id === '') throw new YapLevelError('camera id must not be empty', idV.line);
  const atV = reqField(entries, 'at', 'camera', v.line);
  const at = asCell(atV, 'camera at');
  if (at.x < 0 || at.x >= YAP_GRID_WIDTH || at.y < 0 || at.y >= YAP_GRID_HEIGHT) {
    throw new YapLevelError(`camera at [${at.x}, ${at.y}] is outside the grid`, atV.line);
  }
  if (!grid.isWall(at.x, at.y)) {
    throw new YapLevelError(
      `camera at [${at.x}, ${at.y}] must be mounted on a wall cell`,
      atV.line,
    );
  }
  const dirsV = reqField(entries, 'dirs', 'camera', v.line);
  const dirItems = asSeq(dirsV, 'camera dirs');
  if (dirItems.length < 1 || dirItems.length > 4) {
    throw new YapLevelError('camera dirs must have 1 to 4 directions', dirsV.line);
  }
  const dirs = dirItems.map((d) => asWord(d, 'camera dir', DIRS) as YapDir);
  if (new Set(dirs).size !== dirs.length) {
    throw new YapLevelError('camera dirs must be distinct', dirsV.line);
  }
  const holdV = reqField(entries, 'hold', 'camera', v.line);
  const hold = asInt(holdV, 'camera hold');
  if (hold < 1) {
    throw new YapLevelError(`camera hold must be >= 1, got ${hold}`, holdV.line);
  }
  const period = hold * dirs.length;
  if (!dividesTickPeriod(period)) {
    throw new YapLevelError(
      `camera period ${period} (hold ${hold} x ${dirs.length} dirs) does not divide ${YAP_TICK_PERIOD}`,
      holdV.line,
    );
  }
  const phase = optInt(entries, 'phase', 0, 'camera', holdV.line);
  if (phase.value < 0 || phase.value >= period) {
    throw new YapLevelError(
      `camera phase must be in [0, ${period}), got ${phase.value}`,
      phase.line,
    );
  }
  const range = optInt(entries, 'range', 3, 'camera', holdV.line);
  if (range.value < 1) {
    throw new YapLevelError(`camera range must be >= 1, got ${range.value}`, range.line);
  }
  return { id, at, dirs, hold, phase: phase.value, range: range.value };
}

function buildLaser(v: YapRaw, grid: YapGrid): YapLaser {
  const entries = entriesOf(v, 'laser');
  checkKeys(entries, LASER_KEYS, 'laser');
  const idV = reqField(entries, 'id', 'laser', v.line);
  const id = asStr(idV, 'laser id');
  if (id === '') throw new YapLevelError('laser id must not be empty', idV.line);
  const cellsV = reqField(entries, 'cells', 'laser', v.line);
  const cellItems = asSeq(cellsV, 'laser cells');
  if (cellItems.length < 1) {
    throw new YapLevelError('laser must have at least one cell', cellsV.line);
  }
  const cells = cellItems.map((c) => asCell(c, 'laser cell'));
  for (const c of cells) checkCellInGrid(c, 'laser cell', cellsV.line, grid);
  const first = cells[0];
  if (first === undefined)
    throw new YapLevelError('laser must have at least one cell', cellsV.line);
  const sameX = cells.every((c) => c.x === first.x);
  const sameY = cells.every((c) => c.y === first.y);
  if (!sameX && !sameY) {
    throw new YapLevelError('laser cells must be aligned on a row or a column', cellsV.line);
  }
  const sorted = [...cells].sort((a, b) => (sameX ? a.y - b.y : a.x - b.x));
  for (let k = 1; k < sorted.length; k += 1) {
    const prev = sorted[k - 1];
    const cur = sorted[k];
    if (prev === undefined || cur === undefined) break;
    const d = sameX ? Math.abs(cur.y - prev.y) : Math.abs(cur.x - prev.x);
    if (d !== 1) {
      throw new YapLevelError('laser cells must be contiguous', cellsV.line);
    }
  }
  const onV = reqField(entries, 'on', 'laser', v.line);
  const on = asInt(onV, 'laser on');
  if (on < 1) throw new YapLevelError(`laser on must be >= 1, got ${on}`, onV.line);
  const offV = reqField(entries, 'off', 'laser', v.line);
  const off = asInt(offV, 'laser off');
  if (off < 1) throw new YapLevelError(`laser off must be >= 1, got ${off}`, offV.line);
  const period = on + off;
  if (!dividesTickPeriod(period)) {
    throw new YapLevelError(
      `laser period ${period} (on ${on} + off ${off}) does not divide ${YAP_TICK_PERIOD}`,
      onV.line,
    );
  }
  const phase = optInt(entries, 'phase', 0, 'laser', onV.line);
  if (phase.value < 0 || phase.value >= period) {
    throw new YapLevelError(
      `laser phase must be in [0, ${period}), got ${phase.value}`,
      phase.line,
    );
  }
  return { id, cells, on, off, phase: phase.value };
}

function collectIds(v: YapRaw | undefined, what: string): { id: string; line: number }[] {
  if (v === undefined) return [];
  const items = asSeq(v, what);
  return items.map((item) => {
    const entries = entriesOf(item, what);
    const idV = reqField(entries, 'id', what, item.line);
    return { id: asStr(idV, `${what} id`), line: idV.line };
  });
}

function buildLevel(doc: YapRawMap): YapLevel {
  const entries = doc.entries;
  checkKeys(entries, TOP_KEYS, 'level');
  const nameV = reqField(entries, 'name', 'level', doc.line);
  const name = asStr(nameV, 'name');
  if (name === '') throw new YapLevelError('"name" must not be empty', nameV.line);
  const typeV = reqField(entries, 'type', 'level', doc.line);
  const type = asWord(typeV, 'type', LEVEL_TYPES) as YapLevelType;
  const momentV = field(entries, 'moment');
  const moment = momentV === undefined ? '' : asStr(momentV, 'moment');
  if (type === 'signature' && moment === '') {
    throw new YapLevelError(
      'a signature heist needs a non-empty "moment"',
      momentV !== undefined ? momentV.line : doc.line,
    );
  }
  const maxPausesV = reqField(entries, 'maxPauses', 'level', doc.line);
  const maxPauses = asInt(maxPausesV, 'maxPauses');
  if (maxPauses < 0 || maxPauses > YAP_MAX_PAUSES) {
    throw new YapLevelError(
      `"maxPauses" must be between 0 and ${YAP_MAX_PAUSES}, got ${maxPauses}`,
      maxPausesV.line,
    );
  }
  const parV = reqField(entries, 'par', 'level', doc.line);
  const par = asInt(parV, 'par');
  if (par < 1 || par > YAP_MAX_TICKS) {
    throw new YapLevelError(`"par" must be between 1 and ${YAP_MAX_TICKS}, got ${par}`, parV.line);
  }
  const mapV = reqField(entries, 'map', 'level', doc.line);
  if (mapV.kind !== 'block') {
    throw new YapLevelError('"map" must be a literal block: "map: |"', mapV.line);
  }
  const grid = parseMap(mapV);
  const guardsV = field(entries, 'guards');
  const camerasV = field(entries, 'cameras');
  const lasersV = field(entries, 'lasers');
  const allIds = [
    ...collectIds(guardsV, 'guards'),
    ...collectIds(camerasV, 'cameras'),
    ...collectIds(lasersV, 'lasers'),
  ];
  const seenIds = new Set<string>();
  for (const { id, line } of allIds) {
    if (seenIds.has(id)) throw new YapLevelError(`duplicate entity id "${id}"`, line);
    seenIds.add(id);
  }
  const guards =
    guardsV === undefined ? [] : asSeq(guardsV, 'guards').map((g) => buildGuard(g, grid));
  const cameras =
    camerasV === undefined ? [] : asSeq(camerasV, 'cameras').map((c) => buildCamera(c, grid));
  const lasers =
    lasersV === undefined ? [] : asSeq(lasersV, 'lasers').map((l) => buildLaser(l, grid));
  return {
    name,
    type,
    moment,
    maxPauses,
    par,
    width: YAP_GRID_WIDTH,
    height: YAP_GRID_HEIGHT,
    map: grid.rows,
    start: grid.start,
    loot: grid.loot,
    exit: grid.exit,
    guards,
    cameras,
    lasers,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a .lvl source string into a typed YapLevel.
 * Throws YapLevelError with the 1-based line of the problem (0 = whole file).
 */
export function parseLevel(source: string, fileName = ''): YapLevel {
  try {
    const rawLines: RawLine[] = source
      .split('\n')
      .map((part, i) => ({ text: part.endsWith('\r') ? part.slice(0, -1) : part, no: i + 1 }));
    const lines = tokenize(rawLines);
    if (lines.length === 0) throw new YapLevelError('empty level file', 0);
    const first = lines[0];
    if (first === undefined) throw new YapLevelError('empty level file', 0);
    const st: ParseState = { lines, rawLines, i: 0 };
    const doc = parseNode(st, first.indent);
    if (st.i < st.lines.length) {
      const extra = st.lines[st.i];
      throw new YapLevelError(
        'unexpected content (check indentation)',
        extra !== undefined ? extra.line : 0,
      );
    }
    if (doc.kind !== 'map') {
      throw new YapLevelError('a level file must be a "key: value" mapping', doc.line);
    }
    return buildLevel(doc);
  } catch (e) {
    if (e instanceof YapLevelError && fileName !== '') {
      throw new YapLevelError(e.rawMessage, e.line, fileName);
    }
    throw e;
  }
}
