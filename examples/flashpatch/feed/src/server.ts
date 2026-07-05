/**
 * FlashPatch feed server.
 *
 * Polls the CoralOS session's extended state endpoint, parses all agent messages,
 * and exposes a single GET /api/state endpoint that the React dashboard consumes.
 *
 * The feed server is stateless across restarts — it rebuilds the FeedState from
 * the session transcript every poll cycle. This means the dashboard stays in sync
 * even if the feed server restarts mid-session.
 *
 * Usage: SESSION_ID=<id> node dist/server.js
 *        or set SESSION_ID via .env (auto-loaded from repo root)
 *
 * Docs: https://docs.coralos.ai/api-reference/local/get-extended-session-state
 */

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  parseBid,
  parseAward,
  parseDeposited,
  parseVerified,
  verb,
  messageRound,
} from '@pay/agent-runtime'
import {
  parseExploitDetected,
  parsePatchSubmission,
  parseSandboxResult,
  parseThresholdStatus,
  parsePatchDeployed,
} from '../../src/protocol.js'
import type { FeedState, LogEntry, BidEntry, VerificationResult } from '../../web/src/types.js'

const PORT          = Number(process.env.FEED_PORT ?? '4040')
const CORAL_BASE    = process.env.CORAL_SERVER_URL ?? 'http://localhost:5555'
const CORAL_TOKEN   = process.env.CORAL_TOKEN ?? 'dev'
const NS            = process.env.CORAL_NS ?? 'default'
const POLL_MS       = Number(process.env.FEED_POLL_MS ?? '1000')

function loadEnv(): Record<string, string> {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
  const env: Record<string, string> = { ...(process.env as Record<string, string>) }
  try {
    for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* no .env */ }
  return env
}

const env = loadEnv()
const SESSION_ID  = env.FLASHPATCH_SESSION_ID ?? env.SESSION_ID ?? ''
const PROGRAM_ID  = env.VULNERABLE_PROGRAM_ID ?? ''
const SIMULATE    = env.SIMULATE_EXPLOIT === '1'
const THRESHOLD   = Number(env.THRESHOLD ?? '2')

// In-memory state — rebuilt from session transcript each poll
let currentState: FeedState = emptyState()

function emptyState(): FeedState {
  return {
    phase: 'IDLE',
    round: null,
    programId: PROGRAM_ID || null,
    simulateMode: SIMULATE,
    exploit: null,
    bids: [],
    winner: null,
    depositSig: null,
    depositedSol: null,
    verificationResults: [],
    verifiedCount: 0,
    threshold: THRESHOLD,
    thresholdStatus: null,
    deployedPatch: null,
    releaseSig: null,
    elapsedMs: null,
    logs: [],
  }
}

interface SessionMessage {
  content: string
  agentName?: string
  timestamp?: string | number
}

function tsOf(msg: SessionMessage): number {
  if (typeof msg.timestamp === 'number') return msg.timestamp
  if (typeof msg.timestamp === 'string') return new Date(msg.timestamp).getTime()
  return Date.now()
}

function buildState(messages: SessionMessage[]): FeedState {
  const s = emptyState()
  const logs: LogEntry[] = []

  for (const msg of messages) {
    const text  = (msg.content ?? '').trim()
    const agent = msg.agentName ?? 'unknown'
    const ts    = tsOf(msg)

    if (!text) continue

    logs.push({
      ts,
      agent,
      text: text.length > 120 ? text.slice(0, 117) + '...' : text,
      highlight: text.startsWith('PATCH_DEPLOYED') || text.startsWith('ARBITER_RELEASED'),
      error: text.startsWith('ERROR'),
    })

    // Parse EXPLOIT_DETECTED
    const exploit = parseExploitDetected(text)
    if (exploit) {
      s.exploit = {
        programId: exploit.programId,
        exploitTxSig: exploit.exploitTxSig,
        detectedAt: exploit.detectedAt,
        vulnerabilityClass: exploit.vulnerabilityClass,
      }
      s.round  = exploit.round
      s.phase  = 'EXPLOIT_DETECTED'
      continue
    }

    // Parse BID
    const bid = parseBid(text)
    if (bid) {
      // Extract strategy/confidence from the note field
      const stratMatch = text.match(/note=(\w+)-strategy/)
      const confMatch  = text.match(/confidence=([\d.]+)/)
      const estMatch   = text.match(/est=([\d.]+)s/)
      const existing   = s.bids.find(b => b.by === bid.by)
      const entry: BidEntry = {
        by: bid.by,
        priceSol: bid.priceSol,
        strategy: stratMatch?.[1] as BidEntry['strategy'],
        confidence: confMatch ? Number(confMatch[1]) : undefined,
        estimatedSecs: estMatch ? Number(estMatch[1]) : undefined,
      }
      if (existing) {
        Object.assign(existing, entry)
      } else {
        s.bids.push(entry)
      }
      if (s.phase === 'EXPLOIT_DETECTED') s.phase = 'PATCHING'
      continue
    }

    // Parse AWARD
    const award = parseAward(text)
    if (award) {
      s.winner = award.to
      continue
    }

    // Parse DEPOSITED
    const deposited = parseDeposited(text)
    if (deposited) {
      s.depositSig = deposited.sig
      // Reconstruct deposited amount from bid
      const winnerBid = s.bids.find(b => b.by === s.winner)
      s.depositedSol = winnerBid?.priceSol ?? null
      continue
    }

    // Parse SANDBOX_RESULT
    const sandboxResult = parseSandboxResult(text)
    if (sandboxResult) {
      const existing = s.verificationResults.find(r => r.patchId === sandboxResult.patchId)
      const entry: VerificationResult = {
        patchId: sandboxResult.patchId,
        by: sandboxResult.by,
        blocked: sandboxResult.blocked,
        testsPassed: sandboxResult.testsPassed,
        testsFailed: sandboxResult.testsFailed,
        reason: sandboxResult.reason,
      }
      if (existing) {
        Object.assign(existing, entry)
      } else {
        s.verificationResults.push(entry)
      }
      continue
    }

    // Parse VERIFIED (from sandbox-verifier)
    const verified = parseVerified(text)
    if (verified) {
      s.verifiedCount = s.verificationResults.filter(r => r.blocked).length
      if (s.phase === 'PATCHING') s.phase = 'VERIFIED'
      continue
    }

    // Parse THRESHOLD_STATUS
    const threshold = parseThresholdStatus(text)
    if (threshold) {
      s.thresholdStatus = {
        agreementsNeeded: threshold.agreementsNeeded,
        agreementsReceived: threshold.agreementsReceived,
        met: threshold.met,
        winningPatchId: threshold.winningPatchId,
      }
      // Update verified count from threshold status
      s.verifiedCount = threshold.agreementsReceived
      continue
    }

    // Parse PATCH_DEPLOYED
    const deployed = parsePatchDeployed(text)
    if (deployed) {
      // Find the strategy from bids
      const winnerBid = s.bids.find(b => b.by === s.winner)
      s.deployedPatch = {
        patchId: deployed.patchId,
        strategy: winnerBid?.strategy ?? 'unknown',
        upgradeTxSig: deployed.upgradeTxSig,
        elapsedMs: deployed.escapedMs,
      }
      s.phase     = 'DEPLOYED'
      s.elapsedMs = deployed.escapedMs
      continue
    }

    // Parse ARBITER_RELEASED / RELEASED
    if (verb(text) === 'ARBITER_RELEASED' || verb(text) === 'RELEASED') {
      const sigMatch = text.match(/sig=(\S+)/)
      s.releaseSig = sigMatch?.[1] ?? null
      s.phase      = 'RELEASED'

      // Compute final elapsed if not already set
      if (s.elapsedMs == null && s.exploit) {
        s.elapsedMs = ts - s.exploit.detectedAt
      }
      continue
    }
  }

  // Keep logs in chronological order, cap at 200
  s.logs = logs.slice(-200)

  // Sync verifiedCount from verificationResults
  if (s.verificationResults.length > 0) {
    s.verifiedCount = s.verificationResults.filter(r => r.blocked).length
  }

  return s
}

async function fetchSessionMessages(sessionId: string): Promise<SessionMessage[]> {
  const url = `${CORAL_BASE}/api/v1/local/session/${NS}/${sessionId}/extended`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CORAL_TOKEN}` },
  })
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`coral session fetch failed: ${res.status}`)
  }
  const data = await res.json() as Record<string, unknown>

  // The extended state nests messages under threads
  const messages: SessionMessage[] = []
  const threads = (data.threads ?? data.session?.threads ?? []) as Array<{
    messages?: SessionMessage[]
  }>
  for (const thread of threads) {
    for (const msg of thread.messages ?? []) {
      messages.push(msg)
    }
  }

  // Also check top-level messages array
  if (Array.isArray(data.messages)) {
    for (const msg of data.messages as SessionMessage[]) {
      messages.push(msg)
    }
  }

  return messages
}

async function poll() {
  if (!SESSION_ID) return

  try {
    const messages = await fetchSessionMessages(SESSION_ID)
    if (messages.length > 0) {
      currentState = buildState(messages)
    }
  } catch (e) {
    // Don't crash the feed on transient RPC errors
    console.error(`[feed] poll error: ${e}`)
  }
}

// HTTP server
const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  if (req.url === '/api/state' && req.method === 'GET') {
    const body = JSON.stringify(currentState)
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    })
    res.end(body)
    return
  }

  if (req.url === '/health') {
    res.writeHead(200)
    res.end('ok')
    return
  }

  res.writeHead(404)
  res.end()
})

server.listen(PORT, () => {
  console.log(`[feed] FlashPatch feed server listening on :${PORT}`)
  if (!SESSION_ID) {
    console.log('[feed] no FLASHPATCH_SESSION_ID set — serving empty state until session starts')
  } else {
    console.log(`[feed] tracking session ${SESSION_ID}`)
  }
})

// Start polling
setInterval(poll, POLL_MS)
poll()
