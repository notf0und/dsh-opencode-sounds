# Audio asset provenance

The files in this directory are opencode's notification sounds, copied verbatim.

- Source: <https://github.com/anomalyco/opencode>
- Path: `packages/ui/src/assets/audio/`
- Tag: `v1.18.32` (commit `545f51d26cc39a907d2867492d498d9607ea5fa4`)
- Retrieved: from `https://raw.githubusercontent.com/anomalyco/opencode/v1.18.32/packages/ui/src/assets/audio/<name>`
- License: MIT (opencode's `LICENSE`)

Both encodings opencode ships are kept:

- `<name>.mp3` — MPEG layer III, 56 kbps, 44.1 kHz mono, with an ID3v2.4 tag.
  **These are the files embedded into `lib/client.js`** by `tools/build-sounds.mjs`
  (MP3 decodes everywhere in Web Audio, unlike raw ADTS AAC).
- `<name>.aac` — raw MPEG-4 ADTS AAC, 44.1 kHz mono. Kept so the set stays a faithful mirror of
  opencode's assets; not embedded.

Families and their option ids (`sound.option.*` in opencode's i18n):

| Files | Ids | Count |
|---|---|---|
| `alert-01.mp3` … `alert-10.mp3` | `alert-01` … `alert-10` | 10 |
| `bip-bop-01.mp3` … `bip-bop-10.mp3` | `bip-bop-01` … `bip-bop-10` | 10 |
| `staplebops-01.mp3` … `staplebops-07.mp3` | `staplebops-01` … `staplebops-07` | 7 |
| `nope-01.mp3` … `nope-12.mp3` | `nope-01` … `nope-12` | 12 |
| `yup-01.mp3` … `yup-06.mp3` | `yup-01` … `yup-06` | 6 |

opencode's built-in "OpenCode Default" pack (`packages/tui/src/attention.ts`) maps:

| opencode sound name | File |
|---|---|
| `default` | `bip-bop-01.mp3` |
| `question` | `bip-bop-03.mp3` |
| `permission` | `staplebops-06.mp3` |
| `error` | `nope-03.mp3` |
| `done` | `bip-bop-01.mp3` |
| `subagent_done` | `yup-01.mp3` |

## Updating the pack

1. Copy the new/updated files from opencode's `packages/ui/src/assets/audio/` into this
   directory, keeping the `<name>.mp3` / `<name>.aac` naming.
2. Update the tag/commit above.
3. Run `npm run build` to re-embed the MP3s into `lib/client.js`, then `npm test`.

If a family gains or loses files, update both `SOUND_GROUPS` in `lib/client.js` (the single
source of truth for the pack layout) and the table above.
