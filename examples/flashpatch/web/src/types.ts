/**
 * Shared types between the feed server and the React dashboard.
 */

export interface BidEntry {
  by: string
  priceSol: number
  strategy?: string
  confidence?: number
  estimatedSecs?: number
}

export interface VerificationResult {
  patchId: string
  by: string
  blocked: boolean
  testsPassed: number
  testsFailed: number
  reason: string
}

export interface DeployedPatch {
  patchId: string
  strategy: string
  upgradeTxSig: string
  elapsedMs: number
}

export interface ThresholdEntry {
  agreementsNeeded: number
  agreementsReceived: number
  met: boolean
  winningPatchId: string
}

export interface LogEntry {
  ts: number
  agent: string
  text: string
  highlight?: boolean
  error?: boolean
}

export interface ExploitInfo {
  programId: string
  exploitTxSig: string
  detectedAt: number
  vulnerabilityClass: string
}

export type Phase =
  | 'IDLE'
  | 'EXPLOIT_DETECTED'
  | 'PATCHING'
  | 'VERIFIED'
  | 'DEPLOYED'
  | 'RELEASED'

export interface FeedState {
  phase: Phase
  round: number | null
  programId: string | null
  simulateMode: boolean
  exploit: ExploitInfo | null
  bids: BidEntry[]
  winner: string | null
  depositSig: string | null
  depositedSol: number | null
  verificationResults: VerificationResult[]
  verifiedCount: number
  threshold: number
  thresholdStatus: ThresholdEntry | null
  deployedPatch: DeployedPatch | null
  releaseSig: string | null
  elapsedMs: number | null
  logs: LogEntry[]
}
