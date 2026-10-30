// Tests for the C6 render decision — when the level scene shows and clears
// the ghost layer (src/game/level-scene.ts). The scene itself is Phaser-bound,
// so the visibility rule lives in the pure helper yapGhostLayerVisible
// (src/game/ghost.ts) and is tested here across the scene modes, together with
// the YapPathInput lifecycle that feeds it (drawing, cell under the finger,
// release, Clear, ghost flag off) and the exact payload the layer draws:
// guards/cameras/lasers at the ghost tick and cones = visibleCells of that tick.
import { describe, expect, it } from 'vitest';
import { parseLevel, type YapCell, type YapLevel } from '../../src/core/level';
import { visibleCells } from '../../src/core/sim';
import { yapCellCenter, yapComputeLayout, type YapBoardLayout } from '../../src/game/board';
import { YapPathInput } from '../../src/game/path-input';
import {
  YapGhostPreview,
  yapGhostCones,
  yapGhostLayerVisible,
  type YapGhostRenderMode,
} from '../../src/game/ghost';

// 8 x 12, S=(1,1), L=(3,10), E=(6,10). One patrolling guard, one camera.
const MAP = [
  '########',
  '#S.....#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '#..L..E#',
  '########',
];

function lvl(): YapLevel {
  const src = [
    'name: Ghost render test',
    'type: tutorial',
    'moment: ""',
    'maxPauses: 3',
    'par: 18',
    'map: |',
    ...MAP.map((row) => `  ${row}`),
    'guards:',
    '  - id: g1',
    '    route: [[4,2], [5,2]]',
    '    mode: pingpong',
    '    phase: 0',
    '    range: 3',
    'cameras:',
    '  - id: c1',
    '    at: [3,0]',
    '    dirs: [S, N]',
    '    hold: 2',
    '    phase: 0',
    '    range: 2',
  ].join('\n');
  return parseLevel(src);
}

// 360 x 640 viewport: 39 px cells.
const layout: YapBoardLayout = yapComputeLayout(360, 640, 8, 12);

const S: YapCell = { x: 1, y: 1 };
const cell = (x: number, y: number): YapCell => ({ x, y });
const center = (c: YapCell): { x: number; y: number } => yapCellCenter(layout, c);

// ---------------------------------------------------------------------------
// yapGhostLayerVisible — the scene's show/clear rule for the ghost layer
// ---------------------------------------------------------------------------

describe('yapGhostLayerVisible — when the scene draws the ghost layer', () => {
  const level = lvl();
  const ghost = new YapGhostPreview(level).yapAt(3);

  it('is visible only in planning mode with a ghost state (drawing + flag on)', () => {
    expect(yapGhostLayerVisible('planning', ghost)).toBe(true);
  });

  it('is cleared when there is no ghost state (not drawing, flag off, released)', () => {
    expect(yapGhostLayerVisible('planning', null)).toBe(false);
  });

  it('is cleared as soon as the execution, the failure or the win screen starts', () => {
    const modes: readonly YapGhostRenderMode[] = ['execution', 'failure', 'win'];
    for (const mode of modes) {
      expect(yapGhostLayerVisible(mode, ghost)).toBe(false);
      expect(yapGhostLayerVisible(mode, null)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// The path-input lifecycle that feeds the layer, in planning mode
// ---------------------------------------------------------------------------

describe('ghost layer lifecycle while drawing (planning mode)', () => {
  it('is hidden before any stroke, shown while drawing, hidden on release', () => {
    const level = lvl();
    const input = new YapPathInput(level, layout);
    // not drawing: the layer is cleared
    expect(yapGhostLayerVisible('planning', input.yapGhostState())).toBe(false);
    // stroke starts on the thief's cell: tick 0 under the finger
    const p0 = center(S);
    input.yapPointerDown(p0.x, p0.y, 0);
    let ghost = input.yapGhostState();
    expect(yapGhostLayerVisible('planning', ghost)).toBe(true);
    expect(ghost?.tick).toBe(0);
    // moving to a new cell updates the layer content (the tick under the finger)
    const p1 = center(cell(2, 1));
    input.yapPointerMove(p1.x, p1.y);
    ghost = input.yapGhostState();
    expect(yapGhostLayerVisible('planning', ghost)).toBe(true);
    expect(ghost?.tick).toBe(1);
    // released: the layer is cleared
    input.yapPointerUp(p1.x, p1.y, 10);
    expect(yapGhostLayerVisible('planning', input.yapGhostState())).toBe(false);
  });

  it('is cleared by Clear in the middle of a stroke', () => {
    const level = lvl();
    const input = new YapPathInput(level, layout);
    const p0 = center(S);
    input.yapPointerDown(p0.x, p0.y, 0);
    input.yapPointerMove(center(cell(2, 1)).x, center(cell(2, 1)).y);
    expect(yapGhostLayerVisible('planning', input.yapGhostState())).toBe(true);
    input.yapClear();
    expect(yapGhostLayerVisible('planning', input.yapGhostState())).toBe(false);
    input.yapPointerUp(center(cell(2, 1)).x, center(cell(2, 1)).y, 10);
  });

  it('never shows with the ghost flag off (?flag=ghost:0)', () => {
    const level = lvl();
    const input = new YapPathInput(level, layout, { ghost: false });
    const p0 = center(S);
    input.yapPointerDown(p0.x, p0.y, 0);
    input.yapPointerMove(center(cell(2, 1)).x, center(cell(2, 1)).y);
    expect(input.yapIsDrawing()).toBe(true); // drawing still works
    expect(yapGhostLayerVisible('planning', input.yapGhostState())).toBe(false);
    input.yapPointerUp(center(cell(2, 1)).x, center(cell(2, 1)).y, 10);
  });
});

// ---------------------------------------------------------------------------
// The payload the layer draws: entities at the ghost tick, cones = visibleCells
// ---------------------------------------------------------------------------

describe('ghost layer payload at the tick under the finger', () => {
  it('draws guards/cameras/lasers at the ghost tick and exactly their visibleCells cones', () => {
    const level = lvl();
    const input = new YapPathInput(level, layout);
    const preview = new YapGhostPreview(level);
    const p0 = center(S);
    input.yapPointerDown(p0.x, p0.y, 0);
    // extend to (4,1): the finger is on the 4th cell, tick 3
    for (const c of [cell(2, 1), cell(3, 1), cell(4, 1)]) {
      const p = center(c);
      input.yapPointerMove(p.x, p.y);
    }
    const ghost = input.yapGhostState();
    expect(ghost?.tick).toBe(3);
    if (ghost === null) throw new Error('ghost state expected while drawing');
    // the entities are exactly the world at that tick
    const expected = preview.yapAt(3);
    expect(ghost.guards).toEqual(expected.guards);
    expect(ghost.cameras).toEqual(expected.cameras);
    expect(ghost.lasers).toEqual(expected.lasers);
    // the cones are exactly visibleCells for the ghost tick (guard and camera)
    const cones = yapGhostCones(level, ghost);
    ghost.guards.forEach((guard, i) => {
      const def = level.guards[i];
      if (def === undefined) throw new Error('missing guard def');
      expect(cones.guards[i]).toEqual(visibleCells(level, guard.pos, guard.facing, def.range));
    });
    ghost.cameras.forEach((cam, i) => {
      const def = level.cameras[i];
      if (def === undefined) throw new Error('missing camera def');
      expect(cones.cameras[i]).toEqual(visibleCells(level, cam.at, cam.facing, def.range));
    });
    input.yapPointerUp(center(cell(4, 1)).x, center(cell(4, 1)).y, 10);
  });
});
