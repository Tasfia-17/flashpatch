/**
 * Patch Generator Agent
 *
 * Listens for WANT messages with service=emergency_patch, selects the appropriate
 * patch from the registry based on its configured PATCH_STRATEGY, bids into the
 * market, and delivers the patch artifact after escrow is funded.
 *
 * The three personas (fast / deep / hybrid) share this single implementation.
 * Strategy, floor price, and confidence come from coral-agent.toml options,
 * injected as environment variables by coral-server.
 *
 * Delivery payload format (JSON, sha256-bound by the base protocol):
 *   {
 *     "patchId": string,
 *     "strategy": "fast" | "deep" | "hybrid",
 *     "confidence": number,
 *     "patchedInstruction": string,
 *     "staticAnalysis": { passed, warnings } | null,
 *     "programId": string
 *   }
 */

import { createHash } from 'node:crypto'
import { PublicKey } from '@solana/web3.js'
import {
  startCoralAgent,
  parseWant,
  formatBid,
  parseAward,
  formatEscrowRequired,
  parseDeposited,
  verb,
} from '@pay/agent-runtime'
import { isFunded, makeProgram } from '../../txodds/agent/escrow.js'
import { makeArbiterReadOnly, isArbiterFunded, arbitratedEscrowPda } from './arbiter-check.js'
import { getPatch, type PatchStrategy } from '../../flashpatch/src/patch-registry.js'

const NAME              = process.env.AGENT_NAME ?? 'patch-generator'
const SELLER_WALLET     = process.env.SELLER_WALLET ?? ''
const RPC               = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
const STRATEGY          = (process.env.PATCH_STRATEGY ?? 'fast') as PatchStrategy
const FLOOR_SOL         = Number(process.env.FLOOR_SOL ?? '0.005')
const ESCROW_DEADLINE   = Number(process.env.ESCROW_DEADLINE_SECS ?? '600')
const trace             = process.env.TRACE === '1'

interface PendingQuote {
  service: string
  arg: string
  priceSol: number
}

const quoted  = new Map<number, PendingQuote>()
const awarded = new Map<string, PendingQuote & { round: number }>()

function deriveReference(round: number, service: string, arg: string, price: number): string {
  const preimage = `flashpatch:${round}:${service}:${arg}:${SELLER_WALLET}:${price}`
  return new PublicKey(createHash('sha256').update(preimage).digest()).toBase58()
}

await startCoralAgent({ agentName: NAME }, async (ctx) => {
  console.error(`[${NAME}] ready: strategy=${STRATEGY} floor=${FLOOR_SOL} wallet=${SELLER_WALLET}`)

  let escrowProgram: Awaited<ReturnType<typeof makeProgram>> | null = null
  const getEscrow = async () => (escrowProgram ??= await makeProgram(RPC))

  while (true) {
    try {
      const mention = await ctx.waitForMention()
      if (!mention) continue

      const text = mention.text.trim()
      if (trace) console.error(`[${NAME}] <- ${text.slice(0, 140)}`)

      // Respond to WANT (service=emergency_patch)
      const want = parseWant(text)
      if (want) {
        if (want.service !== 'emergency_patch') continue

        const patch    = getPatch(STRATEGY)
        const price    = Math.max(FLOOR_SOL, want.budgetSol * 0.3) // bid at 30% of budget
        quoted.set(want.round, { service: want.service, arg: want.arg, priceSol: price })

        await ctx.reply(mention, formatBid({
          round: want.round,
          priceSol: price,
          by: NAME,
          note: `${STRATEGY}-strategy confidence=${patch.confidence} est=${patch.estimatedSecs}s`,
        }))
        continue
      }

      // Respond to AWARD
      const award = parseAward(text)
      if (award) {
        if (award.to !== NAME) continue
        const quote = quoted.get(award.round)
        if (!quote) continue

        const reference = deriveReference(award.round, quote.service, quote.arg, quote.priceSol)
        awarded.set(reference, { round: award.round, ...quote })
        quoted.delete(award.round)

        await ctx.reply(mention, formatEscrowRequired({
          round: award.round,
          reference,
          seller: SELLER_WALLET,
          amountSol: quote.priceSol,
          deadlineSecs: ESCROW_DEADLINE,
          settlement: 'arbiter',
        }))
        continue
      }

      // Respond to DEPOSITED — verify escrow funded, then deliver patch
      const deposited = parseDeposited(text)
      if (deposited) {
        const order = awarded.get(deposited.reference)
        if (!order) continue

        // Verify the escrow is actually funded before doing any work
        const escrowBuyer = deposited.vault ?? deposited.buyer
        let funded = false
        try {
          funded = await isFunded(
            await getEscrow(),
            new PublicKey(escrowBuyer),
            new PublicKey(SELLER_WALLET),
            new PublicKey(deposited.reference),
            order.priceSol,
          )
        } catch (e) {
          await ctx.reply(mention, `ERROR escrow check failed: ${(e as Error).message}`)
          continue
        }

        if (!funded) {
          await ctx.reply(mention, `ERROR escrow not funded for reference=${deposited.reference}`)
          continue
        }

        awarded.delete(deposited.reference)

        // Simulate the patch generation time (real static analysis would run here)
        const patch = getPatch(STRATEGY)
        if (patch.estimatedSecs > 5) {
          if (trace) console.error(`[${NAME}] running ${STRATEGY} analysis (${patch.estimatedSecs}s)`)
          await new Promise<void>(r => setTimeout(r, patch.estimatedSecs * 1000))
        }

        const payload = JSON.stringify({
          patchId: patch.id,
          strategy: STRATEGY,
          confidence: patch.confidence,
          patchedInstruction: patch.patchedInstruction,
          staticAnalysis: patch.staticAnalysis ?? null,
          programId: deposited.buyer, // buyer = the program's upgrade authority
          vulnerabilityClass: patch.vulnerabilityClass,
          description: patch.description,
        })

        console.error(`[${NAME}] round ${deposited.round}: delivering patch ${patch.id}`)
        await ctx.reply(mention, `DELIVERED round=${deposited.round} ${payload}`)
        continue
      }

      if (verb(text) === 'ARBITER_RELEASED' || verb(text) === 'RELEASED') {
        if (trace) console.error(`[${NAME}] payment received: ${text}`)
      }

    } catch (e) {
      console.error(`[${NAME}] loop error: ${e}`)
    }
  }
})
