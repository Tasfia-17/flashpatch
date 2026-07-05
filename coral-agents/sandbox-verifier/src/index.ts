/**
 * Sandbox Verifier Agent
 *
 * Independent 3rd party in the FlashPatch settlement. Receives VERIFY messages
 * from the exploit-detector, re-checks the content hash, parses the patch payload,
 * runs the patch through the verification harness, and replies VERIFIED pass|fail.
 *
 * Verification steps:
 *   1. Recompute sha256 of the received payload — reject if it doesn't match
 *   2. Parse the patch JSON payload
 *   3. Call verifyPatchAgainstExploit — runs the exploit replay logic
 *   4. Check staticAnalysis results if present
 *   5. Emit VERIFIED with the verdict
 *
 * This agent holds no keys and moves no funds. The exploit-detector gates
 * escrow release on a VERIFIED pass from this agent (policy verifier gate).
 */

import { createHash } from 'node:crypto'
import {
  startCoralAgent,
  parseVerify,
  formatVerified,
} from '@pay/agent-runtime'
import { verifyPatchAgainstExploit, type PatchCandidate } from '../../flashpatch/src/patch-registry.js'

const NAME  = process.env.AGENT_NAME ?? 'sandbox-verifier'
const trace = process.env.TRACE === '1'

function sha256(payload: string): string {
  return createHash('sha256').update(payload).digest('hex')
}

function parsePatchPayload(payload: string): PatchCandidate | null {
  try {
    const obj = JSON.parse(payload)
    if (typeof obj.patchId !== 'string' || typeof obj.strategy !== 'string') return null
    return obj as PatchCandidate
  } catch {
    return null
  }
}

await startCoralAgent({ agentName: NAME }, async (ctx) => {
  console.error(`[${NAME}] independent patch verifier ready (no keys, no funds)`)

  while (true) {
    try {
      const mention = await ctx.waitForMention()
      if (!mention) continue

      const req = parseVerify(mention.text.trim())
      if (!req) continue

      if (trace) console.error(`[${NAME}] round ${req.round}: verifying sha=${req.sha}`)

      // Step 1: recompute hash and compare
      const actualSha = sha256(req.payload)
      if (actualSha !== req.sha) {
        console.error(`[${NAME}] round ${req.round}: hash mismatch — expected ${req.sha}, got ${actualSha}`)
        await ctx.reply(mention, formatVerified({
          round: req.round,
          verdict: 'fail',
          by: NAME,
          sha: actualSha,
          reason: 'payload hash mismatch — delivery was tampered or truncated',
        }))
        continue
      }

      // Step 2: parse the patch payload
      const patch = parsePatchPayload(req.payload)
      if (!patch) {
        await ctx.reply(mention, formatVerified({
          round: req.round,
          verdict: 'fail',
          by: NAME,
          sha: req.sha,
          reason: 'invalid patch payload — could not parse JSON',
        }))
        continue
      }

      // Step 3: run exploit replay verification
      const result = verifyPatchAgainstExploit(patch, req.arg)

      // Step 4: check static analysis if available
      let reason = result.reason
      if (patch.staticAnalysis) {
        const sa = patch.staticAnalysis
        reason += ` | static analysis: ${sa.clippyWarnings} warnings, ${sa.unsafeBlocks} unsafe blocks`
        if (!sa.passed) {
          await ctx.reply(mention, formatVerified({
            round: req.round,
            verdict: 'fail',
            by: NAME,
            sha: req.sha,
            reason: `static analysis failed: ${reason}`,
          }))
          continue
        }
      }

      const verdict = result.blocked ? 'pass' : 'fail'
      console.error(`[${NAME}] round ${req.round}: ${verdict} — ${reason}`)

      await ctx.reply(mention, formatVerified({
        round: req.round,
        verdict,
        by: NAME,
        sha: req.sha,
        reason,
      }))

    } catch (e) {
      console.error(`[${NAME}] loop error: ${e}`)
    }
  }
})
