import type { Context } from '@deepseek-ai/cordis'
import type z from '@deepseek-ai/schemastery'

/**
 * Configuration shape for `dsh-opencode-sounds`.
 *
 * The client persists this in browser localStorage (key
 * `dsh-opencode-sounds:config`); the host also registers the same settings
 * namespace (the rc.6 settings API allowlist does not expose third-party
 * namespaces to the browser yet, so the client can move back to settingsScope
 * unchanged once the platform opens it up).
 *
 * The six event kinds are fully independent: each has its own sound and volume.
 * Same-named events originating from a subagent have a separate set of sounds
 * and volumes (only subagent completion is audible by default), and
 * `ignoreSubagent` silences every subagent event at once.
 *
 * Sound values: an opencode pack id (alert-01..10, bip-bop-01..10,
 * staplebops-01..07, nope-01..12, yup-01..06), 'none' (silent), 'local' (local
 * file pending selection), 'data:...' (inline data URL), or 'audio:<id>'
 * (IndexedDB audio-library ref).
 */
export interface NotifySoundConfig {
  /** Master switch */
  enabled: boolean
  /** Stay silent when the session being viewed completes (attention events are unaffected) */
  quietCurrent: boolean
  /** Ignore every subagent event */
  ignoreSubagent: boolean
  /** Completion sound (session turn end / background job completed) */
  completionSound: string
  /** Approval request sound */
  approvalSound: string
  /** User question sound */
  questionSound: string
  /** Plan review sound */
  planReviewSound: string
  /** Goal blocked sound */
  goalBlockedSound: string
  /** Background job failure sound */
  failureSound: string
  /** Completion event volume 0..1 */
  completionVolume: number
  /** Approval request volume 0..1 */
  approvalVolume: number
  /** User question volume 0..1 */
  questionVolume: number
  /** Plan review volume 0..1 */
  planReviewVolume: number
  /** Goal blocked volume 0..1 */
  goalBlockedVolume: number
  /** Background job failure volume 0..1 */
  failureVolume: number
  /** Subagent completion sound (audible by default: yup-01) */
  subagentCompletionSound: string
  /** Subagent approval request sound (silent by default) */
  subagentApprovalSound: string
  /** Subagent user question sound (silent by default) */
  subagentQuestionSound: string
  /** Subagent plan review sound (silent by default) */
  subagentPlanReviewSound: string
  /** Subagent goal blocked sound (silent by default) */
  subagentGoalBlockedSound: string
  /** Subagent background job failure sound (silent by default) */
  subagentFailureSound: string
  /** Subagent completion event volume 0..1 */
  subagentCompletionVolume: number
  /** Subagent approval request volume 0..1 */
  subagentApprovalVolume: number
  /** Subagent user question volume 0..1 */
  subagentQuestionVolume: number
  /** Subagent plan review volume 0..1 */
  subagentPlanReviewVolume: number
  /** Subagent goal blocked volume 0..1 */
  subagentGoalBlockedVolume: number
  /** Subagent background job failure volume 0..1 */
  subagentFailureVolume: number
}

export declare const name: 'dsh-opencode-sounds'
export declare const inject: string[]
export declare const Config: z<NotifySoundConfig>
export declare function apply(ctx: Context): void
