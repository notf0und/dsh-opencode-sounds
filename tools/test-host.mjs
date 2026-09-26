// Host-half behavioral test for dsh-opencode-sounds (run with: node tools/test-host.mjs)
import { apply, inject, name, Config } from '../lib/index.js'

let failures = 0
const ok = (cond, label) => {
  if (cond) console.log('PASS', label)
  else { failures++; console.log('FAIL', label) }
}

ok(name === 'dsh-opencode-sounds', 'name export')
ok(Array.isArray(inject) && inject.length === 0, 'inject export is empty array')

// 1) settings service never appears -> silent no-op (late inject never fires)
let threw = false
try {
  apply({ inject: (deps, cb) => { /* never call cb */ } })
} catch (e) { threw = true }
ok(!threw, 'apply without settings service does not throw and waits silently')

// 2) settings service appears -> namespace registered with applies live
let registered = null
const fakeSettings = {
  register: (ns, schema, opts) => { registered = { ns, schema, opts }; return {} },
}
apply({
  inject: (deps, cb) => {
    if (deps.includes('settings')) cb({ settings: fakeSettings })
  },
})
ok(registered && registered.ns === 'dsh-opencode-sounds', 'namespace registered as dsh-opencode-sounds')
ok(registered && registered.opts.applies === 'live', 'applies=live')

// 3) schema resolves defaults (opencode "OpenCode Default" pack mapping)
const resolved = registered.schema({})
ok(resolved.enabled === true, 'default enabled=true')
ok(resolved.quietCurrent === false, 'default quietCurrent=false')
ok(resolved.completionSound === 'bip-bop-01', 'default completionSound=bip-bop-01 (opencode done)')
ok(resolved.approvalSound === 'staplebops-06', 'default approvalSound=staplebops-06 (opencode permission)')
ok(resolved.questionSound === 'bip-bop-03', 'default questionSound=bip-bop-03 (opencode question)')
ok(resolved.planReviewSound === 'bip-bop-03', 'default planReviewSound=bip-bop-03')
ok(resolved.goalBlockedSound === 'nope-03', 'default goalBlockedSound=nope-03 (opencode error)')
ok(resolved.failureSound === 'nope-03', 'default failureSound=nope-03 (opencode error)')
ok(resolved.completionVolume === 1, 'default completionVolume=1')
ok(resolved.approvalVolume === 1, 'default approvalVolume=1')
ok(resolved.questionVolume === 1, 'default questionVolume=1')
ok(resolved.planReviewVolume === 1, 'default planReviewVolume=1')
ok(resolved.goalBlockedVolume === 1, 'default goalBlockedVolume=1')
ok(resolved.failureVolume === 1, 'default failureVolume=1')
ok(resolved.ignoreSubagent === false, 'default ignoreSubagent=false')
ok(resolved.subagentCompletionSound === 'yup-01', 'default subagentCompletionSound=yup-01 (opencode subagent_done)')
ok(resolved.subagentApprovalSound === 'none', 'default subagentApprovalSound=none')
ok(resolved.subagentQuestionSound === 'none', 'default subagentQuestionSound=none')
ok(resolved.subagentPlanReviewSound === 'none', 'default subagentPlanReviewSound=none')
ok(resolved.subagentGoalBlockedSound === 'none', 'default subagentGoalBlockedSound=none')
ok(resolved.subagentFailureSound === 'none', 'default subagentFailureSound=none')
ok(resolved.subagentCompletionVolume === 1, 'default subagentCompletionVolume=1')
ok(resolved.subagentApprovalVolume === 1, 'default subagentApprovalVolume=1')
ok(resolved.subagentQuestionVolume === 1, 'default subagentQuestionVolume=1')
ok(resolved.subagentPlanReviewVolume === 1, 'default subagentPlanReviewVolume=1')
ok(resolved.subagentGoalBlockedVolume === 1, 'default subagentGoalBlockedVolume=1')
ok(resolved.subagentFailureVolume === 1, 'default subagentFailureVolume=1')

// 4) schema resolves a real section (custom data URL + per-event volumes)
const full = registered.schema({
  enabled: false,
  quietCurrent: true,
  completionSound: 'data:audio/mp3;base64,AAAA',
  failureSound: 'none',
  approvalVolume: 0.3,
  failureVolume: 0.5,
  ignoreSubagent: true,
  subagentCompletionSound: 'alert-04',
  subagentFailureVolume: 0.25,
})
ok(full.enabled === false && full.quietCurrent === true, 'user values preserved')
ok(full.completionSound === 'data:audio/mp3;base64,AAAA', 'custom data URL preserved')
ok(full.failureSound === 'none', 'none preserved')
ok(full.approvalVolume === 0.3 && full.failureVolume === 0.5, 'per-event volumes preserved')
ok(full.ignoreSubagent === true, 'ignoreSubagent preserved')
ok(full.subagentCompletionSound === 'alert-04', 'subagentCompletionSound preserved')
ok(full.subagentFailureVolume === 0.25, 'subagentFailureVolume preserved')

// 5) schema rejects invalid sections
for (const bad of [
  { enabled: 'yes' },
  { completionVolume: 1.5 },
  { approvalVolume: -0.1 },
  { completionSound: 42 },
  { ignoreSubagent: 'yes' },
  { subagentCompletionVolume: 1.5 },
  { subagentApprovalSound: 42 },
]) {
  let rejected = false
  try { registered.schema(bad) } catch (e) { rejected = true }
  ok(rejected, 'rejects invalid section: ' + JSON.stringify(bad))
}

console.log(failures === 0 ? 'ALL HOST TESTS PASSED' : failures + ' FAILURES')
process.exit(failures === 0 ? 0 : 1)
