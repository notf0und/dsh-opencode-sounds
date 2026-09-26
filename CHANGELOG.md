# Changelog

This project is a fork of [`@ai-galaxy/dsh-sound`](https://github.com/AI-Galaxy-GPU/dsh-sound).
The entries below 0.1.0 are the upstream history (translated to English); they are kept so the
provenance of the event-detection engine stays readable. Upstream changes are pulled with
`git fetch upstream && git merge upstream/main`.

## 0.1.1 (fork) — label and default tweaks

- Renamed the settings menu entry to **Sounds** and the master switch to **Enabled**.
- Renamed the completion event label to **Completed** and goal blocked to **Blocked**
  (the completion row previously rendered the raw `sound.complete` i18n key, because that
  dictionary entry was dropped along with the old sound names in 0.1.0).
- Main-agent defaults: plan review is now `bip-bop-05` (was `bip-bop-03`) and failure is
  `nope-07` (was `nope-03`). Goal blocked keeps `nope-03`.

## 0.1.0 (fork) — opencode sound pack

- Replaced the built-in Web Audio synthesized chimes (ding / chime / bell / complete / success)
  with **opencode's notification sound pack**: 45 sounds across `alert`, `bip-bop`,
  `staplebops`, `nope` and `yup`, embedded as base64 MP3 data URLs in `lib/client.js`.
- Sound options and defaults now match opencode: `done`/`default` → `bip-bop-01`,
  `question` → `bip-bop-03`, `permission` → `staplebops-06`, `error` → `nope-03`,
  `subagent_done` → `yup-01`.
- Event-to-sound mapping: completion → `bip-bop-01`; approval → `staplebops-06`;
  question and plan review → `bip-bop-03`; goal blocked and failure → `nope-03`;
  subagent completion → `yup-01`; other subagent events stay silent.
- Sound selection is now a **dropdown** (opencode's packed list is far too long for the old
  segmented Radio.Button group); a **Play** button lets you replay the current sound.
- Translated the whole plugin to English: source comments, README, changelog and UI strings.
  Removed the Chinese dictionary and the pt-BR / es dictionaries (English only).
- Renamed the package, settings namespace, localStorage key (`dsh-opencode-sounds:config`),
  IndexedDB store (`dsh-opencode-sounds-audio`), BroadcastChannel and module-loader id from
  `dsh-sound` / `@ai-galaxy/dsh-sound` to `dsh-opencode-sounds`.
- Kept the **Local file** option as an extra choice alongside the opencode pack.
- Added `tools/build-sounds.mjs` to re-embed `assets/audio/*.mp3` into `lib/client.js`
  (and `npm run check` verifies the embedded pack is current).
- Rewrote the client test suite for the embedded pack; host and client tests pass.

---

## Upstream history

### 0.4.1 (2026-09-13) — DSH STORE contract compliance

- Manifest gained canonical `repository` / `homepage` / `bugs` matching the GitHub identity.
- Added `dsh.compatibility.dshReleases`: `0.1.5-alpha.1` / `0.1.5-alpha.2` / `0.1.5-rc.1` /
  `0.1.5-rc.2` are declared `compatible` (each verified through a disposable profile's
  install / boot / uninstall cycle).
- README gained compatibility scope, dependencies, capabilities and permissions, failure
  bounds and a verification record.

### 0.4.0 (2026-09-12) — independent subagent event channel

- New "Subagent events" section: completion / approval / question / plan review / goal
  blocked / failure each have their own sound and volume, all silent by default; an
  "Ignore subagent events" switch at the top of the section silences the whole channel.
- Two-way subagent origin detection: one-shot subagent jobs (`session/jobs` frames with
  `job.kind === 'subagent'`) and subagent sessions (list rows with `origin === 'subagent'` /
  `parentId`), on both the mux event stream and the snapshot fallback; main-agent behaviour is
  unchanged. Fixes parallel subagents all ringing the completion sound (#3).
- Package renamed to `@ai-galaxy/dsh-sound` (the npm name `dsh-sound` was a third-party
  placeholder); `cordis.patch.yml`'s bundle resolution name was updated to match, and the
  install command became `dsh plugin --profile web add @ai-galaxy/dsh-sound`
  (`github:AI-Galaxy-GPU/dsh-sound` before the release).
- The client module registration id changed to `@ai-galaxy/dsh-sound` as well: DSH's
  client-modules waits for registration under the full package name, so keeping the old id
  would break the whole plugin load.
- Config gained 13 fields (`ignoreSubagent`, six subagent sounds, six subagent volumes); older
  configs are backfilled with defaults on read; `localFiles` gained `subagent-<kind>` keys;
  export / import covers the new fields automatically.
- The settings page became two tabs, **Main agent / Subagents**: the master switch and
  import/export stay visible, the subagent tab holds the six event rows plus the
  "ignore subagent events" switch, instead of stacking two long lists vertically.
- Host settings schema and `lib/types/index.d.ts` were updated to match.

### 0.3.3 (2026-08-16)

- Switching between a built-in sound and "Local file" keeps the chosen file (the IndexedDB /
  data URL entry is not deleted); switching back restores the original file.
- The settings-page volume slider got longer.

### 0.3.2 (2026-08-16) — settings page became Setting-Cell

- The settings page became a vertical hairline list: one master-switch row, six event rows
  (title + volume, with a Radio.Button group below), one import/export row.
- Sound selection used Radio.Group + Radio.Button segmented buttons; clicking selected and
  played the sound (silent stayed silent).
- The choose/replace control and filename only expand below a row once "Local file" is selected.

### 0.3.1 (2026-08-16) — fewer false rings

- `turn/end` is split by `reason.kind`: `completed` rings the completion sound, `error` rings
  the failure sound, and `aborted` / `blocked` / `max-tokens` / `interrupted` stay silent
  (pressing stop no longer counts as "answer complete").
- Background jobs that end `killed` are silent instead of using the completion sound.
- `approval/requested` / `question/requested` frames replayed when the mux opens (refresh
  recovery) do not ring; the same `rpcId` rings only once, so reconnects do not re-ring.
- Subscribed to `events.host` for `host/agent-error` (loop failures with no turn position).
- Plan review prefers the list snapshot's `pendingInteraction`, aligning with SessionManager.
- A single tab no longer waits 40ms for an empty BroadcastChannel handshake; the handshake
  only happens once a peer tab is confirmed.
- When mux frames repeatedly fail to yield a `type`, the plugin gives up on the event stream
  and degrades to session-snapshot diffing.

### 0.3.0 (2026-08-16) — simplification

- The six events (completion / approval / question / plan review / goal blocked / task
  failure) became fully independent: each configures its own sound and volume, dropping the
  "generic attention sound / follow" structure.
- Per-event volume (0–100% slider, six of them) replaced the global volume.
- The settings panel's sound selection changed from a dropdown to a radio single-select group
  (ding-dong / chime / bell / complete / success / mute / local file); choosing "Local file"
  revealed a file selector under that event row, and uploads went to IndexedDB (recording the
  filename and showing the selected file).
- Removed the "preview" button: clicking the selected sound option (or the selected filename)
  plays directly; the local-file row became a "Choose/Replace audio file…" button plus a
  clickable (▶) filename.
- Fixed a watcher state-table memory leak: the mux / snapshot paths now prune job / goal /
  running / pending state for disposed sessions against the current session list, so it can no
  longer grow without bound.
- Cross-tab dedupe: a BroadcastChannel broadcasts a "play intent" so one event rings in only
  one tab (random nonce tie-break; a 40ms handshake window that a lone tab barely notices).
- mux reconnect exponential backoff: 800ms doubling to a 30s cap, reset as soon as a frame
  arrives (previously a fixed 800ms spin).
- Malformed job frame defence (missing id / null ignored without crashing); package-lock.json
  version synced to 0.3.0.
- Fixed local files (MP3 etc.) not playing on events: the playback path moved from
  HTMLAudioElement (limited by autoplay policy) to Web Audio `decodeAudioData` + BufferSource,
  sharing the already-unlocked AudioContext with the built-in synthesized sounds; falls back to
  an Audio element when Web Audio decoding is unavailable; decoded results are cached per file.
- **Fixed event detection being completely broken (important)**: at runtime `events.mux`
  produces RpcRequest **envelopes** (the frame lives in `envelope.payload`), and parsing the
  envelope as a frame made every event be ignored (panel clicks rang, real events were silent).
  Envelopes are now unwrapped, with bare legacy frames still accepted.
- Removed voice announcements (TTS): voice / voiceName / voiceRate / attentionPhrase and the
  whole voice settings section were deleted.
- Removed per-workspace configuration (workspaces) and the merge window (debounceMs): events
  play immediately, keeping only a 400ms same-source debounce against duplicate frames rather
  than merging different events.
- Older configs migrate automatically: `defaultSound` → `completionSound`, voice values
  degrade to each kind's default sound, and workspaces / debounceMs / global volume and other
  legacy fields are ignored.
- Host schema updated to the six sound + six volume fields.

### 0.2.0 (2026-08-16) — optimization pass

- Event detection upgraded to the connection-layer event stream (`events.mux` frame-level
  monitoring): turn ends, job status transitions, goal projections and approval/question
  requests are detected per frame, so fast tasks that "complete as soon as they are created"
  are no longer missed; falls back to snapshot diffing when the stream is unavailable.
- Merge window: multiple events within the same `debounceMs` (default 400ms, configurable
  0–5000) ring only the highest-priority sound (failure > goal blocked > approval/question/plan
  review > completion) instead of ringing over each other or swallowing one another.
- Global volume (0–100%) applied uniformly to synthesized sounds / TTS / custom audio.
- Per-workspace attention sound overrides: `workspaces` rows gained `attentionSound`, so that
  workspace's approval/question/failure events prefer the workspace attention sound, then the
  global one.
- Local music import: uploads stored in IndexedDB (`dsh-sound-audio`), escaping the 5MB
  localStorage quota.
- Config import/export: the full config downloads as JSON (audio refs inlined as data URLs)
  and can be restored.
- Periodic debounce-table pruning (5-minute window), fixing a memory leak from unbounded
  session/job keys.

### 0.1.0 (2026-08-16)

- Plugin name, settings namespace, localStorage key (`dsh-sound:config`) and
  settings.section contribution id were `dsh-sound`.
- The settings panel title was "Sound notifications".

### 1.0.0 (2026-08-14)

- Per-workspace task completion ringtone: played on turn end (`running: true → false`) and
  when a background job completed.
- Five built-in Web Audio synthesized ringtones (ding-dong / chime / bell / complete /
  success) plus mute.
- Voice announcements: browser TTS (system Chinese voice) reading custom text, with optional
  voice and rate.
- Custom audio: upload any audio file (stored in the browser as a data URL).
- Attention sounds for events needing a human (always ring, not subject to "quiet current
  session"):
  - approval request (`pendingInteraction: approval`)
  - user question (`question`)
  - plan review (`plan-review`)
  - goal blocked (goal projection enters `blocked`)
  - background job failure (distinct from normal completion, with its own failure sound)
- Each attention event could override its sound individually or follow the generic attention
  sound; shared voice announcement text was supported.
- Settings panel (Settings → notification ringtone): master switch, completion ringtone
  (default + per workspace), attention ringtone (generic + five kinds), voice settings
  (voice / rate / preview / refresh list), upload and preview.
- Config persisted in browser localStorage; the host registered the `dsh-sound` settings
  namespace (the rc.6 settings API allowlist does not expose third-party namespaces to
  browsers; the registration reserved the migration path).
- Published as a bundle: install with `dsh plugin --profile <name> add dsh-sound`.
