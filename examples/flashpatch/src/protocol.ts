/**
 * FlashPatch market protocol — extends the base CoralOS market wire format with
 * FlashPatch-specific message types for the emergency patch lifecycle.
 *
 * Base protocol (from @pay/agent-runtime):
 *   WANT / BID / AWARD / ESCROW_REQUIRED / DEPOSITED / DELIVERED / VERIFIED / RELEASED
 *
 * FlashPatch extensions:
 *   EXPLOIT_DETECTED   — exploit-detector broadcasts to the market
 *   PATCH_SUBMITTED    — patch generator delivers its artifact
 *   SANDBOX_RESULT     — sandbox verifier reports pass/fail per patch
 *   THRESHOLD_MET      — deployer confirms 2-of-3 threshold reached
 *   PATCH_DEPLOYED     — deployer confirms on-chain program upgrade
 *
 * All messages carry round= for correlation (same as the base protocol).
 */

export interface ExploitAlert {
  round: number
  programId: string
  exploitTxSig: string
  detectedAt: number  // unix ms
  vulnerabilityClass: string
}

export interface PatchSubmission {
  round: number
  strategy: 'fast' | 'deep' | 'hybrid'
  patchId: string
  confidence: number
  priceSol: number
  by: string
  estimatedSecs: number
}

export interface SandboxResult {
  round: number
  patchId: string
  blocked: boolean
  testsPassed: number
  testsFailed: number
  reason: string
  by: string
}

export interface ThresholdStatus {
  round: number
  agreementsNeeded: number
  agreementsReceived: number
  met: boolean
  winningPatchId: string
  by: string
}

export interface PatchDeployed {
  round: number
  patchId: string
  upgradeTxSig: string
  programId: string
  escapedMs: number
  by: string
}

// -- Format helpers ----------------------------------------------------------------

export function formatExploitDetected(a: ExploitAlert): string {
  return `EXPLOIT_DETECTED round=${a.round} program=${a.programId} exploit_tx=${a.exploitTxSig} detected_at=${a.detectedAt} vuln_class=${a.vulnerabilityClass}`
}

export function parseExploitDetected(text: string): ExploitAlert | null {
  if (!text.trim().startsWith('EXPLOIT_DETECTED')) return null
  const round = numField(text, 'round')
  const programId = tokField(text, 'program')
  const exploitTxSig = tokField(text, 'exploit_tx')
  const detectedAt = numField(text, 'detected_at')
  const vulnerabilityClass = tokField(text, 'vuln_class')
  if (round == null || !programId || !exploitTxSig || detectedAt == null || !vulnerabilityClass) return null
  return { round, programId, exploitTxSig, detectedAt, vulnerabilityClass }
}

export function formatPatchSubmission(s: PatchSubmission): string {
  return `PATCH_SUBMITTED round=${s.round} strategy=${s.strategy} patch_id=${s.patchId} confidence=${s.confidence} price=${s.priceSol} by=${s.by} est_secs=${s.estimatedSecs}`
}

export function parsePatchSubmission(text: string): PatchSubmission | null {
  if (!text.trim().startsWith('PATCH_SUBMITTED')) return null
  const round = numField(text, 'round')
  const strategy = tokField(text, 'strategy') as PatchSubmission['strategy'] | undefined
  const patchId = tokField(text, 'patch_id')
  const confidence = numField(text, 'confidence')
  const priceSol = numField(text, 'price')
  const by = tokField(text, 'by')
  const estimatedSecs = numField(text, 'est_secs')
  if (round == null || !strategy || !patchId || confidence == null || priceSol == null || !by || estimatedSecs == null) return null
  return { round, strategy, patchId, confidence, priceSol, by, estimatedSecs }
}

export function formatSandboxResult(r: SandboxResult): string {
  return `SANDBOX_RESULT round=${r.round} patch_id=${r.patchId} blocked=${r.blocked} tests_passed=${r.testsPassed} tests_failed=${r.testsFailed} by=${r.by} reason="${r.reason.replace(/"/g, "'")}"`
}

export function parseSandboxResult(text: string): SandboxResult | null {
  if (!text.trim().startsWith('SANDBOX_RESULT')) return null
  const round = numField(text, 'round')
  const patchId = tokField(text, 'patch_id')
  const blocked = tokField(text, 'blocked') === 'true'
  const testsPassed = numField(text, 'tests_passed') ?? 0
  const testsFailed = numField(text, 'tests_failed') ?? 0
  const by = tokField(text, 'by')
  const reason = text.match(/reason="([^"]*)"/)?.[1] ?? ''
  if (round == null || !patchId || !by) return null
  return { round, patchId, blocked, testsPassed, testsFailed, reason, by }
}

export function formatThresholdStatus(t: ThresholdStatus): string {
  return `THRESHOLD_STATUS round=${t.round} needed=${t.agreementsNeeded} received=${t.agreementsReceived} met=${t.met} winning_patch=${t.winningPatchId} by=${t.by}`
}

export function parseThresholdStatus(text: string): ThresholdStatus | null {
  if (!text.trim().startsWith('THRESHOLD_STATUS')) return null
  const round = numField(text, 'round')
  const agreementsNeeded = numField(text, 'needed')
  const agreementsReceived = numField(text, 'received')
  const met = tokField(text, 'met') === 'true'
  const winningPatchId = tokField(text, 'winning_patch')
  const by = tokField(text, 'by')
  if (round == null || agreementsNeeded == null || agreementsReceived == null || !winningPatchId || !by) return null
  return { round, agreementsNeeded, agreementsReceived, met, winningPatchId, by }
}

export function formatPatchDeployed(d: PatchDeployed): string {
  return `PATCH_DEPLOYED round=${d.round} patch_id=${d.patchId} upgrade_tx=${d.upgradeTxSig} program=${d.programId} elapsed_ms=${d.escapedMs} by=${d.by}`
}

export function parsePatchDeployed(text: string): PatchDeployed | null {
  if (!text.trim().startsWith('PATCH_DEPLOYED')) return null
  const round = numField(text, 'round')
  const patchId = tokField(text, 'patch_id')
  const upgradeTxSig = tokField(text, 'upgrade_tx')
  const programId = tokField(text, 'program')
  const escapedMs = numField(text, 'elapsed_ms')
  const by = tokField(text, 'by')
  if (round == null || !patchId || !upgradeTxSig || !programId || escapedMs == null || !by) return null
  return { round, patchId, upgradeTxSig, programId, escapedMs, by }
}

// -- Internal helpers ----------------------------------------------------------------

function numField(text: string, key: string): number | undefined {
  const m = text.match(new RegExp(`${key}=([\\d.]+)`))
  return m ? Number(m[1]) : undefined
}

function tokField(text: string, key: string): string | undefined {
  return text.match(new RegExp(`${key}=(\\S+)`))?.[1]
}
