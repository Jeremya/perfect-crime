// A one-line text field over the canvas (story D3, the nickname). A phone only
// opens its keyboard for a real input, so this is the one DOM control of the
// game: it sits exactly on the box the scene gives it, in the plan style, and
// lives only while the player types.
import type Phaser from 'phaser';
import { YAP_PALETTE } from './board';
import { yapSetFieldFont } from './text';

/** More than the nickname takes: `fit` has the last word, in bytes. */
const YAP_FIELD_MAX_LENGTH = 48;

export interface YapFieldBox {
  readonly x: number;
  /** Centre line, as in YapButtonOptions. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface YapTextFieldOptions {
  readonly value: string;
  /** Read aloud by a screen reader: the canvas has no label of its own. */
  readonly label: string;
  readonly box: YapFieldBox;
  /** Applied to every keystroke. */
  readonly fit: (raw: string) => string;
  /** The final text: the field is gone by then. */
  readonly onDone: (value: string) => void;
}

export interface YapTextField {
  /** Moves the field: the keyboard of an old browser resizes the view. */
  place(box: YapFieldBox): void;
  /** Ends the editing, as Enter and a lost focus do. Only the first call counts. */
  close(): void;
}

/** Opens the field and focuses it: call it from the release of a tap. */
export function yapOpenTextField(scene: Phaser.Scene, options: YapTextFieldOptions): YapTextField {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = options.value;
  input.maxLength = YAP_FIELD_MAX_LENGTH;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.enterKeyHint = 'done';
  input.setAttribute('aria-label', options.label);
  Object.assign(input.style, {
    position: 'fixed',
    boxSizing: 'border-box',
    margin: '0',
    padding: '0 8px',
    borderWidth: '1.5px',
    borderStyle: 'solid',
    borderColor: YAP_PALETTE.ink,
    borderRadius: '6px',
    outline: 'none',
    background: YAP_PALETTE.paper,
    color: YAP_PALETTE.ink,
    textAlign: 'center',
  });
  yapSetFieldFont(input);

  const place = (box: YapFieldBox): void => {
    const canvas = scene.game.canvas.getBoundingClientRect();
    input.style.left = `${canvas.left + box.x}px`;
    input.style.top = `${canvas.top + box.y - box.height / 2}px`;
    input.style.width = `${box.width}px`;
    input.style.height = `${box.height}px`;
  };

  let open = true;
  const close = (): void => {
    if (!open) return;
    open = false;
    input.remove();
    options.onDone(input.value);
  };

  input.addEventListener('input', () => {
    const fitted = options.fit(input.value);
    if (fitted !== input.value) input.value = fitted;
  });
  input.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'enter') close();
  });
  input.addEventListener('blur', close);

  place(options.box);
  document.body.append(input);
  input.focus();
  return { place, close };
}
