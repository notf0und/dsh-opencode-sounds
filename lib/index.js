/**
 * dsh-opencode-sounds — Host half (fork of @ai-galaxy/dsh-sound 0.4.1)
 *
 * Registers the `dsh-opencode-sounds` settings namespace (schema in Config) so a
 * configuration channel exists for the day the platform opens third-party
 * namespaces to the browser. The rc.6 settings API allowlist
 * (dsh-host-apiproxy) does not expose this namespace to the browser yet, so the
 * client persists its config in localStorage instead; registering here stays
 * harmless and forward-compatible.
 *
 * Namespace value shape (the schema already carries the defaults):
 * {
 *   enabled: boolean              // master switch
 *   quietCurrent: boolean         // stay silent when the session being viewed completes
 *   ignoreSubagent: boolean       // ignore every subagent event
 *   completionSound: string       // completion sound (turn end / background job done)
 *   approvalSound / questionSound / planReviewSound /
 *   goalBlockedSound / failureSound: string   // per-kind attention sounds
 *   completionVolume / approvalVolume / ... : number  // per-kind volume 0..1
 *   subagentCompletionSound / ... / subagentFailureSound: string  // subagent sounds (only completion is audible by default)
 *   subagentCompletionVolume / ... / subagentFailureVolume: number // per-kind subagent volume 0..1
 * }
 *
 * Sound values: an opencode pack id (alert-01..10, bip-bop-01..10,
 * staplebops-01..07, nope-01..12, yup-01..06), 'none' (silent),
 * 'local' (local file pending selection), 'data:...' (inline data URL),
 * or 'audio:<id>' (IndexedDB audio-library ref).
 */
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-opencode-sounds'
export const inject = []

// Defaults mirror opencode's built-in "OpenCode Default" pack:
//   done/default -> bip-bop-01 (completion)
//   question     -> bip-bop-03 (question)
//   permission   -> staplebops-06 (approval)
//   plan review  -> bip-bop-05
//   failure      -> nope-07
//   error        -> nope-03 (goal blocked)
//   subagent_done-> yup-01 (subagent completion)
export const Config = z.object({
  enabled: z.boolean().default(true),
  quietCurrent: z.boolean().default(false),
  ignoreSubagent: z.boolean().default(false),
  completionSound: z.string().default('bip-bop-01'),
  approvalSound: z.string().default('staplebops-06'),
  questionSound: z.string().default('bip-bop-03'),
  planReviewSound: z.string().default('bip-bop-05'),
  goalBlockedSound: z.string().default('nope-03'),
  failureSound: z.string().default('nope-07'),
  completionVolume: z.number().min(0).max(1).default(1),
  approvalVolume: z.number().min(0).max(1).default(1),
  questionVolume: z.number().min(0).max(1).default(1),
  planReviewVolume: z.number().min(0).max(1).default(1),
  goalBlockedVolume: z.number().min(0).max(1).default(1),
  failureVolume: z.number().min(0).max(1).default(1),
  subagentCompletionSound: z.string().default('yup-01'),
  subagentApprovalSound: z.string().default('none'),
  subagentQuestionSound: z.string().default('none'),
  subagentPlanReviewSound: z.string().default('none'),
  subagentGoalBlockedSound: z.string().default('none'),
  subagentFailureSound: z.string().default('none'),
  subagentCompletionVolume: z.number().min(0).max(1).default(1),
  subagentApprovalVolume: z.number().min(0).max(1).default(1),
  subagentQuestionVolume: z.number().min(0).max(1).default(1),
  subagentPlanReviewVolume: z.number().min(0).max(1).default(1),
  subagentGoalBlockedVolume: z.number().min(0).max(1).default(1),
  subagentFailureVolume: z.number().min(0).max(1).default(1),
})

export function apply(ctx) {
  // The settings service (dsh-settings-file) only becomes available after its
  // document is loaded asynchronously at startup, so bind late through
  // ctx.inject: register once settings is ready (or immediately if it already
  // is). In a profile with no settings service at all this stays a silent no-op.
  ctx.inject(['settings'], (sctx) => {
    sctx.settings.register('dsh-opencode-sounds', Config, { applies: 'live' })
  })
}
