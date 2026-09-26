// Client-half logic smoke test for dsh-opencode-sounds
// (run with: node tools/test-client.mjs)
//
// Simulates the browser module loader plus a fake ctx, observes playback
// through fake Web Audio / XHR captures (embedded MP3 data URLs), reads config
// from a fake localStorage and renders the settings UI with a fake React.
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

let failures = 0
const ok = (cond, label) => {
  if (cond) console.log('PASS', label)
  else { failures++; console.log('FAIL', label) }
}

// ----- the embedded opencode pack, read straight out of the bundle ----------
const SOUND_SRC = (() => {
  const m = source.match(/var SOUND_SRC = (\{[\s\S]*?\n    \})/)
  if (!m) throw new Error('lib/client.js: embedded SOUND_SRC not found (run tools/build-sounds.mjs)')
  return new Function(`return ${m[1]}`)()
})()
const SRC_KEY = Object.fromEntries(Object.entries(SOUND_SRC).map(([k, v]) => [v, k]))
const keyOf = (url) => SRC_KEY[url]
const PACK_KEYS = Object.keys(SOUND_SRC)

// opencode's SOUND_OPTIONS order: None, alert, bip-bop, staplebops, nope, yup.
const EXPECTED_OPTIONS = ['none']
for (const [prefix, count] of [['alert', 10], ['bip-bop', 10], ['staplebops', 7], ['nope', 12], ['yup', 6]]) {
  for (let i = 1; i <= count; i++) EXPECTED_OPTIONS.push(`${prefix}-${i < 10 ? '0' + i : i}`)
}

// opencode "OpenCode Default" pack defaults, as mapped onto the six dsh kinds.
const DEFAULT_MAP = {
  completion: 'bip-bop-01',
  approval: 'staplebops-06',
  question: 'bip-bop-03',
  'plan-review': 'bip-bop-03',
  'goal-blocked': 'nope-03',
  failure: 'nope-03',
}

// ----- fresh environment per scenario ---------------------------------------
function makeEnv(seededConfig, withMux, withBroadcast, noAudioContext) {
  const registered = {}
  const bufferPlays = []
  const audioPlays = []
  const xhrUrls = []
  const gains = []
  const timers = []
  const storage = new Map()
  storage.set('dsh-opencode-sounds:config', JSON.stringify(seededConfig || {}))
  let timerSeq = 0
  const bcInstances = new Map()
  const fakeWindow = {
    __ModuleLoader__: { load: (entry) => { registered[entry.id] = entry } },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => { storage.set(k, v) },
    },
    setTimeout: (fn, ms) => {
      const t = { id: ++timerSeq, fn, ms: typeof ms === 'number' ? ms : 0, cleared: false, fired: false }
      timers.push(t)
      return t.id
    },
    clearTimeout: (id) => { const t = timers.find((x) => x.id === id); if (t) t.cleared = true },
    BroadcastChannel: withBroadcast ? class {
      constructor(name) {
        this.name = name
        if (!bcInstances.has(name)) bcInstances.set(name, [])
        bcInstances.get(name).push(this)
      }
      postMessage(data) {
        for (const other of bcInstances.get(this.name) || []) {
          if (other !== this && typeof other.onmessage === 'function') other.onmessage({ data })
        }
      }
    } : undefined,
    AudioContext: noAudioContext ? undefined : class {
      constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {} }
      resume() { return Promise.resolve() }
      // The fake XHR hands over { url }, so the decoded buffer can identify its source.
      decodeAudioData(buf, ok) { ok({ duration: 1, src: buf && buf.url }) }
      createBufferSource() {
        return { buffer: null, connect() {}, start() { bufferPlays.push(this.buffer) } }
      }
      createGain() {
        const node = { connect() {}, gain: {} }
        let value = 0
        Object.defineProperty(node.gain, 'value', { get: () => value, set: (v) => { value = v; gains.push(v) } })
        return node
      }
    },
    XMLHttpRequest: class {
      open(method, url) { this.url = url }
      send() {
        xhrUrls.push(this.url)
        this.status = 200
        this.response = { url: this.url }
        if (this.onload) this.onload()
      }
    },
    Audio: class {
      constructor(url) { this.url = url }
      play() { audioPlays.push(this.url); return Promise.resolve() }
    },
    FileReader: class {},
  }
  const created = []
  const hookState = []
  let hookCursor = 0
  const react = {
    createElement: (type, props, ...children) => {
      const node = { type, props: props || {}, children }
      created.push(node)
      if (typeof type === 'function') return type(Object.assign({}, props, { children }))
      return node
    },
    useState: (v) => {
      const i = hookCursor++
      if (hookState[i] === undefined) hookState[i] = typeof v === 'function' ? v() : v
      return [hookState[i], (nv) => { hookState[i] = typeof nv === 'function' ? nv(hookState[i]) : nv }]
    },
    useEffect: () => {},
    useRef: () => ({ current: null }),
  }

  const factoryFn = new Function('window', source + '\n')
  factoryFn(fakeWindow)
  const entry = registered['dsh-opencode-sounds']
  if (!entry) throw new Error('client bundle must register under the package name (dsh-opencode-sounds)')
  const exportsObj = entry.factory((spec) => (spec === 'react' ? react : undefined))

  let sessionsSnap = {
    ids: ['s1'], byId: { s1: { id: 's1', running: false } }, current: 's1', jobsBySession: {},
  }
  let sessionsSub = null
  let effectDisposer = null
  let slotReg = null
  const dictionaries = new Map()
  const languages = new Map([['en', { id: 'en' }]].concat((seededConfig && seededConfig._localeLanguages) || []))
  const locale = {
    addLanguage(language) {
      if (languages.has(language.id)) throw new Error('duplicate language: ' + language.id)
      languages.set(language.id, language)
      return () => languages.delete(language.id)
    },
    register(namespace, language, dictionary) {
      dictionaries.set(namespace + '/' + language, dictionary)
      return () => dictionaries.delete(namespace + '/' + language)
    },
    bind(namespace) {
      return (key) => {
        const current = dictionaries.get(namespace + '/en')
        return (current && current[key]) || key
      }
    },
    getLocale: () => ({ locales: Array.from(languages.values()) }),
    getSnapshot: () => ({ active: 'en', revision: 0 }),
    subscribe: () => () => {},
  }
  const muxQueue = []
  const muxWaiters = []
  const muxIterable = {
    [Symbol.asyncIterator]() { return this },
    next() {
      if (muxQueue.length > 0) return Promise.resolve({ value: muxQueue.shift(), done: false })
      return new Promise((resolve) => muxWaiters.push(resolve))
    },
    return() { return Promise.resolve({ done: true }) },
  }
  const muxDeliver = (result) => {
    if (muxWaiters.length > 0) muxWaiters.shift()(result)
    else muxQueue.push(result)
  }
  const muxPush = (frame) => muxDeliver({ value: frame, done: false })
  const muxEnd = () => muxDeliver({ value: undefined, done: true })
  const hostQueue = []
  const hostWaiters = []
  const hostIterable = {
    [Symbol.asyncIterator]() { return this },
    next() {
      if (hostQueue.length > 0) return Promise.resolve({ value: hostQueue.shift(), done: false })
      return new Promise((resolve) => hostWaiters.push(resolve))
    },
    return() { return Promise.resolve({ done: true }) },
  }
  const hostDeliver = (result) => {
    if (hostWaiters.length > 0) hostWaiters.shift()(result)
    else hostQueue.push(result)
  }
  const hostPush = (frame) => hostDeliver({ value: frame, done: false })

  const ctx = {
    locale,
    sessions: {
      list: { getSnapshot: () => sessionsSnap, subscribe: (fn) => { sessionsSub = fn; return () => {} } },
    },
    effect: (fn) => { effectDisposer = fn() },
    slots: {
      inject: (name, cb) => { slotReg = { name, registration: cb() } },
      register: (opts, comp) => ({ opts, comp }),
    },
    connection: withMux
      ? { api: { events: { mux: () => muxIterable, host: () => hostIterable } } }
      : undefined,
  }

  const drive = (next) => { sessionsSnap = next; if (sessionsSub) sessionsSub() }
  const row = (extra) => Object.assign({ id: 's1', running: false }, extra)

  const renderSection = (preserveHooks) => {
    created.length = 0
    hookCursor = 0
    if (!preserveHooks) hookState.length = 0
    const Section = slotReg && slotReg.registration && slotReg.registration.comp
    if (Section) Section({})
  }

  // Every buffer that reached an AudioBufferSourceNode identifies its source URL,
  // so cached replays are observable too.
  const playedUrls = () => bufferPlays.map((b) => (b && b.src) || null)
  const playedKeys = () => playedUrls().map(keyOf).filter(Boolean)

  return {
    exportsObj, ctx, drive, row,
    gains, audioPlays, bufferPlays, xhrUrls, timers, storage, created, dictionaries, languages,
    playedUrls, playedKeys,
    getEffectDisposer: () => effectDisposer,
    getSlotReg: () => slotReg,
    renderUI: () => renderSection(false),
    rerenderUI: () => renderSection(true),
    fireTimers: () => timers.forEach((t) => { if (!t.cleared && !t.fired) { t.fired = true; t.fn() } }),
    fireTimersMs: (ms) => timers.forEach((t) => { if (!t.cleared && !t.fired && t.ms === ms) { t.fired = true; t.fn() } }),
    pendingTimersMs: (ms) => timers.filter((t) => !t.cleared && !t.fired && t.ms === ms),
    muxPush, muxEnd, hostPush,
    setSessionIds: (ids) => { sessionsSnap.ids = ids },
    getBroadcastClass: () => fakeWindow.BroadcastChannel,
    countOf: (pred) => created.filter(pred).length,
  }
}

const configOf = (env) => JSON.parse(env.storage.get('dsh-opencode-sounds:config'))
const optionValues = (env) => env.created.filter((n) => n.type === 'option').map((n) => n.props.value)
const selects = (env) => env.created.filter((n) => n.type === 'select')
const tick = () => new Promise((r) => setTimeout(r, 0))
const turnEnd = (sid, kind) => ({
  type: 'session/event', sessionId: sid,
  event: { type: 'turn/end', seq: 1, time: 1, data: { turn: 1, reason: { kind } } },
})

// ===========================================================================
// 1) exports, slot registration, embedded pack integrity
// ===========================================================================
{
  const env = makeEnv(undefined)
  ok(typeof env.exportsObj.apply === 'function', 'client exports apply')
  ok(Array.isArray(env.exportsObj.inject) && env.exportsObj.inject.includes('sessions'), 'client inject includes sessions')
  ok(env.exportsObj.inject.includes('connection'), 'client inject includes connection')
  ok(PACK_KEYS.length === 45, 'embedded pack carries 45 opencode sounds')
  const missing = PACK_KEYS.filter((k) => !(SOUND_SRC[k] || '').startsWith('data:audio/mpeg;base64,'))
  ok(missing.length === 0, 'every embedded sound is a base64 MPEG data URL')
  env.exportsObj.apply(env.ctx)
  const slotReg = env.getSlotReg()
  ok(slotReg && slotReg.name === 'settings.section', 'registered into settings.section slot')
  ok(slotReg.registration.opts.id === 'dsh-opencode-sounds', 'section id is dsh-opencode-sounds')
  ok(typeof slotReg.registration.opts.label() === 'string', 'section label thunk returns a string')
  const dict = env.dictionaries.get('dsh-opencode-sounds/en')
  ok(!!dict && dict['section.title'] === 'Sound notifications', 'English dictionary registered under the new namespace')
  ok(!env.languages.has('zh'), 'no Chinese locale is registered (English only)')
}

// ===========================================================================
// 2) snapshot fallback: defaults match opencode for every event kind
// ===========================================================================
{
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: true }) }, current: 'other', jobsBySession: {} })
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 'other', jobsBySession: {} })
  ok(env.playedKeys()[0] === DEFAULT_MAP.completion, `turn end plays the opencode default completion sound (${DEFAULT_MAP.completion})`)
}
{
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false, pendingInteraction: 'approval' }) }, current: 's1', jobsBySession: {} })
  ok(env.playedKeys()[0] === DEFAULT_MAP.approval, `approval plays the opencode permission sound (${DEFAULT_MAP.approval})`)
}
{
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false, pendingInteraction: 'question' }) }, current: 's1', jobsBySession: {} })
  ok(env.playedKeys()[0] === DEFAULT_MAP.question, `question plays the opencode question sound (${DEFAULT_MAP.question})`)
}
{
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false, pendingInteraction: 'plan-review' }) }, current: 's1', jobsBySession: {} })
  ok(env.playedKeys()[0] === DEFAULT_MAP['plan-review'], 'plan review plays the mapped opencode sound')
}
{
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false, projectionValues: { goal: { phase: 'blocked' } } }) }, current: 's1', jobsBySession: {} })
  ok(env.playedKeys()[0] === DEFAULT_MAP['goal-blocked'], `goal blocked plays the opencode error sound (${DEFAULT_MAP.failure})`)
}
{
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: { s1: [{ id: 'j1', kind: 'bash', label: 'x', status: 'running' }] } })
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: { s1: [{ id: 'j1', kind: 'bash', label: 'x', status: 'failed', finishedAt: 2 }] } })
  ok(env.playedKeys()[0] === DEFAULT_MAP.failure, `job failure plays the opencode error sound (${DEFAULT_MAP.failure})`)
}

// ===========================================================================
// 3) explicit pack sounds, silence, unknown values, custom data URLs
// ===========================================================================
{
  const env = makeEnv({ completionSound: 'alert-05' })
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: true }) }, current: 's1', jobsBySession: {} })
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: {} })
  ok(env.playedKeys()[0] === 'alert-05', 'a configured pack id plays that exact sound')
}
{
  const env = makeEnv({ completionSound: 'none' })
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: true }) }, current: 's1', jobsBySession: {} })
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: {} })
  ok(env.playedUrls().length === 0, '"none" stays silent')
}
{
  const env = makeEnv({ completionSound: 'not-a-real-sound' })
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: true }) }, current: 's1', jobsBySession: {} })
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: {} })
  ok(env.playedKeys()[0] === DEFAULT_MAP.completion, 'an unknown sound value is sanitized back to the default')
}
{
  const env = makeEnv({ completionSound: 'data:audio/mp3;base64,AAAA' })
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: true }) }, current: 's1', jobsBySession: {} })
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: {} })
  ok(env.xhrUrls[0] === 'data:audio/mp3;base64,AAAA' && env.bufferPlays.length === 1, 'a custom data URL is decoded and played through Web Audio')
}
{
  const env = makeEnv({ completionSound: 'data:audio/mp3;base64,BB' }, false, false, true)
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: true }) }, current: 's1', jobsBySession: {} })
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: {} })
  ok(env.audioPlays.length === 1 && env.audioPlays[0] === 'data:audio/mp3;base64,BB', 'without Web Audio it falls back to the Audio element')
}

// ===========================================================================
// 4) legacy config migration + garbage sanitization
// ===========================================================================
{
  const env = makeEnv({ defaultSound: 'alert-03', attentionSound: 'ding', volume: 0.5, debounceMs: 400, voiceName: 'X' })
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: true }) }, current: 's1', jobsBySession: {} })
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: {} })
  ok(env.playedKeys()[0] === 'alert-03', 'legacy defaultSound migrates into completionSound')
  ok(env.gains[0] === 1, 'legacy global volume is ignored (full volume kept)')
}
{
  const env = makeEnv({ defaultSound: 'voice:all done!', failureSound: 'voice' })
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: true }) }, current: 's1', jobsBySession: {} })
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: {} })
  ok(env.playedKeys()[0] === DEFAULT_MAP.completion, 'a legacy voice value degrades to the kind default')
}
{
  const env = makeEnv({ enabled: 'yes', completionVolume: 'loud', completionSound: 42 })
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: true }) }, current: 's1', jobsBySession: {} })
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: {} })
  ok(env.playedKeys()[0] === DEFAULT_MAP.completion, 'garbage config is sanitized to safe defaults')
}

// ===========================================================================
// 5) volumes and dedupe
// ===========================================================================
{
  const env = makeEnv({ completionSound: 'alert-01', completionVolume: 0.4, approvalVolume: 1 })
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: true }) }, current: 's1', jobsBySession: {} })
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: {} })
  ok(env.gains[0] === 0.4, 'completionVolume scales the playback gain')
}
{
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: true }) }, current: 's1', jobsBySession: {} })
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: {} })
  const after = env.playedUrls().length
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: true }) }, current: 's1', jobsBySession: {} })
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: {} })
  ok(env.playedUrls().length === after, 'a repeated turn end within the dedupe window is suppressed')
}
{
  const env = makeEnv({ quietCurrent: true })
  env.exportsObj.apply(env.ctx)
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: true }) }, current: 's1', jobsBySession: {} })
  env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: {} })
  ok(env.playedUrls().length === 0, 'quietCurrent keeps the session being viewed silent')
}

// ===========================================================================
// 6) settings UI: opencode option list, defaults, switching, local file
// ===========================================================================
{
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.renderUI()
  const values = optionValues(env)
  const firstRow = values.slice(0, 47)
  ok(firstRow.slice(0, 46).join(',') === EXPECTED_OPTIONS.join(','), 'the dropdown lists opencode options in opencode order (None first)')
  ok(firstRow[46] === 'local', 'the local-file option is offered last')
  const dropdowns = selects(env)
  ok(dropdowns.length === 6, 'six event rows each render a dropdown')
  ok(dropdowns[0].props['data-kind'] === 'completion' && dropdowns[1].props['data-kind'] === 'approval', 'dropdowns are named per event kind')
  ok(dropdowns[0].props.value === DEFAULT_MAP.completion, 'the completion dropdown shows the opencode default')
  ok(env.created.filter((n) => n.type === 'input' && n.props.type === 'file' && n.props.accept === 'audio/*').length === 0, 'no file picker while a pack sound is selected')
}
{
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.renderUI()
  const dropdown = selects(env)[0]
  dropdown.props.onChange({ target: { value: 'yup-04' } })
  ok(configOf(env).completionSound === 'yup-04', 'choosing a pack sound stores it in the config')
  ok(env.playedKeys().includes('yup-04'), 'choosing a pack sound previews it immediately')
  ok(env.created.filter((n) => n.type === 'button' && n.children[0] === 'Play').length >= 6, 'each row offers a Play button')
}
{
  const env = makeEnv({ completionSound: 'audio:a1', failureSound: 'data:audio/mp3;base64,AA' })
  env.exportsObj.apply(env.ctx)
  env.renderUI()
  const audioInputs = env.created.filter((n) => n.type === 'input' && n.props.type === 'file' && n.props.accept === 'audio/*')
  ok(audioInputs.length === 2, 'file pickers appear for events backed by a local file')
  ok(selects(env)[0].props.value === 'local', 'events backed by a local file show the local-file option')
  const names = env.created.filter((n) => n.type === 'span' && n.props.className === 'dns-notify-file-name')
  ok(names.length === 2, 'file rows show a clickable file name')
  names[1].props.onClick()
  ok(env.xhrUrls[0] === 'data:audio/mp3;base64,AA' && env.bufferPlays.length === 1, 'clicking the chosen file name decodes and plays it')
}
{
  const env = makeEnv({ completionSound: 'audio:a1' })
  env.exportsObj.apply(env.ctx)
  env.renderUI()
  selects(env)[0].props.onChange({ target: { value: 'alert-02' } })
  const afterBuiltin = configOf(env)
  ok(afterBuiltin.completionSound === 'alert-02', 'switching to a pack sound stores the pack id')
  ok(afterBuiltin.localFiles && afterBuiltin.localFiles.completion === 'audio:a1', 'the chosen local file is stashed, not dropped')
  env.renderUI()
  selects(env)[0].props.onChange({ target: { value: 'local' } })
  ok(configOf(env).completionSound === 'audio:a1', 'switching back to the local-file option restores the same file')
}
{
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.renderUI()
  const tabs = env.created.filter((n) => n.type === 'button' && n.props.role === 'tab')
  ok(tabs.length === 2 && tabs[0].props['aria-selected'] === 'true', 'main tab is active by default')
  tabs[1].props.onClick()
  env.rerenderUI()
  const subagentDropdowns = selects(env)
  ok(subagentDropdowns.length === 6 && subagentDropdowns[0].props['data-kind'] === 'subagent-completion', 'subagent tab renders six subagent rows')
  const picked = subagentDropdowns.map((d) => d.props.value)
  ok(picked.join(',') === 'yup-01,none,none,none,none,none', 'subagent defaults: completion audible, all other events silent')
  const switches = env.created.filter((n) => n.type === 'button' && n.props.role === 'switch')
  ok(switches.length === 2 && switches[1].props['aria-checked'] === 'false', 'the ignore-subagent switch is off by default')
  switches[1].props.onClick()
  ok(configOf(env).ignoreSubagent === true, 'the ignore switch writes ignoreSubagent to the config store')
}

// ===========================================================================
// 7) mux path: turn ends, jobs, attention, open-burst replay, disposal
// ===========================================================================
;(async () => {
  {
    const env = makeEnv({ questionSound: 'alert-01', planReviewSound: 'yup-02', goalBlockedSound: 'nope-01' }, true)
    env.exportsObj.apply(env.ctx)
    env.muxPush(turnEnd('s1', 'completed'))
    await tick()
    ok(env.playedKeys().includes(DEFAULT_MAP.completion), 'mux turn/end completed plays the completion sound')
    const afterTurn = env.playedUrls().length
    env.muxPush(turnEnd('s1', 'completed'))
    await tick()
    ok(env.playedUrls().length === afterTurn, 'a repeated mux turn/end inside the dedupe window is suppressed')

    env.muxPush({ type: 'session/event', sessionId: 's1', event: { type: 'turn/end', seq: 3, time: 3, data: { turn: 1, reason: { kind: 'aborted' } } } })
    await tick()
    ok(env.playedUrls().length === afterTurn, 'mux turn/end aborted is silent')
    env.muxPush({ type: 'session/event', sessionId: 's1', event: { type: 'turn/end', seq: 4, time: 4, data: { turn: 1, reason: { kind: 'max-tokens' } } } })
    await tick()
    ok(env.playedUrls().length === afterTurn, 'mux turn/end max-tokens is silent')
    env.muxPush(turnEnd('s1', 'error'))
    await tick()
    ok(env.playedKeys().includes(DEFAULT_MAP.failure), 'mux turn/end error plays the failure sound')

    env.muxPush({ type: 'session/jobs', sessionId: 's1', jobs: [{ id: 'j1', kind: 'bash', label: 'x', status: 'running' }] })
    await tick()
    const beforeJob = env.playedUrls().length
    ok(beforeJob === afterTurn + 1, 'a running job makes no sound')
    env.muxPush({ type: 'session/jobs', sessionId: 's1', jobs: [{ id: 'j1', kind: 'bash', label: 'x', status: 'killed', finishedAt: 2 }] })
    await tick()
    ok(env.playedUrls().length === beforeJob, 'a killed job is silent')

    env.muxPush({ type: 'approval/requested', sessionId: 's1', approvalId: 'ap1', toolName: 'x' })
    await tick()
    ok(env.playedKeys().includes(DEFAULT_MAP.approval), 'mux approval/requested plays the approval sound')

    env.muxPush({ type: 'session/projection', sessionId: 's1', key: 'goal', value: { phase: 'blocked' } })
    await tick()
    ok(env.playedKeys().includes('nope-01'), 'mux goal projection blocked plays the configured sound')
    const afterBlocked = env.playedUrls().length
    env.muxPush({ type: 'session/projection', sessionId: 's1', key: 'goal', value: { phase: 'blocked' } })
    await tick()
    ok(env.playedUrls().length === afterBlocked, 'a goal staying blocked does not repeat')

    env.muxPush({
      type: 'question/requested', sessionId: 's1',
      questions: [{ intent: { kind: 'plan-review', approve: 'Approve' }, detail: { plan: 'p' }, multiSelect: false, options: [{ label: 'Approve' }, { label: 'Reject' }] }],
    })
    await tick()
    ok(env.playedKeys().includes('yup-02'), 'mux plan-review question plays planReviewSound')
    env.muxPush({ type: 'question/requested', sessionId: 's1', questions: [{ text: 'Now?' }] })
    await tick()
    ok(env.playedKeys().includes('alert-01'), 'mux plain question plays questionSound')

    const beforeDispose = env.playedUrls().length
    env.getEffectDisposer()()
    env.muxPush({ type: 'approval/requested', sessionId: 's1', approvalId: 'ap2', toolName: 'x' })
    await tick()
    ok(env.playedUrls().length === beforeDispose, 'a disposed watcher stops reacting to frames')
  }

  // 8) open-burst replay + rpcId dedupe + wrapped envelopes + host errors
  {
    const env = makeEnv(undefined, true)
    env.exportsObj.apply(env.ctx)
    env.muxPush({ rpcId: 'replay-ap', payload: { type: 'approval/requested', sessionId: 's1', approvalId: 'ap1' } })
    await tick()
    ok(env.playedUrls().length === 0, 'open-burst replay of approval/requested is silent')
    env.fireTimersMs(0)
    env.muxPush({ rpcId: 'replay-ap', payload: { type: 'approval/requested', sessionId: 's1', approvalId: 'ap1' } })
    await tick()
    ok(env.playedUrls().length === 0, 'the same rpcId stays silent after the burst (reconnect replay)')
    env.muxPush({ rpcId: 'live-ap', payload: { type: 'approval/requested', sessionId: 's1', approvalId: 'ap2' } })
    await tick()
    ok(env.playedKeys().includes(DEFAULT_MAP.approval), 'a new rpcId after the burst plays the approval sound')
    env.getEffectDisposer()()
  }
  {
    const env = makeEnv({ failureSound: 'nope-05' }, true)
    env.exportsObj.apply(env.ctx)
    env.hostPush({ rpcId: 'he1', payload: { type: 'host/agent-error', sessionId: 's1', message: 'boom' } })
    await tick()
    ok(env.playedKeys().includes('nope-05'), 'host/agent-error plays the failure sound')
    env.getEffectDisposer()()
  }

  // 9) robustness: disposed sessions, malformed frames, unwrap fallback, backoff
  {
    const env = makeEnv(undefined, true)
    env.exportsObj.apply(env.ctx)
    env.muxPush({ type: 'session/jobs', sessionId: 's1', jobs: [{ id: 'j1', kind: 'bash', label: 'x', status: 'running' }] })
    await tick()
    env.setSessionIds([])
    env.muxPush({ type: 'session/jobs', sessionId: 's1', jobs: [{ id: 'j1', kind: 'bash', label: 'x', status: 'failed', finishedAt: 2 }] })
    await tick()
    ok(env.playedUrls().length === 0, 'a disposed session job transition is pruned')
    env.muxPush({ type: 'session/jobs', sessionId: 's1', jobs: [{ kind: 'bash', status: 'failed' }, null] })
    await tick()
    ok(env.playedUrls().length === 0, 'malformed job frames are ignored without crashing')
    env.getEffectDisposer()()
  }
  {
    const env = makeEnv(undefined, true)
    env.exportsObj.apply(env.ctx)
    env.muxEnd()
    await tick()
    ok(env.pendingTimersMs(800).length === 1, 'reconnect uses the 800ms base delay')
    env.fireTimersMs(800)
    env.muxEnd()
    await tick()
    ok(env.pendingTimersMs(1600).length === 1, 'consecutive failures double the reconnect delay')
    env.fireTimersMs(1600)
    env.muxPush(turnEnd('s1', 'completed'))
    await tick()
    env.muxEnd()
    await tick()
    ok(env.pendingTimersMs(800).length === 1, 'a healthy frame resets the backoff')
    env.getEffectDisposer()()
  }
  {
    const env = makeEnv(undefined, true)
    env.exportsObj.apply(env.ctx)
    for (let i = 0; i < 8; i++) env.muxPush({ rpcId: 'bad-' + i })
    await tick()
    env.drive({ ids: ['s1'], byId: { s1: env.row({ running: true }) }, current: 's1', jobsBySession: {} })
    env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: {} })
    ok(env.playedKeys().includes(DEFAULT_MAP.completion), 'after repeated unwrap failures the snapshot fallback still plays')
    env.getEffectDisposer()()
  }

  // 10) subagent channel
  {
    const env = makeEnv(undefined)
    env.exportsObj.apply(env.ctx)
    env.drive({ ids: ['s1', 's2'], byId: { s1: env.row({ running: false }), s2: env.row({ id: 's2', running: true, origin: 'subagent' }) }, current: 's1', jobsBySession: {} })
    env.drive({ ids: ['s1', 's2'], byId: { s1: env.row({ running: false }), s2: env.row({ id: 's2', running: false, origin: 'subagent' }) }, current: 's1', jobsBySession: {} })
    ok(env.playedKeys()[0] === 'yup-01', 'a subagent session turn end plays the opencode subagent_done sound (yup-01)')
  }
  {
    const env = makeEnv({ subagentCompletionSound: 'none' })
    env.exportsObj.apply(env.ctx)
    env.drive({ ids: ['s1', 's2'], byId: { s1: env.row({ running: false }), s2: env.row({ id: 's2', running: true, origin: 'subagent' }) }, current: 's1', jobsBySession: {} })
    env.drive({ ids: ['s1', 's2'], byId: { s1: env.row({ running: false }), s2: env.row({ id: 's2', running: false, origin: 'subagent' }) }, current: 's1', jobsBySession: {} })
    ok(env.playedUrls().length === 0, 'a subagent session turn end can be silenced explicitly')
  }
  {
    const env = makeEnv(undefined)
    env.exportsObj.apply(env.ctx)
    env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: { s1: [{ id: 'subagent-1', kind: 'subagent', label: 'x', status: 'running' }] } })
    env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: { s1: [{ id: 'subagent-1', kind: 'subagent', label: 'x', status: 'completed', finishedAt: 2 }] } })
    ok(env.playedKeys()[0] === 'yup-01', 'subagent job completion plays the opencode subagent_done sound (yup-01)')
  }
  {
    const env = makeEnv({ subagentCompletionSound: 'alert-07', subagentFailureSound: 'nope-02' })
    env.exportsObj.apply(env.ctx)
    env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: { s1: [{ id: 'subagent-1', kind: 'subagent', label: 'x', status: 'running' }] } })
    env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: { s1: [{ id: 'subagent-1', kind: 'subagent', label: 'x', status: 'completed', finishedAt: 2 }] } })
    ok(env.playedKeys().includes('alert-07'), 'a configured subagent completion sound is used')
    env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: { s1: [{ id: 'subagent-2', kind: 'subagent', label: 'y', status: 'running' }] } })
    env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: { s1: [{ id: 'subagent-2', kind: 'subagent', label: 'y', status: 'failed', finishedAt: 4 }] } })
    ok(env.playedKeys().includes('nope-02'), 'a configured subagent failure sound is used')
  }
  {
    const env = makeEnv({ ignoreSubagent: true, subagentCompletionSound: 'alert-07' })
    env.exportsObj.apply(env.ctx)
    env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: { s1: [{ id: 'subagent-1', kind: 'subagent', label: 'x', status: 'running' }] } })
    env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: { s1: [{ id: 'subagent-1', kind: 'subagent', label: 'x', status: 'completed', finishedAt: 2 }] } })
    ok(env.playedUrls().length === 0, 'ignoreSubagent mutes subagent events even when sounds are configured')
  }
  {
    const env = makeEnv({ subagentCompletionSound: 'alert-08' }, true)
    env.exportsObj.apply(env.ctx)
    env.drive({ ids: ['s1', 's2'], byId: { s1: env.row({ running: false }), s2: env.row({ id: 's2', running: false, origin: 'subagent' }) }, current: 's1', jobsBySession: {} })
    env.muxPush(turnEnd('s2', 'completed'))
    await tick()
    ok(env.playedKeys().includes('alert-08'), 'a mux child session turn end routes to the subagent channel')
    env.getEffectDisposer()()
  }
  {
    const env = makeEnv({ subagentApprovalSound: 'yup-03' }, true)
    env.exportsObj.apply(env.ctx)
    env.drive({ ids: ['s1', 's2'], byId: { s1: env.row({ running: false }), s2: env.row({ id: 's2', running: false, origin: 'subagent' }) }, current: 's1', jobsBySession: {} })
    env.fireTimersMs(0)
    env.muxPush({ type: 'approval/requested', sessionId: 's2', approvalId: 'ap9', toolName: 'x' })
    await tick()
    ok(env.playedKeys().includes('yup-03'), 'a mux child approval routes to the subagent channel')
    env.getEffectDisposer()()
  }

  // 11) cross-tab dedupe
  {
    const env = makeEnv(undefined, false, true)
    const BC = env.getBroadcastClass()
    const other = new BC('dsh-opencode-sounds')
    let seen = null
    other.onmessage = (ev) => {
      seen = ev.data
      if (seen && seen.t === 'hello') other.postMessage({ t: 'hello-ack' })
      if (seen && seen.t === 'intent') other.postMessage({ t: 'intent', key: seen.key, nonce: 0 })
    }
    env.exportsObj.apply(env.ctx)
    env.drive({ ids: ['s1'], byId: { s1: env.row({ running: true }) }, current: 's1', jobsBySession: {} })
    env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: {} })
    ok(seen && seen.t === 'intent' && seen.key === 'session:s1', 'the play intent is broadcast to other tabs')
    ok(env.timers.length === 1 && env.timers[0].ms === 40, 'playback is deferred 40ms for the cross-tab tie-break')
    env.fireTimers()
    ok(env.playedUrls().length === 0, 'the other tab wins the tie-break; this tab stays silent')
  }
  {
    const env = makeEnv(undefined, false, true)
    env.exportsObj.apply(env.ctx)
    env.drive({ ids: ['s1'], byId: { s1: env.row({ running: true }) }, current: 's1', jobsBySession: {} })
    env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false }) }, current: 's1', jobsBySession: {} })
    ok(env.playedKeys().includes(DEFAULT_MAP.completion), 'a lone tab plays immediately without waiting for a handshake')
    ok(env.pendingTimersMs(40).length === 0, 'a lone tab does not defer playback')
  }

  // 12) pendingInteraction from the snapshot beats the frame shape
  {
    const env = makeEnv({ planReviewSound: 'alert-09', questionSound: 'yup-05' }, true)
    env.exportsObj.apply(env.ctx)
    env.fireTimersMs(0)
    env.setSessionIds(['s1'])
    env.drive({ ids: ['s1'], byId: { s1: env.row({ running: false, pendingInteraction: 'plan-review' }) }, current: 's1', jobsBySession: {} })
    env.muxPush({ rpcId: 'q-live', payload: { type: 'question/requested', sessionId: 's1', questions: [{ text: 'plain looking question' }] } })
    await tick()
    ok(env.playedKeys().includes('alert-09'), 'list pendingInteraction=plan-review overrides a plain question frame')
    env.getEffectDisposer()()
  }

  console.log(failures === 0 ? 'ALL CLIENT TESTS PASSED' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})()
