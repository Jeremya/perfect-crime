import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseLevel, YapLevelError } from '../../src/core/level';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Join source lines; line numbers in the tests are 1-based positions here. */
function lines(...ls: string[]): string {
  return ls.join('\n');
}

/** Parse and return the YapLevelError that parseLevel must throw. */
function errorOf(source: string): YapLevelError {
  try {
    parseLevel(source);
  } catch (e) {
    if (e instanceof YapLevelError) return e;
    throw e;
  }
  throw new Error('expected parseLevel to throw a YapLevelError');
}

// A minimal valid level. Line numbers are noted per row.
const BASE = [
  'name: Test', // 1
  'type: tutorial', // 2
  'moment: ""', // 3
  'maxPauses: 3', // 4
  'par: 18', // 5
  'map: |', // 6
  '  ########', // 7
  '  #S.....#', // 8
  '  #......#', // 9
  '  #......#', // 10
  '  #......#', // 11
  '  ##.##.##', // 12
  '  #......#', // 13
  '  #......#', // 14
  '  #......#', // 15
  '  #......#', // 16
  '  #..L..E#', // 17
  '  ########', // 18
];

/** BASE with line `n` (1-based) replaced. */
function withLine(n: number, text: string, extra: string[] = []): string {
  const copy = [...BASE, ...extra];
  copy[n - 1] = text;
  return copy.join('\n');
}

// The spec's format example (guards + camera + laser), adapted so the camera
// sits on a wall cell as the format requires.
const EXAMPLE = lines(
  'name: Example', // 1
  'type: normal', // 2
  'moment: ""', // 3
  'maxPauses: 3', // 4
  'par: 21', // 5
  'map: |', // 6
  '  ########', // 7
  '  #S.....#', // 8
  '  #.####.#', // 9
  '  #......#', // 10
  '  ##.##.##', // 11
  '  #...L..#', // 12
  '  #.####.#', // 13
  '  #......#', // 14
  '  ###.####', // 15
  '  #......#', // 16
  '  #.....E#', // 17
  '  ########', // 18
  'guards:', // 19
  '  - id: g1', // 20
  '    route: [[1,3], [2,3], [3,3], [4,3], [5,3]]', // 21
  '    mode: pingpong', // 22
  '    phase: 0', // 23
  '    range: 3', // 24
  'cameras:', // 25
  '  - id: c1', // 26
  '    at: [2,8]', // 27
  '    dirs: [S, E]', // 28
  '    hold: 3', // 29
  '    phase: 0', // 30
  '    range: 3', // 31
  'lasers:', // 32
  '  - id: l1', // 33
  '    cells: [[3,9], [4,9], [5,9]]', // 34
  '    on: 2', // 35
  '    off: 2', // 36
  '    phase: 1', // 37
);

// ---------------------------------------------------------------------------
// Valid files
// ---------------------------------------------------------------------------

describe('parseLevel — valid files', () => {
  it('parses the spec format example into a typed YapLevel', () => {
    const level = parseLevel(EXAMPLE);
    expect(level.name).toBe('Example');
    expect(level.type).toBe('normal');
    expect(level.moment).toBe('');
    expect(level.maxPauses).toBe(3);
    expect(level.par).toBe(21);
    expect(level.width).toBe(8);
    expect(level.height).toBe(12);
    expect(level.map).toHaveLength(12);
    expect(level.map[0]).toBe('########');
    expect(level.start).toEqual({ x: 1, y: 1 });
    expect(level.loot).toEqual({ x: 4, y: 5 });
    expect(level.exit).toEqual({ x: 6, y: 10 });
    expect(level.guards).toHaveLength(1);
    expect(level.guards[0]).toEqual({
      id: 'g1',
      route: [
        { x: 1, y: 3 },
        { x: 2, y: 3 },
        { x: 3, y: 3 },
        { x: 4, y: 3 },
        { x: 5, y: 3 },
      ],
      mode: 'pingpong',
      phase: 0,
      range: 3,
    });
    expect(level.guards[0]?.face).toBeUndefined();
    expect(level.cameras).toHaveLength(1);
    expect(level.cameras[0]).toEqual({
      id: 'c1',
      at: { x: 2, y: 8 },
      dirs: ['S', 'E'],
      hold: 3,
      phase: 0,
      range: 3,
    });
    expect(level.lasers).toHaveLength(1);
    expect(level.lasers[0]).toEqual({
      id: 'l1',
      cells: [
        { x: 3, y: 9 },
        { x: 4, y: 9 },
        { x: 5, y: 9 },
      ],
      on: 2,
      off: 2,
      phase: 1,
    });
  });

  it('parses a level without entities (empty lists by default)', () => {
    const level = parseLevel(BASE.join('\n'));
    expect(level.guards).toEqual([]);
    expect(level.cameras).toEqual([]);
    expect(level.lasers).toEqual([]);
    expect(level.start).toEqual({ x: 1, y: 1 });
    expect(level.loot).toEqual({ x: 3, y: 10 });
    expect(level.exit).toEqual({ x: 6, y: 10 });
  });

  it('accepts empty entity lists written as flow sequences', () => {
    const level = parseLevel(
      withLine(18, '  ########', ['guards: []', 'cameras: []', 'lasers: []']),
    );
    expect(level.guards).toEqual([]);
    expect(level.cameras).toEqual([]);
    expect(level.lasers).toEqual([]);
  });

  it('accepts a static guard with a single-cell route and a face', () => {
    const level = parseLevel(
      withLine(18, '  ########', ['guards:', '  - id: g1', '    route: [[1,2]]', '    face: E']),
    );
    expect(level.guards[0]).toEqual({
      id: 'g1',
      route: [{ x: 1, y: 2 }],
      mode: 'loop',
      phase: 0,
      range: 3,
      face: 'E',
    });
  });

  it('parses levels/tutorial/t1.lvl', () => {
    const path = fileURLToPath(new URL('../../levels/tutorial/t1.lvl', import.meta.url));
    const level = parseLevel(readFileSync(path, 'utf8'), path);
    expect(level.name).toBe('Tutorial 1');
    expect(level.type).toBe('tutorial');
    expect(level.par).toBe(18);
    expect(level.maxPauses).toBe(3);
    expect(level.width).toBe(8);
    expect(level.height).toBe(12);
    expect(level.map).toHaveLength(12);
    expect(level.start).toEqual({ x: 1, y: 1 });
    expect(level.loot).toEqual({ x: 3, y: 10 });
    expect(level.exit).toEqual({ x: 6, y: 10 });
    expect(level.guards).toHaveLength(1);
    expect(level.guards[0]?.id).toBe('g1');
    expect(level.guards[0]?.mode).toBe('pingpong');
    expect(level.cameras).toHaveLength(1);
    expect(level.cameras[0]?.at).toEqual({ x: 3, y: 5 });
    expect(level.lasers).toHaveLength(1);
    expect(level.lasers[0]?.cells).toEqual([
      { x: 1, y: 9 },
      { x: 2, y: 9 },
    ]);
  });

  it('is deterministic: parsing twice yields equal objects', () => {
    const a = parseLevel(EXAMPLE);
    const b = parseLevel(EXAMPLE);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// Invalid files — every case must report a precise line number
// ---------------------------------------------------------------------------

describe('parseLevel — invalid files report the offending line', () => {
  it('rejects an empty file', () => {
    const e = errorOf('');
    expect(e.line).toBe(0);
    expect(e.message).toContain('empty level file');
  });

  it('rejects an unknown top-level key', () => {
    const e = errorOf(withLine(2, 'bogus: 1'));
    expect(e.line).toBe(2);
    expect(e.message).toContain('unknown key "bogus"');
  });

  it('rejects a duplicate key', () => {
    const e = errorOf(withLine(18, '  ########', ['par: 20']));
    expect(e.line).toBe(19);
    expect(e.message).toContain('duplicate key "par"');
  });

  it('rejects a key without a value', () => {
    const e = errorOf(withLine(18, '  ########', ['guards:']));
    expect(e.line).toBe(19);
    expect(e.message).toContain('key "guards" needs a value');
  });

  it('rejects unexpected indentation', () => {
    const e = errorOf(withLine(2, '  type: tutorial'));
    expect(e.line).toBe(2);
    expect(e.message).toContain('unexpected indentation');
  });

  it('rejects a map with the wrong number of rows', () => {
    const e = errorOf(BASE.slice(0, 17).join('\n'));
    expect(e.line).toBe(7);
    expect(e.message).toContain('must have exactly 12 rows, got 11');
  });

  it('rejects a map row with the wrong width, at that row', () => {
    const e = errorOf(withLine(9, '  #.....#'));
    expect(e.line).toBe(9);
    expect(e.message).toContain('must have exactly 8 characters, got 7');
  });

  it('rejects an invalid map character, at that row', () => {
    const e = errorOf(withLine(10, '  #..x...#'));
    expect(e.line).toBe(10);
    expect(e.message).toContain('invalid map character "x"');
  });

  it('rejects a second start cell, at that row', () => {
    const e = errorOf(withLine(9, '  #S.....#'));
    expect(e.line).toBe(9);
    expect(e.message).toContain('more than one start');
  });

  it('rejects a map without an exit', () => {
    const e = errorOf(withLine(17, '  #..L...#'));
    expect(e.line).toBe(7);
    expect(e.message).toContain('no exit (E)');
  });

  it('rejects a non-integer par', () => {
    const e = errorOf(withLine(5, 'par: many'));
    expect(e.line).toBe(5);
    expect(e.message).toContain('par must be an integer');
  });

  it('rejects a par outside 1..64', () => {
    const e = errorOf(withLine(5, 'par: 0'));
    expect(e.line).toBe(5);
    expect(e.message).toContain('between 1 and 64');
  });

  it('rejects maxPauses above 3', () => {
    const e = errorOf(withLine(4, 'maxPauses: 4'));
    expect(e.line).toBe(4);
    expect(e.message).toContain('between 0 and 3');
  });

  it('rejects a signature heist without a moment', () => {
    const e = errorOf(withLine(2, 'type: signature'));
    expect(e.line).toBe(3);
    expect(e.message).toContain('moment');
  });

  it('rejects a guard route with non-adjacent cells', () => {
    const e = errorOf(
      withLine(18, '  ########', ['guards:', '  - id: g1', '    route: [[1,2], [3,2]]']),
    );
    expect(e.line).toBe(21);
    expect(e.message).toContain('not adjacent');
  });

  it('rejects a loop route that does not close', () => {
    const e = errorOf(
      withLine(18, '  ########', [
        'guards:',
        '  - id: g1',
        '    route: [[1,2], [2,2], [3,2]]',
        '    mode: loop',
      ]),
    );
    expect(e.line).toBe(21);
    expect(e.message).toContain('must close');
  });

  it('rejects a guard period that does not divide 24', () => {
    const e = errorOf(
      withLine(18, '  ########', [
        'guards:',
        '  - id: g1',
        '    route: [[1,2], [2,2], [3,2], [4,2], [5,2], [6,2]]',
        '    mode: pingpong',
      ]),
    );
    expect(e.line).toBe(21);
    expect(e.message).toContain('period 10 does not divide 24');
  });

  it('rejects a guard phase outside the period', () => {
    const e = errorOf(
      withLine(18, '  ########', [
        'guards:',
        '  - id: g1',
        '    route: [[1,2], [2,2]]',
        '    mode: pingpong',
        '    phase: 2',
      ]),
    );
    expect(e.line).toBe(23);
    expect(e.message).toContain('phase must be in [0, 2)');
  });

  it('rejects a static guard without a face', () => {
    const e = errorOf(withLine(18, '  ########', ['guards:', '  - id: g1', '    route: [[1,2]]']));
    expect(e.line).toBe(21);
    expect(e.message).toContain('needs a "face"');
  });

  it('rejects a guard route cell outside the grid', () => {
    const e = errorOf(
      withLine(18, '  ########', ['guards:', '  - id: g1', '    route: [[9,2]]', '    face: E']),
    );
    expect(e.line).toBe(21);
    expect(e.message).toContain('outside the grid');
  });

  it('rejects a guard route cell on a wall', () => {
    const e = errorOf(
      withLine(18, '  ########', ['guards:', '  - id: g1', '    route: [[0,2], [1,2]]']),
    );
    expect(e.line).toBe(21);
    expect(e.message).toContain('on a wall');
  });

  it('rejects a camera not mounted on a wall', () => {
    const e = errorOf(
      withLine(18, '  ########', [
        'cameras:',
        '  - id: c1',
        '    at: [1,9]',
        '    dirs: [N]',
        '    hold: 24',
      ]),
    );
    expect(e.line).toBe(21);
    expect(e.message).toContain('must be mounted on a wall');
  });

  it('rejects an invalid camera direction', () => {
    const e = errorOf(
      withLine(18, '  ########', [
        'cameras:',
        '  - id: c1',
        '    at: [3,5]',
        '    dirs: [X]',
        '    hold: 24',
      ]),
    );
    expect(e.line).toBe(22);
    expect(e.message).toContain('must be one of N, E, S, W');
  });

  it('rejects a camera period that does not divide 24', () => {
    const e = errorOf(
      withLine(18, '  ########', [
        'cameras:',
        '  - id: c1',
        '    at: [3,5]',
        '    dirs: [N]',
        '    hold: 5',
      ]),
    );
    expect(e.line).toBe(23);
    expect(e.message).toContain('period 5');
    expect(e.message).toContain('does not divide 24');
  });

  it('rejects laser cells that are not aligned', () => {
    const e = errorOf(
      withLine(18, '  ########', [
        'lasers:',
        '  - id: l1',
        '    cells: [[1,9], [2,8]]',
        '    on: 2',
        '    off: 2',
      ]),
    );
    expect(e.line).toBe(21);
    expect(e.message).toContain('aligned');
  });

  it('rejects laser cells that are not contiguous', () => {
    const e = errorOf(
      withLine(18, '  ########', [
        'lasers:',
        '  - id: l1',
        '    cells: [[1,9], [3,9]]',
        '    on: 2',
        '    off: 2',
      ]),
    );
    expect(e.line).toBe(21);
    expect(e.message).toContain('contiguous');
  });

  it('rejects a laser on a wall cell', () => {
    const e = errorOf(
      withLine(18, '  ########', [
        'lasers:',
        '  - id: l1',
        '    cells: [[0,9], [1,9]]',
        '    on: 2',
        '    off: 2',
      ]),
    );
    expect(e.line).toBe(21);
    expect(e.message).toContain('on a wall');
  });

  it('rejects a laser period that does not divide 24', () => {
    const e = errorOf(
      withLine(18, '  ########', [
        'lasers:',
        '  - id: l1',
        '    cells: [[1,9], [2,9]]',
        '    on: 3',
        '    off: 2',
      ]),
    );
    expect(e.line).toBe(22);
    expect(e.message).toContain('period 5');
    expect(e.message).toContain('does not divide 24');
  });

  it('rejects duplicate entity ids across lists', () => {
    const e = errorOf(
      withLine(18, '  ########', [
        'guards:',
        '  - id: g1',
        '    route: [[1,2], [2,2]]',
        'lasers:',
        '  - id: g1',
        '    cells: [[1,9], [2,9]]',
        '    on: 2',
        '    off: 2',
      ]),
    );
    expect(e.line).toBe(23);
    expect(e.message).toContain('duplicate entity id "g1"');
  });

  it('rejects a malformed flow sequence', () => {
    const e = errorOf(withLine(18, '  ########', ['guards:', '  - id: g1', '    route: [[1,2]']));
    expect(e.line).toBe(21);
    expect(e.message).toContain('expected "," or "]"');
  });

  it('rejects an unterminated quoted string', () => {
    const e = errorOf(withLine(1, 'name: "abc'));
    expect(e.line).toBe(1);
    expect(e.message).toContain('unterminated quoted string');
  });

  it('prefixes the message with the line number', () => {
    const e = errorOf(withLine(5, 'par: many'));
    expect(e.message).toMatch(/^line 5: /);
  });

  it('prefixes the message with the file name when given', () => {
    let caught: unknown;
    try {
      parseLevel(withLine(5, 'par: many'), 'levels/tutorial/t1.lvl');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(YapLevelError);
    const e = caught as YapLevelError;
    expect(e.line).toBe(5);
    expect(e.message).toMatch(/^levels\/tutorial\/t1\.lvl:5: /);
  });
});
