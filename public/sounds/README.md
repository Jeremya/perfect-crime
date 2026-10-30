# Perfect Crime — sounds (story C8)

Six short sound cues, wired to game events by `src/game/sound.ts`.

| File         | Cue    | Played when                                    | Length |
| ------------ | ------ | ---------------------------------------------- | ------ |
| `step.wav`   | step   | the drawn path gains a cell                    | 35 ms  |
| `tap.wav`    | tap    | a button is pressed                            | 45 ms  |
| `play.wav`   | play   | PLAY is pressed                                | 170 ms |
| `loot.wav`   | loot   | the thief picks up the diamond during playback | 220 ms |
| `caught.wav` | caught | the thief is detected                          | 320 ms |
| `win.wav`    | win    | the heist is won                               | 480 ms |

Format: WAV, PCM 16-bit, mono, 16 kHz, about 41 KB for the six files.

## Provenance and licence

Made by Yap Corp for Perfect Crime: each file was synthesized from scratch
(sine tones with a few harmonics and short envelopes) by a one-off Node
script. No sample, recording or third-party asset is used. The sounds are
royalty-free, have no licence to track, and are dedicated to the public
domain under CC0 1.0, as the Gate 1 spec requires.
