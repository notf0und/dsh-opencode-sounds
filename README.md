# dsh-opencode-sounds

A DeepSeek Harness (DSH) **Web UI** plugin that plays [opencode](https://github.com/anomalyco/opencode)'s
notification sound pack when a task finishes or something needs a human.

It is a fork of [`@ai-galaxy/dsh-sound`](https://github.com/AI-Galaxy-GPU/dsh-sound) (MIT) that
replaces the built-in synthesized chimes with opencode's real audio assets, and makes the
plugin English-only. The event-detection engine, the settings panel and the subagent channel
come from upstream; the sound pack, the defaults and the translations are this fork's.

## Sound pack

Built-in sounds are exactly opencode's, in opencode's order:

| Family | Count | Ids |
|---|---|---|
| Alert | 10 | `alert-01` … `alert-10` |
| Bip-bop | 10 | `bip-bop-01` … `bip-bop-10` |
| Staplebops | 7 | `staplebops-01` … `staplebops-07` |
| Nope | 12 | `nope-01` … `nope-12` |
| Yup | 6 | `yup-01` … `yup-06` |

Plus **None** (silent) and **Local file** (your own audio file, stored in the browser).

The MP3s live in `assets/audio/` and are inlined into `lib/client.js` as base64 data URLs by
`tools/build-sounds.mjs`, because the DSH client loads a plugin as a single CJS factory with no
relative-module resolver.

## Defaults

Defaults mirror opencode's built-in **"OpenCode Default"** sound pack
(`packages/tui/src/attention.ts` at the tag recorded in `assets/audio/PROVENANCE.md`):

| DSH event | Detection | opencode source | Default sound |
|---|---|---|---|
| Completion | `turn/end` `reason.kind === 'completed'`; job → `completed` | `done` / `default` | `bip-bop-01` |
| Approval request | `approval/requested` frame | `permission` | `staplebops-06` |
| User question | `question/requested`, not plan-review shaped | `question` | `bip-bop-03` |
| Plan review | `question/requested` classified as plan-review | `question` | `bip-bop-05` |
| Goal blocked | goal projection enters `blocked` | `error` | `nope-03` |
| Failure | job → `failed`; `turn/end` `error`; `host/agent-error` | `error` | `nope-07` |

### Separate subagent channel

Subagent-originated events (one-shot `kind: 'subagent'` jobs and sessions marked
`origin: 'subagent'` / `parentId`) have their own sounds and volumes:

| Subagent event | Default sound |
|---|---|
| Completion | `yup-01` (opencode's `subagent_done`) |
| Approval / question / plan review / goal blocked / failure | `none` (silent) |

An **Ignore subagent events** switch silences the whole channel at once.

## Features

- Six fully independent events, each with its own sound and volume (0–100%).
- Completion respects **quiet current session**; attention events always ring.
- User aborts, killed jobs, and `max-tokens` / `blocked` / `interrupted` turns stay silent.
- Detection adapts to the DSH build: where the connection layer exposes an event stream
  (`events.mux` + `events.host`) it is used, with mux-open replay staying silent and each
  `rpcId` ringing at most once; on builds without it (0.1.5-rc.3 and later) the plugin reads the
  client-side fact sources directly (see below).
- Nothing that is already true when the page loads rings: a request already pending, a goal
  already blocked or a job already failed is seeded silently.
- Multiple tabs: the same event rings once (BroadcastChannel tie-break); a lone tab plays
  immediately with no handshake.
- Config export/import as JSON (IndexedDB audio refs are inlined as data URLs).

## How each sound is detected

| Event | Source (DSH 0.1.5-rc.3+) |
|---|---|
| Completion | `turn/end` `completed` in the session's own event window; the list `running` edge as a deferred fallback for sessions whose window is not staged |
| Failure | `turn/end` `error`, `SessionSnapshot.lastAgentError`, or a background job reaching `failed` |
| Approval | `uiSession.pendingInteractions`, kind `approval` |
| User question | `uiSession.pendingInteractions`, kind `question` |
| Plan review | `uiSession.pendingInteractions`, kind `plan-review` |
| Goal blocked | the goal projection (`projectionValues.goal.goal.phase`) entering `blocked` |
| Silent by design | turn ends `aborted` / `blocked` / `max-tokens` / `interrupted`, and jobs `killed` |

Approval, question and plan review are published by the interaction domains themselves, so the
plugin does not re-derive them from frame shapes. On DSH builds that still expose
`connection.api.events.mux`, the original frame-based watcher runs instead.

## Settings panel

Settings → **Sounds**. A master **Enabled** switch turns the whole plugin on or off, and a
**Main agent / Subagents** tab bar switches between the
six main event rows and the subagent panel. Each row has a sound dropdown (opencode's whole
pack, then None, then Local file), a **Play** button, and a volume slider; picking a sound
previews it. Choosing **Local file** reveals a file picker; the file is stored in IndexedDB
(`dsh-opencode-sounds-audio`), so the localStorage quota never limits it.

## Install

Requires a DSH version with bundle-plugin support (`dsh.profile.bundles` + `dsh.bundle.patch`)
and `pnpm` on PATH (`corepack enable` or `npm i -g pnpm`).

```sh
# From this checkout
dsh plugin --profile web add file:/home/gonzalo/code/dsh-opencode-sounds

# Or from GitHub
dsh plugin --profile web add github:notf0und/dsh-opencode-sounds
```

Then restart `dsh web` (or refresh the page) and open Settings → Sounds.

### Manual install

1. Add the package to `$DSH_HOME/profiles/web/package.json` — both a dependency and a bundle:
   ```json
   "dependencies": { "dsh-opencode-sounds": "file:/home/gonzalo/code/dsh-opencode-sounds" },
   "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-opencode-sounds"] } }
   ```
2. `pnpm --dir "$DSH_HOME/profiles/web" install`
3. Remove the old plugin: `dsh plugin --profile web remove @ai-galaxy/dsh-sound`
4. Restart `dsh web`.

> The profile uses `nodeLinker: hoisted`, which **copies** `file:` dependencies into
> `node_modules` at install time. Edits to this checkout do not reach the running app until you
> re-run `pnpm --dir "$DSH_HOME/profiles/web" install` (or replace the copied directory with a
> symlink). The web server reads bundle content per request, so a browser hard-refresh is
> enough afterwards — no server restart needed.

## Configuration storage

- Client config: **localStorage**, key `dsh-opencode-sounds:config`, sanitized on every read.
- Local audio files: **IndexedDB**, `dsh-opencode-sounds-audio`.
- Sound values: an opencode pack id, `none`, `local`, a `data:` URL, or an `audio:<id>` ref.
- Fields: `enabled`, `quietCurrent`, `ignoreSubagent`, the six main sound + volume pairs
  (`completionSound` … `failureSound`, `completionVolume` … `failureVolume`) and the six
  subagent pairs (`subagentCompletionSound` … `subagentFailureVolume`). `localFiles` keeps the
  last chosen local file per event so switching away and back does not drop it.
- The host also registers the `dsh-opencode-sounds` settings namespace. The rc.6 settings API
  allowlist (`WEB_SETTINGS_NAMESPACES`) does not expose third-party namespaces to browsers, so
  the client uses localStorage today; the registration keeps the migration path open.

## Development

```sh
npm install
npm test        # host + client behavioural tests (Node only, no browser needed)
npm run check   # syntax check plus a check that the embedded pack is up to date
npm run build   # re-embed assets/audio/*.mp3 into lib/client.js
```

Layout:

- `lib/index.js` — host half: registers the settings namespace (schema + defaults)
- `lib/client.js` — browser bundle: event detection, sound engine, settings panel
- `lib/types/index.d.ts` — host-side type declarations
- `assets/audio/` — opencode's sound files (`.mp3` embedded, `.aac` kept alongside)
- `cordis.patch.yml` — bundle patch layer (inserts the `dsh-opencode-sounds` row)
- `tools/` — tests, the sound-pack builder, verification scripts

## Keeping up with upstream

This repo is a fork, so upstream fixes stay easy to pull. `origin` is this fork and `upstream`
is the original plugin:

```sh
git remote -v
# origin    git@github.com:notf0und/dsh-opencode-sounds.git   (this fork)
# upstream  https://github.com/AI-Galaxy-GPU/dsh-sound.git    (original)

git fetch upstream
git merge upstream/main      # or: git rebase upstream/main
```

Most upstream work lands in the event-detection engine, where this fork is untouched; conflicts
are normally confined to the sound definitions, the defaults and the settings UI. After a merge,
re-run `npm run build && npm test`.

Updating the sound pack itself means fetching new files from opencode and re-embedding them:

```sh
# copy new audio into assets/audio/, refresh PROVENANCE.md, then:
npm run build && npm test
```

## Attribution & license

- Forked from [`@ai-galaxy/dsh-sound`](https://github.com/AI-Galaxy-GPU/dsh-sound) — MIT.
- Sound files from [opencode](https://github.com/anomalyco/opencode)
  (`packages/ui/src/assets/audio`, tag `v1.18.32`) — MIT. See `assets/audio/PROVENANCE.md`.
- This fork: [MIT](LICENSE).
